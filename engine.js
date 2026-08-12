// engine.js — Computation engine: e1RM, baselines, readiness, recommend(), mesocycle, decisionTrace
// LeVe AI v4.34.36 — A: PLAN_BASED setRole-filteri (vain top-sarjat, ei accessoreja).
// B: Multi-week-aware cap (cap × ceil(daysSinceLast/7), max 3×). C: accessoryProgression
// Vx-overshoot bonus (V+1 → +increment, V+2 → +1.5×, V+3 → +2×) + sub-target hold (V1-V2)
// + V0 deload. Korjaa Phase 0:n MA/TO/LA-päivien optimoinnin: TO Dippi 58.5 → 60+ kg,
// accessoryt V5-target-V3 → +5 kg vaikka consecutive=1.

import {
  uid, todayISO, parseNumericInput,
  getAllSessions, getSetsForSession, getAllSets, getSetsForMovement,
  getActiveMesocycle, saveMesocycle, createDefaultMesocycle, createPeakingMesocycle,
  getSettings, saveBaseline, getBaseline,
  saveRecommendation, saveDecisionTrace,
  getAllMovements, getMovementProgress, saveMovementProgress,
  getMeasurementsByType,
  getAllMesocycles,
  PULL_VOLUME_CATEGORIES,
  VARIANT_DAY_TYPE_MAP,
  ACCESSORY_SLOT_CATALOG,
  maintenanceStatus,
} from "./data.js";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const DAY_TYPE_MULTIPLIERS = {
  heavy: 1.0,
  volume: 0.6,
  speed: 0.4,
  competition: 1.0,
  accessory: 0.0,
  rest: 0,
};

const DAY_TYPE_SET_RECIPES = {
  heavy: { sets: 5, repsRange: [2, 3], targetVxRange: [1, 2] },
  volume: { sets: [4, 5], repsRange: [4, 6], targetVxRange: [2, 3] },
  speed: { sets: [4, 5], repsRange: [2, 2], targetVxRange: [4, 5] },
};

const REST_RECOMMENDATIONS = {
  heavy: { minSec: 180, maxSec: 300, label: "3–5 min" },
  volume: { minSec: 120, maxSec: 180, label: "2–3 min" },
  speed: { minSec: 90, maxSec: 120, label: "1.5–2 min" },
  competition: { minSec: 300, maxSec: 600, label: "5–10 min" },
  accessory: { minSec: 90, maxSec: 150, label: "1.5–2.5 min" },
  accessoryCompound: { minSec: 120, maxSec: 180, label: "2–3 min" },
  accessoryIsolation: { minSec: 60, maxSec: 90, label: "1–1.5 min" },
};

// ═══════════════════════════════════════════════════════════════
// PROGRESSION_CONFIG (v4.35.0 — Eliittitason progressio-malli)
// ═══════════════════════════════════════════════════════════════
//
// Keskitetty konfiguraatio computeProgressionTarget-funktiolle. Jokainen luku
// on dokumentoitu lähteen kanssa. Kalibrointi tehdään tässä, ei inline.
//
// Lähteet (peer-reviewed + vakiintunut käytäntö):
//   • Helms et al. 2018 "RPE vs Percentage 1RM Loading"
//     Frontiers in Physiology 9:247
//   • Helms et al. 2016 "RIR-Based RPE Scale for Resistance Training"
//     Strength & Conditioning Journal 38(4):42-49
//   • Tuchscherer / Reactive Training Systems RPE-tables (julkinen)
//   • Cumming et al. 2024 "Muscle memory in humans" J Physiology
//   • Psilander et al. 2018 "Effects of training, detraining, retraining"
//     J Appl Physiol 126(6):1636-1645
//   • Bruusgaard et al. 2010 "Myonuclei acquired by overload exercise" PNAS
//   • Issurin 2010 "New Horizons for Methodology of Training Periodization"
//     Sports Medicine 40(3):189-206
//
const PROGRESSION_CONFIG = {
  // Helms 2018: 0.5 RPE-yksikön poikkeama target-arvosta = 2% kuorma-säätö
  // → 1.0 RPE = 4%. Vara-skaalalla: 1.0 Vx = 4% (RPE = 10 - Vx).
  // Käytetään lievennettynä session-välillä (puolitettuna), koska Helms 2018
  // -kaava on alunperin saman session sisäinen autoregulaatio.
  HELMS_VX_TO_LOAD_PCT_BETWEEN_SESSIONS: 0.02,

  // Helms 2018 + Renaissance Periodization: viikoittainen progressio PR-vaiheessa
  // edistyneelle voimanostajalle = +2.5%/viikko same target RPE.
  // Vahvistus: %1RM-ryhmä Helms 2018:ssa nostaa kuormaa +2.5% per viikko jos
  // edellinen vk onnistui.
  WEEKLY_BASELINE_PR_PHASE: 0.025,

  // Cumming 2024 / Psilander 2018 / Bruusgaard 2010 — muscle memory / regain.
  // Tutkimus: 12 vk training → 12 vk detraining → 8 vk retraining palautti tason.
  // Eli retraining = ~33% nopeampi kuin alkutraining (12/8 = 1.50).
  // Aggressiivinen regain (kun ratio < 0.85) saa multiplierin 2.0 (Psilander
  // 2018 yläraja: nopein retraining-vauhti aikaisempaan kuntoon palatessa).
  REGAIN_THRESHOLD_FAR: 0.85,
  REGAIN_THRESHOLD_NEAR: 0.95,
  REGAIN_MULTIPLIER_FAR: 2.0,
  REGAIN_MULTIPLIER_NEAR: 1.5,

  // V0-grindi-suoja (atletin profiili: V0-grindi-taipumus).
  // V0-fail viime sessiossa → konservatiivinen palautus −5% seuraavalle.
  // Lähde: atletin profiili + Tuchscherer "don't grind reps" -periaate.
  V0_GRINDI_PENALTY: -0.05,

  // Hard-cap fysiologisen progressio-rajan ylläpitämiseksi.
  // Issurin 2010 + Helms 2018 + Tuchscherer RTS: max +15%/viikko on äärimmäinen
  // (käytännössä vain regain-vaiheen alkupisteessä).
  HARD_CAP_PER_WEEK: 0.15,

  // Toleranssi pyöristys-eroille (kg).
  ROUNDING_TOLERANCE: 0.25,
};

/**
 * Pick the appropriate rest recommendation for an exercise based on its role,
 * category, target Vx and reps. Compound accessories with loaded targetVx need
 * more rest to avoid grinding; isolation work (curls, delt raises) stays short.
 *
 * v4.27.8 korjaukset:
 *  1) Heavy-single-detektio (reps ≤ 3 AND targetVx ≤ 2) → heavy rest 3-5 min
 *     riippumatta roolista tai dayType:stä. Fix: MU primary 3×1 V2 Saturday
 *     (dayType=volume → sai 2-3 min, pitäisi 3-5), top-single RPE 9+ secondary
 *     (sai 2-3, pitäisi 3-5), heavy secondary etukyykky 3×3 V2.
 *  2) Backoff V ≥ 3 → volume rest 2-3 min (ei heavy 3-5) — backoff on määritelmän
 *     mukaan kevyempi toisto-volyymin lisä, ei max-lift.
 *  3) "alaraaja" lisätty compoundCategories-settiin — etukyykky/takakyykky
 *     ilman alaryhmää saivat aiemmin generic accessory 1.5-2.5 min.
 *
 * @param {object} exercise - { role, category, targetVx, reps }
 * @param {string} dayType - "heavy" | "volume" | "speed" | "competition"
 * @returns {{ minSec: number, maxSec: number, label: string }}
 */
function pickRestForExercise(exercise, dayType) {
  if (!exercise) return REST_RECOMMENDATIONS.heavy;

  // Competition attempts always get long rest — katkaistaan ensimmäiseksi.
  if (exercise.role === "opener" || exercise.role === "attempt2" || exercise.role === "attempt3") {
    return REST_RECOMMENDATIONS.competition;
  }

  // Heavy singles / top sets: reps ≤ 3 AND Vx ≤ 2 → heavy rest riippumatta roolista.
  // Kattaa MU 3×1 V2 (Saturday volume), top single RPE 9+ secondary, heavy secondary
  // etukyykky 3×3 V2. Näille 2-3 min ei riitä palauttamaan CNS:ää.
  if (typeof exercise.reps === "number" && exercise.reps <= 3 &&
      typeof exercise.targetVx === "number" && exercise.targetVx <= 2) {
    return REST_RECOMMENDATIONS.heavy;
  }

  // Primary seuraa dayType:ä (heavy-heavy, volume-volume, speed-speed).
  if (exercise.role === "primary") {
    return REST_RECOMMENDATIONS[dayType] || REST_RECOMMENDATIONS.heavy;
  }

  // Backoff: V ≥ 3 = tavanomainen volume-backoff → volume rest (2-3 min).
  // V ≤ 2 backoff = raskas (harvinainen) → seuraa dayType:ä.
  if (exercise.role === "backoff") {
    if (typeof exercise.targetVx === "number" && exercise.targetVx >= 3) {
      return REST_RECOMMENDATIONS.volume;
    }
    return REST_RECOMMENDATIONS[dayType] || REST_RECOMMENDATIONS.heavy;
  }

  // Accessory / support / secondary: erottele compound vs isolation.
  const compoundCategories = new Set([
    "vertikaaliveto", "vertikaalityöntö",
    "horisontaaliveto", "horisontaalityöntö",
    "polvidominantti", "lonkkadominantti",
    "alaraaja",  // v4.27.8: etukyykky/takakyykky kun kategoriana yleinen alaraaja
  ]);
  const isCompoundCategory = compoundCategories.has(exercise.category);
  const hasLoadedTarget = exercise.targetVx !== null && exercise.targetVx !== undefined && exercise.targetVx <= 3;
  const isLowRep = typeof exercise.reps === "number" && exercise.reps <= 8;

  if (isCompoundCategory && (hasLoadedTarget || isLowRep)) {
    return REST_RECOMMENDATIONS.accessoryCompound;
  }
  if (!hasLoadedTarget && (typeof exercise.reps !== "number" || exercise.reps >= 10)) {
    return REST_RECOMMENDATIONS.accessoryIsolation;
  }
  return REST_RECOMMENDATIONS.accessory;
}

const READINESS_CLASSES = { GREEN: 0, YELLOW: 1, RED: 2 };

// ═══════════════════════════════════════════════════════════════
// MATH UTILITIES
// ═══════════════════════════════════════════════════════════════

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mad(arr) {
  const med = median(arr);
  return median(arr.map((x) => Math.abs(x - med)));
}

function madSigma(arr) {
  const rawMad = mad(arr);
  const sigma = 1.4826 * rawMad;
  return sigma === 0 ? 1e-6 : sigma;
}

function zScore(value, med, sigma) {
  return (value - med) / Math.max(1e-6, sigma);
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundToHalf(value) {
  return Math.round(value * 2) / 2;
}

// ═══════════════════════════════════════════════════════════════
// e1RM CALCULATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * System e1RM: uses bodyweight + external load + Epley with Vara
 * e1RM_system = systemLoadKg × (1 + (reps + Vx) / 30)
 */
function e1rmSystem(bodyweightKg, externalLoadKg, reps, vara) {
  const systemLoad = bodyweightKg + externalLoadKg;
  if (systemLoad <= 0 || reps < 1) return null;
  // Vx ??= 1: käyttäjällä grinding-taipumus, tyhjä raportointi tarkoittaa tyypillisesti V0-V1
  const effectiveReps = reps + (vara ?? 1);
  return systemLoad * (1 + effectiveReps / 30);
}

/**
 * External e1RM: e1RM_system - bodyweight
 */
function e1rmExternal(bodyweightKg, externalLoadKg, reps, vara) {
  const sys = e1rmSystem(bodyweightKg, externalLoadKg, reps, vara);
  if (sys === null) return null;
  return Math.max(0, sys - bodyweightKg);
}

/**
 * Accessory / external-load e1RM.
 * Ilman Vx:ää: simple Epley = weight × (1 + reps / 30)
 * Vx annettu: Epley-Vara = weight × (1 + (reps + Vx) / 30)
 */
function e1rmAccessory(weightKg, reps, vara = null) {
  if (weightKg <= 0 || reps < 1) return null;
  const effectiveReps = reps + (vara ?? 0);
  return weightKg * (1 + effectiveReps / 30);
}

/**
 * β Round B-α-1 — Lähde 1: V/reps → odotettu %1RM.
 *
 * L46 "A puhtaana" -päätös: Epley-Vara identtisesti e1rmSystem-funktion
 * Epley-Vara-osan kanssa. EI tier-parametria — sama kaava kaikilla tier-
 * tasoilla (Taso 1/2/3). Brzycki ja conservative-cross-check rajattu pois
 * eksplisiittisesti (L46). Sisäinen konsistenssi e1RM-toteutuksen kanssa.
 *
 * Käänteinen suunta e1rmSystem:istä: jos sys-1RM = weight × (1 + maxReps/30),
 * niin weight = sys-1RM / (1 + maxReps/30) = sys-1RM × expectedPct,
 * missä expectedPct = 1 / (1 + maxReps/30).
 *
 * @param {number} maxReps — reps + Vx (todellinen max-yritys täydellä failureen asti)
 * @returns {number|null} expectedPct ∈ (0, 1] tai null jos invalid input
 */
function vRepsToExpectedPct(maxReps) {
  if (!Number.isFinite(maxReps) || maxReps < 1) return null;
  return 1 / (1 + maxReps / 30);
}

// K3-1 (retro-kenttä OBS-B3/F): ACROSS-SET-VÄSYMYSMALLI — symmetrinen, keskiarvo-semantiikka.
// Litteä per-sarja-Vx oletti V1:n kestävän sarjasta toiseen; atletin cal-data todisti suoraan
// ettei kestä (73 kg: V1 → V1 → V0 → itsekorjattu pudotus 70:een ≈ 0,5 eff-toistoa/sarja).
// Malli (// HEURISTIC, kenttäkalibroitu):
//   • Väsymyskustannus 0,5 efektiivistä toistoa / sarja (cap +2,5).
//   • PRESKRIPTIO: target-Vx = sarjojen KESKIARVO → vara = 0,5 × (sets−1)/2 = 0,25 × (sets−1),
//     cap 1,25 (1. sarja hieman target-Vx:ää helpompi, viimeinen hieman tiukempi — rehellinen
//     multi-set-semantiikka; "viimeinen sarja target-Vx:ssä" olisi ylikonservatiivinen kun
//     estimointi käyttää saman session mediaania).
//   • ESTIMOINTI (e1RM tehdyistä sarjoista): sarjapositio-krediitti +0,5 × (positio−1), cap
//     +2,5 — väsyneenä tehty 5. sarja @V1 todistaa KORKEAMMAN tuoreen kapasiteetin kuin 1.
//     Symmetria pitää mallin steady-state-neutraalina (demonstroitu taso ≈ kestävä taso →
//     progressio virtaa) ja rasittunut sessio korjaa preskription alas (kestävyys-katto).
// Yksisarjaiset (top single, cal-setti positiossa 1, opener) → 0/0 (ennallaan).
const ACROSS_SET_FATIGUE_REPS_PER_SET = 0.5;
const ACROSS_SET_FATIGUE_CAP = 2.5;
// 8a (V1): opitun across-set-raten priori-clamp = ±2 SD (SD 0.125 → [0.25, 0.75]).
// Tämä on tutkimusraja (CLAUDE.md §2 sääntö 3): posterior saa terävöityä vain tähän
// haarukkaan; karkaava raaka-estimaatti → LEARNED_PARAM_OUTLIER + clamp.
const ACROSS_SET_FATIGUE_RATE_MIN = 0.25;
const ACROSS_SET_FATIGUE_RATE_MAX = 0.75;
// Bayes-shrinkage priori-vahvuus (pseudosessiot): ~5 kelpaavaa sessiota siirtää
// posteriorin puoliväliin priorista dataan. Jaettu CI-laskennan kanssa.
const LEARNED_PARAM_TAU = 5;
function clampAcrossSetRate(v) {
  return (typeof v === "number" && Number.isFinite(v))
    ? Math.max(ACROSS_SET_FATIGUE_RATE_MIN, Math.min(ACROSS_SET_FATIGUE_RATE_MAX, v))
    : ACROSS_SET_FATIGUE_REPS_PER_SET;
}
// 8a (V1): per-sarja-rate on OPITTAVA (learnedAcrossSetFatigue, prior 0.5, clamp
// [0.25,0.75]). Ko-opittavuus-invariantti: preskriptio (tämä), estimointi
// (withinSessionFatigueCredits) JA re-ankkurointi (resolveTopSingleReanchor) käyttävät
// SAMAA ratePerSet-arvoa — erilliset arvot rikkoisivat steady-state-neutraaliuden.
// Default = ACROSS_SET_FATIGUE_REPS_PER_SET → cold-start bittitarkasti nykyinen.
function acrossSetAllowance(sets, ratePerSet = ACROSS_SET_FATIGUE_REPS_PER_SET) {
  const n = Number(sets);
  if (!Number.isFinite(n) || n <= 1) return 0;
  return Math.min(ACROSS_SET_FATIGUE_CAP / 2, (n - 1) * (ratePerSet / 2));
}
// Estimointi-puolen positio-krediitti: sortedSets (perf-järjestyksessä) → credits[i] =
// ratePerSet × (positio samassa sessiossa − 1), cap 2,5. (8a: ratePerSet opittava, ks. yllä.)
function withinSessionFatigueCredits(sortedSets, ratePerSet = ACROSS_SET_FATIGUE_REPS_PER_SET) {
  const seen = {};
  return (sortedSets || []).map(s => {
    const k = s.sessionId || "?";
    seen[k] = (seen[k] || 0) + 1;
    return Math.min(ACROSS_SET_FATIGUE_CAP, (seen[k] - 1) * ratePerSet);
  });
}

// ── 8a (V1): across-set-väsymyksen OPPIMINEN (learnedAcrossSetFatigue) ───────────
// Puhtaat funktiot; kutsutaan treenin päätöksessä (index.html completion handler),
// EI recommend():issä (joka pysyy puhtaana lukuna). Tulos → settings.learnedParams.
const ACROSS_SET_LEARN_MIN_SETS = 3;   // väh. samakuormaista työsarjaa/sessio havaintoon
const ACROSS_SET_LEARN_MAX_OBS = 20;   // trailing-ikkuna kelpaavia sessioita (seuraa adaptaatiota)
const ACROSS_SET_FATIGUE_SPEC = {
  prior: ACROSS_SET_FATIGUE_REPS_PER_SET, // 0.5
  min: ACROSS_SET_FATIGUE_RATE_MIN,       // 0.25 (−2 SD)
  max: ACROSS_SET_FATIGUE_RATE_MAX,       // 0.75 (+2 SD)
  tau: LEARNED_PARAM_TAU,                 // 5 pseudosessiota
  maxObs: ACROSS_SET_LEARN_MAX_OBS,       // 20
};

// Yhden session+liike-ryhmän havaittu across-set-väsymys: mediaani peräkkäisistä
// (reps+Vx)-erotuksista SAMALLA kuormalla tehdyistä työsarjoista (sessiojärjestys).
// Palauttaa raten (eff-toistoa/sarja) tai null jos ryhmä ei kelpaa (<3 samakuormaista
// sarjaa). Mediaani = robusti n=3:lla + immuuni yhdelle saturoivalle V0-sarjalle.
function computeAcrossSetDecay(sets) {
  // H-019 A2 (completed-fantomikenttä, 3. esiintymä — v4.34.36 + H-006a-fix8 poistivat
  // saman muualta): persistoidut setit EIVÄT kanna completed-kenttää (0/424 kenttädatassa)
  // → ehto teki 8a-oppimisesta tuotannossa inertin. Tuotantoscheman laatuportti on jo
  // reps>0 + actualVx!=null + setRole==="top" (skipped-setit: reps null → suodattuvat).
  // completed !== false sallii kentättömät persistoidut JA hylkää eksplisiittisen falsen.
  const qual = (sets || []).filter(s =>
    s && s.setRole === "top" && s.completed !== false && !s.isWarmup
    && s.actualVx != null && Number.isFinite(s.externalLoadKg) && s.externalLoadKg > 0
    && Number.isFinite(s.reps) && s.reps > 0);
  if (qual.length < ACROSS_SET_LEARN_MIN_SETS) return null;
  // Ryhmittele kuorman mukaan; ota dominoiva ≥3-ryhmä (litteä samakuormainen työ).
  const byLoad = {};
  for (const s of qual) {
    const k = String(roundToHalf(s.externalLoadKg));
    (byLoad[k] = byLoad[k] || []).push(s);
  }
  let group = null;
  for (const k of Object.keys(byLoad)) {
    if (byLoad[k].length >= ACROSS_SET_LEARN_MIN_SETS
        && (!group || byLoad[k].length > group.length)) group = byLoad[k];
  }
  if (!group) return null;
  const ordered = group.slice().sort((a, b) =>
    ((a.timestamp || "") < (b.timestamp || "") ? -1 : 1));
  const effReps = ordered.map(s => s.reps + (s.actualVx ?? s.targetVx ?? 1));
  const diffs = [];
  for (let i = 1; i < effReps.length; i++) diffs.push(effReps[i - 1] - effReps[i]);
  return median(diffs);
}

// Geneerinen priori-ankkuroitu shrinkage-päivitys opittaville parametreille (8a-koneisto).
// spec = { prior, min, max, tau, maxObs }; observations = per-sessio-havainnot.
// raw = (τ·prior + n·x̄)/(τ+n) → value = clamp(raw, min, max). outlier = raw karkasi
// tutkimusrajasta (±2 SD) → clampataan (CLAUDE.md §2 sääntö 3: LEARNED_PARAM_OUTLIER).
function updateLearnedParam(spec, observations) {
  const obs = (observations || []).filter(x => typeof x === "number" && Number.isFinite(x));
  const recent = spec.maxObs ? obs.slice(-spec.maxObs) : obs;
  const n = recent.length;
  const mean = n > 0 ? recent.reduce((a, b) => a + b, 0) / n : spec.prior;
  const raw = (spec.tau * spec.prior + n * mean) / (spec.tau + n);
  const value = Math.max(spec.min, Math.min(spec.max, raw));
  const outlier = raw < spec.min || raw > spec.max;
  return { value, n, mean, raw, outlier };
}

// 8a (V1) orkestrointi (puhdas, idempotentti re-compute koko historiasta): ryhmittelee
// työsarjat (sessionId, movementId), sulkee pois deload-sessiot (getMesocycleWeek →
// weekDef.deltaPctBase ≤ −0.10, K6-2b-presedentti — deload ei kelpaa ankkuriksi), laskee
// per-ryhmä-havainnon, ottaa viimeiset ≤20 kronologisesti ja shrinkaa prioriin.
// Palauttaa { value, n, mean, raw, outlier } (kirjoitetaan settingsiin kutsujassa).
function computeLearnedAcrossSetFatigue({ sessions, allSets, mesocycle } = {}) {
  const sess = sessions || [];
  const sets = allSets || [];
  const deloadSessionIds = new Set();
  const sessDateById = {};
  for (const s of sess) {
    if (!s || !s.sessionId) continue;
    const d = s.dateISO || (s.timestamp || "").slice(0, 10);
    sessDateById[s.sessionId] = d;
    if (d && mesocycle) {
      const wk = getMesocycleWeek(mesocycle, d);
      const def = (wk != null) ? mesocycle?.weekDefs?.[wk - 1] : null;
      if (def && typeof def.deltaPctBase === "number" && def.deltaPctBase <= -0.10) {
        deloadSessionIds.add(s.sessionId);
      }
    }
  }
  const groups = {};
  for (const st of sets) {
    if (!st || st.setRole !== "top" || !st.sessionId || deloadSessionIds.has(st.sessionId)) continue;
    const key = st.sessionId + "|" + (st.movementId ?? "?");
    (groups[key] = groups[key] || []).push(st);
  }
  const obsWithDate = [];
  for (const key of Object.keys(groups)) {
    const rate = computeAcrossSetDecay(groups[key]);
    if (rate == null) continue;
    const sid = key.split("|")[0];
    obsWithDate.push({ date: sessDateById[sid] || "", rate });
  }
  obsWithDate.sort((a, b) => (a.date < b.date ? -1 : 1));
  return updateLearnedParam(ACROSS_SET_FATIGUE_SPEC, obsWithDate.map(o => o.rate));
}

// MULL-3 (#16): within-session-ENNAKOINTI. Ennustaa monisarjaisen prescriptionin
// viimeisen sarjan varannon opitusta across-set-decaysta ENNEN grindiä (reaktiivisesta
// ennakoivaan). Ydinoivallus: plan-kuorma on K3-1-kalibroitu targetVx:ään → koodaa
// implisiittisen e1RM:n, joten forecast lasketaan UI-side ilman erillistä e1RM-echoa
// (recommend() pysyy byte-identtisenä). actualLoad heijastaa atletin ylikirjoitusta.
// Advisory — EI muuta prescriptionia. ctx: { planLoad, actualLoad, reps, sets, targetVx,
// ratePerSet, bodyweightKg, isBarbell }. → { unsustainable, predictedLastVx,
// sustainableSets?, loadDelta? } tai null.
function forecastSetSustainability(ctx) {
  if (!ctx) return null;
  const sets = Number(ctx.sets), reps = Number(ctx.reps), targetVx = Number(ctx.targetVx);
  const planLoad = Number(ctx.planLoad), actualLoad = Number(ctx.actualLoad);
  if (!Number.isFinite(sets) || sets < 2) return null;
  if (!Number.isFinite(reps) || reps <= 0) return null;
  if (!Number.isFinite(targetVx)) return null;
  if (!(planLoad > 0) || !(actualLoad > 0)) return null;
  const rate = clampAcrossSetRate(ctx.ratePerSet);
  const bw = ctx.isBarbell ? 0 : (Number(ctx.bodyweightKg) || 0);
  const sysPlan = planLoad + bw, sysActual = actualLoad + bw;
  if (!(sysPlan > 0) || !(sysActual > 0)) return null;
  const allowance = acrossSetAllowance(sets, rate);
  const mPlan = reps + targetVx + allowance;                 // plan-implikoitu tuore max-yritys
  const e1rmImplied = sysPlan * (1 + mPlan / 30);
  const vx1 = 30 * (e1rmImplied / sysActual - 1) - reps;      // TUORE varanto ACTUAL-kuormalla
  const predictedLastVx = Math.round((vx1 - rate * (sets - 1)) * 10) / 10;
  if (predictedLastVx >= 0) return { unsustainable: false, predictedLastVx };
  // Kestämätön → korjausehdotukset (kestävä sarjamäärä TAI kevennys).
  const sustainableSets = Math.max(1, Math.floor(vx1 / rate) + 1);
  const vx1Needed = rate * (sets - 1);
  const sysLoadFix = e1rmImplied / (1 + (reps + vx1Needed) / 30);
  const loadDelta = roundToHalf(sysLoadFix - sysActual);     // negatiivinen
  return { unsustainable: true, predictedLastVx, sustainableSets, loadDelta };
}

// OBS-051 (2026-06-17): PLAN_BASED-e1RM:n loadPct-Vx-johdonmukaisuus-toleranssi.
// PLAN_BASED (plan_e1rm = load / loadPct) luottaa slotin loadPct:hen tosi-%1RM-ankkurina.
// Jos slotin loadPct ALITTAA Vx-implikoidun intensiteetin (vReps(reps+Vx)) yli tämän
// toleranssin (= volyymi-/back-off-label kuten 0.58 vs vReps(7)=0.81), load/loadPct
// inflatoi e1RM:n (esim. 140/0.58 = 241). Yksisuuntainen gate: vain alittava
// epäjohdonmukaisuus skippaa PLAN_BASED:in → Epley-Vara säilyy (Vx-johdonmukainen).
// Verifioitu Akselin datasta: gataa loadPct 0.55/0.58 (alitus 28–40 %), säilyttää
// 0.71/0.78 (alitus 7–8 % < 15 %). Deflatoiva loadPct > vReps saa edetä (konservatiivinen).
const PLAN_BASED_VX_TOL = 0.15;

// OBS-051: jaettu loadPct-Vx-johdonmukaisuus-tarkistus. Sovelletaan KAIKISSA kolmessa
// PLAN_BASED-sijainnissa (recommend() inline, computeMovementE1RMBest-kortti,
// computePerfectStreakCeilingBonus) ettei kortti/live/streak divergoi (F-3).
// true = loadPct on Vx-johdonmukainen (kelpaa tosi-%1RM-ankkuriksi PLAN_BASED:ille);
// false = volyymi-/back-off-label joka ALITTAA Vx-intensiteetin → load/loadPct inflatoisi.
// Yksisuuntainen: deflatoiva loadPct (> vReps) palauttaa true (saa edetä, konservatiivinen).
// null reps/Vx (esim. Wendler 5/3/1, Muscle-up skill-vaihe) → true (fail-open; set-tason
// perfect-execution-esiehto vaatii targetVx!==null jokaiselta lokisetiltä erikseen).
function isLoadPctVxConsistent(loadPct, slotReps, slotVx) {
  const vxImplied = (slotReps != null && slotVx != null)
    ? vRepsToExpectedPct(slotReps + slotVx) : null;
  return vxImplied === null || loadPct >= vxImplied * (1 - PLAN_BASED_VX_TOL);
}

// S10-juurikorjaus (2026-07-04): PLAN_BASED-inversio noudattaa loadPct=system-%-kontraktia
// (1c978a9: BW-ankkuroiduilla kuorma resolvoidaan pct × (BW + extE1RM) − BW → inversion on
// oltava saman kontraktin peilikuva: e1RM_sys = (medLoad + BW) / loadPct, ext = sys − BW).
// Vanha muoto medLoad/loadPct invertoi external-%:na → sekasemantiikka jossa +3,5 %:n
// plan-pct-askel TUOTTI −18 %:n plan-kuorman (round-trip rikki) — latentti 1c978a9:stä,
// manifestoitui K3-1-kestävyyskatossa. Barbell-haara identtinen vanhaan (ext == sys).
// JAETTU HELPER 4 inversiolokukselle (recommend-ydin, kortti-Best, inflation-streak,
// cfg-drift) — estää lokus-driftin toistumisen (isLoadPctVxConsistent-presedentti).
function planBasedInvertE1RM(medLoad, loadPct, isBarbell, bodyweightKg) {
  if (!(medLoad > 0) || !(loadPct > 0)) return null;
  const bw = bodyweightKg > 0 ? bodyweightKg : 0;
  const system = (isBarbell ? medLoad : medLoad + bw) / loadPct;
  return { system, external: isBarbell ? system : system - bw };
}

// OBS-052 v2: tuoreusikkuna cal-ajurille. ~1,5 mesosykliä — kattaa kanonisen cal-välin
// (vk4→vk8 = 28 pv) + puskuri jos seuraava cal viivästyy/skipataan. Yli tämän cal vanhenee
// AJURINA (currentE1RM ei enää saa cal-arvoa), mutta DEFLATION-lattia (cal-min/cfg-PR ×0,95)
// pitää kuorman silti ~−5 %:ssa. Ainoa säädettävä tuoreusparametri.
const CAL_FRESHNESS_DAYS = 42;

// OBS-052 v2 (2026-06-23, TUOREUSIKKUNA): cal AJAA e1RM:ää niin kauan kuin tuorein cal-sarja on
// ≤ CAL_FRESHNESS_DAYS päivää tuoreimmasta lokisetistä — RIIPPUMATTA siitä onko viimeisin sessio
// sattumalta cal-sessio. Toteuttaa lukitun periaatteen "luotettavin signaali ohjaa AINA" myös
// kuukausikadenssin TYÖ-ONLY-viikoilla (kanoninen ohjelma kalibroi vain vk4/8/12 = ~kerran kuussa).
// Korvaa v1:n "viimeisin sessio ajaa" -logiikan, joka oli INERTTI vk2-4: työ-only-sessio →
// helper palautti [] → cal jäi vain lattiaksi ×0,95 (= ei ajuri vaan raja). Premissi vahvistettu
// kadenssi-workflow'lla (data.js cal-slotit vain vk4/8/12) + node-probella.
// Lukee TÄYDEN historian (EI slice(-6)) jotta kuukauden vanha cal näkyy ajurina. Liike-agnostinen.
// Jaettu recommend() + recommendPeaking() + computeMovementE1RMBest (kortti) → F-3-koherenssi.
// ORDER-IMMUUNI: max-timestamp (EI taulukon häntää) → kortti-kutsujat (index.html state.allSets,
// lajittelematon IndexedDB getAll) saavat deterministisen tuloksen (H018-T2 insertion-order-robusti).
// Tuoreusreferenssi = tuorein LOKISET (datalähtöinen, EI Date.now() → deterministinen/testattava).
function freshCalibSets(sets) {
  if (!sets || sets.length === 0) return [];
  const cals = sets.filter(s => s.setRole === "calibration" && s.timestamp);
  if (cals.length === 0) return [];
  // Referenssi "nyt" = tuorein lokiset (mikä tahansa rooli) → kuinka monta TREENIPÄIVÄÄ cal:sta.
  let latest = -Infinity;
  for (const s of sets) {
    if (!s.timestamp) continue;
    const t = new Date(s.timestamp).getTime();
    if (t > latest) latest = t;
  }
  // Tuorein cal-sessio: max cal-timestamp → sen sessionId-ryhmä.
  let calTime = -Infinity, calSessionId = null;
  for (const c of cals) {
    const t = new Date(c.timestamp).getTime();
    if (t > calTime) { calTime = t; calSessionId = c.sessionId; }
  }
  // Tuoreusportti: yli ikkunan vanha cal ei enää AJA (DEFLATION-lattia hoitaa −5 %).
  if (latest - calTime > CAL_FRESHNESS_DAYS * 86400000) return [];
  if (calSessionId != null) return cals.filter(c => c.sessionId === calSessionId);
  // Ei sessionId:tä (vanha data) → ryhmitä tuoreimman cal-setin PÄIVÄÄN (sama-timestamp olisi liian tiukka).
  const calDay = (cals.find(c => new Date(c.timestamp).getTime() === calTime)?.timestamp || "").slice(0, 10);
  return cals.filter(c => (c.timestamp || "").slice(0, 10) === calDay);
}

/**
 * H-017 D1 — intra-session-autoregulaatio v1 (VAIN alaspäin).
 *
 * Kun atletti tekee pääsarjat suunniteltua kevyemmällä kuormalla (heikko päivä,
 * itse kevennetty), saman liikkeen jäljellä olevat back-off/volyymi-slotit
 * re-resolvoidaan TOTEUMASTA enginen omalla aritmetiikalla. PUHDAS funktio:
 * ei DOM/state-kosketusta, ei sivuvaikutuksia → UI-handler kutsuu, soveltaa ja tracaa.
 *
 * Invariantit (H-017):
 *   A3  finalLoadKg = min(plannedLoadKg, toteumajohdettu) — EI KOSKAAN nosteta.
 *   A4  ärsykelattia = floorPct × KANONINEN sessionEffectiveE1RM (EI toteumasta) → clamp + lippu.
 *   A5  vain alaspäin: adjusted = finalLoadKg < plannedLoadKg.
 *   Gate 2  toteuma = mediaani valmiiden pääsarjojen kuormista (+ med reps/Vx → e1RM).
 *   Gate 3  laukaisukynnys KUORMA-AVARUUDESSA: (plannedPrimaryMedian − actualMedian)
 *           ≥ max(plannedPrimaryMedian×triggerPct, plateStepKg). EI e1RM-avaruudessa —
 *           lukittu e1RM on rakenteellisesti korkeampi → laukeaisi joka sessiossa.
 *   Gate 4  puhdas re-resolve (ei tasaista %-kerrointa) → ei tuplakevennystä near-failuren kanssa.
 *
 * e1RM-aritmetiikka identtinen recommend()-polun kanssa (engine.js:4153-4156, 5115-5117):
 *   barbell:     e1RM = load × (1 + (reps+Vx)/30)             [e1rmAccessory]
 *   non-barbell: e1RM = (BW + load) × (1 + (reps+Vx)/30)      [e1rmSystem]
 *   derived(ext) = barbell ? e1RM×pct : e1RM×pct − BW         [Branch A]
 *   floor(ext)   = barbell ? sysE1RM×floorPct : sysE1RM×floorPct − BW
 *
 * @param {object} p
 * @param {number}   p.plannedLoadKg          — kohde-slotin suunniteltu (snapshot) ulkokuorma
 * @param {number}   p.plannedPrimaryMedianKg — primaryn suunniteltujen pääsarjojen mediaani (gate 3 -ref)
 * @param {number[]} p.actualLoads            — valmiiden pääsarjojen toteutuneet ulkokuormat
 * @param {number[]} p.actualReps             — vastaavat toteutuneet toistot
 * @param {number[]} p.actualVx               — vastaavat Vx-arvot (handler resolvoi actualVx??targetVx??1)
 * @param {boolean}  p.slotIsBarbell          — kohde-slot barbell? (pct johdetaan plannedLoadKg:sta)
 * @param {boolean}  p.primaryIsBarbell       — primary barbell? (e1RM-johdon BW-haara)
 * @param {number}   p.canonicalE1RMSystem    — lukittu sessionEffectiveE1RM (A4-lattian ankkuri)
 * @param {number}   p.bodyweightKg
 * @param {number}  [p.triggerPct=0.02]
 * @param {number}  [p.plateStepKg=2.5]
 * @param {number}  [p.floorPct=0.75]
 * @returns {{adjusted:boolean, finalLoadKg?:number, derivedTarget?:number, floorClamped?:boolean,
 *            minBranch?:string, medianLoad?:number, e1rmActual?:number, floor?:number,
 *            thresholdKg?:number, reason?:string}}
 */
function resolveIntraSessionAdjustedLoad(p) {
  const {
    plannedLoadKg, plannedPrimaryMedianKg,
    actualLoads = [], actualReps = [], actualVx = [],
    slotIsBarbell, primaryIsBarbell,
    canonicalE1RMSystem, bodyweightKg,
    triggerPct = 0.02, plateStepKg = 2.5, floorPct = 0.75,
  } = p || {};

  const loads = actualLoads.filter((x) => Number.isFinite(x) && x > 0);
  if (!loads.length) return { adjusted: false, reason: "no-completed-work-sets" };
  if (!(plannedLoadKg > 0)) return { adjusted: false, reason: "no-planned-load" };
  if (!(canonicalE1RMSystem > 0)) return { adjusted: false, reason: "no-canonical-e1rm" };

  const medianLoad = median(loads);
  // Suodata reps/Vx samalla äärellisyysehdolla kuin kuormat (NaN/null ei vääristä mediaania).
  const repsArr = actualReps.filter(Number.isFinite);
  const vxArr = actualVx.filter(Number.isFinite);
  const medReps = repsArr.length ? median(repsArr) : 3;
  const medVx = vxArr.length ? median(vxArr) : 1;

  // Gate 3 — laukaisukynnys KUORMA-avaruudessa (primaryn suunniteltu vs toteutunut).
  const planRef = (typeof plannedPrimaryMedianKg === "number" && plannedPrimaryMedianKg > 0)
    ? plannedPrimaryMedianKg : plannedLoadKg;
  const thresholdKg = Math.max(planRef * triggerPct, plateStepKg);
  if ((planRef - medianLoad) < thresholdKg) {
    return { adjusted: false, reason: "below-trigger-threshold", medianLoad, thresholdKg };
  }

  // Toteumajohdettu e1RM — sama aritmetiikka kuin recommend() (barbell vs system).
  const e1rmActual = primaryIsBarbell
    ? medianLoad * (1 + (medReps + medVx) / 30)
    : (bodyweightKg + medianLoad) * (1 + (medReps + medVx) / 30);

  // Branch A — kohde-slotin kuorma toteuma-e1RM:stä. Pct johdetaan SUUNNITELLUSTA
  // back-off-kuormasta (enginePct = planned[+BW] / canonical), EI vRepsToExpectedPct:stä
  // suoraan → tämä peilaa täsmälleen enginen oman Branch A -resoluution suhteen riippumatta
  // siitä käyttikö engine vReps-pct:tä (tier 1/2/3) vai raakaa slot.loadPct:tä (special/tierless).
  // Pariteetti kaikilla tier-tasoilla; tier 1/2/3:lla identtinen vReps-tulokseen.
  const planExt = slotIsBarbell ? plannedLoadKg : plannedLoadKg + bodyweightKg;
  const enginePct = planExt / canonicalE1RMSystem;
  let derived = roundToHalf(Math.max(0, slotIsBarbell ? e1rmActual * enginePct : e1rmActual * enginePct - bodyweightKg));

  // A4 — ärsykelattia KANONISESTA e1RM:stä (ei toteumasta → ei liu'u toteuman mukana).
  const floor = roundToHalf(Math.max(0, slotIsBarbell
    ? canonicalE1RMSystem * floorPct
    : canonicalE1RMSystem * floorPct - bodyweightKg));
  let floorClamped = false;
  if (derived < floor) { derived = floor; floorClamped = true; }

  // A3 — min(suunniteltu, johdettu): rakenteellinen tae ettei nosteta.
  const finalLoadKg = Math.min(plannedLoadKg, derived);
  const minBranch = finalLoadKg === derived ? "derived" : "planned";
  const adjusted = finalLoadKg < plannedLoadKg; // A5: vain alaspäin

  return {
    adjusted, finalLoadKg, derivedTarget: derived, floorClamped, minBranch,
    medianLoad, e1rmActual, floor, thresholdKg,
  };
}

/**
 * K3-2 (retro-kenttä OBS-F) — ykkösen tulos re-ankkuroi työsarjat (VAIN alaspäin).
 *
 * Heavy-firstin koko pointti: top-single on tuorein maksimaalinen evidenssi päivän
 * kapasiteetista. Kenttäcase: 172,5×1 V1 (e1RM ~184) + työsarjat 167,5×3 V1
 * (implikoi e1RM ~190) eivät kohtaa varojensa osalta — työsarjat ohjelmoitu
 * kapasiteetin yli. Valmentaja pudottaa työsarjat singlen osoittamaan tasoon.
 *
 * e1RM_single = Epley+Vara yhdestä toistosta: (BW+load) × (1 + (1+Vx)/30) [system]
 * tai load × (1 + (1+Vx)/30) [barbell]. Johdettu työsarjakuorma = e1RM_single ×
 * vReps(reps + Vx + across-set-allowance) — sama aritmetiikka kuin recommend()-
 * primary-reitti (K3-1). PUHDAS funktio: UI-handler kutsuu, soveltaa min():llä ja tracaa.
 *
 * Vain alaspäin: helppo single (derived ≥ planned) → adjusted:false, ei nostoa
 * (capacity bump -mekanismi hoitaa noston erikseen atletin confirm-valinnalla).
 *
 * @param {object} p
 * @param {number}  p.singleLoadKg    — toteutuneen ykkösen ulkokuorma
 * @param {number}  p.singleActualVx  — ykkösen actualVx
 * @param {boolean} p.isBarbell       — liikkeen kuormamalli (sama liike → sama lippu)
 * @param {number}  p.bodyweightKg
 * @param {number}  p.plannedLoadKg   — kohde-työsarjan nykyinen/suunniteltu kuorma
 * @param {number}  p.targetReps      — kohde-sarjan toistot
 * @param {number}  p.targetVx        — kohde-sarjan tavoite-Vx
 * @param {number}  p.workSetsCount   — kohde-liikkeen työsarjojen määrä (allowance)
 * @returns {{adjusted:boolean, finalLoadKg?:number, e1rmSingle?:number,
 *            derivedTarget?:number, pct?:number, reason?:string}}
 */
function resolveTopSingleReanchor(p) {
  const { singleLoadKg, singleActualVx, isBarbell, bodyweightKg,
          plannedLoadKg, targetReps, targetVx, workSetsCount, ratePerSet } = p || {};
  if (!(singleLoadKg > 0) || !Number.isFinite(singleActualVx)) {
    return { adjusted: false, reason: "no-single" };
  }
  if (!(plannedLoadKg > 0)) return { adjusted: false, reason: "no-planned-load" };
  const bw = bodyweightKg > 0 ? bodyweightKg : 0;
  const e1rmSingle = (isBarbell ? singleLoadKg : bw + singleLoadKg) * (1 + (1 + singleActualVx) / 30);
  // 8a ko-opittavuus: re-ankkurointi käyttää samaa opittua ratePerSet-arvoa kuin
  // preskriptio/estimointi (kutsuja välittää p.ratePerSet; puuttuu → prior 0.5).
  const pct = vRepsToExpectedPct((targetReps ?? 3) + (targetVx ?? 1) + acrossSetAllowance(workSetsCount, clampAcrossSetRate(ratePerSet)));
  const derivedRaw = isBarbell ? e1rmSingle * pct : e1rmSingle * pct - bw;
  if (!(derivedRaw > 0)) return { adjusted: false, reason: "derived-nonpositive", e1rmSingle };
  const derivedTarget = roundToHalf(derivedRaw);
  const finalLoadKg = Math.min(plannedLoadKg, derivedTarget);
  if (!(finalLoadKg < plannedLoadKg)) {
    return { adjusted: false, reason: "derived-not-lower", e1rmSingle, derivedTarget, pct };
  }
  return { adjusted: true, finalLoadKg, e1rmSingle, derivedTarget, pct };
}

/**
 * β Round B-α-1 — Tier-resolveri.
 *
 * L48 B.i + C.iii — 3 polkua movement.tier-kentän tulkintaan:
 *   - number (1/2/3): vakio useimmille liikkeille
 *   - function: mesocycle-konteksti (esim. Muscle-up Taso 1 streetlifting_16w:ssä,
 *     Taso 3 muualla)
 *   - string "special": in-session-kuormaratkaisu (Heavy negative leuka,
 *     Board dippi) — säilyy nykyisellä loadPct-kaavalla
 *
 * @param {object} movement — PRESET_MOVEMENTS-record (vaadittu name + tier)
 * @param {object|null} mesocycle — aktiivinen mesosykli (vain function-tier:lle)
 * @returns {number|string} resolved tier (1/2/3 tai "special")
 */
function resolveTier(movement, mesocycle) {
  if (!movement) throw new Error("resolveTier: movement is required");
  const tier = movement.tier;
  if (typeof tier === "number") return tier;
  if (typeof tier === "function") return tier(mesocycle);
  if (typeof tier === "string" && tier === "special") return "special";
  throw new Error(
    `resolveTier: invalid tier for movement ${movement.name || "?"}: ${tier}`
  );
}

/**
 * β Round B-α-1 — Tier-pikkupredikaatti Lähde 2:n primer-routingille.
 * Käytetään myöhemmin α-2:n primer-mekaniikan aktivaation valitsemiseen.
 *
 * @param {object} movement
 * @param {object|null} mesocycle
 * @returns {boolean} true jos tier on 1 tai 2 (= primer aktiivinen Lähde 2:lle)
 */
function tier1Or2(movement, mesocycle) {
  const t = resolveTier(movement, mesocycle);
  return t === 1 || t === 2;
}

/**
 * v4.34.34: Movement-load-style resolver — keskitetty totuudenlähde "lisätäänkö
 * BW e1RM-laskuun?" -kysymykseen. Aiemmin koodi käytti kolmea eri proxyä
 * (mov.isPrimary, slot.role === "primary", primarySlotMeta.isBarbell), mikä
 * johti UI-tason e1RM-virheisiin (Takakyykky 293.8 kg = system, dippi
 * aliarvioitu = ext). Nyt kaikki UI- ja engine-laskut käyttävät tätä funktiota.
 *
 * - "system" → BW + ulkoinen kuorma (Lisäpainoleuanveto, Lisäpainodippi, MU)
 * - "external" → vain ulkoinen kuorma, ei BW (Takakyykky ja muut tankoliikkeet)
 * - undefined → accessory-style (käsipainot ym., ei BW)
 *
 * v4.34.35: nimi-pohjainen fallback käyttäjille joiden movement-rekisteri on
 * tallennettu ennen loadType-kentän käyttöönottoa (data export 2026-05-05 ei
 * sisältänyt loadType-kenttää → Lisäpainodippi & MU-variantit aliarvioituivat).
 */
const SYSTEM_LOAD_NAMES = new Set([
  // Vertikaaliveto: kaikki BW-pohjaiset leuanvedot ja MU
  "Lisäpainoleuanveto", "Vastaote-leuanveto", "Leuanveto (kehonpaino)",
  "Leuanveto chest-to-bar", "Paused pull-up", "Tempo pull-up",
  "Räjähtävä leuka", "Räjähtävä leuka (vyö)", "Räjähtävä leuanveto",
  "Muscle-up", "Muscle-up eksentrinen", "False grip pull-up",
  // Horisontaalityöntö: dippi + variantit
  "Lisäpainodippi", "BW dippi", "BW eksentrinen dippi", "Räjähtävä dippi",
  "Paused dip", "Tempo dip", "Ring dip",
]);
function isSystemLoadMovement(movement) {
  if (!movement) return false;
  if (movement.loadType === "system") return true;
  if (movement.loadType === "external") return false;
  // Legacy fallback 1: isPrimary=true tarkoitti aiemmin "Lisäpainoleuanveto"
  if (movement.isPrimary === true) return true;
  // Legacy fallback 2: nimi-pohjainen tunnistus käyttäjille joiden movement-rekisteri
  // ei sisällä loadType-kenttää (vanha schema).
  if (movement.name && SYSTEM_LOAD_NAMES.has(movement.name)) return true;
  return false;
}

/**
 * Calculate target load from e1RM backward:
 * targetSystemLoad = e1RM_system / (1 + effectiveReps / 30)
 * targetExternalLoad = targetSystemLoad - bodyweightKg
 */
function targetLoadFromE1RM(e1rmSys, bodyweightKg, targetReps, targetVx) {
  if (e1rmSys === null || e1rmSys <= 0) return null;
  const effectiveReps = targetReps + targetVx;
  const targetSystemLoad = e1rmSys / (1 + effectiveReps / 30);
  const external = targetSystemLoad - bodyweightKg;
  return roundToHalf(Math.max(0, external));
}

/**
 * v4.34.42 — Adaptive ceiling streak: tunnistaa "cal aliarvioitu" -tilanteen.
 *
 * Käyttäjäpalaute 2026-05-07: cfg.dippiExtKg=80 → ceiling 88, atletti suoritti
 * vk 2 TO 65.5 kg V3 perfect (PLAN_BASED 92.3 kg). Cap esti todellisen
 * kapasiteettinousun → vk 3 target jäi +0.5 kg vk 2:sta. Engine ei luottanut
 * toistuvaan PLAN_BASED-evidenssiin koska cap oli kiinteä cfg × 1.10.
 *
 * Korjaus: streak-pohjainen kerroin-nosto. Käy sessiot uusin → vanhin, laskee
 * peräkkäisten "perfect-execution + PLAN_BASED-e1RM > baseCeiling" -sessioiden
 * määrän. Bonus-portaikko (palautetaan kerroin-lisä baseen 1.10):
 *   1 streak → +0.00 (=1.10 base, ei muutosta)
 *   2 streak → +0.05 (=1.15)
 *   3+ streak → +0.10 (=1.20 max)
 *
 * Reset jos:
 *   - perfectionin rikkoutuminen (esim. V0 actualVx < targetVx, reps < target)
 *   - PLAN_BASED-e1RM <= baseCeiling (= sessio ei vahvistanut kasvua)
 *   - ei loadPct-tietoa kyseisestä sessio-päivästä
 *
 * Konservatismi V0-grindi-taipumukselle: 1 fail palauttaa kertoimen 1.10:een.
 *
 * @param {Array} topSets - kaikki primary-liikkeen setit (recentTopSets)
 * @param {Array} sessions - kaikki sessiot (date-lookupia varten)
 * @param {Object} mesocycle - aktiivinen mesosykli (loadPct-lookupia varten)
 * @param {boolean} isBarbell - load-tyyppi (false = system-load, +bw)
 * @param {number} bodyweightKg - oletus 91
 * @param {number} baseCeiling - cap-pohjataso (esim. cfg-PR × 1.10)
 * @returns {object} { streak, bonus, info }
 */
function computePerfectStreakCeilingBonus(topSets, sessions, mesocycle, isBarbell, bodyweightKg, baseCeiling) {
  if (!topSets || topSets.length === 0 || !mesocycle || !baseCeiling || baseCeiling <= 0) {
    return { streak: 0, bonus: 0, info: 'no-data' };
  }

  // Vain primary-work setit (sama suodatus kuin PLAN_BASED-blokissa, v4.34.36 BUG-FIX A)
  const primaryWork = topSets.filter(s => s.setRole === 'top');
  if (primaryWork.length === 0) return { streak: 0, bonus: 0, info: 'no-top-sets' };

  // Ryhmittele sessio-id:n mukaan, säilytä järjestys
  const sessGroups = new Map();
  const sessOrder = [];
  for (const s of primaryWork) {
    const sid = s.sessionId || `__nosess_${s.timestamp}`;
    if (!sessGroups.has(sid)) { sessGroups.set(sid, []); sessOrder.push(sid); }
    sessGroups.get(sid).push(s);
  }

  // Käy uusimmasta vanhimpaan, laske streak
  let streak = 0;
  for (let i = sessOrder.length - 1; i >= 0; i--) {
    const sets = sessGroups.get(sessOrder[i]);
    if (!sets || sets.length === 0) break;

    // Perfect execution: kaikki sarjat actualVx >= targetVx ja reps >= targetReps
    const perfect = sets.every(s =>
      s.actualVx !== null && s.actualVx !== undefined
      && s.targetVx !== null && s.targetVx !== undefined
      && s.actualVx >= s.targetVx
      && (s.reps ?? 0) >= (s.targetReps ?? 0)
    );
    if (!perfect) break;

    // Lookup loadPct kyseisestä mesosykli-viikosta+päivästä
    // (sama logiikka kuin PLAN_BASED_E1RM-blokki, v4.34.33 BUG-FIX 1.2)
    const sessId = sessOrder[i];
    const dateISO = sessions?.find(s => s.sessionId === sessId)?.dateISO
                  || sets[0]?.dateISO
                  || sets[0]?.timestamp?.slice(0, 10);
    if (!dateISO) break;

    const wk = getMesocycleWeek(mesocycle, dateISO);
    const dow = new Date(dateISO).getDay() || 7;
    const dayPlan = (wk !== null && wk !== undefined)
      ? mesocycle.weekPlans?.[wk - 1]?.days?.find(d => d.dayOfWeek === dow)
      : null;
    const primarySlot = dayPlan?.slots?.find(s => s.role === 'primary');
    const loadPct = primarySlot?.loadPct;
    if (!loadPct || loadPct <= 0 || loadPct > 1.0) break;
    // OBS-051: inkonsistentti loadPct (volyymi-label joka alittaa Vx-intensiteetin) ei
    // kelpaa kasvun todisteeksi → streak päättyy (ei väärää ceiling-bonusta).
    if (!isLoadPctVxConsistent(loadPct, primarySlot?.reps, primarySlot?.targetVx)) break;

    // PLAN_BASED-e1RM tämän session medianloadista
    // S10-korjaus: system-%-inversio (jaettu helper) — vertailu external-baseCeilingiin
    // external-muodossa (baseCeiling = ceiling_ext).
    const loads = sets.map(x => x.externalLoadKg).filter(v => v > 0);
    if (loads.length === 0) break;
    const medLoad = median(loads);
    const planBasedE1RM = planBasedInvertE1RM(medLoad, loadPct, isBarbell, bodyweightKg)?.external ?? 0;

    if (planBasedE1RM > baseCeiling) {
      streak++;
    } else {
      break; // sessio ei vahvistanut kasvua → streak ei kasva
    }
  }

  let bonus = 0;
  if (streak >= 3) bonus = 0.10;
  else if (streak >= 2) bonus = 0.05;
  return { streak, bonus, info: `streak=${streak}, bonus=+${(bonus*100).toFixed(0)}%` };
}

/**
 * v4.34.43 — CFG-DRIFT: engine oppii cfg-baseline-tason atletin todellisesta
 * suoriutumisesta.
 *
 * Käyttäjäpalaute 2026-05-07: "Toivoin että sovellus on niin mestarillinen
 * että se kykenee tunnistamaan potentiaalini." B+ streak (v4.34.42) reagoi
 * vk-tasolla mutta vain ceilingiin. CFG-DRIFT vaikuttaa **pohjaan** (cfg-
 * baseline) → koko ohjelma kalibroituu uudelleen kun engine tunnistaa
 * toistuvan ylityksen.
 *
 * KAKSI SIGNAALIA — velocity priorisoituu (atletti: "ohjelmointikone on
 * vara-arviointia parempi" — primer-velocity on objektiivinen, Vx subjektiivinen).
 *
 * SIGNAL B (priority): VELOCITY-PRIMER-TREND
 *   Vaatimus: vähintään 5 primer-velocity-mittausta historiassa.
 *   Logiikka: viim. 3 primer-velocity-mediaani vs baseline (10 viim.) -mediaani.
 *     - Jos viim. 3 mediaani > baseline × 1.05 (= +5 %): cfg += 1 % per
 *       peräkkäinen drift-sessio, max +5 % per blokki (4 vk).
 *   Velocity nopeutuminen samalla loadPct:llä = objektiivinen kapasiteettinousu.
 *
 * SIGNAL A (fallback): VX-OVERSHOOT
 *   Käytössä vain jos velocity-baseline n < 5.
 *   Logiikka: kuten B+ streak mutta vaikutus cfg-arvoon, ei ceilingiin.
 *     - 3+ peräkkäin perfect-execution + PLAN_BASED-e1RM > cfg × 1.10
 *     - cfg += 2.5 % per peräkkäinen, max +10 % per blokki
 *
 * RESET-EHDOT (molemmat signaalit):
 *   - Cal-päivä: drift-counter resetoi, cal-derived arvo lukitaan
 *   - V0-fail (työsarja): counter resetoi, cfg ei laske
 *   - RED readiness: counter resetoi
 *   - Blokki-vaihto (vk 4→5, 8→9, 12→13): counter resetoi
 *
 * Konservatismi V0-grindi-taipumukselle (atletin profiili): yksi V0 resetoi,
 * cfg vain nousee ei laske. PROGRESSION_FLOOR_CAP suojaa erikseen Epley-
 * aliarviolta, FAILURE_LOCKOUT V0-grindiltä.
 *
 * @param {Array} topSets - kaikki primary-liikkeen setit (top + readiness_test + cal)
 * @param {Array} sessions - kaikki sessiot (date-lookupia varten)
 * @param {Object} mesocycle - aktiivinen mesosykli (loadPct + cfg-arvot)
 * @param {boolean} isBarbell - load-tyyppi
 * @param {number} bodyweightKg - oletus 91
 * @param {number} cfgBaseline - nykyinen cfg-arvo (esim. cfg.dippiExtKg = 95)
 * @param {string} dateISO - request-päivä (käytetään blokki-rajan tunnistukseen)
 * @returns {object} { driftPct, signal, source, info, counter }
 */
function computeCfgDrift(topSets, sessions, mesocycle, isBarbell, bodyweightKg, cfgBaseline, dateISO) {
  if (!topSets || topSets.length === 0 || !mesocycle || !cfgBaseline || cfgBaseline <= 0) {
    return { driftPct: 0, signal: null, source: 'no-data', info: '', counter: 0 };
  }

  // Tunnista tämän sessio:n blokki (vk 1-4, 5-8, 9-12, 13-16)
  const currentWk = dateISO ? getMesocycleWeek(mesocycle, dateISO) : null;
  const blockOf = (wk) => wk == null ? null : Math.ceil(wk / 4);
  const currentBlock = blockOf(currentWk);

  // ═══ SIGNAL B: VELOCITY-PRIMER-TREND ═══
  // Käytä jos primer-velocity-baseline >= 5 mittausta
  const primerSets = topSets
    .filter(s => s.setRole === 'readiness_test' && s.velocityRep1 != null && s.velocityRep1 > 0)
    .sort((a, b) => (a.timestamp || a.dateISO || '').localeCompare(b.timestamp || b.dateISO || ''));

  if (primerSets.length >= 5) {
    // Baseline-mediaani 10 viim. mittauksesta
    const baselineWindow = primerSets.slice(-10).map(s => s.velocityRep1);
    const baselineMed = median(baselineWindow);

    // Viim. 3 primer-mediaani
    const recent3 = primerSets.slice(-3).map(s => s.velocityRep1);
    const recent3Med = median(recent3);

    if (baselineMed > 0) {
      const velDeltaPct = (recent3Med - baselineMed) / baselineMed;

      // Reset-tarkistus: käy 3 viim. primer-sessiota läpi, etsi reset-ehdot
      // (V0-fail samassa sessiossa primary-työsarjassa tai RED readiness)
      let driftValid = true;
      for (const ps of primerSets.slice(-3)) {
        // Etsi saman session primary-työsarjat
        const sessionWorkSets = topSets.filter(s =>
          s.sessionId === ps.sessionId && s.setRole === 'top'
        );
        const hasV0Fail = sessionWorkSets.some(s => s.actualVx === 0);
        if (hasV0Fail) { driftValid = false; break; }
      }

      if (driftValid && velDeltaPct >= 0.05) {
        // Counter: kuinka monta peräkkäistä viim. primeriä on yli baseline × 1.05?
        // (käännetty: uusin → vanhin, break kun ensimmäinen alle threshold)
        let counter = 0;
        for (let i = primerSets.length - 1; i >= 0; i--) {
          const v = primerSets[i].velocityRep1;
          if (v > baselineMed * 1.05) counter++;
          else break;
        }
        // Cap: drift max +5 % per blokki, +1 % per peräkkäinen drift-sessio
        const driftPctRaw = Math.min(0.05, counter * 0.01);
        return {
          driftPct: driftPctRaw,
          signal: 'velocity-trend',
          source: `velocity-primer (recent3 med ${recent3Med.toFixed(3)} m/s vs baseline ${baselineMed.toFixed(3)} m/s = +${(velDeltaPct*100).toFixed(1)}%, streak=${counter})`,
          info: `velDelta=+${(velDeltaPct*100).toFixed(1)}%, counter=${counter}`,
          counter,
          velDeltaPct,
        };
      }
      // Velocity-baseline on olemassa mutta ei näytä driftiä → ei drift signaalista B
      return {
        driftPct: 0, signal: 'velocity-trend', source: `velocity-stable (delta ${(velDeltaPct*100).toFixed(1)}%)`,
        info: `velocity-baseline n=${primerSets.length}, no drift`, counter: 0, velDeltaPct,
      };
    }
  }

  // ═══ SIGNAL A: VX-OVERSHOOT (fallback kun velocity-baseline puuttuu) ═══
  const primaryWork = topSets.filter(s => s.setRole === 'top');
  if (primaryWork.length === 0) {
    return { driftPct: 0, signal: 'vx-overshoot', source: 'no-top-sets', info: '', counter: 0 };
  }

  // Ryhmittele sessio-id:n mukaan, säilytä järjestys
  const sessGroups = new Map();
  const sessOrder = [];
  for (const s of primaryWork) {
    const sid = s.sessionId || `__nosess_${s.timestamp}`;
    if (!sessGroups.has(sid)) { sessGroups.set(sid, []); sessOrder.push(sid); }
    sessGroups.get(sid).push(s);
  }

  let counter = 0;
  for (let i = sessOrder.length - 1; i >= 0; i--) {
    const sets = sessGroups.get(sessOrder[i]);
    if (!sets || sets.length === 0) break;

    // Perfect execution
    const perfect = sets.every(s =>
      s.actualVx != null && s.targetVx != null
      && s.actualVx >= s.targetVx
      && (s.reps ?? 0) >= (s.targetReps ?? 0)
    );
    if (!perfect) break;

    // Lookup loadPct
    const sessId = sessOrder[i];
    const dateISOSess = sessions?.find(s => s.sessionId === sessId)?.dateISO
                     || sets[0]?.dateISO || sets[0]?.timestamp?.slice(0, 10);
    if (!dateISOSess) break;

    const wk = getMesocycleWeek(mesocycle, dateISOSess);
    const dow = new Date(dateISOSess).getDay() || 7;
    const dayPlan = (wk != null) ? mesocycle.weekPlans?.[wk - 1]?.days?.find(d => d.dayOfWeek === dow) : null;
    const primSlotDrift = dayPlan?.slots?.find(s => s.role === 'primary');
    const loadPct = primSlotDrift?.loadPct;
    if (!loadPct || loadPct <= 0 || loadPct > 1.0) break;
    // OBS-051: inkonsistentti loadPct (volyymi-label) ei kelpaa cfg-drift-todisteeksi.
    if (!isLoadPctVxConsistent(loadPct, primSlotDrift?.reps, primSlotDrift?.targetVx)) break;

    // PLAN_BASED-e1RM
    // S10-korjaus: system-%-inversio (jaettu helper) — cfgBaseline on external → vertaa ext.
    const loads = sets.map(x => x.externalLoadKg).filter(v => v > 0);
    if (loads.length === 0) break;
    const medLoad = median(loads);
    const planBasedE1RM = planBasedInvertE1RM(medLoad, loadPct, isBarbell, bodyweightKg)?.external ?? 0;

    if (planBasedE1RM > cfgBaseline * 1.10) counter++;
    else break;
  }

  if (counter < 3) {
    return { driftPct: 0, signal: 'vx-overshoot', source: `streak=${counter} (<3 ei laukea)`, info: '', counter };
  }

  // Drift max +10 % per blokki, +2.5 % per peräkkäinen
  const driftPctRaw = Math.min(0.10, (counter - 2) * 0.025);
  return {
    driftPct: driftPctRaw,
    signal: 'vx-overshoot',
    source: `vx-overshoot (perfect-streak ${counter}, +${(driftPctRaw*100).toFixed(1)}%)`,
    info: `counter=${counter}, fallback (velocity-baseline n=${primerSets.length} < 5)`,
    counter,
  };
}

/**
 * v4.34.44 — Hae primary-liikkeen cfg-baseline-arvo. Yleistetty hybridi-rakenne:
 *
 * TASO 1 (uusi, ei-streetlifting-mesoille): mesocycle.movementCfg[movName]
 *   Custom/hypertrofia/maksimivoima/jne. mesoissa kalibrointiarvot tallennetaan
 *   movementCfg-tauluun avaimella defaultMovementName. Tämä on uusi rakenne joka
 *   ei sotke streetliftingConfig.calibration-haaraa.
 *
 * TASO 2 (legacy, streetlifting_16w): mesocycle.streetliftingConfig.calibration
 *   Säilyy bit-perfect koskemattomana — streetlifting_16w-meso käyttää tätä
 *   edelleen kuten v4.34.43:ssa.
 *
 * TASO 3 (fallback): null → recommend() käyttää historia-baselinea (top-3 e1RM
 *   median × adaptive ceiling).
 *
 * Käytössä computeCfgDrift, E1RM_INFLATION_CAP ja persistCfgDriftIfApplicable.
 */
function getCfgBaselineForMovement(mesocycle, primarySlotMeta) {
  const movName = primarySlotMeta?.defaultMovementName;

  // TASO 1: movementCfg (uusi, kaikki ei-streetlifting-mesot)
  const movementCfg = mesocycle?.movementCfg || {};
  if (movName && movementCfg[movName] && movementCfg[movName].e1rmExternal != null) {
    return {
      value: movementCfg[movName].e1rmExternal,
      key: movName,
      movName,
      source: 'movementCfg',
    };
  }

  // TASO 2: streetliftingConfig.calibration (legacy, streetlifting_16w)
  const cfg = mesocycle?.streetliftingConfig?.calibration || {};
  if (movName === "Lisäpainoleuanveto") return { value: cfg.leukaExtKg, key: 'leukaExtKg', movName, source: 'streetliftingConfig' };
  if (movName === "Lisäpainodippi")     return { value: cfg.dippiExtKg,  key: 'dippiExtKg',  movName, source: 'streetliftingConfig' };
  if (movName === "Takakyykky")          return { value: cfg.kyykkyExtKg, key: 'kyykkyExtKg', movName, source: 'streetliftingConfig' };

  // TASO 3: ei kalibrointia → fallback historia-baselineen
  return { value: null, key: null, movName, source: null };
}

// ═══════════════════════════════════════════════════════════════
// BASELINE CALCULATIONS (rolling median + MAD)
// ═══════════════════════════════════════════════════════════════

function computeBaseline(values, windowN) {
  const windowed = values.slice(-windowN);
  if (windowed.length < 3) return null;
  const med = median(windowed);
  const sigma = madSigma(windowed);
  return { median: med, madSigma: sigma, n: windowed.length };
}

function classifyReadinessZ(z) {
  // v4.28.0 bugfix: boundary tulkittu konservatiivisesti. Aiemmin z === -0.5 palautti GREEN
  // ja z === -1.0 palautti YELLOW (if z >= ...) — readiness-järjestelmässä rajalla on
  // turvallisempaa valita alempi luokka, jotta grinder ei ohita YELLOW/RED-varoitusta.
  if (z > -0.5) return "GREEN";
  if (z > -1.0) return "YELLOW";
  return "RED";
}

// ═══════════════════════════════════════════════════════════════
// READINESS SYSTEM: 2/3 rule + velocity veto
// ═══════════════════════════════════════════════════════════════

/**
 * Compute velocity readiness from readiness test rep1 velocity
 */
function velocityReadiness(todayVelocity, baselineValues, windowN = 10) {
  if (todayVelocity === null || todayVelocity === undefined) {
    return { z: null, class: null, channel: "velocity" };
  }
  const bl = computeBaseline(baselineValues, windowN);
  if (!bl) return { z: null, class: null, channel: "velocity" };
  const z = zScore(todayVelocity, bl.median, bl.madSigma);
  return { z, class: classifyReadinessZ(z), channel: "velocity", baseline: bl };
}

/**
 * Compute HRV readiness from Oura night HRV (already as lnRMSSD)
 *
 * v4.33.0 M20d: Rolling 7-päivän keskiarvo-vertailu (Plews 2013, Plews & Laursen 2017).
 * Yksittäinen päivä-HRV on kohinaiseempi kuin rolling-keskiarvo. Vertaillaan TÄMÄN
 * PÄIVÄN HRV vs viim. 7 päivän keskiarvoa (rolling-7) baseline-Median sijasta jos
 * 7+ datapistettä saatavilla. Jos vähemmän, fallback baseline-vertailuun.
 *
 * Smallest worthwhile change ±0.5 SD viikkokeskiarvosta = optimi readiness-marker.
 */
function hrvReadiness(todayLnRMSSD, baselineValues, windowN = 14) {
  if (todayLnRMSSD === null || todayLnRMSSD === undefined) {
    return { z: null, class: null, channel: "hrv" };
  }
  // v4.33.0 M20d: Rolling 7-päivän keskiarvo (Plews 2013)
  if (Array.isArray(baselineValues) && baselineValues.length >= 7) {
    const last7 = baselineValues.slice(-7);
    const rolling7Mean = last7.reduce((a, b) => a + b, 0) / last7.length;
    // Käytetään koko baseline-windowin MAD-sigma:a varianssin estimaattina
    const bl = computeBaseline(baselineValues, windowN);
    if (bl) {
      const z = zScore(todayLnRMSSD, rolling7Mean, bl.madSigma);
      return {
        z,
        class: classifyReadinessZ(z),
        channel: "hrv",
        baseline: bl,
        rolling7Mean,
        method: "rolling7",
      };
    }
  }
  // Fallback: baseline median -vertailu (legacy)
  const bl = computeBaseline(baselineValues, windowN);
  if (!bl) return { z: null, class: null, channel: "hrv" };
  const z = zScore(todayLnRMSSD, bl.median, bl.madSigma);
  return { z, class: classifyReadinessZ(z), channel: "hrv", baseline: bl, method: "baseline-median" };
}

/**
 * v4.33.0 M20a: Yläraaja-readiness MPV warmup-singlessä @ 60-65% 1RM
 *
 * Sánchez-Moreno 2017 (IJSPP 12:1378) osoitti pull-up-spesifin load-velocity-relaation
 * r = -0.96 ja stabiilin V-%1RM-suhteen 12 vk:n harjoittelun yli; Sánchez-Moreno 2020
 * (JSCR 34:911) vahvisti VL-thresholdit (VL25, VL50). Sánchez-Medina &
 * González-Badillo 2011 (MSSE 43:1725) osoittaa, että velocity loss korreloi
 * voimakkaasti neuromuskulaarisen fatiguen kanssa.
 *
 * Käyttö: lisäpainoleuka warmup-single @ 60-65% 1RM aamulla MA + TO + LA.
 * Vertaa tämän päivän MPV vs viim. 7 pv rolling-mediania.
 *
 * Kynnysarvot (heuristiset, johdettu Pareja-Blanco/González-Badillo VL-thresholdeista):
 *   ≥ +3 %   → "Green light", top-set OK, harkitse +2.5 kg
 *   −0..3 %  → Normaali, ohjelman mukaan
 *   −3..−5 % → Pieni varovaisuus, ei testiyrityksiä
 *   −5..−10% → Vähennä top-set 5-10 % (esim. 90 %→82.5 %), volume tai -1 setti
 *   > −10 %  → Lepopäivä TAI kevyt tekniikkasessio @ 50 %
 *   > −15 %  → Mahdollinen NFOR, review koko viikko
 *
 * Returns: { mpv, baseline7Mean, deltaPct, class: "GREEN"|"YELLOW"|"RED", message, recommendedLoadAdjust }
 */
function upperBodyMpvReadiness(todayMpv, recent7DaysMpv) {
  if (todayMpv === null || todayMpv === undefined) {
    return { mpv: null, baseline7Mean: null, deltaPct: null, class: null, message: "Ei MPV-dataa", recommendedLoadAdjust: 0 };
  }
  if (!Array.isArray(recent7DaysMpv) || recent7DaysMpv.length < 3) {
    // Rakenna baseline ensin — alle 3 datapistettä ei riitä luotettavaan vertailuun
    return { mpv: todayMpv, baseline7Mean: null, deltaPct: null, class: null, message: "Baseline rakentuu (3+ MPV-mittausta tarvitaan)", recommendedLoadAdjust: 0 };
  }
  const baseline7Mean = recent7DaysMpv.reduce((a, b) => a + b, 0) / recent7DaysMpv.length;
  if (baseline7Mean <= 0) {
    return { mpv: todayMpv, baseline7Mean, deltaPct: null, class: null, message: "Baseline ei luotettava (≤0)", recommendedLoadAdjust: 0 };
  }
  const deltaPct = ((todayMpv - baseline7Mean) / baseline7Mean) * 100;
  // v4.34.23 KORJAUS — käyttäjäpalaute: aiemmat thresholds olivat liian aggressiivisia.
  // -15 % MPV-laskulla load -50 % (= 26.75 kg V3 atleetille jolla 50 kg = V1) oli naurettava.
  // Tutkimuspohja: Pareja-Blanco/Sánchez-Medina puhuvat WITHIN-SET velocity loss -kynnyksistä
  // (VL15-25), EI day-to-day baseline-drift:istä. Day-to-day variabiliteetti ±3-5 % on luonnostaan,
  // joten -15 % on iso mutta ei "skip session". Plews 2013 + Holmes 2021 -tasoiset realistiset rajat.
  // Lisäksi: load-adjustment EI saa kerrata plan-percentageja kun atleete on muuten työkuntoinen —
  // sen sijaan käytetään VX-BUMPIA (V3 → V4) kompensaationa, ei radikaalia load-pudotusta.
  let cls, message, recommendedLoadAdjust, recommendedVxBump;
  if (deltaPct >= 3) {
    cls = "GREEN";
    message = `MPV +${deltaPct.toFixed(1)}% baseline — Green light, top-set OK, harkitse +2.5 kg`;
    recommendedLoadAdjust = 0.025;  // +2.5%
    recommendedVxBump = 0;
  } else if (deltaPct >= -3) {
    cls = "GREEN";
    message = `MPV ${deltaPct.toFixed(1)}% baseline — Normaali, ohjelman mukaan`;
    recommendedLoadAdjust = 0;
    recommendedVxBump = 0;
  } else if (deltaPct >= -7) {
    cls = "YELLOW";
    message = `MPV ${deltaPct.toFixed(1)}% baseline — Pieni varovaisuus, ei testiyrityksiä`;
    recommendedLoadAdjust = 0;
    recommendedVxBump = 0;
  } else if (deltaPct >= -12) {
    cls = "YELLOW";
    message = `MPV ${deltaPct.toFixed(1)}% baseline — Vähennä top-set 7.5%`;
    recommendedLoadAdjust = -0.075;
    recommendedVxBump = 0;
  } else if (deltaPct >= -18) {
    cls = "RED";
    message = `MPV ${deltaPct.toFixed(1)}% baseline — Vähennä load 15% + Vx +1 (esim. V3 → V4)`;
    recommendedLoadAdjust = -0.15;  // v4.34.23: oli -0.50, korjattu -0.15
    recommendedVxBump = 1;          // v4.34.23: kompensaatio Vx-bumpilla
  } else {
    cls = "RED";
    message = `MPV ${deltaPct.toFixed(1)}% baseline — Vähennä load 25% + Vx +1, harkitse skip jos < -25%`;
    recommendedLoadAdjust = -0.25;  // v4.34.23: oli -1.0 (skip), korjattu -0.25
    recommendedVxBump = 1;
  }
  return { mpv: todayMpv, baseline7Mean, deltaPct, class: cls, message, recommendedLoadAdjust, recommendedVxBump };
}

/**
 * Compute Vara readiness from recent top-set overshoot
 */
function varaReadiness(recentTopSets, windowN = 5) {
  const sets = recentTopSets.slice(-windowN).filter(
    (s) => s.targetVx !== null && s.targetVx !== undefined &&
           s.actualVx !== null && s.actualVx !== undefined
  );
  if (sets.length < 2) return { z: null, class: null, channel: "vara", meanOvershoot: null };

  const overshoots = sets.map((s) => s.targetVx - s.actualVx);
  const meanOvershoot = avg(overshoots);

  let cls;
  if (meanOvershoot >= 2) cls = "RED";
  else if (meanOvershoot >= 1) cls = "YELLOW";
  else cls = "GREEN";

  return { z: null, class: cls, channel: "vara", meanOvershoot };
}

/**
 * Combine readiness channels using 2/3 rule + velocity veto
 */
function combineReadiness(velocityR, hrvR, varaR) {
  const channels = [velocityR, hrvR, varaR];
  const active = channels.filter((c) => c.class !== null);

  if (active.length === 0) {
    return { combined: "GREEN", capLevel: 0, channels: { velocity: velocityR, hrv: hrvR, vara: varaR } };
  }

  // Count colors
  const counts = { GREEN: 0, YELLOW: 0, RED: 0 };
  for (const ch of active) counts[ch.class]++;

  let combined;

  // 2/3 rule
  if (counts.GREEN >= 2) combined = "GREEN";
  else if (counts.RED >= 2 || (counts.RED >= 1 && counts.YELLOW >= 1)) combined = "RED";
  else combined = "YELLOW";

  // Velocity VETO
  if (velocityR.class === "RED") {
    if (combined === "GREEN") combined = "YELLOW";
    const othersYellowOrRed = [hrvR, varaR].filter(
      (c) => c.class === "YELLOW" || c.class === "RED"
    ).length;
    if (othersYellowOrRed >= 1) combined = "RED";
  }

  const capLevel = combined === "GREEN" ? 0 : combined === "YELLOW" ? 1 : 2;

  return {
    combined,
    capLevel,
    channels: { velocity: velocityR, hrv: hrvR, vara: varaR },
  };
}

// ═══════════════════════════════════════════════════════════════
// K7-1 — SUBJEKTIIVINEN CHECK-IN (4. readiness-kanava, laitteeton fallback)
// ═══════════════════════════════════════════════════════════════
//
// Valmentaja-linssin KRIITTINEN aukko: ilman Enodea/Ouraa engine oletti atleetin
// aina vihreäksi ("null → GREEN on vastakohta hyvälle valmennukselle"). 15 sekunnin
// aamucheck-in (uni, stressi, lihasarkuus, motivaatio; kukin 1–5, 5 = paras) on
// validoitu monitorointimenetelmä: Hooper & Mackinnon 1995 (wellness-indeksi),
// McLean 2010 (päivittäisen wellness-kyselyn herkkyys kuormitusvasteille).
// Summa 4–20 → luokka: ≥16 GREEN · 12–15 YELLOW · <12 RED. Cap-only-periaate
// säilyy: check-in RAJOITTAA (capLevel) muttei koskaan pakota nostamaan.
function computeSubjectiveReadiness(checkin) {
  if (!checkin) return { class: null, score: null, source: "checkin" };
  const f = (v) => (typeof v === "number" && v >= 1 && v <= 5 ? v : null);
  const parts = [f(checkin.sleep), f(checkin.stress), f(checkin.soreness), f(checkin.motivation)];
  if (parts.some((p) => p === null)) return { class: null, score: null, source: "checkin" };
  const score = parts.reduce((a, b) => a + b, 0);
  const cls = score >= 16 ? "GREEN" : score >= 12 ? "YELLOW" : "RED";
  return { class: cls, score, source: "checkin",
    detail: { sleep: parts[0], stress: parts[1], soreness: parts[2], motivation: parts[3] } };
}

// Laajennettu yhdistely: valinnainen 4. kanava (subjektiivinen check-in).
// TAAKSEPÄIN-YHTEENSOPIVA: 3 kanavalla käytös identtinen combineReadinessin kanssa
// (GREEN-kynnys > active/2 = 2/3; RED-säännöt ennallaan). 4 aktiivisella kanavalla
// GREEN vaatii aidon enemmistön (3/4) — kaksi keltaista ei enää huku vihreisiin.
function combineReadinessAll(velocityR, hrvR, varaR, subjR = null) {
  const base = combineReadiness(velocityR, hrvR, varaR);
  if (!subjR || subjR.class === null) {
    return { ...base, channels: { ...base.channels, subjective: subjR || { class: null } },
      noData: base.channels.velocity.class === null && base.channels.hrv.class === null
        && base.channels.vara.class === null };
  }
  const channels = [velocityR, hrvR, varaR, subjR];
  const active = channels.filter((c) => c && c.class !== null);
  const counts = { GREEN: 0, YELLOW: 0, RED: 0 };
  for (const ch of active) counts[ch.class]++;
  let combined;
  if (counts.GREEN > active.length / 2) combined = "GREEN";
  else if (counts.RED >= 2 || (counts.RED >= 1 && counts.YELLOW >= 1)) combined = "RED";
  else combined = "YELLOW";
  // Velocity-veto ennallaan (mittausdata voittaa subjektiivisen)
  if (velocityR.class === "RED") {
    if (combined === "GREEN") combined = "YELLOW";
    const others = [hrvR, varaR, subjR].filter((c) => c.class === "YELLOW" || c.class === "RED").length;
    if (others >= 1) combined = "RED";
  }
  const capLevel = combined === "GREEN" ? 0 : combined === "YELLOW" ? 1 : 2;
  return { combined, capLevel, noData: false,
    channels: { velocity: velocityR, hrv: hrvR, vara: varaR, subjective: subjR } };
}

// ═══════════════════════════════════════════════════════════════
// K7-2 — VÄSYMYSAGGREGAATTI (automaattinen deload-ehdotus)
// ═══════════════════════════════════════════════════════════════
//
// Signaalit olivat hajallaan (failure-lukot, Vara-drift, stagnaatio per liike) mutta
// MIKÄÄN ei aggregoinut niitä yli liikkeiden päätökseksi "nyt deload". Valmentaja
// kutsuu audible-deloadin kun useampi liike junnaa ja atleetti grindaa — engine
// jatkoi +2,5 %/vk kunnes weekDef sanoi muuta. ADVISORY-ONLY (cap-only-periaate):
// palauttaa ehdotuksen + syyt; UI näyttää bannerin ja yhden napin deload-insertin
// (olemassa oleva insertedDeloads-mekanismi). Ei kosketa recommend()-kuormiin.
// Ikkuna 14 pv. Kynnykset konservatiivisia (elite-atletti, ei nanny — pisteytys
// vaatii USEAN riippumattoman signaalin).
function computeFatigueAggregate(allSets, sessions, dateISO, opts = {}) {
  const windowDays = opts.windowDays ?? 14;
  const now = new Date(dateISO + "T23:59:59Z").getTime();
  const cutoff = now - windowDays * 86400000;
  const sessDate = {};
  for (const s of sessions || []) if (s?.sessionId) sessDate[s.sessionId] = s.dateISO || null;
  const recent = (allSets || []).filter((s) => {
    const d = s.dateISO || (s.timestamp || "").slice(0, 10) || sessDate[s.sessionId];
    if (!d) return false;
    const t = new Date(d).getTime();
    return t >= cutoff && t <= now && s.setRole !== "readiness_test" && !s.isWarmup;
  });
  if (recent.length < 12) {
    return { suggest: false, score: 0, reason: "liian vähän dataa 14 pv ikkunassa", signals: {} };
  }
  // Signaali 1: V0-failuret (ei-isolaatio ei eroteltavissa ilman movement-dataa → kaikki;
  // kynnys sietää isolaatio-V0:t)
  const v0Count = recent.filter((s) => s.actualVx === 0).length;
  // Signaali 2: grindi-osuus (toteuma ≥2 luokkaa alle targetin)
  const withTarget = recent.filter((s) => s.actualVx != null && s.targetVx != null);
  const grindShare = withTarget.length
    ? withTarget.filter((s) => s.actualVx <= s.targetVx - 2).length / withTarget.length : 0;
  // Signaali 3: negatiivinen Vara-trendi (keskimääräinen overshoot < −0,5 luokkaa)
  const meanOvershoot = withTarget.length
    ? withTarget.reduce((sum, s) => sum + (s.actualVx - s.targetVx), 0) / withTarget.length : 0;
  let score = 0;
  const signals = {};
  if (v0Count >= 4) { score += 2; signals.v0Count = v0Count; }
  else if (v0Count >= 2) { score += 1; signals.v0Count = v0Count; }
  if (grindShare >= 0.25) { score += 2; signals.grindSharePct = Math.round(grindShare * 100); }
  else if (grindShare >= 0.15) { score += 1; signals.grindSharePct = Math.round(grindShare * 100); }
  if (meanOvershoot <= -0.75) { score += 2; signals.meanOvershoot = Number(meanOvershoot.toFixed(2)); }
  else if (meanOvershoot <= -0.4) { score += 1; signals.meanOvershoot = Number(meanOvershoot.toFixed(2)); }
  const suggest = score >= 3;
  const why = suggest
    ? `Kumuloitunut väsymys 14 pv ikkunassa: ${signals.v0Count ? signals.v0Count + "× V0" : ""}${signals.grindSharePct ? " · grindi " + signals.grindSharePct + " % sarjoista" : ""}${signals.meanOvershoot != null ? " · Vara-trendi " + signals.meanOvershoot : ""} → harkitse deload-viikkoa (🌿 Kevennys -nappi lisää sen ensi viikolle).`
    : null;
  return { suggest, score, signals, why };
}

// ═══════════════════════════════════════════════════════════════
// K7-6 — KISAPÄIVÄN YRITYSVALINTA (in-meet-aivot)
// ═══════════════════════════════════════════════════════════════
//
// Valmentaja-linssin KRIITTINEN aukko: opener/2./3. yritys laskettiin KERRAN päivän
// alussa staattisena prosenttitaulukkona — lämmittelyhuoneessa valmentaja päivittää
// jokaisen yrityksen jälkeen. Päivän 1RM-estimaatti päivittyy yritystuloksista:
// onnistunut yritys grindi-luokalla (1 = nopea, 2 = työläs, 3 = grindi) implikoi
// varaa Epley-käänteisesti; hylätty yritys cappaa estimaatin. Strategia:
// "varma" (9/9, kisan varmistus) · "normaali" · "aggressiivinen" (ennätysjahti).
// Ei koskaan ehdota alle viimeisimmän onnistuneen (+0,5 kg minimikorotus).
function computeNextAttempt({ e1rmDayStart, attempts = [], strategy = "normaali" }) {
  let est = typeof e1rmDayStart === "number" && e1rmDayStart > 0 ? e1rmDayStart : null;
  let lastSuccess = null;
  for (const a of attempts) {
    if (!a || !(a.loadKg > 0)) continue;
    if (a.success) {
      lastSuccess = Math.max(lastSuccess ?? 0, a.loadKg);
      const grind = a.grindClass === 1 ? 1.5 : a.grindClass === 3 ? 0.3 : 0.8; // RIR-proxy tankonopeudesta
      const implied = a.loadKg * (1 + grind / 30);
      est = est === null ? implied : Math.max(est, implied);
    } else {
      est = est === null ? a.loadKg * 0.995 : Math.min(est, a.loadKg * 0.995);
    }
  }
  if (est === null) return { day1RM: null, nextLoadKg: null, rationale: "Ei estimaattia — kirjaa opener ensin." };
  const mult = strategy === "varma" ? 0.955 : strategy === "aggressiivinen" ? 0.99 : 0.975;
  let next = roundToHalf(est * mult);
  const lastAttempt = attempts[attempts.length - 1];
  if (lastAttempt && !lastAttempt.success) {
    // Hylätty: nopeus ratkaisee — grindi 3 → sama uusiksi ei kannata ilman syytä
    next = lastAttempt.grindClass === 3
      ? roundToHalf(lastAttempt.loadKg) // toisto vain jos tekninen syy; viesti kertoo
      : roundToHalf(lastAttempt.loadKg); // tekninen/nopea hylky → sama uudelleen
    return { day1RM: roundToHalf(est), nextLoadKg: next,
      rationale: lastAttempt.grindClass === 3
        ? `Hylätty grindillä → älä nosta. Toista ${next} kg VAIN jos hylkäys oli tekninen (esim. painuma/ote) — muuten kisa on tässä.`
        : `Hylätty ilman grindiä (tekninen?) → toista ${next} kg. Päivän 1RM-estimaatti ${roundToHalf(est)} kg.` };
  }
  if (lastSuccess !== null && next <= lastSuccess) next = roundToHalf(lastSuccess + 0.5);
  return { day1RM: roundToHalf(est), nextLoadKg: next,
    rationale: `Päivän 1RM-estimaatti ${roundToHalf(est)} kg (yritystuloksista päivitetty) × ${(mult * 100).toFixed(1).replace(".", ",")} % [${strategy}] → ${next} kg.` };
}

// ═══════════════════════════════════════════════════════════════
// K7-7 — SYKLIN LOPPUANALYYSI → SEURAAVAN BLOKIN SUOSITUS (makrosyklin siemen)
// ═══════════════════════════════════════════════════════════════
//
// Valmentaja-linssin KRIITTINEN aukko: ohjelmointi loppui 16 viikkoon — ei heikkous-
// diagnoosia, ei blokkien välistä päätöksentekoa. Analysoi kisaliikkeiden kehityksen
// syklin sisällä (kanoninen Best alkupää vs loppupää), failure-tiheyden ja tuottaa
// RANKATUN heikkousdiagnoosin + seuraavan blokin suosituksen. Kisapäivämäärä-
// tietoisuus: jos targetCompetitionDateISO ≤ 8 vk päässä → peaking-suositus.
function analyzeCycleForNextBlock(allSets, sessions, mesocycle, movements, bodyweightKg, opts = {}) {
  const lifts = (movements || []).filter((m) => m.isCompetitionLift);
  if (!lifts.length || !mesocycle?.startDateISO) return { perLift: [], recommendation: null };
  const startT = new Date(mesocycle.startDateISO).getTime();
  const midT = startT + 8 * 7 * 86400000; // alkupää = vk 1–8
  const perLift = [];
  for (const m of lifts) {
    const sets = (allSets || []).filter((s) => s.movementId === m.movementId && (s.externalLoadKg || 0) > 0 && (s.reps || 0) >= 1);
    if (sets.length < 6) { perLift.push({ lift: m.name, insufficient: true }); continue; }
    const early = sets.filter((s) => new Date(s.timestamp || s.dateISO || 0).getTime() <= midT);
    const bestNow = computeMovementE1RMBest(sets, sessions, mesocycle, m, bodyweightKg);
    const bestEarly = early.length >= 3 ? computeMovementE1RMBest(early, sessions, mesocycle, m, bodyweightKg) : null;
    const deltaPct = bestEarly && bestEarly.value > 0 && bestNow
      ? (bestNow.value - bestEarly.value) / bestEarly.value : null;
    const v0 = sets.filter((s) => s.actualVx === 0).length;
    perLift.push({ lift: m.name, e1rmNow: bestNow?.value ?? null, e1rmEarly: bestEarly?.value ?? null,
      deltaPct: deltaPct !== null ? Number((deltaPct * 100).toFixed(1)) : null,
      v0Count: v0, setCount: sets.length });
  }
  const ranked = perLift.filter((p) => !p.insufficient && p.deltaPct !== null)
    .sort((a, b) => a.deltaPct - b.deltaPct);
  const weakest = ranked[0] || null;
  let blockType = "streetlifting_16w";
  let note = weakest
    ? `Heikoin kehitys: ${weakest.lift} (${weakest.deltaPct >= 0 ? "+" : ""}${weakest.deltaPct} % syklissä${weakest.v0Count ? `, ${weakest.v0Count}× V0` : ""}). Seuraava blokki: painota ${weakest.lift} — +1 laatusarja/vk (frequency ennen intensiteettiä) ja aloita blokki cal-viikolla (uusi baseline ennen kuormia).`
    : "Kehitysdata ei riitä heikkousdiagnoosiin — aja cal-viikko ja jatka tasapainoisella blokilla.";
  const compISO = opts.targetCompetitionDateISO || null;
  if (compISO) {
    const weeksToComp = Math.round((new Date(compISO).getTime() - new Date(opts.dateISO || mesocycle.startDateISO).getTime()) / (7 * 86400000));
    if (weeksToComp > 0 && weeksToComp <= 8) {
      blockType = "peaking";
      note = `Kisa ${compISO} on ${weeksToComp} vk päässä → seuraava blokki on PEAKING (4 vk: intensification → realization → taper → kisa)${weakest ? `. Heikkousdiagnoosi (${weakest.lift} ${weakest.deltaPct} %) siirtyy kisan jälkeisen blokin painotukseksi.` : "."}`;
    }
  }
  return { perLift, weakest, recommendation: { blockType, note } };
}

// ═══════════════════════════════════════════════════════════════
// MESOCYCLE LOGIC
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve full mesocycle position — handles inserted deload weeks.
 * Returns { programWeek, isInsertedDeload, calendarWeek } or null if past end.
 *
 * Inserted deload: occupies a calendar week between program weeks, extending
 * the effective mesocycle length by 1 week per insert. The `programWeek`
 * returned during a deload insert = the program week just completed (so phase
 * logic, accessory slot lookups etc. resolve against the pre-deload state).
 */
function resolveMesocyclePosition(mesocycle, dateISO) {
  if (!mesocycle || !mesocycle.startDateISO) return null;
  const start = new Date(mesocycle.startDateISO);
  const current = new Date(dateISO);
  const diffDays = Math.floor((current - start) / (1000 * 60 * 60 * 24));
  // v4.22: erotellaan "ennen alkua" vs "lopun jälkeen" -tilanteet. Aiemmin
  // molemmat palauttivat null, ja recommend() korvasi mesosyklin default:illa
  // kun pääsy ennen startDateISO:a pyyttiin (esim. backfill-polku). Nyt
  // palautetaan strukturoitu result jossa kutsuja näkee miksi.
  if (diffDays < 0) return { programWeek: null, reason: "before-start", diffDays };
  const calendarWeek = Math.floor(diffDays / 7) + 1;

  const inserts = [...(mesocycle.insertedDeloads || [])]
    .map(d => (typeof d === "number" ? d : d.afterProgramWeek))
    .filter(n => Number.isInteger(n) && n >= 0)
    .sort((a, b) => a - b);

  const effectiveWeekCount = mesocycle.weekCount + inserts.length;
  if (calendarWeek > effectiveWeekCount) return { programWeek: null, reason: "after-end", diffDays, calendarWeek };

  let programWeek = 0;
  let insertIdx = 0;
  let isDeload = false;
  for (let cw = 1; cw <= calendarWeek; cw++) {
    isDeload = false;
    if (insertIdx < inserts.length && inserts[insertIdx] === programWeek) {
      isDeload = true;
      insertIdx++;
    } else {
      programWeek++;
    }
  }
  return { programWeek: Math.max(programWeek, 1), isInsertedDeload: isDeload, calendarWeek, reason: "in-range" };
}

/**
 * Determine which program week of the mesocycle we're in based on date.
 * Backward-compatible: returns a number (or null). For full state including
 * inserted-deload flag, use resolveMesocyclePosition().
 */
function getMesocycleWeek(mesocycle, dateISO) {
  const pos = resolveMesocyclePosition(mesocycle, dateISO);
  return pos && pos.programWeek ? pos.programWeek : null;
}

function isInsertedDeloadWeek(mesocycle, dateISO) {
  const pos = resolveMesocyclePosition(mesocycle, dateISO);
  return pos && pos.programWeek ? pos.isInsertedDeload : false;
}

function isReplacedDeloadWeek(mesocycle, dateISO) {
  const pos = resolveMesocyclePosition(mesocycle, dateISO);
  if (!pos || !pos.programWeek || pos.isInsertedDeload) return false;
  const replaced = (mesocycle?.replacedWithDeload || [])
    .map(r => (typeof r === "number" ? r : r.programWeek))
    .filter(Number.isInteger);
  return replaced.includes(pos.programWeek);
}

function isDeloadOverrideWeek(mesocycle, dateISO) {
  return isInsertedDeloadWeek(mesocycle, dateISO) || isReplacedDeloadWeek(mesocycle, dateISO);
}

function getEffectiveWeekCount(mesocycle) {
  if (!mesocycle) return 0;
  const inserts = mesocycle.insertedDeloads?.length || 0;
  return (mesocycle.weekCount || 0) + inserts;
}

/**
 * Get the week definition for a given week number
 */
function getWeekDef(mesocycle, weekNum) {
  if (!mesocycle || !mesocycle.weekDefs) return null;
  return mesocycle.weekDefs.find((w) => w.week === weekNum) || null;
}

/**
 * Get the planned day for today from the week plan.
 * If no exact match for dayOfWeek, finds the NEXT training day (forward-first)
 * so rest days show the upcoming session, not the one already completed.
 *
 * v4.27.11: Aiempi "nearest" logiikka palautti eiliseen planin tasapelitilanteissa.
 * Esim. perjantaina (dow=5) TO (4) ja LA (6) ovat molemmat 1 päivän päässä,
 * mutta TO listataan ensin weekPlans.days:ssa → TO voitti → dashboard näytti
 * eilisen treenin uudelleen. Uusi logiikka laskee forward-etäisyyden (wrap-around
 * seuraavaan viikkoon), joten perjantaina LA voittaa TO:n (fwd=1 vs fwd=6).
 */
function getTodayPlan(mesocycle, weekNum, dayOfWeek) {
  if (!mesocycle || !mesocycle.weekPlans) return null;
  const weekPlan = mesocycle.weekPlans.find((w) => w.week === weekNum);
  if (!weekPlan || !weekPlan.days || !weekPlan.days.length) return null;
  // Exact match
  const exact = weekPlan.days.find((d) => d.dayOfWeek === dayOfWeek);
  if (exact) return exact;
  // Forward-first: pienin päivien määrä TÄNÄÄN → d (wrap-around = ensi vk)
  let best = null;
  let bestFwd = Infinity;
  for (const d of weekPlan.days) {
    let fwd = d.dayOfWeek - dayOfWeek;
    if (fwd <= 0) fwd += 7; // wrap to next week if day already passed
    if (fwd < bestFwd) {
      bestFwd = fwd;
      best = d;
    }
  }
  return best;
}

// v4.52.18 H-009 P1a (A1): Identity-coherence-detektori.
//
// JUURISYY-LUOKKA jota tämä havaitsee (H-008): ankkuroitu liike näyttää TOISEN
// liikkeen e1RM:stä johdettua kuormaa. H-008-ilmentymä: perjantai-resoluution
// eriparisuus → primaryMovementId=Lisäpainoleuanveto (e1RM-lähde) mutta näytetty
// primary-slot=Muscle-up → MU näytti +82 kg (leuanveto-e1RM). H-008-juuri on jo
// korjattu (110a63d); tämä funktio institutionalisoi luokan KONEELLISESTI
// havaittavaksi riippumatta mekanismista (slot-keying / päivä-resoluutio / cfg).
//
// TUNING-VAPAA: binäärinen identity-vertailu, EI kynnystä eikä magnitude-rajaa
// (ei nanny-cap, CLAUDE.md §6). Mismatch = e1RM-source-liike ≠ näytetty-primary.
//
// Graceful: jos kumpi tahansa id puuttuu → ei voida tarkistaa → mismatch=false
// (ei false-positivea). Tämä pitää assertion turvallisena myös vajaalla datalla.
//
// SCOPE (H-009 P1a Polku 1, Akseli ratifioinut 2026-05-29): tämä on additiivinen
// FUNKTIO + synteettinen test-lukko. EI johdoteta audit-engine-gateen tässä —
// pilot-harness (scenario-runner buildCtx) syöttää kiinteän catalog[0]-pmid:n
// joka tuottaa 72 identity-mismatchia (harness-artefakti, ei tuotanto-bugi) →
// gate laukeaisi A4-false-positiveja. Gate + harness-uskollisuus = P1c
// (ks. docs/backlog.md OBS-004).
function detectPrimaryMovementIdentityMismatch(e1rmSourceMovementId, shownPrimaryMovementId) {
  // Graceful: ilman molempia id:itä ei voida tehdä identity-tarkistusta.
  if (!e1rmSourceMovementId || !shownPrimaryMovementId) {
    return {
      mismatch: false,
      e1rmSource: e1rmSourceMovementId ?? null,
      shown: shownPrimaryMovementId ?? null,
      reason: "insufficient-data",
    };
  }
  if (e1rmSourceMovementId === shownPrimaryMovementId) {
    return {
      mismatch: false,
      e1rmSource: e1rmSourceMovementId,
      shown: shownPrimaryMovementId,
      reason: "identity-match",
    };
  }
  // X ≠ Y → näytetty liike johdettu eri liikkeen datasta (H-008-bugiluokka).
  return {
    mismatch: true,
    e1rmSource: e1rmSourceMovementId,
    shown: shownPrimaryMovementId,
    reason: "identity-mismatch",
  };
}

// ═══════════════════════════════════════════════════════════════
// H-015 (2026-06-10): LIIKKEEN KORVAUS VAIVAN AJAKSI (movementSubstitutions)
// ═══════════════════════════════════════════════════════════════
// K1 (ratifioitu): korvaus on VAIVAN KESTON MITTAINEN, liike-tasolla — kaikki
// liikkeen esiintymät (primary/backoff/secondary/accessory/cal) korvautuvat
// kunnes substituutio päätetään (endedISO). Skeema mesocycle-objektissa:
//   movementSubstitutions: { [originalName]: { replacementName, reason,
//     startedISO, endedISO|null } }   — reason = K2-tagi ("vaiva"|"aikapula"|"muu"|null)
//
// RAMPPI-PERINTÄ ILMAISEKSI: slotin reps/targetVx/loadPct EIVÄT muutu — vain
// defaultMovementName vaihtuu ENNEN kuormaresoluutiota → M2-sisä-blokki-ramppi
// (vReps slotin reps+targetVx:stä), e1RM-haku, F-2-clamp, K-A6D-velocityStop ja
// identity-detektori (e1rmSource = shown = korvaaja) seuraavat korvaajaa
// automaattisesti. Alkuperäisen liikkeen e1RM-tila EI muutu (sen dataan ei
// kirjoiteta substituution aikana).
//
// YKSI KANONINEN APPLIKOINTIFUNKTIO (value-resolution-oppi: ei replikointia):
// kutsutaan recommend()-dayPlan-resoluutiossa + getFutureWorkouts:ssa + UI:n
// viikkorenderissä — kaikki polut näkevät saman substituoidun nimen.
function applyMovementSubstitutions(slots, mesocycle) {
  const subs = mesocycle?.movementSubstitutions || {};
  const activeKeys = Object.keys(subs).filter(k => subs[k] && subs[k].replacementName && !subs[k].endedISO);
  if (!activeKeys.length || !Array.isArray(slots)) return slots;
  let changed = false;
  const mapped = slots.map(s => {
    const sub = s?.defaultMovementName ? subs[s.defaultMovementName] : null;
    if (!sub || sub.endedISO || !sub.replacementName) return s;
    changed = true;
    return {
      ...s,
      defaultMovementName: sub.replacementName,
      // Variantti-vihjeet kuuluvat alkuperäiselle liikkeelle — ei siirretä korvaajalle.
      variantHint: undefined,
      _substituted: { originalName: s.defaultMovementName, reason: sub.reason || null, startedISO: sub.startedISO || null },
    };
  });
  return changed ? mapped : slots;
}

/**
 * deltaPct_raw calculation: mesocycle week coefficient × day type multiplier
 */
function deltaPctRaw(weekDef, dayType) {
  if (!weekDef) return 0;
  const weekCoeff = weekDef.deltaPctBase || 0;
  const dayMult = DAY_TYPE_MULTIPLIERS[dayType] ?? 1.0;
  return weekCoeff * dayMult;
}

/**
 * Adaptive mesocycle calibration after cycle completion
 * Returns adjustment to deltaPct values for next cycle
 */
function calibrateMesocycle(varaFeedbackSets) {
  if (!varaFeedbackSets.length) return { adjustment: 0, reason: "Ei dataa" };
  const overshoots = varaFeedbackSets
    .filter((s) => s.targetVx !== null && s.actualVx !== null)
    .map((s) => s.targetVx - s.actualVx);
  if (!overshoots.length) return { adjustment: 0, reason: "Ei Vara-dataa" };

  const avgOvershoot = avg(overshoots);
  let adj = 0;
  let reason = "";

  // v4.28.0 bugfix: sign-konventio yhtenäistetty varaTrendCorrection-dokumentaation kanssa.
  // overshoot = targetVx - actualVx. actualVx > targetVx ⇒ overshoot < 0 ⇒ TOO EASY (crushed)
  // → lisää painoa. actualVx < targetVx ⇒ overshoot > 0 ⇒ TOO HARD (struggled) → vähennä.
  // Aiemmin merkit olivat väärin päin: grinderille (actual=0, target=2 → overshoot=+2)
  // engine suositteli +1% vaikka oli selvästi liian raskas. Kynnys-asymmetria säilytetty:
  // +1% vaatii vahvan crush-signaalin (≤ -1.0), -1% lievemmälläkin struggle-signaalilla (≥ 0.5).
  if (avgOvershoot < -1.0) {
    adj = 0.01; // +1%
    reason = `Liian kevyt (avgOvershoot=${avgOvershoot.toFixed(2)}) → +1%`;
  } else if (avgOvershoot > 0.5) {
    adj = -0.01; // -1%
    reason = `Liian raskas (avgOvershoot=${avgOvershoot.toFixed(2)}) → -1%`;
  } else {
    reason = `Sopiva (avgOvershoot=${avgOvershoot.toFixed(2)})`;
  }

  return { adjustment: adj, avgOvershoot, reason };
}

// ═══════════════════════════════════════════════════════════════
// VARA FEEDBACK LOOP
// ═══════════════════════════════════════════════════════════════

/**
 * Analyze recent Vara data for session-level calibration
 */
function varaFeedback(recentSets) {
  const withVara = recentSets.filter(
    (s) => s.actualVx !== null && s.actualVx !== undefined &&
           s.targetVx !== null && s.targetVx !== undefined
  );
  if (withVara.length < 3) return { suggestion: null, type: null };

  const last3 = withVara.slice(-3);
  const allTooEasy = last3.every((s) => s.actualVx > s.targetVx + 1);
  const tooHard = last3.filter((s) => s.actualVx < s.targetVx - 1).length >= 2;

  if (allTooEasy) {
    return { suggestion: "Kuorma liian kevyt, harkitse +1-2 kg", type: "too_easy" };
  }
  if (tooHard) {
    return { suggestion: "Kuorma liian raskas, harkitse -1-2 kg", type: "too_hard" };
  }
  return { suggestion: null, type: null };
}

/**
 * Compute Vara trend correction for recommend().
 * Asymmetric: more aggressive UP when crushing (acceleration mode),
 * conservative DOWN when struggling (safety).
 *
 * meanOvr > 0 ⇒ sarjat olivat helpompia kuin target (target-Vx > actual-Vx väärin päin? ei)
 * meanOvr = targetVx - actualVx; actualVx > targetVx ⇒ meanOvr < 0 ⇒ TOO EASY (crushed)
 * actualVx < targetVx ⇒ meanOvr > 0 ⇒ TOO HARD (struggled)
 *
 * Convention in this codebase (varaFeedback etc.): if actualVx > targetVx, set is "easier than target"
 * because more reps in reserve means less effort. overshoot here = target - actual, so:
 *   meanOvr < 0 (actual > target) = crushed → ACCELERATE (+)
 *   meanOvr > 0 (actual < target) = struggled → HOLD BACK (-)
 */
function varaTrendCorrection(recentTopSets, opts = {}) {
  const maxUp = opts.maxUp ?? 0.035;   // aggressive acceleration
  const maxDown = opts.maxDown ?? 0.020; // conservative hold-back
  const withVara = recentTopSets.filter(
    (s) => s.actualVx !== null && s.targetVx !== null
  ).slice(-6);
  if (withVara.length < 4) return 0;

  // v4.32.8 (Phase 1 -tutkimuslöydös): straight-set-protokollissa Vx vaihtelee
  // freshness-akselilla (esim. sarja 1 V5 fresh → sarja 5 V1 cumulative).
  // Pelkkä mean overshoot voi johtaa harhaan jos sarjat raportoidaan ramp-pattern:nä
  // (V5, V4, V2, V1, V0 → mean = -0.4 mutta sarja 5 V0 = liian raskas).
  //
  // v4.34.34 BUG 2 (c) — DUAL-SIGNAL-PAINOTUS: ekka sarja per-sessio = "kapasiteetti-
  // mittari" (fresh start → kuinka helposti kuorma lähtee), viim. sarja = "väsymys-
  // mittari" (sessio loppuun → riitti voima). Aiempi pelkkä viim.-sarja-painotus
  // (2.0× viim, 1.5× 2.viim, 1.0× muut) sokaisi ekan sarjan V5-helppouden:
  // jos atletti teki 125×6 V5 ekan ja V1 viim. sarjan, mean ≈ V3 = target → ei
  // bonusta. Mutta ekka V5 fresh = tankokuorma 18 % aliarvioitu vrt. kapasiteetti.
  //
  // Uusi painotus (per-sessio-tietoinen):
  //   - viim. session ekka sarja = 1.8× (kapasiteetti-signaali)
  //   - viim. session viim. sarja = 1.8× (väsymys-signaali)
  //   - viim. session muut = 1.2×
  //   - aiempien sessioiden sarjat = 1.0×
  //
  // crushingStreak -säännös: tarkista että viim. 3 sarjaa overall ovat crushed.
  const overshoots = withVara.map((s) => s.targetVx - s.actualVx);

  // Tunnista viim. session sarjat (sessionId-pohjainen, viim. sarjojen blokki)
  const lastSessId = withVara[withVara.length - 1]?.sessionId ?? null;
  const lastSessIndices = lastSessId
    ? withVara.map((s, i) => s.sessionId === lastSessId ? i : -1).filter(i => i >= 0)
    : [];
  const lastSessFirstIdx = lastSessIndices.length > 0 ? lastSessIndices[0] : -1;
  const lastSessLastIdx = lastSessIndices.length > 0 ? lastSessIndices[lastSessIndices.length - 1] : -1;

  const weights = withVara.map((s, i) => {
    if (s.sessionId !== lastSessId) return 1.0;
    if (i === lastSessFirstIdx && i === lastSessLastIdx) return 1.8; // single-set session
    if (i === lastSessFirstIdx) return 1.8; // ekka sarja = kapasiteetti
    if (i === lastSessLastIdx) return 1.8;  // viim. sarja = väsymys
    return 1.2;
  });
  const weightedSum = overshoots.reduce((acc, ovr, i) => acc + ovr * weights[i], 0);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const weightedMeanOvr = weightedSum / totalWeight;

  // V0 missä tahansa viim. 3 sarjassa = "warning" — älä accelerate
  const last3HasFailure = withVara.slice(-3).some(s => s.actualVx === 0);

  // Consecutive crushing: viim. 3 sarjaa kaikki crushed (actualVx >= targetVx+1)
  const last3 = withVara.slice(-3);
  const crushingStreak = last3.length === 3 && last3.every(s => (s.actualVx - s.targetVx) >= 1);

  if (weightedMeanOvr < -0.5 && !last3HasFailure) {
    // Crushed (painotettu): accelerate. Mutta EI accelerate jos viim. sarjoissa V0.
    const base = clamp(Math.abs(weightedMeanOvr) * 0.015, 0, maxUp);
    const bonus = crushingStreak ? 0.010 : 0;
    return Math.min(base + bonus, maxUp);
  }
  if (weightedMeanOvr > 0.5 || last3HasFailure) {
    // Struggled (painotettu) tai viim. sarjoissa V0: hold back.
    // V0 viim. sarjoissa override aina hold-backiksi vaikka mean olisi kurssassa.
    const adjustment = last3HasFailure ? -0.015 : clamp(-weightedMeanOvr * 0.008, -maxDown, 0);
    return Math.max(adjustment, -maxDown);
  }
  return 0;
}

/**
 * v4.34.41 — INTRA-SESSION LOAD ADJUST.
 *
 * Käyttäjäpalaute 2026-05-07: "Jos teen ekan sarjan 57.5 kg V5 (target V3),
 * fixaako engine kuorman heti sopivammaksi jotta saan oikean ärsykkeen?".
 *
 * Tämä on intra-session-version FIRST_SET_CAPACITY_BONUS:ista (joka koski vain
 * NEXT-session-targetia). Aiempi vaihtoehto B+C ei korjannut kuormaa kesken
 * session — atletti jatkoi alkuperäisellä template-kuormalla vaikka ekka V5
 * fresh osoitti kuorman olevan alle kapasiteetin.
 *
 * Logiikka:
 *   - vain heavy-day primary-sarjoille (ei volume, ei accessory, ei back-off)
 *   - vain ekka työsarja (sarja 1)
 *   - vaatii overshoot >= +2 luokkaa (V5 vs V3 target = +2)
 *   - bonus: clamp((overshoot - 1) × 0.025, 0.025, 0.05) → +2.5-5 %
 *     - overshoot 2: +2.5 % (= V5 vs V3)
 *     - overshoot 3: +5.0 % cap (= V6 vs V3)
 *
 * Freshness-suoja: bonus on KONSERVATIIVINEN (max +5 %) koska ekka V5 fresh
 * ei tarkoita että kuorma kesti V3:ssa kaikissa sarjoissa. Atletti saa
 * oikean ärsykkeen ilman riskittömää grindi-kierrettä.
 *
 * Returns: { shouldAdjust, suggestedLoadKg, bumpKg, bumpPct, reason } tai null.
 */
function intraSessionLoadAdjustSuggestion(opts = {}) {
  const {
    firstSetVx, targetVx, currentLoadKg,
    isPrimary = false, dayType = null, setRole = null
  } = opts;
  // Suojat: vain primary-top-sarja heavy-päivänä
  if (!isPrimary || dayType !== "heavy" || setRole !== "top") return null;
  if (firstSetVx === null || firstSetVx === undefined) return null;
  if (targetVx === null || targetVx === undefined) return null;
  if (!currentLoadKg || currentLoadKg <= 0) return null;
  const overshoot = firstSetVx - targetVx;
  if (overshoot < 2) return null; // tarvitaan +2 luokkaa = V5 vs V3 minimi
  const bonus = clamp((overshoot - 1) * 0.025, 0.025, 0.05);
  const newLoad = roundToHalf(currentLoadKg * (1 + bonus));
  const bumpKg = newLoad - currentLoadKg;
  if (bumpKg <= 0) return null; // pyöristys-edge: ei kasvata
  return {
    shouldAdjust: true,
    suggestedLoadKg: newLoad,
    bumpKg,
    bumpPct: bonus * 100,
    reason: `Ekka V${firstSetVx} target V${targetVx}:llä (+${overshoot} luokkaa) — fresh-V kapasiteetti-signaali, +${(bonus*100).toFixed(1)} % seuraaviin sarjoihin`,
  };
}

/**
 * v4.34.34 BUG 2 (b) — FIRST-SET CAPACITY BONUS.
 *
 * Käyttäjäpalaute: "ekassa sarjassa V5-helppous (= 2 sarjaa varaa) ei johda
 * mihinkään, ja backoff-progressio kasvaa +1 kg vaikka V6-headroomia oli paljon".
 * Engine ei ennen tätä versiota tunnistanut ekan-sarjan-fresh-V5 -tilannetta
 * erikseen — se sulautui keskimääräiseen Vx-trendiin.
 *
 * Tämä bonus aktivoituu kun viim. session **ekka työsarja** oli ≥2 luokkaa
 * helpompi kuin target (esim. target V3, actual V5+). Fresh-startin V5+ on
 * vahva kapasiteetti-signaali: target-kuorma oli aliarvioitu, atletti pystyi
 * vähintään +5 %:iin samalla Vx:llä.
 *
 * Bonus: +1.0 % loadPct:hen (= ~+1.5-2 kg primary-liikkeessä). Kerrostuu
 * varaTrendCorrection:n päälle, mutta capatataan +1.5 % maksimiin tämän
 * lähteen osalta. Aktivoituu vain non-cal sessioista, non-deload-päiviin.
 *
 * @param {Array} recentTopSets — sets in chronological order (asc)
 * @param {Object} opts — { maxBonus: 0.015 (default), minOvershoot: 2 }
 * @returns {number} — 0 to maxBonus (kerroin loadPct:hen)
 */
function firstSetCapacityBonus(recentTopSets, opts = {}) {
  const maxBonus = opts.maxBonus ?? 0.015;
  const minOvershoot = opts.minOvershoot ?? 2;
  if (!recentTopSets || recentTopSets.length === 0) return 0;

  // Etsi viim. session sarjat
  const lastSessId = recentTopSets[recentTopSets.length - 1]?.sessionId;
  if (!lastSessId) return 0;
  const lastSessSets = recentTopSets.filter(s => s.sessionId === lastSessId);
  if (lastSessSets.length === 0) return 0;

  // Skippaa cal-dominantit sessiot — cal on tarkoituksella matalampi
  const calCount = lastSessSets.filter(s => s.setRole === "calibration").length;
  if (calCount >= lastSessSets.length * 0.5) return 0;

  // Ekka työsarja (filtteröi calit pois jos sekoittuu)
  const firstWorkSet = lastSessSets.find(s => s.setRole !== "calibration") || lastSessSets[0];
  if (!firstWorkSet || firstWorkSet.actualVx === null || firstWorkSet.targetVx === null) return 0;

  const overshoot = firstWorkSet.actualVx - firstWorkSet.targetVx;
  if (overshoot < minOvershoot) return 0;

  // +1.0 % per Vx-luokka yli minOvershoot:n, capattuna maxBonukseen
  // overshoot=2 → 1.0 %, overshoot=3 → 1.5 % (cap)
  return clamp((overshoot - minOvershoot + 1) * 0.010, 0, maxBonus);
}

/**
 * Gross-mismatch correction: when the prescribed load is FAR off from
 * the athlete's true capacity (overshoot ≥ 1.5 reps consistently), the
 * normal ±3.5% cap is too slow. This mechanism escalates to up to +8%
 * per session when the mismatch is severe AND persistent (2+ sessions).
 *
 * Guard rails: requires 4+ recent top sets, mean overshoot ≤ -1.5
 * (actualVx ≥ targetVx + 1.5 on average), and at least 2 sessions worth.
 */
function grossMismatchCorrection(recentTopSets) {
  const withVara = recentTopSets.filter(
    (s) => s.actualVx !== null && s.targetVx !== null
  ).slice(-8);
  if (withVara.length < 4) return 0;

  const overshoots = withVara.map((s) => s.targetVx - s.actualVx);
  const meanOvr = avg(overshoots);

  // Require sustained large mismatch: mean overshoot ≥ 1.5 (target - actual ≤ -1.5)
  if (meanOvr > -1.5) return 0;

  // Require that ALL recent sets show ≥ 1 overshoot (no outliers)
  const allOvershoot = withVara.every(s => (s.actualVx - s.targetVx) >= 1);
  if (!allOvershoot) return 0;

  // Scale: −1.5 → +5 %, −2.0 → +6.5 %, −2.5+ → +8 %
  const magnitude = Math.abs(meanOvr);
  return clamp((magnitude - 1.5) * 0.030 + 0.050, 0.050, 0.080);
}

/**
 * e1RM momentum bonus: if recent e1RM shows a PR trend,
 * add additional deltaPct to accelerate future sessions.
 *
 * Trigger: latest e1RM >= 1.02 × max(previous 3 e1RMs)
 *   AND 3+ consecutive sessions with rising e1RM.
 * Bonus: +0.5–1.5% depending on magnitude.
 */
function e1rmMomentumBonus(e1rmHistory, maxBonus = 0.015) {
  if (!e1rmHistory || e1rmHistory.length < 4) return 0;
  const recent = e1rmHistory.slice(-4).map(h => h.e1rm).filter(v => v != null);
  if (recent.length < 4) return 0;

  const [a, b, c, latest] = recent;
  const priorMax = Math.max(a, b, c);
  if (priorMax <= 0) return 0;

  const pctJump = (latest - priorMax) / priorMax;
  const rising = (b > a) && (c > b) && (latest > c);

  if (pctJump >= 0.02 && rising) {
    // Scale linearly: 2% jump → 0.5%, 5% jump → 1.5%
    return clamp(pctJump * 0.30, 0.005, maxBonus);
  }
  return 0;
}

// ═══════════════════════════════════════════════════════════════
// RETURN FROM BREAK
// ═══════════════════════════════════════════════════════════════

function breakAnalysis(lastSessionDateISO, todayDateISO) {
  if (!lastSessionDateISO) return { breakDays: null, modifier: 0, forcedDayType: null, message: null };

  const last = new Date(lastSessionDateISO);
  const today = new Date(todayDateISO || todayISO());
  const breakDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));

  if (breakDays < 7) return { breakDays, modifier: 0, forcedDayType: null, message: null };

  if (breakDays < 14) {
    return {
      breakDays,
      modifier: -0.05,
      forcedDayType: null,
      message: "Viikon tauko — aloitetaan hieman kevyemmin",
    };
  }
  if (breakDays < 28) {
    return {
      breakDays,
      modifier: -0.10,
      forcedDayType: "volume",
      message: "2 viikon tauko — volume-päivä ensin",
    };
  }
  return {
    breakDays,
    modifier: -0.15,
    forcedDayType: "volume",
    message: "Pitkä tauko — aloitetaan konservatiivisesti, 1-2 viikossa normaaliin",
  };
}

// ═══════════════════════════════════════════════════════════════
// H-016 (2026-06-12): LIIKE-TASON PALUURAMPPI (movement reload)
// ═══════════════════════════════════════════════════════════════
// Globaali breakAnalysis (yllä) toimii koko-treenin granulariteetilla — se EI
// laukea kun muu treeni jatkuu ja vain yksi liike on tauolla/korvattuna
// (H-015 §7 A1-kartta + H-016 VAIHE A). Tämä kerros tunnistaa LIIKKEEN tauon
// ja preskriptoi kevennetyn paluun + lineaarisen toteuma-ankkuroidun rampin.
//
// Ratifioidut säännöt (H-016 §6, Akseli 2026-06-12):
//   §6.1 min-precedence: konservatiivisin target voittaa, kevennyksiä EI
//        kumuloida; TÄYSIN erillään mesocycleBreakReset-polusta.
//   §6.2 v1 = pääliikeketju (integraatio targetExternalLoad-tasolla ennen
//        sessionEffectiveE1RM:ää → back-off/secondary seuraavat ilmaiseksi;
//        accessoryt ja cal-slotit ULOS v1:stä).
//   §6.3 lineaarinen ramppi toteumasta tauon-edeltävään ~2 vk:ssa
//        (RELOAD_CONFIG.rampSessions); skipattu paluusessio pysäyttää portaan
//        (toteuma-ankkurointi = mekaaninen kipu-gate, ei kuittauskitkaa).
//   A3-ankkuri: VAIN oikeat työsarjat (setRole "top" + externalLoadKg > 0) —
//        BW 0 kg -kirjaukset eivät kelpaa (VAIHE A -löydös: dippi-ansa).
//
// EVIDENSSI (R1 §2.5, KOHTALAINEN — käytäntösynteesi, EI RCT-protokolla):
// reloadPct-matriisi (tauon kesto × korvaava-liike-olemassa) ja ramppinopeus
// ovat konfiguroitavia oletuksia, eivät tutkimustotuuksia. Kipu-gate on
// kliininen periaate (R1 §2.3). Reunaehto (b): kaikki staattisia — ei opita.
const RELOAD_CONFIG = {
  thresholdDays: 14,   // sama kynnys kuin paluubannerilla — yksi käsite käyttäjälle
  table: [
    // 14–27 pv ≈ "2–3 vk" -solu; ≥28 pv = pitkä tauko
    { minDays: 14, maxDays: 27, withReplacement: 0.125, noReplacement: 0.15 },
    { minDays: 28, maxDays: Infinity, withReplacement: 0.15, noReplacement: 0.20 },
  ],
  vaivaFloorPct: 0.15, // A5: vaiva-syytagi → vähintään konservatiivinen pää
  rampSessions: 3,     // 1. paluusessio + 2 porrasta ≈ ~2 vk tyypillisellä frekvenssillä
};

// Palauttaa null (ei taukoa / ei ankkuria / ramppi valmis) tai
// { targetKg, breakDays, reloadPct, anchorKg, reason, hadReplacement,
//   phase: "first-return"|"ramp", step, stepsTotal }.
// READ-ONLY datalle; kutsuja päättää applioinnista (min-precedence).
function computeMovementReload(allSets, movementName, movementId, mesocycle, dateISO) {
  if (!movementId || !Array.isArray(allSets) || !dateISO) return null;
  // A3-ankkurisetit: oikeat työsarjat aikajärjestyksessä
  const workTops = allSets
    .filter(s => s.movementId === movementId && s.setRole === "top"
      && (s.externalLoadKg || 0) > 0 && s.reps != null && s.timestamp)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (!workTops.length) return null; // uusi liike — ei reload-ankkuria
  const now = new Date(dateISO).getTime();
  const dayMs = 86400000;
  // Etsi viimeisin TAUKO-raja: käy sessiot lopusta ja löydä ≥ threshold -gap.
  // Sessiokohtaiset ryhmät (sessionId) aikajärjestyksessä:
  const sessOrder = [];
  const bySess = new Map();
  for (const s of workTops) {
    if (!bySess.has(s.sessionId)) { bySess.set(s.sessionId, []); sessOrder.push(s.sessionId); }
    bySess.get(s.sessionId).push(s);
  }
  const sessTimes = sessOrder.map(id => {
    const sets = bySess.get(id);
    const med = sets.map(x => x.externalLoadKg).sort((a, b) => a - b)[Math.floor(sets.length / 2)];
    return { id, t: new Date(sets[sets.length - 1].timestamp).getTime(), medianLoad: med };
  });
  const lastSess = sessTimes[sessTimes.length - 1];
  const gapNowDays = Math.floor((now - lastSess.t) / dayMs);
  // Tauko-rajan haku: viimeisin sessioväli jonka gap ≥ threshold, tai gap nykyhetkeen
  let breakIdx = -1; // sessTimes-indeksi: tauon JÄLKEISEN ensimmäisen session indeksi
  for (let i = sessTimes.length - 1; i >= 1; i--) {
    const gap = Math.floor((sessTimes[i].t - sessTimes[i - 1].t) / dayMs);
    if (gap >= RELOAD_CONFIG.thresholdDays) { breakIdx = i; break; }
  }
  // Substituutiojakso + K2-syy (rakenteellinen lähde ensisijainen; skip-tagi sekundäärinen)
  const sub = mesocycle?.movementSubstitutions?.[movementName] || null;
  let reason = sub?.reason || null;
  if (!reason) {
    // Sekundäärinen: tauko-ikkunan skip-settien exerciseNote "[skip: vaiva]"
    const windowStart = breakIdx >= 0 ? sessTimes[breakIdx - 1].t : lastSess.t;
    const vaivaSkip = allSets.some(s => s.movementId === movementId && s.setRole === "skipped"
      && s.timestamp && new Date(s.timestamp).getTime() >= windowStart
      && /\[skip: vaiva\]/.test(s.exerciseNote || ""));
    if (vaivaSkip) reason = "vaiva";
  }
  const hadReplacement = !!(sub && sub.replacementName);
  const pctFor = (days) => {
    const row = RELOAD_CONFIG.table.find(r => days >= r.minDays && days <= r.maxDays);
    if (!row) return null;
    let pct = hadReplacement ? row.withReplacement : row.noReplacement;
    if (reason === "vaiva") pct = Math.max(pct, RELOAD_CONFIG.vaivaFloorPct); // A5
    return pct;
  };
  // TILA 1: tauko käynnissä NYT (gap nykyhetkeen ≥ threshold) → 1. paluusessio
  if (gapNowDays >= RELOAD_CONFIG.thresholdDays) {
    const reloadPct = pctFor(gapNowDays);
    if (reloadPct === null) return null;
    const anchorKg = lastSess.medianLoad; // tauon-edeltävä työkuorma (A3)
    return {
      targetKg: anchorKg * (1 - reloadPct), breakDays: gapNowDays, reloadPct,
      anchorKg, reason, hadReplacement, phase: "first-return",
      step: 1, stepsTotal: RELOAD_CONFIG.rampSessions,
    };
  }
  // TILA 2: ramppi käynnissä — tauko löytyi historiasta ja paluusessioita on
  // tehty vähemmän kuin rampSessions → seuraava porras TOTEUMASTA (§6.3).
  if (breakIdx >= 0) {
    // OBS-052 KERROS 2: tuore CAL paluujaksolla = re-entry-testi (luotettavin signaali,
    // DiStasio ±2.7 kg) → OHITTAA break-rampin. Jos atletti on kalibroinut tauon JÄLKEEN,
    // hän on jo mitannut nykykapasiteetin → graduaali ramppi (kohti vanhaa tauon-edeltävää
    // kuormaa) on väärä ja sekoittava; cal ajaa (KERROS 1) ja normaali progressio jatkuu.
    // Liike-agnostinen. Reunaehto: ei avaa velocity-raakaa — vain cal-setRole ohittaa.
    // Vertaa cal-aikaleimaa tauon-EDELTÄVÄN session aikaan (preBreak): kattaa myös cal-ONLY-
    // paluusession (jossa ei top-sarjaa → ei sessTimes:issä). preBreak < cal (vaikka cal tehdään
    // sessiossa ennen topeja, se on silti tauon jälkeen) → robusti molemmille.
    const preBreakTime = sessTimes[breakIdx - 1].t;
    const hasCalSinceBreak = allSets.some(s => s.movementId === movementId
      && s.setRole === "calibration" && s.timestamp
      && new Date(s.timestamp).getTime() > preBreakTime);
    if (hasCalSinceBreak) return null; // cal re-entry → ei rampppia, cal-ajava progressio
    const returnSessions = sessTimes.length - breakIdx; // tauon jälkeen toteutuneet
    if (returnSessions < RELOAD_CONFIG.rampSessions) {
      const anchorKg = sessTimes[breakIdx - 1].medianLoad; // tauon-edeltävä
      const prevActual = lastSess.medianLoad;               // toteuma-ankkuri
      const stepsLeft = RELOAD_CONFIG.rampSessions - returnSessions;
      const targetKg = Math.min(anchorKg, prevActual + (anchorKg - prevActual) / stepsLeft);
      const breakDays = Math.floor((sessTimes[breakIdx].t - sessTimes[breakIdx - 1].t) / dayMs);
      const reloadPct = pctFor(breakDays);
      return {
        targetKg, breakDays, reloadPct, anchorKg, reason, hadReplacement,
        phase: "ramp", step: returnSessions + 1, stepsTotal: RELOAD_CONFIG.rampSessions,
      };
    }
  }
  return null; // ei taukoa / ramppi valmis → normaali progressio
}

/**
 * Check if mesocycle needs reset after break
 */
function mesocycleBreakReset(mesocycle, skippedWeeks) {
  if (skippedWeeks >= 2) {
    return { reset: true, reason: "2+ viikkoa skipattiin → mesosykli nollattu viikkoon 1" };
  }
  return { reset: false, reason: null };
}

// ═══════════════════════════════════════════════════════════════
// FAILURE REACTION
// ═══════════════════════════════════════════════════════════════

// v4.32.8: failureReaction nyt block-aware. Vaiheen 1 syvätutkimuksen löydös
// (ChatGPT + Claude + Refalo 2023):
//   Foundation: Strategia A — säilytä kuorma, kirjaa V0, kevennä ENSI VIIKOLLE.
//                Failure-protokolla EI kuulu foundation-blokkiin (24-48h recovery).
//   Strength:   Strategia B — laske 5% seuraavaan sarjaan. Strength sietää failure-
//                stimuluksen mutta loput sarjat tarvitsevat alennetun kuorman.
//   Intensity:  Strategia C — lopeta liike (2-failure rule, Tuchscherer RTS).
//                Intensity-V0 = CNS-signaali, säilytä recovery seuraaville päiville.
//   Peaking:    Strategia C — lopeta liike. Peaking-V0 = punainen lippu.
//
// v4.34.25: ISOLATION-HAARA (käyttäjäpalaute 2026-05-04). RP/Israetel/Helms/
// Schoenfeld -konsensus: isolation-liikkeen viimeinen sarja saa ja tyypillisesti
// pitäisi mennä lähelle failurea (V0-V1) hypertrofian takia. Engine ei saa kohdella
// tätä samalla logiikalla kuin compound-primary-V0:aa (Lisäpainoleuanveto, kyykky,
// dippi). Käyttäjän hauiskääntö-esimerkki: 3×12 × 16 kg V3/V2/V0 tauoilla 1 min →
// engine laukaisi -2.5% ensi viikolle, joka on yli-suojaava. Engine = valmentaja,
// ei nanny. Isolation last-set V0 EI laukaise nextWeekLoadAdjustia. Mid-set V0
// (sarjaa ennen viimeistä) johtaa -5% loppusarjoihin mutta ei ensi vk:n kevennystä.
//
// Block-aware-parametri valinnainen — vanhat kutsut (ilman blockPhase) saavat
// legacy-Strategia-B:n (5% drop) yhteensopivuuden vuoksi.
// Opts-parametri valinnainen: { isIsolation: bool, isLastSet: bool, failureCause: string }.

// K7-4 (valmentaja-linssi): MUSCLE-UP ON TAITOLIIKE. Failure-syyn skill-luokat kantavat
// spesifin regressio-drillin — valmentaja NÄKEE että veto nousi mutta ranne ei kääntynyt;
// engine näki ennen vain V0:n. Drillit ovat ohjaustekstiä (ei ohjelmamutaatiota v1:ssä):
// atletti tekee drillin lämmittelyissä/skill-blokissa omalla päätöksellään.
const MU_SKILL_REGRESSIONS = Object.freeze({
  "veto-korkeus": {
    label: "vetokorkeus ei riitä",
    drill: "Räjähtävä leuka rintaan 3×3 (kevyt lisäpaino) + high pull tangon yli -intentio. Kuorma-MU:ta vasta kun BW-veto nousee rinnan alaosaan.",
  },
  "transitio": {
    label: "transitio (ranteen kääntö) hajoaa",
    drill: "Band-assisted MU 3×3 hitaalla transitiolla + false grip -roikunta 2×20 s. Transitio on taito — tee tuoreena, ei väsyneenä.",
  },
  "dippi-ulostyonto": {
    label: "dippi-ulostyöntö jää vajaaksi",
    drill: "Korkea tanko-dippi (MU-lopetusasennosta) 3×3 + pause-dippi pohjalla. Ulostyöntövoima rakennetaan dippiliikkeillä.",
  },
});

function failureReaction(currentLoadKg, targetReps, isPrimary, consecutiveFailures, blockPhase = null, opts = {}) {
  // K7-3 (valmentaja-linssi, 2026-07-05): FAILURE-SYYN EROTTELU. Tekninen failure,
  // voimafailure, kipufailure ja otefailure saivat aiemmin saman −5 %-reseptin —
  // valmentaja reagoi näihin täysin eri tavoin. opts.failureCause (atletin yhden
  // napautuksen raportti) ohittaa kuormaheuristiikan, koska se on ground truth:
  //   "tekniikka"  → kuorma SÄILYY (voima ei loppunut), ei ensi viikon säätöä; ohje
  //                  keskittyä suoritukseen tai keventää itse tekniikkasyistä.
  //   "kipu"       → STOP liike heti + korvaus/skip-ohjaus (H-015-flow); EI kuorma-
  //                  rangaistusta ensi viikolle (kipu ≠ voimatason muutos).
  //   "ote"        → kuorma säilyy, vihje ote-/magnesiumratkaisuihin; ei säätöä.
  //   "voima" / ei raportoitu → nykyinen tutkimuspohjainen ketju (Refalo/blokit).
  // K7-4 (MU-skill): muscle-up-perheen skill-syyt käyttäytyvät kuten "tekniikka"
  // mutta kantavat spesifin regressio-drillin viestissä (MU_SKILL_REGRESSIONS).
  const _fc = opts.failureCause || null;
  if (_fc && _fc !== "voima") {
    if (_fc === "kipu") {
      return {
        nextSetLoad: currentLoadKg, nextSetReps: targetReps, shouldStop: true,
        strategy: "PAIN",
        message: "Kipu-failure → lopeta tämä liike tänään. Korvaa liike (🔄) tai skippaa — kipu ei ole voimafailure, joten ensi viikon kuormaan ei kosketa. Jos kipu toistuu, merkitse vaiva-tagi korvauksen yhteydessä.",
        nextWeekLoadAdjust: 0, promptSubstitution: true,
      };
    }
    if (_fc === "ote") {
      return {
        nextSetLoad: currentLoadKg, nextSetReps: targetReps, shouldStop: false,
        strategy: "GRIP",
        message: "Ote petti (ei voima) → kuorma säilyy. Magnesium/vetoremmit tai lyhyempi lepo otteelle — ensi viikon kuormaan ei kosketa.",
        nextWeekLoadAdjust: 0,
      };
    }
    // "tekniikka" + MU-skill-syyt (veto-korkeus / transitio / dippi-ulostyöntö)
    const _drill = MU_SKILL_REGRESSIONS[_fc] || null;
    return {
      nextSetLoad: currentLoadKg, nextSetReps: targetReps, shouldStop: false,
      strategy: _drill ? "SKILL" : "TECH",
      message: _drill
        ? `Skill-failure (${_drill.label}) → kuorma säilyy, voima ei loppunut. Drilli: ${_drill.drill}`
        : "Tekniikka petti (ei voima) → kuorma säilyy. Keskity suoritukseen; kevennä itse jos tekniikka vaatii. Ei ensi viikon säätöä.",
      nextWeekLoadAdjust: 0, skillCause: _fc,
    };
  }
  // v4.34.25: Isolation-haara — etusija block-aware-logiikan EDESSÄ koska isolation-
  // luokitus pätee kaikissa blokeissa (foundation/strength/intensity/peaking).
  // v4.34.28: Multi-set V0 -tunnistus (cowork-audit kohta 4.4 vaihtoehto c).
  // opts.previousSetVxs = [V0, V0, V0] → kun 2+ peräkkäistä V0 isolaatiossa,
  // ISO-NORMAL palauttaa lisäkentässä warning. Engine ei pakota mitään, mutta
  // atleetti näkee soft-varoituksen "kuorma todennäköisesti liian raskas tällä
  // kertaa". Ei nanny — atleetin valinta säilyy.
  if (opts.isIsolation === true && !isPrimary) {
    const prevVxs = Array.isArray(opts.previousSetVxs) ? opts.previousSetVxs : [];
    const consecutiveV0Count = prevVxs.filter(v => v === 0).length + 1; // +1 = nyt V0
    const multiSetV0Warning = consecutiveV0Count >= 2
      ? `⚠ ${consecutiveV0Count}/${prevVxs.length + 1} sarjaa V0 — kuorma todennäköisesti liian raskas tällä kerralla. Harkitse -2.5 kg seuraavalle sessiolle (atleetin valinta).`
      : null;
    if (opts.isLastSet === true) {
      // Hypertrofian normaali stimulus — ei kevennystä, sarja loppuu joka tapauksessa
      const baseMessage = "Isolation last-set V0 = OK · normaali hypertrofia-stimulus · ei kevennystä";
      return {
        nextSetLoad: currentLoadKg,
        nextSetReps: targetReps,
        shouldStop: true,  // viim. sarja, ei jatkettavaa
        strategy: "ISO-NORMAL",
        message: multiSetV0Warning
          ? `${baseMessage}\n${multiSetV0Warning}`
          : baseMessage,
        warning: multiSetV0Warning,  // erillinen kenttä UI:lle (banner-render)
        nextWeekLoadAdjust: 0,
      };
    }
    // Mid-set V0 isolaatiossa = liian aggressiivinen kuorma TÄLLÄ kerralla
    return {
      nextSetLoad: roundToHalf(currentLoadKg * 0.95),
      nextSetReps: targetReps,
      shouldStop: false,
      strategy: "ISO-MID",
      message: `Isolation V0 ennen viim. sarjaa → -5% loppusarjoihin (${roundToHalf(currentLoadKg * 0.95)} kg) · ei muutosta ensi vk:lle`,
      warning: multiSetV0Warning,
      nextWeekLoadAdjust: 0,
    };
  }

  // Block-aware reactions (v4.32.8)
  // K3-3 D1-v2 (retro-kenttä OBS-G): V0 → jäljellä olevat sarjat -5 % KAIKISSA blokeissa
  // (Refalo 2023, tutkimusinvariantti). Strategia A/C:n ydin säilyy (stop-suositus +
  // ensi viikon säätö), mutta JOS atletti jatkaa stop-suosituksesta huolimatta
  // (kenttäcase: 165×3 V0 → seuraava sarja ei keventynyt), loput sarjat eivät saa
  // toistaa kuormaa joka juuri vietiin failureen. Vain alaspäin.
  if (blockPhase === "foundation") {
    const nextLoad = roundToHalf(currentLoadKg * 0.95);
    return {
      nextSetLoad: nextLoad,  // K3-3: -5% jos jatketaan (oli: säilytä kuorma)
      nextSetReps: isPrimary ? Math.max(targetReps - 1, 1) : targetReps,
      shouldStop: consecutiveFailures >= 1,  // 1× V0 foundationissa = stop, EI sallita 2x
      strategy: "A",
      message: consecutiveFailures >= 1
        ? `Foundation V0 → lopeta liike. Foundation EI ole failure-protokolla. Jos jatkat: ${nextLoad} kg (-5 %). Ensi viikolla -2.5 kg.`
        : `Foundation V0 → loput sarjat ${nextLoad} kg (-5 %). Ensi viikolla -2.5 kg.`,
      nextWeekLoadAdjust: -0.025,
    };
  }
  if (blockPhase === "intensity" || blockPhase === "peaking") {
    return {
      nextSetLoad: roundToHalf(currentLoadKg * 0.95),  // K3-3: jos jatketaan stopista huolimatta, kevyempänä
      nextSetReps: 0,
      shouldStop: true,             // Strategia C — lopeta heti
      strategy: "C",
      message: blockPhase === "peaking"
        ? "Peaking V0 → STOP. CNS säilytetään kisaa varten. Älä jatka."
        : "Intensity V0 → STOP liike. 2-failure rule (Tuchscherer RTS). Recovery seuraavalle päivälle.",
      nextWeekLoadAdjust: blockPhase === "peaking" ? 0 : -0.05,
    };
  }
  // Strength (default) — Strategia B (5% drop)
  const nextSetLoad = roundToHalf(currentLoadKg * 0.95);  // v4.32.8: 10% → 5% (Refalo 2023)
  const nextSetReps = isPrimary ? Math.max(targetReps - 1, 1) : targetReps;
  if (consecutiveFailures >= 2) {
    return {
      nextSetLoad,
      nextSetReps,
      shouldStop: true,
      strategy: "B",
      message: "2× failure strengthissä — lopeta liike, palautuminen primaryksi.",
      nextWeekLoadAdjust: -0.05,
    };
  }
  return {
    nextSetLoad,
    nextSetReps,
    shouldStop: false,
    strategy: "B",
    message: `Strength V0 → seuraava sarja ${nextSetLoad} kg (-5%, Refalo 2023).`,
    nextWeekLoadAdjust: 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// ACCESSORY PROGRESSION LOGIC
// ═══════════════════════════════════════════════════════════════

function accessoryProgression(progress, isLowerBody = false) {
  if (!progress) return { action: "hold", suggestedLoad: null, reason: "Ei progressiodataa" };

  const increment = isLowerBody ? 5 : 2.5;

  // v4.34.36 BUG-FIX C: Vx-overshoot-aware progressio. Aiempi algoritmi käytti
  // VAIN consecutiveTargetMetSessions-laskuria (tarvitaan 2 peräkkäistä target met
  // -sessiota +5 kg:lle). Tämä jätti huomiotta että V5 vs target V3 = 2 luokkaa
  // helpompi → atletti pystyi paljon enemmän kuormaa, mutta engine sanoi "hold"
  // koska consecutive=1.
  //
  // Käyttäjäpalaute: "Tukiliikkeiden hold ei voi olla optimaalinen jos
  // edellisellä viikolla mennyt esim. V3 ja nyt pidettäisiin samassa painossa".
  //
  // Uusi logiikka:
  //   V0 (failure): −increment (kevennä, ei luota progressioon)
  //   sub-target (V_actual < V_target): hold (ei nostaa, ei laskeaa V1-V2:lla)
  //   target met (V_actual == V_target): consecutive>=2 → +increment, muuten hold
  //   overshoot +1: +increment (ei vaadi consecutive=2 — fresh signal riittää)
  //   overshoot +2: +1.5× increment (selvä yli-kapasiteetti)
  //   overshoot +3+: +2× increment (kuorma reilusti aliarvioitu)
  //
  // V0 hold-back nojaa hadFailureLastSession + FAILURE_LOCKOUT primary-haaralle;
  // accessoryllä menetelmä simulee saman tason käyttäen progress.lastMinVx-arvoa.
  const lastVxOvershoot = progress.lastVxOvershoot ?? null; // mean(actualVx) − targetVx
  const lastMinVx = progress.lastMinVx ?? null;

  // Stagnation override (>= 3 vk → flagi liikkeen vaihtoon)
  if (progress.stagnationWeeks >= 3) {
    return {
      action: "hold",
      suggestedLoad: progress.lastLoadKg,
      reason: `Stagnaatio ${progress.stagnationWeeks} viikkoa — harkitse liikkeen vaihtoa`,
      stagnationWarning: true,
    };
  }

  // V0 viim. sessiossa → kevennä (V0 = liian raskas)
  if (lastMinVx === 0) {
    const newLoad = roundToHalf(Math.max(0, (progress.lastLoadKg || 0) - increment));
    return {
      action: "decrease",
      suggestedLoad: newLoad,
      reason: `V0 viim. session sarjassa → kevennä −${increment} kg`,
    };
  }

  // Sub-target (V_actual < V_target, esim. V1-V2 target V3): hold — ei deload
  // V1-V2 painoissa, mutta ei myöskään nosta. Käyttäjäpyyntö 2026-05-05:
  // "ei deloadia heti V1-V2:lla, V0 osalta kyllä".
  if (lastVxOvershoot !== null && lastVxOvershoot < 0) {
    return {
      action: "hold",
      suggestedLoad: progress.lastLoadKg,
      reason: `Hieman alle target Vx (${lastVxOvershoot.toFixed(1)}) — hold, anna runkokunnon palautua`,
    };
  }

  // Target met täsmälleen (overshoot ≈ 0): legacy consecutive=2 -sääntö
  if (lastVxOvershoot !== null && Math.abs(lastVxOvershoot) < 0.5) {
    if (progress.consecutiveTargetMetSessions >= 2) {
      const newLoad = roundToHalf((progress.lastLoadKg || 0) + increment);
      return {
        action: "increase",
        suggestedLoad: newLoad,
        reason: `Target saavutettu ${progress.consecutiveTargetMetSessions}× peräkkäin → +${increment} kg`,
      };
    }
    return {
      action: "hold",
      suggestedLoad: progress.lastLoadKg,
      reason: "Target saavutettu, kasvattamiseen tarvitaan 2× peräkkäin",
    };
  }

  // Overshoot >= +0.5 luokkaa (= last Vx selvästi yli target) → progressio.
  // Multiplier:
  //   0.5–1.5 → 1×, 1.5–2.5 → 1.5×, 2.5+ → 2×
  if (lastVxOvershoot !== null && lastVxOvershoot >= 0.5) {
    let multiplier = 1.0;
    if (lastVxOvershoot >= 2.5) multiplier = 2.0;
    else if (lastVxOvershoot >= 1.5) multiplier = 1.5;
    const bonusKg = increment * multiplier;
    const newLoad = roundToHalf((progress.lastLoadKg || 0) + bonusKg);
    return {
      action: "increase",
      suggestedLoad: newLoad,
      reason: `Vx +${lastVxOvershoot.toFixed(1)} target Vx:stä — fresh-V signaali → +${bonusKg.toFixed(1)} kg`,
    };
  }

  // Legacy fallback: lastVxOvershoot null (vanha progress-record ilman Vx-trackingia)
  if (progress.consecutiveTargetMetSessions >= 2) {
    const newLoad = roundToHalf((progress.lastLoadKg || 0) + increment);
    return {
      action: "increase",
      suggestedLoad: newLoad,
      reason: `Target saavutettu ${progress.consecutiveTargetMetSessions}× peräkkäin → +${increment} kg (legacy)`,
    };
  }

  return {
    action: "hold",
    suggestedLoad: progress.lastLoadKg,
    reason: "Jatka samalla painolla",
  };
}

/**
 * Update movement progress after a session
 */
function updateMovementProgressFromSets(existingProgress, sessionSets, targetReps, targetVx) {
  if (!sessionSets.length) return existingProgress;

  const lastSet = sessionSets[sessionSets.length - 1];
  const lastLoadKg = lastSet.externalLoadKg;
  const lastReps = lastSet.reps;

  // v4.34.34 BUG-FIX E1: Vx-parametri puuttui aiemmin → e1rmAccessory käytti
  // efektiivisiä reppejä = reps + 0, mikä **aliarvioi** atletin todellisen
  // suorituskyvyn (V5-helppo sarja luettiin V0-grindiksi). Tämä rikkoi
  // accessory-progression next-load-suosituksen koko järjestelmästä — atletti
  // teki helpoilla, engine ehdotti samaa kuormaa seuraavalle kerralle.
  // Korjaus: priorisoi actualVx (todellinen palaute), fallback targetVx, sitten 1.
  const lastVx = lastSet.actualVx ?? lastSet.targetVx ?? targetVx ?? 1;
  const e1rm = e1rmAccessory(lastLoadKg, lastReps, lastVx);

  // Check if target was met for all sets
  const allTargetMet = sessionSets.every((s) => {
    const repsMet = s.reps >= (s.targetReps || targetReps);
    const varaMet = targetVx === null || s.actualVx === null || s.actualVx >= targetVx;
    return repsMet && varaMet;
  });

  const progress = existingProgress || {
    movementId: lastSet.movementId,
    currentE1RM: null,
    e1rmHistory: [],
    lastLoadKg: null,
    lastReps: null,
    suggestedLoadKg: null,
    suggestedAction: "hold",
    consecutiveTargetMetSessions: 0,
    stagnationWeeks: 0,
    stagnationFlagged: false,
    stagnationNotifiedAt: null,
    status: "active",
    restingSince: null,
  };

  // Update e1RM
  const prevE1RM = progress.currentE1RM;
  progress.currentE1RM = e1rm;
  progress.e1rmHistory = progress.e1rmHistory || [];
  if (e1rm !== null) {
    progress.e1rmHistory.push({ dateISO: todayISO(), e1rm });
  }
  progress.lastLoadKg = lastLoadKg;
  progress.lastReps = lastReps;

  // v4.34.36 BUG-FIX C: tallenna last-session Vx-tiedot accessoryProgressionia varten.
  // lastVxOvershoot = mean(actualVx) − targetVx (positiivinen = helpompi kuin target)
  // lastMinVx = pienin actualVx (V0 = failure → kevennys)
  const vxValues = sessionSets
    .map(s => s.actualVx)
    .filter(v => v !== null && v !== undefined);
  if (vxValues.length > 0 && targetVx !== null && targetVx !== undefined) {
    const meanActualVx = vxValues.reduce((a, b) => a + b, 0) / vxValues.length;
    progress.lastVxOvershoot = meanActualVx - targetVx;
    progress.lastMinVx = Math.min(...vxValues);
  } else {
    progress.lastVxOvershoot = null;
    progress.lastMinVx = null;
  }

  // Update target met counter
  if (allTargetMet) {
    progress.consecutiveTargetMetSessions = (progress.consecutiveTargetMetSessions || 0) + 1;
  } else {
    progress.consecutiveTargetMetSessions = 0;
  }

  // Update stagnation
  if (prevE1RM !== null && e1rm !== null && e1rm <= prevE1RM) {
    progress.stagnationWeeks = (progress.stagnationWeeks || 0) + 1;
  } else if (e1rm !== null && prevE1RM !== null && e1rm > prevE1RM) {
    progress.stagnationWeeks = 0;
    progress.stagnationFlagged = false;
  }

  if (progress.stagnationWeeks >= 3) {
    progress.stagnationFlagged = true;
  }

  // Compute suggestion
  const prog = accessoryProgression(progress);
  progress.suggestedLoadKg = prog.suggestedLoad;
  progress.suggestedAction = prog.action;

  return progress;
}

// ═══════════════════════════════════════════════════════════════
// NEW MOVEMENT INITIAL WEIGHT
// ═══════════════════════════════════════════════════════════════

function initialWeightFrom1RM(oneRepMax) {
  return roundToHalf(oneRepMax * 0.70);
}

// ═══════════════════════════════════════════════════════════════
// BLOCK RESOLUTION & ACCESSORY SCALAR (v4.25 P1-10)
// ═══════════════════════════════════════════════════════════════
//
// Periodisointiteoria (Issurin 2010, Israetel 2017):
// Accessory-volyymin tulisi laskea kun primary-intensiteetti nousee.
// Blokki 1 (hypertrofia) = full volume; blokki 4 (realization) = minimal.
// Tämä estää kumulatiivisen väsymyksen ennen kisaa ja pitää
// primary-liikkeiden palautumisen priorisoituna loppukaudella.
//
// Skaalarit (soveltuvat vain streetlifting_16w-mesosykleihin):
//   Vk 1-4  → 1.00 (hypertrofia: full accessory volume)
//   Vk 5-8  → 0.85 (voima: -15% accessory)
//   Vk 9-12 → 0.70 (intensifikaatio: -30% accessory)
//   Vk 13-16 → 0.50 (realization/taper: -50% accessory)

function getBlockForWeek(weekNum) {
  if (weekNum <= 4) return 1;
  if (weekNum <= 8) return 2;
  if (weekNum <= 12) return 3;
  return 4;
}

const ACCESSORY_BLOCK_SCALARS = { 1: 1.00, 2: 0.85, 3: 0.70, 4: 0.50 };

function getAccessoryBlockScalar(weekNum) {
  return ACCESSORY_BLOCK_SCALARS[getBlockForWeek(weekNum)] ?? 1.0;
}

// ═══════════════════════════════════════════════════════════════
// MU LOAD AUTOREGULATION (v4.25 P1-9)
// ═══════════════════════════════════════════════════════════════
//
// MU on teknis-voimahybridi: e1RM ei ole luotettava (bimodaalinen
// success/fail), joten progressio tapahtuu absoluuttisina kg-askelina
// edellisen session Vx-havainnoista:
//
//   Kaikki sarjat Vx ≥ 3  → +2.5 kg (helppo, nosta)
//   Keskimäärin Vx 2-3    → +0 kg (optimaalinen kuormitus, pidä)
//   Keskimäärin Vx 1-2    → -2.5 kg (liian raskas, pudota)
//   Yksikin sarja Vx 0    → -5 kg (failure, reset)
//
// Returns: { suggestedDeltaKg, reason, avgVx }

// v4.27.16: MU autoregulation Vx-gradient laajennettu (alkuperäinen).
// v4.32.9 M15: Gradient pienennetty puoleen — MU on suhteellisesti raskaampi liike
// kuin takakyykky. 91 kg atleetti, MU 1RM ≈ BW + 30-50 kg lisäpaino → +2.5 kg lisäys
// = 5-8% suhteellisesti, kun BS:ssä +5 kg / 200 kg = 2.5%. Eli MU:n +2.5 kg on
// funktionaalisesti yhtä iso askel kuin BS:n +5 kg. Pere Coll käytännössä +1-2.5 kg
// microloading WPU/MU:hun; Schulz (KoW) RPE-pohjainen 1.25-2.5 kg WPU/Dipissä,
// MU vielä konservatiivisemmin. Tutkimus: ei peer-reviewed-RCT MU-spesifisesti,
// mutta calisthenics-coaching-konsensus tukee pienempää askelta skill-painotteisille
// liikkeille.
//
// Uusi taso:
//   minVx === 0        → −2.5 kg (failure reset — pienempi pudotus kuin BS:ssä)
//   avgVx ≥ 4 & min≥3  → +2.5 kg (clearly easy — entinen +5 jaettu kahteen)
//   avgVx ≥ 3          → +1.25 kg (all-easy, microloading)
//   avgVx ≥ 2          →  0 kg   (optimal-hold)
//   avgVx < 2          → −1.25 kg (liian raskas, kevennä konservatiivisesti)
function adjustMULoad(recentMUSets) {
  if (!recentMUSets || recentMUSets.length === 0) {
    return { suggestedDeltaKg: 0, reason: "no-history", avgVx: null };
  }
  const lastSession = recentMUSets.slice(-3); // viim. 3 sarjaa ~= viim. sessio
  const varas = lastSession.map(s => s.actualVx).filter(v => v !== null && v !== undefined);
  if (varas.length === 0) {
    return { suggestedDeltaKg: 0, reason: "no-vx-data", avgVx: null };
  }
  const minVx = Math.min(...varas);
  const avgVx = varas.reduce((a, b) => a + b, 0) / varas.length;

  // v4.32.9 M15: gradient pienennetty puoleen MU-spesifyydelle
  if (minVx === 0) return { suggestedDeltaKg: -2.5, reason: "failure-reset", avgVx };
  if (avgVx >= 4 && minVx >= 3) return { suggestedDeltaKg: 2.5, reason: "very-easy-big-jump", avgVx };
  if (avgVx >= 3) return { suggestedDeltaKg: 1.25, reason: "all-easy-progress", avgVx };
  if (avgVx >= 2) return { suggestedDeltaKg: 0, reason: "optimal-hold", avgVx };
  return { suggestedDeltaKg: -1.25, reason: "too-hard-backoff", avgVx };
}

// ═══════════════════════════════════════════════════════════════
// FAILURE LOCKOUT (v4.25 P2-16)
// ═══════════════════════════════════════════════════════════════
//
// Jos edellisen primary-session jokin sarja päättyi Vx 0 (failure), seuraava
// sessio ei saa nostaa kuormaa. Tämä estää kumulatiivista ylikuormaa atleetin
// tunnetun grinding-taipumuksen alla (user_athlete_profile.md: "aliarvioi Vx").
//
// Returns: true if last session had Vx=0, false otherwise.

function hadFailureLastSession(recentTopSets) {
  if (!recentTopSets || recentTopSets.length === 0) return false;
  // Group by sessionId to find the most recent session
  const lastSessionId = recentTopSets[recentTopSets.length - 1].sessionId;
  if (!lastSessionId) return false;
  const lastSessionSets = recentTopSets.filter(s => s.sessionId === lastSessionId);
  return lastSessionSets.some(s => s.actualVx === 0);
}

// ═══════════════════════════════════════════════════════════════
// RATE-LIMIT ANCHOR (v4.27.14)
// ═══════════════════════════════════════════════════════════════
//
// Rate-limitin ankkurin valinta: session-vs-session -cappia varten tarvitaan
// "mistä cap nousee" -viitearvo. Aiempi v4.27.12-toteutus käytti viim. settiä
// (recentTopSets[length-1]) — altis yksittäisen anomalian vaikutukselle:
//   • Deload-session viim. setti @55% kevyt → cap sulkeutuu valloittavasti
//   • 3RM-testin 3. setti Vx0 → cap perustuu failure-settiin
//   • Grindiin päätynyt yksittäinen sarja vinouttaa cappia
//
// v4.27.14-strategia:
//   1. Ryhmitä sets sessionId:n mukaan (viim. 3 sessiota)
//   2. Kussakin sessiossa suodata pois: readiness_test, Vx0, externalLoad<=0
//   3. Laske kunkin session MEDIAN load + MEDIAN Vx
//   4. Ankkuri = RASKAIN median-load näistä → estää deload/test-session
//      vetämästä cappia keinotekoisesti alas
//
// v4.34.14: Palautetaan myös LAST-session-profiili. Kutsuva koodi voi ottaa
// MIN(heaviest × cap, last × cap_per_session) → estää historia-PR-bounce-back-ongelman:
// jos atleetilla on vanhoja korkeita kuormia mutta viim. sessio oli paljon kevyempi,
// vanha "heaviest" sallisi takaisinpalaamisen lähelle PR-tasoja yhdessä viikossa
// vaikka edellinen sessio osoitti aktuaalisen tason olevan matalampi.
//
// Returns: { medianLoad, medianVx, fromSessions, lastSession: { medianLoad, medianVx } } tai null.

function computeRateLimitAnchor(recentTopSets, opts = {}) {
  // v4.34.35: opts.excludeBackoff (default false) — kun true, backoff-sarjat
  // poistetaan anchor-laskusta. Bug: aiemmin primary V3-V4 + backoff V5-V6
  // sekoittuivat → median Vx vinoutui ylöspäin → cap rajoitti virheellisesti
  // primary-targetia. Recommend() antaa true:n primary-target-rate-limitille.
  const excludeBackoff = opts.excludeBackoff === true;
  if (!recentTopSets || recentTopSets.length === 0) return null;

  // Ryhmitä sessionId:n mukaan (säilytä aikajärjestys — recentTopSets on jo sortattu asc)
  const sessionOrder = [];
  const sessionGroups = new Map();
  for (const s of recentTopSets) {
    const sid = s.sessionId || `__no_session_${s.timestamp || ""}`;
    if (!sessionGroups.has(sid)) {
      sessionGroups.set(sid, []);
      sessionOrder.push(sid);
    }
    sessionGroups.get(sid).push(s);
  }

  // Ota viim. 3 sessiota
  const recentSessionIds = sessionOrder.slice(-3);

  // v4.34.28: Cal-sessioiden suodatus lastSession-haaraa varten (cowork-audit kohta 2.2 #2).
  // Aiempi bug: vk 4/8/12 cal-sessio (V1 @92%×3) tunnistettiin "raskaaksi sessioksi" ja
  // lastSession.medianVx = 1 → seuraava raskas-päivä target-Vx 2 = lastVxDelta +1 →
  // useLastAnchor=true → rate-limit cap liian tiukka cal-vk:n jälkeen. Korjaus:
  // tunnistetaan cal-sessiot per-profiili, ja last-haku ohittaa ne.
  const profiles = [];
  for (const sid of recentSessionIds) {
    const sessSets = sessionGroups.get(sid) || [];
    const sets = sessSets.filter(s =>
      (s.externalLoadKg || 0) > 0 &&
      s.setRole !== "readiness_test" &&
      s.actualVx !== 0  // Vx0 = failure, ei käytetä ankkurina
      && (!excludeBackoff || s.setRole !== "backoff") // v4.34.35: primary-only-mode
    );
    if (!sets.length) continue;
    const medianLoad = median(sets.map(s => s.externalLoadKg));
    const vxVals = sets.map(s => s.actualVx ?? s.targetVx ?? 2).filter(v => v !== null && v !== undefined);
    const medianVx = vxVals.length ? median(vxVals) : 2;
    // Cal-sessio jos vähintään 50% setistä on cal-rolea (deload+cal-päivä on hybridi:
    // muutama V4 deload-sarja + cal-sarja; cal dominoi merkitykseltään)
    const calSets = sessSets.filter(s => s.setRole === "calibration");
    const isCalibrationSession = calSets.length > 0 && calSets.length >= sets.length * 0.5;
    // v4.34.36 BUG-FIX B: tallenna session-päivämäärä multi-week-cap-laskua varten.
    // dateISO:n puuttuessa fallback timestamp.slice(0,10).
    const firstSet = sets[0];
    const dateISO = firstSet.dateISO || firstSet.timestamp?.slice(0, 10) || null;
    profiles.push({ sessionId: sid, medianLoad, medianVx, isCalibrationSession, dateISO });
  }

  if (profiles.length === 0) return null;

  // Ankkuri = raskain median-load näistä → deload/test-sessio ei vedä cappia alas.
  // Cal-sessiot SISÄLTYVÄT heaviest-anchoriin (cal-load voi legitimiivistä olla raskain).
  const anchor = profiles.reduce((best, p) => p.medianLoad > best.medianLoad ? p : best);
  // Last-session-profiili — käytä viim. EI-cal-sessiota (cal-vk on hybridi joka
  // vääristää lastVxDelta-laskennan: V1 cal → V2 raskas = +1 vaikka kuorma laskee).
  const nonCalProfiles = profiles.filter(p => !p.isCalibrationSession);
  const last = nonCalProfiles.length > 0
    ? nonCalProfiles[nonCalProfiles.length - 1]
    : profiles[profiles.length - 1];
  return {
    medianLoad: anchor.medianLoad,
    medianVx: anchor.medianVx,
    fromSessions: profiles.length,
    lastSession: {
      medianLoad: last.medianLoad,
      medianVx: last.medianVx,
      isCalibration: last.isCalibrationSession === true,
      dateISO: last.dateISO || null,
      sessionId: last.sessionId || null, // OBS-030: kutsuja lookuppaa planSourceDateISO:n
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// PROGRESSION TARGET (v4.35.0 — Eliittitason refaktorointi)
// ═══════════════════════════════════════════════════════════════
//
// Yhtenäinen funktio joka päättää progressio-targetin huomioimalla:
//   1. Helms 2018: Vx-mismatch session-välillä (lievennetty 1Vx = 2%)
//   2. Viikoittainen baseline-progressio (+2.5%/vk × weeksSinceLast)
//   3. Regain-multiplier (Cumming 2024, Psilander 2018)
//   4. V0-grindi-suoja (atletin profiili, −5%)
//   5. Plan-floor (prescribed × baseline = lattia, autoreg voi vain nostaa)
//   6. Hard-cap (max +15% × weeksSinceLast)
//   7. Floor-cap taaksepäin yhteensopivuus (regression-suoja)
//   8. Yliajot: cal/deload/speed-päivä → naive plan
//
// Puhdas funktio: deterministinen, ei sivuvaikutuksia, ei async.
// Pyöristys jätetään kutsujan tehtäväksi (roundToHalf).
// Trace.ruleHits[] sisältää vanhat ruleId:t taaksepäin yhteensopivuudeksi.
//
// @param {object} ctx
// @param {{medianLoad, medianVx, isCalibration, dateISO}|null} ctx.lastSession
//        Viim. session profiili (computeRateLimitAnchor.lastSession)
// @param {number} ctx.targetVx - Tämän session prescribed Vx
// @param {{deltaPctBase}|null} ctx.weekDef - Mesosykli-vk
// @param {string} ctx.dayType - "heavy" | "volume" | "speed" | "competition"
// @param {number|null} ctx.cfgBaseline - Cfg-arvo (esim. 185 kg) — null jos ei
// @param {number|null} ctx.planTarget - Prescribed_pct × baseline (jo laskettu)
// @param {boolean} ctx.planBasedActive - Onko PLAN_BASED_E1RM aktivoitunut
// @param {string} ctx.dateISO - Tämän session päivämäärä
// @returns {{targetLoad: number|null, decisionTrace: object}}
function computeProgressionTarget(ctx) {
  const cfg = PROGRESSION_CONFIG;

  const trace = {
    inputs: {
      lastLoad: ctx.lastSession?.medianLoad ?? null,
      lastVx: ctx.lastSession?.medianVx ?? null,
      lastIsCal: ctx.lastSession?.isCalibration ?? null,
      lastDateISO: ctx.lastSession?.dateISO ?? null,
      targetVx: ctx.targetVx,
      deltaPctBase: ctx.weekDef?.deltaPctBase ?? null,
      dayType: ctx.dayType,
      cfgBaseline: ctx.cfgBaseline,
      planTarget: ctx.planTarget,
      planBasedActive: ctx.planBasedActive === true,
      dateISO: ctx.dateISO,
    },
    regainRatio: null,
    regainMultiplier: 1.0,
    weeklyProgressionPct: 0,
    vxAdjustmentPct: 0,
    weeksSinceLast: 0,
    autoregTarget: null,
    planFloor: ctx.planTarget,
    hardCap: null,
    finalTarget: null,
    ruleHits: [],
    rationale: '',
  };

  const { lastSession, targetVx, weekDef, dayType, cfgBaseline, planTarget,
          planBasedActive, dateISO } = ctx;

  // 1. YLIAJOT: deload, speed, ei lastSessionia, ei planTargetia → naive plan
  const isDeload = (weekDef?.deltaPctBase ?? 0) < 0;
  const isSpeed = dayType === 'speed';

  if (isDeload) {
    trace.finalTarget = planTarget;
    trace.ruleHits.push('PROGRESSION_DELOAD_PASSTHROUGH');
    trace.rationale = `Deload-vk (deltaPctBase ${weekDef.deltaPctBase}): prescribed × baseline (autoreg ohitettu).`;
    return { targetLoad: planTarget, decisionTrace: trace };
  }
  if (isSpeed) {
    trace.finalTarget = planTarget;
    trace.ruleHits.push('PROGRESSION_SPEED_PASSTHROUGH');
    trace.rationale = `Speed-päivä: prescribed × baseline (autoreg ohitettu, intensiteetti tulee Vx:stä).`;
    return { targetLoad: planTarget, decisionTrace: trace };
  }
  if (lastSession === null || lastSession === undefined) {
    trace.finalTarget = planTarget;
    trace.ruleHits.push('PROGRESSION_NO_HISTORY');
    trace.rationale = `Ei viim. ei-cal-sessiota → naive plan.`;
    return { targetLoad: planTarget, decisionTrace: trace };
  }
  if (planTarget === null || planTarget === undefined) {
    trace.finalTarget = null;
    trace.ruleHits.push('PROGRESSION_NO_PLAN');
    trace.rationale = `Ei plan-targetia → null (kutsujan vastuu fallback).`;
    return { targetLoad: null, decisionTrace: trace };
  }

  // 2. V0-grindi-suoja (ennen muuta logiikkaa)
  // Jos viim. sessio meni V0-failina (ei cal), seuraavalle konservatiivinen palautus
  if (lastSession.medianVx === 0 && !lastSession.isCalibration) {
    const conservativeTarget = lastSession.medianLoad * (1 + cfg.V0_GRINDI_PENALTY);
    // Plan-target on edelleen lattia: jos suunnitelma sanoo jotain matalampaa,
    // V0-suoja saa pudottaa kuormaa siihen mutta ei alle.
    const target = Math.max(planTarget, conservativeTarget);
    trace.finalTarget = target;
    trace.ruleHits.push('PROGRESSION_V0_PROTECTION');
    trace.rationale = `V0-fail viim. sessio (${lastSession.medianLoad}@V0) → ${(cfg.V0_GRINDI_PENALTY*100).toFixed(0)}% palautus (= ${conservativeTarget.toFixed(1)} kg). Plan-floor ${planTarget.toFixed(1)} kg ${target === planTarget ? 'voittaa' : 'ohitettu'}.`;
    return { targetLoad: target, decisionTrace: trace };
  }

  // 3. Regain-ratio (vain jos cfgBaseline saatavilla)
  let regainRatio = null;
  let regainMultiplier = 1.0;
  if (cfgBaseline && cfgBaseline > 0) {
    regainRatio = lastSession.medianLoad / cfgBaseline;
    if (regainRatio < cfg.REGAIN_THRESHOLD_FAR) {
      regainMultiplier = cfg.REGAIN_MULTIPLIER_FAR;
      trace.ruleHits.push('PROGRESSION_REGAIN_FAR');
    } else if (regainRatio < cfg.REGAIN_THRESHOLD_NEAR) {
      regainMultiplier = cfg.REGAIN_MULTIPLIER_NEAR;
      trace.ruleHits.push('PROGRESSION_REGAIN_NEAR');
    }
  }
  trace.regainRatio = regainRatio;
  trace.regainMultiplier = regainMultiplier;

  // 4. Weeks since last (multi-week-aware)
  // OBS-030: progression attribuoi planOverride-session sen SUUNNITELLULLE päivälle
  // (planSourceDateISO) eikä kalenteri-tehtypäivälle (dateISO). Kutsuja asettaa
  // lastSession.planSourceDateISO:n VAIN planOverride-sessiolle; normaalisessiolle se
  // puuttuu → fallback dateISO (= ennallaan, bittitarkka).
  // OBS-027-A2 (2026-05-30): myös display (thisWeekHTML) attribuoi planOverriden
  // planSourceDateISO:lle → planOverride menee aiottuun viikkoon SEKÄ progressionissa
  // ETTÄ displayssä (yhtenäinen). Vain TALLENNETTU dateISO = todellinen tehtypäivä.
  // ceil()-kaava + cap[1,3] ENNALLAAN — vain käytetty lähtöpäivä muuttuu.
  let weeksSinceLast = 1;
  const lastDateForGap = lastSession.planSourceDateISO || lastSession.dateISO;
  if (lastDateForGap && dateISO) {
    const daysSince = Math.max(1, Math.floor(
      (new Date(dateISO).getTime() - new Date(lastDateForGap).getTime()) / 86400000
    ));
    weeksSinceLast = Math.min(3, Math.max(1, Math.ceil(daysSince / 7)));
  }
  trace.weeksSinceLast = weeksSinceLast;

  // 5. Vx-mismatch-säätö (Helms 2018 lievennettynä)
  // Jos last_Vx > target_Vx (= viime kerta oli helpompaa kuin tavoiteltiin),
  // nostetaan kuormaa. Vx-skaala: korkeampi luku = helpompi.
  let vxAdjustmentPct = 0;
  if (lastSession.medianVx > targetVx) {
    const vxDiff = lastSession.medianVx - targetVx;
    vxAdjustmentPct = vxDiff * cfg.HELMS_VX_TO_LOAD_PCT_BETWEEN_SESSIONS;
  }
  trace.vxAdjustmentPct = vxAdjustmentPct;

  // 6. Viikoittainen progressio (Helms baseline × regain × weeks)
  const weeklyProgressionPct = cfg.WEEKLY_BASELINE_PR_PHASE * regainMultiplier * weeksSinceLast;
  trace.weeklyProgressionPct = weeklyProgressionPct;

  // 7. Yhdistetty autoreg-target
  // PLAN_BASED-yhteensovitus: jos PLAN_BASED jo aktivoitui primary-haarassa,
  // sen tulos on jo nostanut planTargetin Helms 2018:n mukaisesti. Älä lisää
  // weekly_progression päälle (kaksoiskirjaus-suoja). vxAdjustment lisätään
  // silti, koska se on eri mekanismi (PLAN_BASED tunnistaa saman session
  // overshoot:in, vxAdjustment tunnistaa session-välisen Vx-helpotuksen).
  let totalProgression;
  if (planBasedActive) {
    totalProgression = vxAdjustmentPct;
    trace.ruleHits.push('PROGRESSION_PLAN_BASED_HARMONIZED');
  } else {
    totalProgression = vxAdjustmentPct + weeklyProgressionPct;
  }
  const autoregTarget = lastSession.medianLoad * (1 + totalProgression);
  trace.autoregTarget = autoregTarget;

  // 8. Hard-cap (max +15% × weeksSinceLast)
  const hardCap = lastSession.medianLoad * (1 + cfg.HARD_CAP_PER_WEEK * weeksSinceLast);
  trace.hardCap = hardCap;

  // 9. Lopullinen target
  // Plan-floor: prescribed × baseline = lattia, autoregulaatio voi vain nostaa
  let finalTarget = Math.max(planTarget, autoregTarget);

  // Hard-cap voittaa
  if (finalTarget > hardCap) {
    finalTarget = hardCap;
    trace.ruleHits.push('PROGRESSION_HARD_CAP');
  }

  // 10. Floor-cap (taaksepäin yhteensopivuus): jos viim. sessio meni Vx >= target,
  // älä putoa alle viim. session medianLoadin (regression-suoja).
  // Sallii tasolla pysymisen (Vx_diff = 0 ja weekly-progressio = 0 jälkeen
  // PR-vaiheessa cap voi tuottaa sama kuorma).
  if (lastSession.medianVx >= targetVx
      && !lastSession.isCalibration
      && finalTarget < lastSession.medianLoad - cfg.ROUNDING_TOLERANCE) {
    finalTarget = lastSession.medianLoad;
    trace.ruleHits.push('PROGRESSION_FLOOR_CAP');
  }

  trace.finalTarget = finalTarget;

  // 11. Rationale
  if (regainMultiplier > 1.0) {
    const phaseLbl = regainRatio < cfg.REGAIN_THRESHOLD_FAR ? 'aggressive regain' : 'mild regain';
    trace.rationale = `${phaseLbl} (ratio ${regainRatio.toFixed(2)}, ×${regainMultiplier.toFixed(1)}): weekly ${(weeklyProgressionPct*100).toFixed(1)}% (${(cfg.WEEKLY_BASELINE_PR_PHASE*100).toFixed(1)}% × ${regainMultiplier.toFixed(1)} × ${weeksSinceLast}vk)${vxAdjustmentPct > 0 ? ` + Vx-adj ${(vxAdjustmentPct*100).toFixed(1)}% (last V${lastSession.medianVx} > target V${targetVx})` : ''}. Target ${finalTarget.toFixed(1)} kg ${finalTarget === planTarget ? '(plan-floor)' : finalTarget === hardCap ? '(hard-cap)' : '(autoreg)'}.`;
  } else {
    trace.rationale = `PR-phase: weekly ${(weeklyProgressionPct*100).toFixed(1)}% (${(cfg.WEEKLY_BASELINE_PR_PHASE*100).toFixed(1)}% × ${weeksSinceLast}vk)${vxAdjustmentPct > 0 ? ` + Vx-adj ${(vxAdjustmentPct*100).toFixed(1)}%` : ''}${planBasedActive ? ' [plan-based harmonized]' : ''}. Target ${finalTarget.toFixed(1)} kg ${finalTarget === planTarget ? '(plan-floor)' : finalTarget === hardCap ? '(hard-cap)' : '(autoreg)'}.`;
  }

  return { targetLoad: finalTarget, decisionTrace: trace };
}

// ═══════════════════════════════════════════════════════════════
// LOAD-VELOCITY PROFILE (v4.25.1 — Enode-valmistelu)
// ═══════════════════════════════════════════════════════════════
//
// Rakentaa henkilökohtaisen load-velocity-käyrän ankkuripiste-sarjoista
// (top singlet, openerit, kalibrointitestit). Käyrän avulla voidaan:
//   1. estimoida e1RM ilman failurea (velocity @95% 1RM ≈ liikekohtainen)
//   2. ristiinverrata Vx-pohjaista e1RM:ää (diagnostiikka)
//   3. seurata neurovoiman muutosta kuorma-vakiolla (velocity nousee samalla kuormalla → PR-momentum)
//
// Käyttö: vain sarjoille joilla velocityMean !== null JA setRole on
// "top" | "readiness_test" JA reps === 1 (puhdas 1RM-arvion pohjadata).
// Multi-rep-setit (2+) jäävät ulos koska MCV riippuu rep-positiosta.
//
// Input: sets[] (sessions-store-tasoisia), bodyweightKg, isBarbell
// Output: {
//   points: [{ loadPct, velocity, dateISO, externalLoadKg, systemLoadKg }],
//   slope: number,        // m/s per %1RM (tyypillisesti negatiivinen)
//   intercept: number,    // y-intercept regressioviivasta
//   v1rmEstimate: number, // velocity @100% loadPct (regressioennuste samplen 100%-tasoon)
//   e1rmCrossCheck: number | null, // velocity-pohjainen 1RM arvio (kg, ext) — käyttää MVT:tä
//   n: number             // pisteiden lukumäärä
// }
//
// Evidenssi: González-Badillo & Sánchez-Medina 2010 — LV-relaatio lineaarinen
// luotettavasti välillä 30-100% 1RM samalle liikkeelle samalle henkilölle.
//
// v4.34.25: MOVEMENT_MVT-vakio liike-spesifisille MVT-arvoille (Minimum Velocity
// Threshold, m/s). Aiempi cross-check-laskenta oli matemaattisesti degeneroitunut:
// estimate = systemLoad / loadPct = systemLoad / (systemLoad/maxLoad) = maxLoad
// kaikille pisteille, jolloin regressio ei vaikuttanut tulokseen ja diagnostic-
// trace VBT_E1RM_CROSSCHECK oli pseudosignaali.
//
// KORJAUS: regressio on nyt y = slope × loadPct + intercept. MVT-velocityyn
// vastaava loadPct = (MVT - intercept) / slope. 1RM systemLoad = maxLoad × loadPctAtMVT
// (extrapolointi MVT-kohtaan, voi olla > 1.0 = ennustaa true-1RM korkeammaksi
// kuin näytteessä havaittu max).
//
// Lähteet:
//   - Sánchez-Moreno 2017: pull-up MVT ≈ 0.23 m/s
//   - Pareja-Blanco/González-Badillo: bench MVT ≈ 0.17 m/s, squat ≈ 0.30 m/s
//   - González-Badillo: deadlift MVT ≈ 0.14 m/s
const MOVEMENT_MVT = {
  "Lisäpainoleuanveto":      0.23,  // Sánchez-Moreno 2017
  "Vastaote-leuanveto":      0.23,
  "Paused pull-up":          0.20,  // pause = hieman matalampi MVT
  "Tempo pull-up":           0.20,
  "Lisäpainodippi":          0.20,  // estimaatti, kalibroidaan oman datan myötä
  "Dippi":                   0.20,
  "Takakyykky":              0.30,  // Pareja-Blanco
  "Etukyykky":               0.30,
  "Paused squat":            0.27,
  "Box squat":               0.30,
  "Tempo squat":             0.27,
  "Pin squat":               0.30,
  "Penkkipunnerrus":         0.17,  // Pareja-Blanco
  "Paused bench press":      0.15,
  "Vinopenkkipunnerrus":     0.18,
  "Close-grip bench":        0.17,
  "Spoto press":             0.15,
  "Pystypunnerrus":          0.19,  // estimaatti
  "Push press":              0.22,
  "Maastaveto":              0.14,  // González-Badillo
  "Romanian DL":             0.18,
  "Snatch-grip DL":          0.14,
  "Block pull":              0.14,
  "Paused DL":               0.12,  // pause-deadlift selvästi matalampi
  "Deficit DL":              0.14,
  "Muscle-up":               0.30,  // streetlifting, ei tarkkaa kirjallisuutta
  // v4.38.0: Räjähtävän leuanvedon variantit aliasoituvat Lisäpainoleuanvetoon (0.23).
  // Perustelu: MVT = velocity 1RM:llä, ei training-load-velocity. Sama atleetti +
  // sama liikemekaniikka (vertikaaliveto + lisäpaino) → V@failure konvergoituu samaan
  // riippumatta sub-max intent:istä. Räjähtävässä variantissa ei ole pausea, joten
  // 0.20 (Paused pull-up) ei sovellu. Lähde: Sánchez-Moreno 2017 + Helms 2017 -baseline.
  "Räjähtävä leuanveto":     0.23,
  "Räjähtävä leuka":         0.23,
  "Räjähtävä leuka (vyö)":   0.23,
};
// Default-MVT tuntemattomille liikkeille (konservatiivinen, kyykky-tasolla)
const DEFAULT_MVT = 0.25;

// v4.52.15 H-006b B1 (A1): Liike-spesifi primer-rajaus.
//
// Vain primerEnabled=true -liikkeet näyttävät primer-card UI:n (index.html:6255
// needsPrimer-tarkistuksen kautta) + tallentavat primer-velocityn baseline-
// historiaan (B4 measurements-store type='primer').
//
// primerEnabled=true:
//   - Tankoliikkeet (lineaarinen bar-trajectory, Enode-clip-mittaus luotettava):
//     Takakyykky + variantit, Penkkipunnerrus + variantit, Pystypunnerrus + variantit,
//     Maastaveto + variantit.
//   - BW+lisäpaino-leuanveto + variantit (Akselin empiria 2026-05-28: mitattu
//     käytännössä luotettavaksi pull-trajectory).
//
// primerEnabled=false:
//   - Lisäpainodippi (lyhyt amplitude → velocity-mittaus epäluotettava
//     Akselin empiriassa)
//   - Muscle-up (multi-plane skill → velocity ei translatoi LV-relaatioon
//     standardimuodossa)
//
// Cowork-päätös 2026-05-28 (HANDOFF.md H-006b §5): atletti-empiria — dippi-
// velocity epäluotettava, ei rakenneta LV-regressiota kaikille liikkeille.
// Akselin ratifioima.
const MOVEMENT_PRIMER_ENABLED = {
  // Tankoliikkeet (kyykky) — primerEnabled=true
  "Takakyykky":              true,
  "Etukyykky":               true,
  "Paused squat":            true,
  "Box squat":               true,
  "Tempo squat":             true,
  "Pin squat":               true,
  // Tankoliikkeet (bench) — primerEnabled=true
  "Penkkipunnerrus":         true,
  "Paused bench press":      true,
  "Vinopenkkipunnerrus":     true,
  "Close-grip bench":        true,
  "Spoto press":             true,
  // Tankoliikkeet (overhead) — primerEnabled=true
  "Pystypunnerrus":          true,
  "Push press":              true,
  // Tankoliikkeet (deadlift) — primerEnabled=true
  "Maastaveto":              true,
  "Romanian DL":             true,
  "Snatch-grip DL":          true,
  "Block pull":              true,
  "Paused DL":               true,
  "Deficit DL":              true,
  // BW+lisäpaino-leuanveto + variantit — primerEnabled=true (Akselin empiria)
  "Lisäpainoleuanveto":      true,
  "Vastaote-leuanveto":      true,
  "Paused pull-up":          true,
  "Tempo pull-up":           true,
  "Räjähtävä leuanveto":     true,
  "Räjähtävä leuka":         true,
  "Räjähtävä leuka (vyö)":   true,
  // primerEnabled=false (atletti-realismi 2026-05-28)
  "Lisäpainodippi":          false,
  "Dippi":                   false,
  "Muscle-up":               false,
};

// v4.52.15 H-006b B1: getter — palauttaa true jos liike on primerEnabled.
// Tuntemattomille liikkeille palauttaa false (konservatiivinen — ei näytetä
// primer-card UI:ta ennen kuin liike on eksplisiittisesti lisätty taulukkoon).
function isPrimerEnabledForMovement(movementName) {
  if (!movementName || typeof movementName !== "string") return false;
  return MOVEMENT_PRIMER_ENABLED[movementName] === true;
}

// v4.52.15 H-006b B2 (A2): Primer-baseline-mediaani per liike.
// Lukee measurements-store:ista type='primer' -mittaukset (B4) ja palauttaa
// mediaanin + n. Käytetään computeTodaySys1RM:n vertailukohtana.
//
// Baseline rakentuu hitaasti: tarvitsee ≥5 primer-mittausta per liike ennen
// kuin K-β-2 BASELINE_SIZE-tila vaihtuu "rakentumassa" → "valmis".
function computePrimerBaseline(movementId, measurements) {
  if (!Array.isArray(measurements) || !movementId) {
    return { median: null, n: 0 };
  }
  const primerVals = measurements
    .filter(m =>
      m &&
      m.type === "primer" &&
      m.movementId === movementId &&
      typeof m.value === "number" &&
      m.value > 0
    )
    .map(m => m.value);
  if (primerVals.length === 0) return { median: null, n: 0 };
  const sorted = [...primerVals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return { median, n: primerVals.length };
}

// v4.52.15 H-006b B2 (A2): Päivän mukautettu sys-1RM primer-velocityn pohjalta.
//
// Syöte:
//   - primerVelocity: päivän primer-mittauksen velocity (m/s, MPV tai best-of-N)
//   - baseline: { median, n } — primer-historian baseline (computePrimerBaseline)
//   - calibrationKg: nimellinen e1RM-arvo Asetuksista (leukaExtKg/kyykkyExtKg/...)
//   - movementId: liike-ID audit-tracen takia
//
// Lopputulos: { sys1RM, deltaPct, reason } — sys1RM on päivän mukautettu arvo
// joka annetaan recommend(): in options.todaySys1RM-parametrina.
//
// Säännöt (HANDOFF.md H-006b §2 A2 + §5 Cowork-ratifiointi 2026-05-28):
//   - Jos baseline.n < 5 → sys1RM = calibrationKg (rakentumassa)
//   - Jos primerVelocity >= baseline.median * 1.05 →
//       lineaarinen +2.5% (ratio 1.05) ... +5% (ratio 1.10), clamp +5%
//   - Jos primerVelocity <= baseline.median * 0.95 →
//       lineaarinen -2.5% (ratio 0.95) ... -5% (ratio 0.90), clamp -5%
//   - Muuten sys1RM = calibrationKg (neutraali baseline-ikkuna)
//   - K-β-5 MVT_GUARD: sys1RM clamp ±15% calibrationKg:sta (extreme-suoja,
//     A3 audit-flagi). Normaalitilanteessa ei aktivoidu (kynnykset ±5%).
//
// Tutkimuspohja:
//   - Sánchez-Moreno 2017: rep1 MPV-slope per RIR ~0,045 m/s → ±5% velocity-ero
//     vastaa ~1-2 RIR siirtymää → ±2.5-5% kuormamukautus konservatiivinen.
//   - Pareja-Blanco 2017: ±15% e1RM-extreme = neuromuskulaarinen fatiikka tai
//     mittausvirhe — clamp estää sys-1RM:n karkaamisen yksittäisestä
//     virheellisestä primer-mittauksesta.
function computeTodaySys1RM(primerVelocity, baseline, calibrationKg, movementId) {
  const kBetaFlags = []; // H-006b B3 (A3): aktivoidut K-β-flagit per kutsu

  // Defensiiviset guardit
  if (typeof calibrationKg !== "number" || calibrationKg <= 0) {
    return { sys1RM: null, deltaPct: 0, reason: "calibration_invalid", kBetaFlags };
  }
  if (typeof primerVelocity !== "number" || primerVelocity <= 0) {
    // K-β-1 PRIMER_DATA_AVAILABILITY -tilanne (fallback nimelliseen)
    kBetaFlags.push({ code: "K-β-1", reason: "primer_velocity_invalid" });
    return { sys1RM: calibrationKg, deltaPct: 0, reason: "primer_velocity_invalid", kBetaFlags };
  }
  if (!baseline || typeof baseline.median !== "number" || baseline.median <= 0) {
    kBetaFlags.push({ code: "K-β-2", reason: "baseline_missing", n: 0 });
    return { sys1RM: calibrationKg, deltaPct: 0, reason: "baseline_missing", kBetaFlags };
  }
  // K-β-2 BASELINE_SIZE: rakentumassa-tila (n<5)
  if ((baseline.n || 0) < 5) {
    kBetaFlags.push({ code: "K-β-2", reason: "baseline_insufficient", n: baseline.n || 0 });
    return { sys1RM: calibrationKg, deltaPct: 0, reason: "baseline_insufficient", kBetaFlags };
  }

  const ratio = primerVelocity / baseline.median;
  let deltaPct = 0;
  let reason;

  if (ratio >= 1.05) {
    // Positiivinen: lineaarinen 1.05→+2.5%, 1.10→+5%, clamp +5%
    const scale = Math.min(1, (ratio - 1.05) / 0.05);
    deltaPct = 0.025 + scale * 0.025;
    reason = "primer_above_baseline";
  } else if (ratio <= 0.95) {
    // Negatiivinen: lineaarinen 0.95→-2.5%, 0.90→-5%, clamp -5%
    const scale = Math.min(1, (0.95 - ratio) / 0.05);
    deltaPct = -(0.025 + scale * 0.025);
    reason = "primer_below_baseline";
  } else {
    reason = "primer_in_neutral_band";
  }

  // K-β-5 MVT_GUARD: clamp ±15% (extreme-suoja, normaalitilanteessa ei aktivoidu)
  const MVT_GUARD_LIMIT = 0.15;
  const preClampDelta = deltaPct;
  if (deltaPct > MVT_GUARD_LIMIT) deltaPct = MVT_GUARD_LIMIT;
  if (deltaPct < -MVT_GUARD_LIMIT) deltaPct = -MVT_GUARD_LIMIT;
  if (preClampDelta !== deltaPct) {
    kBetaFlags.push({
      code: "K-β-5",
      reason: "mvt_guard_clamped",
      preClampDelta,
      clampedDelta: deltaPct,
      limit: MVT_GUARD_LIMIT,
    });
  }

  const sys1RM = calibrationKg * (1 + deltaPct);
  return {
    sys1RM, deltaPct, reason, movementId,
    primerVelocity, baselineMedian: baseline.median, baselineN: baseline.n,
    kBetaFlags,
  };
}

// v4.52.15 H-006b B3 (A3 K-β-4): Baseline-drift detection.
// Vertaa nykyistä mediaania historialliseen (>=4 viikkoa sitten) mediaaniin.
// Jos siirtymä >10% → drift-flag + retest-suositus (atletti voi olla teknisesti
// rakentanut velocity-tehoa, tai mittauslaite kalibroitu väärin).
//
// Syöte:
//   - measurements: array of { type, value, movementId, dateISO } -objekteja
//   - movementId: liike jolle drift lasketaan
//   - currentDateISO: nykypäivä (referenssi)
//
// Lopputulos: { drifted, driftPct, currentMedian, historicalMedian, recentN, historicalN }
//   - drifted=true jos |driftPct| > 10% JA molemmat ikkunat n>=3 (luotettava vertailu)
function computePrimerBaselineDrift(measurements, movementId, currentDateISO) {
  const result = {
    drifted: false, driftPct: null,
    currentMedian: null, historicalMedian: null,
    recentN: 0, historicalN: 0,
  };
  if (!Array.isArray(measurements) || !movementId || !currentDateISO) return result;

  const refTs = new Date(currentDateISO).getTime();
  if (!Number.isFinite(refTs)) return result;
  const FOUR_WEEKS_MS = 4 * 7 * 24 * 60 * 60 * 1000;
  const cutoffTs = refTs - FOUR_WEEKS_MS;

  const movPrimers = measurements.filter(m =>
    m && m.type === "primer" && m.movementId === movementId &&
    typeof m.value === "number" && m.value > 0 &&
    m.dateISO && Number.isFinite(new Date(m.dateISO).getTime())
  );

  const recent = movPrimers.filter(m => new Date(m.dateISO).getTime() >= cutoffTs);
  const historical = movPrimers.filter(m => new Date(m.dateISO).getTime() < cutoffTs);

  result.recentN = recent.length;
  result.historicalN = historical.length;

  const medianOf = arr => {
    if (arr.length === 0) return null;
    const sorted = [...arr].map(m => m.value).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };
  result.currentMedian = medianOf(recent);
  result.historicalMedian = medianOf(historical);

  if (result.recentN >= 3 && result.historicalN >= 3 &&
      result.currentMedian !== null && result.historicalMedian !== null &&
      result.historicalMedian > 0) {
    const driftPct = (result.currentMedian - result.historicalMedian) / result.historicalMedian;
    result.driftPct = driftPct;
    if (Math.abs(driftPct) > 0.10) {
      result.drifted = true;
    }
  }
  return result;
}

// v4.52.16 H-007 B2 (A2): HRV-baseline rolling-7-päivän-pohjaisesti.
//
// Syöte:
//   - measurements: array of { type, value, dateISO, ... } -objekteja
//   - currentDateISO: nykypäivä (referenssi rolling-7-ikkunalle)
//
// Lopputulos: { median, n, status }
//   - median: viim. 7 päivän HRV-mittausten mediaani (ms)
//   - n: viim. 7 päivän mittausten lukumäärä (jaettu päivittäisistä syötteistä)
//   - status: "ready" (n>=7), "building" (1<=n<7), "empty" (n=0)
//
// Plews 2013 -kynnys: n>=7 minimi rolling-baseline-luotettavuudelle, n>=14
// ideaali (= 14 päivän rolling avg). Kapeampi kuin primer-baseline (n>=5)
// koska HRV-arvot ovat kohinaisempia ja vaativat pidempää ikkunaa.
//
// EI liike-spesifinen (HRV on koko atletti-tason mittari, ei per-liike).
function computeHrvBaseline(measurements, currentDateISO) {
  const result = { median: null, n: 0, status: "empty" };
  if (!Array.isArray(measurements)) return result;
  const refTs = currentDateISO ? new Date(currentDateISO).getTime() : Date.now();
  if (!Number.isFinite(refTs)) return result;

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const cutoffTs = refTs - SEVEN_DAYS_MS;

  const recentHrv = measurements.filter(m =>
    m && m.type === "HRV" && typeof m.value === "number" && m.value > 0 &&
    m.dateISO && Number.isFinite(new Date(m.dateISO).getTime()) &&
    new Date(m.dateISO).getTime() >= cutoffTs
  );

  result.n = recentHrv.length;
  if (recentHrv.length === 0) {
    result.status = "empty";
    return result;
  }

  const sorted = recentHrv.map(m => m.value).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  result.median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  result.status = recentHrv.length >= 7 ? "ready" : "building";
  return result;
}

// v4.52.16 H-007 B3 (A3): HRV-baseline-drift detection.
//
// Vertaa recent-7-päivän mediaania historical-7-päivän (= 8-14 päivää sitten)
// mediaaniin. Jos siirtymä >10% → drift-warning + audit-flagi (K-β-HRV-4).
//
// Syöte:
//   - measurements: array of { type, value, dateISO, ... }
//   - currentDateISO: nykypäivä (referenssi-ikkunoille)
//
// Lopputulos: { recentMedian, historicalMedian, driftPct, status: "ok"|"warning",
//               recentN, historicalN }
//
// Plews 2013 -taustalla: yli 10% drift 7 vs 7 päivän vertailussa = signaali
// joko (a) tekninen kehitys/regressio, (b) palautumiskuorma-muutos, tai
// (c) mittauslaite-virhe. Vaatii atletilta tarkistuksen.
function computeHrvBaselineDrift(measurements, currentDateISO) {
  const result = {
    recentMedian: null, historicalMedian: null,
    driftPct: null, status: "ok",
    recentN: 0, historicalN: 0,
  };
  if (!Array.isArray(measurements) || !currentDateISO) return result;
  const refTs = new Date(currentDateISO).getTime();
  if (!Number.isFinite(refTs)) return result;

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
  const recentCutoffTs = refTs - SEVEN_DAYS_MS;        // 0-7 päivää sitten
  const historicalCutoffTs = refTs - FOURTEEN_DAYS_MS; // 8-14 päivää sitten

  const hrvOnly = measurements.filter(m =>
    m && m.type === "HRV" && typeof m.value === "number" && m.value > 0 &&
    m.dateISO && Number.isFinite(new Date(m.dateISO).getTime())
  );

  const recent = hrvOnly.filter(m => new Date(m.dateISO).getTime() >= recentCutoffTs);
  const historical = hrvOnly.filter(m => {
    const ts = new Date(m.dateISO).getTime();
    return ts >= historicalCutoffTs && ts < recentCutoffTs;
  });

  result.recentN = recent.length;
  result.historicalN = historical.length;

  const medianOf = arr => {
    if (arr.length === 0) return null;
    const sorted = arr.map(m => m.value).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  result.recentMedian = medianOf(recent);
  result.historicalMedian = medianOf(historical);

  // Vaadi molemmat ikkunat n>=3 luotettavaan vertailuun (sama disipliini kuin
  // computePrimerBaselineDrift; mediaani satunnaisuus dominoi n<3:lla).
  if (result.recentN >= 3 && result.historicalN >= 3 &&
      result.recentMedian !== null && result.historicalMedian !== null &&
      result.historicalMedian > 0) {
    const driftPct = (result.recentMedian - result.historicalMedian) / result.historicalMedian;
    result.driftPct = driftPct;
    if (Math.abs(driftPct) > 0.10) {
      result.status = "warning";
    }
  }
  return result;
}

// v4.38.0: Behrmann et al. 2025 (Sensors) -löydös EnodePro-validaatiosta:
// MAPE 4-42%, yliarviointi systemaattinen erityisesti hitailla nopeuksilla
// (<0.5 m/s) bench/squat-pohjadatassa. Streetlifting-V1RM-alueella (squat 0.30,
// bench 0.17, weighted pull-up 0.23, dip 0.20, deadlift 0.14) Enoden 1RM-prediktio
// on epäluotettava. Käytä trendiseurantaan; älä valitse kisapäivän openeria
// pelkän velocity-e1RM:n perusteella. Hernández-Belmonte 2025 + Lemus 2024
// vahvistavat: GymAware RS on ainoa bias-vapaa LPT advanced-tason atleeteille.
const ENODE_LOW_VELOCITY_CAVEAT = "Enode-mittaus tällä hidasalueella (alle 0,5 m/s) yliarvioi nopeutta hieman. Käytä mittauksia trendin seuraamiseen — älä luota yksittäiseen lukuun kisapäivän opener-valinnassa.";

function computeLoadVelocityProfile(sets, bodyweightKg, options = {}) {
  // v4.34.25: movementName lisätty MVT-haulle
  const { isBarbell = false, currentE1RMExternal = null, movementName = null } = options;
  if (!sets || sets.length === 0) {
    return { points: [], slope: null, intercept: null, v1rmEstimate: null, e1rmCrossCheck: null, n: 0, mvt: null };
  }

  // Suodata: vain single-rep-setit joilla velocityMean tallennettuna.
  // Velocity-input-gating (index.html) varmistaa että vain ankkuripisteisiin
  // kirjataan velocity → presence of velocityMean + reps===1 on riittävä suodatin.
  // Ei rajoiteta setRoleen koska secondary-slot-top-singlet tallentuvat
  // "accessory"-rolena save-layerissa.
  // v4.34.25: testit voivat ohittaa reps-suodattimen (anchorit ovat synteettisiä)
  const anchors = sets.filter(s =>
    (s.velocityMean !== null && s.velocityMean !== undefined) &&
    (s.externalLoadKg !== null && s.externalLoadKg !== undefined)
  );

  if (anchors.length < 2) {
    return { points: anchors.map(a => ({
      loadPct: null, velocity: a.velocityMean, dateISO: a.dateISO || a.timestamp || null,
      externalLoadKg: a.externalLoadKg, systemLoadKg: isBarbell ? a.externalLoadKg : (a.externalLoadKg + bodyweightKg),
    })), slope: null, intercept: null, v1rmEstimate: null, e1rmCrossCheck: null, n: anchors.length, mvt: null };
  }

  // Laske loadPct jokaiselle: suhteessa ikkunan max-kuormaan
  const systemLoads = anchors.map(s => isBarbell ? s.externalLoadKg : (s.externalLoadKg + bodyweightKg));
  const maxLoad = Math.max(...systemLoads);
  const points = anchors.map((s, i) => ({
    loadPct: systemLoads[i] / maxLoad,
    velocity: s.velocityMean,
    dateISO: s.dateISO || s.timestamp || null,
    externalLoadKg: s.externalLoadKg,
    systemLoadKg: systemLoads[i],
  }));

  // Lineaarinen regressio: velocity = slope × loadPct + intercept
  const n = points.length;
  const sumX = points.reduce((a, p) => a + p.loadPct, 0);
  const sumY = points.reduce((a, p) => a + p.velocity, 0);
  const sumXY = points.reduce((a, p) => a + p.loadPct * p.velocity, 0);
  const sumXX = points.reduce((a, p) => a + p.loadPct * p.loadPct, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0 || Math.abs(denom) < 1e-9) {
    return { points, slope: null, intercept: null, v1rmEstimate: null, e1rmCrossCheck: null, n, mvt: null };
  }
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // Velocity @100% loadPct (sample-tason 100%-piste — "näytteen rajalla mitattu MVT-ennuste")
  const v1rmEstimate = slope * 1.0 + intercept;

  // v4.34.25: E1RM cross-check liike-spesifillä MVT:llä.
  // Aiempi laskenta degeneroitui maxLoad-arvoon (regressio ohitettiin). Korjattu:
  // regressio antaa loadPctAtMVT = (MVT - intercept) / slope, ja 1RM systemLoad =
  // maxLoad × loadPctAtMVT. Extrapolointi yli sample-rangen (loadPctAtMVT > 1.0)
  // sallittu — kertoo todelliseen 1RM:ään asti, ei pelkkä sample-max.
  const mvt = (movementName && MOVEMENT_MVT[movementName] !== undefined)
    ? MOVEMENT_MVT[movementName]
    : DEFAULT_MVT;
  let e1rmCrossCheck = null;

  // Sanity-tarkistukset:
  // - slope pitää olla negatiivinen (velocity laskee load:n kasvaessa)
  // - jos slope ≥ 0 tai liian lähellä nollaa → regressio epäluotettava
  // - jos loadPctAtMVT ulkopuolelle [0.5, 2.5] → epärealistinen extrapolointi
  if (slope < -0.01) {
    const loadPctAtMVT = (mvt - intercept) / slope;
    if (loadPctAtMVT > 0.5 && loadPctAtMVT < 2.5) {
      const systemAt1RM = maxLoad * loadPctAtMVT;
      e1rmCrossCheck = isBarbell ? systemAt1RM : Math.max(0, systemAt1RM - bodyweightKg);
    }
  }

  return { points, slope, intercept, v1rmEstimate, e1rmCrossCheck, n, mvt };
}

// v4.34.28: Vk 14 peaking decision-tree -kortin datapisteiden aggregointi
// (cowork-audit kohta 3.4). Kortti näyttää atleetille 6-10 datapistettä joiden
// pohjalta päättää vk 15 opener-rehearsaliin spesifi-intensiteetti (@93% vs @95%).
// Aiempi rakenne: TEKSTI-muistiinpano TI vk 14:n primaryNotessa. Tämä on
// rakenteellinen korvaaja jonka UI voi renderöidä.
function computePeakingDecisionTreeCard(ctx) {
  const { mesocycle, allSets, measurements, decisionTraces, currentE1RMExternal, primaryMovementId, dateISO, bodyweightKg } = ctx;
  if (!mesocycle || !primaryMovementId) return null;
  const wk = getMesocycleWeek(mesocycle, dateISO);
  // Aktivoituu vk 14 alusta — 1 vk ennen opener-rehearsalia (vk 15)
  if (wk !== 14) return null;

  // Datapisteet:
  // 1. Vk 12 cal-tulos (e1RM)
  const calSets = (allSets || []).filter(s =>
    s.movementId === primaryMovementId && s.setRole === "calibration"
  );
  const lastCal = calSets[calSets.length - 1] || null;
  const calE1RM = lastCal && lastCal.externalLoadKg && lastCal.reps
    ? Math.round(e1rmAccessory(lastCal.externalLoadKg, lastCal.reps, lastCal.actualVx ?? 1) * 10) / 10
    : null;

  // 2. Vk 12 → vk 14 e1RM-trendi (kasvanut/vakio/laskenut)
  const e1rmTrendDelta = (calE1RM !== null && currentE1RMExternal !== null)
    ? Math.round((currentE1RMExternal - calE1RM) * 10) / 10
    : null;

  // 3. HRV-trendi viim. 7 pv vs baseline
  // v4.52.16 H-007 B1 (A1): m.hrv → m.type === "HRV" && m.value (sama
  // tallennusformaatin bug-korjaus kuin computeDataSourceStatus:ssa).
  const hrvRecent = (measurements || [])
    .filter(m => m && m.type === "HRV" && m.value != null)
    .slice(-7);
  const hrvAvg = hrvRecent.length > 0
    ? Math.round((hrvRecent.reduce((a, m) => a + m.value, 0) / hrvRecent.length) * 10) / 10
    : null;

  // 4. MPV viim. mittaus
  const mpvRecent = (measurements || []).filter(m => m.mpv != null);
  const mpvLast = mpvRecent.length > 0 ? mpvRecent[mpvRecent.length - 1].mpv : null;

  // 5. Bodyweight muutos vk 12 → vk 14
  // v4.52.19 H-011 P1b (JS2): kanoninen bodyweight-kuvio m.type === "bodyweight"
  // && m.value (sama kuin 7091/8063). Aiempi m.bodyweightKg luki olematonta kenttää.
  const bwMeasurements = (measurements || []).filter(m => m && m.type === "bodyweight" && m.value != null).slice(-14);
  const bwDelta = bwMeasurements.length >= 2
    ? Math.round((bwMeasurements[bwMeasurements.length - 1].value - bwMeasurements[0].value) * 10) / 10
    : null;

  // 6. Vk 12 cal-päivän actualVx-mediaani (kuinka helposti meni)
  const lastCalVx = lastCal?.actualVx ?? null;

  // 7. Velocity vk 12 cal-sessiossa (jos Enode käytössä)
  const lastCalVelocity = lastCal?.velocityMean ?? null;

  // 8. Decision-tracet vk 13-14 ajalta — onko E1RM_INFLATION_CAP, FAILURE_LOCKOUT laukennut?
  const recentTraces = (decisionTraces || []).filter(t => {
    if (!t.recId) return false;
    return ["E1RM_INFLATION_CAP", "E1RM_DEFLATION_CAP", "FAILURE_LOCKOUT", "PROGRESSION_RATE_LIMIT"].includes(t.ruleId);
  });
  const ruleFreqRecent = {};
  for (const t of recentTraces) {
    ruleFreqRecent[t.ruleId] = (ruleFreqRecent[t.ruleId] || 0) + 1;
  }

  // 9. Predicted PR @95% vs @93% — paljonko kuorma eroaa absoluuttisesti
  const load93 = currentE1RMExternal !== null ? Math.round(currentE1RMExternal * 0.93 * 4) / 4 : null;
  const load95 = currentE1RMExternal !== null ? Math.round(currentE1RMExternal * 0.95 * 4) / 4 : null;

  // 10. Suositus-tier perustuen datapisteisiin
  const positiveSignals = [];
  const negativeSignals = [];
  if (e1rmTrendDelta !== null && e1rmTrendDelta > 2) positiveSignals.push(`e1RM noussut +${e1rmTrendDelta} kg vk 12:sta`);
  else if (e1rmTrendDelta !== null && e1rmTrendDelta < -2) negativeSignals.push(`e1RM laskenut ${e1rmTrendDelta} kg vk 12:sta`);
  if (lastCalVx !== null && lastCalVx >= 2) positiveSignals.push(`vk 12 cal Vx ${lastCalVx} (selvä margin)`);
  else if (lastCalVx !== null && lastCalVx <= 0) negativeSignals.push(`vk 12 cal Vx ${lastCalVx} (failure)`);
  if (ruleFreqRecent.FAILURE_LOCKOUT) negativeSignals.push(`FAILURE_LOCKOUT laukennut ${ruleFreqRecent.FAILURE_LOCKOUT}× viim. päätöksissä`);
  if (ruleFreqRecent.E1RM_INFLATION_CAP) negativeSignals.push(`INFLATION_CAP rajoittanut ${ruleFreqRecent.E1RM_INFLATION_CAP}×`);

  let recommendation = "neutral";
  if (positiveSignals.length >= 2 && negativeSignals.length === 0) recommendation = "consider-95";
  else if (negativeSignals.length >= 1) recommendation = "stay-93";

  return {
    week: 14,
    datapoints: {
      vk12CalE1RM: calE1RM,
      vk12CalVx: lastCalVx,
      vk12CalVelocity: lastCalVelocity,
      currentE1RMExternal: currentE1RMExternal !== null ? Math.round(currentE1RMExternal * 10) / 10 : null,
      e1rmTrendDelta,
      hrvAvg7d: hrvAvg,
      mpvLast,
      bodyweightDelta: bwDelta,
      ruleFreqRecent,
      load93,
      load95,
    },
    positiveSignals,
    negativeSignals,
    recommendation, // "consider-95" | "stay-93" | "neutral"
    rationale: recommendation === "consider-95"
      ? `Datapisteet tukevat @95%-yritystä: ${positiveSignals.join("; ")}.`
      : recommendation === "stay-93"
      ? `Pidä @93% — riskisignaaleja: ${negativeSignals.join("; ")}.`
      : "Ei selvää signaalia — pidä @93% (default-konservatiivinen).",
    note: "Päätös atleetilla, ei automaattinen. Pritchard 2016: peak-intensity 90-95% × 1.9±0.8 vk pre-comp.",
  };
}

// v4.34.27: VBT (Velocity-Based Training) Reliability-portti.
// Ennen kuin velocity-pohjainen e1RM voi haastaa Vx-pohjaisen primary-haarana,
// sen on osoitettava luotettavuutensa kahdella kriteerillä:
//   1. n ≥ 10 ankkuripistettä viim. 4 vk (tarpeeksi dataa regressiolle)
//   2. |velocity-e1RM − Vx-e1RM| / Vx-e1RM ≤ 5% (konvergenssi)
//
// Hysteresis: kun jo promoted, demote-kynnys = 8% (ei flikkaa edestakaisin
// 5-7% rajalla). Tämä noudattaa cowork-arvioinnin reliability-portti -mallia
// (kohta 4 vk 1-3 punchlistissa).
//
// MVP: yksi diff-arvio per kutsu — ei vielä convergence-historia (joka vaatisi
// session-tason snapshotteja). Voi lisätä myöhemmin kun datapintaa kertyy.
const VBT_MIN_ANCHORS = 10;
const VBT_ANCHOR_WINDOW_DAYS = 28;
const VBT_PROMOTE_THRESHOLD = 0.05;  // 5%
const VBT_DEMOTE_THRESHOLD = 0.08;   // 8% — hysteresis

// v4.38.0 (Phase 1D): L-V-profiilin detraining decay -aikatriggerit.
// Tutkimusaukko spesifiselle slope/intercept-driftille (Häkkinen 2000 / Hortobágyi
// 1993 / Hwang 2017 lähimmät proxy:t — strength-decay 1 vk merkityksetön, 2 vk
// pieni, ≥ 3 vk slope todennäköisesti loivenee). Kynnykset coaching-päätöksiä,
// ei suoraa peer-reviewed-evidenssiä elite-tasolla.
//   - 14 pv ilman uusia ankkureita → freshness="stale" (warning, regressio toimii)
//   - 21 pv ilman uusia ankkureita → freshness="needs-recalibration" (blokkaa
//     promotion, suosittelee 2-piste mini-L-V-vahvistustestiä)
const VBT_STALE_PROFILE_DAYS = 14;
const VBT_FORCE_RECAL_DAYS = 21;

function computeVBTPromotionStatus(allSets, movementId, currentE1RMExternal, options = {}) {
  const isBarbell = options.isBarbell === true;
  const bodyweightKg = options.bodyweightKg || 91;
  const movementName = options.movementName || null;
  const previouslyPromoted = options.previouslyPromoted === true;
  const todayISOArg = options.todayISO || todayISO();

  if (!movementId || !currentE1RMExternal || currentE1RMExternal <= 0) {
    return {
      status: "not-eligible",
      anchorCount: 0,
      diffPct: null,
      reason: "movementId tai e1RM puuttuu",
      recommendedE1RM: null,
      velocityE1RM: null,
      vxE1RM: currentE1RMExternal || null,
      // v4.38.3: rakenne yhdenmukainen muiden return-haarojen kanssa
      mvt: null,
      deviceCaveat: null,
      freshness: "no-data",
      daysSinceLastAnchor: null,
      latestAnchorDate: null,
    };
  }

  // Filter ankkuripisteet: viim. 28 päivää, oikeassa liikkeessä, velocityMean tallennettu
  const cutoff = new Date(todayISOArg);
  cutoff.setDate(cutoff.getDate() - VBT_ANCHOR_WINDOW_DAYS);
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  const anchors = allSets.filter(s =>
    s.movementId === movementId &&
    s.velocityMean !== null && s.velocityMean !== undefined &&
    s.externalLoadKg !== null && s.externalLoadKg !== undefined &&
    (s.dateISO || s.timestamp || "9999-12-31") >= cutoffISO
  );

  if (anchors.length < VBT_MIN_ANCHORS) {
    return {
      status: "not-eligible",
      anchorCount: anchors.length,
      diffPct: null,
      reason: `Vain ${anchors.length}/${VBT_MIN_ANCHORS} ankkuripistettä viim. ${VBT_ANCHOR_WINDOW_DAYS} pv`,
      recommendedE1RM: null,
      velocityE1RM: null,
      vxE1RM: currentE1RMExternal,
      mvt: null,
      deviceCaveat: null,
      freshness: "no-data",
      daysSinceLastAnchor: null,
      latestAnchorDate: null,
    };
  }

  // v4.38.0 (Phase 1D): Freshness-tarkistus ennen regressiota. Etsi viim.
  // ankkuripiste ja laske ikä päivinä today:hyn nähden. 14 pv → stale-flag,
  // 21 pv → blokkaa promotion + suosittele mini-L-V-rekalibrointia.
  const latestAnchorDate = anchors
    .map(s => s.dateISO || (s.timestamp ? s.timestamp.slice(0, 10) : null))
    .filter(Boolean)
    .sort()
    .pop() || null;
  let freshness = "fresh";
  let daysSinceLastAnchor = null;
  if (latestAnchorDate) {
    const today = new Date(todayISOArg);
    const last = new Date(latestAnchorDate);
    daysSinceLastAnchor = Math.floor((today - last) / (1000 * 60 * 60 * 24));
    if (daysSinceLastAnchor >= VBT_FORCE_RECAL_DAYS) freshness = "needs-recalibration";
    else if (daysSinceLastAnchor >= VBT_STALE_PROFILE_DAYS) freshness = "stale";
  }
  if (freshness === "needs-recalibration") {
    return {
      status: "not-eligible",
      anchorCount: anchors.length,
      diffPct: null,
      reason: `Malli vanhentunut: ${daysSinceLastAnchor} päivää ilman uutta dataa (raja ${VBT_FORCE_RECAL_DAYS} pv). Suositus: aja uusi kalibrointitesti ennen kuin luotat malliin uudelleen.`,
      recommendedE1RM: null,
      velocityE1RM: null,
      vxE1RM: currentE1RMExternal,
      mvt: null,
      deviceCaveat: null,
      freshness,
      daysSinceLastAnchor,
      latestAnchorDate,
    };
  }

  const lvProfile = computeLoadVelocityProfile(anchors, bodyweightKg, {
    isBarbell, currentE1RMExternal, movementName,
  });

  if (lvProfile.e1rmCrossCheck === null) {
    return {
      status: "not-eligible",
      anchorCount: anchors.length,
      diffPct: null,
      reason: "LV-regressio epäluotettava (slope ≥ 0 tai loadPct@MVT ulkopuolelle [0.5, 2.5])",
      recommendedE1RM: null,
      velocityE1RM: null,
      vxE1RM: currentE1RMExternal,
      mvt: lvProfile.mvt,
      deviceCaveat: (lvProfile.mvt !== null && lvProfile.mvt < 0.5) ? ENODE_LOW_VELOCITY_CAVEAT : null,
      freshness,
      daysSinceLastAnchor,
      latestAnchorDate,
    };
  }

  const diffPct = Math.abs(lvProfile.e1rmCrossCheck - currentE1RMExternal) / currentE1RMExternal;
  const threshold = previouslyPromoted ? VBT_DEMOTE_THRESHOLD : VBT_PROMOTE_THRESHOLD;
  const status = diffPct <= threshold ? "promoted" : "candidate";

  // v4.38.0 (Phase 1D): stale-warning lisätään reason-tekstiin jos profiili
  // 14–20 päivää vanha (operationaalinen mutta käyttäjä saa varoituksen).
  const staleWarn = freshness === "stale"
    ? ` ⚠ Stale profile: ${daysSinceLastAnchor} pv ilman uutta ankkuria — Häkkinen-tyyppinen detraining-drift mahdollinen, harkitse mini-L-V-vahvistusta.`
    : "";

  return {
    status,
    anchorCount: anchors.length,
    diffPct,
    promoteThreshold: VBT_PROMOTE_THRESHOLD,
    demoteThreshold: VBT_DEMOTE_THRESHOLD,
    reason: (status === "promoted"
      ? `${anchors.length} ankkuripistettä · ±${(diffPct * 100).toFixed(1)}% diff (${previouslyPromoted ? "demote" : "promote"} ≤ ${(threshold * 100)}%)`
      : `${anchors.length} ankkuripistettä · ±${(diffPct * 100).toFixed(1)}% diff yli kynnyksen ${(threshold * 100)}%`) + staleWarn,
    recommendedE1RM: status === "promoted" ? lvProfile.e1rmCrossCheck : null,
    velocityE1RM: lvProfile.e1rmCrossCheck,
    vxE1RM: currentE1RMExternal,
    mvt: lvProfile.mvt,
    deviceCaveat: (lvProfile.mvt !== null && lvProfile.mvt < 0.5) ? ENODE_LOW_VELOCITY_CAVEAT : null,
    freshness,
    daysSinceLastAnchor,
    latestAnchorDate,
  };
}

// ═══════════════════════════════════════════════════════════════
// RTF (Reps-to-Failure) -velocity-malli — Jukic 2024 yksilöllinen RIR-velocity
// ═══════════════════════════════════════════════════════════════
//
// v4.38.2 (Phase 3): Jukic et al. 2024 (Scand J Med Sci Sports) -metodi yksilöllisen
// RIR-velocity-mallin rakentamiseen yhdestä RTF-testistä per liike. Mean error
// alle 2 reps populaatio-mappauksesta (Halperin 2022, Mansfield 2023, Paulsen
// 2025: yksilöllinen r² ~0.95+ vs populaatio 0.45–0.49).
//
// Datankeruu:
//   AMRAP-sarja kiinteällä kuormalla, jokaisen rep:n MV mitattuna.
//   Set-rooli "rtf_test", mvReps[] sisältää rep-by-rep MV:t.
//
// Mallin rakennus:
//   Jokaisesta rtf-setistä rep i (0-indexed) kun M = total reps:
//     RIR_i = M - 1 - i  (rep 0 → korkein RIR, rep M-1 → 0 RIR)
//   Velocity_i = mvReps[i]
//   Yhdistä kaikki (RIR, velocity) -pisteet → lineaarinen regressio:
//     velocity = intercept + slope × RIR
//   Tulkinta:
//     - intercept = V@failure (RIR 0) = yksilöllinen MVT
//     - slope     = m/s per RIR-yksikkö
//
// Käyttö (Phase 3.5):
//   Kun targetRir tunnetaan (esim. peaking RIR 1):
//     velocity_at_target = intercept + slope × targetRir
//     VL_cap = (rep1_velocity - velocity_at_target) / rep1_velocity * 100
//   → yksilöllinen VL-cap populaatio-arvon sijaan.
//
// Tutkimuspohja:
//   - Jukic et al. 2024 (Scand J Med Sci Sports) — 1 RTF-testi riittää r² > 0.95
//   - Halperin et al. 2022 (Sports Med scoping review) — RIR-tarkkuuden modulaattorit
//   - Bastos et al. 2024 (Perceptual Motor Skills) — familiarisaatio-protokolla
//   - Sánchez-Moreno 2017 — pull-up rep-velocity loss vs % completed reps r² 0.88

const RTF_MIN_REPS_PER_SET = 4;        // Vähintään 4 rep AMRAPista regressioon
const RTF_MIN_SESSIONS_FOR_MODEL = 1;  // Jukic 2024: 1 sessio riittää
const RTF_R2_THRESHOLD_RELIABLE = 0.85; // Phase 3.5: yksilöllinen cap aktivoituu vain kun r² ≥ 0.85
const RTF_R2_THRESHOLD_PREVIEW = 0.70;  // UI näyttää mallin mutta varoittaa

function computeRtfVelocityModel(allSets, movementId) {
  if (!movementId || !Array.isArray(allSets)) {
    return { status: "no-data", n: 0, sessionsCount: 0, slope: null, intercept: null, r2: null };
  }
  // H-006a A3: setRole-rajoite poistettu. Aiemmin vaadittiin
  // s.setRole === "rtf_test" jotta vain dedikoidut RTF-testit kvalifioituvat.
  // Pilot-trace 2026-05-27 osoitti että Akselin profiililla RTF_MODEL_STATUS
  // = no-data, n=0 kaikissa esiintymissä koska atletti ei aja erillisiä
  // rtf_test-settejä. Pelkkä mvReps[]-täytetyn kriteerin riittävyys aktivoi
  // RTF-mallin normaaleissa work-seteissä jos atletti syöttää velocity-arvot.
  const rtfSets = allSets.filter(s =>
    s.movementId === movementId &&
    Array.isArray(s.mvReps) &&
    s.mvReps.length >= RTF_MIN_REPS_PER_SET
  );
  if (rtfSets.length === 0) {
    return { status: "no-data", n: 0, sessionsCount: 0, slope: null, intercept: null, r2: null };
  }
  if (rtfSets.length < RTF_MIN_SESSIONS_FOR_MODEL) {
    return { status: "insufficient-sessions", n: 0, sessionsCount: rtfSets.length, slope: null, intercept: null, r2: null };
  }

  // Kerää (RIR, velocity) -pisteet
  const points = [];
  const sessionIds = new Set();
  const loadsUsed = new Set();
  for (const s of rtfSets) {
    const M = s.mvReps.length;
    if (s.sessionId) sessionIds.add(s.sessionId);
    if (s.externalLoadKg) loadsUsed.add(s.externalLoadKg);
    for (let i = 0; i < M; i++) {
      const v = s.mvReps[i];
      if (typeof v === "number" && v > 0 && v <= 3.0) {
        points.push({ rir: M - 1 - i, velocity: v });
      }
    }
  }
  if (points.length < RTF_MIN_REPS_PER_SET) {
    return { status: "insufficient-points", n: points.length, sessionsCount: rtfSets.length, slope: null, intercept: null, r2: null };
  }

  // Lineaarinen regressio: velocity = intercept + slope × rir
  const n = points.length;
  const sumX = points.reduce((a, p) => a + p.rir, 0);
  const sumY = points.reduce((a, p) => a + p.velocity, 0);
  const sumXY = points.reduce((a, p) => a + p.rir * p.velocity, 0);
  const sumXX = points.reduce((a, p) => a + p.rir * p.rir, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0 || Math.abs(denom) < 1e-9) {
    return { status: "degenerate", n, sessionsCount: rtfSets.length, slope: null, intercept: null, r2: null };
  }
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // r² (selitysaste)
  const meanY = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (const p of points) {
    const yPred = intercept + slope * p.rir;
    ssTot += (p.velocity - meanY) ** 2;
    ssRes += (p.velocity - yPred) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : null;

  // Sanity: slope pitää olla positiivinen (enemmän RIR → nopeampi rep)
  // Jos negatiivinen → epäluotettava (todennäköisesti datavirhe tai tekninen ongelma)
  const isReliable = slope > 0 && r2 !== null && r2 >= RTF_R2_THRESHOLD_RELIABLE;
  const isPreviewable = slope > 0 && r2 !== null && r2 >= RTF_R2_THRESHOLD_PREVIEW;

  // Velocity ennustukset RIR 0/1/3/5 -arvoille
  const predict = (rir) => Math.max(0, intercept + slope * rir);
  const velocityAtRir = {
    0: predict(0),
    1: predict(1),
    3: predict(3),
    5: predict(5),
  };

  // Status
  let status;
  if (isReliable) status = "reliable";
  else if (isPreviewable) status = "preview";
  else status = "unreliable";

  return {
    status,
    n,
    sessionsCount: rtfSets.length,
    sessionIdsCount: sessionIds.size,
    loadsUsed: [...loadsUsed].sort((a, b) => a - b),
    slope,
    intercept,
    r2,
    velocityAtRir,
    rtfMvtIndividual: intercept,  // = V@failure = MVT yksilölliselle atletille
    builtAtISO: new Date().toISOString(),
    movementId,
    minR2Reliable: RTF_R2_THRESHOLD_RELIABLE,
    minR2Preview: RTF_R2_THRESHOLD_PREVIEW,
  };
}

// v4.38.4 (Phase 2.7A): rep 1 -tavoiterange per liike per blokki.
//
// Kaksisuuntaisen autoregulaation pohja: pelkkä VL-cap (sarjan loppupiste)
// suojaa ylitreenamiselta mutta EI tunnista alistimulaatiota (kuorma kevyt
// → rep 1 liian nopea). Range antaa rep 1 -velocity:lle hyväksyttävän
// haarukan blokin tavoite-RIR:n ympärille.
//
// Logiikka:
//   1. MVT (= V@RIR0) ≈ rtfModel.intercept jos saatavilla, muuten MOVEMENT_MVT-taulu
//   2. Slope ≈ rtfModel.slope (yksilöllinen) tai default 0.045 m/s/RIR
//      (Sánchez-Moreno 2017 -datasta keskiarvo pull-upille; toimii proxy:nä
//      muille liikkeille kunnes oma data kertyy)
//   3. Range RIR-keskelle ±1.5 RIR:
//      lower = V@(targetRir - 1.5)  ← ali = kuorma raskas
//      upper = V@(targetRir + 1.5)  ← yli = kuorma kevyt
//
// Esim. Lisäpainoleuanveto strength-blokissa (targetRir 2.5):
//   intercept 0.23, slope 0.045
//   lower = 0.23 + 0.045 × 1.0 = 0.275 m/s  (rep 1 hitaampi → kuorma liian raskas)
//   upper = 0.23 + 0.045 × 4.0 = 0.410 m/s  (rep 1 nopeampi → kuorma kevyt)
//   optimal: 0.275–0.410 m/s

const DEFAULT_RTF_SLOPE = 0.045;  // m/s/RIR proxy ennen yksilöllistä mallia
const REP1_RANGE_HALFWIDTH_RIR = 1.5;

// v4.38.5 (käyttäjäpalaute 2026-05-10): Kisaliikkeiden tunnistus pitää
// toimia myös kun movement-tietokannassa ei ole isCompetitionLift-flagia
// (vanhoissa rekisteröidyissä movements:eissa flag puuttuu — uudet
// PRESET_MOVEMENTS-asennukset saavat sen, mutta jo perustetut eivät).
// Fallback-nimet kattavat streetlifting + voimanosto + yleisimmät variantit.
const COMPETITION_LIFT_NAMES_FALLBACK = new Set([
  // Streetlifting
  "Lisäpainoleuanveto", "Lisäpainodippi", "Takakyykky", "Muscle-up",
  // Voimanosto
  "Penkkipunnerrus", "Maastaveto",
]);

function isCompetitionLiftMovement(movement) {
  if (!movement) return false;
  if (movement.isCompetitionLift === true) return true;
  return COMPETITION_LIFT_NAMES_FALLBACK.has(movement.name);
}

// v4.49.2 Q1: Grindy-bias-detection. Atletti joka jatkuvasti raportoi V3 mutta
// VBT-data näyttää e1RM-mismatchin (SIGNIFICANT, >7 %) → slot.targetVx-arvoon ei
// voi luottaa, kunnes data palautuu linjaan. Bias on tunnistettu kun ≥3 viimeisestä
// 8 sessiosta sisältää VBT_E1RM_CROSSCHECK SIGNIFICANT -tracen.
function detectGrindyBias(sessions, opts = {}) {
  const windowSize = opts.windowSize ?? 8;
  const threshold = opts.threshold ?? 3;
  const reason = { detected: false, count: 0, sessionsConsidered: 0, windowSize, threshold };
  if (!Array.isArray(sessions) || sessions.length === 0) return reason;
  const recent = sessions.slice(-windowSize);
  let significantCount = 0;
  for (const session of recent) {
    const traces = session?.decisionTraces || session?.traces || [];
    const hasSignificant = traces.some((t) => {
      if (t?.ruleId !== "VBT_E1RM_CROSSCHECK") return false;
      if (t?.after?.severity === "SIGNIFICANT") return true;
      return /SIGNIFICANT/.test(t?.why || "");
    });
    if (hasSignificant) significantCount++;
  }
  return {
    detected: significantCount >= threshold,
    count: significantCount,
    sessionsConsidered: recent.length,
    windowSize,
    threshold,
  };
}

function targetRep1VelocityRange(movementName, blockPhase, rtfModel = null, slotTargetVx = null, biasDetected = false) {
  // Resolvoi efektiivinen blokki-vaihe (sama logiikka kuin vlCapForContext:issa)
  let effectivePhase = blockPhase;
  if (movementName && /räjähtävä\s+(leuka|leuanveto)/i.test(movementName)) {
    effectivePhase = "speed-strength";
  }
  const blockDefaultRir = BLOCK_PHASE_TARGET_RIR[effectivePhase] ?? BLOCK_PHASE_TARGET_RIR.strength;

  // v4.49.2 Q1: Hybridi target-RIR. Akselin design-päätös: konservatiivisempi
  // arvo voittaa kun joko RTF-malli ei ole vielä luotettava TAI grindy-bias on
  // tunnistettu (Vx-raportointi epäluotettava). Reliable + ei-bias → luota
  // slot.targetVx:ään (preset-tekijä tietää mitä haluaa).
  let targetRir;
  let targetRirSource;
  const slotVxValid = typeof slotTargetVx === "number" && slotTargetVx >= 0;
  const isReliableModel = rtfModel && rtfModel.status === "reliable";
  if (slotVxValid && isReliableModel && !biasDetected) {
    targetRir = slotTargetVx;
    targetRirSource = "slot-targetVx-trusted";
  } else if (slotVxValid) {
    targetRir = Math.min(slotTargetVx, blockDefaultRir);
    targetRirSource = biasDetected ? "min-bias-detected-safety" : "min-rtf-uncertain";
  } else {
    targetRir = blockDefaultRir;
    targetRirSource = "block-default-fallback";
  }

  // Intercept (V@failure): ensisijaisesti rtfModel, toissijaisesti MOVEMENT_MVT
  let intercept, slope;
  if (rtfModel && rtfModel.status === "reliable" &&
      typeof rtfModel.slope === "number" && rtfModel.slope > 0 &&
      typeof rtfModel.intercept === "number" && rtfModel.intercept > 0) {
    intercept = rtfModel.intercept;
    slope = rtfModel.slope;
  } else {
    intercept = (movementName && MOVEMENT_MVT[movementName] !== undefined)
      ? MOVEMENT_MVT[movementName]
      : DEFAULT_MVT;
    slope = DEFAULT_RTF_SLOPE;
  }

  const lower = Math.max(0, intercept + slope * Math.max(0, targetRir - REP1_RANGE_HALFWIDTH_RIR));
  const upper = intercept + slope * (targetRir + REP1_RANGE_HALFWIDTH_RIR);
  const center = intercept + slope * targetRir;

  return {
    lower,
    upper,
    center,
    targetRir,
    targetRirSource,
    blockDefaultRir,
    slotTargetVx: slotVxValid ? slotTargetVx : null,
    biasDetected: !!biasDetected,
    phase: effectivePhase,
    source: (rtfModel && rtfModel.status === "reliable") ? "rtf-individual" : "default",
    intercept,
    slope,
  };
}

// Phase 3.5 helper: laskee VL-cap yksilöllisesti kun RTF-malli on saatavilla.
//   targetRir: blokki-spesifi RIR-tavoite (peaking RIR 1, strength RIR 2-3, jne.)
//   rep1Velocity: sarjan ensimmäisen rep:n MV (tarvitaan VL%-laskuun)
//   rtfModel: computeRtfVelocityModel-paluu
function vlCapFromRtfModel(rtfModel, targetRir, rep1Velocity) {
  if (!rtfModel || rtfModel.status !== "reliable") return null;
  if (typeof targetRir !== "number" || typeof rep1Velocity !== "number" || rep1Velocity <= 0) return null;
  const targetVelocity = rtfModel.intercept + rtfModel.slope * targetRir;
  if (targetVelocity <= 0 || targetVelocity >= rep1Velocity) return null;
  return ((rep1Velocity - targetVelocity) / rep1Velocity) * 100;
}

// v4.38.3 (Phase 4): Vx-velocity-konfliktin tunnistus työsarjatasolla.
//
// Atleetin grindaus-bias: hän raportoi Vx 1 vaikka velocity-data implikoi Vx 0
// tai jopa V−1. Tämä funktio käyttää RTF-mallia ennustamaan kuinka monta toistoa
// jäljellä viimeisen rep:n velocity-arvon perusteella, ja vertaa atleetin
// raportoimaan Vx:hen.
//
// Ennustelogiikka (RTF-mallin invertointi):
//   velocity = intercept + slope × RIR
//   → RIR = (velocity - intercept) / slope
//
// Käytetään viimeisen rep:n MV:tä = end-of-set proxy → predictedVx = predictedRir.
// Konflikti = abs(predictedVx - reportedVx) ≥ VX_CONFLICT_DELTA (1.5).
//
// HUOMAA: tämä on havaintoraportointi, EI auto-override (DR-synteesin
// suositus): "ÄLÄ käytä suoraa 'data overrides' -sääntöä — velocity-RIR-mallin
// epävarmuus on liian suuri ilman individualisointia". Yksilöllinen RTF-malli
// (Jukic 2024) tuo r² ~0.95, joten override on tutkimuspohjaisempi — mutta
// MVP:ssä tallennamme vain decisionTracen + UI-disclaimerin. Käyttäjä päättää
// muuttaa raportoidun Vx:n itse jos hyväksyy override:n. Phase 4.5 myöhemmin
// voi lisätä auto-konservatiivisen min(reported, predicted) -ratkaisun.

const VX_CONFLICT_DELTA = 1.5;  // Minimi-ero raportoidun ja ennustetun Vx:n välillä

function predictVxFromVelocity(mvReps, rtfModel, reportedVx = null) {
  // Pre-condition tarkistukset
  if (!Array.isArray(mvReps) || mvReps.length < 1) {
    return { status: "no-data", conflicted: false };
  }
  if (!rtfModel || rtfModel.status !== "reliable") {
    return { status: "no-rtf-model", conflicted: false };
  }
  if (typeof rtfModel.slope !== "number" || rtfModel.slope <= 0) {
    return { status: "rtf-slope-invalid", conflicted: false };
  }

  // Ennusta Vx (= RIR) viimeisen rep:n MV:stä
  const lastMv = mvReps[mvReps.length - 1];
  const rep1Mv = mvReps[0];
  if (typeof lastMv !== "number" || lastMv <= 0) {
    return { status: "invalid-last-mv", conflicted: false };
  }

  // RIR = (velocity - intercept) / slope
  const predictedVxRaw = (lastMv - rtfModel.intercept) / rtfModel.slope;
  // Clamp [0, 5] (Vx-skaala)
  const predictedVx = Math.max(0, Math.min(5, predictedVxRaw));
  const predictedVxRep1Raw = (rep1Mv - rtfModel.intercept) / rtfModel.slope;
  const predictedVxRep1 = Math.max(0, Math.min(5, predictedVxRep1Raw));

  // Konfliktin tunnistus
  let conflicted = false;
  let delta = null;
  if (typeof reportedVx === "number") {
    delta = reportedVx - predictedVx;  // positiivinen = atletti raportoi enemmän varaa
    conflicted = Math.abs(delta) >= VX_CONFLICT_DELTA;
  }

  return {
    status: "ok",
    predictedVx,
    predictedVxRaw,
    predictedVxRep1,
    reportedVx,
    delta,
    conflicted,
    conflictDelta: VX_CONFLICT_DELTA,
    direction: delta === null ? null : (delta > 0 ? "athlete-overestimates-rir" : "athlete-underestimates-rir"),
    rtfR2: rtfModel.r2,
    lastMvUsed: lastMv,
  };
}

// ═══════════════════════════════════════════════════════════════
// VL-CAP per blokki — within-set stop -autoregulaatio
// ═══════════════════════════════════════════════════════════════
//
// v4.38.1 (Phase 2): Pareja-Blanco-tradition VL-cap-arvot per blokki, kytkettynä
// päätösketjun ENSISIJAISEEN pisteeseen (within-set stop) eikä pelkkänä UI-warning.
//
// Tutkimuspohja (Pareja-Blanco 2017/2020/2023 -aalto + Galiano 2022 + Held 2022
// + Lyu 2026 + Sánchez-Moreno 2020 + Jukic 2023 "One Velocity Loss Threshold
// Does Not Fit All"):
//   Foundation/hypertrofia: 25–35 % (CSA-kasvu maksimaalinen, korkea volyymi)
//   Strength:               15–20 % (voima paremmin, väsymys minimissä)
//   Intensity:              10–15 % (explosivinen kapasiteetti, low VL)
//   Peaking:                 5–10 % (CMJ/sprint paras)
//   Speed-strength (pull):  10–15 % (Sánchez-Moreno 2020 VL25 > VL50)
//
// Default-arvot ovat range-keskellä; settings-overridable per blokki.
//
// "Low-V1RM grinder" -profiilille (Akseli) konservatiivisemmat arvot ovat
// perusteltuja koska sama VL-% kohdistuu alempaan absoluuttiseen velocity-
// alueeseen → fatigue-kuormitus per VL-prosentti suurempi (Jukic 2023).
//
// Atleetin RTF-velocity-mallin (Phase 3) jälkeen nämä arvot voidaan kalibroida
// yksilöllisesti — toistaiseksi default = range-keskellä.
const VL_CAP_PER_BLOCK = Object.freeze({
  foundation: 30,        // 25–35 % range-keskellä
  hypertrophy: 30,       // 25–35 % MAV-zone (Pareja-Blanco 2017 PMC5497611)
  strength: 17.5,        // 15–20 %
  intensity: 12.5,       // 10–15 %
  peaking: 7.5,          //  5–10 %
  "speed-strength": 12.5,// 10–15 % räjähtäville pull-up-varianteille
});

// v4.38.3 (Phase 3.5): Blokki-spesifi target-RIR yksilölliselle cap-laskennalle
// RTF-mallista. Mid-range-arvot synteesin VL-cap-rangeista, jotka karkeasti
// vastaavat: korkea VL → korkea RIR (paljon väsymystä), matala VL → matala RIR.
// Foundation  25-35% → RIR 4 (mid 4-5 = paljon varaa)
// Hypertrophy 25-35% → RIR 2.5 (MAV-mid-range, V2-V3 - lähempänä failurea kuin foundation)
// Strength    15-20% → RIR 2.5 (mid 2-3)
// Intensity   10-15% → RIR 1.5 (mid 1-2)
// Peaking      5-10% → RIR 1   (mid 0-1, peak-vaiheen raskaat singlet)
// Speed       10-15% → RIR 4   (mid 4-5 = nopeuden säilytys, ei väsymystä)
//
// v4.49.2 MED-4: Lisätty hypertrophy: 2.5. Hypertrofia-meson slot.targetVx (2-3)
// vertailtiin aiemmin foundation-default 4:ää vasten → K2-false-positiveja
// elite-female-hypertrophy:lla. Nyt hypertrofia-meso saa oman target-RIR-arvon.
const BLOCK_PHASE_TARGET_RIR = Object.freeze({
  foundation: 4,
  hypertrophy: 2.5,
  strength: 2.5,
  intensity: 1.5,
  peaking: 1,
  "speed-strength": 4,
});

// Blokki-vaihe heuristiikka exercise-kontekstista. Speed-strength tunnistetaan
// liikkeen nimestä (Räjähtävä leuanveto / Räjähtävä leuka -variantit) tai
// dayType==="speed" + targetVx >= 4.
//
// v4.38.3 (Phase 3.5): RTF-mallin yksilöllinen cap-laskenta.
//   Jos rtfModel.status === "reliable" ja rep1Velocity > 0:
//     1. Resolvoi blokki-vaihe (kuten ennen)
//     2. Hae targetRir BLOCK_PHASE_TARGET_RIR-mapista
//     3. Laske velocity_at_target = rtfModel.intercept + rtfModel.slope × targetRir
//     4. cap_individual = (rep1Velocity - velocity_at_target) / rep1Velocity * 100
//     5. Source = "rtf-individual" (UI näyttää badge:n)
//   Muuten fallback nykyiseen logiikkaan (settings → defaults).
function vlCapForContext(ctx = {}) {
  const { blockPhase = null, exerciseName = null, dayType = null, targetVx = null, settings = {},
          rtfModel = null, rep1Velocity = null, emitTrace = null } = ctx;

  function resolve() {
    // Resolvoi efektiivinen blokki-vaihe (sama logiikka kuin defaultien valinnassa)
    let effectivePhase;
    let defaultSource;
    const isSpeedStrengthMovement = exerciseName && /räjähtävä\s+(leuka|leuanveto)/i.test(exerciseName);
    const isSpeedDay = dayType === "speed" && typeof targetVx === "number" && targetVx >= 4;
    if (isSpeedStrengthMovement || isSpeedDay) {
      effectivePhase = "speed-strength";
      defaultSource = isSpeedStrengthMovement ? "movement-name" : "speed-day";
    } else if (["foundation", "hypertrophy", "strength", "intensity", "peaking"].includes(blockPhase)) {
      effectivePhase = blockPhase;
      defaultSource = "block-phase";
    } else {
      effectivePhase = "default";
      defaultSource = "fallback";
    }

    // RTF-yksilöllinen cap jos malli reliable + rep1Velocity saatavilla
    if (rtfModel && rtfModel.status === "reliable" &&
        typeof rep1Velocity === "number" && rep1Velocity > 0 &&
        typeof rtfModel.slope === "number" && typeof rtfModel.intercept === "number") {
      const targetRir = BLOCK_PHASE_TARGET_RIR[effectivePhase] ?? BLOCK_PHASE_TARGET_RIR.strength;
      const velocityAtTarget = rtfModel.intercept + rtfModel.slope * targetRir;
      if (velocityAtTarget > 0 && velocityAtTarget < rep1Velocity) {
        const capIndividual = ((rep1Velocity - velocityAtTarget) / rep1Velocity) * 100;
        // Sanity-check: yksilöllinen cap tulisi olla 3–60 % välillä — ulkopuolelle
        // jäävät arvot viittaavat mallin epäluotettavuuteen tai poikkeavaan rep1:een.
        if (capIndividual >= 3 && capIndividual <= 60) {
          return {
            cap: capIndividual,
            phase: effectivePhase,
            source: "rtf-individual",
            targetRir,
            velocityAtTargetRir: velocityAtTarget,
            rtfR2: rtfModel.r2,
          };
        }
      }
    }

    // Fallback: populaatio-default + settings-override (Phase 2 -käyttäytyminen)
    if (effectivePhase === "speed-strength") {
      return {
        cap: settings.vlCapSpeedStrength ?? VL_CAP_PER_BLOCK["speed-strength"],
        phase: "speed-strength",
        source: defaultSource,
        targetRir: BLOCK_PHASE_TARGET_RIR["speed-strength"],
      };
    }
    switch (effectivePhase) {
      case "foundation":
        return { cap: settings.vlCapFoundation ?? VL_CAP_PER_BLOCK.foundation, phase: "foundation", source: "block-phase", targetRir: BLOCK_PHASE_TARGET_RIR.foundation };
      case "hypertrophy":
        return { cap: settings.vlCapHypertrophy ?? VL_CAP_PER_BLOCK.hypertrophy, phase: "hypertrophy", source: "block-phase", targetRir: BLOCK_PHASE_TARGET_RIR.hypertrophy };
      case "strength":
        return { cap: settings.vlCapStrength ?? VL_CAP_PER_BLOCK.strength, phase: "strength", source: "block-phase", targetRir: BLOCK_PHASE_TARGET_RIR.strength };
      case "intensity":
        return { cap: settings.vlCapIntensity ?? VL_CAP_PER_BLOCK.intensity, phase: "intensity", source: "block-phase", targetRir: BLOCK_PHASE_TARGET_RIR.intensity };
      case "peaking":
        return { cap: settings.vlCapPeaking ?? VL_CAP_PER_BLOCK.peaking, phase: "peaking", source: "block-phase", targetRir: BLOCK_PHASE_TARGET_RIR.peaking };
      default:
        return {
          cap: settings.vlStopPercent ?? VL_CAP_PER_BLOCK.strength,
          phase: "default",
          source: "fallback",
          targetRir: null,
        };
    }
  }

  const result = resolve();
  // H-019 B-C2b (B2-invariantti): tutkimuskaton yläraja phase-kohtaisesti — intensity
  // ≤ 15 %, peaking ≤ 10 % (CLAUDE.md §2). Invariantti (taso 2) voittaa sekä settings-
  // overriden että RTF-yksilöllisen capin — yksilöllistys elää katon ALLA (Jukic 2023:
  // yksi kynnys ei sovi kaikille, mutta peaking-vaiheen tutkimusband on silti katto).
  const _phaseCeil = { intensity: 15, peaking: 10 };
  const _invCeil = _phaseCeil[result.phase];
  if (typeof _invCeil === "number" && typeof result.cap === "number" && result.cap > _invCeil) {
    result.capUnclamped = result.cap;
    result.cap = _invCeil;
    result.invariantClamped = true;
  }
  // v4.49.2 QF-5: emit VL_CAP_RESOLVED-trace jos kutsuja antoi emitTrace-callbackin.
  // Mahdollistaa audit-enginen verifioida VL-cap-arvoja (cap%, source, targetRir)
  // ilman että cap pitää inferoida slot.velocityStop:ista tai testata erikseen.
  if (typeof emitTrace === "function") {
    emitTrace({
      ruleId: "VL_CAP_RESOLVED",
      before: { phase: blockPhase, exerciseName, dayType, targetVx },
      after: {
        cap: result.cap,
        source: result.source,
        targetRir: result.targetRir ?? null,
        effectivePhase: result.phase,
      },
      why: `VL-cap ${result.cap.toFixed(1)}% (phase=${result.phase}, source=${result.source})`,
    });
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT DAY PLAN GENERATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a full day plan with primary + accessories based on dayType.
 * This ensures the user ALWAYS gets a complete program, even if the
 * mesocycle weekPlan didn't have an entry for today's weekday.
 */
function generateDefaultDayPlan(dayType, weekDef, accessoryCapActive) {
  const primaryReps = weekDef?.heavyReps || (dayType === "volume" ? 5 : dayType === "speed" ? 2 : 3);
  const primaryVx = weekDef?.heavyTargetVx || (dayType === "volume" ? 3 : dayType === "speed" ? 4 : 2);
  const primarySets = dayType === "volume" ? 5 : dayType === "speed" ? 4 : 5;

  const slots = [
    { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: primarySets, reps: primaryReps, targetVx: primaryVx },
  ];

  // Heavy: add back-off sets (3×5 @-10% with higher Vara target)
  if (dayType === "heavy") {
    slots.push(
      { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto (back-off)", sets: 3, reps: 5, targetVx: 3 },
      { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 4, reps: 6, targetVx: 3 },
      { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 8, targetVx: 3 },
      { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 10, targetVx: null },
    );
  } else if (dayType === "volume") {
    slots.push(
      { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 4, reps: 8, targetVx: 3 },
      { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 3, reps: 10, targetVx: 3 },
      { role: "accessory", category: "ojentajaekstensio", defaultMovementName: "Tricep pushdown", sets: 3, reps: 12, targetVx: null },
    );
  } else if (dayType === "speed") {
    slots.push(
      { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 3, reps: 10, targetVx: 4 },
      { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hammer curl", sets: 2, reps: 10, targetVx: null },
    );
  }

  return { dayOfWeek: null, dayType, slots };
}

// ═══════════════════════════════════════════════════════════════
// VELOCITY LOSS %
// ═══════════════════════════════════════════════════════════════

function velocityLossPercent(rep1Velocity, lastRepVelocity) {
  if (!rep1Velocity || !lastRepVelocity || rep1Velocity <= 0) return null;
  return ((rep1Velocity - lastRepVelocity) / rep1Velocity) * 100;
}

// v4.49.2 QF-1: Helms 2017 -warmup-ramp default-skeleton. Käytetään kun preset ei
// määrittele primary-slot.warmupSets:ia (default-meso, beginner/returner/cut/shoulder/
// uncalibrated -profiilit). UI:n hardcoded fallback käyttää tätä samaa scheme:a kun
// skeletonia ei ole, mutta tämä injektio takaa että slot.warmupSets on aina olemassa
// trace-outputissa ja audit ei laukea K1-warning:iä.
const ENGINE_DEFAULT_WARMUP_RAMP = Object.freeze([
  Object.freeze({ pct: 0.40, reps: 5, note: "Liikemalli, kevyt" }),
  Object.freeze({ pct: 0.55, reps: 3, note: "Lämpö" }),
  Object.freeze({ pct: 0.70, reps: 2, note: "Aktivaatio" }),
  Object.freeze({ pct: 0.85, reps: 1, note: "Neural primer" }),
]);

// v4.49.2 QF-5: blockPhase-päättely VL_CAP_RESOLVED-tracen ja muiden phase-tietoisten
// trace-pisteiden tueksi. Samaa heuristiikkaa kuin audit-engine.mjs deriveBlockPhase,
// jotta auditti ja engine pysyvät samalla mappauksella.
function deriveBlockPhaseFromMesocycle(mesocycleType, weekNum, weekLabel) {
  const label = String(weekLabel || "");
  if (/deload|kevennys|recovery/i.test(label)) return "deload";
  if (/peak|peaking|kisaviikko/i.test(label)) return "peaking";
  if (/intens|realisoint|maks/i.test(label)) return "intensity";
  if (/strength/i.test(label)) return "strength";
  // v4.49.2 MED-4: hypertrofia-meson labelit ("Volyymipohja", "Volyymilataus",
  // "Volyymipeak") ovat MAV-vaihetta (V2-V3, RIR 2.5) — eivät foundation-RIR 4:ää.
  if (mesocycleType === "hypertrofia") {
    if (weekNum === 4) return "deload";
    if (typeof weekNum === "number" && weekNum >= 1 && weekNum <= 3) return "hypertrophy";
    return null;
  }
  if (/hyper|foundation|vol|adapt|progress/i.test(label)) return "foundation";
  if (mesocycleType === "streetlifting_16w") {
    if (weekNum === 4 || weekNum === 8 || weekNum === 12) return "deload";
    if (weekNum <= 3) return "foundation";
    if (weekNum <= 7) return "strength";
    if (weekNum <= 11) return "intensity";
    return "peaking";
  }
  if (weekNum === 4) return "deload";
  if (typeof weekNum === "number" && weekNum >= 1 && weekNum <= 3) return "foundation";
  return null;
}

// ═══════════════════════════════════════════════════════════════
// SUGGESTION TIERS (v4.50.0 Track B 2D-δ)
// ═══════════════════════════════════════════════════════════════
//
// Adaptive multi-suggestion: engine tuottaa 2-3 ehdotusta per sessio
// hybridi-päätösstrategioilla (slot.targetVx + bias-detection + RTF-malli +
// readiness + cap-state + VBT-status). Tier-arvot johdetaan aritmeettisesti
// nykyisestä TARGET-laskennasta — laskentaketju säilyy bittitarkasti.
//
// Spacing-perustelu (Helms 2018 + Akselin design-päätös Q2; SAFE-Vx tarkennettu
// K-A2-invariantilla deedc1a 2026-05-19 — alkuperäinen "+1 Vx" hylätty koska se
// nostaa Epley-e1RM:ää pelkällä −1,5 % kuormalla → safe.e1RM ≤ target.e1RM rikkoutuu):
//   SAFE       = TARGET kuorma × 0.985, SAMA targetVx (K-A2 e1RM-monotonia)
//   TARGET     = nykyinen recommend() (backward-compat ankkuri)
//   AGGRESSIVE = TARGET kuorma × 1.015, targetVx − 1 (lähempänä failurea)
//
// Suppression (Akselin Q1 B-päätös): AGGRESSIVE piilotetaan kun konteksti
// ei tue korkeampaa stimulusta (cap, failure, bias, RTF !reliable, deload,
// speed/competition-päivä). Suppressed-tila kirjoitetaan SUGGESTION_SUPPRESSED-
// traceen audit-todistettavuuden vuoksi.
//
// Backward compat (Akselin Q4 A-päätös): rec.targetExternalLoad / targetVx /
// deltaPct säilyvät TARGET-tier:n arvoina. Atletin valinta tallennetaan
// session-recordiin erikseen (session.selectedSuggestionId + valitut arvot).
function generateSuggestions(ctx) {
  const {
    targetExternalLoad,
    targetVx,
    deltaPct,
    targetReps,
    setCount,
    capLevel,
    hadFailure,
    grindyBiasDetected,
    rtfModelStatus,
    blockPhase,
    dayType,
    preferredBias,
    aggressivenessLearned,
    lastSessionDemonstratedKg,
  } = ctx;

  const SAFE_SPACING = 0.015;       // 1.5 pp kevyempi
  const AGGRESSIVE_SPACING = 0.015; // 1.5 pp raskaampi
  const VX_OFFSET = 1;              // ±1 Vx tier-välien välillä

  const targetSuggestion = {
    id: "target",
    label: "Tavoite",
    deltaPct: typeof deltaPct === "number" ? deltaPct : 0,
    targetVx,
    targetExternalLoad,
    setCount,
    targetReps,
    rationaleShort: "Engine-suositus nykyisestä progressiosta",
  };

  const loadIsNumeric = typeof targetExternalLoad === "number" && targetExternalLoad > 0;

  // SAFE-tier: aina näkyvissä jos kuorma laskettavissa.
  // Konservatiivisempi vaihtoehto on aina turvallinen — atletti voi valita
  // tämän väsyneenä ilman engine-veto-oikeutta.
  let safeSuggestion = null;
  if (loadIsNumeric) {
    const safeLoadBase = roundToHalf(targetExternalLoad * (1 - SAFE_SPACING));
    // K3-4 (retro-kenttä OBS-B2): historia-tietoinen VAROVAINEN. Pelkkä −1,5 pp targetista
    // ei erotu (kenttäcase: "varovainen vain 1 kg kevyempi") ja voi jopa YLITTÄÄ viime
    // session tason kun progressio nostaa targetia (kenttäcase: safe 165 = +5 kg vs viime
    // viikko). Konservatiivinen vaihtoehto = korkeintaan viime session demonstroitu kesto-
    // taso (viimeinen target-Vx:n täyttänyt sarja / mediaani). Vain alaspäin — jos historia
    // puuttuu tai on targetia korkeampi (esim. paluuramppi), spacing-taso säilyy.
    const historyCap = (typeof lastSessionDemonstratedKg === "number" && lastSessionDemonstratedKg > 0)
      ? roundToHalf(lastSessionDemonstratedKg) : null;
    const historyCapped = historyCap !== null && historyCap < safeLoadBase;
    const safeLoad = historyCapped ? historyCap : safeLoadBase;
    const safeVx = typeof targetVx === "number" ? targetVx : null;
    safeSuggestion = {
      id: "safe",
      label: "Varovainen",
      deltaPct: (typeof deltaPct === "number" ? deltaPct : 0)
        - (historyCapped ? (1 - safeLoad / targetExternalLoad) : SAFE_SPACING),
      targetVx: safeVx,
      targetExternalLoad: safeLoad,
      setCount,
      targetReps,
      historyCapped,
      rationaleShort: historyCapped
        ? "Konservatiivinen — viime session näytetty taso, ei progressiota"
        : "Konservatiivinen — enemmän varaa ja kevyempi kuorma",
    };
  }

  // AGGRESSIVE-tier: suppression-tarkistus. Piilotetaan kun konteksti ei
  // tue korkeampaa stimulusta. Jokainen syy kirjataan suppressedReasons:iin
  // jotta audit + UI voi näyttää miksi.
  const suppressedReasons = [];
  if (typeof capLevel === "number" && capLevel >= 1) suppressedReasons.push("readiness-cap");
  if (hadFailure) suppressedReasons.push("recent-failure");
  if (grindyBiasDetected) suppressedReasons.push("grindy-bias");
  if (rtfModelStatus !== "reliable") suppressedReasons.push("rtf-not-reliable");
  if (blockPhase === "deload") suppressedReasons.push("deload-phase");
  if (dayType === "speed" || dayType === "competition") suppressedReasons.push("non-progression-day");

  const aggressiveAvailable = suppressedReasons.length === 0 && loadIsNumeric;
  let aggressiveSuggestion = null;
  if (aggressiveAvailable) {
    const aggLoad = roundToHalf(targetExternalLoad * (1 + AGGRESSIVE_SPACING));
    const aggVx = typeof targetVx === "number" ? Math.max(0, targetVx - VX_OFFSET) : null;
    aggressiveSuggestion = {
      id: "aggressive",
      label: "Rohkea",
      deltaPct: (typeof deltaPct === "number" ? deltaPct : 0) + AGGRESSIVE_SPACING,
      targetVx: aggVx,
      targetExternalLoad: aggLoad,
      setCount,
      targetReps,
      rationaleShort: "Korkea-stimulus — lähempänä failurea",
    };
  }

  // Suggestions-järjestys: SAFE → TARGET → AGGRESSIVE (UI:lla helpompi)
  const suggestions = [];
  if (safeSuggestion) suggestions.push(safeSuggestion);
  suggestions.push(targetSuggestion);
  if (aggressiveSuggestion) suggestions.push(aggressiveSuggestion);

  // Default-suggestion-päätös (Akselin Q3 C-muokattu + 2D-δ-C auto-learn):
  //   1. capLevel ≥ 1 → SAFE (pakotettu, ohittaa preferredBias + learned)
  //   2. effectiveBias yhdistää preferredBias + aggressivenessLearned:
  //        preferredBias  base    learnedAdd  → effectiveBias
  //        "stable"       -0.6    + learned   → ...
  //        "balanced"      0.0    + learned   → ...
  //        "challenging"  +0.6    + learned   → ...
  //      effectiveBias > +0.4 → AGGRESSIVE (jos available)
  //      effectiveBias < -0.4 → SAFE (jos available)
  //      muuten → TARGET
  // Auto-learn osaa nostaa tai laskea biasta ilman että preferredBias muuttuu.
  // Kaikki numeeriset rajat on tutkimuspohjaisesti tasapainotettu siten että
  // pelkkä preferredBias riittää oletusvalintaan, mutta atletin valintahistoria
  // voi sitä päinvastoin painostaa (TARGET-streak → ei muutu; SAFE-streak →
  // siirtyy SAFE-suuntaan).
  const biasBase = preferredBias === "stable" ? -0.6
    : preferredBias === "challenging" ? 0.6
    : 0;
  const learnedAdjustment = typeof aggressivenessLearned === "number"
    ? Math.max(-1, Math.min(1, aggressivenessLearned))
    : 0;
  const effectiveBias = biasBase + learnedAdjustment;

  let defaultSuggestionId = "target";
  const capForcesSafe = typeof capLevel === "number" && capLevel >= 1 && safeSuggestion;
  if (capForcesSafe) {
    defaultSuggestionId = "safe";
  } else if (effectiveBias > 0.4 && aggressiveAvailable) {
    defaultSuggestionId = "aggressive";
  } else if (effectiveBias < -0.4 && safeSuggestion) {
    defaultSuggestionId = "safe";
  }

  return {
    suggestions,
    defaultSuggestionId,
    suppressedReasons,
    aggressiveAvailable,
    effectiveBias,
  };
}

// ═══════════════════════════════════════════════════════════════
// RECOMMEND() — DETERMINISTIC RECOMMENDATION ENGINE
// ═══════════════════════════════════════════════════════════════

/**
 * Main recommendation function.
 * Input: mesocycle state, e1RM, readiness, settings
 * Output: recommended load, set prescription, decisionTrace
 */
// K2c (retro-kenttä OBS-D): evidenssi-sort SUORITUSpäivällä (session.dateISO), kirjaus-timestamp
// vain tiebreakerina. Jaettu factory recommend()- ja recommendPeaking()-poluille.
function makeEvidenceSort(sessions) {
  const byId = {};
  for (const s of (sessions || [])) { if (s && s.sessionId) byId[s.sessionId] = s.dateISO || null; }
  const perfDate = (x) => byId[x.sessionId] || (x.timestamp || "").slice(0, 10);
  return (a, b) => {
    const d = perfDate(a).localeCompare(perfDate(b));
    if (d !== 0) return d;
    return (a.timestamp || "").localeCompare(b.timestamp || "");
  };
}

async function recommend(options = {}) {
  const settings = options.settings || (await getSettings());
  const bodyweightKg = options.bodyweightKg || settings.bodyweightKg || 91;
  const dateISO = options.dateISO || todayISO();
  // 8a (V1): across-set-väsymyksen per-sarja-rate — jaettu preskriptio/estimointi/
  // re-ankkurointi -kuluttajille (ko-opittavuus-invariantti). Luetaan opittu arvo
  // settings.learnedParams:sta clampattuna prioriin [0.25,0.75]; puuttuu/ei-dataa →
  // prior 0.5 (cold-start bittitarkka). Oppiminen KIRJOITTAA vain treenin päätöksessä
  // (data.js:updateLearnedAcrossSetFatigue) — recommend() on puhdas luku.
  const _asfLearned = settings.learnedParams?.acrossSetFatigue || null;
  const acrossSetRate = clampAcrossSetRate(_asfLearned?.value);
  const learnedAcrossSetFatigueCI = (_asfLearned && _asfLearned.n > 0)
    ? _asfLearned.n / (_asfLearned.n + LEARNED_PARAM_TAU) : 0;

  const traces = [];
  function trace(ruleId, before, after, why) {
    traces.push({ traceId: uid(), recId: null, ruleId, before: { ...before }, after: { ...after }, why });
  }

  // v4.34.26: Maintenance-mode early-exit (graceful degradation).
  // Käyttäjä on aktivoinut "ylläpito-tilan" Asetuksista (vamma/elämä/sairas/vaihto).
  // Engine palauttaa minimum-viable-protokollan: 2 sessiota/vk × 60% e1RM × V3-V4.
  // Mesocycle ei etene maintenance-aikana — sykli-rakennetta ei muuteta. Käyttäjä
  // palaa täyteen ohjelmaan kun toggle off TAI durationDays päättyy (auto-expiry).
  const mm = settings.maintenanceMode;
  if (mm && mm.active) {
    const ms = maintenanceStatus(mm, dateISO);
    if (ms.active) {
      // Aktiivinen → palauta maintenance-rec. Mesosykli säilyy mutta dayPlan
      // korvataan suppealla protokollalla.
      const dow = new Date(dateISO).getDay() || 7;
      // 2 sessiota/vk: MA (1) + TO (4) JA muut päivät → ei treeniä
      const isMaintenanceDay = (dow === 1 || dow === 4);
      trace("MAINTENANCE_MODE",
        { active: true, reason: mm.reason || "unknown", daysRemaining: ms.daysRemaining },
        { dayType: "maintenance", isTrainingDay: isMaintenanceDay, expiryISO: ms.expiryISO },
        `Ylläpito-tila aktiivinen (${mm.reason || "ei syytä"}) · ${ms.daysRemaining} pv jäljellä · ${isMaintenanceDay ? "treeni" : "lepopäivä"}`);
      return {
        dateISO,
        weekNum: null,
        weekLabel: "Ylläpito",
        dayType: "maintenance",
        dayPlan: isMaintenanceDay ? {
          label: "Ylläpito · 2/vk",
          slots: [
            { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 5, targetVx: 3 },
            { role: "accessory", category: dow === 1 ? "horisontaaliveto" : "horisontaalityöntö",
              defaultMovementName: dow === 1 ? "Penkkiveto" : "Penkkipunnerrus",
              sets: 3, reps: 8, targetVx: 4 },
          ],
        } : { label: "Ylläpito · lepopäivä", slots: [] },
        targetExternalLoad: null,  // Engine ei ehdota spesifistä kuormaa — atleetti valitsee 60% e1RM
        e1rmExternal: null,
        e1rmSystem: null,
        deltaPct: 0,
        readiness: options.readiness || null,
        traces,
        maintenanceStatus: ms,
      };
    }
  }

  // 1. Get mesocycle
  let mesocycle = options.mesocycle || (await getActiveMesocycle());
  if (!mesocycle) {
    mesocycle = createDefaultMesocycle(dateISO);
    if (!options.dryRun) await saveMesocycle(mesocycle);
    trace("MESOCYCLE_CREATED", {}, { mesocycleId: mesocycle.mesocycleId }, "Uusi mesosykli luotu automaattisesti");
  }

  // 1b. Delegate peaking mesocycles to dedicated engine
  if (mesocycle.type === "peaking") {
    return recommendPeaking({ ...options, mesocycle });
  }

  // 2. Determine week and day
  // v4.22: erottelu "ennen alkua" (pyyntö backfillille ennen mesosyklin
  // startDateISO:a) ja "lopun jälkeen" (sykli päättynyt). Aiemmin molemmat
  // johtivat default-mesosyklin hiljaiseen luomiseen → treeni-näkymä näytti
  // eri dataa kuin sykli-näkymä kun käyttäjä yritti backfillata ennen alkua.
  const pos = resolveMesocyclePosition(mesocycle, dateISO);
  let weekNum = pos?.programWeek ?? null;
  if (weekNum === null) {
    if (pos?.reason === "before-start") {
      // Ei luoda uutta mesosykliä — palautetaan selkeä virhe jotta kutsuja
      // (UI) voi estää backfillin ennen mesosyklin alkua.
      trace("MESOCYCLE_BEFORE_START", {}, { startDateISO: mesocycle.startDateISO, requestedDate: dateISO },
        `Pyydetty päivämäärä ${dateISO} on ennen mesosyklin alkua (${mesocycle.startDateISO})`);
      return {
        dateISO,
        error: "before-start",
        errorMessage: `Mesosykli alkoi ${mesocycle.startDateISO} — ei voida laskea suositusta aiemmalle päivälle`,
        traces,
        dayPlan: null,
        dayType: null,
        weekNum: null,
        weekLabel: null,
        targetExternalLoad: null,
        e1rmExternal: null,
        e1rmSystem: null,
      };
    }
    // after-end: mesosykli on päättynyt → EI luoda hiljaisesti uutta.
    // v4.27.3 korjaus: aiempi versio loi automaattisesti createDefaultMesocycle:n
    // (leuka-focus) vaikka käyttäjä olisi ollut esim. streetlifting_16w-ohjelmassa.
    // Tämä tarkoitti että treeni-sessionin tallennuksen jälkeen sovellus saattoi
    // "vaihtaa ohjelman" ilman käyttäjän lupaa, koska getActiveMesocycle() palautti
    // tuoreimman mesosyklin = uuden defaultin.
    //
    // Nyt palautetaan sama pattern kuin MESOCYCLE_BEFORE_START: virhe jonka UI
    // käsittelee näyttämällä "Aloita uusi sykli" -painikkeen käyttäjälle.
    trace("MESOCYCLE_ENDED", {}, {
      prevType: mesocycle.type,
      prevStartDateISO: mesocycle.startDateISO,
      requestedDate: dateISO,
    }, `Edellinen mesosykli (${mesocycle.type}) on päättynyt — käyttäjän tulee valita seuraava`);
    return {
      dateISO,
      error: "mesocycle-ended",
      errorMessage: `Edellinen mesosykli (${mesocycle.type}) on päättynyt — aloita uusi sykli Mesosykli-näkymästä`,
      prevMesocycleType: mesocycle.type,
      prevMesocycleId: mesocycle.mesocycleId,
      traces,
      dayPlan: null,
      dayType: null,
      weekNum: null,
      weekLabel: null,
      targetExternalLoad: null,
      e1rmExternal: null,
      e1rmSystem: null,
    };
  }

  let weekDef = getWeekDef(mesocycle, weekNum);
  const dayOfWeek = new Date(dateISO).getDay() || 7; // 1=Mon, 7=Sun
  let dayPlan = getTodayPlan(mesocycle, weekNum, dayOfWeek);
  let dayType = dayPlan?.dayType || options.dayType || "heavy";

  // H-015: liike-korvaukset (vaivan ajaksi) applioidaan HETI dayPlan-resoluution
  // jälkeen → koko downstream-kuormaketju näkee korvaajan. Ks. applyMovementSubstitutions.
  if (dayPlan && dayPlan.slots) {
    const subbedSlots = applyMovementSubstitutions(dayPlan.slots, mesocycle);
    if (subbedSlots !== dayPlan.slots) {
      dayPlan = { ...dayPlan, slots: subbedSlots };
      const subList = subbedSlots.filter(s => s._substituted)
        .map(s => `${s._substituted.originalName}→${s.defaultMovementName}${s._substituted.reason ? ` (${s._substituted.reason})` : ""}`);
      trace("SLOT_SUBSTITUTION", {}, { count: subList.length, substitutions: subList },
        `Liike-korvaus aktiivinen: ${[...new Set(subList)].join(", ")} — slotin ramppi (reps+Vx) säilyy, kuorma korvaajan e1RM:stä`);
    }
  }

  const isInsertedDeload = isInsertedDeloadWeek(mesocycle, dateISO);
  const isReplacedDeload = isReplacedDeloadWeek(mesocycle, dateISO);
  // v4.49.2 QF-4: laajenna deload-tunnistus presetti-built-in deload-viikoille
  // (esim. streetlifting_16w vk 4/8/12, default-meso vk 4, wendler531 vk 4). Built-in
  // deload-viikot määrittelevät jo deltaPctBase/heavyReps/heavyTargetVx labelin "Deload"
  // kautta — engine ei tähän asti pakottanut dayType="volume", mikä laukaisi
  // DELOAD_HEAVY_DAYTYPE-auditin 7/8 profiilissa. Nyt label-deloadissa vain dayType
  // pakotetaan volume:ksi, presetin alkuperäiset deload-arvot säilyvät.
  const isLabelDeload = /deload|kevennys/i.test(weekDef?.label || "");
  const isUserDeload = isInsertedDeload || isReplacedDeload;
  const isDeloadOverride = isUserDeload || isLabelDeload;
  if (isUserDeload) {
    // Override: käyttäjän kevennysviikko (lisätty tai korvaava).
    // Volyymi ~50%, kuorma -20%, Vx +2, pakotetaan volume-päivä.
    dayType = "volume";
    const deloadLabel = isInsertedDeload
      ? `Kevennysviikko (lisätty vk ${weekNum} jälkeen)`
      : `Kevennysviikko (korvaa vk ${weekNum})`;
    weekDef = { ...(weekDef || {}), week: weekNum, deltaPctBase: -0.20, label: deloadLabel, heavyReps: weekDef?.heavyReps || 5, heavyTargetVx: (weekDef?.heavyTargetVx ?? 2) + 2 };
    if (dayPlan && dayPlan.slots) {
      const prunedSlots = dayPlan.slots
        .filter(s => s.role === "primary" || s.role === "backoff" || s.slotId === "scapular-control" || s.slotId === "core-hollow")
        .map(s => ({
          ...s,
          sets: Math.max(1, Math.ceil((s.sets || 3) / 2)),
          targetVx: s.targetVx !== null && s.targetVx !== undefined ? s.targetVx + 2 : null,
        }));
      dayPlan = { ...dayPlan, slots: prunedSlots, dayType: "volume" };
    }
    trace("DELOAD_OVERRIDE", {}, { weekNum, dayType, mode: isInsertedDeload ? "insert" : "replace" }, `Käyttäjän kevennysviikko (${isInsertedDeload ? "lisätty" : "korvaava"}): volyymi ~50%, kuorma -20%, Vx +2`);
  } else if (isLabelDeload) {
    // Built-in deload-viikko presetistä (esim. streetlifting_16w vk 4/8/12 "Deload + testaus"):
    // presetin omat deltaPctBase + heavyReps + heavyTargetVx säilyvät, mutta dayType
    // pakotetaan volume:ksi jotta heavy-day-tyyppi ei laukea deload-viikolla.
    const previousDayType = dayType;
    dayType = "volume";
    if (dayPlan) {
      dayPlan = { ...dayPlan, dayType: "volume" };
    }
    trace("DELOAD_OVERRIDE", { dayType: previousDayType }, { weekNum, dayType, mode: "label-builtin", label: weekDef?.label }, `Presetti-deload-viikko (${weekDef?.label}): dayType pakotettu volume:ksi, presetin kuorma-arvot säilytetty`);
  }

  trace("MESOCYCLE_PHASE", {}, { weekNum, dayType, label: weekDef?.label }, `Viikko ${weekNum}: ${weekDef?.label || "?"}`);

  // 3. Break analysis
  const sessions = options.sessions || (await getAllSessions());
  const lastSession = sessions[sessions.length - 1];
  const breakInfo = breakAnalysis(lastSession?.dateISO, dateISO);

  if (breakInfo.modifier !== 0) {
    if (breakInfo.forcedDayType) {
      const oldDayType = dayType;
      dayType = breakInfo.forcedDayType;
      trace("RETURN_FROM_BREAK_DAYTYPE", { dayType: oldDayType }, { dayType }, breakInfo.message);
    }
    trace("RETURN_FROM_BREAK", { modifier: 0 }, { modifier: breakInfo.modifier, breakDays: breakInfo.breakDays }, breakInfo.message);

    // Check mesocycle reset
    if (breakInfo.breakDays >= 14) {
      const skippedWeeks = Math.floor(breakInfo.breakDays / 7);
      const resetInfo = mesocycleBreakReset(mesocycle, skippedWeeks);
      if (resetInfo.reset) {
        mesocycle = createDefaultMesocycle(dateISO);
        if (!options.dryRun) await saveMesocycle(mesocycle);
        weekNum = 1;
        trace("MESOCYCLE_BREAK_RESET", {}, { weekNum: 1 }, resetInfo.reason);
      }
    }
  }

  // 4. Compute e1RM from recent top sets
  const allSets = options.allSets || (await getAllSets());
  const primaryMovementId = options.primaryMovementId || null;

  // Detect barbell-only lift (squat): no bodyweight added to system load
  const primarySlotMeta = dayPlan?.slots?.find(s => s.role === "primary");
  const isBarbell = primarySlotMeta?.isBarbell === true;
  const inferredBlockPhase = deriveBlockPhaseFromMesocycle(mesocycle.type, weekNum, weekDef?.label);

  // β Round B-α-1: movement-objekti + tier-resolvointi primary-liikkeelle.
  // Ladataan allMovements jos ei vielä options:eissa (tarvitaan tier-resolveriin
  // primary + SLOT_LOAD_RESOLVED haara A:lle). Tier päättää onko Lähde 1 -reitti
  // käytössä (number 1/2/3) vai säilyy nykyinen loadPct-kaava ("special").
  const allMovementsForTier = options.allMovements || (await getAllMovements());
  const primaryMovement = primarySlotMeta?.defaultMovementName
    ? allMovementsForTier.find(m => m.name === primarySlotMeta.defaultMovementName)
    : null;
  // Jos movement löytyy ja sillä on tier, resolvoi se. Muuten null (graceful
  // degradation — käytetään nykyistä loadPct-kaavaa fallback-tilanteessa).
  let primaryTier = null;
  if (primaryMovement && primaryMovement.tier !== undefined) {
    try { primaryTier = resolveTier(primaryMovement, mesocycle); }
    catch (e) { primaryTier = null; /* virheellinen tier-määrittely → fallback */ }
  }

  // K2c (retro-kenttä OBS-D, "engine juuttuu muokattuun treeniin"): KAIKKI evidenssi-ikkunat
  // järjestetään SUORITUSpäivällä (session.dateISO), kirjaus-timestamp vain tiebreakerina.
  // Aiemmin puhdas timestamp-sort → backfillattu/jälkikäteen muokattu VANHA treeni naamioitui
  // "tuoreimmaksi" evidenssiksi (kirjaushetki uusin) ja e1RM-ikkuna + PLAN_BASED-valinta
  // ankkuroituivat siihen arvioimatta edustavuutta. dateISO == kirjausjärjestys normaalisti
  // → live-käytös ennallaan; vain backfill/muokkaus asettuu oikeaan kohtaan aikajanaa.
  const _evidenceSort = makeEvidenceSort(sessions);

  // Filter to primary movement top sets, sorted by date
  // v4.27.15: calibration-setit (AMRAP-testit deload-viikoilla) lasketaan mukaan
  // e1RM-laskentaan. Niillä actualVx === 0 (tekninen failure), jolloin Epley+Vara
  // redusoituu puhtaaksi Epleyksi: e1RM = kuorma × (1 + toistot/30) — vapaa
  // Vx-biasista.
  const topSets = allSets
    .filter((s) => {
      if (primaryMovementId && s.movementId !== primaryMovementId) return false;
      return s.setRole === "top" || s.setRole === "readiness_test" || s.setRole === "calibration";
    })
    .sort(_evidenceSort);

  // e1RM from last 4-6 top sets
  // Barbell lifts (squat): external-load-only formula. CKC lifts: system load (BW + ext).
  // K3-1: sarjapositio-krediitti — väsyneenä tehty myöhempi sarja todistaa korkeamman tuoreen
  // kapasiteetin. Krediitit lasketaan TÄYDESTÄ topSets-järjestyksestä (positio ei ala keskeltä
  // sessiota slice-ikkunan takia).
  const _fatigueCreditsAll = withinSessionFatigueCredits(topSets, acrossSetRate);
  const recentTopSets = topSets.slice(-6);
  const _recentCredits = _fatigueCreditsAll.slice(-6);
  const e1rmValues = recentTopSets
    .map((s, i) => {
      const vara = (s.actualVx ?? s.targetVx ?? 1) + (_recentCredits[i] || 0);
      if (isBarbell) {
        return e1rmAccessory(s.externalLoadKg || 0, s.reps || s.targetReps || 3, vara);
      }
      return e1rmSystem(bodyweightKg, s.externalLoadKg || 0, s.reps || s.targetReps || 3, vara);
    })
    .filter((v) => v !== null);

  // v4.27.15 → v4.32.8: CALIBRATION OVERRIDE
  //
  // Kalibrointisetti (setRole === "calibration") antaa tarkkuus-prioritisoidun
  // e1RM-mittauksen. Jos TOP-sarjoissa on viim. 3 setissä yksi tai useampi
  // kalibrointi, override: käytä pelkästään kalibrointisettien mediaania
  // (ohita Vx-kontaminoidut top-singlet).
  //
  // v4.32.8 PROTOKOLLAMUUTOS: AMRAP @85 % × failure (V0) → 92 % × 3 V1 (RPE 8).
  //   Tarkkuusparannus DiStasio 2014 + Helms MASS 2023:
  //   - Low-rep e1RM-tarkkuus ±2.7 kg vs AMRAP-extrapoloinnin ±5+ kg
  //   - CNS-kuorma matalampi → deload-viikolla turvallisempi
  //   - actualVx-fallback: ?? targetVx ?? 1 (yhdenmukainen e1RM-laskennan kanssa)
  //
  // Ikkunat (OBS-052 v2 — TUOREUSIKKUNA, ei "viim. sessio"):
  //   • Tuorein cal ≤ CAL_FRESHNESS_DAYS (42 pv) → cal AJAA (myös työ-only-viikoilla vk2-4,
  //     koska kanoninen ohjelma kalibroi vain vk4/8/12 ≈ kerran kuussa — v1 oli inertti tässä)
  //   • Vanhentunut cal (> 42 pv) → takaisin mediaaniin (DEFLATION-lattia pitää −5 %)
  //   HUOM: lukee TÄYDEN topSets-historian (EI recentTopSets/slice-6) jotta kuukauden
  //   vanha cal ei putoa input-ikkunan ulkopuolelle ennen tuoreusporttia.
  //
  // Backward compat: vanhat V0-AMRAP-kalibroinnit toimivat edelleen
  //   (s.actualVx === 0 → vara = 0 → puhdas Epley).
  const recentCalibSets = freshCalibSets(topSets);
  let currentE1RMSystem;
  let e1rmSource = "median";
  if (recentCalibSets.length > 0) {
    // K3-1: positio-krediitti myös cal-sarjoille (cal-sessio on sekventiaalinen — 3. cal-sarja
    // väsyneenä @V0 todistaa korkeamman tuoreen kapasiteetin kuin 1.).
    const _calCredits = withinSessionFatigueCredits(recentCalibSets, acrossSetRate);
    const calibE1rms = recentCalibSets.map((s, i) => {
      // v4.32.8: fallback chain — actualVx (raportoitu) → targetVx (V1 uudessa, V0 vanhassa) → 1
      const vara = (s.actualVx ?? s.targetVx ?? 1) + (_calCredits[i] || 0);
      if (isBarbell) {
        return e1rmAccessory(s.externalLoadKg || 0, s.reps || 1, vara);
      }
      return e1rmSystem(bodyweightKg, s.externalLoadKg || 0, s.reps || 1, vara);
    }).filter(v => v !== null);
    currentE1RMSystem = calibE1rms.length > 0 ? median(calibE1rms) : (e1rmValues.length > 0 ? median(e1rmValues) : null);
    if (calibE1rms.length > 0) e1rmSource = `calibration (${recentCalibSets.length} setti${recentCalibSets.length > 1 ? "ä" : ""})`;
  } else {
    currentE1RMSystem = e1rmValues.length > 0 ? median(e1rmValues) : null;
  }

  // K2b (retro-kenttä OBS-D): POST-BREAK-ANKKURIKATTO — tauon jälkeinen TUORE evidenssi cappaa
  // vanhan ankkurin. Yksi paluusuoritus ei syrjäyttänyt tauko-edeltävää mediaania (kenttä:
  // dipin 1RM-arvio 103,1 tauko-edeltävästä datasta vaikka paluu = yksi kolmonen). Sääntö:
  // jos evidenssi-ikkunassa (viim. 6 topia) on ≥ RELOAD-kynnyksen suoritusPÄIVÄ-gap JA tauon
  // jälkeisiä settejä → ankkuri = min(nykyinen, post-break-paras × 1.05). VAIN alaspäin
  // (konservatiivinen; +5 % headroom ei jumita atleettia paluutasoon). Post-break-cal sisältyy
  // post-ikkunaan luonnostaan (re-entry-testi = tuorein evidenssi → cap ≥ cal, ei leikkaa).
  // Primer-override (alla) EI capata — se on eksplisiittinen TÄMÄN PÄIVÄN mittaus.
  if (currentE1RMSystem !== null && recentTopSets.length >= 2) {
    const _pbMap = {};
    for (const s of sessions) if (s && s.sessionId) _pbMap[s.sessionId] = s.dateISO || null;
    const _pbTime = (x) => new Date(_pbMap[x.sessionId] || (x.timestamp || "").slice(0, 10)).getTime();
    let _pbBreakIdx = -1;
    for (let i = recentTopSets.length - 1; i >= 1; i--) {
      if ((_pbTime(recentTopSets[i]) - _pbTime(recentTopSets[i - 1])) / 86400000 >= RELOAD_CONFIG.thresholdDays) { _pbBreakIdx = i; break; }
    }
    if (_pbBreakIdx > 0) {
      const _pbPost = recentTopSets.slice(_pbBreakIdx).map((s) => {
        const vara = s.actualVx ?? s.targetVx ?? 1;
        return isBarbell
          ? e1rmAccessory(s.externalLoadKg || 0, s.reps || s.targetReps || 3, vara)
          : e1rmSystem(bodyweightKg, s.externalLoadKg || 0, s.reps || s.targetReps || 3, vara);
      }).filter(v => v !== null && v > 0);
      if (_pbPost.length) {
        const _pbCap = Math.max(..._pbPost) * 1.05;
        if (currentE1RMSystem > _pbCap) {
          trace("POST_BREAK_ANCHOR_CAP",
            { e1rmSystem: currentE1RMSystem.toFixed(1), source: e1rmSource },
            { e1rmSystem: _pbCap.toFixed(1), postBreakSets: _pbPost.length, headroomPct: 5 },
            `Post-break-ankkurikatto: tauko evidenssi-ikkunassa → ankkuri ${currentE1RMSystem.toFixed(1)} → ${_pbCap.toFixed(1)} kg (tauon jälkeinen paras × 1,05 — tuore evidenssi ajaa, vanha ei nosta)`);
          currentE1RMSystem = _pbCap;
          e1rmSource = e1rmSource + "+post-break-cap";
        }
      }
    }
  }

  let currentE1RMExternal = currentE1RMSystem !== null
    ? (isBarbell ? currentE1RMSystem : Math.max(0, currentE1RMSystem - bodyweightKg))
    : null;

  // v4.52.15 H-006b B2 (A2): primer-pohjainen sys-1RM-override.
  // Jos kutsuja (UI / index.html) antaa options.todaySys1RM:n (primer-velocity
  // vs baseline-vertailusta laskettu päivän mukautettu external e1RM, ks.
  // computeTodaySys1RM), käytä sitä currentE1RMExternal:in sijaan. Tämä on
  // SYÖTE recommend():iin (override-arvo), ei muutos laskennan sääntöihin
  // (HANDOFF.md H-006b §3 scope-aita: recommend()-päälogiikka koskematon).
  //
  // PLAN_BASED-, ceiling-, floor-, VBT-promotion-säännöt soveltuvat tämän
  // override-arvon päälle samoin kuin alkuperäiseen currentE1RMExternal:iin.
  if (typeof options.todaySys1RM === "number" && options.todaySys1RM > 0) {
    const before = currentE1RMExternal;
    currentE1RMExternal = options.todaySys1RM;
    trace("PRIMER_SYS1RM_OVERRIDE",
      { e1rmExternal: typeof before === "number" ? before.toFixed(1) : null,
        source: e1rmSource },
      { e1rmExternal: currentE1RMExternal.toFixed(1),
        source: "primer-baseline-comparison",
        deltaPct: options.todaySys1RMDeltaPct ?? null,
        // v4.52.15 H-006b B3 (A3): K-β-flagit per overide-tilanne, audit-engine.mjs
        // tunnistaa nämä auditInvariants-puolella ja emittoi vastaavat audit-flagit.
        kBetaFlags: Array.isArray(options.todaySys1RMKBetaFlags) ? options.todaySys1RMKBetaFlags : [] },
      `H-006b A2: päivän mukautettu sys-1RM primer-pohjaisesti (${typeof before === "number" ? before.toFixed(1) : "?"} → ${currentE1RMExternal.toFixed(1)} kg)`);
    e1rmSource = "primer-override";
  }

  // v4.34.35: tallenna PLAN_BASED:n e1RM-nousu rate-limit-blokille.
  // Kun PLAN_BASED aktivoituu, e1RM nousee perfect-execution-pohjalta. Rate-limit
  // cap (joka oli kiinteä +6%) sokaistui tästä — cap rajoitti kuorman vaikka
  // todellinen e1RM oli nousussa. Korjaus: PLAN_BASED-aware cap = 6% + e1RMGrowth.
  let planBasedE1RMGrowthPct = 0;
  const epleyVaraE1RM = currentE1RMExternal; // tallennetaan ennen PLAN_BASED-overridea

  // v4.34.30: PLAN_BASED_E1RM — kun atletti suoriutui täydellisesti targetin Vx:llä,
  // luota suunnitelmaan, älä Epley+Vara -aliarvioon (Helms 2018, Tuchscherer RTS).
  //
  // Käyttäjäpalaute 2026-05-05: "Tein 4×6 V3 @120 kg juuri kuten oli tavoite, ja
  // engine ehdottaa vk 2 SAMA paino vaikka suunnitelma sanoo +3.5%". Juurisyy:
  // Epley+Vara aliarvioi e1RM:n korkeilla toistoilla ~10-15% (4×6 V3 @120 → 156,
  // todellinen ~175). Konservatiivinen e1RM × suunnitelma % → liian matala target.
  //
  // Korjaus: jos viim. session oli "perfect execution" (kaikki sarjat actualVx ≥
  // targetVx JA reps ≥ targetReps), johdetaan e1RM SUORAAN suunnitelmasta:
  //   plan_e1rm = lastLoad / lastLoadPct
  // Kun lastPct=0.686 ja lastLoad=120 → plan_e1rm = 175 (vrt. Epley+Vara 156).
  // Käytetään MAX(epley_vara, plan_based) → ei pakota alaspäin, vain ylöspäin.
  //
  // Plan-based aktivoituu vain perfect-execution-tilanteessa: jos atletti ei
  // suoriutunut, Epley+Vara säilyy (konservatiivinen suoja grindausta vastaan).
  if (currentE1RMExternal !== null && primaryMovementId && recentTopSets.length > 0) {
    // Hae viim. session SETIT — ei cal, ei deload (filtteröi sessio-tasolla)
    // v4.34.33 BUG-FIX 1.1: jos VIIM. session on cal-dominantti, ÄLÄ laukea
    // PLAN_BASED. Cal on tarkin mittaus (RPE 8 × 3 reps, low-rep e1RM-tarkkuus
    // ±2.7 kg, DiStasio 2014). Plan-based ekstrapoloi loadPct:llä — vanhempi
    // ei-cal-data tuottaa väärän e1RM:n kun cal on jo päivittänyt arvon.
    //
    // v4.34.36 BUG-FIX A: filtteröi VAIN setRole === "top" -sarjat. Aiempi bug:
    // Lisäpainodippi vk 2 MA -accessory (3×10 V5 @ 30 kg BW-volyymi) tunnistettiin
    // "viim. dippi-session"-laukaisijaksi → planBasedExternal = 30/0.71 = 42.25 kg
    // (= aliarvioi e1RM:n 80→42 kg). Korjaus: lastSessionSets sisältää vain
    // primary-work-sarjat, jolloin volume-day accessory-volyymi ei sotke laskua.
    // Ennen filteriä: recentTopSets sisältää JO vain primaryMovementId:n sarjoja
    // (rivi ~1830 filtteri), mutta accessoreja samalle liikkeelle ei suodatettu.
    const lastSessionSets = (() => {
      // Ryhmitä sessionId:n mukaan, ota viim. ei-cal-sessio
      const sessGroups = new Map();
      const sessOrder = [];
      // v4.34.36 A: filtteröi vain primary-work-sarjat (setRole === "top")
      const primaryWorkSets = recentTopSets.filter(s => s.setRole === "top");
      if (primaryWorkSets.length === 0) return null;
      for (const s of primaryWorkSets) {
        const sid = s.sessionId || `__nosess_${s.timestamp}`;
        if (!sessGroups.has(sid)) { sessGroups.set(sid, []); sessOrder.push(sid); }
        sessGroups.get(sid).push(s);
      }
      // v4.34.33: jos viim. session on cal-dominantti, palauta null → cal voittaa
      if (sessOrder.length > 0) {
        const lastSets = sessGroups.get(sessOrder[sessOrder.length - 1]);
        const lastCalCount = lastSets.filter(s => s.setRole === "calibration").length;
        if (lastCalCount >= lastSets.length * 0.5) return null;
      }
      // Käy lopusta alkuun, etsi viim. ei-cal-sessio
      for (let i = sessOrder.length - 1; i >= 0; i--) {
        const sets = sessGroups.get(sessOrder[i]);
        const calCount = sets.filter(s => s.setRole === "calibration").length;
        if (calCount < sets.length * 0.5) return sets;
      }
      return null;
    })();

    if (lastSessionSets && lastSessionSets.length > 0) {
      // Tarkista perfect execution: kaikki sarjat targetVx tai parempi (alempi luku)
      // JA reps >= targetReps. Sallitaan myös yksi V0 jos reps = targetReps (= just-made-it).
      const allHitTarget = lastSessionSets.every(s =>
        s.actualVx !== null && s.actualVx !== undefined && s.targetVx !== null && s.targetVx !== undefined
        && s.actualVx >= s.targetVx  // Vx asteikko: korkeampi = helpompi → actualVx >= targetVx tarkoittaa "yhtä helppo tai helpompi"
        && (s.reps ?? 0) >= (s.targetReps ?? 0)
      );

      if (allHitTarget) {
        // Hae viim. session date → mesocycle-vk → primary-slot loadPct
        // v4.34.33 BUG-FIX 1.2: session.dateISO on AUTORITATIIVINEN, ei set.timestamp.
        // Backfilloidut setit tallennetaan timestamp = recording-aika (= today),
        // joka ei vastaa historiallista vk:ta. Aiempi järjestys (timestamp ensin)
        // teki backfill-päiville väärän vk-lookupin → väärä loadPct → väärä e1RM.
        const lastSessionId = lastSessionSets[0]?.sessionId;
        const lastDateISO = (lastSessionId && (sessions || []).find(s => s.sessionId === lastSessionId)?.dateISO)
          || lastSessionSets[0]?.dateISO
          || lastSessionSets[0]?.timestamp?.slice(0, 10);
        const lastWk = lastDateISO ? getMesocycleWeek(mesocycle, lastDateISO) : null;
        const lastDow = lastDateISO ? (new Date(lastDateISO).getDay() || 7) : null;
        const lastDayPlan = (lastWk !== null && lastDow !== null)
          ? mesocycle.weekPlans?.[lastWk - 1]?.days?.find(d => d.dayOfWeek === lastDow)
          : null;
        const lastPrimarySlot = lastDayPlan?.slots?.find(s => s.role === "primary");
        const lastLoadPct = lastPrimarySlot?.loadPct;

        // OBS-051: PLAN_BASED luottaa loadPct:hen tosi-%1RM-ankkurina. Hyväksy vain
        // Vx-johdonmukainen loadPct (jaettu helper); alittava volyymi-label → skippaa.
        const loadPctVxConsistent = isLoadPctVxConsistent(lastLoadPct, lastPrimarySlot?.reps, lastPrimarySlot?.targetVx);
        if (lastLoadPct && lastLoadPct > 0 && lastLoadPct <= 1.0 && !loadPctVxConsistent) {
          const vxImpliedPct = vRepsToExpectedPct((lastPrimarySlot?.reps ?? 0) + (lastPrimarySlot?.targetVx ?? 0));
          trace("PLAN_BASED_VX_GATED",
            { e1rmExternal: currentE1RMExternal?.toFixed(1), source: "epley-vara" },
            { lastLoadPct, vxImpliedPct: vxImpliedPct?.toFixed(3), reps: lastPrimarySlot.reps, targetVx: lastPrimarySlot.targetVx },
            `PLAN_BASED ohitettu: loadPct ${lastLoadPct} alittaa Vx-intensiteetin ${((vxImpliedPct ?? 0)*100).toFixed(0)}% (volyymi-label, ei tosi-%1RM) → Epley-Vara ${currentE1RMExternal?.toFixed(1)} kg säilyy`);
        }

        if (lastLoadPct && lastLoadPct > 0 && lastLoadPct <= 1.0 && loadPctVxConsistent) {
          const lastMedianLoad = median(lastSessionSets.map(s => s.externalLoadKg).filter(v => v > 0));
          if (lastMedianLoad && lastMedianLoad > 0) {
            // v4.34.32: Vx-overshoot-bonus PLAN_BASED-laskennassa.
            // Käyttäjäpalaute: "jos teen V2-target-treenin V3:lla, osaa kone optimoida?".
            // Jos atletti suoriutui HELPOMMIN kuin oli targetoitu (actualVx > targetVx),
            // engine tunnistaa "kuorma oli liian helppo" ja nostaa e1RM:ää suhteessa.
            // Tuchscherer RTS / Helms 2018: +2.5% per Vx-luokka (RPE 7 actual vs RPE 8
            // target = +5%). Kerrointetään plan-based-arvio overshoot:in mukaan.
            const meanOvershoot = lastSessionSets.reduce((sum, s) =>
              sum + ((s.actualVx ?? 0) - (s.targetVx ?? 0)), 0) / lastSessionSets.length;
            // Vain positiivinen overshoot saa bonuksen (negatiivinen = grindas → ei rangaistus
            // tässä, perfect-execution-ehto sen jo suodattaa)
            const vxBonusPct = Math.max(0, meanOvershoot) * 0.025;
            // S10-korjaus: inversio system-%-kontraktilla (planBasedInvertE1RM, 1c978a9).
            // Bonus sovelletaan external-estimaattiin (growthPct + trace pysyvät ext-vs-ext).
            const planBasedExternal = planBasedInvertE1RM(lastMedianLoad, lastLoadPct, isBarbell, bodyweightKg).external * (1 + vxBonusPct);
            // v4.34.30 PÄIVITETTY: korvaa Epley+Vara plan-based-arvolla AINA kun perfect
            // execution. Älä käytä MAX:ia — Epley voi sekä yli- että aliarvioida e1RM:n
            // ja luottaminen suunnitelmaan on luotettavampaa kuin formula-extrapolointi.
            const original = currentE1RMExternal;
            const diffPct = ((planBasedExternal - original) / original) * 100;
            currentE1RMExternal = planBasedExternal;
            currentE1RMSystem = isBarbell ? planBasedExternal : (planBasedExternal + bodyweightKg);
            // v4.34.35: tallenna nousupct rate-limit-blokille
            planBasedE1RMGrowthPct = epleyVaraE1RM > 0
              ? Math.max(0, (planBasedExternal - epleyVaraE1RM) / epleyVaraE1RM)
              : 0;
            trace("PLAN_BASED_E1RM",
              { e1rmExternal: original.toFixed(1), source: "epley-vara" },
              { e1rmExternal: currentE1RMExternal.toFixed(1), source: "plan-based",
                lastLoad: lastMedianLoad, lastLoadPct, lastWk, perfectExecution: true,
                meanOvershoot: meanOvershoot.toFixed(2),
                vxBonusPct: (vxBonusPct * 100).toFixed(1) + "%",
                diffPct: diffPct.toFixed(1) + "%" },
              `Perfect execution (kaikki sarjat target Vx:llä @${lastMedianLoad} kg, vk ${lastWk} loadPct ${lastLoadPct})${meanOvershoot > 0.1 ? ` + Vx-overshoot ${meanOvershoot.toFixed(1)} (+${(vxBonusPct*100).toFixed(1)}% bonus, atletti suoriutui helpommalla)` : ''} → plan-based e1RM ${planBasedExternal.toFixed(1)} kg ${diffPct >= 0 ? 'yliajaa' : 'korjaa alas'} Epley+Vara ${original.toFixed(1)} kg (${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(1)}%)`);
          }
        }
      }
    }
  }

  // v4.34.28: Ceiling/floor-arvot näkyvissä VBT-promote-clampille (kohta 1).
  // Aiemmin nämä olivat let-muuttujia INFLATION_CAP- ja DEFLATION_CAP-blokkien
  // sisällä → VBT-haara (rivi ~1913) ohitti capit. Bug: jos velocity-pohjainen
  // e1RM oli 4% yli capatun arvon, VBT_PRIMARY_USED nosti currentE1RMExternal
  // takaisin yli capin. Korjaus: ceiling_ext ja floor_ext ovat nyt funktioscope:ssa.
  let ceiling_ext = null;
  let ceilingSource = null;
  let floor_ext = null;
  let floorSource = null;
  // v4.34.43: cfg-drift result (UI persistoi mesocycleen jos driftPct > 0).
  let cfgDriftResult = null;

  // v4.34.15 FIX #1: E1RM-INFLAATION CAP — Epley + Vara -kaava ylimitatoi 1RM:n
  // varsinkin korkeilla toistoilla (V3+ × 6 reps → +20 % seedista yhden session perusteella).
  // Käyttäjäpalaute simulaatiosta: "vk 1 e1RM 106 vs todellinen ~89 — vk 8 cal yli PR".
  //
  // v4.34.42 — B+ ADAPTIVE CEILING: streak-pohjainen kerroin-nosto (ks.
  // computePerfectStreakCeilingBonus). Aiempi kiinteä cfg × 1.10 -ceiling
  // rajoitti kasvun jos atletti toistuvasti ylitti targetin V3+ perfectillä
  // (esim. dippi vk 2 PLAN_BASED 92.3 > ceiling 88 → vk 3 jäi +0.5 kg).
  // Adaptive: 2 peräkkäistä perfect-yli-ceiling-sessiota nostaa kerrointa
  // 1.10 → 1.15, 3+ → 1.20 (max). Yksi V0-fail palauttaa 1.10:een.
  //
  // Logiikka (3 tasoa, prioriteettijärjestyksessä):
  //   1. Cal-historia → ceiling = max(cal-derived) × 1.05 (validoitu mittaus)
  //   2. streetliftingConfig (Lisäpainoleuka/dippi/Takakyykky) → cfg × adaptive
  //   3. (B+) Yleinen historia-baseline → max-3-e1RM × adaptive
  //      — toimii MILLE TAHANSA liikkeelle (variantti-vaihto, custom-meso)
  //
  // Cap pätee vain kun currentE1RMExternal > ceiling. Alaspäin ei capata
  // (oikea heikkous-signaali pitää näkyä rate-limit-anchorissa, ei piilottaa).
  if (currentE1RMExternal !== null && primaryMovementId) {
    const allCalSets = topSets.filter(s => s.setRole === "calibration");
    const recentCalForCeiling = allCalSets.slice(-3); // viim. 3 cal-settiä

    if (recentCalForCeiling.length > 0) {
      // Käytä viim. cal-setin e1RM:ää × 1.05
      const calE1RMs = recentCalForCeiling.map(s => {
        const cv = s.actualVx ?? s.targetVx ?? 1;
        const e1rmSys = isBarbell
          ? e1rmAccessory(s.externalLoadKg || 0, s.reps || 1, cv)
          : e1rmSystem(bodyweightKg, s.externalLoadKg || 0, s.reps || 1, cv);
        return isBarbell ? e1rmSys : (e1rmSys - bodyweightKg);
      }).filter(v => v !== null);
      if (calE1RMs.length > 0) {
        ceiling_ext = Math.max(...calE1RMs) * 1.05;
        ceilingSource = `cal-derived (max ${Math.max(...calE1RMs).toFixed(1)} × 1.05)`;
      }
    }

    if (ceiling_ext === null) {
      // Ei cal-historiaa → käytä konfiguroitu PR × adaptive
      // v4.34.42: adaptive-kerroin = 1.10 + streak-bonus (max +0.10 = 1.20)
      // v4.34.43: cfg-arvo voi olla drifted (engine on oppinut atletin todellisen
      // pohjatason). Käytä effectiveCfg = baseCfg × (1 + driftPct).
      const cfgInfo = getCfgBaselineForMovement(mesocycle, primarySlotMeta);
      const initialPR = cfgInfo.value;
      if (initialPR && initialPR > 0) {
        // CFG-DRIFT: laske drift IN-MEMORY (ei muta meso). Persistointi UI:ssa
        // computeRecommendation():n yhteydessä cfgDriftApplied-flagin perusteella.
        const drift = computeCfgDrift(topSets, sessions, mesocycle, isBarbell, bodyweightKg, initialPR, dateISO);
        const effectiveCfg = initialPR * (1 + drift.driftPct);
        if (drift.driftPct > 0) {
          trace("CFG_DRIFT_APPLIED",
            { cfg: initialPR.toFixed(1), source: "cfg-baseline" },
            { effectiveCfg: effectiveCfg.toFixed(1), driftPct: (drift.driftPct*100).toFixed(1) + '%',
              signal: drift.signal, counter: drift.counter, source: drift.source },
            `Cfg-drift +${(drift.driftPct*100).toFixed(1)}% (${drift.signal}): ${cfgInfo.movName} ${initialPR} → ${effectiveCfg.toFixed(1)} kg [${drift.source}]`);
        }
        // Tallenna drift-info recommend()-output:iin (UI persistoi mesocycleen)
        cfgDriftResult = {
          movName: cfgInfo.movName,
          key: cfgInfo.key,
          fromCfg: initialPR,
          toCfg: effectiveCfg,
          driftPct: drift.driftPct,
          signal: drift.signal,
          source: drift.source,
          counter: drift.counter,
          velDeltaPct: drift.velDeltaPct,
          dateISO,
        };

        // Cap-laskenta käyttää effectiveCfg:tä baseena
        const baseCeiling = effectiveCfg * 1.10;
        const sr = computePerfectStreakCeilingBonus(topSets, sessions, mesocycle, isBarbell, bodyweightKg, baseCeiling);
        const ceilingMult = 1.10 + sr.bonus;
        ceiling_ext = effectiveCfg * ceilingMult;
        const driftLabel = drift.driftPct > 0 ? ` [drift +${(drift.driftPct*100).toFixed(1)}%]` : '';
        ceilingSource = `${cfgInfo.movName} PR ${initialPR}${driftLabel} × ${ceilingMult.toFixed(2)}`
                      + (sr.bonus > 0 ? ` [B+ streak ${sr.streak}× → +${(sr.bonus*100).toFixed(0)}%]` : '');
      }
    }

    if (ceiling_ext === null && topSets.length > 0) {
      // v4.34.42 B+ — Yleistys: historia-baseline mille tahansa liikkeelle.
      // Käytä top-3 e1RM:n mediaania baselinena → adaptive × 1.10 + streak.
      // Tämä korvaa hardkoodatun "vain 3 streetlifting-päälikettä" -mallin —
      // variantti-vaihto (esim. Painodippi → Lisäpainodippi) ei riko cap:ia,
      // ja custom-mesosyklit muille liikkeille saavat suojan automaattisesti.
      const histE1RMs = topSets.slice(-12).map(s => {
        const cv = s.actualVx ?? s.targetVx ?? 1;
        if ((s.externalLoadKg ?? 0) <= 0 || (s.reps ?? 0) < 1) return null;
        const e1rmSys = isBarbell
          ? e1rmAccessory(s.externalLoadKg, s.reps, cv)
          : e1rmSystem(bodyweightKg, s.externalLoadKg, s.reps, cv);
        return isBarbell ? e1rmSys : (e1rmSys - bodyweightKg);
      }).filter(v => v !== null && v > 0);

      if (histE1RMs.length > 0) {
        histE1RMs.sort((a, b) => b - a);
        const baseline = median(histE1RMs.slice(0, Math.min(3, histE1RMs.length)));
        const baseCeiling = baseline * 1.10;
        const sr = computePerfectStreakCeilingBonus(topSets, sessions, mesocycle, isBarbell, bodyweightKg, baseCeiling);
        const ceilingMult = 1.10 + sr.bonus;
        ceiling_ext = baseline * ceilingMult;
        ceilingSource = `historia-baseline ${baseline.toFixed(1)} × ${ceilingMult.toFixed(2)}`
                      + (sr.bonus > 0 ? ` [B+ streak ${sr.streak}× → +${(sr.bonus*100).toFixed(0)}%]` : '');
      }
    }

    if (ceiling_ext !== null && currentE1RMExternal > ceiling_ext) {
      const original = currentE1RMExternal;
      currentE1RMExternal = ceiling_ext;
      currentE1RMSystem = isBarbell ? ceiling_ext : (ceiling_ext + bodyweightKg);
      trace("E1RM_INFLATION_CAP",
        { e1rmExternal: original },
        { e1rmExternal: currentE1RMExternal, ceiling: ceiling_ext, source: ceilingSource },
        `e1RM ${original.toFixed(1)} kg → ${currentE1RMExternal.toFixed(1)} kg (cap: ${ceilingSource})`);
    }

    // v4.34.17 FIX #5: E1RM FLOOR CAP (symmetrinen ceiling cap:n kanssa).
    // Käyttäjäpalaute TI-pilotista: Epley + Vara ALIMITTAA squat-1RM:n korkeilla
    // toistoilla (4×6 V3 → e1RM 156 kg vs todellinen PR 175 kg = -11 %). Tämä
    // aiheuttaa ohjelman load-DROPin viikkojen välillä:
    //   Vk 1: 4×6×120 V3 (planned 120 = 0.686 × 175)
    //   Vk 2: 0.71 × computed e1RM 156 = 111 kg (vs intent 0.71 × 175 = 124 kg)
    //   = -9 kg DROP vk 1:stä, vaikka Vx-tavoite sama V3 ja kuorman pitäisi nousta.
    // Erityisen tärkeä squat/dippi-tyyppisille barbell-/external-only-laskennoille
    // (kaava ilman BW-additiota) joissa Epley-curve flatterua nopeammin kuin
    // pull-upissa (jossa BW lisää effective mass-arvoa).
    //
    // Logiikka (symmetrinen ceiling-capin kanssa):
    //   1. Cal-historia → floor = MIN(cal-derived) × 0.95 (validated alaraja)
    //   2. Ei cal:ia    → floor = initialPR × 0.95 (seed alaraja)
    //   3. Jos computed < floor → cap UP — älä luota Epley-aliarvioon ilman cal-validointia
    if (currentE1RMExternal !== null && primaryMovementId) {
      const allCalSetsForFloor = topSets.filter(s => s.setRole === "calibration");
      const recentCalForFloor = allCalSetsForFloor.slice(-3);

      if (recentCalForFloor.length > 0) {
        const calE1RMsFloor = recentCalForFloor.map(s => {
          const cv = s.actualVx ?? s.targetVx ?? 1;
          const e1rmSys = isBarbell
            ? e1rmAccessory(s.externalLoadKg || 0, s.reps || 1, cv)
            : e1rmSystem(bodyweightKg, s.externalLoadKg || 0, s.reps || 1, cv);
          return isBarbell ? e1rmSys : (e1rmSys - bodyweightKg);
        }).filter(v => v !== null);
        if (calE1RMsFloor.length > 0) {
          floor_ext = Math.min(...calE1RMsFloor) * 0.95;
          floorSource = `cal-derived (min ${Math.min(...calE1RMsFloor).toFixed(1)} × 0.95)`;
        }
      }

      if (floor_ext === null) {
        // v4.34.43: floor käyttää SAMAA effective cfg:tä kuin ceiling
        // (drift-konsistenssi). Jos cfg drifttasi ylös, myös floor on korkeampi.
        const cfgInfoFloor = getCfgBaselineForMovement(mesocycle, primarySlotMeta);
        const initialPRFloor = cfgInfoFloor.value;
        if (initialPRFloor && initialPRFloor > 0) {
          // Käytä cfgDriftResult:n effective-arvoa jos saatavilla (= sama drift kuin ceilingissä)
          const effectiveCfgFloor = cfgDriftResult?.toCfg ?? initialPRFloor;
          floor_ext = effectiveCfgFloor * 0.95;
          const driftLabel = cfgDriftResult?.driftPct > 0 ? ` [drift +${(cfgDriftResult.driftPct*100).toFixed(1)}%]` : '';
          floorSource = `${cfgInfoFloor.movName} PR ${initialPRFloor}${driftLabel} × 0.95`;
        }
      }

      if (floor_ext !== null && currentE1RMExternal < floor_ext) {
        const originalLow = currentE1RMExternal;
        currentE1RMExternal = floor_ext;
        currentE1RMSystem = isBarbell ? floor_ext : (floor_ext + bodyweightKg);
        trace("E1RM_DEFLATION_CAP",
          { e1rmExternal: originalLow },
          { e1rmExternal: currentE1RMExternal, floor: floor_ext, source: floorSource },
          `e1RM ${originalLow.toFixed(1)} kg → ${currentE1RMExternal.toFixed(1)} kg (floor: ${floorSource} — Epley-aliarviosuoja)`);
      }
    }
  }

  trace("E1RM_COMPUTED", {}, {
    e1rmSystem: currentE1RMSystem?.toFixed(1),
    e1rmExternal: currentE1RMExternal?.toFixed(1),
    fromSets: recentTopSets.length,
    source: e1rmSource,
  }, `e1RM laskettu ${recentTopSets.length} viimeisimmästä top-setistä (lähde: ${e1rmSource})`);

  // v4.25.1: LV-profiilin cross-check (Enode-valmistelu). Ei vaikuta kuormaan —
  // diagnostiikka kun velocity-dataa kertyy ankkuripisteistä. Jos ristiinveto
  // eroaa yli ±7% Vx-pohjaisesta e1RM:stä, tämä on *signaali* että joko:
  //   (a) Vx-raportointi on systemaattisesti biased (atleetin tunnettu taipumus), tai
  //   (b) velocity-anturi on kalibroimaton, tai
  //   (c) LV-profiili on vielä rakentumassa (n < 5 pistettä — vähemmän luotettava).
  if (currentE1RMExternal !== null) {
    // Anchor-set haku: primary-liikkeen KAIKKI setit joilla velocityMean
    // (riippumatta setRole:sta — secondary-slot-top-singlet tallentuvat "accessory"-rolena).
    const anchorSetsForLV = primaryMovementId
      ? allSets.filter(s =>
          s.movementId === primaryMovementId &&
          s.velocityMean !== null && s.velocityMean !== undefined &&
          s.reps === 1
        )
      : [];
    // v4.34.25: pass movementName for liike-spesifi MVT-haku (Sánchez-Moreno 2017 jne.)
    // primarySlotMeta?.defaultMovementName tunnetaan dayPlan-rakenteesta
    const lvProfile = computeLoadVelocityProfile(anchorSetsForLV, bodyweightKg, {
      isBarbell,
      currentE1RMExternal,
      movementName: primarySlotMeta?.defaultMovementName || null,
    });
    if (lvProfile.n >= 3 && lvProfile.e1rmCrossCheck !== null) {
      const diffPct = (lvProfile.e1rmCrossCheck - currentE1RMExternal) / currentE1RMExternal;
      const absDiff = Math.abs(diffPct);
      const severity = absDiff > 0.07 ? "SIGNIFICANT" : absDiff > 0.03 ? "MODERATE" : "ALIGNED";
      trace("VBT_E1RM_CROSSCHECK", {},
        {
          e1rmVx: currentE1RMExternal.toFixed(1),
          e1rmVelocity: lvProfile.e1rmCrossCheck.toFixed(1),
          diffPct: (diffPct * 100).toFixed(1) + "%",
          v1rmEstimate: lvProfile.v1rmEstimate?.toFixed(2),
          points: lvProfile.n,
          severity,
        },
        `LV-profiili ${lvProfile.n} pistettä · Vx-e1RM ${currentE1RMExternal.toFixed(1)} kg vs. velocity-e1RM ${lvProfile.e1rmCrossCheck.toFixed(1)} kg (${(diffPct * 100).toFixed(1)}%) · ${severity}`);
    }

    // v4.34.27: VBT Reliability-portti — promote velocity-pohjainen e1RM PRIMARY-haaraan
    // jos n ≥ 10 ankkuripistettä viim. 4 vk JA |diff| ≤ 5%. Hysteresis ≥ 8% demotelle.
    // Vaatii liike-spesifin MVT:n (Sánchez-Moreno 2017 jne.) — tunnistetaan
    // primarySlotMeta?.defaultMovementName-pohjalta.
    const vbtStatus = computeVBTPromotionStatus(allSets, primaryMovementId, currentE1RMExternal, {
      isBarbell,
      bodyweightKg,
      movementName: primarySlotMeta?.defaultMovementName || null,
      todayISO: dateISO,
      previouslyPromoted: false, // MVP: ei vielä historiaa, lasketaan fresh
    });
    // v4.34.31: Tarkista onko PLAN_BASED_E1RM jo aktivoitunut. Jos kyllä, VBT EI saa
    // ylikirjoittaa sitä (suunnitelma-uskollisuus voittaa yksittäiset velocity-mittaukset).
    // Plan-based on hyödyttänyt useamman session datasta + tunnetusta loadPct-historiasta;
    // VBT on regressio yksittäisten ankkuripisteiden pohjalta. Tärkeysjärjestys:
    //   1. Plan-based (jos perfect execution)
    //   2. VBT (jos n≥10 LV-pistettä JA plan-based ei aktivoitu)
    //   3. Epley+Vara (default)
    const planBasedActive = traces.some(t => t.ruleId === "PLAN_BASED_E1RM");
    if (vbtStatus.status === "promoted" && vbtStatus.recommendedE1RM !== null && !planBasedActive) {
      const oldE1RM = currentE1RMExternal;
      // v4.34.28: Clamp velocity-pohjainen e1RM cap-rajoihin (cowork-audit kohta 2.2 #1).
      // Aiempi bug: jos diff < 5% ja velocity-arvio yli ceiling-capin, VBT-promote nosti
      // e1RM:n yli capin. Korjaus: clampataan ceiling/floor-arvoihin jos ne määritelty.
      let proposedE1RM = vbtStatus.recommendedE1RM;
      const beforeClamp = proposedE1RM;
      if (ceiling_ext !== null) proposedE1RM = Math.min(proposedE1RM, ceiling_ext);
      if (floor_ext !== null)   proposedE1RM = Math.max(proposedE1RM, floor_ext);
      const wasClamped = proposedE1RM !== beforeClamp;
      currentE1RMExternal = proposedE1RM;
      currentE1RMSystem = isBarbell ? currentE1RMExternal : (currentE1RMExternal + bodyweightKg);
      trace("VBT_PRIMARY_USED",
        { e1rmExternal: oldE1RM.toFixed(1), source: "vx-pohjainen" },
        { e1rmExternal: currentE1RMExternal.toFixed(1), source: "velocity-promoted",
          anchorCount: vbtStatus.anchorCount, diffPct: (vbtStatus.diffPct * 100).toFixed(1) + "%",
          clampedToCeiling: wasClamped && ceiling_ext !== null && proposedE1RM === ceiling_ext,
          clampedToFloor: wasClamped && floor_ext !== null && proposedE1RM === floor_ext },
        `VBT promotettu: ${vbtStatus.anchorCount} ankkuripistettä · ±${(vbtStatus.diffPct * 100).toFixed(1)}% diff → e1RM ${oldE1RM.toFixed(1)} → ${currentE1RMExternal.toFixed(1)} kg (velocity-pohjainen)${wasClamped ? ` [clampattu: ${beforeClamp.toFixed(1)} → ${proposedE1RM.toFixed(1)}]` : ""}`);
    } else if (vbtStatus.status === "promoted" && planBasedActive) {
      // VBT olisi aktivoitunut mutta PLAN_BASED on tärkeämpi
      trace("VBT_DEFERRED_TO_PLAN", {},
        { vbtRecommendedE1RM: vbtStatus.recommendedE1RM?.toFixed(1), planBasedE1RM: currentE1RMExternal.toFixed(1),
          anchorCount: vbtStatus.anchorCount, diffPct: vbtStatus.diffPct !== null ? (vbtStatus.diffPct * 100).toFixed(1) + "%" : "n/a" },
        `VBT promote ohitettu: PLAN_BASED on aktiivinen (suunnitelma-uskollisuus voittaa yksittäisen velocity-mittauksen). VBT-arvio ${vbtStatus.recommendedE1RM?.toFixed(1)} kg, plan-based ${currentE1RMExternal.toFixed(1)} kg.`);
    } else if (vbtStatus.status === "candidate") {
      trace("VBT_CANDIDATE", {},
        { anchorCount: vbtStatus.anchorCount, diffPct: vbtStatus.diffPct !== null ? (vbtStatus.diffPct * 100).toFixed(1) + "%" : "n/a" },
        `VBT candidate: ${vbtStatus.reason} (Vx-e1RM säilyy primary-haarana)`);
    }
  }

  // 5. Readiness
  const readiness = options.readiness || { combined: "GREEN", capLevel: 0, channels: {} };
  const capLevel = readiness.capLevel;

  // 6. deltaPct calculation
  const dayMult = DAY_TYPE_MULTIPLIERS[dayType] ?? 1.0;
  // K5-7 (audit-invariantti C ×4, 2026-07-04): day-kerroin EI saa laimentaa NEGATIIVISTA
  // basea. Deload-viikon volume-päivä sai −0.20 × 0.6 = −12 % → Helms-lattia (−15…−30 %,
  // PMID 30153841) rikki; vk4/vk8 osuivat rajalle vain sattumalta (−0.25 × 0.6 = −15.0).
  // Deloadin SYVYYS on tutkimusinvariantti — päivätyyppi-differentiointi tehdään
  // toistoilla/Vx:llä, ei kevennystä syömällä. Positiivinen progressio skaalautuu ennallaan.
  const _deltaBase = weekDef?.deltaPctBase || 0;
  const _deltaMult = _deltaBase < 0 ? 1.0 : dayMult;
  let deltaPctRawValue = _deltaBase * _deltaMult;
  trace("DELTA_PCT_RAW", {}, { deltaPctRaw: deltaPctRawValue },
    `deltaPct_raw = ${_deltaBase} × ${_deltaMult}${_deltaBase < 0 && dayMult !== 1.0 ? " (negatiivinen base: day-kerroin ohitettu, K5-7 Helms-lattia)" : ""}`);

  // 7. Vara trend correction (asymmetric: aggressive up, conservative down)
  const varaCorr = varaTrendCorrection(recentTopSets);
  if (varaCorr !== 0) {
    const oldDelta = deltaPctRawValue;
    deltaPctRawValue += varaCorr;
    trace("VARA_TREND_CORRECTION", { deltaPct: oldDelta }, { deltaPct: deltaPctRawValue }, `Vara-trendikorjaus: ${varaCorr > 0 ? "+" : ""}${(varaCorr * 100).toFixed(2)}% ${varaCorr > 0.015 ? "(AKSELEROINTI 🚀)" : ""}`);
  }

  // 7b. e1RM momentum bonus (PR-trendi kiihdyttää)
  const e1rmSeries = e1rmValues.map(v => ({ e1rm: v }));
  const momentumBonus = e1rmMomentumBonus(e1rmSeries);
  if (momentumBonus > 0) {
    const oldDelta = deltaPctRawValue;
    deltaPctRawValue += momentumBonus;
    trace("E1RM_MOMENTUM_BONUS", { deltaPct: oldDelta }, { deltaPct: deltaPctRawValue }, `PR-momentum +${(momentumBonus * 100).toFixed(2)}% (e1RM nousutrendi)`);
  }

  // 7c. Gross-mismatch correction (ohjelma aivan väärin skaalattu → escalointi)
  const grossCorr = grossMismatchCorrection(recentTopSets);
  if (grossCorr > 0) {
    const oldDelta = deltaPctRawValue;
    deltaPctRawValue += grossCorr;
    trace("GROSS_MISMATCH_CORRECTION", { deltaPct: oldDelta }, { deltaPct: deltaPctRawValue }, `Ohjelman skaalausvirhe havaittu — pikakorjaus +${(grossCorr * 100).toFixed(2)}%`);
  }

  // v4.34.34 BUG 2 (b): FIRST-SET CAPACITY BONUS
  // Aktivoituu kun viim. session ekka työsarja oli ≥2 luokkaa helpompi kuin
  // target (esim. target V3, actual V5+). Käyttäjäpalaute: "ekka V5-helppous
  // ei johda mihinkään" → tämä on suora vastaus. Ekka sarja fresh = vahva
  // kapasiteetti-signaali, ei väsymys-signaali. Soveltaa vain heavy-päiviin
  // (volume/speed-päivissä Vx ei mittaa kuorma-kapasiteettia).
  if (dayType === "heavy") {
    const firstSetBonus = firstSetCapacityBonus(recentTopSets);
    if (firstSetBonus > 0) {
      const oldDelta = deltaPctRawValue;
      deltaPctRawValue += firstSetBonus;
      const lastSessId = recentTopSets[recentTopSets.length - 1]?.sessionId;
      const firstWork = recentTopSets.filter(s => s.sessionId === lastSessId).find(s => s.setRole !== "calibration");
      const ovr = firstWork ? (firstWork.actualVx - firstWork.targetVx) : 0;
      trace("FIRST_SET_CAPACITY_BONUS",
        { deltaPct: oldDelta },
        { deltaPct: deltaPctRawValue, overshoot: ovr, bonus: firstSetBonus },
        `Ekka työsarja ${ovr >= 0 ? "+" : ""}${ovr} Vx vs target (target V${firstWork?.targetVx}, actual V${firstWork?.actualVx}) — fresh-V${firstWork?.actualVx} = +${(firstSetBonus*100).toFixed(1)}% kapasiteetti-bonus`);
    }
  }

  // 8. Break modifier
  if (breakInfo.modifier !== 0) {
    const oldDelta = deltaPctRawValue;
    deltaPctRawValue += breakInfo.modifier;
    trace("BREAK_MODIFIER", { deltaPct: oldDelta }, { deltaPct: deltaPctRawValue }, `Tauko-modifikaattori: ${breakInfo.modifier * 100}%`);
  }

  // 8b. Failure lockout (v4.25 P2-16): jos edellinen sessio meni failureen
  // (Vx 0), ei nosteta kuormaa. Suojaa atleetin grinding-taipumukselta.
  // v4.34.33 BUG-FIX 1.4: trace edelleen vaikka deltaPct olisi jo negatiivinen
  // (esim. tauko-modifikaattori vetänyt sen alas). Käyttäjä saa tietää että
  // engine HUOMASI failuren — UX-konsistenssi, ei behavior change.
  if (hadFailureLastSession(recentTopSets)) {
    if (deltaPctRawValue > 0) {
      const oldDelta = deltaPctRawValue;
      deltaPctRawValue = Math.min(deltaPctRawValue, 0);
      trace("FAILURE_LOCKOUT", { deltaPct: oldDelta }, { deltaPct: deltaPctRawValue, capped: true },
        "Edellinen sessio Vx 0 → kuormaa ei nosteta (failure-lockout)");
    } else {
      trace("FAILURE_DETECTED", { deltaPct: deltaPctRawValue }, { deltaPct: deltaPctRawValue, capped: false },
        "Edellinen sessio Vx 0 huomattu — kuorma jo negatiivinen muista syistä, lockoutia ei tarvita");
    }
  }

  // 9. Clamp
  const maxDelta = settings.maxDelta || 0.25;
  let deltaPct = clamp(deltaPctRawValue, -maxDelta, maxDelta);

  // 10. Apply readiness cap + active load reduction
  //     RED  → -5 % kuormaan (tai -8 % jos sekä velocity että Vara punaisia)
  //     YELLOW → -2 % kuormaan
  //     Samalla + targetVx +1 (kevennä varaa) jotta sarjat eivät mene failureen.
  let readinessLoadReduction = 0;
  let readinessVxBump = 0;
  if (capLevel === 2) {
    const oldDelta = deltaPct;
    deltaPct = Math.min(deltaPct, 0);
    if (dayType === "heavy") {
      const oldDayType = dayType;
      dayType = "volume";
      trace("CAP_RED_DAYTYPE", { dayType: oldDayType }, { dayType: "volume" }, "RED readiness → heavy vaihdettu volume:ksi");
    }
    // Double-red (velocity + Vara molemmat RED) = syvä väsymys → isompi vähennys
    const velRed = readiness.channels?.velocity?.class === "RED";
    const varaRed = readiness.channels?.vara?.class === "RED";
    readinessLoadReduction = (velRed && varaRed) ? -0.08 : -0.05;
    readinessVxBump = 1;
    deltaPct += readinessLoadReduction;
    trace("CAP_RED", { deltaPct: oldDelta }, { deltaPct }, `RED readiness → kuorma ${(readinessLoadReduction * 100).toFixed(1)}% + targetVx +${readinessVxBump}${velRed && varaRed ? " (double-red: velocity + Vara)" : ""}`);
  } else if (capLevel === 1) {
    const oldDelta = deltaPct;
    // H-019 väli-fix (returner-INVARIANT_VIOLATION; K5-7-luokan guard, 3. esiintymä):
    // vain POSITIIVINEN delta puolitetaan. Negatiivisen (deload/kevennys) puolitus
    // NOSTI kuorman yli suunnitellun (−25 % → −14,5 %) = cap-only-rike + invariantti C
    // -rike. Väsynyt atleetti deload-viikolla saa vähintään täyden kevennyksen.
    deltaPct = deltaPct > 0 ? deltaPct * 0.5 : deltaPct;
    readinessLoadReduction = -0.02;
    deltaPct += readinessLoadReduction;
    trace("CAP_YELLOW", { deltaPct: oldDelta }, { deltaPct }, `YELLOW readiness → ${oldDelta > 0 ? "deltaPct puolitettu + " : ""}kuorma ${(readinessLoadReduction * 100).toFixed(1)}%`);
  }

  // H-019 väli-fix: syvyysraja — readiness-vähennykset eivät vie deltaa invariantti C:n
  // syvän rajan (−30 %) ohi (esim. deload −25 % + double-RED −8 % = −33 %). Clamp tasan
  // rajalle + trace. Rajatapaus −25 − 5 osuu täsmälleen doubleen −0.3 (ei float-
  // artefaktia tälle parille) → läpäisee tiukan < -vertailun ilman clampia; clamp
  // suojaa syvemmät summat ja mahdolliset artefaktit muilla base-arvoilla.
  if (deltaPct < -0.30) {
    const _preClampDelta = deltaPct;
    deltaPct = -0.30;
    trace("DELOAD_DEPTH_CLAMP", { deltaPct: _preClampDelta }, { deltaPct },
      `Syvyysraja: kevennysten summa ${(_preClampDelta * 100).toFixed(1)}% capattu −30,0 %:iin (deload-invariantin syvä raja)`);
  }

  // 11. Compute target load — use actual slot reps/Vx when available
  let targetReps, targetVx;
  const primarySlotForLoad = dayPlan?.slots?.find(s => s.role === "primary");
  if (primarySlotForLoad) {
    // Use actual dayPlan slot values (from weekPlan)
    targetReps = primarySlotForLoad.reps;
    targetVx = primarySlotForLoad.targetVx ?? (dayType === "heavy" ? 2 : dayType === "volume" ? 3 : 4);
  } else if (weekDef) {
    targetReps = dayType === "heavy" ? weekDef.heavyReps : (dayType === "volume" ? 5 : 2);
    targetVx = dayType === "heavy" ? weekDef.heavyTargetVx : (dayType === "volume" ? 3 : 4);
  } else {
    targetReps = 3;
    targetVx = 2;
  }

  // Apply readiness Vx bump (RED day → +1 Vx kaikkiin sarjoihin, turvapuskuri)
  if (readinessVxBump > 0 && targetVx !== null) {
    targetVx = targetVx + readinessVxBump;
  }

  let targetExternalLoad;
  // K3-4: viime session demonstroitu kestotaso (viimeinen target-Vx:n täyttänyt työsarja,
  // fallback session-mediaani). Jaettu SUSTAINABILITY_CAP:in ja historia-tietoisen
  // VAROVAINEN-ehdotuksen kesken. null = ei anchor-historiaa (legacy-polku / cold start).
  let lastDemonstratedLoad = null;
  // F-2 intensiteetti-tietoinen korjaus (2026-06-02): same-liike non-primary clampataan ≤ pää VAIN
  // jos slot suunniteltu kevyemmäksi/yhtä raskaaksi. Mittari = EFEKTIIVISET TOISTOT (reps+Vx):
  // enemmän toistoja = kevyempi (volyymi/back-off) → clamp; vähemmän = raskaampi by-design
  // (top single / opener) → EI clampata. Reps-pohjainen (ei pct) → robusti kaikilla resoluutio-
  // poluilla + bittitarkka detektorin/testin kanssa (sama heavierByDesign). DESIGN-vertailu (pään
  // reps+Vx, ei suppressoitua kuormaa) → back-off > suppressed pää deloadissa → yhä clampataan.
  const primaryEffectiveReps = (primarySlotMeta && primarySlotMeta.reps != null && primarySlotMeta.targetVx != null)
    ? primarySlotMeta.reps + primarySlotMeta.targetVx : null;

  // v4.22 P2: Relative-loading -polku. Kun slot määrittelee loadPct (% nykyisestä
  // ext e1RM:stä), engine kunnioittaa sitä suoraan. Tämä on ohjelma-tekijän
  // eksplisiittinen ilmaus: "viikko 11 primary = 90 % current e1RM" — ei
  // mitään deltaPct + effReps -taikuutta päälle. Mahdottomia >100 % 1RM
  // kuormia ei voi syntyä ellei loadPct ole itsessään > 1.0.
  //
  // Käyttö: slot.loadPct = 0.90. Backward-compat: jos loadPct puuttuu, fallback
  // alempaan deltaPct-pohjaiseen laskentaan (ylläpito vanhoille mesosykleille).
  if (primarySlotMeta?.loadPct !== undefined && primarySlotMeta?.loadPct !== null) {
    const pct = primarySlotMeta.loadPct;
    if (currentE1RMExternal !== null && currentE1RMExternal > 0) {
      // β Round B-α-1 — Lähde 1 -reitti tier 1/2/3:lle (L46 "A puhtaana"):
      //   maxReps = targetReps + targetVx
      //   expectedPct = 1 / (1 + maxReps/30)  (vRepsToExpectedPct)
      //   kuorma = isBarbell ? sys × expectedPct : sys × expectedPct − BW
      // Tier "special" (Heavy negative leuka, Board dippi) → säilyy nykyinen
      // loadPct-kaava (in-session-kuorma). Fallback (primaryTier null) → vanha kaava.
      // Brzycki/conservative rajattu pois eksplisiittisesti (L46).
      let pctForResolve = pct;
      let resolveSource = "loadPct";
      if (typeof primaryTier === "number" && (primaryTier === 1 || primaryTier === 2 || primaryTier === 3)) {
        // K3-1: + across-set-väsymysvara — kuorma jonka VIIMEINENkin sarja kestää target-Vx:llä.
        const maxReps = targetReps + targetVx + acrossSetAllowance(primarySlotMeta?.sets, acrossSetRate);
        const expectedPct = vRepsToExpectedPct(maxReps);
        if (expectedPct !== null) {
          pctForResolve = expectedPct;
          resolveSource = "vRepsToExpectedPct";
        }
      }
      // Lisäpainoliikkeet (BW-ank): kuorma = pct × (BW + extE1RM) − BW (system-pohjainen)
      // Tankoliikkeet (isBarbell): kuorma = pct × extE1RM (external == system, BW ei nouse tangon mukana)
      targetExternalLoad = roundToHalf(Math.max(0, isBarbell
        ? currentE1RMSystem * pctForResolve
        : currentE1RMSystem * pctForResolve - bodyweightKg));
      trace("LOAD_PCT_RESOLVED", {}, { pct, pctForResolve, resolveSource, primaryTier, targetReps, targetVx, currentE1RMSystem, currentE1RMExternal, isBarbell, targetExternalLoad },
        `${(pctForResolve*100).toFixed(0)}% × ${isBarbell ? "ext" : "sys"} e1RM (${(isBarbell ? currentE1RMExternal : currentE1RMSystem).toFixed(1)} kg)${isBarbell ? "" : " − BW"} = ${targetExternalLoad} kg [src: ${resolveSource}, tier: ${primaryTier ?? "fallback"}]`);

      // v4.35.0 — Eliittitason progressio: yksi funktio päättää kuorman.
      //
      // Vanha cap-only-arkkitehtuuri (PROGRESSION_RATE_LIMIT + PROGRESSION_FLOOR_CAP
      // erillisinä mekanismeina, dual-anchor heaviest+last, planBasedCapBonus,
      // weekMultiplier) on korvattu computeProgressionTarget-funktiolla joka
      // yhdistää regain-multiplier × Helms-weekly + Vx-adjustment + plan-floor +
      // hard-cap + regression-suoja yhdeksi deterministiseksi päätökseksi.
      //
      // Lähteet ja kalibrointi: PROGRESSION_CONFIG-vakio (Helms 2018, Cumming 2024,
      // Psilander 2018, Bruusgaard 2010, Issurin 2010).
      //
      // Vanhat ruleId:t (PROGRESSION_RATE_LIMIT, PROGRESSION_FLOOR_CAP) heijastetaan
      // trace-kutsuina taaksepäin yhteensopivuudeksi: testit jotka asserttaavat
      // näitä trace-merkintöjä säilyvät vihreinä.
      //
      // Anchor (computeRateLimitAnchor) säilytetään koska se tuottaa lastSession-
      // profiilin (medianLoad, medianVx, isCalibration, dateISO) jonka
      // computeProgressionTarget tarvitsee. Excludaa backoff (v4.34.35) jotta
      // anchor.medianVx ei sotkeudu V5-V6-backoff-sarjoista.
      //
      // K6-2b (vahdin 1. saalis, 2026-07-05): DELOAD-SESSIOT EIVÄT KELPAA ANKKURIKSI.
      // Deload on SUUNNITELTUA kevennystä (Helms 2018), ei kapasiteettievidenssiä —
      // silti rate-limit/floor ankkuroitui deload-viikon suppressoituihin kuormiin →
      // koko seuraava blokki alkoi romahtaneesta tasosta ja "toipui" hard-capilla
      // (+15 %/vk lähes nollasta; pilotissa vk9 primary 12,5 kg @ e1RM ext 101, ja
      // F-2 säteilytti romahduksen backoffeihin: PRESCRIPTION_SANITY 🐛 ×4).
      // Valmentaja ankkuroi uuden blokin viimeiseen NORMAALIIN sessioon — deload-
      // viikon (weekDef.deltaPctBase ≤ −0,10) sessiot ohitetaan ankkurivalinnassa.
      // Cal-sessiot deload-viikolla SÄILYVÄT (kalibrointi on kapasiteettievidenssiä).
      // Fallback: jos KAIKKI evidenssi on deload-viikoilta, käytetään sitä (parempi
      // kuin ei mitään). Kytkeytyy: SUSTAINABILITY_CAP:in demonstroitu-taso ja K3-4:n
      // VAROVAINEN perivät ohituksen automaattisesti (sama anchor).
      // Tunnistus setin OMASTA päivämäärästä (timestamp/dateISO) — sessionId vain
      // fallback-lookupina. Peruste: settien sessionId voi olla null (mm. pilot-
      // simulaattori, importoitu data) eikä ankkurisuoja saa riippua siitä.
      const _deloadDateMemo = {};
      const _isDeloadSet = (s) => {
        const d = s.dateISO || (s.timestamp || "").slice(0, 10)
          || (s.sessionId ? (sessions.find(x => x && x.sessionId === s.sessionId)?.dateISO ?? null) : null);
        if (!d) return false;
        if (_deloadDateMemo[d] === undefined) {
          const wk2 = getMesocycleWeek(mesocycle, d);
          const def2 = (wk2 != null) ? mesocycle?.weekDefs?.[wk2 - 1] : null;
          _deloadDateMemo[d] = !!(def2 && typeof def2.deltaPctBase === "number" && def2.deltaPctBase <= -0.10);
        }
        return _deloadDateMemo[d];
      };
      const _anchorSets = recentTopSets.filter(s =>
        s.setRole === "calibration" || !_isDeloadSet(s));
      const _anchorPool = _anchorSets.length ? _anchorSets : recentTopSets;
      if (_anchorSets.length < recentTopSets.length && _anchorSets.length) {
        trace("ANCHOR_DELOAD_SKIP", { skipped: recentTopSets.length - _anchorSets.length },
          { anchorSets: _anchorSets.length },
          `Progression ankkuri ohittaa ${recentTopSets.length - _anchorSets.length} deload-viikon sarjaa (suunniteltu kevennys ≠ kapasiteettievidenssi) → ankkuri viimeisestä normaalista sessiosta`);
      }
      const anchor = computeRateLimitAnchor(_anchorPool, { excludeBackoff: true });
      if (anchor) {
        const planTarget = targetExternalLoad;
        // K3-4: demonstroitu kestotaso talteen (skannaus siirretty SUSTAINABILITY_CAP:ista
        // ehdottomaksi jotta VAROVAINEN-ehdotus saa saman referenssin myös kun katto ei laukea).
        {
          const _susSessId = anchor.lastSession?.sessionId;
          if (_susSessId) {
            const _susLastSets = recentTopSets.filter(s => s.sessionId === _susSessId && s.setRole !== "readiness_test");
            for (let i = _susLastSets.length - 1; i >= 0; i--) {
              const _sv = _susLastSets[i].actualVx ?? _susLastSets[i].targetVx ?? null;
              if (_sv !== null && _sv >= (targetVx ?? 2) && (_susLastSets[i].externalLoadKg || 0) > 0) {
                lastDemonstratedLoad = _susLastSets[i].externalLoadKg; break;
              }
            }
            if (lastDemonstratedLoad === null) lastDemonstratedLoad = anchor.lastSession.medianLoad ?? null;
          }
        }
        const cfgInfoForProg = getCfgBaselineForMovement(mesocycle, primarySlotMeta);
        // OBS-030: jos anchor-lastSession on planOverride, attribuoi se suunnitellulle
        // päivälle (planSourceDateISO) progression-laskennassa. Vain planOverride →
        // normaalisessio ennallaan (bittitarkka). sessions = recommend-scope (rivi 3900).
        const _anchorSess = anchor.lastSession?.sessionId
          ? sessions.find(s => s.sessionId === anchor.lastSession.sessionId) : null;
        const _lastSessionProg = (_anchorSess?.isPlanOverride && _anchorSess.planSourceDateISO)
          ? { ...anchor.lastSession, planSourceDateISO: _anchorSess.planSourceDateISO }
          : anchor.lastSession;
        const progResult = computeProgressionTarget({
          lastSession: _lastSessionProg,
          targetVx: targetVx ?? 2,
          weekDef,
          dayType,
          cfgBaseline: cfgInfoForProg.value || null,
          planTarget,
          planBasedActive: planBasedE1RMGrowthPct > 0.005,
          dateISO,
        });

        if (progResult.targetLoad !== null) {
          const original = targetExternalLoad;
          targetExternalLoad = roundToHalf(progResult.targetLoad);
          const dt = progResult.decisionTrace;
          const ruleHits = dt.ruleHits;

          // Päätrace: koko progression-päätöksen audit trail
          trace("PROGRESSION_TARGET",
            { targetExternalLoad: original },
            { targetExternalLoad,
              ruleHits,
              regainRatio: dt.regainRatio,
              regainMultiplier: dt.regainMultiplier,
              weeksSinceLast: dt.weeksSinceLast,
              weeklyProgressionPct: dt.weeklyProgressionPct,
              vxAdjustmentPct: dt.vxAdjustmentPct,
              autoregTarget: dt.autoregTarget,
              planFloor: dt.planFloor,
              hardCap: dt.hardCap,
              anchorMedianLoad: anchor.medianLoad,
              anchorMedianVx: anchor.medianVx,
              lastLoad: anchor.lastSession.medianLoad,
              lastVx: anchor.lastSession.medianVx,
              fromSessions: anchor.fromSessions },
            dt.rationale);

          // Taaksepäin yhteensopivuus: heijasta vanhat ruleId:t erillisinä
          // trace-kutsuina jotta vanhat assertit (hasTrace(rec, "PROGRESSION_RATE_LIMIT"),
          // hasTrace(rec, "PROGRESSION_FLOOR_CAP")) säilyvät vihreinä.
          if (ruleHits.includes('PROGRESSION_HARD_CAP')) {
            trace("PROGRESSION_RATE_LIMIT",
              { targetExternalLoad: original },
              { targetExternalLoad,
                hardCap: dt.hardCap,
                autoregTarget: dt.autoregTarget,
                weeksSinceLast: dt.weeksSinceLast,
                newVx: targetVx ?? 2,
                anchorLoad: anchor.medianLoad,
                anchorVx: anchor.medianVx,
                lastLoad: anchor.lastSession.medianLoad,
                lastVx: anchor.lastSession.medianVx,
                fromSessions: anchor.fromSessions },
              `Rate-limit (hard-cap +${(PROGRESSION_CONFIG.HARD_CAP_PER_WEEK*100).toFixed(0)}%/vk × ${dt.weeksSinceLast}vk): ${original} → ${targetExternalLoad} kg.`);
          }
          if (ruleHits.includes('PROGRESSION_FLOOR_CAP')) {
            // before.targetExternalLoad: arvo ennen floor-cap-nostoa
            // (= max(planFloor, autoregTarget) ennen kuin lattia korjasi sen ylös)
            const beforeFloor = roundToHalf(Math.max(dt.planFloor, dt.autoregTarget));
            trace("PROGRESSION_FLOOR_CAP",
              { targetExternalLoad: beforeFloor },
              { targetExternalLoad,
                lastLoad: anchor.lastSession.medianLoad,
                lastVx: anchor.lastSession.medianVx,
                newVx: targetVx ?? 2,
                floor: anchor.lastSession.medianLoad },
              `Floor-cap: ${beforeFloor} → ${targetExternalLoad} kg (regression-suoja: viim. sessio ${anchor.lastSession.medianLoad.toFixed(1)} kg @V${anchor.lastSession.medianVx.toFixed(1)} meni targetin Vx:llä — uutta sessiota ei pudoteta tämän alle).`);
          }

          // K3-1b (retro-kenttä OBS-B3): KESTÄVYYS-KATTO — progressio ei saa nostaa kuormaa YLI
          // sen minkä across-set-Vx-malli (planTarget = e1RM × vReps(reps+Vx+vara)) sanoo koko
          // skeemalle kestäväksi. Demonstroitu taso säilyy lattiana: viime session VIIMEINEN
          // target-Vx:n täyttänyt työsarja = atletin itsekorjattu kestotaso (kenttäcase: cal
          // 73 → V1,V1,V0 → itsekorjaus 70 → seuraava 5×3 ankkuroituu ~70:een, EI 75:een).
          // Mediaani-Vx-lattia yksin oli sokea sessionsisäiselle rasitukselle (V0 + pudotus
          // eivät näy mediaanissa). Vain alaspäin — ei koskaan nosta.
          if (typeof planTarget === "number" && planTarget > 0 && targetExternalLoad > planTarget) {
            const demonstrated = lastDemonstratedLoad;
            const _susCap = roundToHalf(Math.max(demonstrated ?? 0, planTarget));
            if (_susCap < targetExternalLoad) {
              trace("SUSTAINABILITY_CAP",
                { targetExternalLoad },
                { targetExternalLoad: _susCap, planTarget, demonstrated,
                  sets: primarySlotMeta?.sets ?? null, targetVx: targetVx ?? null },
                `Kestävyys-katto: progressio ${targetExternalLoad} kg > across-set-kestävä ${planTarget} kg → ${_susCap} kg (lattiana viime session viimeinen target-Vx:n täyttänyt sarja ${demonstrated ?? "—"} kg — demonstroitu ei putoa, mutta yli kestävän ei nosteta)`);
              targetExternalLoad = _susCap;
            }
          }
        }
      }
    } else if (primarySlotMeta?.suggestedLoadKg) {
      // Ei vielä e1RM-historiaa → käytä plan-seedattua kuormaa
      targetExternalLoad = primarySlotMeta.suggestedLoadKg;
      trace("LOAD_PCT_SEED", {}, { targetExternalLoad, pct },
        `loadPct ${(pct*100).toFixed(0)}% mutta ei e1RM-historiaa → seed ${targetExternalLoad} kg`);
    } else {
      targetExternalLoad = null;
    }
  } else if (currentE1RMSystem !== null) {
    // Legacy-polku: deltaPct-pohjainen laskenta (käytössä default-mesosyklissä
    // ja vanhemmissa streetlifting_16w-sessioissa jotka eivät vielä tunne loadPct:tä)
    const effectiveReps = targetReps + targetVx;
    if (isBarbell) {
      targetExternalLoad = roundToHalf(Math.max(0,
        (currentE1RMSystem / (1 + effectiveReps / 30)) * (1 + deltaPct)));
    } else {
      const targetSystemLoad = currentE1RMSystem / (1 + effectiveReps / 30);
      const rawExternal = targetSystemLoad * (1 + deltaPct) - bodyweightKg;
      targetExternalLoad = roundToHalf(Math.max(0, rawExternal));
    }
  } else {
    targetExternalLoad = null;
  }

  // Fallback: use slot's suggestedLoadKg when no e1RM history (e.g. new lift / start of program)
  if (targetExternalLoad === null && primarySlotMeta?.suggestedLoadKg !== undefined && primarySlotMeta.suggestedLoadKg !== null) {
    targetExternalLoad = primarySlotMeta.suggestedLoadKg;
    trace("SUGGESTED_LOAD_FALLBACK", {}, { targetExternalLoad },
      "Ei e1RM-dataa — käytetään ohjelman ehdotettu lähtökuorma");
  }

  // v4.27.13: NON-PRIMARY SLOT LOAD RESOLUTION
  //
  // Pre-v4.27.13-bug: UI renderöi backoff-slotin aina "primary × 0.85" (riippumatta
  // slotin omasta loadPct:stä), ja secondary-slotit (top singlet, etukyykky LA)
  // eivät koskaan lukeneet loadPct:tään — UI haki MovementProgress-historiasta.
  // Tämä romautti streetlifting_16w:n relative-loading-arkkitehtuurin: vk 7-16
  // "Top single @88-95%" ja LA:n etukyykky-progressio eivät ikinä toteutuneet
  // suunnitellusti.
  //
  // Ratkaisu: Engine resolvoi jokaisen loadPct-slotin kuorman:
  //   1. Sama liike kuin primary → johdetaan session-effective-e1RM primaryn
  //      (mahdollisesti rate-limitatusta) targetExternalLoad:sta. Näin
  //      primaryn rate-limit säteilee automaattisesti backoff/secondaryyn.
  //   2. Eri liike (loadPctReferenceMovementName asetettu, esim. etukyykky
  //      → Takakyykky) → haetaan referenssi-liikkeen e1RM sen omasta
  //      historiasta, ja sovelletaan erillinen rate-limit slotin oman
  //      liikkeen viim. sarjasta jos historiaa on.
  // ── H-016 (2026-06-12): liike-tason paluuramppi — MIN-PRECEDENCE (§6.1) ──
  // Applioidaan targetExternalLoadiin ENNEN sessionEffectiveE1RM-johdantoa →
  // kevennys säteilee back-off/secondaryyn automaattisesti (§6.2) ja Sykli-
  // preview + K1-projektio perivät sen hybrid-cachen kautta (A6). Kevennyksiä
  // EI kumuloida: min() kattaa myös globaalin breakAnalysis-modifierin polun.
  // Ei koske cal-slotteja eikä accessoryja (omat polut). DORMANTTI kun liike
  // treenattu < 14 pv sisällä (prioriteettilinjaus: arjen polku bittitarkka).
  let primaryReloadInfo = null;
  if (primaryMovement && typeof targetExternalLoad === "number" && targetExternalLoad > 0) {
    primaryReloadInfo = computeMovementReload(
      allSets, primaryMovement.name, primaryMovement.movementId, mesocycle, dateISO);
    if (primaryReloadInfo) {
      const reloadTarget = roundToHalf(Math.max(0, primaryReloadInfo.targetKg));
      if (reloadTarget < targetExternalLoad) {
        // A8: falsifiointi-instrumentointi — R1 §2.6 -ennusteen vertailudata
        trace("BREAK_RELOAD",
          { targetExternalLoad },
          { targetExternalLoad: reloadTarget, breakDays: primaryReloadInfo.breakDays,
            reloadPct: primaryReloadInfo.reloadPct, anchorKg: primaryReloadInfo.anchorKg,
            reason: primaryReloadInfo.reason, hadReplacement: primaryReloadInfo.hadReplacement,
            phase: primaryReloadInfo.phase, step: primaryReloadInfo.step,
            stepsTotal: primaryReloadInfo.stepsTotal },
          `Paluuramppi (${primaryMovement.name}): tauko ${primaryReloadInfo.breakDays} pv → ` +
          `${primaryReloadInfo.phase === "first-return"
            ? `kevennys −${(primaryReloadInfo.reloadPct * 100).toFixed(1)} % ankkurista ${primaryReloadInfo.anchorKg} kg`
            : `porras ${primaryReloadInfo.step}/${primaryReloadInfo.stepsTotal} kohti ${primaryReloadInfo.anchorKg} kg`} ` +
          `= ${reloadTarget} kg (min-precedence; normaali ${targetExternalLoad} kg)${primaryReloadInfo.reason === "vaiva" ? " · vaiva: etene vain oireettomana" : ""}`);
        targetExternalLoad = reloadTarget;
      } else {
        primaryReloadInfo = null; // normaali target on jo konservatiivisempi → ei applikointia
      }
    }
  }

  // Resolvoitu kuorma asetetaan slot.resolvedLoadKg:ksi; UI lukee sen.
  if (dayPlan?.slots) {
    // H-016 A6: reload-tieto primary-slottiin UI-indikaatiota varten (banneri lukee)
    if (primaryReloadInfo) {
      const _reloadPSlot = dayPlan.slots.find(s => s.role === "primary");
      if (_reloadPSlot) _reloadPSlot._reload = primaryReloadInfo;
    }
    const primaryHasLoadPct = primarySlotMeta?.loadPct !== undefined &&
                              primarySlotMeta?.loadPct !== null &&
                              primarySlotMeta.loadPct > 0;
    // v4.51.x loadpct-fix: sessionEffectiveE1RM on systeemi-pohjainen jotta
    // primary-rate-limit säteilee oikein backoff/secondary-sloteille post-fix-
    // loadPct-resolverissa (pct × system − BW non-barbellille, pct × system barbellille).
    // OBS-CORE ROOT-A (2026-05-30): sessionEffectiveE1RM = KANONINEN primary-e1RM
    // (currentE1RMSystem — sama lähde jonka preview/_syRenderComputeKg käyttää), EI
    // back-laskettu target/loadPct. Vanha kaava jakoi vReps-lasketun targetin LABEL-
    // loadPct:lla (esim. 0.78) eikä todellisella vReps-%:lla (0.833) → e1RM inflatoitui
    // 1.068× (193.6 vs tosi 181.3) → Branch A -slotit (back-off + same-liike-apuliikkeet)
    // raskaampia kuin pää JA ≠ preview (Koti≠live). Kanoninen lähde → back-off < pää,
    // apuliike < pää, Koti = live yhdestä e1RM-lähteestä. (Sama null-ehto kuin ennen.)
    const sessionEffectiveE1RM = (primaryHasLoadPct && targetExternalLoad !== null && currentE1RMSystem !== null)
      ? currentE1RMSystem
      : null;
    const primaryMovementName = primarySlotMeta?.defaultMovementName || null;

    // Haetaan liikeluettelo kerran (tarvitaan cross-reference- + Haara C -haaroille)
    let allMovsForResolve = null;
    const needsAllMovs = dayPlan.slots.some(s => s.loadPctReferenceMovementName)
      // K1-E5 (Haara C): eri-liike-accessoryt tarvitsevat liikeluettelon oma-e1RM-resoluutioon
      || dayPlan.slots.some(s => s.role === "accessory" && s.defaultMovementName
           && s.defaultMovementName !== (primarySlotMeta?.defaultMovementName || null));
    if (needsAllMovs) {
      allMovsForResolve = options.allMovements || await getAllMovements();
    }

    for (const slot of dayPlan.slots) {
      if (slot.role === "primary") continue;
      // K1-E5 (Haara C): eri-liike-accessory ILMAN loadPct:tä jatkaa Haara C:hen (oma-e1RM-
      // resoluutio) — aiemmin guard skippasi sen tässä → slotilla ei ollut MITÄÄN engine-
      // resoluutiota. Muut roolit ilman loadPct:tä skippaavat kuten ennen (bit-exact).
      const _slotNoLoadPct = (slot.loadPct === undefined || slot.loadPct === null || slot.loadPct <= 0);
      if (_slotNoLoadPct && !(slot.role === "accessory" && slot.defaultMovementName
            && slot.defaultMovementName !== primaryMovementName)) continue;

      // v4.34.15 FIX #2: CALIBRATION-SLOT RESOLVER + PR-CAP.
      // HUOM (OBS-048-korjaus 2026-06-17): aiempi premissi "cal-päivissä ei ole primarya"
      // oli VANHENTUNUT ja piilotti OBS-048:n: vk4 puhdas cal-päivä = ei primarya
      // (config-PR-fallback), MUTTA vk8/vk12 cal-päivä rakentaa primaryn + cal-slotin
      // SAMALLA liikkeellä (tiDay/maDay/toDay) → primaryMovementName===calMovName.
      // Cal-load = loadPct × KANONINEN e1RM (computeMovementE1RMBest, sama kuin kortti) JA
      // capattu PR × 1.025 (turva). Kanoninen base eliminoi streak/ceiling/PLAN_BASED-inflaation.
      if (slot.role === "calibration" &&
          !slot.loadPctReferenceMovementName &&
          slot.defaultMovementName) {
        // Etsi tämän liikkeen oma e1RM (ei välttämättä primaryMovementId)
        const calMovName = slot.defaultMovementName;
        const cfg = mesocycle?.streetliftingConfig?.calibration || {};
        const initialPR = calMovName === "Lisäpainoleuanveto" ? cfg.leukaExtKg
                        : calMovName === "Lisäpainodippi"     ? cfg.dippiExtKg
                        : calMovName === "Takakyykky"          ? cfg.kyykkyExtKg
                        : null;
        // OBS-048 (2026-06-17): cal-base = KANONINEN e1RM (computeMovementE1RMBest),
        // SAMA funktio + SAMA set-suodatin kuin e1RM-kortti (index.html:5910). Kalibrointi
        // MITTAA e1RM:ää → se ei saa kantaa progressio-bonusta. Aiempi calBaseE1RM =
        // currentE1RMExternal saattoi divergoida kanonisesta 7 inflaatiolähteellä
        // (PLAN_BASED, ceiling/streak-bonus, cal-derived ×1,05, floor, cfg-drift, VBT, primer)
        // → suunniteltu 0,92 cal resolvoitui jopa 0,966:een (Akselin vk8: 187×1,05×0,92=180,5).
        // Kanoninen lähde eliminoi KAIKKI 7 yhdellä yhtäsuuruudella + poistaa F-3-display-
        // epäsuhdan (cal-base ≡ kortti). Cal-scope B: kaikki cal-liikkeet kanoniseen; config-PR
        // vain Best===null -fallbackina (ei historiaa). Streak-bonus säilyy normaalissa
        // autoregulaatiossa (työsarjat, Branch A) — vain cal-base puhdistuu.
        let calBaseE1RM = null;
        let calBaseSource = null;
        const calMovObj = (primaryMovementName === calMovName && primaryMovement)
          ? primaryMovement
          : allMovementsForTier.find(m => m.name === calMovName);
        if (calMovObj && calMovObj.movementId) {
          // Kortin (index.html:5910) tarkka suodatin → bittitarkka invariantti cal-base ≡ kortti.
          const calMovSets = allSets.filter(s =>
            s.movementId === calMovObj.movementId && (s.externalLoadKg || 0) > 0 && s.reps >= 1);
          const canon = computeMovementE1RMBest(calMovSets, sessions, mesocycle, calMovObj, bodyweightKg);
          if (canon && canon.value != null && canon.value > 0) {
            // computeMovementE1RMBest: barbell→ext, system-load→system(+BW). Cal-kaava (alla)
            // odottaa EXTERNAL-yksikköä → system-load-liikkeelle vähennä BW.
            calBaseE1RM = isSystemLoadMovement(calMovObj) ? Math.max(0, canon.value - bodyweightKg) : canon.value;
            calBaseSource = "canonical-best:" + canon.source;
          }
        }
        if (calBaseE1RM === null && initialPR && initialPR > 0) {
          // Fallback (ei historiaa / liikettä ei löydy): konfiguroitu PR. EI kanna streak-bonusta.
          calBaseE1RM = initialPR;
          calBaseSource = "config-PR";
        }
        if (calBaseE1RM !== null) {
          // v4.51.x loadpct-fix: cal-load lasketaan system-pohjaisesti non-barbellille
          // (pct × (BW + cal-1RM) − BW); barbell-sloteilla (Takakyykky) ennallaan.
          const slotIsBarbell = slot.isBarbell === true;
          let calLoad = slotIsBarbell
            ? calBaseE1RM * slot.loadPct
            : (calBaseE1RM + bodyweightKg) * slot.loadPct - bodyweightKg;
          // PR-cap: cal-load ei koskaan yli PR × 1.025 (max +2.5 kg uutta ennätystä testissä)
          let prCapped = false;
          if (initialPR && calLoad > initialPR * 1.025) {
            calLoad = initialPR * 1.025;
            prCapped = true;
          }
          slot.resolvedLoadKg = roundToHalf(Math.max(0, calLoad));
          trace("SLOT_LOAD_RESOLVED_CAL",
            { slotRole: slot.role, slotMovement: calMovName },
            { resolvedLoadKg: slot.resolvedLoadKg, pct: slot.loadPct,
              baseE1RM: calBaseE1RM.toFixed(1), baseSource: calBaseSource, PR: initialPR, prCapped, isBarbell: slotIsBarbell },
            `${calMovName} cal: ${(slot.loadPct*100).toFixed(0)}% × ${calBaseE1RM.toFixed(1)} kg = ${slot.resolvedLoadKg} kg${prCapped ? ` (PR-cap = ${initialPR}×1.025)` : ""}`);
          continue;
        }
      }

      // Haara A: slot jakaa primaryn liikkeen → käytä session-effective-e1RM
      if (!slot.loadPctReferenceMovementName &&
          sessionEffectiveE1RM !== null &&
          primaryMovementName &&
          slot.defaultMovementName === primaryMovementName) {
        // v4.51.x loadpct-fix: sessionEffectiveE1RM on system-pohjainen → pct × system − BW non-barbell.
        // β Round B-α-1: tier 1/2/3 → Lähde 1 -reitti (vRepsToExpectedPct(reps+Vx)).
        // Tier "special" tai fallback → vanha loadPct-kaava.
        const slotIsBarbellA = slot.isBarbell === true;
        const slotMovementA = primarySlotMeta?.defaultMovementName === slot.defaultMovementName
          ? primaryMovement
          : (slot.defaultMovementName ? allMovementsForTier.find(m => m.name === slot.defaultMovementName) : null);
        let slotTierA = null;
        if (slotMovementA && slotMovementA.tier !== undefined) {
          try { slotTierA = resolveTier(slotMovementA, mesocycle); }
          catch (e) { slotTierA = null; }
        }
        let slotPctForResolveA = slot.loadPct;
        let slotResolveSourceA = "loadPct";
        // OBS-049 (2026-06-17): TOP SINGLE / OPENER (reps===1) säilyttää OHJELMOIDUN
        // slot.loadPct:n — vReps-override koskee VAIN multi-rep back-offia (reps≥3).
        // Aiemmin vReps(reps+Vx) korvasi loadPct:n KAIKILLE tier-1/2/3 same-liike-sloteille
        // → top single 1×1@V1 → vReps(2)=0,9375 KAIKILLE → ohjelmoitu loadPct-ramppi
        // (vk10 0,92 → vk11 0,95) katosi jokaisella tier-1-atleetilla (sweep: squat/leuka/dippi).
        // Top singlen loadPct ON jo reps-appropriaatti (1-rep intensiteetti) → respektoidaan se.
        // !attemptsPct suojaa tulevat kisa-attempt-slotit (supra-maksimaaliset openerit).
        // Verifioitu: kaikki back-offit reps≥3, kaikki top singlet/openerit reps===1.
        const isTopSingle = slot.reps === 1 && !slot.attemptsPct;
        if (!isTopSingle &&
            typeof slotTierA === "number" && (slotTierA === 1 || slotTierA === 2 || slotTierA === 3)) {
          const slotMaxReps = (slot.reps ?? 0) + (slot.targetVx ?? 0) + acrossSetAllowance(slot.sets, acrossSetRate); // K3-1
          const slotExpectedPct = vRepsToExpectedPct(slotMaxReps);
          if (slotExpectedPct !== null) {
            slotPctForResolveA = slotExpectedPct;
            slotResolveSourceA = "vRepsToExpectedPct";
          }
        }
        slot.resolvedLoadKg = roundToHalf(Math.max(0, slotIsBarbellA
          ? sessionEffectiveE1RM * slotPctForResolveA
          : sessionEffectiveE1RM * slotPctForResolveA - bodyweightKg));
        // F-2 (2026-05-31; intensiteetti-tietoinen korjaus 2026-06-02): same-liike non-primary
        // clampataan ≤ pään (suppressoitu) target VAIN jos suunniteltu kevyemmäksi/yhtä raskaaksi
        // (efektiiviset toistot slot.reps+Vx ≥ pään reps+Vx). Raskaampi by-design (top single/opener,
        // VÄHEMMÄN toistoja) → EI clampata. Reps-vertailu = pään DESIGN (ei suppressoitua) → back-off
        // designed-lighter > suppressed pää deloadissa → yhä clampataan. Sama heavierByDesign kuin detektori.
        if (typeof targetExternalLoad === "number"
            && slot.resolvedLoadKg > targetExternalLoad
            && !(slot.reps != null && slot.targetVx != null && primaryEffectiveReps !== null
                 && (slot.reps + slot.targetVx) < primaryEffectiveReps)) {
          slot.resolvedLoadKg = roundToHalf(targetExternalLoad);
        }
        trace("SLOT_LOAD_RESOLVED",
          { slotRole: slot.role, slotMovement: slot.defaultMovementName },
          { resolvedLoadKg: slot.resolvedLoadKg, pct: slot.loadPct, pctForResolve: slotPctForResolveA, resolveSource: slotResolveSourceA, tier: slotTierA, sessionE1RM: sessionEffectiveE1RM.toFixed(1), isBarbell: slotIsBarbellA },
          `${slot.role} ${slot.defaultMovementName}: ${(slotPctForResolveA*100).toFixed(0)}% × ${slotIsBarbellA ? "ext" : "sys"} e1RM (${sessionEffectiveE1RM.toFixed(1)} kg)${slotIsBarbellA ? "" : " − BW"} = ${slot.resolvedLoadKg} kg [src: ${slotResolveSourceA}, tier: ${slotTierA ?? "fallback"}, primary-rate-limit säteilee]`);
        continue;
      }

      // Haara B: cross-reference (esim. etukyykky → takakyykky-e1RM)
      if (slot.loadPctReferenceMovementName && allMovsForResolve) {
        const refMov = allMovsForResolve.find(m => m.name === slot.loadPctReferenceMovementName);
        if (!refMov) continue;
        const refSets = allSets
          .filter(s => s.movementId === refMov.movementId &&
                       (s.setRole === "top" || s.setRole === "readiness_test"))
          .sort(_evidenceSort); // K2c: suorituspäivä-sort
        if (refSets.length === 0) continue;
        const refIsBarbell = slot.isBarbell === true;
        const refRecent = refSets.slice(-6);
        const refVals = refRecent.map(s => {
          const vara = s.actualVx ?? s.targetVx ?? 1;
          if (refIsBarbell) return e1rmAccessory(s.externalLoadKg || 0, s.reps || s.targetReps || 3, vara);
          return e1rmExternal(bodyweightKg, s.externalLoadKg || 0, s.reps || s.targetReps || 3, vara);
        }).filter(v => v !== null);
        const refE1RM = refVals.length ? median(refVals) : null;
        if (refE1RM === null || refE1RM <= 0) continue;

        // v4.34.49: CFG-FLOOR cross-reference-haaralle.
        // Atletin palaute 2026-05-08: vk 1 LA Takakyykky 120 kg V4 helposti, mutta
        // vk 2 LA UI ehdotti 94 kg = 0.55 × 170 (historia-mediani). Atletin Asetuksissa
        // cfg.kyykkyExtKg = 185, mutta cross-reference-haara ohitti tämän kokonaan.
        // Ratkaisu: käytä max(historia-mediani, cfg-baseline) → atletin intentionaalinen
        // cfg-arvo toimii alarajana. Jos atletti suoriutuu yli cfg:n, historia voittaa.
        // Säilyttää konservatismin (cfg ei voi LASKEA kuormaa) mutta antaa cfg:n
        // intentionaalisen arvon vaikuttaa secondary-sloteihin (esim. LA Takakyykky).
        let effectiveBaseE1RM = refE1RM;
        const refCfgInfo = getCfgBaselineForMovement(mesocycle, {
          defaultMovementName: slot.loadPctReferenceMovementName,
        });
        if (refCfgInfo.value && refCfgInfo.value > refE1RM) {
          effectiveBaseE1RM = refCfgInfo.value;
          trace("CFG_FLOOR_APPLIED",
            { historyMedian: refE1RM.toFixed(1) },
            { cfgFloor: refCfgInfo.value, source: refCfgInfo.source, key: refCfgInfo.key,
              slotMovement: slot.defaultMovementName,
              referenceMovement: slot.loadPctReferenceMovementName },
            `Cfg-floor: ${slot.loadPctReferenceMovementName} cfg ${refCfgInfo.value} > historia ${refE1RM.toFixed(1)} → käytetään cfg-arvoa baselinena`);
        }
        // v4.51.x loadpct-fix (BW-ank cross-ref): pct × (BW + ref-1RM) − BW non-barbellille.
        // refIsBarbell=true (esim. Paused squat→Takakyykky) ennallaan (system == external).
        let baseLoad = roundToHalf(Math.max(0, refIsBarbell
          ? effectiveBaseE1RM * slot.loadPct
          : (effectiveBaseE1RM + bodyweightKg) * slot.loadPct - bodyweightKg));

        // Rate-limit slotin oman liikkeen historiasta
        // v4.27.14: käyttää computeRateLimitAnchor-helperiä (viim. 3 session
        // raskain median) sen sijaan että käytettäisiin yksittäistä viim. setriä.
        // Robustimpi deload/test-sessioille ja yksittäisille anomalioille.
        const selfMov = allMovsForResolve.find(m => m.name === slot.defaultMovementName);
        if (selfMov) {
          const selfSets = allSets
            .filter(s => s.movementId === selfMov.movementId && s.externalLoadKg > 0)
            .sort(_evidenceSort); // K2c: suorituspäivä-sort
          const selfAnchor = computeRateLimitAnchor(selfSets);
          if (selfAnchor) {
            // v4.35.0 — Eliittitason progressio cross-reference-sloteille.
            //
            // Sama yhdistetty progression-päätös kuin primary-haarassa: regain ×
            // Helms-weekly + Vx-adj + plan-floor + hard-cap + regression-suoja
            // yhdellä kutsulla computeProgressionTargetiin. Vanhat ruleId:t
            // (PROGRESSION_RATE_LIMIT_CROSSREF, PROGRESSION_FLOOR_CAP_CROSSREF)
            // heijastetaan trace-kutsuina taaksepäin yhteensopivuudeksi.
            //
            // Cross-ref-spesifit erot primaryyn:
            //   - planBasedActive: false (PLAN_BASED_E1RM ei käsittele
            //     secondary-slotteja — niiden e1RM tulee selfAnchor-historiasta)
            //   - cfgBaseline: slot.defaultMovementName-liikkeen cfg jos
            //     konfiguroitu (yleensä null secondary-sloteille → ei
            //     regain-multiplieria)
            const planTargetCR = baseLoad;
            const cfgInfoCR = getCfgBaselineForMovement(mesocycle, {
              defaultMovementName: slot.defaultMovementName,
            });
            // OBS-030: sama planSourceDateISO-attribuutio cross-ref-anchorille.
            const _crSess = selfAnchor.lastSession?.sessionId
              ? sessions.find(s => s.sessionId === selfAnchor.lastSession.sessionId) : null;
            const _lastSessionCR = (_crSess?.isPlanOverride && _crSess.planSourceDateISO)
              ? { ...selfAnchor.lastSession, planSourceDateISO: _crSess.planSourceDateISO }
              : selfAnchor.lastSession;
            const progResultCR = computeProgressionTarget({
              lastSession: _lastSessionCR,
              targetVx: slot.targetVx ?? 2,
              weekDef,
              dayType: dayPlan?.dayType ?? "heavy",
              cfgBaseline: cfgInfoCR.value || null,
              planTarget: planTargetCR,
              planBasedActive: false,
              dateISO,
            });

            if (progResultCR.targetLoad !== null) {
              const original = baseLoad;
              baseLoad = roundToHalf(progResultCR.targetLoad);
              const dt = progResultCR.decisionTrace;
              const ruleHits = dt.ruleHits;

              trace("PROGRESSION_TARGET_CROSSREF",
                { resolvedLoadKg: original },
                { resolvedLoadKg: baseLoad,
                  ruleHits,
                  regainRatio: dt.regainRatio,
                  regainMultiplier: dt.regainMultiplier,
                  weeksSinceLast: dt.weeksSinceLast,
                  weeklyProgressionPct: dt.weeklyProgressionPct,
                  vxAdjustmentPct: dt.vxAdjustmentPct,
                  autoregTarget: dt.autoregTarget,
                  planFloor: dt.planFloor,
                  hardCap: dt.hardCap,
                  anchorMedianLoad: selfAnchor.medianLoad,
                  anchorMedianVx: selfAnchor.medianVx,
                  lastLoad: selfAnchor.lastSession.medianLoad,
                  lastVx: selfAnchor.lastSession.medianVx,
                  fromSessions: selfAnchor.fromSessions,
                  slotMovement: slot.defaultMovementName,
                  referenceMovement: slot.loadPctReferenceMovementName },
                `${slot.defaultMovementName}: ${dt.rationale}`);

              // Taaksepäin yhteensopivuus: heijasta vanhat cross-ref-ruleId:t
              if (ruleHits.includes('PROGRESSION_HARD_CAP')) {
                trace("PROGRESSION_RATE_LIMIT_CROSSREF",
                  { resolvedLoadKg: original },
                  { resolvedLoadKg: baseLoad,
                    hardCap: dt.hardCap,
                    autoregTarget: dt.autoregTarget,
                    weeksSinceLast: dt.weeksSinceLast,
                    newVx: slot.targetVx ?? 2,
                    anchorLoad: selfAnchor.medianLoad,
                    anchorVx: selfAnchor.medianVx,
                    lastLoad: selfAnchor.lastSession.medianLoad,
                    lastVx: selfAnchor.lastSession.medianVx,
                    fromSessions: selfAnchor.fromSessions,
                    slotMovement: slot.defaultMovementName },
                  `${slot.defaultMovementName} rate-limit (hard-cap +${(PROGRESSION_CONFIG.HARD_CAP_PER_WEEK*100).toFixed(0)}%/vk × ${dt.weeksSinceLast}vk): ${original} → ${baseLoad} kg.`);
              }
              if (ruleHits.includes('PROGRESSION_FLOOR_CAP')) {
                const beforeFloor = roundToHalf(Math.max(dt.planFloor, dt.autoregTarget));
                trace("PROGRESSION_FLOOR_CAP_CROSSREF",
                  { resolvedLoadKg: beforeFloor },
                  { resolvedLoadKg: baseLoad,
                    lastLoad: selfAnchor.lastSession.medianLoad,
                    lastVx: selfAnchor.lastSession.medianVx,
                    newVx: slot.targetVx ?? 2,
                    floor: selfAnchor.lastSession.medianLoad,
                    slotMovement: slot.defaultMovementName,
                    referenceMovement: slot.loadPctReferenceMovementName },
                  `${slot.defaultMovementName} floor-cap: ${beforeFloor} → ${baseLoad} kg (regression-suoja: viim. sessio ${selfAnchor.lastSession.medianLoad.toFixed(1)} kg @V${selfAnchor.lastSession.medianVx.toFixed(1)} meni targetin Vx:llä — uutta sessiota ei pudoteta tämän alle).`);
              }
            }
          }
        }

        slot.resolvedLoadKg = baseLoad;
        // F-2 (2026-05-31; intensiteetti-tietoinen korjaus 2026-06-02): jos cross-ref-slotti on
        // poikkeuksellisesti same-liike JA suunniteltu kevyemmäksi/yhtä raskaaksi (efektiiviset toistot
        // ≥ pää), ≤ pää. (Branch B yleensä eri liike → guard ei laukea; defensiivinen.)
        if (primaryMovementName && slot.defaultMovementName === primaryMovementName
            && typeof targetExternalLoad === "number"
            && slot.resolvedLoadKg > targetExternalLoad
            && !(slot.reps != null && slot.targetVx != null && primaryEffectiveReps !== null
                 && (slot.reps + slot.targetVx) < primaryEffectiveReps)) {
          slot.resolvedLoadKg = roundToHalf(targetExternalLoad);
        }
        trace("SLOT_LOAD_RESOLVED_CROSSREF",
          { slotRole: slot.role, slotMovement: slot.defaultMovementName,
            referenceMovement: slot.loadPctReferenceMovementName },
          { resolvedLoadKg: slot.resolvedLoadKg, pct: slot.loadPct, refE1RM: refE1RM.toFixed(1) },
          `${slot.defaultMovementName}: ${(slot.loadPct*100).toFixed(0)}% × ${slot.loadPctReferenceMovementName}-e1RM (${refE1RM.toFixed(1)} kg) = ${slot.resolvedLoadKg} kg`);
        continue;
      }

      // Haara C (K1-E5, retro-kenttä OBS-C1): ERI-liike-apuliike ILMAN loadPct:tä/ristiviitettä —
      // resolvoi liikkeen OMASTA historiasta: e1RM (viim. 6 setin mediaani) × vReps(reps+Vx).
      // Aiemmin näillä sloteilla ei ollut MITÄÄN engine-resoluutiota → UI putosi progress-
      // jäänteeseen (kenttäevidenssi: Chest-supported row 72,5 kg ≈ saman päivän leuanvedon
      // kuorma, vaikka oma CSR-historia 105 kg × 8 / e1RM ext 134,9). e1RM×vReps sopeutuu
      // vaiheen reps/Vx-skeemaan (toisin kuin last-session-jäänne) → kanoninen lähde.
      // Kuormaperhe: laite/talja → suora Epley (external); leuanveto/dippi-perhe → BW-muunnos.
      if (slot.role === "accessory"
          && typeof slot.resolvedLoadKg !== "number"
          && !slot.loadPctReferenceMovementName
          && slot.defaultMovementName
          && primaryMovementName
          && slot.defaultMovementName !== primaryMovementName
          && slot.reps != null
          && allMovsForResolve) {
        const ownMov = allMovsForResolve.find(m => m.name === slot.defaultMovementName);
        if (ownMov) {
          const ownAll = allSets
            .filter(s => s.movementId === ownMov.movementId
                    && (s.externalLoadKg || 0) > 0
                    && s.setRole !== "readiness_test")
            .sort(_evidenceSort); // K2c: suorituspäivä-sort
          const ownSets = ownAll.slice(-6);
          const ownCredits = withinSessionFatigueCredits(ownAll, acrossSetRate).slice(-6); // K3-1: positio-krediitti
          if (ownSets.length) {
            const nL = slot.defaultMovementName.toLowerCase();
            // K6-3 (retro-kenttä 5.7: Heavy negative 85,3-kortti vs sys-resoluutio):
            // BW-perhe-luokitus tulee ENSISIJAISESTI liikkeen loadType-kentästä
            // (isSystemLoadMovement — sama totuus jota kortti/computeMovementE1RMBest
            // käyttää → F-3: kortti = live). Nimi-regex säilyy VAIN fallbackina
            // käyttäjän itse luomille liikkeille joilla ei ole loadType-kenttää.
            const ownIsBWFamily = ownMov.loadType != null
              ? isSystemLoadMovement(ownMov)
              : (!/laite|kone|machine|prässi|smith|talja|cable/.test(nL)
                 && /leuanveto|leuka|dippi|muscle-up|hspu/.test(nL));
            const ownValsRaw = ownSets.map((s, i) => {
              const vara = (s.actualVx ?? s.targetVx ?? 1) + (ownCredits[i] || 0);
              return ownIsBWFamily
                ? e1rmExternal(bodyweightKg, s.externalLoadKg || 0, s.reps || s.targetReps || 5, vara)
                : e1rmAccessory(s.externalLoadKg || 0, s.reps || s.targetReps || 5, vara);
            });
            const ownVals = ownValsRaw.filter(v => v !== null && v > 0); // K2b: raw säilyy indeksi-alignattuna ownSetsiin
            let ownE1RM = ownVals.length ? median(ownVals) : null;
            // K2b: post-break-ankkurikatto myös Haara C:lle — tauon jälkeinen tuore evidenssi
            // cappaa pre-break-dominoidun mediaanin (min, ×1,05 headroom; vain alaspäin).
            if (ownE1RM !== null && ownSets.length >= 2) {
              const _cbMap = {};
              for (const s2 of sessions) if (s2 && s2.sessionId) _cbMap[s2.sessionId] = s2.dateISO || null;
              const _cbTime = (x) => new Date(_cbMap[x.sessionId] || (x.timestamp || "").slice(0, 10)).getTime();
              let _cbIdx = -1;
              for (let i2 = ownSets.length - 1; i2 >= 1; i2--) {
                if ((_cbTime(ownSets[i2]) - _cbTime(ownSets[i2 - 1])) / 86400000 >= RELOAD_CONFIG.thresholdDays) { _cbIdx = i2; break; }
              }
              if (_cbIdx > 0) {
                const _cbPost = ownValsRaw.slice(_cbIdx).filter(v => v !== null && v > 0);
                if (_cbPost.length) {
                  const _cbCap = Math.max(..._cbPost) * 1.05;
                  if (ownE1RM > _cbCap) {
                    trace("POST_BREAK_ANCHOR_CAP_SLOT",
                      { slotMovement: slot.defaultMovementName, ownE1RM: ownE1RM.toFixed(1) },
                      { ownE1RM: _cbCap.toFixed(1), postBreakSets: _cbPost.length },
                      `${slot.defaultMovementName}: post-break-katto ${ownE1RM.toFixed(1)} → ${_cbCap.toFixed(1)} kg (tuore evidenssi ajaa)`);
                    ownE1RM = _cbCap;
                  }
                }
              }
            }
            const ownPct = vRepsToExpectedPct((slot.reps ?? 0) + (slot.targetVx ?? 2) + acrossSetAllowance(slot.sets, acrossSetRate)); // K3-1
            if (ownE1RM && ownPct !== null) {
              slot.resolvedLoadKg = roundToHalf(Math.max(0, ownIsBWFamily
                ? (ownE1RM + bodyweightKg) * ownPct - bodyweightKg
                : ownE1RM * ownPct));
              trace("SLOT_LOAD_RESOLVED_OWN",
                { slotRole: slot.role, slotMovement: slot.defaultMovementName },
                { resolvedLoadKg: slot.resolvedLoadKg, ownE1RM: ownE1RM.toFixed(1),
                  pct: ownPct.toFixed(3), bwFamily: ownIsBWFamily, fromSets: ownSets.length },
                `${slot.defaultMovementName}: oma e1RM ${ownE1RM.toFixed(1)} kg × ${(ownPct * 100).toFixed(0)} % (vReps ${slot.reps ?? 0}+${slot.targetVx ?? 2})${ownIsBWFamily ? " − BW" : ""} = ${slot.resolvedLoadKg} kg [Haara C: eri-liike-apuliike omasta datasta]`);

              // K5-1 (retro-kenttä OBS-HT, la vk10): APULIIKE-REGRESSION-LATTIA. Mediaani-6
              // voi ulottua edellisen (kevyemmän) session yli ja pudottaa ehdotuksen ALLE
              // juuri demonstroidun tason (hip thrust: 62,5×10 V4 ×3 → mediaani ehdotti
              // 59,5). Primaryllä sama suoja on PROGRESSION_FLOOR_CAP — apuliikkeiltä se
              // puuttui. Lattia: viime session mediaanikuorma JOS session mediaani-Vx ≥
              // slotin target-Vx JA mediaanitoistot ≥ slotin toistot (teki vähintään saman
              // työn vähintään samalla varalla). Vain nostaa — paluuramppi (BREAK_RELOAD_SLOT)
              // ajaa tämän YLI toisessa passissa (min-precedence), joten tauko-kevennys säilyy.
              const _afSessId = ownSets[ownSets.length - 1]?.sessionId;
              if (_afSessId && typeof slot.resolvedLoadKg === "number") {
                const _afSets = ownAll.filter(s => s.sessionId === _afSessId);
                const _afLoads = _afSets.map(s => s.externalLoadKg).filter(v => v > 0);
                const _afVx = _afSets.map(s => s.actualVx ?? s.targetVx).filter(v => v != null);
                const _afReps = _afSets.map(s => s.reps ?? s.targetReps).filter(v => v != null);
                if (_afLoads.length && _afVx.length && _afReps.length) {
                  // K6-3-tarkennus (retro-kenttä 5.7: Heavy negative 'vapaa'-Vx): kun slotin
                  // targetVx on null ("vapaa"), V1-demonstraatio kelpaa lattiaan — vain
                  // V0-grindi ei. Eksplisiittinen target säilyy ennallaan tiukkana ehtona.
                  const _afMet = median(_afVx) >= (slot.targetVx ?? 1) && median(_afReps) >= (slot.reps ?? 0);
                  const _afFloor = roundToHalf(median(_afLoads));
                  if (_afMet && slot.resolvedLoadKg < _afFloor) {
                    trace("ACCESSORY_FLOOR_CAP",
                      { slotMovement: slot.defaultMovementName, resolvedLoadKg: slot.resolvedLoadKg },
                      { resolvedLoadKg: _afFloor, lastSessionMedian: _afFloor,
                        lastMedianVx: median(_afVx), lastMedianReps: median(_afReps) },
                      `${slot.defaultMovementName}: regression-lattia ${slot.resolvedLoadKg} → ${_afFloor} kg (viime sessio ${_afFloor} kg meni V${median(_afVx)} / ${median(_afReps)} toistoa — demonstroitua ei pudoteta)`);
                    slot.resolvedLoadKg = _afFloor;
                  }
                }
              }
            }
          }
        }
      }
    }

    // ── K2a (retro-kenttä OBS-D): H-016-paluuramppi myös EI-primary-sloteille ─────────────
    // v1 rajasi accessoryt ulos (ratifioitu rajaus: "Ei koske cal-slotteja eikä accessoryja").
    // Kenttäevidenssi purki rajauksen (Akseli ratifioi KORI 2): dippi MA-vetopäivän accessoryna
    // palasi tauolta yhdellä kolmosella → engine ankkuroi tauko-edeltävään e1RM:ään täydellä
    // kuormalla (1RM-arvio 103,1 → 8·V3 @ 67,5) ILMAN kuormakorjausta — vain varoitusbanneri.
    // Sama min-precedence + sama cal-re-entry-ohitus + DORMANTTI-semantiikka kuin primaryllä;
    // VAIN alaspäin. Same-liike-slotit (backoff/secondary) perivät primaryn kevennyksen jo
    // sessionEffectiveE1RM-säteilystä (§6.2) → ohitetaan tuplakevennyksen estämiseksi.
    if (allMovsForResolve) {
      const _reloadCache = {};
      for (const slot of dayPlan.slots) {
        if (!(slot.role === "accessory" || slot.role === "secondary" || slot.role === "backoff")) continue;
        if (!slot.defaultMovementName || slot.defaultMovementName === primaryMovementName) continue;
        if (typeof slot.resolvedLoadKg !== "number" || slot.resolvedLoadKg <= 0) continue;
        let info = _reloadCache[slot.defaultMovementName];
        if (info === undefined) {
          const m = allMovsForResolve.find(x => x.name === slot.defaultMovementName);
          info = m ? computeMovementReload(allSets, m.name, m.movementId, mesocycle, dateISO) : null;
          _reloadCache[slot.defaultMovementName] = info;
        }
        if (!info) continue;
        const reloadTarget = roundToHalf(Math.max(0, info.targetKg));
        if (reloadTarget < slot.resolvedLoadKg) {
          trace("BREAK_RELOAD_SLOT",
            { slotRole: slot.role, slotMovement: slot.defaultMovementName, resolvedLoadKg: slot.resolvedLoadKg },
            { resolvedLoadKg: reloadTarget, breakDays: info.breakDays, reloadPct: info.reloadPct,
              anchorKg: info.anchorKg, phase: info.phase, step: info.step, stepsTotal: info.stepsTotal,
              reason: info.reason },
            `Paluuramppi (${slot.defaultMovementName}, ${slot.role}): tauko ${info.breakDays} pv → ` +
            `${info.phase === "first-return"
              ? `kevennys −${(info.reloadPct * 100).toFixed(1)} % ankkurista ${info.anchorKg} kg`
              : `porras ${info.step}/${info.stepsTotal} kohti ${info.anchorKg} kg`} ` +
            `= ${reloadTarget} kg (min-precedence; normaali ${slot.resolvedLoadKg} kg)${info.reason === "vaiva" ? " · vaiva: etene vain oireettomana" : ""}`);
          slot.resolvedLoadKg = reloadTarget;
          slot._reload = info;
        }
      }
    }
  }

  trace("TARGET_LOAD", {}, {
    targetExternalLoad,
    deltaPct: (deltaPct * 100).toFixed(2) + "%",
    targetReps,
    targetVx,
    isBarbell,
  }, `Ehdotettu kuorma: +${targetExternalLoad} kg`);

  // v4.34.2: Sanity diagnostic — primary-kuorman pitäisi tyypillisesti olla
  // korkeintaan ~1.6× seed-arvo (loadPct × kalibrointi). Jos enemmän, jokin
  // e1RM-ketjussa on pielessä: Vx-bias ylöspäin, väärä movement match,
  // bodyweight-asetus pielessä, calibration manuaalisesti väärin syötetty.
  // Käyttäjäpalaute v4.34.1 (TO-treeni): dippi 4×6 × 125 kg ehdotuksena vaikka
  // calibration D=80 kg → odotettu @68.6% = 55 kg. Ei pystytty toistaa
  // tyhjästä DB:stä, joten lisätty tämä diagnostic tunnistamaan tilanne kun
  // se toistuu. Älä silmukoi tästä ulos — tämä on informational only,
  // varsinainen kuorma palautetaan käyttäjälle muuttumattomana.
  if (targetExternalLoad !== null && primarySlotMeta?.suggestedLoadKg) {
    const seed = primarySlotMeta.suggestedLoadKg;
    const ratio = seed > 0 ? targetExternalLoad / seed : null;
    if (ratio !== null && ratio > 1.6) {
      trace("LOAD_SANITY_WARNING", {},
        { targetExternalLoad, seed, ratio: ratio.toFixed(2),
          currentE1RMExternal: currentE1RMExternal?.toFixed(1),
          primaryMovementName: primarySlotMeta.defaultMovementName,
          recentTopSetsCount: recentTopSets.length,
          e1rmSource },
        `⚠ Primary-kuorma ${targetExternalLoad} kg on ${ratio.toFixed(1)}× seed-arvo (${seed} kg) — tarkista e1RM-historia ja kalibrointi (movement: ${primarySlotMeta.defaultMovementName})`);
      if (typeof console !== "undefined" && console.warn) {
        console.warn(`[LeVe AI sanity] ${primarySlotMeta.defaultMovementName}: target ${targetExternalLoad} kg, seed ${seed} kg, ratio ${ratio.toFixed(2)}, e1RM_ext ${currentE1RMExternal?.toFixed(1) ?? "null"} kg, source ${e1rmSource}, top-sets ${recentTopSets.length} — investigate e1RM chain`);
      }
    }
  }

  // 12. Set prescription
  // K1-E2 (OBS-B1, retro-kenttä): sarjamäärä MATERIALISOIDUSTA primary-slotista (mitä atletti
  // oikeasti tekee) — ei dayType-reseptivakiosta. Kortti näytti "5×3" (heavy-resepti = 5) kun
  // päivän slotti oli 4×3 → "TYÖSARJA 1/4" -eripari (kaksi lähdettä ilman ristiintarkistusta,
  // sama vikaluokka kuin slot.targetVx vs weekDef). Resepti jää fallbackiksi ilman dayPlania.
  let setCount;
  if (primarySlotMeta && typeof primarySlotMeta.sets === "number" && primarySlotMeta.sets > 0) {
    setCount = primarySlotMeta.sets;
  } else {
    const recipe = DAY_TYPE_SET_RECIPES[dayType];
    if (recipe) {
      setCount = Array.isArray(recipe.sets) ? recipe.sets[0] : recipe.sets;
    } else {
      setCount = 3;
    }
  }

  // 13. Vara feedback
  const varaFB = varaFeedback(recentTopSets);
  if (varaFB.suggestion) {
    trace("VARA_FEEDBACK", {}, { suggestion: varaFB.suggestion, type: varaFB.type }, varaFB.suggestion);
  }

  // 14. Accessory cap (independent from primary)
  let accessoryCapActive = false;
  if (capLevel === 2) {
    // Check if ALL 3 channels are RED/YELLOW
    const channels = readiness.channels || {};
    const allBad = [channels.velocity, channels.hrv, channels.vara]
      .filter((c) => c && c.class)
      .every((c) => c.class === "RED" || c.class === "YELLOW");
    if (allBad) {
      accessoryCapActive = true;
      trace("ACCESSORY_CAP_ACTIVE", {}, { volumeReduction: "30%" }, "3/3 kanavaa RED/YELLOW → tukiliikkeet -30% volyymi");
    }
  }

  // 15. Ensure dayPlan always has slots (fallback if mesocycle plan didn't match)
  if (!dayPlan || !dayPlan.slots || dayPlan.slots.length === 0) {
    dayPlan = generateDefaultDayPlan(dayType, weekDef, accessoryCapActive);
    trace("DAY_PLAN_GENERATED", {}, { dayType, slotsCount: dayPlan.slots.length },
      "Päivän ohjelma generoitu oletusliikkeillä");
  }

  // v4.49.2 QF-1: Injektoi ENGINE_DEFAULT_WARMUP_RAMP primary-slot:eihin, joilla
  // warmupSets puuttuu. Default-meso ja muut presetit, jotka eivät määrittele
  // omaa skeletoniä, saavat tämän Helms 2017 -rampin (40/55/70/85 %). UI:n
  // hardcoded fallback ([0.30,0.55,0.75,0.90]) jää käyttöön vain jos tämä
  // injektio jostain syystä epäonnistuu.
  if (dayPlan?.slots) {
    dayPlan = {
      ...dayPlan,
      slots: dayPlan.slots.map((s) => {
        if (s.role !== "primary") return s;
        if (Array.isArray(s.warmupSets) && s.warmupSets.length > 0) return s;
        return { ...s, warmupSets: ENGINE_DEFAULT_WARMUP_RAMP.map((w) => ({ ...w })) };
      }),
    };
  }

  // v4.49.2 QF-5 + Q1: Emit VL_CAP_RESOLVED + SLOT_TARGETVx_RESOLVED -traces tässä
  // kohtaa kun dayPlan on varmasti olemassa (myös fallback-generaattorin jälkeen).
  // VL_CAP_RESOLVED: cap%, source, targetRir auditoitavaksi.
  // SLOT_TARGETVx_RESOLVED: hybridi-päätös slot.targetVx vs block-default-RIR,
  // grindy-bias-detection mukana.
  const primarySlotForTraces = dayPlan?.slots?.find(s => s.role === "primary");
  if (primarySlotForTraces) {
    vlCapForContext({
      blockPhase: inferredBlockPhase,
      exerciseName: primarySlotForTraces?.defaultMovementName,
      dayType,
      targetVx: primarySlotForTraces?.targetVx ?? null,
      settings,
      emitTrace: (entry) => {
        traces.push({ traceId: uid(), recId: null, ruleId: entry.ruleId, before: { ...entry.before }, after: { ...entry.after }, why: entry.why });
      },
    });

    if (typeof primarySlotForTraces.targetVx === "number") {
      const grindyBiasInfo = detectGrindyBias(sessions);
      const rep1Range = targetRep1VelocityRange(
        primarySlotForTraces.defaultMovementName,
        inferredBlockPhase,
        null,
        primarySlotForTraces.targetVx,
        grindyBiasInfo.detected,
      );
      trace("SLOT_TARGETVx_RESOLVED",
        { slotTargetVx: primarySlotForTraces.targetVx, blockPhase: inferredBlockPhase, blockDefaultRir: rep1Range.blockDefaultRir },
        {
          targetRir: rep1Range.targetRir,
          targetRirSource: rep1Range.targetRirSource,
          biasDetected: grindyBiasInfo.detected,
          biasSignificantCount: grindyBiasInfo.count,
          biasSessionsConsidered: grindyBiasInfo.sessionsConsidered,
        },
        `Primary slot.targetVx=${primarySlotForTraces.targetVx} → rep1Range target-RIR=${rep1Range.targetRir} (lähde: ${rep1Range.targetRirSource}${grindyBiasInfo.detected ? `, bias ${grindyBiasInfo.count}/${grindyBiasInfo.sessionsConsidered}` : ""})`);
    }
  }

  // Apply accessory cap: reduce accessory set counts by 30% if active
  if (accessoryCapActive && dayPlan && dayPlan.slots) {
    dayPlan = { ...dayPlan, slots: dayPlan.slots.map(s => {
      if (s.role === "accessory") {
        return { ...s, sets: Math.max(2, Math.round(s.sets * 0.7)) };
      }
      return s;
    })};
  }

  // v4.25 P1-10: Block-based accessory volume scaling.
  // Vain streetlifting_16w. Skaalaa accessory-sarjojen määrää alaspäin
  // myöhemmissä blokeissa (hypertrofia → voima → intensifikaatio → realization).
  // Ei vaikuta primary/secondary/backoff-sarjoihin — vain accessory.
  if (mesocycle.type === "streetlifting_16w" && dayPlan && dayPlan.slots) {
    const blockScalar = getAccessoryBlockScalar(weekNum);
    if (blockScalar < 1.0) {
      const blockNum = getBlockForWeek(weekNum);
      dayPlan = { ...dayPlan, slots: dayPlan.slots.map(s => {
        // v4.58.0: _noBlockScale — opt-out blokkiskalaarille taper-viikolla.
        //
        // TARKKUUS (verifioitu counterfactualilla — aiempi kommentti oli VÄÄRÄ):
        // skalaari EI aiheuttanut vk 15:n −83 %:n romahdusta. Katalogi-slotit
        // (slotId) menevät resolveDayPlanSlots-vaiheen läpi VASTA tämän jälkeen,
        // jolloin `phaseRep?.sets ?? slot.sets` ylikirjoittaa skalaarin tuloksen —
        // todiste: Face pull materialisoituu 2×15 vaikka määrittely sanoo 2×12.
        // Vk 15:n romahdus johtui viikon MÄÄRITTELYSTÄ (1 tukiliike/päivä, LA 0).
        //
        // Lippu on silti kantava: uudet taper-slotit ovat RAAKOJA (ei slotId) →
        // katalogi ei ohita niitä ja skalaari puree. Ilman lippua vk 15 = 32 sarjaa
        // (−63 %, Bosquet-ikkunan ulkopuolella); lipun kanssa 44 (−49 %).
        // Readiness-pohjainen accessoryCap (yllä, ×0.7) EI ole lipun piirissä —
        // se on autoregulaatiota, ei blokkirakennetta.
        if (s.role === "accessory" && s.sets > 1 && !s._noBlockScale) {
          const scaledSets = Math.max(1, Math.round(s.sets * blockScalar));
          return { ...s, sets: scaledSets, _blockScaled: true };
        }
        return s;
      })};
      trace("ACCESSORY_BLOCK_SCALAR", {}, { block: blockNum, scalar: blockScalar, weekNum },
        `Blokki ${blockNum} (vk ${weekNum}) → accessory-volyymi × ${blockScalar} (Issurin 2010)`);
    }
  }

  // v4.25 P1-9: MU load autoregulation.
  // Jos primary-slot on Muscle-up (tai slot.muAutoRegulate=true), säädä
  // suggestedLoadKg edellisen MU-session Vx-havaintojen perusteella.
  // Vaikuttaa vain MU-slotteihin joilla on muAutoRegulate=true (laDay:ssa
  // asetettu skillwork-polulle false, kuormitetuille true).
  if (dayPlan && dayPlan.slots) {
    const muSlot = dayPlan.slots.find(s =>
      s.muAutoRegulate === true &&
      (s.defaultMovementName === "Muscle-up" || s.defaultMovementName === "Muscle up")
    );
    if (muSlot && typeof muSlot.suggestedLoadKg === "number") {
      // Hae viim. MU-setit
      const allMovs = options.allMovements || await getAllMovements();
      const muMov = allMovs.find(m => m.name === "Muscle-up" || m.name === "Muscle up");
      if (muMov) {
        const muSets = allSets
          .filter(s => s.movementId === muMov.movementId && (s.setRole === "top" || !s.setRole))
          .sort(_evidenceSort) // K2c: suorituspäivä-sort
          .slice(-6);
        const adj = adjustMULoad(muSets);
        if (adj.suggestedDeltaKg !== 0) {
          const newKg = Math.max(0, muSlot.suggestedLoadKg + adj.suggestedDeltaKg);
          dayPlan = { ...dayPlan, slots: dayPlan.slots.map(s =>
            s === muSlot ? { ...s, suggestedLoadKg: newKg, _muAdjusted: adj } : s
          )};
          trace("MU_AUTO_REGULATE", { loadKg: muSlot.suggestedLoadKg },
            { loadKg: newKg, reason: adj.reason, avgVx: adj.avgVx?.toFixed(1) },
            `MU kuorma ${adj.suggestedDeltaKg > 0 ? "+" : ""}${adj.suggestedDeltaKg} kg (${adj.reason}, edell. Vx ka. ${adj.avgVx?.toFixed(1) ?? "–"})`);
        }
      }
    }
  }

  // 15b. Resolve accessory slots (slotId → phase-appropriate movement, honoring overrides + stagnation)
  if (dayPlan && dayPlan.slots && dayPlan.slots.some(s => s.slotId)) {
    const allMovements = options.allMovements || (await getAllMovements());
    const movementsByName = {};
    for (const m of allMovements) movementsByName[m.name] = m;
    const progressByMovementId = {};
    for (const m of allMovements) {
      const p = await getMovementProgress(m.movementId);
      if (p) progressByMovementId[m.movementId] = p;
    }
    dayPlan = resolveDayPlanSlots(dayPlan, {
      mesocycle, weekNum, movementsByName, progressByMovementId,
    });
    const swaps = dayPlan.slots.filter(s => s._resolvedFrom?.source === "stagnation-swap");
    if (swaps.length) {
      trace("ACCESSORY_SWAP_AUTO", {},
        { count: swaps.length, slots: swaps.map(s => s._resolvedFrom.slotId) },
        `Automaattinen tukiliikevaihto stagnaation perusteella (${swaps.length} liikettä)`);
    }
  }

  // 15c. OBS-035+037 (2026-05-31): saman liikkeen volyymi-apuliikkeen kanoninen kuorma.
  // resolveDayPlanSlots (15b) assignasi juuri apuliikkeen defaultMovementName + loadPct.
  // Load-resoluutio-loop (Haara A, ~4869) ajettiin ENNEN tätä → same-movement-volyymi-
  // apuliike jäi resolvedLoadKg=null (defaultMovementName ≠ primary loopin aikana, koska
  // slotId-variantti ei vielä resolvoitu). Liike-agnostinen pass: role=accessory +
  // defaultMovementName === sen päivän primary + loadPct + !loadPctReference →
  // resolvedLoadKg = currentE1RMSystem × loadPct − bw (non-barbell) / × loadPct (barbell).
  // EI vReps → kevyempi kuin back-off (joka pitää ROOT-A:n vReps-reitin). currentE1RMSystem
  // = kanoninen primary-e1RM (sama lähde kuin back-off + preview).
  if (dayPlan && dayPlan.slots && currentE1RMSystem !== null && currentE1RMSystem > 0) {
    const primarySlotForAcc = dayPlan.slots.find(s => s.role === "primary");
    const primaryMovNameForAcc = primarySlotForAcc?.defaultMovementName || null;
    if (primaryMovNameForAcc) {
      for (const slot of dayPlan.slots) {
        if (slot.role !== "accessory") continue;
        if (slot.loadPctReferenceMovementName) continue;
        if ((slot.defaultMovementName || null) !== primaryMovNameForAcc) continue;
        if (typeof slot.loadPct !== "number" || slot.loadPct <= 0) continue;
        const slotIsBarbellAcc = slot.isBarbell === true;
        slot.resolvedLoadKg = roundToHalf(Math.max(0, slotIsBarbellAcc
          ? currentE1RMSystem * slot.loadPct
          : currentE1RMSystem * slot.loadPct - bodyweightKg));
        // F-2 (2026-05-31; intensiteetti-tietoinen korjaus 2026-06-02): volyymi-apuliike ≤ pään target
        // VAIN jos suunniteltu kevyemmäksi/yhtä raskaaksi (efektiiviset toistot ≥ pää). Raskaampi
        // by-design → EI clampata. Sama reps-pohjainen heavierByDesign kuin detektori/testi/Branch A.
        if (typeof targetExternalLoad === "number"
            && slot.resolvedLoadKg > targetExternalLoad
            && !(slot.reps != null && slot.targetVx != null && primaryEffectiveReps !== null
                 && (slot.reps + slot.targetVx) < primaryEffectiveReps)) {
          slot.resolvedLoadKg = roundToHalf(targetExternalLoad);
        }
        trace("SLOT_LOAD_RESOLVED_ACCESSORY",
          { slotRole: slot.role, slotMovement: slot.defaultMovementName },
          { resolvedLoadKg: slot.resolvedLoadKg, loadPct: slot.loadPct, e1RMSystem: currentE1RMSystem.toFixed(1), isBarbell: slotIsBarbellAcc },
          `${slot.defaultMovementName} same-movement volyymi: ${(slot.loadPct*100).toFixed(0)}% × ${slotIsBarbellAcc ? "ext" : "sys"} e1RM (${currentE1RMSystem.toFixed(1)} kg)${slotIsBarbellAcc ? "" : " − BW"} = ${slot.resolvedLoadKg} kg [OBS-035+037 liike-agnostinen accessory-pass, ei vReps]`);
      }
    }
  }

  // ── K-A6D (VELOCITY_VX_RECONCILE, 2026-06-02): velocityStop johdetaan liike-spesifistä RTF
  // velocityAtTargetRir:stä (= odotettu velocity targetVx-varalla) KUN liikkeen RTF luotettava
  // (status "reliable" — sama promootio-portti kuin VBT-autoregulaatiolla); muuten VAIENNETTU
  // (null, päätös i: epäluotettava mittaus ei saa ajaa UI-varoitusta). Korvaa staattisen data.js-
  // velocityStopin → engine single source. velocityStopSource="rtf-reconciled" merkkaa ettei kyse
  // ole staattisesta arvauksesta (K-A6D-detektori ohittaa = AITO invariantti, ei mute). EI kosketa
  // computeCfgDrift-primer-signaalia (eri mekanismi, aktiivinen) eikä VL-cappia (resolveVlCap).
  if (dayPlan && dayPlan.slots) {
    const _rtfCacheVS = new Map();
    for (const _slot of dayPlan.slots) {
      let _vStop = null, _vStopSrc = null;
      if (typeof _slot.targetVx === "number" && _slot.defaultMovementName) {
        const _movRec = allMovementsForTier.find(m => m.name === _slot.defaultMovementName);
        const _movId = _movRec ? _movRec.movementId : null;
        if (_movId) {
          if (!_rtfCacheVS.has(_movId)) _rtfCacheVS.set(_movId, computeRtfVelocityModel(allSets, _movId));
          const _rtf = _rtfCacheVS.get(_movId);
          if (_rtf && _rtf.status === "reliable" && typeof _rtf.slope === "number" && _rtf.slope > 0 && typeof _rtf.intercept === "number") {
            const _v = _rtf.intercept + _rtf.slope * _slot.targetVx;
            if (_v > 0 && _v < 2) { _vStop = Math.round(_v * 100) / 100; _vStopSrc = "rtf-reconciled"; }
          }
        }
      }
      _slot.velocityStop = _vStop;
      _slot.velocityStopSource = _vStopSrc;
    }
  }

  // 16. Enrich dayPlan with variant names (if not already assigned from mesocycle)
  if (dayPlan && dayPlan.slots) {
    const variantMap = VARIANT_DAY_TYPE_MAP[dayType] || VARIANT_DAY_TYPE_MAP.heavy;
    for (const slot of dayPlan.slots) {
      if ((slot.role === "primary" || slot.role === "backoff") && slot.category === "vertikaaliveto" && !slot.variantName) {
        slot.variantName = variantMap[0]; // Default variant for this day type
      }
    }
    // Trace if variant assigned
    const primarySlot = dayPlan.slots.find(s => s.role === "primary" && s.variantName);
    if (primarySlot?.variantName) {
      trace("VARIANT_ASSIGNED", {}, { variant: primarySlot.variantName, dayType },
        `Variaatio: ${primarySlot.variantName}`);
    }
  }

  // Build recommendation
  // v4.34.27: VBT-status promote/candidate näkyväksi UI:lle (Edistyminen-välilehti).
  // v4.34.33 BUG-FIX 5.4: lisätty deferred-status — VBT olisi ollut promoted mutta
  // PLAN_BASED voitti. Käyttäjä näkee nyt että velocity-data on jo riittävä mutta
  // suunnitelma-uskollisuus on aktiivinen.
  const vbtPromotedTrace = traces.find(t => t.ruleId === "VBT_PRIMARY_USED");
  const vbtDeferredTrace = traces.find(t => t.ruleId === "VBT_DEFERRED_TO_PLAN");
  const vbtCandidateTrace = traces.find(t => t.ruleId === "VBT_CANDIDATE");
  const vbtSummary = vbtPromotedTrace
    ? { status: "promoted", anchorCount: vbtPromotedTrace.after.anchorCount, diffPct: vbtPromotedTrace.after.diffPct, source: "velocity" }
    : vbtDeferredTrace
    ? { status: "deferred", anchorCount: vbtDeferredTrace.after.anchorCount, diffPct: vbtDeferredTrace.after.diffPct, source: "plan-based" }
    : vbtCandidateTrace
    ? { status: "candidate", anchorCount: vbtCandidateTrace.after.anchorCount, diffPct: vbtCandidateTrace.after.diffPct, source: "vx" }
    : { status: "not-eligible", anchorCount: 0, diffPct: null, source: "vx" };

  // v4.49.2 DEEP-2: RTF-model status rec-output:iin. UI näyttää atletille milloin
  // RTF-malli on luotettava (Vx-targetting voi luottaa slot.targetVx:ään, ei
  // konservatiivista safety-net:iä). Sama enum kuin computeRtfVelocityModel.status:
  //   reliable    — r²≥0.85, n≥6, voidaan luottaa slot.targetVx:ään
  //   preview     — r²≥0.70, "rakentuu" -tila
  //   unreliable  — r²<0.70, mallia ei voida käyttää
  //   insufficient — n<3 sarjaa, malli ei vielä laskettavissa
  //   no-data     — primaryMovementId puuttuu tai ei sarjoja
  let rtfModelStatus = "no-data";
  let rtfModelStats = null;
  if (primaryMovementId) {
    try {
      const rtfModel = computeRtfVelocityModel(allSets, primaryMovementId);
      if (rtfModel && rtfModel.status) {
        rtfModelStatus = rtfModel.status;
        rtfModelStats = {
          n: rtfModel.n ?? null,
          sessionsCount: rtfModel.sessionsCount ?? null,
          r2: rtfModel.r2 ?? null,
          slope: rtfModel.slope ?? null,
          intercept: rtfModel.intercept ?? null,
          minR2Reliable: rtfModel.minR2Reliable ?? null,
          minR2Preview: rtfModel.minR2Preview ?? null,
        };
      }
    } catch (_e) {
      // computeRtfVelocityModel ei saa kaataa recommendia — säilytetään "no-data"
    }
  }
  trace("RTF_MODEL_STATUS",
    { primaryMovementId: primaryMovementId ?? null },
    { status: rtfModelStatus, n: rtfModelStats?.n ?? null, r2: rtfModelStats?.r2 ?? null },
    `RTF-malli ${rtfModelStatus}${rtfModelStats?.n != null ? ` (n=${rtfModelStats.n}, r²=${rtfModelStats.r2?.toFixed(2) ?? "-"})` : ""}`);

  // v4.50.0 (Track B 2D-δ): Adaptive multi-suggestion. Generate SAFE / TARGET /
  // AGGRESSIVE tier-variantit nykyisestä TARGET-laskennasta. Backward compat:
  // rec.targetExternalLoad / targetVx / deltaPct säilyvät TARGET-arvoina.
  let suggestionsResult;
  try {
    const grindyBiasForSuggestions = detectGrindyBias(sessions);
    const hadFailureForSuggestions = hadFailureLastSession(recentTopSets);
    suggestionsResult = generateSuggestions({
      targetExternalLoad,
      targetVx,
      deltaPct,
      targetReps,
      setCount,
      capLevel,
      hadFailure: hadFailureForSuggestions,
      grindyBiasDetected: grindyBiasForSuggestions.detected,
      rtfModelStatus,
      blockPhase: inferredBlockPhase,
      dayType,
      preferredBias: settings.preferredSuggestionBias ?? "balanced",
      aggressivenessLearned: settings.aggressivenessLearned ?? 0,
      lastSessionDemonstratedKg: lastDemonstratedLoad,
    });
    trace("SUGGESTIONS_GENERATED",
      { tierCount: suggestionsResult.suggestions.length, defaultId: suggestionsResult.defaultSuggestionId },
      {
        tiers: suggestionsResult.suggestions.map(s => ({
          id: s.id,
          load: s.targetExternalLoad,
          vx: s.targetVx,
          deltaPct: typeof s.deltaPct === "number" ? Number(s.deltaPct.toFixed(4)) : null,
        })),
        defaultSuggestionId: suggestionsResult.defaultSuggestionId,
        aggressiveAvailable: suggestionsResult.aggressiveAvailable,
      },
      `${suggestionsResult.suggestions.length} ehdotusta generoitu, default=${suggestionsResult.defaultSuggestionId}`);
    if (suggestionsResult.suppressedReasons.length > 0) {
      trace("SUGGESTION_SUPPRESSED",
        { tier: "aggressive" },
        { reasons: suggestionsResult.suppressedReasons },
        `Rohkea-ehdotus piilotettu: ${suggestionsResult.suppressedReasons.join(", ")}`);
    }
  } catch (_e) {
    // Fallback: jos generaatio epäonnistuu, palautetaan vain TARGET — pidetään
    // backward compat. Tämä on safety-net, ei normaali polku.
    suggestionsResult = {
      suggestions: [{
        id: "target",
        label: "Tavoite",
        deltaPct: typeof deltaPct === "number" ? deltaPct : 0,
        targetVx,
        targetExternalLoad,
        setCount,
        targetReps,
        rationaleShort: "Engine-suositus",
      }],
      defaultSuggestionId: "target",
      suppressedReasons: [],
      aggressiveAvailable: false,
    };
  }

  const rec = {
    recId: uid(),
    dateISO,
    mesocycleId: mesocycle.mesocycleId,
    mesocycleType: mesocycle.type || "default",
    weekNum,
    weekLabel: weekDef?.label || "?",
    dayType,
    targetExternalLoad,
    targetReps,
    targetVx,
    setCount,
    deltaPct,
    capLevel,
    readiness,
    e1rmSystem: currentE1RMSystem,
    e1rmExternal: currentE1RMExternal,
    bodyweightKg,
    varaFeedback: varaFB,
    breakInfo: breakInfo.breakDays >= 7 ? breakInfo : null,
    accessoryCapActive,
    dayPlan,
    vbtStatus: vbtSummary,
    // v4.49.2 DEEP-2: RTF-model status UI:n näytettäväksi "Miksi tämä paino?"-näkymässä.
    rtfModelStatus,
    rtfModelStats,
    // v4.50.0 (Track B 2D-δ): adaptive multi-suggestion -kentät. Atletti
    // valitsee UI:ssa, valinta tallennetaan session-recordiin erikseen.
    // rec.targetExternalLoad / targetVx / deltaPct (yllä) ovat TARGET-tier:n
    // arvoja backward compat -syistä — kaikki olemassa olevat lukijat toimivat
    // muuttumatta.
    suggestions: suggestionsResult.suggestions,
    defaultSuggestionId: suggestionsResult.defaultSuggestionId,
    suggestionContext: {
      rtfModelStatus,
      capLevel,
      grindyBiasDetected: detectGrindyBias(sessions).detected,
      aggressiveSuppressedReasons: suggestionsResult.suppressedReasons,
      preferredBias: settings.preferredSuggestionBias ?? "balanced",
      aggressivenessLearned: settings.aggressivenessLearned ?? 0,
      effectiveBias: typeof suggestionsResult.effectiveBias === "number"
        ? suggestionsResult.effectiveBias : 0,
      // 8a (V1): opittu across-set-rate (efektiivinen, clampattu) + luottamus
      // (n/(n+τ) ∈ [0,1), 0 = cold-start) — read-only auditointipinta UI:lle.
      learnedAcrossSetFatigue: acrossSetRate,
      learnedParamsCI: { acrossSetFatigue: learnedAcrossSetFatigueCI },
    },
    // v4.34.43: cfg-drift result. UI persistoi mesocycleen jos driftPct > 0.
    cfgDriftApplied: cfgDriftResult,
    traces,
  };

  // Assign recId to all traces
  for (const t of traces) t.recId = rec.recId;

  // Save if not dry run
  if (!options.dryRun) {
    await saveRecommendation({
      recId: rec.recId,
      sessionId: null,
      variantId: null,
      targetSetRole: "top",
      targetLoadKg: targetExternalLoad,
      deltaPct,
      capLevel,
      mesocycleWeek: weekNum,
      dayType,
      targetReps,
      targetVx,
      createdAtISO: new Date().toISOString(),
    });
    for (const t of traces) {
      await saveDecisionTrace(t);
    }
  }

  return rec;
}

// ═══════════════════════════════════════════════════════════════
// WEEKLY STIMULUS TRACKER
// ═══════════════════════════════════════════════════════════════

function weeklyStimulus(sets, movements) {
  const movementMap = new Map(movements.map((m) => [m.movementId, m]));

  let pullVolumeSets = 0;
  let pullVolumeTonnage = 0;
  let heavyExposures = 0;
  let totalTonnageExternal = 0;
  let totalTonnageSystem = 0;
  const byCategory = {};

  for (const s of sets) {
    const mov = movementMap.get(s.movementId);
    const category = mov?.category || "muu";
    const loadKg = s.externalLoadKg || 0;
    const reps = s.reps || 0;
    const tonnage = loadKg * reps;

    totalTonnageExternal += tonnage;

    if (PULL_VOLUME_CATEGORIES.has(category)) {
      pullVolumeSets++;
      pullVolumeTonnage += tonnage;
    }

    const effectiveReps = reps + (s.actualVx ?? s.targetVx ?? 1);
    if (effectiveReps <= 4) heavyExposures++;

    if (!byCategory[category]) byCategory[category] = { sets: 0, tonnage: 0 };
    byCategory[category].sets++;
    byCategory[category].tonnage += tonnage;
  }

  return {
    pullVolumeSets,
    pullVolumeTonnage,
    heavyExposures,
    totalTonnageExternal,
    byCategory,
  };
}

// ═══════════════════════════════════════════════════════════════
// K4-1 (retro-kenttä OBS-D) — VIIKKOVOLYYMI LIHASRYHMITTÄIN (live-ohjelma)
// ═══════════════════════════════════════════════════════════════
//
// Kenttäkysymys: "riittääkö hauis 2 sarjaa/vk?" — ohjelman viikkovolyymi per
// lihasryhmä ei ollut näkyvissä missään. Valmentaja laskee sekä SUORAT sarjat
// (liike kohdistuu lihakseen) että EPÄSUORAT (compound kuormittaa sivussa,
// paino 0,5 — RP/Israetel-konventio: leuanveto lasketaan hauikselle puolikkaana).
//
// Bandit (efektiiviset sarjat/vk, MEV/MAV-linjaus): ylläpito <4 · matala 4–9 ·
// kehittävä 10–20 · korkea >20. Nämä ovat NÄKYVYYS-työkalu (ei cap) — engine
// näyttää, atletti päättää (valmentaja, ei nanny).
const CATEGORY_MUSCLE_MAP = {
  "vertikaaliveto":          [["selkä", 1], ["hauis", 0.5]],
  "horisontaaliveto":        [["selkä", 1], ["hauis", 0.5]],
  "pull-volume":             [["selkä", 1], ["hauis", 0.5]],
  "pull-horizontal-heavy":   [["selkä", 1], ["hauis", 0.5]],
  "pull-vertical-explosive": [["selkä", 1], ["hauis", 0.5]],
  "horisontaalityöntö":      [["rinta", 1], ["ojentaja", 0.5], ["olkapää", 0.5]],
  "vertikaalityöntö":        [["olkapää", 1], ["ojentaja", 0.5]],
  "hauisfleksio":            [["hauis", 1]],
  "ojentajaekstensio":       [["ojentaja", 1]],
  "ojentaja-ext":            [["ojentaja", 1]],
  "alaraaja":                [["jalat", 1]],
  "lonkkahingaus":           [["jalat", 1]],
  "hamstring-isolation":     [["jalat", 1]],
  "knee-dominant-isolation": [["jalat", 1]],
  "calf-isolation":          [["pohje", 1]],
  "shoulder-isolation":      [["olkapää", 1]],
  "scapular-control":        [["olkapää", 0.5], ["selkä", 0.5]],
  "core":                    [["core", 1]],
  "core-hollow":             [["core", 1]],
  "core-antirotation":       [["core", 1]],
};

const MUSCLE_VOLUME_BANDS = [
  { max: 4,        id: "ylläpito",  label: "ylläpito" },
  { max: 10,       id: "matala",    label: "matala" },
  { max: 20.0001,  id: "kehittävä", label: "kehittävä" },
  { max: Infinity, id: "korkea",    label: "korkea" },
];

function muscleVolumeBand(effectiveSets) {
  const n = Number(effectiveSets) || 0;
  for (const b of MUSCLE_VOLUME_BANDS) { if (n < b.max) return b.id; }
  return "korkea";
}

/**
 * Laskee viikon SUUNNITELLUN volyymin lihasryhmittäin materialisoidusta
 * viikko-ohjelmasta (mesocycle.weekPlans → days → slots). Lämmittelyt eivät
 * kuulu volyymiin. Puhdas funktio — UI (Sykli-kortti) renderöi tuloksen.
 *
 * @param {object} mesocycle — aktiivinen mesosykli (weekPlans materialisoituna)
 * @param {number} weekNum   — 1-pohjainen viikkonumero
 * @returns {{found:boolean, weekNum:number, groups:Array<{muscle:string,
 *            direct:number, indirect:number, effective:number, band:string}>}}
 */
function computeWeeklyMuscleVolume(mesocycle, weekNum) {
  const wp = (mesocycle?.weekPlans || []).find(w => w.week === weekNum);
  if (!wp) return { found: false, weekNum, groups: [] };
  const acc = {}; // muscle → {direct, indirect, effective}
  for (const day of (wp.days || [])) {
    for (const slot of (day.slots || [])) {
      if (!slot || slot.role === "warmup" || slot.isWarmup) continue;
      const sets = Number(slot.sets);
      if (!Number.isFinite(sets) || sets <= 0) continue;
      const targets = CATEGORY_MUSCLE_MAP[slot.category];
      if (!targets) continue; // "muu" / tuntematon → ei attribuutiota
      for (const [muscle, weight] of targets) {
        if (!acc[muscle]) acc[muscle] = { direct: 0, indirect: 0, effective: 0 };
        if (weight >= 1) acc[muscle].direct += sets;
        else acc[muscle].indirect += sets;
        acc[muscle].effective += sets * weight;
      }
    }
  }
  const groups = Object.entries(acc)
    .map(([muscle, v]) => ({
      muscle,
      direct: v.direct,
      indirect: v.indirect,
      effective: Math.round(v.effective * 10) / 10,
      band: muscleVolumeBand(v.effective),
    }))
    .sort((a, b) => b.effective - a.effective);
  return { found: true, weekNum, groups };
}

// MULL-2 (#8, lainalaisuus: volyymimaamerkit MEV/MAV/MRV): K4-1 LASKI volyymin
// muttei tulkinnut sitä tavoitteeseen nähden — valmentaja hallitsee annosvälin
// aktiivisesti. analyzeVolumeLandmarks lisää TULKINNAN (advisory, ei cap):
//   • ALI-annostus: tavoitteen kannalta relevantti lihas (primaarin suora TAI
//     synergisti = epäsuora, esim. hauis leuanvedossa) joka jää kehittävän bandin
//     alle ("ylläpito"/"matala"). Vastaa #8: "riittääkö hauis 2 sarjaa/vk?" — ei,
//     jos veto on kehityskohde. severity: ylläpito=voimakas, matala=lievä.
//   • YLI-annostus: mikä tahansa lihas "korkea"-bandissa (>20 eff-sarjaa) = lähellä
//     palautuskattoa (MRV). Suoritus/palautumisriski.
// relevantMuscles = KAIKKI primaarin/sekundaarin kategorian kohteet (suora+epäsuora)
// → synergisti-limitointi tunnistuu (hauis on leuanvedon rajoittava tekijä).
function analyzeVolumeLandmarks(mesocycle, weekNum) {
  const vol = computeWeeklyMuscleVolume(mesocycle, weekNum);
  if (!vol.found) return { found: false, weekNum, under: [], over: [] };
  const wp = (mesocycle?.weekPlans || []).find(w => w.week === weekNum);
  const relevant = new Set();
  for (const day of (wp?.days || [])) {
    for (const slot of (day?.slots || [])) {
      if (slot?.role !== "primary" && slot?.role !== "secondary") continue;
      const targets = CATEGORY_MUSCLE_MAP[slot.category];
      if (!targets) continue;
      for (const [muscle] of targets) relevant.add(muscle);
    }
  }
  const under = [];
  const over = [];
  for (const g of vol.groups) {
    if (g.band === "korkea") {
      over.push({ muscle: g.muscle, effective: g.effective, band: g.band, severity: "over",
        message: `${g.muscle}: ${g.effective} tehollista sarjaa/vk — lähellä palautuskattoa. Seuraa palautumista; harkitse siirtoa toiselle lihakselle.` });
    } else if (relevant.has(g.muscle) && (g.band === "ylläpito" || g.band === "matala")) {
      under.push({ muscle: g.muscle, effective: g.effective, band: g.band,
        severity: g.band === "ylläpito" ? "strong" : "soft",
        message: g.band === "ylläpito"
          ? `${g.muscle}: vain ${g.effective} tehollista sarjaa/vk — alle kehittävän tason, kasvua ei juuri tapahdu. Tämä lihas osallistuu tavoiteliikkeeseesi — lisää suoraa työtä jos se on kehityskohde.`
          : `${g.muscle}: ${g.effective} tehollista sarjaa/vk — ylläpitävä, ei kehittävä. Nosta suoraa työtä jos tämä rajoittaa tavoiteliikettäsi.` });
    }
  }
  return { found: true, weekNum, under, over, relevantMuscles: [...relevant] };
}

// ═══════════════════════════════════════════════════════════════
// STAGNATION DETECTION
// ═══════════════════════════════════════════════════════════════

function checkStagnation(progress) {
  if (!progress || progress.stagnationWeeks < 3) {
    return { stagnated: false, severity: null, message: null };
  }
  if (progress.stagnationWeeks >= 6) {
    return {
      stagnated: true,
      severity: "orange",
      message: `${progress.stagnationWeeks} viikkoa ilman edistystä — suosittelemme liikkeen vaihtoa`,
    };
  }
  return {
    stagnated: true,
    severity: "yellow",
    message: `${progress.stagnationWeeks} viikkoa ilman edistystä — harkitse liikkeen vaihtoa`,
  };
}

// ═══════════════════════════════════════════════════════════════
// KORI 8: PROGRESSIO-MONIPUOLISUUS (progression variety)
// ═══════════════════════════════════════════════════════════════
// Huomio #6: engine kohteli jumitusta binäärisenä (progressio KUORMALLA tai
// checkStagnation → "vaihda liike"). Väliltä puuttui valmentajan työkalupakki.
// suggestProgressionTool antaa oikean EI-KUORMA-progressiotyökalun kontekstin
// mukaan (toistot/sarjat/tiheys/tempo/mikrokuorma), ennen viimesijaista liikkeen
// vaihtoa. ADVISORY — ei muuta recommend()-kuormaa (atletti = valmentaja).
const PROGRESSION_TOOLS = {
  reps:      { label: "Lisää toistoja", short: "+1 toisto/sarja" },
  sets:      { label: "Lisää sarja",    short: "+1 työsarja" },
  density:   { label: "Tiheys",         short: "lyhennä taukoa" },
  tempo:     { label: "Tempo / tauko",  short: "hidasta laskua / pause" },
  microload: { label: "Mikrokuorma",    short: "+1,25 kg" },
};

// Valmentajan progressiotikapuut: ensimmäinen sopiva työkalu voittaa.
// ctx: { role, targetReps, targetVx, lastMedianVx, sets?, stagnationWeeks?,
//        volumeBand? ("matala"|"kehittävä"|"korkea"), tempoInUse? }
// → { tool, label, rationale } tai null. Reuse: K6-4-headroom (lastMedianVx ≥
// targetVx+1), K4-1 volumeBand (MRV-tila), checkStagnation (≥6 vk → variantti-liite).
function suggestProgressionTool(ctx) {
  if (!ctx) return null;
  const reps = Number(ctx.targetReps);
  if (!Number.isFinite(reps) || reps <= 0) return null;
  const role = ctx.role || "accessory";
  const targetVx = Number(ctx.targetVx);
  const lastVx = ctx.lastMedianVx;
  const headroom = Number.isFinite(lastVx) && Number.isFinite(targetVx) && lastVx >= targetVx + 1;
  const isStrength = reps <= 5;
  const isPrimary = role === "primary" || role === "secondary";
  const volumeBand = ctx.volumeBand || null;
  const stagn = Number(ctx.stagnationWeeks) || 0;

  let tool, rationale;
  if (isStrength && isPrimary) {
    // Voimaliike: ei jahdata toistoja — kovenna suoritusta tai pienennä hyppyä.
    if (ctx.tempoInUse) {
      tool = "microload";
      rationale = "Kokeile pienempää hyppyä (+1,25 kg) jos levyt riittävät — pienemmät askeleet pitävät progression käynnissä.";
    } else {
      tool = "tempo";
      rationale = "Hidasta laskuvaihe (n. 3 s) tai lisää tauko pohjalle — liike vaikeutuu samalla kuormalla ilman lisäpainoa.";
    }
  } else if (headroom && reps < 12) {
    // Varaa toistoihin → double progression (K6-4 nyt ladderin osana).
    tool = "reps";
    rationale = `Pidä kuorma ja lisää +1 toisto/sarja (viime kerta meni varalla). Kun yläpää (~${reps + 2}) täyttyy, nosta kuormaa.`;
  } else if (volumeBand === "korkea") {
    // Toistot/volyymi katossa (MRV) → tiheys.
    tool = "density";
    rationale = "Toistot ja volyymi katossa — sama työ lyhyemmällä tauolla (esim. −30 s) on tiheysprogressio.";
  } else {
    // Kuorma ei nouse, toistoissa ei varaa, volyymissä tilaa → lisää sarja.
    tool = "sets";
    rationale = "Kuorma ei nouse eikä toistoissa ole varaa — lisää yksi työsarja. Volyymi ajaa kasvua kun intensiteetti ei nouse.";
  }

  if (stagn >= 6) rationale += " Jos nämä eivät auta muutamassa viikossa, harkitse variantin vaihtoa.";
  return { tool, label: PROGRESSION_TOOLS[tool].label, rationale };
}

// ═══════════════════════════════════════════════════════════════
// ACCESSORY SLOT RESOLUTION (v4.11)
// Each accessory slot has a function (role) + phase variants. Engine resolves
// movement at render time: priority 1) user lock, 2) user soft-override,
// 3) stagnation-advanced variant, 4) phase default (variant index 0).
// ═══════════════════════════════════════════════════════════════

// H-019 B-C2b (γ/B2): eksplisiittinen weekDef.phase voittaa viikkonumero-heuristiikan.
// γ-kisamesossa vk 1–2 = "intensity", vk 3–5 = "peaking" (myös "Taper"-labelinen vk 5,
// jonka label-johto ei tunnista). Ilman phase-kenttää (kaikki vanhat mesot) → legacy-
// kartta ennallaan → bittitarkka.
function phaseForWeek(weekNum, mesocycle = null) {
  const explicit = mesocycle?.weekDefs?.[weekNum - 1]?.phase;
  if (["foundation", "hypertrophy", "strength", "intensity", "peaking"].includes(explicit)) {
    return explicit;
  }
  if (weekNum <= 4)  return "foundation";
  if (weekNum <= 8)  return "strength";
  if (weekNum <= 12) return "intensity";
  return "peaking";
}

/**
 * Resolve an accessory slot into a concrete movement + rep scheme.
 *
 * @param {object} slot — slot object from weekPlan.days[].slots[]. Must have slotId to be resolvable.
 * @param {object} ctx — { mesocycle, weekNum, movementsByName, progressByMovementId }
 * @returns {object} { movementName, sets, reps, targetVx, note, source, variantIndex, slotFunction }
 *   source: "legacy" | "user-locked" | "user-override" | "stagnation-swap" | "phase-default" | "fallback"
 */
function resolveAccessorySlot(slot, ctx = {}) {
  const { mesocycle, weekNum, movementsByName, progressByMovementId } = ctx;

  // Legacy slot without slotId — fall through untouched
  if (!slot?.slotId) {
    return {
      movementName: slot.defaultMovementName,
      sets: slot.sets, reps: slot.reps, targetVx: slot.targetVx,
      note: slot.note,
      source: "legacy",
      variantIndex: null,
      slotFunction: null,
    };
  }

  const catalog = ACCESSORY_SLOT_CATALOG?.[slot.slotId];
  if (!catalog) {
    return {
      movementName: slot.defaultMovementName,
      sets: slot.sets, reps: slot.reps, targetVx: slot.targetVx,
      note: slot.note,
      source: "fallback",
      variantIndex: null,
      slotFunction: null,
    };
  }

  const phase = phaseForWeek(weekNum || 1);
  const variants = catalog.phaseVariants?.[phase] || [];
  const phaseRep = catalog.repScheme?.[phase] || null;

  // Phase may have no variants (e.g. knee-unilateral during peaking) → drop slot
  if (!variants.length) {
    return { movementName: null, sets: 0, reps: 0, targetVx: null,
             source: "dropped-for-phase", variantIndex: null, slotFunction: catalog.function };
  }

  const overrides = mesocycle?.accessorySlotOverrides || {};
  const ov = overrides[slot.slotId];

  // Honor hard lock absolutely
  if (ov?.locked && ov.movementName) {
    return {
      movementName: ov.movementName,
      sets:    phaseRep?.sets    ?? slot.sets,
      reps:    phaseRep?.reps    ?? slot.reps,
      targetVx: phaseRep?.targetVx ?? slot.targetVx,
      note: ov.reason || phaseRep?.note || slot.note,
      source: "user-locked",
      variantIndex: variants.indexOf(ov.movementName),
      slotFunction: catalog.function,
    };
  }

  // Determine variant index: user-picked, stagnation-advanced, or 0
  let idx = 0;
  let source = "phase-default";
  let reason = null;

  if (Number.isInteger(ov?.variantIndex)) {
    idx = Math.max(0, Math.min(variants.length - 1, ov.variantIndex));
    source = "user-override";
    reason = ov.reason || null;
  } else if (ov?.movementName && variants.includes(ov.movementName)) {
    idx = variants.indexOf(ov.movementName);
    source = "user-override";
    reason = ov.reason || null;
  } else {
    // Auto: stagnation on default variant → advance
    const defaultMov = movementsByName?.[variants[0]];
    if (defaultMov && progressByMovementId) {
      const prog = progressByMovementId[defaultMov.movementId];
      if (prog && prog.stagnationWeeks >= 3 && variants.length > 1) {
        idx = 1;
        source = "stagnation-swap";
        reason = `Stagnaatio ${prog.stagnationWeeks} vk — vaihto variantin 2 liikkeeseen`;
      }
    }
  }

  return {
    movementName: variants[idx],
    sets:    phaseRep?.sets    ?? slot.sets    ?? 3,
    reps:    phaseRep?.reps    ?? slot.reps    ?? 8,
    targetVx: phaseRep?.targetVx ?? slot.targetVx ?? null,
    // v4.34.16: phaseRep.loadPct välitetään resolvoituun slottiin → loadPct-resolver
    // applioi sessionEffectiveE1RM × loadPct (Branch A) jos slot.defaultMovementName === primary.
    loadPct: phaseRep?.loadPct ?? slot.loadPct ?? null,
    note: phaseRep?.note || slot.note || reason,
    source,
    variantIndex: idx,
    slotFunction: catalog.function,
    availableVariants: variants,
    reason,
  };
}

/**
 * Resolve all accessory slots in a dayPlan; return new dayPlan with resolved slots.
 * Drops slots whose phase has no variants (e.g. unilateral during peaking).
 * Preserves primary/backoff/secondary slots as-is (they never have slotId).
 */
function resolveDayPlanSlots(dayPlan, ctx) {
  if (!dayPlan?.slots) return dayPlan;
  const resolvedSlots = [];
  for (const slot of dayPlan.slots) {
    if (!slot.slotId) { resolvedSlots.push(slot); continue; }
    const r = resolveAccessorySlot(slot, ctx);
    if (r.source === "dropped-for-phase" || !r.movementName) continue;
    resolvedSlots.push({
      ...slot,
      defaultMovementName: r.movementName,
      sets: r.sets,
      reps: r.reps,
      targetVx: r.targetVx,
      // v4.34.16: kopio loadPct resolvoituun slottiin (jos phaseRep määritteli)
      ...(r.loadPct !== null && r.loadPct !== undefined ? { loadPct: r.loadPct } : {}),
      note: r.note || slot.note,
      _resolvedFrom: { slotId: slot.slotId, source: r.source, variantIndex: r.variantIndex,
                      availableVariants: r.availableVariants, slotFunction: r.slotFunction },
    });
  }
  return { ...dayPlan, slots: resolvedSlots };
}

/**
 * Compute stagnation-driven swap suggestions for the whole mesocycle.
 * Returns list of { slotId, currentMovement, suggestedMovement, reason }.
 * Used for decision-trace logging + surfacing suggestions to the user.
 */
function suggestAccessorySwaps(mesocycle, weekNum, movementsByName, progressByMovementId) {
  const suggestions = [];
  const phase = phaseForWeek(weekNum || 1);
  const overrides = mesocycle?.accessorySlotOverrides || {};

  for (const [slotId, catalog] of Object.entries(ACCESSORY_SLOT_CATALOG)) {
    if (overrides[slotId]?.locked) continue; // respect lock
    const variants = catalog.phaseVariants?.[phase] || [];
    if (variants.length < 2) continue;
    const currentIdx = overrides[slotId]?.variantIndex ?? 0;
    const currentName = variants[Math.min(currentIdx, variants.length - 1)];
    const mov = movementsByName?.[currentName];
    const prog = mov ? progressByMovementId?.[mov.movementId] : null;
    if (prog && prog.stagnationWeeks >= 3 && currentIdx < variants.length - 1) {
      suggestions.push({
        slotId,
        slotFunction: catalog.function,
        currentMovement: currentName,
        suggestedMovement: variants[currentIdx + 1],
        stagnationWeeks: prog.stagnationWeeks,
        reason: `${prog.stagnationWeeks} vk stagnaatio — vaihto seuraavaan varianttiin`,
      });
    }
  }
  return suggestions;
}

// ═══════════════════════════════════════════════════════════════
// READINESS TEST LOAD (skaalautuva)
// ═══════════════════════════════════════════════════════════════

/**
 * Laskee readiness-velocity-testin kuorman e1RM:n perusteella.
 * ~60% e1RM:stä, pyöristettynä lähimpään 2.5 kg. Min 20, max 80.
 * @param {number|null} e1rmExternal — urheilijan e1RM lisäpaino (kg)
 * @returns {number} readiness-testikuorma (kg)
 */
function readinessTestLoad(e1rmExternal) {
  if (e1rmExternal === null || e1rmExternal === undefined || e1rmExternal <= 0) return 40;
  const raw = e1rmExternal * 0.6;
  const rounded = Math.round(raw / 2.5) * 2.5;
  return clamp(rounded, 20, 80);
}

// ═══════════════════════════════════════════════════════════════
// SPEED DAY LOAD
// ═══════════════════════════════════════════════════════════════

function speedDayLoad(e1rmExternal, bodyweightKg) {
  // Speed day: ~55-60% of 1RM, max intent
  if (e1rmExternal === null) return null;
  const pct = 0.575; // midpoint of 55-60%
  const systemE1RM = e1rmExternal + bodyweightKg;
  const targetSystem = systemE1RM * pct;
  return roundToHalf(Math.max(0, targetSystem - bodyweightKg));
}

// ═══════════════════════════════════════════════════════════════
// OURA HRV CONVERSION
// ═══════════════════════════════════════════════════════════════

function ouraHRVtoLnRMSSD(hrvMs) {
  if (hrvMs === null || hrvMs === undefined || hrvMs <= 0) return null;
  return Math.log(hrvMs);
}

// ═══════════════════════════════════════════════════════════════
// ADAPTIVE VOLUME OPTIMIZATION
// ═══════════════════════════════════════════════════════════════

/**
 * Analyze a completed session and compute adaptive adjustments
 * for future workouts. If the user did extra sets/exercises or
 * skipped some, the engine learns and adjusts.
 */
function analyzeSessionAdaptation(sessionExercises, dayPlanSlots) {
  const adjustments = [];

  // 1. Check per-slot: did the user do more or fewer sets than planned?
  //    Use originalCategory if available (survives mid-workout swaps)
  for (const slot of dayPlanSlots) {
    const matchedExercises = sessionExercises.filter(
      (ex) => (ex.originalCategory || ex.category) === slot.category && ex.role === slot.role
    );

    if (matchedExercises.length === 0) continue;

    for (const ex of matchedExercises) {
      const completedSets = ex.sets.filter((s) => s.completed && !s.isWarmup).length;
      const plannedSets = slot.sets;
      const delta = completedSets - plannedSets;

      if (delta >= 2) {
        // User consistently does more → suggest increasing volume
        adjustments.push({
          category: slot.category,
          role: slot.role,
          movementName: ex.name,
          type: "volume_up",
          delta,
          suggestedSets: Math.min(plannedSets + 1, 6),
          reason: `${ex.name}: ${completedSets} sarjaa tehty (suunniteltu ${plannedSets}) → +1 sarja`,
        });
      } else if (delta <= -1 && completedSets > 0) {
        // User did fewer → reduce volume next time
        adjustments.push({
          category: slot.category,
          role: slot.role,
          movementName: ex.name,
          type: "volume_down",
          delta,
          suggestedSets: Math.max(plannedSets - 1, 2),
          reason: `${ex.name}: ${completedSets} sarjaa tehty (suunniteltu ${plannedSets}) → -1 sarja`,
        });
      }
    }
  }

  // 2. Check for extra exercises the user added (not in plan)
  const plannedCategories = new Set(dayPlanSlots.map((s) => s.category));
  const extraExercises = sessionExercises.filter(
    (ex) => !plannedCategories.has(ex.originalCategory || ex.category) && ex.sets.some((s) => s.completed && !s.isWarmup)
  );

  for (const ex of extraExercises) {
    adjustments.push({
      category: ex.category,
      role: "accessory",
      movementName: ex.name,
      type: "new_exercise",
      suggestedSets: ex.sets.filter((s) => s.completed).length,
      reason: `${ex.name}: lisätty käsin → harkitaan lisäämistä ohjelmaan`,
    });
  }

  return adjustments;
}

/**
 * Apply accumulated session adaptations to mesocycle weekPlan.
 * Only applies after 2+ consistent sessions with same pattern.
 */
function applyAdaptations(mesocycle, adaptationHistory) {
  if (!adaptationHistory || adaptationHistory.length < 2) return { applied: false, changes: [] };

  // Group by category+type and count occurrences
  const counts = {};
  for (const adj of adaptationHistory) {
    const key = `${adj.category}:${adj.type}`;
    if (!counts[key]) counts[key] = { ...adj, count: 0 };
    counts[key].count++;
  }

  const changes = [];
  for (const [key, entry] of Object.entries(counts)) {
    if (entry.count < 2) continue; // Need 2+ sessions with same pattern

    // Apply to all matching weekPlan slots
    for (const wp of mesocycle.weekPlans) {
      for (const day of wp.days) {
        for (const slot of day.slots) {
          if (slot.category === entry.category && slot.role === entry.role) {
            if (entry.type === "volume_up" && entry.suggestedSets > slot.sets) {
              const oldSets = slot.sets;
              slot.sets = entry.suggestedSets;
              changes.push(`${entry.movementName}: ${oldSets} → ${slot.sets} sarjaa`);
            } else if (entry.type === "volume_down" && entry.suggestedSets < slot.sets) {
              const oldSets = slot.sets;
              slot.sets = entry.suggestedSets;
              changes.push(`${entry.movementName}: ${oldSets} → ${slot.sets} sarjaa`);
            }
          }
        }
      }
    }

    if (entry.type === "new_exercise") {
      changes.push(`${entry.movementName}: harkitse ohjelmaan lisäämistä`);
    }
  }

  return { applied: changes.length > 0, changes };
}

// ═══════════════════════════════════════════════════════════════
// FUTURE WORKOUTS PREVIEW
// ═══════════════════════════════════════════════════════════════

/**
 * Generate preview of upcoming workouts for N days ahead.
 * Returns array of { dateISO, dayOfWeek, dayType, weekNum, weekLabel, slots }
 */
function getFutureWorkouts(mesocycle, currentDateISO, daysAhead = 14) {
  if (!mesocycle || !mesocycle.weekPlans) return [];

  const results = [];
  const startDate = new Date(currentDateISO);

  for (let d = 1; d <= daysAhead; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    const dateISO = date.toISOString().slice(0, 10);
    const dayOfWeek = date.getDay() || 7; // 1=Mon, 7=Sun

    const weekNum = getMesocycleWeek(mesocycle, dateISO);
    if (weekNum === null) continue; // Past end of mesocycle

    const weekDef = getWeekDef(mesocycle, weekNum);
    const weekPlan = mesocycle.weekPlans.find((w) => w.week === weekNum);
    if (!weekPlan) continue;

    const dayPlan = weekPlan.days.find((dp) => dp.dayOfWeek === dayOfWeek);
    if (!dayPlan) continue;

    results.push({
      dateISO,
      dayOfWeek,
      dayType: dayPlan.dayType,
      weekNum,
      weekLabel: weekDef?.label || "",
      label: dayPlan.label || "",
      deltaPctBase: weekDef?.deltaPctBase || 0,
      // H-015: tulevat-listat näkevät saman korvauksen kuin live (sama kanoninen funktio)
      slots: applyMovementSubstitutions(dayPlan.slots, mesocycle),
      // v4.30.4: warmup mukaan jotta sykli-näkymä voi näyttää koko treenin tarkasteluun
      warmup: dayPlan.warmup || [],
    });
  }

  return results;
}

/**
 * Etsii menneet, toteuttamatta jääneet treenipäivät mesosyklistä.
 * "Toteutettu" = jokin sessio on seurannut tuon päivän planiä, ts. sen
 * session.planSourceDateISO (tai vanhoissa sessioissa dateISO) osuu
 * tähän päivään. Tämä tunnistaa oikein myös tilanteet joissa käyttäjä
 * teki Ti:nä Ke:n planin — Ti:n oma plan on edelleen tekemättä.
 *
 * @param {Object} mesocycle
 * @param {Array} sessions — state.sessions
 * @param {string} currentDateISO — "tänään"
 * @param {number} daysBack — kuinka monta vuorokautta taakse tarkistetaan (oletus 3)
 * @returns {Array<{dateISO, dayOfWeek, weekNum, weekLabel, dayType, dayLabel, slots, substitutedPlan}>}
 *   substitutedPlan on { plannedDayType, dateISO } jos samalla kalenteripäivällä
 *   oli eri plan-lähteen sessio (plan-override); muuten null.
 */
function findMissedPriorSessions(mesocycle, sessions, currentDateISO, daysBack = 3) {
  if (!mesocycle || !mesocycle.weekPlans || !currentDateISO) return [];
  const skipped = new Set(mesocycle.skippedDays || []);
  // Päivät joiden plan on toteutettu (planSourceDateISO || dateISO backward-compat)
  const executedPlans = new Set();
  // Sessiot kalenteripäivittäin (jotta voidaan näyttää "teit X sijaan")
  const sessionsByDate = new Map();
  for (const s of (sessions || [])) {
    const planISO = s.planSourceDateISO || s.dateISO;
    if (planISO) executedPlans.add(planISO);
    if (s.dateISO) {
      if (!sessionsByDate.has(s.dateISO)) sessionsByDate.set(s.dateISO, []);
      sessionsByDate.get(s.dateISO).push(s);
    }
  }
  const results = [];
  const base = new Date(currentDateISO);

  for (let d = 1; d <= daysBack; d++) {
    const date = new Date(base);
    date.setDate(date.getDate() - d);
    const iso = date.toISOString().slice(0, 10);
    if (skipped.has(iso)) continue;
    if (executedPlans.has(iso)) continue; // plan on toteutettu jollain päivällä

    const weekNum = getMesocycleWeek(mesocycle, iso);
    if (weekNum === null) continue;

    const dayOfWeek = date.getDay() || 7;
    const weekPlan = mesocycle.weekPlans.find(w => w.week === weekNum);
    const dayPlan = weekPlan?.days?.find(x => x.dayOfWeek === dayOfWeek);
    if (!dayPlan) continue;

    // Jos samalla pv:llä on eri plan-lähteen sessio (override), merkitään korvaus
    const sameDateSessions = sessionsByDate.get(iso) || [];
    const substituted = sameDateSessions[sameDateSessions.length - 1] || null;
    const substitutedPlan = substituted ? {
      plannedDayType: substituted.plannedDayType,
      planSourceDateISO: substituted.planSourceDateISO || substituted.dateISO,
    } : null;

    const weekDef = getWeekDef(mesocycle, weekNum);
    results.push({
      dateISO: iso,
      dayOfWeek,
      weekNum,
      weekLabel: weekDef?.label || "",
      dayType: dayPlan.dayType,
      dayLabel: dayPlan.label || null,
      slots: dayPlan.slots || [],
      substitutedPlan,
    });
  }
  // Uusin ensin
  return results.sort((a, b) => b.dateISO.localeCompare(a.dateISO));
}

// ═══════════════════════════════════════════════════════════════
// ELITE VOLUME/INTENSITY CHECK
// ═══════════════════════════════════════════════════════════════

/**
 * Check if weekly volume meets elite-level minimum thresholds.
 * Returns warnings if below recommended minimums.
 */
function eliteVolumeCheck(weekSets, movements) {
  const stimulus = weeklyStimulus(weekSets, movements);
  const warnings = [];

  // Elite pull volume: minimum ~15 hard sets/week for vertical + horizontal pull
  if (stimulus.pullVolumeSets < 12) {
    warnings.push({
      type: "low_pull_volume",
      current: stimulus.pullVolumeSets,
      target: 15,
      message: `Vetosarjoja ${stimulus.pullVolumeSets}/viikko — eliittitasolla suositus ≥15`,
    });
  }

  // Heavy exposure frequency: at least 4 heavy sets/week
  if (stimulus.heavyExposures < 3) {
    warnings.push({
      type: "low_heavy_exposure",
      current: stimulus.heavyExposures,
      target: 6,
      message: `Heavy-altistuksia ${stimulus.heavyExposures}/viikko — suositus ≥6`,
    });
  }

  // Check push-pull balance
  const pushSets = (stimulus.byCategory["horisontaalityöntö"]?.sets || 0) +
                   (stimulus.byCategory["vertikaalityöntö"]?.sets || 0);
  const pullSets = stimulus.pullVolumeSets;
  if (pullSets > 0 && pushSets < pullSets * 0.5) {
    warnings.push({
      type: "push_pull_imbalance",
      pushSets,
      pullSets,
      message: `Työntö/veto-suhde ${pushSets}:${pullSets} — lisää työntöliikkeitä (tavoite ≥1:2)`,
    });
  }

  return { stimulus, warnings, isEliteReady: warnings.length === 0 };
}

// ═══════════════════════════════════════════════════════════════
// ALL-MOVEMENT e1RM COMPUTATION
// ═══════════════════════════════════════════════════════════════

/**
 * Compute e1RM for any movement from its set history.
 * Uses system Epley for system-load movements (Lisäpainoleuanveto, dippi, MU),
 * accessory Epley for kaikki muut (Takakyykky-style barbell + true accessoryt).
 *
 * v4.34.34: 2. argumentti hyväksyy nyt joko booleanin (taaksepäin yhteensopiva)
 * TAI movement-objektin. Movement-objektista käytetään isSystemLoadMovement(mov)
 * — tämä on KESKITETTY totuudenlähde "lisätäänkö BW e1RM-laskuun" -kysymykseen.
 */
function computeMovementE1RM(movementSets, movementOrIsSystem, bodyweightKg) {
  if (!movementSets.length) return null;

  // v4.34.34: tunnista signature — boolean (legacy) vs movement-objekti (uusi)
  const isSystem = typeof movementOrIsSystem === "boolean"
    ? movementOrIsSystem
    : isSystemLoadMovement(movementOrIsSystem);

  // Take last 6 sets with valid data
  const recent = movementSets
    .filter((s) => s.externalLoadKg > 0 && s.reps >= 1)
    .slice(-6);

  if (!recent.length) return null;

  const values = recent.map((s) => {
    const vara = s.actualVx ?? s.targetVx ?? 1;
    if (isSystem) {
      return e1rmSystem(bodyweightKg, s.externalLoadKg, s.reps, vara);
    } else {
      return e1rmAccessory(s.externalLoadKg, s.reps, vara);
    }
  }).filter((v) => v !== null);

  return values.length > 0 ? median(values) : null;
}

/**
 * v4.35.1 — Yhtenäinen e1RM-laskenta UI:n ja recommend()-funktion välillä.
 *
 * Aiempi computeMovementE1RM palautti pelkkä median(Epley+Vara viim. 6 setistä),
 * eikä huomioinut PLAN_BASED_E1RM-mekanismia (engine.js:2467) eikä cal-historiaa.
 * Tämä aiheutti epäjohdonmukaisuuden Edistyminen-välilehden ja recommend()-funktion
 * välillä (atletin palaute 2026-05-08: e1RM 170.8 vs 184.9 vs 156).
 *
 * Tämä funktio käyttää SAMAA priorisointia kuin recommend() (engine.js:2440-2589):
 *   1. Cal-historia (kalibrointisarjat, setRole === "calibration") — voittaa kun saatavilla
 *   2. PLAN_BASED (viim. ei-cal-session perfect-execution → lastLoad / loadPct) — kun saatavilla
 *   3. Median Epley+Vara (= legacy computeMovementE1RM) — fallback
 *
 * Palauttaa { value: number|null, source: "cal"|"plan-based"|"median"|null, details }.
 *
 * @param {Array} movementSets - viim. liikkeen sarjat (movementId-suodatettu)
 * @param {Array} sessions - kaikki sessiot (PLAN_BASED tarvitsee viim. session loadPct:n)
 * @param {Object|null} mesocycle - aktiivinen mesosykli (PLAN_BASED tarvitsee weekPlans:n)
 * @param {Object} movement - movement-objekti (loadType, isPrimary)
 * @param {number} bodyweightKg
 * @returns {{value: number|null, source: string|null, details: object}}
 */
function computeMovementE1RMBest(movementSets, sessions, mesocycle, movement, bodyweightKg) {
  if (!movementSets || movementSets.length === 0) {
    return { value: null, source: null, details: {} };
  }
  const isSystem = isSystemLoadMovement(movement);
  const isBarbell = !isSystem;

  // 1. Cal-priority: kalibrointi-sarjat ovat tarkin mittaus (DiStasio 2014: ±2.7 kg)
  // v4.35.3: yksikkö-yhteensopivuus — palauta SAMA yksikkö kuin computeMovementE1RM:
  //   barbell → ext (e1rmAccessory output)
  //   system-load → system (e1rmSystem output, sis. bodyweight)
  // OBS-052 v2: tuoreusikkuna (sama helper kuin recommend → F-3-koherenssi). movementSets on jo
  // täysi liike-historia → cal ajaa korttia niin kauan kuin tuorein cal ≤ 42 pv (kuukauden yli),
  // ei vain cal-session jälkeisessä sessiossa kuten v1:ssä.
  const recentCalSets = freshCalibSets(movementSets);
  if (recentCalSets.length > 0) {
    const calE1RMs = recentCalSets.map(s => {
      const vara = s.actualVx ?? s.targetVx ?? 1;
      if (isBarbell) return e1rmAccessory(s.externalLoadKg || 0, s.reps || 1, vara);
      return e1rmSystem(bodyweightKg, s.externalLoadKg || 0, s.reps || 1, vara);
    }).filter(v => v !== null);
    if (calE1RMs.length > 0) {
      const calE1RM = median(calE1RMs);
      // Säilytä yksikkö (ext barbell:lle, system system-load:lle)
      return { value: calE1RM, source: "cal", details: { calCount: recentCalSets.length, raw: calE1RM } };
    }
  }

  // 2. PLAN_BASED-priority: jos viim. ei-cal-session oli perfect-execution
  //    JA loadPct on luettavissa mesosyklistä, palauta lastLoad / lastLoadPct
  if (mesocycle && sessions && movement) {
    // Hae primary-work-sarjat (top), suodata accessoryt
    const primaryWorkSets = movementSets.filter(s => s.setRole === "top");
    if (primaryWorkSets.length > 0) {
      // Ryhmitä sessionId:n mukaan, järjestys ascending
      const sessGroups = new Map();
      const sessOrder = [];
      for (const s of primaryWorkSets) {
        const sid = s.sessionId || `__nosess_${s.timestamp}`;
        if (!sessGroups.has(sid)) { sessGroups.set(sid, []); sessOrder.push(sid); }
        sessGroups.get(sid).push(s);
      }
      // Etsi viim. ei-cal-sessio (cal-set-osuus < 50%)
      let lastSessionSets = null;
      let lastSessionId = null;
      for (let i = sessOrder.length - 1; i >= 0; i--) {
        const sets = sessGroups.get(sessOrder[i]);
        const calCount = sets.filter(s => s.setRole === "calibration").length;
        if (calCount < sets.length * 0.5) {
          lastSessionSets = sets;
          lastSessionId = sessOrder[i];
          break;
        }
      }
      if (lastSessionSets && lastSessionSets.length > 0) {
        // Tarkista perfect execution: kaikki sarjat actualVx >= targetVx JA reps >= targetReps
        const allHitTarget = lastSessionSets.every(s =>
          s.actualVx !== null && s.actualVx !== undefined && s.targetVx !== null && s.targetVx !== undefined
          && s.actualVx >= s.targetVx
          && (s.reps ?? 0) >= (s.targetReps ?? 0)
        );
        if (allHitTarget) {
          // Hae viim. session date → mesocycle-vk → primary-slot loadPct
          const lastDateISO = (lastSessionId && sessions.find(s => s.sessionId === lastSessionId)?.dateISO)
            || lastSessionSets[0]?.dateISO
            || lastSessionSets[0]?.timestamp?.slice(0, 10);
          if (lastDateISO) {
            const lastWk = getMesocycleWeek(mesocycle, lastDateISO);
            const lastDow = (new Date(lastDateISO).getDay() || 7);
            const lastDayPlan = (lastWk !== null) && mesocycle.weekPlans?.[lastWk - 1]?.days?.find(d => d.dayOfWeek === lastDow);
            // Etsi slot joka match-aa tämän liikkeen — primary VAI cross-ref
            let lastLoadPct = null;
            let lastSlotReps = null, lastSlotVx = null;
            if (lastDayPlan?.slots) {
              const matchSlot = lastDayPlan.slots.find(s =>
                s.defaultMovementName === movement.name
                || s.loadPctReferenceMovementName === movement.name
              );
              lastLoadPct = matchSlot?.loadPct;
              lastSlotReps = matchSlot?.reps;
              lastSlotVx = matchSlot?.targetVx;
            }
            // OBS-051: sama loadPct-Vx-gate kuin recommend()/streak — kortti EI saa
            // inflatoitua eri tavalla kuin live (F-3). Inkonsistentti loadPct (volyymi-label
            // joka alittaa Vx-intensiteetin) → median-fallback (= sama kuin gatattu live).
            if (lastLoadPct && lastLoadPct > 0 && lastLoadPct <= 1.0
                && isLoadPctVxConsistent(lastLoadPct, lastSlotReps, lastSlotVx)) {
              const lastMedianLoad = median(lastSessionSets.map(s => s.externalLoadKg).filter(v => v > 0));
              if (lastMedianLoad && lastMedianLoad > 0) {
                // Vx-overshoot bonus (sama kuin recommend():ssa)
                const meanOvershoot = lastSessionSets.reduce((sum, s) =>
                  sum + ((s.actualVx ?? 0) - (s.targetVx ?? 0)), 0) / lastSessionSets.length;
                const vxBonusPct = Math.max(0, meanOvershoot) * 0.025;
                // S10-korjaus: sama system-%-inversio kuin recommend()-ydin (F-3: kortti = live).
                const planBasedExternal = planBasedInvertE1RM(lastMedianLoad, lastLoadPct, isBarbell, bodyweightKg).external * (1 + vxBonusPct);
                // v4.35.3: yksikkö-yhteensopivuus — palauta SAMA yksikkö kuin computeMovementE1RM:
                //   barbell → ext (planBasedExternal suoraan)
                //   system-load → system (= ext + bodyweight, kuten engine.js:2572)
                const value = isBarbell ? planBasedExternal : (planBasedExternal + bodyweightKg);
                return {
                  value,
                  source: "plan-based",
                  details: { lastLoad: lastMedianLoad, lastLoadPct, lastWk,
                             vxBonusPct, perfectExecution: true,
                             planBasedExternal, isSystemLoad: !isBarbell },
                };
              }
            }
          }
        }
      }
    }
  }

  // 3. Fallback: median Epley+Vara (= legacy computeMovementE1RM-logiikka)
  // v4.35.3: yksikkö-yhteensopivuus — säilytä legacy-palautus sellaisenaan
  // (computeMovementE1RM palauttaa ext barbell:lle, system system-load:lle)
  const fallback = computeMovementE1RM(movementSets, movement, bodyweightKg);
  if (fallback === null) return { value: null, source: null, details: {} };

  // F-3 (OBS-052 v2): kortti tarvitsee SAMAN DEFLATION-lattian kuin live (recommend:n
  // E1RM_DEFLATION_CAP). Ilman tätä kortti regressoi Epley-aliarvioon kun cal on vanhentunut/
  // puuttuu MUTTA cfg-PR on olemassa → kortti (esim. 172,7) ≠ live (cfg-PR×0,95 = 175,75) =
  // F-3-rikko (jäi piiloon OBS-051:ssä koska testifixtureissa ei ollut cfg:tä). Lattia kortin
  // yksikössä (fallback: ext barbell:lle, system system-load:lle):
  //   • cal-historia → min(cal-e1RM external) × 0,95  (sessio-agnostinen kuten live)
  //   • muuten cfg-PR (external) × 0,95
  // KRITIITTINEN (adversariaali-blokkaaja): lattia lasketaan EXTERNAL-yksikössä ja BW lisätään
  // VASTA ×0,95 jälkeen (system-load) — täsmälleen kuten live (engine.js:4708-4744:
  // floor_ext = ext × 0,95; currentE1RMSystem = floor_ext + BW). ×0,95 BW-INKLUSIIVISEEN
  // systeemiarvoon antaisi 0,05×BW liian matalan lattian (~4,5 kg) → kortti < live (F-3-rikko).
  // HUOM: kortti ei laske cfg-driftiä → un-drifted cfg (approks.; merkitsevä vain stale-
  // tapauksessa jossa cal ei aja — tuoreusikkunan sisällä cal ajaa molempia → kortti=live).
  let floorVal = null;
  const calForFloor = movementSets.filter(s => s.setRole === "calibration").slice(-3);
  if (calForFloor.length > 0) {
    const calFloorsExt = calForFloor.map(s => {
      const cv = s.actualVx ?? s.targetVx ?? 1;
      const sys = isBarbell ? e1rmAccessory(s.externalLoadKg || 0, s.reps || 1, cv)
                            : e1rmSystem(bodyweightKg, s.externalLoadKg || 0, s.reps || 1, cv);
      return isBarbell ? sys : (sys - bodyweightKg); // external
    }).filter(v => v !== null);
    if (calFloorsExt.length > 0) {
      const floorExt = Math.min(...calFloorsExt) * 0.95;
      floorVal = isBarbell ? floorExt : (floorExt + bodyweightKg);
    }
  }
  if (floorVal === null && mesocycle && movement?.name) {
    const cfgInfo = getCfgBaselineForMovement(mesocycle, { defaultMovementName: movement.name });
    if (cfgInfo.value && cfgInfo.value > 0) {
      const floorExt = cfgInfo.value * 0.95; // cfg on external
      floorVal = isBarbell ? floorExt : (floorExt + bodyweightKg);
    }
  }
  if (floorVal !== null && fallback < floorVal) {
    return { value: floorVal, source: "median-floored", details: { raw: fallback, floor: floorVal } };
  }
  return { value: fallback, source: "median", details: { raw: fallback } };
}

/**
 * Compute e1RM history (time series) for any movement.
 * v4.34.34: 3. argumentti hyväksyy joko booleanin tai movement-objektin (kuten yllä).
 */
function computeMovementE1RMHistory(movementSets, sessions, movementOrIsSystem, bodyweightKg) {
  const sessionMap = new Map(sessions.map((s) => [s.sessionId, s]));
  const points = [];

  const isSystem = typeof movementOrIsSystem === "boolean"
    ? movementOrIsSystem
    : isSystemLoadMovement(movementOrIsSystem);

  for (const s of movementSets) {
    if (s.externalLoadKg <= 0 || s.reps < 1) continue;
    const session = sessionMap.get(s.sessionId);
    if (!session) continue;

    const vara = s.actualVx ?? s.targetVx ?? 1;
    let e1rm;
    if (isSystem) {
      e1rm = e1rmSystem(bodyweightKg, s.externalLoadKg, s.reps, vara);
    } else {
      e1rm = e1rmAccessory(s.externalLoadKg, s.reps, vara);
    }

    if (e1rm !== null) {
      points.push({ dateISO: session.dateISO, e1rm, load: s.externalLoadKg, reps: s.reps });
    }
  }

  return points;
}

// ═══════════════════════════════════════════════════════════════
// VARIANT PERIODIZATION
// ═══════════════════════════════════════════════════════════════

/**
 * Get default variant name for a given day type.
 */
function getDefaultVariantForDayType(dayType) {
  const variants = VARIANT_DAY_TYPE_MAP[dayType] || VARIANT_DAY_TYPE_MAP.heavy;
  return variants[0]; // First variant is default
}

/**
 * Load modifier for each variant.
 * Returns a multiplier to apply to target load.
 * e.g., koroke = +5% (supramaximal eccentric), kuminauha = -40% (speed work)
 */
// Default load modifiers (used when no custom overrides exist)
const DEFAULT_VARIANT_MODIFIERS = {
  "Kilpaveto (leveä vastaote)": 0,
  "Korokeveto":                 0.05,    // +5% supramaximal
  "Nopeusveto kuminauhalla":   -0.40,   // -40% speed
  "Myötäoteveto":              -0.05,   // -5% grip weakness
  "Neutraaliote":              -0.03,   // -3% grip neutral
  "2s ylipito":                -0.05,   // -5% isometric hold
  "1.5-toisto hiissaus":       -0.10,   // -10% tempo reps
};

/**
 * Variant load modifier. Uses customModifiers (from settings) when available,
 * falls back to defaults.
 * @param {string} variantName
 * @param {Object|null} customModifiers — { variantName: number } from settings
 * @returns {number} modifier as a fraction (e.g. -0.05 = -5%)
 */
function variantLoadModifier(variantName, customModifiers = null) {
  if (!variantName) return 0;
  if (customModifiers && variantName in customModifiers) {
    return customModifiers[variantName];
  }
  return DEFAULT_VARIANT_MODIFIERS[variantName] ?? 0;
}

/**
 * F-4 UNIFY (value-resolution-audit, 2026-05-31): YKSI slot-kuorma-näyttölaskenta jota
 * SEKÄ Koti-dashboard (renderTodayPlan) ETTÄ workout-flow (startWorkout) kutsuvat → render-
 * polut eivät voi erkaantua slot-kuormalla (sulkee F-1 + F-4 rakenteellisesti).
 * Palauttaa NUMERON (loadKg) | 0 (skill/BW-sentinel) | null (ei kuormaa / uusi liike).
 * Kutsupaikat formatoivat itse (dashboard: loadStr/loadCls + "BW"/"Lämmittely"/🎯; workout-flow:
 * numero suoraan + per-set warmup). B/E/F (variantLoadModifier) + I (roundToHalf) UNIFOITU.
 * C (primaryBaseLoad) PARAMETRINEN: dashboard=TARGET, workout-flow=tier (nykykäytös; C erillinen).
 * G (accessoryProgressLoad) PARAMETRINEN: kutsuja resolvoi (dashboard sync-map / workout-flow async).
 * @returns {number|null}
 */
function computeDisplayedSlotLoad(slot, opts = {}) {
  if (!slot) return null;
  const {
    primaryBaseLoad = null,
    targetExternalLoad = null,
    accessoryProgressLoad = null,
    attemptLoads = null,
    attemptLoadsByLift = null,
    variantModifiers = null,
  } = opts;
  const role = slot.role;
  const vMod = variantLoadModifier(slot.variantName, variantModifiers);
  // Kisapäivä: attempt/warmup. H-019 B-C2c: per-laji-kuormat (attemptLoadsByLift,
  // avain = slot.defaultMovementName) voittavat legacy-singlen — 3 lajin kisapäivällä
  // MU/dippi/leuka resolvoituvat kukin OMASTA e1RM:stään. Fallback legacy (1 laji).
  const _al = attemptLoadsByLift?.[slot.defaultMovementName] || attemptLoads;
  if (["warmup", "opener", "attempt2", "attempt3"].includes(role) && _al) {
    if (role === "warmup") return Array.isArray(_al.warmupLoads) ? (_al.warmupLoads[0] ?? 0) : 0;
    if (role === "opener") return _al.opener ?? null;
    if (role === "attempt2") return _al.second ?? null;
    if (role === "attempt3") return _al.third ?? null;
  }
  // Primary
  if (role === "primary") {
    if (slot.suggestedLoadKg === 0 || slot.muSkillPhase === true) return 0; // skill/BW
    if (typeof primaryBaseLoad === "number") return roundToHalf(primaryBaseLoad * (1 + vMod));
    return null;
  }
  // Engine-resolvoidut slotit (back-off / secondary / calibration / same-liike-volyymi-apuliike)
  if ((role === "backoff" || role === "secondary" || role === "calibration" || role === "accessory")
      && typeof slot.resolvedLoadKg === "number") {
    return roundToHalf(slot.resolvedLoadKg * (1 + vMod));
  }
  // Back-off legacy-fallback (slot ilman loadPct:tä) → target × 0.85
  if (role === "backoff" && typeof targetExternalLoad === "number") {
    return roundToHalf(targetExternalLoad * 0.85 * (1 + vMod));
  }
  // Eri-liike-apuliike: kutsujan resolvoima progress-load (ei vMod — nykykäytös)
  if (role === "accessory" && typeof accessoryProgressLoad === "number") {
    return accessoryProgressLoad;
  }
  return null;
}

/**
 * Rep/tempo override for specific variants.
 * Returns override info (repsLabel, tempoNotes) or null.
 */
function variantRepOverride(variantName) {
  switch (variantName) {
    case "2s ylipito":
      return { tempoNote: "2s pito yläasennossa", label: "ylipito" };
    case "1.5-toisto hiissaus":
      return { tempoNote: "1.5 toistoa: ylös → puoleen väliin → ylös", label: "hiissaus" };
    case "Nopeusveto kuminauhalla":
      return { tempoNote: "Räjähtävästi, max nopeus", label: "nopeus" };
    case "Korokeveto":
      return { tempoNote: "Eksentrisesti hitaasti (3-4s)", label: "koroke" };
    default:
      return null;
  }
}

/**
 * Assign variants to mesocycle week plans via smart rotation.
 * Heavy days rotate: Kilpaveto ↔ Korokeveto
 * Speed days: always Nopeusveto kuminauhalla
 * Volume days: rotate through Myötäote → Neutraaliote → 2s ylipito → 1.5-toisto hiissaus
 */
function assignVariantRotation(weekPlans) {
  let heavyIdx = 0;
  let volumeIdx = 0;
  const heavyVariants = VARIANT_DAY_TYPE_MAP.heavy;
  const volumeVariants = VARIANT_DAY_TYPE_MAP.volume;
  const speedVariant = VARIANT_DAY_TYPE_MAP.speed[0];

  for (const wp of weekPlans) {
    for (const day of wp.days) {
      for (const slot of day.slots) {
        if (slot.role !== "primary" && slot.role !== "backoff") continue;
        if (slot.category !== "vertikaaliveto") continue;

        if (day.dayType === "heavy") {
          slot.variantName = heavyVariants[heavyIdx % heavyVariants.length];
          // backoff uses same variant as primary
          if (slot.role === "primary") heavyIdx++;
        } else if (day.dayType === "speed") {
          slot.variantName = speedVariant;
        } else if (day.dayType === "volume") {
          slot.variantName = volumeVariants[volumeIdx % volumeVariants.length];
          if (slot.role === "primary") volumeIdx++;
        } else {
          slot.variantName = heavyVariants[0]; // default
        }
      }
    }
  }
  return weekPlans;
}

// ═══════════════════════════════════════════════════════════════
// PEAKING ENGINE
// ═══════════════════════════════════════════════════════════════

/**
 * v4.30.3: e1RM-ennuste ohjelman loppuun saakka.
 *
 * Käyttää käyttäjän historiallista trendiä jos saatavilla (≥3 mittauspistettä),
 * muuten edistyneelle harjoittelijalle realistista 0.5 % / vk -default-tahtia.
 * Block-aware: peaking-vaiheessa (viim. 4 vk) gain-rate puolitetaan koska
 * realization ei tuota uusia gainsia, vaan toteuttaa olemassa olevia.
 *
 * @param {Array} history - computeMovementE1RMHistory:n output [{dateISO, e1rm, ...}]
 * @param {number} currentWeekNum - nykyinen viikko (1–totalWeeks)
 * @param {number} totalWeeks - ohjelman pituus (default 16)
 * @returns {Object|null} { predictedFinal, weeklyGainPct, weeksRemaining,
 *                         confidence: "high"|"medium"|"low", projection: [{week, e1rm}] }
 */
function predictE1RMEndOfProgram(history, currentWeekNum, totalWeeks = 16) {
  if (!history || history.length === 0) return null;
  const currentE1RM = history[history.length - 1].e1rm;
  if (!currentE1RM || currentE1RM <= 0) return null;
  const remainingWeeks = Math.max(0, totalWeeks - currentWeekNum);
  if (remainingWeeks === 0) {
    return { predictedFinal: currentE1RM, weeklyGainPct: 0,
             weeksRemaining: 0, confidence: "exact", projection: [] };
  }

  // 1. Arvioi viikoittainen kasvuprosentti historiasta (jos riittävästi dataa)
  let weeklyGainPct = 0.005; // default 0.5% / vk edistyneelle harjoittelijalle
  let confidence = "low";
  if (history.length >= 3) {
    const first = history[0];
    const last = history[history.length - 1];
    const firstMs = new Date(first.dateISO).getTime();
    const lastMs = new Date(last.dateISO).getTime();
    const weeksSpan = (lastMs - firstMs) / (7 * 24 * 60 * 60 * 1000);
    if (weeksSpan >= 1 && first.e1rm > 0) {
      const totalGainPct = (last.e1rm - first.e1rm) / first.e1rm;
      const observed = totalGainPct / weeksSpan;
      // Clamp realistisiin haarukoihin: −0.5%/vk … +1.5%/vk (eliittilifter)
      weeklyGainPct = Math.max(-0.005, Math.min(0.015, observed));
      confidence = history.length >= 6 ? "high" : "medium";
    }
  }

  // 2. Block-aware projektio: peaking (viim. 4 vk) → puolet gain-ratesta
  //    Deload-viikot (4, 8, 12) → ei kasvua (CNS-konservointi)
  const peakingStart = totalWeeks - 3; // vk 13–16 (jos totalWeeks=16)
  let projectedE1RM = currentE1RM;
  const projection = [];
  for (let w = currentWeekNum + 1; w <= totalWeeks; w++) {
    const isPeaking = w >= peakingStart;
    const isDeload = w === 4 || w === 8 || w === 12;
    const weeklyGain = isDeload ? 0 : (isPeaking ? weeklyGainPct * 0.5 : weeklyGainPct);
    projectedE1RM *= (1 + weeklyGain);
    projection.push({ week: w, e1rm: Math.round(projectedE1RM * 10) / 10 });
  }

  return {
    predictedFinal: Math.round(projectedE1RM * 10) / 10,
    weeklyGainPct,
    weeksRemaining: remainingWeeks,
    confidence,
    projection,
  };
}

/**
 * v4.30.3: Streetlifting kisapäivän tavoite-ennuste.
 *
 * Yhdistää e1RM-ennusteen + opener-strategian: ennustaa per kilpailu­liike
 * mitä kuormat kisapäivänä tulevat olemaan, jos käyttäjän nykyinen
 * etenemistahti jatkuu.
 *
 * @param {Object} historyByMovement - { "Lisäpainoleuanveto": [...e1rmHistory], ... }
 * @param {number} currentWeekNum
 * @param {number} totalWeeks
 * @returns {Object|null} per liike: { current, predicted, opener, second, third, weeklyGainPct }
 */
function computeStreetliftingFinalProjection(historyByMovement, currentWeekNum, totalWeeks = 16) {
  if (!historyByMovement) return null;
  // v4.32.7 bugfix: Maastaveto poistettu — streetlifting-kisaliikkeet ovat MU + Leuka + Dippi + Takakyykky.
  // Maastaveto oli aiemmin virheellisesti listalla; ennuste-kortti näytti maavedon "kisaliikkeenä"
  // streetlifting_16w-mesosyklissä vaikka mesosykli ei tue maavetoa kisaliikkeenä.
  const COMPETITION_LIFTS = ["Lisäpainoleuanveto", "Muscle-up", "Lisäpainodippi", "Takakyykky"];
  const result = {};
  for (const liftName of COMPETITION_LIFTS) {
    const history = historyByMovement[liftName];
    if (!history || history.length === 0) continue;
    const currentE1RM = history[history.length - 1].e1rm;
    if (!currentE1RM || currentE1RM <= 0) continue;
    const prediction = predictE1RMEndOfProgram(history, currentWeekNum, totalWeeks);
    if (!prediction) continue;
    const finalE1RM = prediction.predictedFinal;
    result[liftName] = {
      current: Math.round(currentE1RM * 10) / 10,
      predicted: finalE1RM,
      gainKg: Math.round((finalE1RM - currentE1RM) * 10) / 10,
      gainPct: Math.round(((finalE1RM - currentE1RM) / currentE1RM) * 1000) / 10, // 1 desimaali
      opener: roundToHalf(finalE1RM * 0.88),
      second: roundToHalf(finalE1RM * 0.95),
      third: roundToHalf(finalE1RM * 1.02),
      weeklyGainPct: prediction.weeklyGainPct,
      confidence: prediction.confidence,
      weeksRemaining: prediction.weeksRemaining,
    };
  }
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * v4.29.0 (P2): Streetlifting opener-strategia kisapäivälle.
 *
 * Laskee per kilpailu­liike opener / 2nd / 3rd -prosentit e1RM:n perusteella.
 * Lähde: StrengthLog/IPF World Classic 2021 -data (voittajien openerit ~88 %),
 * Helms 2018 ja Bromley Peak Strength.
 *
 * Käyttö: peaking-vaiheessa (vk 13–16) dashboard näyttää tämän taulukon
 * jotta käyttäjä voi suunnitella kisapäivän nostot ennalta.
 *
 * @param {Object} e1rmsByMovementName — { "Lisäpainoleuanveto": 94, ... }
 * @returns {Object|null} per liike: { e1rm, opener, second, third } tai null
 */
function computeStreetliftingOpenerStrategy(e1rmsByMovementName) {
  if (!e1rmsByMovementName || typeof e1rmsByMovementName !== "object") return null;
  // v4.32.7 bugfix: streetlifting-kisaliikkeet ovat MU + Leuka + Dippi + Takakyykky.
  // SSW-formaatti ei sisällä maavetoa. Aiemmassa listassa oli Maastaveto mutta ei
  // Muscle-upia — molemmat virheelliset. Korjattu kanoniseen streetlifting-listaan.
  const COMPETITION_LIFTS = [
    "Lisäpainoleuanveto",
    "Muscle-up",
    "Lisäpainodippi",
    "Takakyykky",
  ];
  // Eliittikäytäntö (Helms, Bromley, IPF World Classic 2021 -data):
  //   Opener:  88–90 % 1RM (= "viimeisin treenisingle prep-blokin lopussa")
  //   2nd:     94–96 % 1RM
  //   3rd:    100–103 % 1RM (PR-yritys)
  const OPENER_PCT = 0.88;
  const SECOND_PCT = 0.95;
  const THIRD_PCT = 1.02;
  const result = {};
  for (const liftName of COMPETITION_LIFTS) {
    const e1rm = e1rmsByMovementName[liftName];
    if (!e1rm || e1rm <= 0) continue;
    result[liftName] = {
      e1rm: Math.round(e1rm * 10) / 10,
      opener: roundToHalf(e1rm * OPENER_PCT),
      second: roundToHalf(e1rm * SECOND_PCT),
      third: roundToHalf(e1rm * THIRD_PCT),
      openerPct: OPENER_PCT,
      secondPct: SECOND_PCT,
      thirdPct: THIRD_PCT,
    };
  }
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Compute attempt loads for competition day.
 * Returns { warmupLoads: [...], opener, second, third } in external kg.
 */
function computeAttemptLoads(e1rmExternal, bw, peakingConfig, isBarbell = false) {
  if (!e1rmExternal || !peakingConfig) return null;

  // v4.51.x loadpct-fix: pct × (BW + e1rmExternal) − BW non-barbellille; pct × e1rmExternal barbell.
  // Sign-flip pct > 1.0 -arvoilla on odotettu (3rd attempt 1.02 → palauttaa aiotun yli-1RM-yrityksen).
  const applyPct = (pct) => isBarbell
    ? e1rmExternal * pct
    : (e1rmExternal + bw) * pct - bw;

  const warmupLoads = (peakingConfig.warmupPcts || [0.40, 0.60, 0.75, 0.85]).map(pct =>
    roundToHalf(Math.max(0, applyPct(pct)))
  );

  return {
    warmupLoads,
    opener: roundToHalf(Math.max(0, applyPct(peakingConfig.openerPct || 0.92))),
    second: roundToHalf(Math.max(0, applyPct(peakingConfig.secondPct || 0.97))),
    third: roundToHalf(Math.max(0, applyPct(peakingConfig.thirdPct || 1.02))),
    e1rmExternal,
  };
}

/**
 * Recommend function specifically for peaking mesocycles.
 * Key differences from normal recommend():
 * - No readiness caps (athlete decides)
 * - Competition day: enriches slots with computed loads
 * - Normal peaking days: load from weekDef deltaPctBase
 */
async function recommendPeaking(options = {}) {
  const settings = options.settings || (await getSettings());
  const bodyweightKg = options.bodyweightKg || settings.bodyweightKg || 91;
  const dateISO = options.dateISO || todayISO();
  const mesocycle = options.mesocycle;

  if (!mesocycle || mesocycle.type !== "peaking") {
    return recommend(options); // fallback to normal
  }

  const traces = [];
  function trace(ruleId, before, after, why) {
    traces.push({ traceId: uid(), recId: null, ruleId, before: { ...before }, after: { ...after }, why });
  }

  // Determine week
  // v4.22: erottele before-start / after-end — peaking-mesosyklissä myös
  // ennen alkua -pyynnöt eivät saa muuttaa käyttäjän valitsemaa mesosykliä
  const pos = resolveMesocyclePosition(mesocycle, dateISO);
  let weekNum = pos?.programWeek ?? null;
  if (weekNum === null) {
    if (pos?.reason === "before-start") {
      return {
        dateISO,
        error: "before-start",
        errorMessage: `Peaking-mesosykli alkoi ${mesocycle.startDateISO} — ei voida laskea suositusta aiemmalle päivälle`,
        traces,
        dayPlan: null,
        dayType: null,
        weekNum: null,
        weekLabel: null,
        targetExternalLoad: null,
      };
    }
    // after-end → create new default mesocycle with -5% deload start
    const newMeso = createDefaultMesocycle(dateISO);
    newMeso.weekDefs[0].deltaPctBase = -0.05;
    if (!options.dryRun) await saveMesocycle(newMeso);
    trace("PEAKING_TRANSITION", {}, { type: "default" }, "Peaking päättynyt → normaali mesosykli (-5% start)");
    return recommend({ ...options, mesocycle: newMeso });
  }

  const weekDef = getWeekDef(mesocycle, weekNum);
  const dayOfWeek = new Date(dateISO).getDay() || 7;
  const dayPlan = getTodayPlan(mesocycle, weekNum, dayOfWeek);
  // let: γ-adaptiivisuuden RED-työviikko voi vaihtaa heavy→volume (kuten pääpolku).
  let dayType = dayPlan?.dayType || "heavy";

  trace("PEAKING_PHASE", {}, { weekNum, dayType, label: weekDef?.label },
    `PEAKING Vk ${weekNum}: ${weekDef?.label || "?"}`);

  // e1RM from sets
  const allSets = options.allSets || (await getAllSets());
  const primaryMovementId = options.primaryMovementId || null;
  // K2c: suorituspäivä-sort myös peaking-polussa (oma sessions-haku — peaking ei muuten tarvitse).
  const _evidenceSort = makeEvidenceSort(options.sessions || (await getAllSessions()));
  // v4.27.15: calibration-setit mukaan topSets-filtteriin myös peaking-polussa.
  const topSets = allSets
    .filter(s => {
      if (primaryMovementId && s.movementId !== primaryMovementId) return false;
      return s.setRole === "top" || s.setRole === "readiness_test" || s.setRole === "calibration";
    })
    .sort(_evidenceSort); // K2c: suorituspäivä-sort

  const recentTopSets = topSets.slice(-6);
  // Detect barbell-only lift (squat): no bodyweight added to system load
  const peakingPrimarySlot = dayPlan?.slots?.find(s => s.role === "primary");
  const isBarbellPeaking = peakingPrimarySlot?.isBarbell === true
    || options.primaryLoadType === "external";
  const e1rmValues = recentTopSets
    .map(s => {
      const vara = s.actualVx ?? s.targetVx ?? 1;
      return isBarbellPeaking
        ? e1rmAccessory(s.externalLoadKg || 0, s.reps || s.targetReps || 3, vara)
        : e1rmSystem(bodyweightKg, s.externalLoadKg || 0, s.reps || s.targetReps || 3, vara);
    })
    .filter(v => v !== null);

  // v4.27.15: Calibration override — ks. recommend()-pääpolun kommentti.
  // OBS-052 v2: tuoreusikkuna (3. LIVE-e1RM-source-sijainti, sama helper kuin recommend() +
  // kortti → F-3-koherenssi peaking-mesosyklissä). Lukee TÄYDEN topSets-historian (ei slice-6)
  // jotta kuukauden vanha cal näkyy ajurina tuoreusportin sisällä.
  const peakingCalibSets = freshCalibSets(topSets);
  let currentE1RMSystem;
  if (peakingCalibSets.length > 0) {
    const calibE1rms = peakingCalibSets.map(s => {
      // v4.34.33 BUG-FIX 1.3: yhtenäinen fallback pää-recommend()-funktion kanssa.
      // Aiempi `?? 0` aliarvioi peaking-cal-setit (V0 = failure) — v4.32.8 protokolla
      // käyttää RPE 8 × 3 V1, joten target-Vx ei välttämättä ole tallennettu actualVx:nä.
      const vara = s.actualVx ?? s.targetVx ?? 1;
      return isBarbellPeaking
        ? e1rmAccessory(s.externalLoadKg || 0, s.reps || 1, vara)
        : e1rmSystem(bodyweightKg, s.externalLoadKg || 0, s.reps || 1, vara);
    }).filter(v => v !== null);
    currentE1RMSystem = calibE1rms.length > 0 ? median(calibE1rms) : (e1rmValues.length > 0 ? median(e1rmValues) : null);
  } else {
    currentE1RMSystem = e1rmValues.length > 0 ? median(e1rmValues) : null;
  }
  // Barbell: external = system (ei BW-vähennystä). Muut: sys - BW.
  const currentE1RMExternal = currentE1RMSystem !== null
    ? (isBarbellPeaking ? currentE1RMSystem : Math.max(0, currentE1RMSystem - bodyweightKg))
    : null;

  // Use peakingConfig e1RM if no computed e1RM
  const useE1RM = currentE1RMExternal || mesocycle.peakingConfig?.e1rmExternal || 93;

  trace("PEAKING_E1RM", {}, {
    e1rmExternal: useE1RM.toFixed(1),
    source: currentE1RMExternal ? "computed" : "peakingConfig",
  }, `Peaking e1RM: ${useE1RM.toFixed(1)} kg`);

  // Competition day: compute attempt loads
  let attemptLoads = null;
  let attemptLoadsByLift = null;
  if (dayType === "competition") {
    attemptLoads = computeAttemptLoads(useE1RM, bodyweightKg, mesocycle.peakingConfig, isBarbellPeaking);
    trace("COMPETITION_LOADS", {}, attemptLoads, "Kilpailukuormat laskettu");
    // H-019 B-C2c: per-laji-yrityskuormat — jokainen kisalaji resolvoituu OMASTA
    // e1RM:stään. Lähdehierarkia per laji: (1) B8-konfiguroitu lifts[].e1rmExternal
    // (hybridi: esitäytetty kanonisesta Bestistä, atleetti vahvistanut/muokannut) →
    // (2) tuore historia-e1RM (viim. 6 top/cal-settiä, sama evidenssi-sort-aritmetiikka
    // kuin primaaripolku; kaikki kisalajit BW-ankkuroituja → system − BW) → (3) useE1RM.
    const _lifts = mesocycle.peakingConfig?.lifts;
    if (Array.isArray(_lifts) && _lifts.length) {
      const _movs = options.allMovements || (await getAllMovements());
      const _freshExtE1RM = (liftName) => {
        const mov = _movs.find(m => m.name === liftName);
        if (!mov) return null;
        const vals = allSets
          .filter(s => s.movementId === mov.movementId
            && (s.setRole === "top" || s.setRole === "readiness_test" || s.setRole === "calibration"))
          .sort(_evidenceSort)
          .slice(-6)
          .map(s => e1rmSystem(bodyweightKg, s.externalLoadKg || 0, s.reps || s.targetReps || 1, s.actualVx ?? s.targetVx ?? 1))
          .filter(v => v !== null);
        return vals.length ? Math.max(0, median(vals) - bodyweightKg) : null;
      };
      attemptLoadsByLift = {};
      for (const l of _lifts) {
        const _le = l.e1rmExternal ?? _freshExtE1RM(l.name) ?? useE1RM;
        attemptLoadsByLift[l.name] = computeAttemptLoads(_le, bodyweightKg, mesocycle.peakingConfig, false);
      }
      trace("COMPETITION_LOADS_BY_LIFT", {}, { lifts: _lifts.map(l => l.name) },
        `Per-laji kilpailukuormat: ${_lifts.map(l => `${l.name} @ e1RM ${attemptLoadsByLift[l.name].e1rmExternal.toFixed(1)}`).join(" · ")}`);
    }
  }

  // ── γ-adaptiivisuus (H-019 B-C2, ratifioitu 2026-07-11 porrastuksella) ──
  // Legacy-design "No readiness caps — athlete decides" korvattu porrastetulla
  // cap-only-semantiikalla (readiness ei koskaan NOSTA kuormaa):
  //   • TYÖVIIKOT: täysi cap-only kuten pääpolku (YELLOW −2 % ilman negatiivisen
  //     laimennusta · RED −5/−8 % + heavy→volume · syvyysraja −30 %).
  //   • TAPER-VIIKKO (weekDef.isTaper): YELLOW = advisory-only (kisaviikon YELLOW on
  //     usein jännityskohinaa; intensiteetin säilytys on taperin ensisijainen vipu) ·
  //     RED = aktiivinen cap + viimeisen raskaan siirtoehdotus (advisory, ei auto-siirtoa).
  //   • KISAPÄIVÄ: EI readiness-cappeja — K7-6 in-meet-yritysvalinta ohjaa yksin.
  //     Ohitus kirjataan eksplisiittisesti traceen (auditoitavuus).
  const readiness = options.readiness || null;
  const peakCapLevel = readiness?.capLevel ?? 0;
  const isTaperWeek = weekDef?.isTaper === true;
  let peakVxBump = 0;
  if (dayType === "competition" && peakCapLevel > 0) {
    trace("MEETDAY_READINESS_BYPASS", { capLevel: peakCapLevel }, { applied: false },
      "Kisapäivä: readiness-capit ohitetaan tietoisesti — K7-6 in-meet-yritysvalinta (computeNextAttempt) ohjaa yrityksiä openerin tuloksesta, ei aamusignaalista (ratifioitu 2026-07-11)");
  } else if (peakCapLevel === 2 && !isTaperWeek && dayType === "heavy") {
    // RED työviikolla: heavy→volume kuten pääpolku (ENNEN dayMult-laskentaa).
    trace("CAP_RED_DAYTYPE", { dayType: "heavy" }, { dayType: "volume" }, "RED readiness (peaking-työviikko) → heavy vaihdettu volume:ksi");
    dayType = "volume";
  }

  // Normal peaking day: compute load from slot reps/vx (not weekDef!)
  // Apply dayMult to delta like normal recommend() does
  const dayMult = DAY_TYPE_MULTIPLIERS[dayType] ?? 1.0;
  let deltaPct = (weekDef?.deltaPctBase || 0) * dayMult;

  if (dayType !== "competition") {
    if (peakCapLevel === 2) {
      const _oldD = deltaPct;
      deltaPct = Math.min(deltaPct, 0);
      const _velRed = readiness?.channels?.velocity?.class === "RED";
      const _varaRed = readiness?.channels?.vara?.class === "RED";
      const _red = (_velRed && _varaRed) ? -0.08 : -0.05;
      deltaPct += _red;
      peakVxBump = 1;
      trace("CAP_RED", { deltaPct: _oldD }, { deltaPct },
        `RED readiness (peaking${isTaperWeek ? "/taper" : ""}) → kuorma ${(_red * 100).toFixed(1)}% + targetVx +1${_velRed && _varaRed ? " (double-red)" : ""}`);
      if (isTaperWeek) {
        trace("TAPER_RED_ADVISORY", {}, { suggestion: "siirrä viimeistä raskasta +1 pv" },
          "RED taper-viikolla: harkitse viimeisen raskaan siirtoa päivällä eteenpäin — palautuminen ajaa terävyyden ohi kisaviikolla");
      }
    } else if (peakCapLevel === 1) {
      if (isTaperWeek) {
        trace("TAPER_YELLOW_ADVISORY", {}, { deltaPct },
          "YELLOW taper-viikolla: usein jännityskohinaa — ei automaattista kevennystä (intensiteetin säilytys on taperin ensisijainen vipu). Seuraa trendiä; jos toistuu, kevennä itse.");
      } else {
        const _oldD = deltaPct;
        // Sama K5-7-luokan guard kuin pääpolussa: vain positiivinen delta puolitetaan.
        deltaPct = deltaPct > 0 ? deltaPct * 0.5 : deltaPct;
        deltaPct += -0.02;
        peakVxBump = 1;
        trace("CAP_YELLOW", { deltaPct: _oldD }, { deltaPct },
          `YELLOW readiness (peaking-työviikko) → ${_oldD > 0 ? "deltaPct puolitettu + " : ""}kuorma -2.0%`);
      }
    }
    // Syvyysraja kuten pääpolku (invariantti C:n syvä raja).
    if (deltaPct < -0.30) {
      const _preClamp = deltaPct;
      deltaPct = -0.30;
      trace("DELOAD_DEPTH_CLAMP", { deltaPct: _preClamp }, { deltaPct },
        `Syvyysraja: kevennysten summa ${(_preClamp * 100).toFixed(1)}% capattu −30,0 %:iin`);
    }
  }

  // Read reps/vx from primary slot (accurate per-day prescription)
  const primarySlot = dayPlan?.slots?.find(s => s.role === "primary");
  let targetReps, targetVx;
  if (primarySlot) {
    targetReps = primarySlot.reps;
    targetVx = primarySlot.targetVx ?? (dayType === "heavy" ? 1 : dayType === "volume" ? 2 : 4);
  } else {
    // Fallback to weekDef if no slot found
    targetReps = weekDef?.heavyReps || 2;
    targetVx = weekDef?.heavyTargetVx || 1;
    if (dayType === "volume") {
      targetReps = Math.max(3, targetReps + 2);
      targetVx = Math.min(4, targetVx + 1);
    }
  }
  // γ-adaptiivisuus: RED/YELLOW-työviikko (+ RED-taper) → +1 varaa (kevennä, ei failure-
  // riskiä väsyneenä) — sama semantiikka kuin pääpolun readinessVxBump. Cap V4.
  if (peakVxBump > 0 && typeof targetVx === "number") {
    targetVx = Math.min(4, targetVx + peakVxBump);
  }

  // H-019 B-C2b (B2): VL-cap resolvoituu myös peaking-polulla — viikkoleiman phase
  // ohjaa (intensity ≤ 15 % / peaking ≤ 10 %; "Taper"-viikko kantaa phase="peaking"
  // jota label-johto ei tunnistaisi). VL_CAP_RESOLVED-emissio antaa audit-katteen
  // (invariantti A) + pariteetin pääpolun kanssa; UI:n live-cap tulee samasta
  // resolverista samalla phase-lähteellä (phaseForWeek + weekDef.phase).
  if (dayType !== "competition") {
    const _gammaPhase = weekDef?.phase
      || deriveBlockPhaseFromMesocycle(mesocycle.type, weekNum, weekDef?.label)
      || "peaking";
    vlCapForContext({
      blockPhase: _gammaPhase,
      exerciseName: primarySlot?.defaultMovementName || null,
      dayType, targetVx, settings,
      emitTrace: (t) => trace(t.ruleId, t.before, t.after, t.why || `VL-cap resolvoitu (peaking-polku, phase ${_gammaPhase})`),
    });
  }

  let targetExternalLoad;
  if (currentE1RMSystem !== null) {
    const effectiveReps = targetReps + targetVx;
    const targetSystemLoad = currentE1RMSystem / (1 + effectiveReps / 30);
    const rawExternal = targetSystemLoad * (1 + deltaPct) - bodyweightKg;
    targetExternalLoad = roundToHalf(Math.max(0, rawExternal));
  } else {
    targetExternalLoad = null;
  }

  const rec = {
    recId: uid(),
    dateISO,
    mesocycleId: mesocycle.mesocycleId,
    mesocycleType: "peaking",
    weekNum,
    weekLabel: weekDef?.label || "?",
    dayType,
    targetExternalLoad,
    targetReps,
    targetVx,
    setCount: dayPlan?.slots?.find(s => s.role === "primary")?.sets || 3,
    deltaPct,
    capLevel: 0, // No caps in peaking
    readiness: options.readiness || { combined: "GREEN", capLevel: 0, channels: {} },
    e1rmSystem: currentE1RMSystem,
    e1rmExternal: currentE1RMExternal,
    bodyweightKg,
    varaFeedback: { suggestion: null, type: null },
    breakInfo: null,
    accessoryCapActive: false,
    dayPlan,
    attemptLoads,
    attemptLoadsByLift, // B-C2c: per-laji-yrityskuormat (null ei-kisapäivinä / legacy)
    peakingConfig: mesocycle.peakingConfig,
    traces,
  };

  for (const t of traces) t.recId = rec.recId;

  if (!options.dryRun) {
    await saveRecommendation({
      recId: rec.recId,
      sessionId: null,
      variantId: null,
      targetSetRole: "top",
      targetLoadKg: targetExternalLoad,
      deltaPct,
      capLevel: 0,
      mesocycleWeek: weekNum,
      dayType,
      targetReps,
      targetVx,
      createdAtISO: new Date().toISOString(),
    });
    for (const t of traces) await saveDecisionTrace(t);
  }

  return rec;
}

// ═══════════════════════════════════════════════════════════════
// ANNUAL PERIODIZATION — SUGGESTED NEXT TEMPLATE
// ═══════════════════════════════════════════════════════════════

// Mapping: current mesocycle type → recommended next template(s)
// First entry is the primary recommendation, rest are alternatives
const SUGGESTED_NEXT_TEMPLATE = {
  default:       ["hypertrofia", "maksimivoima", "dup"],           // Perusjaksosta eteenpäin
  hypertrofia:   ["maksimivoima", "default", "dup"],               // Lihasmassasta voimaan
  maksimivoima:  ["peaking", "eksentrinen", "palautuminen"],       // Maksimivoima → kilpailu tai palautuminen
  eksentrinen:   ["palautuminen", "default", "maksimivoima"],      // Eksentrinen → palaudu ensin
  dup:           ["maksimivoima", "hypertrofia", "eksentrinen"],    // DUP → voimablokkiin
  siirtyma:      ["hypertrofia", "default", "dup"],                // GPP → uusi kasvujakso
  palautuminen:  ["hypertrofia", "default", "siirtyma"],           // Palautuminen → uusi kasvu
  peaking:       ["palautuminen", "siirtyma", "hypertrofia"],      // Kilpailun jälkeen → lepo
};

// ═══════════════════════════════════════════════════════════════
// v4.34.0 AI-BLOCK-TUNING (deload-pohjainen analyysipaketti)
// ═══════════════════════════════════════════════════════════════
//
// Generoi rikkaan analyysipaketin atleetin viedäkseen Claude/ChatGPT:lle
// deload-viikolla (vk 4, 8, 12). AI palauttaa block-tuning-suosituksia
// kolmessa kategoriassa:
//   A) Sovellus-tason muutokset (atleetti applaa UI:ssa: slot-swap, e1RM, BW)
//   B) Rakenteelliset muutokset (Claude Code -tasolla: %-progressio,
//      set/rep, backoff-tyyli, engine-säätö)
//   C) Mentaalinen koutsaus (atleetti sisäistää: tekniikkavinkit,
//      pattern-tunnistus, riskimanagement)
//
// Output: { markdown, json, prompt, meta }
//   markdown = atleetin luettava 1500-2000 sanan narratiivi
//   json     = strukturoitu data Claude AI:lle ristivertailuun
//   prompt   = valmis copy-paste AI-prompt jossa kaikki konteksti

// β H-001 B1 (HANDOFF.md §6 K1 ratifioitu 2026-05-25): yhtenäinen aggregaatti-
// laskenta AI Block Tuning -syötteen totalSessions + completedSets -metriikoille.
// Lukittu rajaus:
//   - Viikkojoukko: kutsuja antaa blockSessions, joka on jo viikkofilteröity
//     päättyneisiin blokkiviikkoihin (esim. Foundation = vk 1–3). Käynnissä
//     oleva siirtymä-/deload-viikko vk N EI sisälly aggregaatteihin — se
//     hoidetaan erikseen B5:n currentWeekCalibrationSets-kentällä.
//   - Backfill: sisältyy. Sessio kuuluu joukkoon dateISO:n viikkonsidon kautta,
//     ei kirjausajan. Backfill-kirjatut sessiot/setit ovat aitoa toteutunutta
//     volyymiä ja kuuluvat aggregaatteihin (Israetel-MRV-vertailu vaatii
//     todellisen volyymin).
//   - totalSessions: blockSessions.length — session-tason metriikka, EI warmup-
//     suodatusta.
//   - completedSets: SET-tason suodatin isWarmup !== true. HUOM: aiempi
//     completed === true -filtteri (H-006a-fix8 2026-05-28) poistettu —
//     runtime-tilan completed-lippu EI tallennu saveSet-polkujen kautta
//     IndexedDB:hen (index.html:14228 / 2064 / 13986 / 9132), joten filtteri
//     tuotti aina 0 ja AI-Block-Tuning -paketin markdown-yhteenveto raportoi
//     "Sarjoja yhteensä: 0" vaikka JSON-osio sisälsi täydet 260 slottia.
//     Kanoninen pattern on warmup-suodatus, kuten pre-H-001-aikainen
//     aggregointi (vk 4 -paketti 23.5.2026 laski oikein 260).
// Käytössä generateBlockTuningPackage, generateGenericBlockTuningPackage ja
// generateEndOfCycleTuningPackage -funktioissa varmistamaan sama rajaus
// (HANDOFF.md A1).
function _computeTuningCoreAggregates(blockSessions, allSets) {
  const sessions = blockSessions || [];
  const sets = allSets || [];
  const totalSessions = sessions.length;
  let completedSets = 0;
  for (const sess of sessions) {
    for (const set of sets) {
      if (set.sessionId === sess.sessionId
          && set.isWarmup !== true) {
        completedSets++;
      }
    }
  }
  return { totalSessions, completedSets };
}

// β H-001 B2/A2 (HANDOFF.md §5 kohta 6 + §6 K2(1)-A ratifioitu 2026-05-25):
// Normalisoi slotin note-kentässä esiintyvä "@XX%"-merkkijono vastaamaan
// slot.loadPct:tä AI Block Tuning -syötteen serialisoinnissa.
//
// loadPct on kanoninen kuorma-intentti-kenttä (HANDOFF.md §5 kohta 6) — se on
// dimensioton ja toimii sekä barbell- että BW-skaalatuilla liikkeillä. note
// on kuvailevaa tekstiä; jos sen "@XX%" eroaa loadPct:stä, korvataan loadPct-
// pohjaisella prosentilla.
//
// SCOPE: tämä helper toimii engine.js:n AI Block Tuning -funktioissa
// (generate*TuningPackage). EI muuta data.js-mesosyklitemplaattia eikä
// atletti-UI:n näkymiä — note-merkkijonon LÄHDE on data.js:ssä, B2 korjaa
// VAIN AI-syötteen serialisoinnin (HANDOFF.md §3 scope-aita).
//
// Toleranssi 0,5 prosenttiyksikköä (= ≈ roundToHalf-rasteri 100 kg
// e1RM:llä). Pause/pin/tempo-variantti-spesifikaatiosta riippumatta
// (Akselin K2(1)-A "tiukka" ratifiointi 2026-05-25).
//
// resolvedLoadKg EI sisälly normalisointiin — se on ajonaikainen resolvoitu
// arvo, legitiimisti poikkeava loadPct × e1RM-arvosta (K2(2)-OK ratifiointi).
// β H-001 B3 (HANDOFF.md §6 K3 ratifioitu 2026-05-25):
// Tunnistaa onko trendikenttä { status, reason? }-objekti (= tyhjä-status-
// encoding) vai aitoa dataa. Käytetään AI Block Tuning -syötteen markdown-
// renderoinnissa varmistamaan että Object.keys/Object.entries -iteroinnit
// eivät törmää status-objekteihin.
//
// Status-arvojoukko (lukittu HANDOFF.md §5 kohta 7):
//   - "empty"           — mitattu, ei havaintoja tällä jaksolla
//   - "unavailable"     — dataketju rikki — pipeline ei tuota arvoa
//                         (skeemassa, mutta engine EI emittoi tällä hetkellä;
//                          aktivoituu Enode/Oura-pipeline-jatkohandoffissa §6 K5)
//   - "not-implemented" — kenttää ei ole vielä toteutettu / saatavilla
//
// Periaate: rehellinen status, ei fabrikointia (Akselin K3-ratifiointi
// 2026-05-25). Engine emittoi vain statuksia jotka voi luotettavasti todeta.
function _isTrendEmptyStatus(field) {
  return field && typeof field === "object" && !Array.isArray(field)
      && typeof field.status === "string"
      && (field.status === "empty"
          || field.status === "unavailable"
          || field.status === "not-implemented");
}

// Käyttäjälle näytettävä suomenkielinen labeli markdown-renderoinnissa.
// Reason näytetään suluissa jos olemassa.
function _formatTrendStatusFi(field) {
  if (!_isTrendEmptyStatus(field)) return "";
  const labelByStatus = {
    "empty": "ei havaintoja",
    "unavailable": "dataketju rikki",
    "not-implemented": "ei toteutettu",
  };
  const label = labelByStatus[field.status] || field.status;
  return field.reason ? `${label} — ${field.reason}` : label;
}

function _normalizeSlotForTuningSerialization(slot) {
  if (!slot) return slot;
  if (typeof slot.loadPct !== "number" || slot.loadPct <= 0) return slot;
  if (typeof slot.note !== "string") return slot;
  const m = slot.note.match(/@\s*(\d+(?:[.,]\d+)?)\s*%/);
  if (!m) return slot;
  const notePct = parseFloat(m[1].replace(",", ".")) / 100;
  if (!Number.isFinite(notePct)) return slot;
  // H-002 B2: cross-ref-haara. Jos slot kantaa refScale + nominalLoadPct
  // -metadatan (data.js laDay tuottaa cross-ref-with-scaling -sloteille,
  // esim. paused/pin squat) ja note's @-pct vastaa nominaalia (≤ 0,5 pp),
  // note on legitiimi cross-ref-merkintä viiteliikkeen 1RM-suhteessa
  // (loadPctReferenceMovementName) → ei normalisointia. loadPct on jo
  // skaalattu (= nominalLoadPct × refScale).
  if (typeof slot.refScale === "number" && typeof slot.nominalLoadPct === "number") {
    const nominalDeltaPp = Math.abs(notePct - slot.nominalLoadPct) * 100;
    if (nominalDeltaPp <= 0.5) return slot;
  }
  const deltaPp = Math.abs(notePct - slot.loadPct) * 100;
  if (deltaPp <= 0.5) return slot; // toleranssi 0,5 pp
  // Korvaa "@XX%"-merkkijono loadPct-pohjalla. Pyöristys 1 desimaaliin →
  // "@59,5 %" tai "@93 %" (kokonaisluku jos .0).
  const pctNum = slot.loadPct * 100;
  const pctStr = Math.abs(pctNum - Math.round(pctNum)) < 0.05
    ? `${Math.round(pctNum)} %`
    : `${pctNum.toFixed(1).replace(".", ",")} %`;
  return { ...slot, note: slot.note.replace(/@\s*\d+(?:[.,]\d+)?\s*%/, `@${pctStr}`) };
}

// v4.52.6 H-005 B1 — AI Block Tuning aktivointi-ikkuna
// Deload-viikon (vk 4, 8, 12) lisäksi sallitaan seuraavan blokin
// 1-2 ensimmäistä viikkoa, jolloin edellisen blokin analyysi on
// luonteva tehdä (data tuoreessa muistissa, uusi blokki ei vielä
// syvällä asetuksissaan). Sama prevBlock/nextBlock-mappaus toimii
// kaikille saman ikkunan viikoille — esim. wk=4 ja wk=5 → prevBlock
// = "Foundation" (vk 1-3), nextBlock = "Strength" (vk 5-7).
export const BLOCK_TUNING_WINDOWS = [
  { name: "Foundation→Strength", weeks: [4, 5, 6],    prevBlock: "Foundation", prevWeeks: [1,2,3],   nextBlock: "Strength",  nextWeeks: [5,6,7]   },
  { name: "Strength→Intensity",  weeks: [8, 9, 10],   prevBlock: "Strength",   prevWeeks: [5,6,7],   nextBlock: "Intensity", nextWeeks: [9,10,11] },
  { name: "Intensity→Peaking",   weeks: [12, 13, 14], prevBlock: "Intensity",  prevWeeks: [9,10,11], nextBlock: "Peaking",   nextWeeks: [13,14]   },
];

export function findBlockTuningWindow(wk) {
  return BLOCK_TUNING_WINDOWS.find(w => w.weeks.includes(wk)) || null;
}

export function isBlockTuningActive(wk) {
  return findBlockTuningWindow(wk) !== null;
}

// H-006a A4: per-mittari datavirran tila (velocity / hrv / vara).
// Atletille läpinäkyvä pipeline-eheys: available = data virtaa, loading =
// käynnistymässä (1-2 mittausta viim. 30 päivässä), unavailable = ei dataa.
// Käytetään sekä AI-Block-Tuning-syötteessä (json.dataSourceStatus) että
// UI-indikaattorissa Asetukset-välilehdellä (index.html B4).
export function computeDataSourceStatus(allSets, measurements, refDateISO) {
  const today = refDateISO ? new Date(refDateISO).getTime() : Date.now();
  const cutoff = today - 30 * 86400000; // 30 päivää sitten

  // H-006a-fix6 (2026-05-27): set-objektit eivät kanna dateISO-kenttää —
  // setit tallentuvat sets-storeen vain "timestamp"-kentällä (save-aika ISO).
  // Akselin debug-rivi paljasti: allSets yhteensä 332, viim. 30 pv = 0 →
  // filtteri hylkäsi KAIKKI setit koska s.dateISO oli aina undefined.
  // Fallback s.timestamp varmistaa että kaikki olemassa olevat setit lasketaan.
  // Tulevat setit saavat lisäksi explicit dateISO-kentän saveSet-polussa.
  const setDate = (s) => s.dateISO || s.timestamp || null;
  const recentVelocity = (allSets || []).filter(s => {
    const d = s && setDate(s);
    if (!d) return false;
    const ts = new Date(d).getTime();
    if (!Number.isFinite(ts) || ts < cutoff) return false;
    const hasMvReps = Array.isArray(s.mvReps) && s.mvReps.length > 0;
    const hasMean = typeof s.velocityMean === "number" && s.velocityMean > 0;
    const hasRep1 = typeof s.velocityRep1 === "number" && s.velocityRep1 > 0;
    return hasMvReps || hasMean || hasRep1;
  });
  // v4.52.16 H-007 B1 (A1): JUURISYY — measurements tallentaa { type: "HRV",
  // value: ms, valueTransformed: lnRMSSD }, EI m.hrv-kenttää. Aiempi filtteri
  // m.hrv != null tuotti aina false → HRV-kortti näytti aina ⚪ vaikka
  // mittauksia oli tallessa (vrt. H-006a 'Sarjoja 0' -regressio: sets-storen
  // completed-lipun puute, sama luokka virhe).
  const recentHrv = (measurements || []).filter(m => {
    if (!m || !m.dateISO) return false;
    const ts = new Date(m.dateISO).getTime();
    if (!Number.isFinite(ts) || ts < cutoff) return false;
    return m.type === "HRV" && m.value != null;
  });
  const recentVara = (allSets || []).filter(s => {
    const d = s && setDate(s);
    if (!d) return false;
    const ts = new Date(d).getTime();
    if (!Number.isFinite(ts) || ts < cutoff) return false;
    return s.actualVx != null;
  });

  function classify(n, label) {
    if (n >= 3) return { status: "available", n, reason: `${label}-mittaus aktiivinen (${n} mittausta viim. 30 päivässä)` };
    if (n >= 1) return { status: "loading", n, reason: `${label}-mittaus käynnistymässä (${n}/3 mittausta viim. 30 päivässä)` };
    return { status: "unavailable", n: 0, reason: `${label}-mittausta ei ole viim. 30 päivänä` };
  }

  return {
    velocity: classify(recentVelocity.length, "velocity"),
    hrv: classify(recentHrv.length, "hrv"),
    vara: classify(recentVara.length, "vara"),
  };
}

// H-006a A2: precompute RTF-model per uniikki movementId AI-Block-Tuning-
// syötettä varten. Käytetään sekä generateBlockTuningPackage:ssa että
// generateGenericBlockTuningPackage:ssa actual.rtfModelStatus-kentän
// täyttämiseen. Palauttaa { [movementId]: { status, n, r2 } } -map:in.
// Kompakti versio computeRtfVelocityModel-paluuarvosta (ei koko mallia,
// vain status + n + r2 — AI-syötteen tarvitsema metadata).
function _buildRtfModelMap(allSets) {
  const map = {};
  if (!Array.isArray(allSets) || allSets.length === 0) return map;
  const movementIds = new Set();
  for (const s of allSets) {
    if (s && s.movementId) movementIds.add(s.movementId);
  }
  for (const mid of movementIds) {
    const m = computeRtfVelocityModel(allSets, mid);
    map[mid] = { status: m.status, n: m.n, r2: m.r2 };
  }
  return map;
}

function generateBlockTuningPackage(ctx) {
  const { mesocycle, sessions, allSets, measurements, prs, currentWeekNum, settings, decisionTraces, movements } = ctx;

  if (!mesocycle || mesocycle.type !== "streetlifting_16w") {
    return { error: "AI-Block-Tuning vaatii streetlifting_16w-mesosyklin." };
  }

  // v4.52.19 H-011 P1b (JS1): movementId → movementName -resoluutio. Setit kantavat
  // movementId:n (UUID), EIVÄT movementName-kenttää (0/332 Akselin datassa) → e1RM-
  // trend-filtteri (set.movementName === liftName) + slot-nimet tippuivat tyhjiksi
  // (OBS-008 juuri: 107 kisaliike-settiä → "empty"). idToName resolvoi nimen
  // movements-storesta. Graceful: jos movements puuttuu, fallback set.movementName.
  const _idToName = {};
  for (const m of (movements || [])) { if (m && m.movementId) _idToName[m.movementId] = m.name; }
  const _movName = (set) => set.movementName ?? _idToName[set.movementId] ?? null;

  const wk = currentWeekNum;
  // H-005 B1: aktivointi-ikkuna deload + seuraavan blokin alku
  // (ks. BLOCK_TUNING_WINDOWS-vakio yllä). Sama prevBlock/nextBlock-
  // mappaus toimii kaikille saman ikkunan viikoille.
  const block = findBlockTuningWindow(wk);
  if (!block) {
    const sallitut = BLOCK_TUNING_WINDOWS.flatMap(w => w.weeks).sort((a,b) => a-b);
    return {
      error: `AI-Block-Tuning aktivoituu deload-viikolla (vk 4, 8, 12) tai seuraavan blokin 1-2 ensimmäisellä viikolla (vk 5-6, 9-10, 13-14). Olet vk ${wk}. Seuraava aktiivinen vk: ${sallitut.find(d => d > wk) || "16 (kisaviikko)"}.`
    };
  }

  // ── Atleettiprofile ──
  const cal = mesocycle.streetliftingConfig?.calibration || {};
  const bw = settings?.bodyweightKg || 91;
  const profile = {
    bw,
    weekCount: mesocycle.weekCount || 16,
    competitionDate: mesocycle.streetliftingConfig?.competitionDate || "elokuu 2026",
    calibration: cal,
    // v4.34.43: cfg-drift-historia AI-tuningille — näkyvyys siihen miten engine
    // on oppinut atletin todellisen kapasiteetin blokin aikana.
    cfgDriftHistory: (mesocycle.streetliftingConfig?.cfgDriftHistory || []).filter(d => {
      const dw = getMesocycleWeek(mesocycle, d.dateISO);
      return block.prevWeeks.includes(dw);
    }),
    prs: (prs || []).map(p => ({ movement: p.movementName, value: p.value, dateISO: p.dateISO, context: p.context })),
  };

  // ── Edellisen blokin sessio-data ──
  const prevBlockSessions = (sessions || []).filter(s => {
    const sw = getMesocycleWeek(mesocycle, s.dateISO);
    return block.prevWeeks.includes(sw);
  }).sort((a, b) => (a.dateISO || "").localeCompare(b.dateISO || ""));

  // H-006a A2: precompute RTF-model per movementId AI-Block-Tuning-syötettä varten.
  const rtfModelMap = _buildRtfModelMap(allSets || []);
  const sessionAnalysis = prevBlockSessions.map(sess => {
    const sessSets = (allSets || []).filter(set => set.sessionId === sess.sessionId);
    const sw = getMesocycleWeek(mesocycle, sess.dateISO);
    const slots = sessSets.map(set => ({
      movementName: _movName(set), // H-011 P1b (JS1): resolvoi movementId → nimi
      role: set.setRole,
      prescribed: { reps: set.targetReps, vx: set.targetVx, loadKg: set.targetLoadKg, loadPct: set.targetLoadPct },
      actual: {
        reps: set.reps,
        actualVx: set.actualVx,
        loadKg: set.externalLoadKg,
        velocity: set.velocityMs ?? set.velocityMean ?? null,
        // H-006a A2: velocity-rikastus AI-Block-Tuning-syötteeseen.
        velocityRep1: set.velocityRep1 ?? null,
        velocityLossPercent: set.velocityLossPercent ?? null,
        mvRepsCount: Array.isArray(set.mvReps) ? set.mvReps.length : 0,
        rtfModelStatus: rtfModelMap[set.movementId] || { status: "no-data", n: 0, r2: null },
      },
      vxDelta: (set.targetVx != null && set.actualVx != null) ? (set.targetVx - set.actualVx) : null,
    }));
    return {
      week: sw,
      dateISO: sess.dateISO,
      label: sess.label,
      dayType: sess.dayType,
      slots,
      notes: sess.notes || null,
    };
  });

  // ── e1RM-trendit per kisaliike ──
  // B3 K3 ratifioitu (HANDOFF.md §6 K3, 2026-05-25): tyhjä-status-encoding.
  // Jos yhdelläkään kisaliikkeellä ei ole ≥2 datapointtia, kentän arvo on
  // { status: "empty", reason } (data-tila pysyy ennallaan objektina).
  const compLifts = ["Lisäpainoleuanveto", "Muscle-up", "Lisäpainodippi", "Takakyykky"];
  let e1rmTrends = {};
  for (const liftName of compLifts) {
    const liftSets = (allSets || []).filter(set => _movName(set) === liftName && set.externalLoadKg > 0); // H-011 P1b (JS1)
    if (liftSets.length === 0) continue;
    const sortedSets = liftSets.sort((a, b) => (a.timestamp || a.dateISO || "").localeCompare(b.timestamp || b.dateISO || ""));
    const dataPoints = sortedSets.slice(-12).map(s => {
      const vara = s.actualVx ?? s.targetVx ?? 1;
      const e1rm = liftName === "Takakyykky"
        ? e1rmAccessory(s.externalLoadKg || 0, s.reps || 1, vara)
        : e1rmSystem(bw, s.externalLoadKg || 0, s.reps || 1, vara);
      return { dateISO: s.dateISO, e1rm: Math.round(e1rm * 10) / 10, load: s.externalLoadKg, reps: s.reps, vx: s.actualVx };
    });
    if (dataPoints.length >= 2) {
      const first = dataPoints[0].e1rm;
      const latest = dataPoints[dataPoints.length - 1].e1rm;
      const deltaPct = first > 0 ? ((latest - first) / first) * 100 : 0;
      e1rmTrends[liftName] = {
        first, latest, deltaPct: Math.round(deltaPct * 10) / 10,
        dataPoints,
      };
    }
  }
  if (Object.keys(e1rmTrends).length === 0) {
    e1rmTrends = { status: "empty", reason: "ei kisaliike-settejä ≥ 2 datapointilla tällä blokilla" };
  }

  // ── HRV / MPV / BW-trendit ──
  // B3 K3: per-mittari tyhjä-status-encoding. Data-tila pysyy taulukkona;
  // tyhjä lista korvataan { status: "empty", reason } -objektilla.
  // H-006a (2026-05-27): lisätty dataSourceStatus-juurikenttä json:iin
  // joka emittoi per-mittari available/loading/unavailable-statuksen
  // (ks. computeDataSourceStatus-helper + json.dataSourceStatus alempana).
  const blockMeasurements = (measurements || []).filter(m => {
    const mw = getMesocycleWeek(mesocycle, m.dateISO);
    return block.prevWeeks.includes(mw) || mw === wk;
  }).sort((a, b) => (a.dateISO || "").localeCompare(b.dateISO || ""));

  const trends = {
    // v4.52.16 H-007 B1 (A1): m.hrv → m.type === "HRV" && m.value
    hrv: blockMeasurements.filter(m => m && m.type === "HRV" && m.value != null).map(m => ({ dateISO: m.dateISO, value: m.value })),
    mpv: blockMeasurements.filter(m => m.mpv != null).map(m => ({ dateISO: m.dateISO, value: m.mpv })),
    // v4.52.19 H-011 P1b (JS2): kanoninen bodyweight-kuvio m.type === "bodyweight"
    // && m.value (sama kuin H-007 m.hrv-korjaus). Aiempi m.bodyweightKg luki
    // olematonta kenttää (saveBodyweightEntry tallentaa { type:"bodyweight",
    // value }), → 44 foundation-mittausta tippui "empty":ksi (OBS-008 juuri).
    bodyweight: blockMeasurements.filter(m => m && m.type === "bodyweight" && m.value != null).map(m => ({ dateISO: m.dateISO, value: m.value })),
  };
  if (trends.hrv.length === 0) trends.hrv = { status: "empty", reason: "ei HRV-mittauksia tällä blokilla" };
  if (trends.mpv.length === 0) trends.mpv = { status: "empty", reason: "ei MPV-mittauksia tällä blokilla" };
  if (trends.bodyweight.length === 0) trends.bodyweight = { status: "empty", reason: "ei kehonpaino-mittauksia tällä blokilla" };

  // ── Anomaliat ──
  // B3 K3: anomalies pysyy taulukkona aina (status-encoding ulkopuolella).
  // Tapahtumalista, ei mittaus — tyhjä = positiivinen signaali (atletti
  // suoritti puhtaasti). totalSessions erottaa "ei sessioita" -reunan:
  // jos sessioita 0, anomalies on luonnollisesti tyhjä eikä vaadi statusta.
  const anomalies = [];
  for (const sess of sessionAnalysis) {
    for (const slot of sess.slots) {
      if (slot.actual.actualVx === 0 && slot.role === "primary") {
        anomalies.push({ type: "failure-primary", week: sess.week, day: sess.label, movement: slot.movementName, prescribed: slot.prescribed, actual: slot.actual });
      }
      if (slot.vxDelta != null && Math.abs(slot.vxDelta) >= 2 && slot.role === "primary") {
        anomalies.push({ type: "vx-mismatch", week: sess.week, day: sess.label, movement: slot.movementName, vxDelta: slot.vxDelta, prescribed: slot.prescribed, actual: slot.actual });
      }
    }
  }

  // ── Aggregaatit ──
  // B1 K1 ratifioitu (HANDOFF.md §6 K1, 2026-05-25): totalSessions ja
  // completedSets johdetaan yhdestä rajauksesta (päättyneet blokkiviikot
  // prevBlockSessions, backfill mukana) jaetun _computeTuningCoreAggregates
  // -apufunktion kautta. Sama rajaus generic- ja end-of-cycle-funktioissa.
  const { totalSessions, completedSets } = _computeTuningCoreAggregates(prevBlockSessions, allSets);
  const vxHits = sessionAnalysis.reduce((acc, s) => {
    for (const slot of s.slots) {
      if (slot.prescribed.vx != null && slot.actual.actualVx != null) {
        acc.total++;
        // Hit: actual within ±1 of target
        if (Math.abs(slot.vxDelta || 0) <= 1) acc.hits++;
      }
    }
    return acc;
  }, { hits: 0, total: 0 });
  const aggregates = {
    totalSessions,
    completedSets,
    vxHitRate: vxHits.total > 0 ? Math.round((vxHits.hits / vxHits.total) * 100) : null,
    failureCount: anomalies.filter(a => a.type === "failure-primary").length,
  };

  // v4.34.28: deltaPctBase per blokki-vk + decisionTraces-yhteenveto (cowork-audit kohta 1.1).
  // AI ei voi nyt nähdä mitkä engine-säännöt rajoittivat blokkia → suosittelee jo-rajattuja
  // muutoksia "stagnaation korjaukseksi". Korjaus: lisää frequency-aggregaatti per rule-id.
  const blockDeltaPctBase = block.prevWeeks.map(w => {
    const wd = mesocycle.weekDefs?.find(wd => wd.week === w);
    return { week: w, deltaPctBase: wd?.deltaPctBase ?? null, label: wd?.label || null,
             heavyReps: wd?.heavyReps ?? null, heavyTargetVx: wd?.heavyTargetVx ?? null };
  });
  // Trace-frequency aggregointi (kerää rule-id-laskurit blokin sessioista)
  // B3 K3: tyhjä-status-encoding. Jos decisionTraces puuttuu ctx:stä
  // kokonaan → not-implemented (rehellisesti todettavissa); jos saatavilla
  // mutta tyhjä → empty (decisionTrace:eja ei kirjattu). data-tila pysyy
  // taulukkona.
  const blockSessionIds = new Set(prevBlockSessions.map(s => s.sessionId));
  const blockTraces = (decisionTraces || []).filter(t => {
    // recId-yhteys session:iin — käytä recId:n associated rec:in dateISO:ta jos saatavilla
    return t.recId; // hyväksy kaikki — filter on best-effort
  });
  const traceFrequency = {};
  for (const t of blockTraces) {
    if (!t.ruleId) continue;
    traceFrequency[t.ruleId] = (traceFrequency[t.ruleId] || 0) + 1;
  }
  const traceFrequencySorted = Object.entries(traceFrequency)
    .sort((a, b) => b[1] - a[1])
    .map(([ruleId, count]) => ({ ruleId, count }));
  let engineRuleFrequency;
  if (decisionTraces === undefined || decisionTraces === null) {
    engineRuleFrequency = { status: "not-implemented", reason: "decisionTraces ei saatavilla ctx:ssä" };
  } else if (traceFrequencySorted.length === 0) {
    engineRuleFrequency = { status: "empty", reason: "ei kirjattuja decisionTrace:eja tällä blokilla" };
  } else {
    engineRuleFrequency = traceFrequencySorted;
  }

  // ── Seuraavan blokin prescribed ──
  // β H-001 B2/A2: normalisoi slot.note loadPct:n pohjalla — AI Block Tuning
  // -syötteen JSON + markdown + prompt -puolelle. data.js-templaatti pysyy
  // ennallaan (HANDOFF.md §3 scope-aita).
  const wp = mesocycle.weekPlans || [];
  const nextBlockPrescribed = block.nextWeeks.map(nw => {
    const wkPlan = wp[nw - 1];
    if (!wkPlan?.days) return null;
    return {
      week: nw,
      days: wkPlan.days.map(d => ({
        label: d.label,
        primary: _normalizeSlotForTuningSerialization((d.slots || []).find(s => s.role === "primary")),
        backoff: _normalizeSlotForTuningSerialization((d.slots || []).find(s => s.role === "backoff")),
        topSet: _normalizeSlotForTuningSerialization((d.slots || []).find(s => s.role === "secondary" || s.role === "calibration")),
      })),
    };
  }).filter(Boolean);

  // ── Kuluvan (deload-) viikon kalibrointitreenit ──
  // β H-001 B5/A6 (HANDOFF.md §6 K4(a) ratifioitu 2026-05-25): kerää
  // käynnissä olevan vk N (deload) cal-setit ai-syötteen omaan kenttään.
  // Filtteri: session vk N (via getMesocycleWeek + dateISO) JA
  // setRole === "calibration" (kanoninen pattern engine.js:n 16
  // esiintymässä; asetetaan workout-save:ssa index.html:14042-14044).
  // Sortattu dateISO:n + timestamp:n mukaan. EI data.js-skeematarvetta
  // (K4-skannaus 2026-05-25 todisti). completedBlock.weeks pysyy [1,2,3]
  // (§5 kohta 3 vaihtoehto b: additiivinen kenttä syötteen JUUREEN).
  const currentWeekSessionIds = new Set(
    (sessions || []).filter(s => getMesocycleWeek(mesocycle, s.dateISO) === wk).map(s => s.sessionId)
  );
  const currentWeekCalibrationSetsArr = (allSets || [])
    .filter(s => s.setRole === "calibration" && currentWeekSessionIds.has(s.sessionId))
    .sort((a, b) => (a.timestamp || a.dateISO || "").localeCompare(b.timestamp || b.dateISO || ""));
  // B5 tyhjä-tapaus: B3-tyylinen status-encoding. Tyhjä on legitiimi
  // (atletti ei vielä tehnyt cal-sessiota deload-viikolla → kysyy AI:lta
  // ohjelmointia ennen cal-sessiota), ei rikkinäinen pipeline.
  const currentWeekCalibrationSets = currentWeekCalibrationSetsArr.length > 0
    ? currentWeekCalibrationSetsArr
    : { status: "empty", reason: `ei kalibrointitreenejä kuluvalla vk ${wk}:lla` };

  // ── H-006a-fix3 (2026-05-27): laajennettu konteksti vk 5/6/9/10/13/14 ──
  // Aktivointi-ikkuna (H-005 B1: vk 4-6, 8-10, 12-14) sisältää myös vk 5+
  // -tilanteet, joissa block.prevWeeks = [1,2,3] ei riitä — atletti odottaa
  // että vk 4 deload-kalibrointi ja vk 5+ tähän mennessä kerätty data ovat
  // analyysissä mukana. Aiempi syöte jätti nämä pois (Akseli huomasi 2026-05-27).
  //
  // lastDeloadWeek: vk 4/8/12 sessiot + cal-setit (additiivinen, ei muuta
  //                 completedBlock-osiota).
  // currentBlockProgress: vk 5..wk sessiot (block.nextWeeks-alueelta tähän
  //                       mennessä) — antaa AI:lle näkemän strength-blokin
  //                       alkuun jo tehdyistä treeneistä.
  const deloadWeekInWindow = block.weeks.find(w => w === 4 || w === 8 || w === 12);
  let lastDeloadWeek = null;
  if (deloadWeekInWindow) {
    const dlSessions = (sessions || []).filter(s =>
      getMesocycleWeek(mesocycle, s.dateISO) === deloadWeekInWindow
    ).sort((a, b) => (a.dateISO || "").localeCompare(b.dateISO || ""));
    const dlSessionIds = new Set(dlSessions.map(s => s.sessionId));
    const dlCalSets = (allSets || []).filter(s =>
      s.setRole === "calibration" && dlSessionIds.has(s.sessionId)
    );
    // v4.52.16 H-007 B4 (A5): HRV-baseline deload-vk:n referenssistä.
    // Käytä deload-vk:n viimeistä sessio-päivää referenssinä (= deload-vk:n
    // päättymispiste), jotta computeHrvBaseline:n rolling-7-ikkuna kattaa
    // deload-vk:n aikaisemmat HRV-syötteet.
    const dlReferenceDate = dlSessions.length > 0
      ? dlSessions[dlSessions.length - 1].dateISO
      : new Date().toISOString().slice(0, 10);
    const dlHrvBaseline = computeHrvBaseline(measurements, dlReferenceDate);
    lastDeloadWeek = {
      week: deloadWeekInWindow,
      sessions: dlSessions.map(s => ({
        sessionId: s.sessionId, dateISO: s.dateISO, label: s.label || null, dayType: s.dayType || null,
      })),
      calibrationSets: dlCalSets.length > 0
        ? dlCalSets
        : { status: "empty", reason: `ei kalibrointitreenejä deload-vk ${deloadWeekInWindow}` },
      hrvBaseline: dlHrvBaseline,
    };
  }

  const cbpSessionsArr = (sessions || []).filter(s => {
    const sw = getMesocycleWeek(mesocycle, s.dateISO);
    return block.nextWeeks.includes(sw) && sw <= wk;
  }).sort((a, b) => (a.dateISO || "").localeCompare(b.dateISO || ""));
  const cbpFirstWeek = block.nextWeeks[0];
  // v4.52.16 H-007 B4 (A5): HRV-trend recent-7 vs historical-7 currentBlock:n
  // referenssistä. Käytä viimeistä cbpSession-päivää tai nyt-päivää
  // referenssinä — annettavan kuvan käynnissä olevan blokin alkuun jo
  // havaitusta HRV-trendistä.
  const cbpReferenceDate = cbpSessionsArr.length > 0
    ? cbpSessionsArr[cbpSessionsArr.length - 1].dateISO
    : new Date().toISOString().slice(0, 10);
  const cbpHrvTrend = computeHrvBaselineDrift(measurements, cbpReferenceDate);
  const currentBlockProgress = {
    block: block.nextBlock,
    weeks: block.nextWeeks,
    currentWeek: wk,
    sessionsSoFar: cbpSessionsArr.length > 0
      ? cbpSessionsArr.map(s => ({
          sessionId: s.sessionId, dateISO: s.dateISO, label: s.label || null,
          dayType: s.dayType || null,
          week: getMesocycleWeek(mesocycle, s.dateISO),
        }))
      : { status: "empty", reason: `ei vielä tallentuneita treenejä vk ${cbpFirstWeek}-${wk}` },
    hrvTrend: cbpHrvTrend,
  };

  // ── Markdown-narratiivi (atleetille) ──
  const markdown = buildMarkdownNarrative({ profile, block, currentWeek: wk, sessionAnalysis, e1rmTrends, trends, anomalies, aggregates, nextBlockPrescribed, currentWeekCalibrationSets });

  // ── JSON-data (AI:lle) ──
  const json = {
    meta: {
      version: "4.34.0",
      generatedAt: new Date().toISOString(),
      currentWeek: wk,
      blockTransition: `${block.prevBlock} → ${block.nextBlock}`,
    },
    profile,
    completedBlock: {
      name: block.prevBlock,
      weeks: block.prevWeeks,
      sessions: sessionAnalysis,
      e1rmTrends,
      trends,
      anomalies,
      aggregates,
      // v4.34.28: deltaPctBase per vk + engine-rule-frequency (cowork-audit kohta 1.1)
      // B3 K3: engineRuleFrequency on joko taulukko (data) tai status-objekti
      //        ({ status: "empty"|"not-implemented", reason }).
      deltaPctBase: blockDeltaPctBase,
      engineRuleFrequency,
    },
    upcomingBlock: {
      name: block.nextBlock,
      weeks: block.nextWeeks,
      prescribed: nextBlockPrescribed,
    },
    // β H-001 B5/A6 (HANDOFF.md §5 kohta 3 vaihtoehto b): käynnissä olevan
    // vk N (deload) kalibrointitreenit omassa kentässään syötteen JUURESSA.
    // Additiivinen — completedBlock.weeks säilyy [1,2,3], ei sekoita
    // "completed" vs "current"-semantiikkaa.
    currentWeekCalibrationSets,
    // H-006a-fix3 (2026-05-27): vk 4/8/12 deload-data (cal-setit + sessiot)
    // ja vk 5+ tähän mennessä jo tehdyt treenit. Antaa AI:lle täyden kontekstin
    // kun aktivointi-ikkuna laajennettu vk 5-6/9-10/13-14 -alueelle (H-005 B1).
    lastDeloadWeek,
    currentBlockProgress,
    // H-006a A4: per-mittari datavirran tila (velocity / hrv / vara).
    // available / loading / unavailable + n + reason — atletti näkee
    // pipeline-eheyden AI-syötteessä ja UI:ssa (Asetukset-välilehti B4).
    dataSourceStatus: computeDataSourceStatus(allSets, measurements, null),
  };

  // ── AI-prompt (valmis copy-paste) ──
  const prompt = buildAiPrompt({ profile, block, currentWeek: wk, json, markdown });

  return {
    markdown,
    json,
    prompt,
    meta: {
      currentWeek: wk,
      blockTransition: `${block.prevBlock} → ${block.nextBlock}`,
      generatedAt: new Date().toISOString(),
      sessionsAnalyzed: totalSessions,
      anomaliesFound: anomalies.length,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// v4.34.48 — GENERIC AI-BLOCK-TUNING (kaikille ei-streetlifting-mesoille)
// ═══════════════════════════════════════════════════════════════
//
// generateBlockTuningPackage on hardkoodattu streetlifting_16w-mesolle:
// blokki-mappi (foundation/strength/intensity/peaking), kisaliikkeet
// (4 hardkoodattua), block.prevWeeks/nextWeeks. Tämä funktio on yleistys
// MILLE TAHANSA mesotyypille — käyttää weekDef.deltaPctBase < 0 -heuristiikkaa
// deload-tunnistukseen ja löytää primary-liikkeet dynaamisesti weekPlans:sta.
//
// Streetlifting_16w säilyy alkuperäisessä funktiossa (delegoidaan jos type matchaa).

function generateGenericBlockTuningPackage(ctx) {
  // H-006a fix (2026-05-27): measurements lisätty destrukturointiin yhdenmukaistuksena
  // generateBlockTuningPackage:n (r. 6429) kanssa. B3:n yhteydessä r. 7104 lisäsi
  // computeDataSourceStatus(allSets, measurements, null)-kutsun joka viittasi
  // destrukturoimattomaan muuttujaan → ReferenceError tukehdutti runTests:n
  // selain-yksikkötesteissä (diagnostiikka E+B tunnisti 2026-05-27).
  const { mesocycle, sessions, allSets, measurements, prs, currentWeekNum, settings, movements } = ctx;
  // v4.52.19 H-011 P1b (JS1): movementId → movementName -resoluutio (sama kuvio
  // kuin generateBlockTuningPackage). Setit kantavat movementId:n, ei movementName.
  const _idToName = {};
  for (const m of (movements || [])) { if (m && m.movementId) _idToName[m.movementId] = m.name; }
  const _movName = (set) => set.movementName ?? _idToName[set.movementId] ?? null;

  if (!mesocycle) {
    return { error: "AI-Block-Tuning vaatii aktiivisen mesosyklin." };
  }
  // Streetlifting_16w käyttää alkuperäistä funktiota — ei tätä
  if (mesocycle.type === "streetlifting_16w") {
    return generateBlockTuningPackage(ctx);
  }

  const wk = currentWeekNum;
  const weekDefs = mesocycle.weekDefs || [];
  const weekDef = weekDefs.find(w => w.week === wk);

  // Deload-tunnistus: viikon deltaPctBase < 0
  if (!weekDef || weekDef.deltaPctBase >= 0) {
    const nextDeload = weekDefs.find(w => w.week > wk && w.deltaPctBase < 0);
    return {
      error: nextDeload
        ? `AI-Block-Tuning aktivoituu deload-viikoilla. Olet vk ${wk}. Seuraava deload: vk ${nextDeload.week}.`
        : `AI-Block-Tuning aktivoituu deload-viikoilla. Olet vk ${wk}. Tässä mesosyklissä ei ole tulevia deload-viikkoja.`,
    };
  }

  // Edellinen blokki = viikot ennen tätä deloadia, alkaen edellisestä deloadista (tai 1)
  const prevDeloads = weekDefs.filter(w => w.week < wk && w.deltaPctBase < 0).map(w => w.week);
  const blockStart = prevDeloads.length > 0 ? prevDeloads[prevDeloads.length - 1] + 1 : 1;
  const prevWeeks = [];
  for (let w = blockStart; w < wk; w++) prevWeeks.push(w);

  // Tuleva blokki = viikot tämän deloadin jälkeen, ennen seuraavaa deloadia (tai loppuun)
  const nextDeloads = weekDefs.filter(w => w.week > wk && w.deltaPctBase < 0).map(w => w.week);
  const blockEnd = nextDeloads.length > 0 ? nextDeloads[0] - 1 : (mesocycle.weekCount || wk);
  const nextWeeks = [];
  for (let w = wk + 1; w <= blockEnd; w++) nextWeeks.push(w);

  const blockLabel = prevWeeks.length > 0 ? `Vk ${prevWeeks[0]}-${prevWeeks[prevWeeks.length - 1]}` : `Vk ${wk}`;
  const nextBlockLabel = nextWeeks.length > 0 ? `Vk ${nextWeeks[0]}-${nextWeeks[nextWeeks.length - 1]}` : "Mesosykli päättyy";

  // Atleettiprofile
  const movementCfg = mesocycle.movementCfg || {};
  const bw = settings?.bodyweightKg || 80;
  const profile = {
    bw,
    weekCount: mesocycle.weekCount || 4,
    mesocycleType: mesocycle.type,
    movementCfg,
    cfgDriftHistory: (mesocycle.cfgDriftHistory || [])
      .filter(d => prevWeeks.includes(getMesocycleWeek(mesocycle, d.dateISO))),
    prs: (prs || []).map(p => ({ movement: p.movementName, value: p.value, dateISO: p.dateISO, context: p.context })),
  };

  // Edellisen blokin sessio-data
  const prevBlockSessions = (sessions || []).filter(s => {
    const sw = getMesocycleWeek(mesocycle, s.dateISO);
    return prevWeeks.includes(sw);
  }).sort((a, b) => (a.dateISO || "").localeCompare(b.dateISO || ""));

  // H-006a A2: precompute RTF-model per movementId AI-Block-Tuning-syötettä varten.
  const rtfModelMap = _buildRtfModelMap(allSets || []);
  const sessionAnalysis = prevBlockSessions.map(sess => {
    const sessSets = (allSets || []).filter(set => set.sessionId === sess.sessionId);
    const sw = getMesocycleWeek(mesocycle, sess.dateISO);
    const slots = sessSets.map(set => ({
      movementName: _movName(set), // H-011 P1b (JS1): resolvoi movementId → nimi
      role: set.setRole,
      prescribed: { reps: set.targetReps, vx: set.targetVx, loadKg: set.targetLoadKg, loadPct: set.targetLoadPct },
      actual: {
        reps: set.reps,
        actualVx: set.actualVx,
        loadKg: set.externalLoadKg,
        velocity: set.velocityMs ?? set.velocityMean ?? null,
        velocityRep1: set.velocityRep1 ?? null,
        velocityLossPercent: set.velocityLossPercent ?? null,
        mvRepsCount: Array.isArray(set.mvReps) ? set.mvReps.length : 0,
        rtfModelStatus: rtfModelMap[set.movementId] || { status: "no-data", n: 0, r2: null },
      },
      vxDelta: (set.targetVx != null && set.actualVx != null) ? (set.targetVx - set.actualVx) : null,
    }));
    return { week: sw, dateISO: sess.dateISO, label: sess.label, dayType: sess.dayType, slots };
  });

  // Etsi uniikit primary-liikkeet weekPlans:sta dynaamisesti
  const primaryMovements = new Set();
  for (const wp of (mesocycle.weekPlans || [])) {
    for (const d of (wp.days || [])) {
      for (const slot of (d.slots || [])) {
        if (slot.role === "primary" && slot.defaultMovementName) {
          primaryMovements.add(slot.defaultMovementName);
        }
      }
    }
  }

  // e1RM-trendit per primary-liike (käyttää e1rmAccessory:ia — generic, ei BW-laskua)
  let e1rmTrends = {};
  for (const liftName of primaryMovements) {
    const liftSets = (allSets || []).filter(set => _movName(set) === liftName && set.externalLoadKg > 0); // H-011 P1b (JS1)
    if (liftSets.length === 0) continue;
    const sortedSets = liftSets.sort((a, b) => (a.timestamp || a.dateISO || "").localeCompare(b.timestamp || b.dateISO || ""));
    const dataPoints = sortedSets.slice(-12).map(s => {
      const vara = s.actualVx ?? s.targetVx ?? 1;
      const e1rm = e1rmAccessory(s.externalLoadKg || 0, s.reps || 1, vara);
      return { dateISO: s.dateISO, e1rm: Math.round(e1rm * 10) / 10, load: s.externalLoadKg, reps: s.reps, vx: s.actualVx };
    });
    if (dataPoints.length >= 2) {
      const first = dataPoints[0].e1rm;
      const latest = dataPoints[dataPoints.length - 1].e1rm;
      const deltaPct = first > 0 ? ((latest - first) / first) * 100 : 0;
      e1rmTrends[liftName] = { first, latest, deltaPct: Math.round(deltaPct * 10) / 10, dataPoints };
    }
  }
  // B3 K3: tyhjä-status-encoding generic-funktiossa (sama logiikka kuin
  // streetlifting_16w:ssä). Generic ei käytä measurements-trendejä eikä
  // engineRuleFrequency-kenttää JSON-output:issa, joten vain e1rmTrends
  // ja anomalies ovat scope:ssa.
  if (Object.keys(e1rmTrends).length === 0) {
    e1rmTrends = { status: "empty", reason: "ei primary-liike-settejä ≥ 2 datapointilla tällä blokilla" };
  }

  // Anomaliat
  // B3 K3: anomalies pysyy taulukkona aina (kts. streetlifting_16w-kommentti).
  const anomalies = [];
  for (const sess of sessionAnalysis) {
    for (const slot of sess.slots) {
      if (slot.actual.actualVx === 0 && slot.role === "primary") {
        anomalies.push({ type: "failure-primary", week: sess.week, day: sess.label, movement: slot.movementName, prescribed: slot.prescribed, actual: slot.actual });
      }
      if (slot.vxDelta != null && Math.abs(slot.vxDelta) >= 2 && slot.role === "primary") {
        anomalies.push({ type: "vx-mismatch", week: sess.week, day: sess.label, movement: slot.movementName, vxDelta: slot.vxDelta, prescribed: slot.prescribed, actual: slot.actual });
      }
    }
  }

  // B1 K1 ratifioitu (HANDOFF.md §6 K1, 2026-05-25): yhtenäinen rajaus
  // jaetun _computeTuningCoreAggregates-apufunktion kautta. Generic-funktion
  // prevBlockSessions on dynaamisesti laskettu prevWeeks-rajauksella (rivi 6598).
  const { totalSessions, completedSets } = _computeTuningCoreAggregates(prevBlockSessions, allSets);
  const vxHits = sessionAnalysis.reduce((acc, s) => {
    for (const slot of s.slots) {
      if (slot.prescribed.vx != null && slot.actual.actualVx != null) {
        acc.total++;
        if (Math.abs(slot.vxDelta || 0) <= 1) acc.hits++;
      }
    }
    return acc;
  }, { hits: 0, total: 0 });
  const aggregates = {
    totalSessions, completedSets,
    vxHitRate: vxHits.total > 0 ? Math.round((vxHits.hits / vxHits.total) * 100) : null,
    failureCount: anomalies.filter(a => a.type === "failure-primary").length,
  };

  // Markdown-narratiivi
  const lines = [];
  lines.push(`# AI-Block-Tuning -analyysi (${mesocycle.type}, vk ${wk} deload)`);
  lines.push("");
  lines.push(`**Generoitu**: ${new Date().toLocaleDateString("fi-FI")}`);
  lines.push(`**Mesosykli**: ${mesocycle.type}, vk ${wk}/${profile.weekCount}`);
  lines.push(`**Atleettiprofile**: ${profile.bw} kg bw`);
  if (Object.keys(movementCfg).length > 0) {
    lines.push(`**Kalibrointi (1RM-arviot)**:`);
    for (const [name, cfg] of Object.entries(movementCfg)) {
      lines.push(`  - ${name}: ${cfg.e1rmExternal} kg`);
    }
  }
  lines.push("");
  lines.push(`## Edellisen blokin yhteenveto (${blockLabel})`);
  lines.push("");
  lines.push(`- Sessioita kirjattu: **${aggregates.totalSessions}**`);
  lines.push(`- Sarjoja yhteensä: **${aggregates.completedSets}**`);
  if (aggregates.vxHitRate != null) lines.push(`- Vx-target-hit-rate (±1): **${aggregates.vxHitRate}%**`);
  lines.push(`- Failure-tapauksia (V0 primary): **${aggregates.failureCount}**`);
  lines.push("");

  // B3 K3: tyhjä-status-encoding markdown:ssa (sama logiikka kuin
  // buildMarkdownNarrative:ssa). Tarkista .status ennen Object.entries-iterointia.
  if (_isTrendEmptyStatus(e1rmTrends)) {
    lines.push("### e1RM-trendit per päälike");
    lines.push("");
    lines.push(`*${_formatTrendStatusFi(e1rmTrends)}*`);
    lines.push("");
  } else if (Object.keys(e1rmTrends).length > 0) {
    lines.push("### e1RM-trendit per päälike");
    lines.push("");
    lines.push("| Liike | Lähtö | Loppu | Δ% |");
    lines.push("|---|---|---|---|");
    for (const [name, t] of Object.entries(e1rmTrends)) {
      const arrow = t.deltaPct > 0 ? "📈" : t.deltaPct < 0 ? "📉" : "→";
      lines.push(`| ${name} | ${t.first} kg | ${t.latest} kg | ${arrow} ${t.deltaPct >= 0 ? "+" : ""}${t.deltaPct}% |`);
    }
    lines.push("");
  }

  if (profile.cfgDriftHistory && profile.cfgDriftHistory.length > 0) {
    lines.push("### Engine oppi tämän blokin aikana (CFG-DRIFT)");
    lines.push("");
    for (const d of profile.cfgDriftHistory) {
      lines.push(`- ${d.dateISO}: ${d.movName} ${d.fromCfg?.toFixed(1) || '?'} → **${d.toCfg?.toFixed(1)} kg** (+${(d.driftPct*100).toFixed(1)}%)`);
    }
    lines.push("");
  }

  if (anomalies.length > 0) {
    lines.push("### Anomaliat / risk-flags");
    lines.push("");
    for (const a of anomalies.slice(0, 8)) {
      if (a.type === "failure-primary") {
        lines.push(`- 🔴 **Failure (V0)** vk ${a.week}: ${a.movement} prescribed Vx${a.prescribed.vx}`);
      } else if (a.type === "vx-mismatch") {
        const direction = a.vxDelta > 0 ? "raskaampaa" : "kevyempää";
        lines.push(`- ⚠️ **Vx-mismatch** vk ${a.week}: ${a.movement} target Vx${a.prescribed.vx}, actual V${a.actual.actualVx} (${direction} kuin target)`);
      }
    }
    lines.push("");
  }

  // ── Kuluvan (deload-) viikon kalibrointitreenit ──
  // β H-001 B5/A6 (HANDOFF.md §6 K4(a) ratifioitu 2026-05-25): kerää
  // käynnissä olevan vk N (deload) cal-setit. Sama logiikka kuin
  // streetlifting_16w-funktiossa.
  const genCurrentWeekSessionIds = new Set(
    (sessions || []).filter(s => getMesocycleWeek(mesocycle, s.dateISO) === wk).map(s => s.sessionId)
  );
  const genCurrentWeekCalibrationSetsArr = (allSets || [])
    .filter(s => s.setRole === "calibration" && genCurrentWeekSessionIds.has(s.sessionId))
    .sort((a, b) => (a.timestamp || a.dateISO || "").localeCompare(b.timestamp || b.dateISO || ""));
  const currentWeekCalibrationSets = genCurrentWeekCalibrationSetsArr.length > 0
    ? genCurrentWeekCalibrationSetsArr
    : { status: "empty", reason: `ei kalibrointitreenejä kuluvalla vk ${wk}:lla` };

  // Markdown: kuluvan vk:n cal-setit (B3-pattern)
  if (_isTrendEmptyStatus(currentWeekCalibrationSets)) {
    lines.push("### Käynnissä oleva viikko — kalibrointitreenit");
    lines.push("");
    lines.push(`*${_formatTrendStatusFi(currentWeekCalibrationSets)}*`);
    lines.push("");
  } else if (Array.isArray(currentWeekCalibrationSets) && currentWeekCalibrationSets.length > 0) {
    lines.push("### Käynnissä oleva viikko — kalibrointitreenit");
    lines.push("");
    lines.push("| Päivä | Liike | Kuorma | Reps | Vx |");
    lines.push("|---|---|---|---|---|");
    for (const s of currentWeekCalibrationSets) {
      lines.push(`| ${s.dateISO || "?"} | ${s.movementName || "?"} | ${s.externalLoadKg ?? "?"} kg | ${s.reps ?? "?"} | V${s.actualVx ?? "?"} |`);
    }
    lines.push("");
  }

  lines.push(`## Tuleva blokki (${nextBlockLabel})`);
  lines.push("");
  lines.push(nextWeeks.length > 0
    ? `${nextWeeks.length} viikkoa, alkaa vk ${nextWeeks[0]}.`
    : "Tämä on viimeinen deload — mesosykli päättyy.");
  lines.push("");

  const markdown = lines.join("\n");

  // JSON
  const json = {
    meta: {
      version: "4.34.48",
      generatedAt: new Date().toISOString(),
      mesocycleType: mesocycle.type,
      currentWeek: wk,
      blockLabel,
      nextBlockLabel,
    },
    profile,
    completedBlock: {
      label: blockLabel, weeks: prevWeeks,
      sessions: sessionAnalysis, e1rmTrends, anomalies, aggregates,
    },
    upcomingBlock: { label: nextBlockLabel, weeks: nextWeeks },
    // β H-001 B5/A6: käynnissä olevan vk N cal-setit syötteen JUURESSA.
    currentWeekCalibrationSets,
    // H-006a A4: per-mittari datavirran tila (velocity / hrv / vara).
    dataSourceStatus: computeDataSourceStatus(allSets, measurements, null),
  };

  // AI-prompt (yleinen versio, ei streetlifting-spesifi)
  const prompt = [
    `# AI-Block-Tuning analyysipyyntö`,
    ``,
    `Olet voimaharjoittelu-coach jolla on syvä ymmärrys progressiivisesta`,
    `ylikuormituksesta, periodisaatiosta ja autoregulaatiosta. Atletti on`,
    `juuri suorittanut deload-viikon ${mesocycle.type}-mesosyklissä ja siirtyy`,
    `seuraavaan blokkiin. Analysoi alla oleva data.`,
    ``,
    `## ATLETIN MESOSYKLI`,
    `Tyyppi: ${mesocycle.type}, ${profile.weekCount} viikkoa`,
    `Suoritettu blokki: ${blockLabel}`,
    `Tuleva blokki: ${nextBlockLabel}`,
    `Bodyweight: ${profile.bw} kg`,
    Object.keys(movementCfg).length > 0
      ? `\n### Kalibrointi (1RM-arviot)\n${Object.entries(movementCfg).map(([n, c]) => `- ${n}: ${c.e1rmExternal} kg`).join("\n")}`
      : "",
    ``,
    `## EDELLISEN BLOKIN DATA`,
    `\`\`\`json`,
    JSON.stringify(json.completedBlock, null, 2),
    `\`\`\``,
    ``,
    `## VASTAUKSESI MUOTO`,
    ``,
    `LeVe AI tech stack: vanilla JavaScript (.js / .mjs), IndexedDB, PWA service worker — EI TypeScriptiä. Älä oleta src/-polkuja tai .ts/.tsx-tiedostoja \`claudeCodePromptHint\`-kentissä.`,
    ``,
    `Cross-ref-slot voi kantaa \`refScale\` ja \`nominalLoadPct\` -kentät. Tällöin \`loadPct\` on jo skaalattu (\`= nominalLoadPct × refScale\`) ja note's \`@\`-pct viittaa nominaaliin viiteliikkeen 1RM-suhteessa (\`loadPctReferenceMovementName\`).`,
    ``,
    `Käytä \`currentWeekCalibrationSets\`-kenttää (syötteen juuressa) kalibrointi-evidenssinä jos saatavilla — atletti on suorittanut käynnissä olevan deload-viikon kalibrointitreenit. Jos status="empty", kalibrointi on vielä tekemättä → baseline tulee \`completedBlock.e1rmTrends\`:istä.`,
    ``,
    `Aktivointi-ikkuna (vk 4-6, 8-10, 12-14) tuottaa kolme tasoa: (1) \`completedBlock\` = juuri päättynyt blokki (esim. Foundation vk 1-3), (2) \`lastDeloadWeek\` = vk 4/8/12 sessiot + cal-setit (transition-viikon kalibrointi-evidenssi), (3) \`currentBlockProgress\` = uusi blokki tähän mennessä (esim. Strength vk 5..wk jos olet vk 5-6:lla). Käytä KAIKKIA kolmea tasoa: completedBlock kertoo MITÄ päättyi, lastDeloadWeek kertoo MITEN deload meni (palautuiko atletti, näkyikö velocity-trendi nousussa), currentBlockProgress kertoo MITÄ uudessa blokissa on jo nähty (sopeutuvatko Strength-painot, miten Vx-tavoitteita kannattaa muokata).`,
    ``,
    `Anna 3 kategoriassa:`,
    `(A) **Sovellus-tason muutokset**: mitä atletti voi tehdä UI:ssa nyt`,
    `(B) **Rakenteelliset muutokset**: koodi-muutosehdotukset seuraavalle blokille`,
    `(C) **Mentaalinen koutsaus**: tekniikkavinkit, palautuminen, riskimanagement`,
    ``,
    `Älä myöntäile — jos blokki-toteutus oli puutteellinen, sano se rehellisesti.`,
  ].filter(Boolean).join("\n");

  return {
    markdown, json, prompt,
    meta: {
      mesocycleType: mesocycle.type,
      currentWeek: wk,
      blockLabel, nextBlockLabel,
      generatedAt: new Date().toISOString(),
      sessionsAnalyzed: totalSessions,
      anomaliesFound: anomalies.length,
    },
  };
}

function buildMarkdownNarrative({ profile, block, currentWeek, sessionAnalysis, e1rmTrends, trends, anomalies, aggregates, nextBlockPrescribed, currentWeekCalibrationSets }) {
  const lines = [];
  lines.push(`# AI-Block-Tuning -analyysi — ${block.prevBlock} → ${block.nextBlock} (vk ${currentWeek})`);
  lines.push("");
  lines.push(`**Generoitu**: ${new Date().toLocaleDateString("fi-FI")}`);
  lines.push(`**Mesosykli**: streetlifting_16w, vk ${currentWeek}/16`);
  lines.push(`**Atleettiprofile**: ${profile.bw} kg bw, K=${profile.calibration.kyykkyExtKg} kg, L=${profile.calibration.leukaExtKg} kg, D=${profile.calibration.dippiExtKg} kg`);
  lines.push("");

  lines.push(`## Edellisen blokin yhteenveto (${block.prevBlock}, vk ${block.prevWeeks.join("-")})`);
  lines.push("");
  lines.push(`- Sessioita kirjattu: **${aggregates.totalSessions}**`);
  lines.push(`- Sarjoja yhteensä: **${aggregates.completedSets}**`);
  if (aggregates.vxHitRate != null) {
    lines.push(`- Vx-target-hit-rate (±1): **${aggregates.vxHitRate}%**`);
  }
  lines.push(`- Failure-tapauksia (V0 primary): **${aggregates.failureCount}**`);
  lines.push("");

  // B3 K3: tyhjä-status-encoding. Tarkista .status ENNEN Object.keys/entries-
  // iterointia (e1rmTrends voi olla { status: "empty", reason } eikä { Liike: {...} }).
  if (_isTrendEmptyStatus(e1rmTrends)) {
    lines.push("### e1RM-trendit per kisaliike");
    lines.push("");
    lines.push(`*${_formatTrendStatusFi(e1rmTrends)}*`);
    lines.push("");
  } else if (Object.keys(e1rmTrends).length > 0) {
    lines.push("### e1RM-trendit per kisaliike");
    lines.push("");
    lines.push("| Liike | Lähtö | Loppu | Δ% |");
    lines.push("|---|---|---|---|");
    for (const [name, t] of Object.entries(e1rmTrends)) {
      const arrow = t.deltaPct > 0 ? "📈" : t.deltaPct < 0 ? "📉" : "→";
      lines.push(`| ${name} | ${t.first} kg | ${t.latest} kg | ${arrow} ${t.deltaPct >= 0 ? "+" : ""}${t.deltaPct}% |`);
    }
    lines.push("");
  }

  // v4.34.43: cfg-drift-historia tämän blokin sisällä — näkyvyys siihen miten
  // engine on oppinut atletin todellisen kapasiteetin (cfg-baseline-päivitykset).
  if (profile.cfgDriftHistory && profile.cfgDriftHistory.length > 0) {
    lines.push("### CFG-DRIFT (engine on oppinut tämän blokin aikana)");
    lines.push("");
    lines.push("| Päivä | Liike | Cfg ennen | Cfg jälk. | Δ% | Signaali | Counter |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const d of profile.cfgDriftHistory) {
      lines.push(`| ${d.dateISO} | ${d.movName} | ${d.fromCfg?.toFixed(1) || '?'} kg | ${d.toCfg?.toFixed(1)} kg | +${(d.driftPct*100).toFixed(1)}% | ${d.signal} | ${d.counter} |`);
    }
    lines.push("");
    lines.push("*CFG-drift = engine päivittää cfg-baseline-arvoa kun atletti toistuvasti ylittää engineen syötettyjen perusteella laskettuja targetia. Velocity-signaali (primer-MPV-trend) priorisoidaan Vx-overshoot-signaalin yli kun riittävästi velocity-mittauksia (n ≥ 5).*");
    lines.push("");
  }

  // B3 K3: per-mittari tyhjä-status näytetään eksplisiittisesti (ei skipata
  // hiljaa kuten ennen). data-tila pysyy taulukkona; tyhjä-tila on
  // { status, reason } -objekti.
  const hrvIsStatus = _isTrendEmptyStatus(trends.hrv);
  const mpvIsStatus = _isTrendEmptyStatus(trends.mpv);
  const bwIsStatus = _isTrendEmptyStatus(trends.bodyweight);
  const hrvHasData = !hrvIsStatus && Array.isArray(trends.hrv) && trends.hrv.length > 0;
  const mpvHasData = !mpvIsStatus && Array.isArray(trends.mpv) && trends.mpv.length > 0;
  const bwHasData = !bwIsStatus && Array.isArray(trends.bodyweight) && trends.bodyweight.length > 0;
  if (hrvHasData || mpvHasData || bwHasData || hrvIsStatus || mpvIsStatus || bwIsStatus) {
    lines.push("### Recovery-/mittari-trendit");
    lines.push("");
    if (hrvHasData) {
      const hrvFirst = trends.hrv[0].value, hrvLast = trends.hrv[trends.hrv.length - 1].value;
      const hrvDelta = hrvFirst > 0 ? Math.round(((hrvLast - hrvFirst) / hrvFirst) * 1000) / 10 : 0;
      lines.push(`- **HRV**: ${trends.hrv.length} mittausta, ${hrvFirst.toFixed(1)} → ${hrvLast.toFixed(1)} (${hrvDelta >= 0 ? "+" : ""}${hrvDelta}%)`);
    } else if (hrvIsStatus) {
      lines.push(`- **HRV**: *${_formatTrendStatusFi(trends.hrv)}*`);
    }
    if (mpvHasData) {
      const mpvFirst = trends.mpv[0].value, mpvLast = trends.mpv[trends.mpv.length - 1].value;
      const mpvDelta = mpvFirst > 0 ? Math.round(((mpvLast - mpvFirst) / mpvFirst) * 1000) / 10 : 0;
      lines.push(`- **MPV** (yläraaja-readiness): ${trends.mpv.length} mittausta, ${mpvFirst.toFixed(2)} → ${mpvLast.toFixed(2)} m/s (${mpvDelta >= 0 ? "+" : ""}${mpvDelta}%)`);
    } else if (mpvIsStatus) {
      lines.push(`- **MPV** (yläraaja-readiness): *${_formatTrendStatusFi(trends.mpv)}*`);
    }
    if (bwHasData) {
      const bwFirst = trends.bodyweight[0].value, bwLast = trends.bodyweight[trends.bodyweight.length - 1].value;
      const bwDelta = Math.round((bwLast - bwFirst) * 10) / 10;
      lines.push(`- **Bodyweight**: ${bwFirst} → ${bwLast} kg (${bwDelta >= 0 ? "+" : ""}${bwDelta} kg)`);
    } else if (bwIsStatus) {
      lines.push(`- **Bodyweight**: *${_formatTrendStatusFi(trends.bodyweight)}*`);
    }
    lines.push("");
  }

  if (anomalies.length > 0) {
    lines.push("### Anomaliat / risk-flags");
    lines.push("");
    for (const a of anomalies.slice(0, 8)) {
      if (a.type === "failure-primary") {
        lines.push(`- 🔴 **Failure (V0)** vk ${a.week} ${a.day}: ${a.movement} prescribed Vx${a.prescribed.vx}, actual V0 — paino oli liian raskas`);
      } else if (a.type === "vx-mismatch") {
        const direction = a.vxDelta > 0 ? "raskaampaa kuin target" : "kevyempää kuin target";
        lines.push(`- ⚠️ **Vx-mismatch** vk ${a.week} ${a.day}: ${a.movement} target Vx${a.prescribed.vx}, actual V${a.actual.actualVx} (${a.vxDelta > 0 ? "+" : ""}${a.vxDelta} delta — ${direction})`);
      }
    }
    lines.push("");
  }

  // B5/A6: kuluvan (deload-) viikon kalibrointitreenit — AI:lle
  // kalibrointi-evidenssinä. data-tila taulukkona, tyhjä-tila status-objekti (B3-pattern).
  if (_isTrendEmptyStatus(currentWeekCalibrationSets)) {
    lines.push(`## Käynnissä oleva viikko (vk ${currentWeek}) — kalibrointitreenit`);
    lines.push("");
    lines.push(`*${_formatTrendStatusFi(currentWeekCalibrationSets)}*`);
    lines.push("");
  } else if (Array.isArray(currentWeekCalibrationSets) && currentWeekCalibrationSets.length > 0) {
    lines.push(`## Käynnissä oleva viikko (vk ${currentWeek}) — kalibrointitreenit`);
    lines.push("");
    lines.push("| Päivä | Liike | Kuorma | Reps | Vx |");
    lines.push("|---|---|---|---|---|");
    for (const s of currentWeekCalibrationSets) {
      lines.push(`| ${s.dateISO || "?"} | ${s.movementName || "?"} | ${s.externalLoadKg ?? "?"} kg | ${s.reps ?? "?"} | V${s.actualVx ?? "?"} |`);
    }
    lines.push("");
  }

  lines.push(`## Seuraava blokki (${block.nextBlock}, vk ${block.nextWeeks.join("-")})`);
  lines.push("");
  lines.push("Suunniteltu rakenne (prescribed):");
  lines.push("");
  for (const wk of nextBlockPrescribed) {
    lines.push(`### Vk ${wk.week}`);
    for (const d of wk.days) {
      const p = d.primary;
      const b = d.backoff;
      const t = d.topSet;
      const parts = [];
      if (p) parts.push(`Primary: ${p.defaultMovementName} ${p.sets}×${p.reps} V${p.targetVx} @${Math.round((p.loadPct || 0) * 100)}%`);
      if (b) parts.push(`Backoff: ${b.sets}×${b.reps} @${Math.round((b.loadPct || 0) * 100)}%`);
      if (t) parts.push(`Top: ${t.note || ""}`);
      lines.push(`- ${d.label}: ${parts.join(" | ")}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("**Ohje**: vie tämä paketti Claude AI:lle (Claude.ai) tai ChatGPT:lle. Paste:aa AI-prompt, joka sisältää koko datan + kysymykset. AI palauttaa A/B/C-kategorisoidut suositukset.");
  return lines.join("\n");
}

function buildAiPrompt({ profile, block, currentWeek, json, markdown }) {
  return `KONTEKSTI:
Streetlifter, ${profile.bw} kg bw, 15+ v kokemus.
Mesosykli: streetlifting_16w, currently vk ${currentWeek}/16.
Block-transition: ${block.prevBlock} → ${block.nextBlock}.
Kisapäivä: ${profile.competitionDate}.
Tavoite: takakyykky 200+ kg muscle memory -palautuksena.

PR-historia: ${profile.prs.map(p => `${p.movement} ${p.value} kg (${p.context})`).join(", ") || "ei kirjattu"}

DATA (edellinen blokki + recovery-trendit + anomaliat + seuraava blokki suunniteltuna):

${markdown}

═══════════════════════════════════════════════════════════════════
RAW JSON (tarkka data):
═══════════════════════════════════════════════════════════════════

\`\`\`json
${JSON.stringify(json, null, 2)}
\`\`\`

═══════════════════════════════════════════════════════════════════
TEHTÄVÄ:
═══════════════════════════════════════════════════════════════════

LeVe AI tech stack: vanilla JavaScript (.js / .mjs), IndexedDB, PWA service worker — EI TypeScriptiä. Älä oleta src/-polkuja tai .ts/.tsx-tiedostoja \`claudeCodePromptHint\`-kentissä.

Cross-ref-slot voi kantaa \`refScale\` ja \`nominalLoadPct\` -kentät. Tällöin \`loadPct\` on jo skaalattu (\`= nominalLoadPct × refScale\`) ja note's \`@\`-pct viittaa nominaaliin viiteliikkeen 1RM-suhteessa (\`loadPctReferenceMovementName\`).

Käytä \`currentWeekCalibrationSets\`-kenttää (syötteen juuressa) kalibrointi-evidenssinä jos saatavilla — atletti on suorittanut käynnissä olevan deload-viikon kalibrointitreenit (esim. 92 % × 3 V1 per kisaliike). Nämä antavat tarkimman e1RM-päivityksen seuraavan blokin ohjelmointiin (DiStasio 2014 ±2,7 kg low-rep-alueella). Jos \`currentWeekCalibrationSets.status === "empty"\`, kalibrointi on vielä tekemättä — ohjelmoinnin baseline tulee silloin edellisestä blokista (\`completedBlock.e1rmTrends\`).

Aktivointi-ikkuna (vk 4-6, 8-10, 12-14) tuottaa kolme tasoa: (1) \`completedBlock\` = juuri päättynyt blokki (esim. Foundation vk 1-3), (2) \`lastDeloadWeek\` = vk 4/8/12 sessiot + cal-setit (transition-viikon kalibrointi-evidenssi), (3) \`currentBlockProgress\` = uusi blokki tähän mennessä (esim. Strength vk 5..wk jos olet vk 5-6:lla). Käytä KAIKKIA kolmea tasoa: completedBlock kertoo MITÄ päättyi, lastDeloadWeek kertoo MITEN deload meni (palautuiko atletti, näkyikö velocity-trendi nousussa), currentBlockProgress kertoo MITÄ uudessa blokissa on jo nähty (sopeutuvatko Strength-painot, miten Vx-tavoitteita kannattaa muokata).

Analysoi edellisen blokin (${block.prevBlock}, vk ${block.prevWeeks.join("-")}) suoritus
ja ehdota seuraavan blokin (${block.nextBlock}, vk ${block.nextWeeks.join("-")})
optimointia atleettispesifisesti.

KÄYTÄ:
- Pelland 2024, Refalo 2023, Robinson 2025, Helms 2018, Tuchscherer RTS,
  Israetel JTS/RP, Bruusgaard 2010, Sánchez-Moreno 2017/2020, Plews 2013
- Streetlifting-no-evidence-guard: jos kysymys streetlifting-spesifi
  (SSW/SLRY) ja peer-reviewed-data ei löydy → mainitse eksplisiittisesti

VASTAA TÄSSÄ FORMAATISSA (atleetti vie suositukset eri kategorioihin):

\`\`\`json
{
  "blockExecutionVerdict": {
    "summary": "1-2 lausetta yleisarvio",
    "progressionRate": "actual vs predicted (%)",
    "recoveryStatus": "GREEN | YELLOW | RED",
    "concerns": ["list of risk flags"]
  },

  "categoryA_appOverrides": [
    {
      "type": "movement_swap | load_calibration | bodyweight_update | extra_deload | accessory_drop",
      "details": "exact UI action atleetti tekee",
      "rationale": "1-2 lausetta + sitaatti",
      "priority": "high | medium | low"
    }
  ],

  "categoryB_codeChanges": [
    {
      "type": "loadPct_adjust | sets_reps_adjust | backoff_style | engine_param | new_movement",
      "scope": "vk X-Y, päivä, slot",
      "from": "current value",
      "to": "proposed value",
      "rationale": "perustelut + sitaatti",
      "priority": "high | medium | low",
      "claudeCodePromptHint": "valmis prompt minulle (Claude Code) toteutusta varten"
    }
  ],

  "categoryC_athleteCoaching": [
    {
      "topic": "technique | recovery | mental | nutrition | risk-management",
      "observation": "mitä datasta nähdään",
      "advice": "konkreettinen toiminta atleetille",
      "rationale": "perustelut"
    }
  ],

  "criticalQuestions": [
    "kysymyksiä joihin Claude haluaa atleetin vastaavan ennen finaalin lukitsemista"
  ],

  "citations": [
    "Tekijä Vuosi — relevantti löydös"
  ]
}
\`\`\`

OUTPUT-VAATIMUKSET:
- Ole spesifi (kg, %, sets/reps tarkasti — ei yleistasoisia neuvoja)
- Erottele vakaa konsensus / aktiivinen debate / heuristiikka
- Kategoria B: anna minulle (Claude Code) tarpeeksi tietoa toteutukseen
  ilman lisäkysymyksiä
- Älä ehdota muutoksia jotka ovat jo toteutettu (esim. v4.32.9 M14
  topSingleFirst — tarkista että et päällekkäistä työtä)
- Älä myöntäile — jos block-execution oli puutteellinen, sano se`;
}

// ═══════════════════════════════════════════════════════════════
// END-OF-CYCLE TUNING — v4.34.27 (cowork-arvioinnin kohta 5)
// ═══════════════════════════════════════════════════════════════
//
// generateBlockTuningPackage:n sisko, mutta MESOCYCLE-AGNOSTIC. Kun mesocycle
// lähestyy loppua (viim. 7 päivää tai jo päättynyt), aktivoi kortti Asetuksissa
// joka generoi koko syklin yhteenvedon + ehdotuksen seuraavalle blokille.
//
// Toimii kaikille mesocycle.type-arvoille:
//   - streetlifting_16w: foundation/strength/intensity/peaking-blokit erikseen
//   - default (4 vk): yksi yhtenäinen sykli
//   - peaking, custom, render: vastaavasti yksi sykli
//
// Trigger:
//   - mesocycle.weekCount - currentWeekNum < 1 (viim. viikko, ≤ 7 päivää lopulle)
//   - tai pos?.reason === "after-end" (jo päättynyt)

function generateEndOfCycleTuningPackage(ctx) {
  const { mesocycle, sessions, allSets, measurements, prs, currentWeekNum, settings, decisionTraces, movements } = ctx;
  // v4.52.19 H-011 P1b (JS1): movementId → movementName -resoluutio (sama kuvio).
  const _idToName = {};
  for (const m of (movements || [])) { if (m && m.movementId) _idToName[m.movementId] = m.name; }
  const _movName = (set) => set.movementName ?? _idToName[set.movementId] ?? null;

  if (!mesocycle) {
    return { error: "End-of-Cycle Tuning vaatii aktiivisen mesosyklin." };
  }

  const weekCount = mesocycle.weekCount || 4;
  const wk = currentWeekNum;
  const isFinalWeek = wk !== null && wk >= weekCount;
  const isAfterEnd = wk === null;
  if (!isFinalWeek && !isAfterEnd) {
    const weeksLeft = weekCount - wk;
    return {
      error: `End-of-Cycle Tuning aktivoituu viim. viikolla (≤ 7 pv lopulle). Olet vk ${wk}/${weekCount}, jäljellä ${weeksLeft} vk.`,
    };
  }

  // ── Atleettiprofile ──
  const cal = mesocycle.streetliftingConfig?.calibration || {};
  const bw = settings?.bodyweightKg || 91;
  const profile = {
    bw,
    weekCount,
    mesocycleType: mesocycle.type || "default",
    competitionDate: mesocycle.streetliftingConfig?.competitionDate || null,
    calibration: cal,
    prs: (prs || []).map(p => ({ movement: p.movementName, value: p.value, dateISO: p.dateISO, context: p.context })),
  };

  // ── Koko syklin sessio-data ──
  const cycleSessions = (sessions || []).filter(s => {
    const sw = getMesocycleWeek(mesocycle, s.dateISO);
    return sw !== null && sw >= 1 && sw <= weekCount;
  }).sort((a, b) => (a.dateISO || "").localeCompare(b.dateISO || ""));

  const sessionAnalysis = cycleSessions.map(sess => {
    const sessSets = (allSets || []).filter(set => set.sessionId === sess.sessionId);
    const sw = getMesocycleWeek(mesocycle, sess.dateISO);
    const slots = sessSets.map(set => ({
      movementName: _movName(set), // H-011 P1b (JS1): resolvoi movementId → nimi
      role: set.setRole,
      prescribed: { reps: set.targetReps, vx: set.targetVx, loadKg: set.targetLoadKg, loadPct: set.targetLoadPct },
      actual: { reps: set.reps, actualVx: set.actualVx, loadKg: set.externalLoadKg, velocity: set.velocityMs ?? set.velocityMean ?? null },
      vxDelta: (set.targetVx != null && set.actualVx != null) ? (set.targetVx - set.actualVx) : null,
    }));
    return {
      week: sw, dateISO: sess.dateISO, label: sess.label, dayType: sess.dayType, slots, notes: sess.notes || null,
    };
  });

  // ── e1RM-trendit per päämuovikatselma (mesocycle-agnostic: hae kaikki primary-merkityt) ──
  // Streetlifting_16w käyttää 4 kisaliikettä; muille mesocycleille hae kaikki liikkeet joista on dataa.
  const compLifts = mesocycle.type === "streetlifting_16w"
    ? ["Lisäpainoleuanveto", "Muscle-up", "Lisäpainodippi", "Takakyykky"]
    : Array.from(new Set((allSets || []).filter(s => s.movementName).map(s => s.movementName)))
        .filter(name => {
          const sets = (allSets || []).filter(s => s.movementName === name && s.externalLoadKg > 0);
          return sets.length >= 3; // vähintään 3 settiä että trendi on järkevä
        })
        .slice(0, 6); // max 6 liikettä jotta data ei räjähdä

  let e1rmTrends = {};
  for (const liftName of compLifts) {
    const liftSets = (allSets || []).filter(set => _movName(set) === liftName && set.externalLoadKg > 0); // H-011 P1b (JS1)
    if (liftSets.length === 0) continue;
    const sortedSets = liftSets.sort((a, b) => (a.timestamp || a.dateISO || "").localeCompare(b.timestamp || b.dateISO || ""));
    const dataPoints = sortedSets.slice(-12).map(s => {
      const vara = s.actualVx ?? s.targetVx ?? 1;
      const isBarbell = liftName === "Takakyykky" || liftName === "Etukyykky" ||
                        liftName === "Penkkipunnerrus" || liftName === "Maastaveto" || liftName === "Pystypunnerrus";
      const e1rm = isBarbell
        ? e1rmAccessory(s.externalLoadKg || 0, s.reps || 1, vara)
        : e1rmSystem(bw, s.externalLoadKg || 0, s.reps || 1, vara);
      return { dateISO: s.dateISO, e1rm: Math.round(e1rm * 10) / 10, load: s.externalLoadKg, reps: s.reps, vx: s.actualVx };
    });
    if (dataPoints.length >= 2) {
      const first = dataPoints[0].e1rm;
      const latest = dataPoints[dataPoints.length - 1].e1rm;
      const deltaPct = first > 0 ? ((latest - first) / first) * 100 : 0;
      e1rmTrends[liftName] = { first, latest, deltaPct: Math.round(deltaPct * 10) / 10, dataPoints };
    }
  }
  // B3 K3: tyhjä-status-encoding end-of-cycle-funktiossa.
  if (Object.keys(e1rmTrends).length === 0) {
    e1rmTrends = { status: "empty", reason: "ei primary-liike-settejä ≥ 2 datapointilla koko syklillä" };
  }

  // ── Koko syklin recovery-/mittari-trendit ──
  // B3 K3: per-mittari tyhjä-status-encoding (sama logiikka kuin block-funktiossa).
  const cycleMeasurements = (measurements || []).filter(m => {
    const mw = getMesocycleWeek(mesocycle, m.dateISO);
    return mw !== null && mw >= 1 && mw <= weekCount;
  }).sort((a, b) => (a.dateISO || "").localeCompare(b.dateISO || ""));

  const trends = {
    // v4.52.16 H-007 B1 (A1): m.hrv → m.type === "HRV" && m.value
    hrv: cycleMeasurements.filter(m => m && m.type === "HRV" && m.value != null).map(m => ({ dateISO: m.dateISO, value: m.value })),
    mpv: cycleMeasurements.filter(m => m.mpv != null).map(m => ({ dateISO: m.dateISO, value: m.mpv })),
    // v4.52.19 H-011 P1b (JS2): kanoninen bodyweight-kuvio (sama korjaus kuin 7091).
    bodyweight: cycleMeasurements.filter(m => m && m.type === "bodyweight" && m.value != null).map(m => ({ dateISO: m.dateISO, value: m.value })),
  };
  if (trends.hrv.length === 0) trends.hrv = { status: "empty", reason: "ei HRV-mittauksia tällä syklillä" };
  if (trends.mpv.length === 0) trends.mpv = { status: "empty", reason: "ei MPV-mittauksia tällä syklillä" };
  if (trends.bodyweight.length === 0) trends.bodyweight = { status: "empty", reason: "ei kehonpaino-mittauksia tällä syklillä" };

  // ── Anomaliat (V0 primaryjen failure, Vx-mismatch ±2+) ──
  // B3 K3: anomalies pysyy taulukkona aina (kts. streetlifting_16w-kommentti).
  const anomalies = [];
  for (const sess of sessionAnalysis) {
    for (const slot of sess.slots) {
      if (slot.actual.actualVx === 0 && slot.role === "primary") {
        anomalies.push({ type: "failure-primary", week: sess.week, day: sess.label, movement: slot.movementName, prescribed: slot.prescribed, actual: slot.actual });
      }
      if (slot.vxDelta != null && Math.abs(slot.vxDelta) >= 2 && slot.role === "primary") {
        anomalies.push({ type: "vx-mismatch", week: sess.week, day: sess.label, movement: slot.movementName, vxDelta: slot.vxDelta, prescribed: slot.prescribed, actual: slot.actual });
      }
    }
  }

  // ── Aggregaatit ──
  // B1 K1 ratifioitu (HANDOFF.md §6 K1, 2026-05-25): koko-syklin tasolla rajaus
  // on cycleSessions (vk 1..weekCount), backfill mukana. Sama jaettu apufunktio
  // kuin block-funktioissa. End-of-cycle pitää vxMismatchCount-lisämetriikan.
  const { totalSessions, completedSets } = _computeTuningCoreAggregates(cycleSessions, allSets);
  const vxHits = sessionAnalysis.reduce((acc, s) => {
    for (const slot of s.slots) {
      if (slot.prescribed.vx != null && slot.actual.actualVx != null) {
        acc.total++;
        if (Math.abs(slot.vxDelta || 0) <= 1) acc.hits++;
      }
    }
    return acc;
  }, { hits: 0, total: 0 });
  const aggregates = {
    totalSessions,
    completedSets,
    vxHitRate: vxHits.total > 0 ? Math.round((vxHits.hits / vxHits.total) * 100) : null,
    failureCount: anomalies.filter(a => a.type === "failure-primary").length,
    vxMismatchCount: anomalies.filter(a => a.type === "vx-mismatch").length,
  };

  // v4.34.28: deltaPctBase per vk + engine-rule-frequency koko sykliltä (cowork-audit kohta 1.1)
  const cycleDeltaPctBase = (mesocycle.weekDefs || []).map(wd => ({
    week: wd.week, deltaPctBase: wd.deltaPctBase ?? null, label: wd.label || null,
    heavyReps: wd.heavyReps ?? null, heavyTargetVx: wd.heavyTargetVx ?? null,
  }));
  // B3 K3: tyhjä-status-encoding (sama logiikka kuin block-funktiossa):
  // not-implemented jos decisionTraces puuttuu ctx:stä; empty jos saatavilla
  // mutta tyhjä; muuten data (taulukko).
  const cycleTraceFreq = {};
  for (const t of (decisionTraces || [])) {
    if (!t.ruleId) continue;
    cycleTraceFreq[t.ruleId] = (cycleTraceFreq[t.ruleId] || 0) + 1;
  }
  const cycleTraceFreqSorted = Object.entries(cycleTraceFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([ruleId, count]) => ({ ruleId, count }));
  let engineRuleFrequency;
  if (decisionTraces === undefined || decisionTraces === null) {
    engineRuleFrequency = { status: "not-implemented", reason: "decisionTraces ei saatavilla ctx:ssä" };
  } else if (cycleTraceFreqSorted.length === 0) {
    engineRuleFrequency = { status: "empty", reason: "ei kirjattuja decisionTrace:eja koko syklillä" };
  } else {
    engineRuleFrequency = cycleTraceFreqSorted;
  }

  // ── Markdown-narratiivi ──
  const markdown = buildEndOfCycleMarkdown({
    profile, currentWeek: wk || weekCount, weekCount, sessionAnalysis,
    e1rmTrends, trends, anomalies, aggregates, mesocycleType: mesocycle.type || "default",
  });

  // ── JSON-data (Claude/AI:lle) ──
  const json = {
    meta: {
      version: "4.34.28",
      generatedAt: new Date().toISOString(),
      currentWeek: wk,
      weekCount,
      mesocycleType: mesocycle.type || "default",
      isAfterEnd,
    },
    profile,
    completedCycle: {
      weeks: Array.from({ length: weekCount }, (_, i) => i + 1),
      sessions: sessionAnalysis,
      e1rmTrends, trends, anomalies, aggregates,
      // v4.34.28: deltaPctBase + engineRuleFrequency
      // B3 K3: engineRuleFrequency on joko taulukko (data) tai status-objekti.
      deltaPctBase: cycleDeltaPctBase,
      engineRuleFrequency,
    },
  };

  // ── AI-prompt (valmis copy-paste) ──
  const prompt = buildEndOfCyclePrompt({ profile, currentWeek: wk || weekCount, weekCount, json, markdown });

  return {
    markdown, json, prompt,
    meta: {
      currentWeek: wk, weekCount, mesocycleType: mesocycle.type || "default",
      generatedAt: new Date().toISOString(),
      sessionsAnalyzed: totalSessions,
      anomaliesFound: anomalies.length,
    },
  };
}

function buildEndOfCycleMarkdown({ profile, currentWeek, weekCount, sessionAnalysis, e1rmTrends, trends, anomalies, aggregates, mesocycleType }) {
  const lines = [];
  lines.push(`# End-of-Cycle Tuning -analyysi — koko sykli (${weekCount} vk)`);
  lines.push("");
  lines.push(`**Generoitu**: ${new Date().toLocaleDateString("fi-FI")}`);
  lines.push(`**Mesocycle**: ${mesocycleType}, vk ${currentWeek}/${weekCount}`);
  lines.push(`**Atleettiprofile**: ${profile.bw} kg bw`);
  if (profile.calibration?.kyykkyExtKg) {
    lines.push(`**Kalibrointi**: K=${profile.calibration.kyykkyExtKg} kg, L=${profile.calibration.leukaExtKg} kg, D=${profile.calibration.dippiExtKg} kg`);
  }
  if (profile.competitionDate) {
    lines.push(`**Kisapäivä**: ${profile.competitionDate}`);
  }
  lines.push("");

  lines.push(`## Syklin yhteenveto`);
  lines.push("");
  lines.push(`- Sessioita kirjattu: **${aggregates.totalSessions}**`);
  lines.push(`- Sarjoja yhteensä: **${aggregates.completedSets}**`);
  if (aggregates.vxHitRate != null) {
    lines.push(`- Vx-target-hit-rate (±1): **${aggregates.vxHitRate}%**`);
  }
  lines.push(`- Failure-tapauksia (V0 primary): **${aggregates.failureCount}**`);
  lines.push(`- Vx-mismatch (±2+): **${aggregates.vxMismatchCount}**`);
  lines.push("");

  // B3 K3: tyhjä-status-encoding (sama logiikka kuin buildMarkdownNarrative:ssa).
  if (_isTrendEmptyStatus(e1rmTrends)) {
    lines.push("### e1RM-trendit");
    lines.push("");
    lines.push(`*${_formatTrendStatusFi(e1rmTrends)}*`);
    lines.push("");
  } else if (Object.keys(e1rmTrends).length > 0) {
    lines.push("### e1RM-trendit");
    lines.push("");
    lines.push("| Liike | Lähtö | Loppu | Δ% |");
    lines.push("|---|---|---|---|");
    for (const [name, t] of Object.entries(e1rmTrends)) {
      const arrow = t.deltaPct > 0 ? "📈" : t.deltaPct < 0 ? "📉" : "→";
      lines.push(`| ${name} | ${t.first} kg | ${t.latest} kg | ${arrow} ${t.deltaPct >= 0 ? "+" : ""}${t.deltaPct}% |`);
    }
    lines.push("");
  }

  // B3 K3: per-mittari tyhjä-status näytetään eksplisiittisesti.
  const hrvIsStatusEC = _isTrendEmptyStatus(trends.hrv);
  const mpvIsStatusEC = _isTrendEmptyStatus(trends.mpv);
  const bwIsStatusEC = _isTrendEmptyStatus(trends.bodyweight);
  const hrvHasDataEC = !hrvIsStatusEC && Array.isArray(trends.hrv) && trends.hrv.length > 0;
  const mpvHasDataEC = !mpvIsStatusEC && Array.isArray(trends.mpv) && trends.mpv.length > 0;
  const bwHasDataEC = !bwIsStatusEC && Array.isArray(trends.bodyweight) && trends.bodyweight.length > 0;
  if (hrvHasDataEC || mpvHasDataEC || bwHasDataEC || hrvIsStatusEC || mpvIsStatusEC || bwIsStatusEC) {
    lines.push("### Recovery-/mittari-trendit");
    lines.push("");
    if (hrvHasDataEC) {
      const first = trends.hrv[0].value, last = trends.hrv[trends.hrv.length - 1].value;
      const delta = first > 0 ? Math.round(((last - first) / first) * 1000) / 10 : 0;
      lines.push(`- **HRV**: ${trends.hrv.length} mittausta, ${first.toFixed(1)} → ${last.toFixed(1)} (${delta >= 0 ? "+" : ""}${delta}%)`);
    } else if (hrvIsStatusEC) {
      lines.push(`- **HRV**: *${_formatTrendStatusFi(trends.hrv)}*`);
    }
    if (mpvHasDataEC) {
      const first = trends.mpv[0].value, last = trends.mpv[trends.mpv.length - 1].value;
      const delta = first > 0 ? Math.round(((last - first) / first) * 1000) / 10 : 0;
      lines.push(`- **MPV**: ${trends.mpv.length} mittausta, ${first.toFixed(2)} → ${last.toFixed(2)} m/s (${delta >= 0 ? "+" : ""}${delta}%)`);
    } else if (mpvIsStatusEC) {
      lines.push(`- **MPV**: *${_formatTrendStatusFi(trends.mpv)}*`);
    }
    if (bwHasDataEC) {
      const first = trends.bodyweight[0].value, last = trends.bodyweight[trends.bodyweight.length - 1].value;
      const delta = Math.round((last - first) * 10) / 10;
      lines.push(`- **Kehonpaino**: ${trends.bodyweight.length} mittausta, ${first.toFixed(1)} → ${last.toFixed(1)} kg (${delta >= 0 ? "+" : ""}${delta} kg)`);
    } else if (bwIsStatusEC) {
      lines.push(`- **Kehonpaino**: *${_formatTrendStatusFi(trends.bodyweight)}*`);
    }
    lines.push("");
  }

  if (anomalies.length > 0) {
    lines.push("### Anomaliat");
    lines.push("");
    for (const a of anomalies.slice(0, 12)) {
      if (a.type === "failure-primary") {
        lines.push(`- 🔴 **vk ${a.week} ${a.day}**: ${a.movement} V0-failure (target ${a.prescribed.reps}×V${a.prescribed.vx}, actual ${a.actual.reps} reps)`);
      } else if (a.type === "vx-mismatch") {
        lines.push(`- 🟡 **vk ${a.week} ${a.day}**: ${a.movement} Vx-delta ${a.vxDelta > 0 ? "+" : ""}${a.vxDelta} (target V${a.prescribed.vx}, actual V${a.actual.actualVx})`);
      }
    }
    if (anomalies.length > 12) lines.push(`- ...ja ${anomalies.length - 12} muuta`);
    lines.push("");
  }

  lines.push(`## Seuraava sykli — pohdittavaa AI:lle`);
  lines.push("");
  lines.push(`Vie tämä paketti Claude/ChatGPT:lle saadaksesi ehdotuksen seuraavan mesocyclen rakenteeksi.`);
  lines.push(`Kysy spesifisti:`);
  lines.push(`1. Mitkä blokit (foundation/strength/intensity/peaking) toimivat hyvin, mitkä eivät?`);
  lines.push(`2. Pitäisikö volyymi-bias / intensity-bias muuttua seuraavassa syklissä?`);
  lines.push(`3. Mitkä slot-rotaatiot (esim. accessory-vaihdot) tuottivat eniten hyötyä?`);
  lines.push(`4. Onko peaking-protokolla A/B-vaihdettava (esim. Bosquet 2007 vs Pritchard NZ raw)?`);
  lines.push(`5. Mikä konkreettinen muutos parantaisi seuraavaa sykliä eniten?`);

  return lines.join("\n");
}

function buildEndOfCyclePrompt({ profile, currentWeek, weekCount, json, markdown }) {
  return `# End-of-Cycle Tuning -pyyntö

Olen edistynyt streetlifting-/voimanostoatleetti (15+v kokemus). Käytän LeVe AI -valmennussovellusta jonka olen rakentanut itselleni Claude Code -työkalulla.

## Konteksti
${profile.competitionDate ? `Kisapäivä: ${profile.competitionDate}.` : "Ei spesifistä kisapäivää."}
Mesocycle: ${json.meta.mesocycleType}, vk ${currentWeek}/${weekCount}.
Profile: ${profile.bw} kg bw.
${profile.calibration?.kyykkyExtKg ? `Kalibrointi: K=${profile.calibration.kyykkyExtKg}, L=${profile.calibration.leukaExtKg}, D=${profile.calibration.dippiExtKg} kg.` : ""}

## Pyyntö
Analysoi koko syklin data (alla JSON) ja palauta ehdotus seuraavan mesocyclen rakenteeksi. Tärkein kysymys: **mikä konkreettinen muutos parantaisi seuraavaa sykliä eniten?**

## Vaadittu vastausformaatti

\`\`\`json
{
  "executive_summary": "1-2 lauseen kiteytys mitä mennyt sykli kertoi atleetin nykytasosta + isoin oppimisaihe.",
  "next_cycle_proposal": {
    "structure": "esim. '4-blokki 16 vk: hypertrofia 4 + voima 4 + intensifikaatio 4 + peaking 4'",
    "volume_bias": "low | balanced | high",
    "intensity_bias": "low | balanced | high",
    "primary_focus": "esim. 'leuanveto-volyymi' tai 'kyykky-tekniikka'",
    "rationale": "lyhyt perustelu (3-5 lausetta)"
  },
  "key_changes_from_previous": [
    { "category": "A | B | C", "change": "konkreettinen muutos", "why": "syy datasta" }
  ],
  "athlete_critical_questions": [
    "kysymys 1 atleetin pohdittavaksi",
    "kysymys 2..."
  ],
  "citations": ["lähde 1 (esim. 'Bosquet 2007 tapering meta')"]
}
\`\`\`

Kategoria A = sovellus-tason muutokset (atleetti applaa UI:ssa: slot-swap, e1RM-update, BW)
Kategoria B = rakenteelliset muutokset (Claude Code -tasolla: %-progressio, set/rep, backoff-tyyli)
Kategoria C = mentaalinen koutsaus (atleetti sisäistää: tekniikkavinkit, riskimanagement)

## Data (mennyt sykli)

\`\`\`json
${JSON.stringify(json, null, 2)}
\`\`\`

## Ohjeet
- LeVe AI tech stack: vanilla JavaScript (.js / .mjs), IndexedDB, PWA service worker — EI TypeScriptiä. Älä oleta src/-polkuja tai .ts/.tsx-tiedostoja \`claudeCodePromptHint\`-kentissä.
- Cross-ref-slot voi kantaa \`refScale\` ja \`nominalLoadPct\` -kentät. Tällöin \`loadPct\` on jo skaalattu (\`= nominalLoadPct × refScale\`) ja note's \`@\`-pct viittaa nominaaliin viiteliikkeen 1RM-suhteessa (\`loadPctReferenceMovementName\`).
- Älä ehdota muutoksia jotka rikkovat käyttäjän nykyistä työkalua
- Älä myöntäile — jos sykli oli puutteellinen, sano se
- Erottele vakaa konsensus / aktiivinen debate / heuristiikka
- Streetlifting-spesifeille kysymyksille (peaking, peakkari-protokolla) on usein vain coaching-konsensus, ei RCT — myönnä se
- Jos ehdotat A/B-vertailua, suunnittele se SCED-tyyppisenä (single-case experimental design)`;
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export {
  // Constants
  DAY_TYPE_MULTIPLIERS,
  DAY_TYPE_SET_RECIPES,
  REST_RECOMMENDATIONS,
  pickRestForExercise,
  READINESS_CLASSES,
  SUGGESTED_NEXT_TEMPLATE,
  // Math
  median,
  mad,
  madSigma,
  zScore,
  avg,
  clamp,
  roundToHalf,
  // e1RM
  e1rmSystem,
  e1rmExternal,
  e1rmAccessory,
  targetLoadFromE1RM,
  vRepsToExpectedPct,
  acrossSetAllowance, // K3-1: across-set-väsymysvara (jaettu UI-swap-helperin kanssa)
  withinSessionFatigueCredits, // K3-1: estimointi-positio-krediitti (8a-testien ko-opittavuus)
  computeAcrossSetDecay, // 8a: yhden session havaittu across-set-rate (oppimissignaali)
  updateLearnedParam, // 8a: geneerinen priori-shrinkage-päivitys (clamp + outlier)
  computeLearnedAcrossSetFatigue, // 8a: koko historian orkestrointi → opittu rate
  ACROSS_SET_FATIGUE_SPEC, // 8a: prior/clamp/tau-spec (testit + reset)
  forecastSetSustainability, // MULL-3 (#16): within-session-ennakointi (viimeisen sarjan varanto)
  // H-017 D1 — intra-session-alaspäin-re-resolve (puhdas; UI-handler kutsuu + tracaa)
  resolveIntraSessionAdjustedLoad,
  resolveTopSingleReanchor, // K3-2 — ykkösen tulos re-ankkuroi työsarjat (vain alaspäin)
  resolveTier,
  tier1Or2,
  // Baseline
  computeBaseline,
  classifyReadinessZ,
  // Readiness
  velocityReadiness,
  hrvReadiness,
  varaReadiness,
  upperBodyMpvReadiness,
  // v4.34.0 AI-Block-Tuning
  generateBlockTuningPackage,
  // v4.34.48 — yleinen versio, toimii kaikille ei-streetlifting-mesoille
  generateGenericBlockTuningPackage,
  generateEndOfCycleTuningPackage,
  // β H-001 B1 — jaettu aggregaatti-apufunktio (export vain testikäyttöön)
  _computeTuningCoreAggregates,
  // β H-001 B2/A2 — slot-note-normalisointi (export vain testikäyttöön)
  _normalizeSlotForTuningSerialization,
  // β H-001 B3 — tyhjien trendikenttien status-encoding-apurit (testikäyttöön)
  _isTrendEmptyStatus,
  _formatTrendStatusFi,
  combineReadiness,
  // K7 (valmentaja-linssin aukot 2026-07-05)
  computeSubjectiveReadiness,   // K7-1: 15 s check-in (Hooper/McLean) — 4. kanava
  combineReadinessAll,          // K7-1: 4-kanavainen yhdistely (3-kanavainen bittitarkka)
  computeFatigueAggregate,      // K7-2: cross-movement väsymys → deload-ehdotus (advisory)
  computeNextAttempt,           // K7-6: kisapäivän yritysvalinta (in-meet)
  analyzeCycleForNextBlock,     // K7-7: syklin loppuanalyysi → seuraavan blokin suositus
  MU_SKILL_REGRESSIONS,         // K7-4: MU-skill-regressiodrillit
  // Mesocycle
  getMesocycleWeek,
  getWeekDef,
  getTodayPlan,
  // v4.52.18 H-009 P1a (A1): identity-coherence-detektori (tuning-vapaa)
  detectPrimaryMovementIdentityMismatch,
  // H-015: liike-korvaus vaivan ajaksi (kanoninen applikointi — UI-renderit kutsuvat tätä)
  applyMovementSubstitutions,
  // H-016: liike-tason paluuramppi (reload) — testattava yksikkönä + UI lukee slot._reload
  computeMovementReload,
  RELOAD_CONFIG,
  deltaPctRaw,
  calibrateMesocycle,
  // Vara
  varaFeedback,
  varaTrendCorrection,
  e1rmMomentumBonus,
  grossMismatchCorrection,
  // v4.34.34 BUG 2 (b)
  firstSetCapacityBonus,
  // v4.34.41 — intra-session-bump
  intraSessionLoadAdjustSuggestion,
  // Break
  breakAnalysis,
  mesocycleBreakReset,
  // Failure
  failureReaction,
  // Accessory
  accessoryProgression,
  updateMovementProgressFromSets,
  initialWeightFrom1RM,
  // Velocity
  velocityLossPercent,
  // Recommend
  recommend,
  recommendPeaking,
  // v4.34.14: rate-limit-anchor exposed for tests + diagnostics
  computeRateLimitAnchor,
  // v4.35.0: eliittitason progressio-malli (Helms 2018, Cumming 2024, Issurin 2010)
  PROGRESSION_CONFIG,
  computeProgressionTarget,
  // Variant periodization
  DEFAULT_VARIANT_MODIFIERS,
  getDefaultVariantForDayType,
  variantLoadModifier,
  computeDisplayedSlotLoad,
  variantRepOverride,
  assignVariantRotation,
  // Peaking
  computeAttemptLoads,
  computeStreetliftingOpenerStrategy,
  // v4.30.3: ennuste
  predictE1RMEndOfProgram,
  computeStreetliftingFinalProjection,
  // Weekly
  weeklyStimulus,
  computeWeeklyMuscleVolume, // K4-1: viikkovolyymi lihasryhmittäin (Sykli-kortti)
  muscleVolumeBand,
  analyzeVolumeLandmarks, // MULL-2 (#8): MEV-lattia + MRV-katto advisory (ali/yli-annostus)
  // Stagnation
  checkStagnation,
  // KORI 8: progressio-monipuolisuus (advisory-työkalut jumitukseen)
  suggestProgressionTool, PROGRESSION_TOOLS,
  // Accessory slot resolution (v4.11)
  phaseForWeek,
  resolveAccessorySlot,
  resolveMesocyclePosition,
  isInsertedDeloadWeek,
  isReplacedDeloadWeek,
  isDeloadOverrideWeek,
  getEffectiveWeekCount,
  resolveDayPlanSlots,
  suggestAccessorySwaps,
  // Default plan
  generateDefaultDayPlan,
  // Block periodization (v4.25 P1-10)
  getBlockForWeek,
  getAccessoryBlockScalar,
  // MU autoregulation (v4.25 P1-9)
  adjustMULoad,
  // Failure lockout (v4.25 P2-16)
  hadFailureLastSession,
  // Load-velocity profile (v4.25.1 — Enode)
  computeLoadVelocityProfile,
  MOVEMENT_MVT,
  DEFAULT_MVT,
  // v4.52.15 H-006b B1 (A1): liike-spesifi primer-rajaus
  MOVEMENT_PRIMER_ENABLED,
  isPrimerEnabledForMovement,
  // v4.52.15 H-006b B2 (A2): primer-pohjainen sys-1RM-päivitys
  computePrimerBaseline,
  computeTodaySys1RM,
  // v4.52.15 H-006b B3 (A3 K-β-4): baseline-drift detection
  computePrimerBaselineDrift,
  // v4.52.16 H-007 B2 (A2+A3): HRV-baseline + drift-detection
  computeHrvBaseline,
  computeHrvBaselineDrift,
  ENODE_LOW_VELOCITY_CAVEAT,
  computeVBTPromotionStatus,
  VBT_MIN_ANCHORS,
  VBT_ANCHOR_WINDOW_DAYS,
  VBT_PROMOTE_THRESHOLD,
  VBT_DEMOTE_THRESHOLD,
  VBT_STALE_PROFILE_DAYS,
  VBT_FORCE_RECAL_DAYS,
  // v4.38.1 (Phase 2) VL-cap autoregulaatio
  VL_CAP_PER_BLOCK,
  vlCapForContext,
  // v4.38.3 (Phase 3.5) Yksilöllinen cap RTF-mallista
  BLOCK_PHASE_TARGET_RIR,
  // v4.38.2 (Phase 3) RTF-velocity-malli (Jukic 2024)
  computeRtfVelocityModel,
  vlCapFromRtfModel,
  RTF_MIN_REPS_PER_SET,
  RTF_MIN_SESSIONS_FOR_MODEL,
  RTF_R2_THRESHOLD_RELIABLE,
  RTF_R2_THRESHOLD_PREVIEW,
  // v4.38.3 (Phase 4) Vx-velocity-konfliktin tunnistus
  predictVxFromVelocity,
  VX_CONFLICT_DELTA,
  // v4.38.4 (Phase 2.7) kaksisuuntainen autoregulaatio
  targetRep1VelocityRange,
  DEFAULT_RTF_SLOPE,
  // v4.49.2 Q1: grindy-bias-detection slot.targetVx-hybridille
  detectGrindyBias,
  // v4.50.0+ (Track B 2D-δ): Adaptive multi-suggestion -tier-generaattori
  generateSuggestions,
  // v4.38.5 — kisaliikkeiden tunnistus fallback nimellä
  isCompetitionLiftMovement,
  COMPETITION_LIFT_NAMES_FALLBACK,
  computePeakingDecisionTreeCard,
  // Readiness test
  readinessTestLoad,
  // Speed
  speedDayLoad,
  // HRV
  ouraHRVtoLnRMSSD,
  // Adaptive
  analyzeSessionAdaptation,
  applyAdaptations,
  // Future workouts
  getFutureWorkouts,
  // Missed prior sessions
  findMissedPriorSessions,
  // Elite check
  eliteVolumeCheck,
  // Movement e1RM
  computeMovementE1RM,
  computeMovementE1RMHistory,
  // v4.35.1: yhtenäinen e1RM (cal → plan-based → median, sama kuin recommend())
  computeMovementE1RMBest,
  // v4.34.34 movement-load-style resolver
  isSystemLoadMovement,
  // v4.34.44: cfg-baseline-resolveri (TASO 1: movementCfg, TASO 2: streetliftingConfig)
  getCfgBaselineForMovement,
};
