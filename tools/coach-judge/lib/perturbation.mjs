// perturbation.mjs — atleetin todellinen käyttäytyminen, jota engine-pilot ei simuloi
//
// Engine-pilot ajaa täydellisen atleetin: jokainen suunniteltu päivä tehdään, jokainen
// liike on ohjelman liike, jokainen kuorma on enginen ehdottama. Siksi se on
// rakenteellisesti sokea koko sille vikaluokalle joka syntyy kun atletti poikkeaa
// suunnitelmasta — ja Akselin kenttähavainnoista 4/9 syntyi juuri siitä.
//
// Häiriöt ovat DETERMINISTISIÄ (seeded RNG) → ajo on toistettava ja bittitarkasti
// vertailtavissa.
//
// HÄIRIÖLUOKAT:
//   SWAP         — atletti vaihtaa liikkeen (🔄-nappi)
//   SKIP_DAY     — päivä jää väliin
//   BREAK        — usean viikon tauko (loma, sairaus, kiire)
//   MANUAL_LOAD  — atletti napauttaa lukua ja muokkaa kuormaa
//   PARTIAL_SETS — atletti tekee vähemmän sarjoja kuin määrätty
//
// SWAP-FIDELITEETTI (rehellinen rajaus):
//   Harness-swap tapahtuu ENNEN recommend():a (ohjelmaslotin tasolla). Tuotannon
//   UI-swap tapahtuu SEN JÄLKEEN (live-treenissä). Molemmat tuottavat saman
//   epäkoherenssin — toistotavoite/Vx jää isäntäslotista, kuorma tulee vaihdetun
//   liikkeen omasta historiasta — koska repScheme on SLOTTI-avaimellinen, ei
//   liike-avaimellinen. Live-swapin täydellinen peili vaatii selainkerroksen.

import { mulberry32 } from "../../engine-pilot/lib/seeded-rng.mjs";

// Uskottavat vaihtoparit per kategoria — se mitä atletti oikeasti tekee salilla
// (laite varattu, olkapää arka, halu vaihtelulle). Nimet PRESET_MOVEMENTS-katalogista.
const SWAP_POOL = {
  "horisontaalityöntö": ["Penkkipunnerrus", "Vinopenkkipunnerrus", "Close-grip bench", "Käsipainopenkki", "Lisäpainodippi"],
  "vertikaaliveto": ["Lisäpainoleuanveto", "Leuanveto chest-to-bar", "Räjähtävä leuka", "Vastaote-leuanveto"],
  "horisontaaliveto": ["Penkkiveto", "Kulmasoutu", "Yhden käden soutu"],
  "vertikaalityöntö": ["Pystypunnerrus", "Käsipainopystypunnerrus"],
  "alaraaja": ["Takakyykky", "Etukyykky", "Jalkaprässi", "Bulgarian split squat"],
  "hauisfleksio": ["Hauiskääntö", "Vasarakääntö"],
  "ojentajaekstensio": ["Tricep pushdown", "Ranskalainen punnerrus"],
  "core": ["Hanging leg raise", "Plank"],
};

const DEFAULTS = {
  swapProb: 0.12,        // ~1 liikevaihto / 8 slottia
  skipDayProb: 0.08,     // ~1 väliin jäänyt päivä / 12
  manualLoadProb: 0.10,  // ~1 käsimuokkaus / 10 slottia
  manualLoadRange: 0.08, // ±8 %
  partialSetsProb: 0.06,
  breaks: [],            // [{ afterWeek: 12, weeks: 3 }] — asetetaan skenaariossa
};

export function buildPerturbationPlan({ profile, scenario, config = {} }) {
  const cfg = { ...DEFAULTS, ...config };
  const seed = ((profile.seed ?? 12345) ^ 0x9e3779b9) >>> 0;
  const rng = mulberry32(seed);
  const plan = new Map();

  // Taukoikkunat → joukko (week) -numeroita jotka ohitetaan kokonaan
  const breakWeeks = new Set();
  for (const b of cfg.breaks) {
    for (let w = b.afterWeek + 1; w <= b.afterWeek + b.weeks; w++) breakWeeks.add(w);
  }

  for (const { weekNum, dayOfWeek } of scenario.days) {
    const key = `w${weekNum}d${dayOfWeek}`;
    const entry = { swaps: [], skip: false, reason: null, manualLoad: null, partialSets: null };

    if (breakWeeks.has(weekNum)) {
      entry.skip = true;
      entry.reason = "BREAK";
      plan.set(key, entry);
      continue;
    }
    if (rng() < cfg.skipDayProb) {
      entry.skip = true;
      entry.reason = "SKIP_DAY";
      plan.set(key, entry);
      continue;
    }
    // Swap/manual/partial arvotaan slot-indeksille 0..5 (ylimääräiset ohitetaan ajossa)
    for (let slotIndex = 0; slotIndex < 6; slotIndex++) {
      if (rng() < cfg.swapProb) entry.swaps.push({ slotIndex, pick: rng() });
      if (rng() < cfg.manualLoadProb) {
        entry.manualLoad = entry.manualLoad || [];
        entry.manualLoad.push({ slotIndex, factor: 1 + (rng() * 2 - 1) * cfg.manualLoadRange });
      }
      if (rng() < cfg.partialSetsProb) {
        entry.partialSets = entry.partialSets || [];
        entry.partialSets.push({ slotIndex, drop: 1 });
      }
    }
    plan.set(key, entry);
  }
  return plan;
}

// Valitse vaihtoliike samasta kategoriasta, ei sama kuin nykyinen.
export function resolveSwapTarget(category, currentName, pick) {
  const pool = (SWAP_POOL[category] || []).filter(n => n !== currentName);
  if (!pool.length) return null;
  return pool[Math.floor(pick * pool.length) % pool.length];
}

// Sovella swapit mesosyklin päiväsuunnitelmaan ENNEN recommend():a.
// Palauttaa listan tehdyistä vaihdoista raportointia varten. Mutatoi KOPIOTA.
export function applySwaps(dayPlan, entry) {
  if (!entry?.swaps?.length || !dayPlan?.slots) return [];
  const applied = [];
  for (const { slotIndex, pick } of entry.swaps) {
    const slot = dayPlan.slots[slotIndex];
    if (!slot) continue;
    const current = slot.movementName || slot.defaultMovementName;
    const target = resolveSwapTarget(slot.category, current, pick);
    if (!target) continue;
    applied.push({ slotIndex, slotRole: slot.role, from: current, to: target, category: slot.category });
    slot.movementName = target;
    slot.defaultMovementName = target;
    // HUOM: slot.reps ja slot.targetVx jätetään KOSKEMATTA — juuri tämä on O3:n
    // epäkoherenssin mekanismi. Älä "korjaa" tätä tässä.
  }
  return applied;
}

export function deepCloneDayPlan(dayPlan) {
  return dayPlan ? JSON.parse(JSON.stringify(dayPlan)) : null;
}
