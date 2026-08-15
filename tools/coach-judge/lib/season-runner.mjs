// season-runner.mjs — ajaa kauden ATLEETIN näkökulmasta, ei enginen
//
// Ero engine-pilotin scenario-runneriin (tarkoituksellinen, ei duplikaatti):
//   1. HÄIRIÖT — liikevaihdot, väliin jääneet päivät, tauot, käsimuokkaukset
//   2. sessionId asetetaan seteille (engine-pilot jättää sen nulliksi → kaikki
//      sessio-liitokset (computePriorSessionSummary!) ovat siellä testaamattomia)
//   3. completed-kenttä persistoidussa muodossa (H-019 OSA A -oppi: tuotannon setit
//      kantavat sen, fixturet eivät kantaneet → koko prior-yhteenveto oli inertti)
//   4. TUOTOS = atleetille näkyvä RESEPTI, ei recommend()-paluuarvo
//
// Tämä tiedosto EI muokkaa engine-pilotia (se on Stop hook -portti, bittitarkka).
// Se importtaa siitä vain read-only-apureita.

import { recommend, getTodayPlan } from "../../engine-pilot/lib/engine-bridge.mjs";
import { simulateSet, rngForDay } from "../../engine-pilot/lib/athlete-simulator.mjs";
import { mulberry32, gaussianFromRng } from "../../engine-pilot/lib/seeded-rng.mjs";
import { buildPerturbationPlan, applySwaps } from "./perturbation.mjs";
import {
  mirrorPriorSessionSummary, mirrorLoadRationale,
  mirrorPrevSessionLine, mirrorBreakBanner, mirrorWarmupRamp, daysBetween,
} from "./ui-mirror.mjs";

function isoDateAddDays(startISO, days) {
  const d = new Date(startISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function simulateReadiness(profile, rngFn) {
  const hrv = gaussianFromRng(rngFn) * 0.5;
  const vel = gaussianFromRng(rngFn) * 0.5;
  const cls = (z) => (z < -1 ? "RED" : z < -0.5 ? "YELLOW" : "GREEN");
  const hrvClass = cls(hrv), velClass = cls(vel);
  const varaClass = (profile.bias.grindy ?? 0) > 0.5 ? "GREEN" : (rngFn() < 0.1 ? "YELLOW" : "GREEN");
  const counts = { GREEN: 0, YELLOW: 0, RED: 0 };
  [hrvClass, velClass, varaClass].forEach(c => counts[c]++);
  let combined = "YELLOW", capLevel = 1;
  if (counts.GREEN >= 2) { combined = "GREEN"; capLevel = 0; }
  else if (counts.RED >= 2 || (counts.RED >= 1 && counts.YELLOW >= 1)) { combined = "RED"; capLevel = 2; }
  if (velClass === "RED" && combined === "GREEN") { combined = "YELLOW"; capLevel = 1; }
  return {
    combined, capLevel,
    channels: {
      velocity: { class: velClass, z: vel },
      hrv: { class: hrvClass, z: hrv },
      vara: { class: varaClass, z: null, meanOvershoot: profile.bias.grindy ?? 0 },
    },
  };
}

function deriveMovementCatalog(mesocycle) {
  const seen = new Map();
  for (const wp of mesocycle.weekPlans || []) {
    for (const d of wp.days || []) {
      for (const s of d.slots || []) {
        const name = s.movementName || s.defaultMovementName;
        if (!name || seen.has(name)) continue;
        seen.set(name, {
          movementId: name, name,
          category: s.category || "uncategorized",
          isPrimary: s.role === "primary",
          isPreset: true,
          isCompetitionLift: !!s.competitionLift,
          loadType: s.competitionLift ? "system" : "external",
        });
      }
    }
  }
  return [...seen.values()];
}

// Lisää katalogiin liikkeet joihin voidaan vaihtaa (muuten swapattu liike on
// enginelle tuntematon ja e1RM-resoluutio kaatuu hiljaa nollaan).
function extendCatalogWithSwapTargets(catalog, plan, mesocycle) {
  const known = new Set(catalog.map(m => m.name));
  const cats = new Map();
  for (const wp of mesocycle.weekPlans || []) {
    for (const d of wp.days || []) {
      for (const s of d.slots || []) {
        const n = s.movementName || s.defaultMovementName;
        if (n) cats.set(n, s.category);
      }
    }
  }
  // Kaikki SWAP_POOL-liikkeet lisätään laiskasti ajon aikana (ks. ensureCatalogEntry)
  return { catalog, known, cats };
}

function ensureCatalogEntry(catalog, name, category) {
  if (catalog.some(m => m.name === name)) return;
  catalog.push({
    movementId: name, name, category: category || "uncategorized",
    isPrimary: false, isPreset: true, isCompetitionLift: false, loadType: "external",
  });
}

export async function runSeason({ profile, scenario, mesocycle, perturbationConfig = {} }) {
  const movementCatalog = deriveMovementCatalog(mesocycle);
  extendCatalogWithSwapTargets(movementCatalog, null, mesocycle);
  const plan = buildPerturbationPlan({ profile, scenario, config: perturbationConfig });

  const allSets = [];        // tuotantoschema (completed, sessionId, timestamp)
  const sessions = [];
  const prescriptions = [];  // ← TUOMARIN SYÖTE
  const events = [];         // häiriölokitus
  const errors = [];

  for (const { weekNum, dayOfWeek } of scenario.days) {
    const key = `w${weekNum}d${dayOfWeek}`;
    const entry = plan.get(key) || { swaps: [], skip: false };
    const dayIndex = (weekNum - 1) * 7 + (dayOfWeek - 1);
    const dateISO = isoDateAddDays(mesocycle.startDateISO, dayIndex);

    if (entry.skip) {
      events.push({ dateISO, weekNum, dayOfWeek, type: entry.reason || "SKIP_DAY" });
      continue;
    }

    // ── Häiriö: liikevaihto ohjelmaslottiin ENNEN recommend():a ──
    const meso = JSON.parse(JSON.stringify(mesocycle));
    const targetDay = getTodayPlan(meso, weekNum, dayOfWeek);
    let swapsApplied = [];
    if (targetDay) {
      swapsApplied = applySwaps(targetDay, entry);
      for (const sw of swapsApplied) {
        ensureCatalogEntry(movementCatalog, sw.to, sw.category);
        events.push({ dateISO, weekNum, dayOfWeek, type: "SWAP", ...sw });
      }
    }

    const rRng = mulberry32(((profile.seed ?? 12345) ^ (weekNum * 100 + dayOfWeek)) >>> 0);
    const readiness = simulateReadiness(profile, rRng);

    const primarySlot = targetDay?.slots?.find(s => s.role === "primary");
    const primaryMovementId = primarySlot
      ? (primarySlot.movementName || primarySlot.defaultMovementName)
      : movementCatalog[0]?.movementId;

    const ctx = {
      settings: {
        bodyweightKg: profile.meta.bodyweightKg,
        e1rmExternalSetting: profile.cfgBaselines?.["Takakyykky"] ?? 93,
      },
      bodyweightKg: profile.meta.bodyweightKg,
      dateISO,
      mesocycle: meso,
      allMovements: movementCatalog,
      allSets,
      sessions,
      readiness,
      primaryMovementId,
      dryRun: true,
    };

    let rec;
    try {
      rec = await recommend(ctx);
    } catch (e) {
      errors.push({ dateISO, weekNum, dayOfWeek, message: e.message });
      continue;
    }
    if (rec?.error) continue;

    const sessionId = `cj-${profile.id}-w${weekNum}-d${dayOfWeek}`;
    const slots = rec.dayPlan?.slots || [];
    // Lämmittelyramppi on SESSIOKOHTAINEN (index.html:13622) — se rakennetaan kerran
    // primaryn kuormasta ja liitetään ramp-carrier-liikkeeseen, ei per slot.
    const ramp = mirrorWarmupRamp({ rec, isPeakingMeso: meso.type === "peaking" });

    // ── Kaappaa ATLEETILLE NÄKYVÄ RESEPTI per slot ──
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const movName = slot.movementName || slot.defaultMovementName;
      if (!movName) continue;

      const prior = mirrorPriorSessionSummary(allSets, sessions, movName, sessionId);
      const loadKg = slot.resolvedLoadKg ?? slot.suggestedLoadKg ?? null;
      const rationale = mirrorLoadRationale(prior, loadKg);
      const prevLine = mirrorPrevSessionLine(prior, dateISO);
      const banner = mirrorBreakBanner({
        rec, exerciseName: movName, movementId: movName,
        allSets, todayISO: dateISO, slotReload: slot._reload,
      });
      const manual = (entry.manualLoad || []).find(m => m.slotIndex === i);
      const swap = swapsApplied.find(s => s.slotIndex === i);

      prescriptions.push({
        id: `${profile.id}|${key}|s${i}`,
        profileId: profile.id,
        weekNum, dayOfWeek, dateISO,
        weekLabel: rec.weekLabel ?? null,
        dayType: rec.dayType ?? null,
        blockPhase: rec.blockPhase ?? null,
        // ── mitä atletti näkee ruudulla ──
        naytto: {
          liike: movName,
          rooli: slot.role,
          kuormaKg: loadKg,
          sarjat: slot.sets ?? null,
          toistotavoite: slot.reps ?? null,
          varaTavoite: slot.targetVx ?? null,
          miksiTamaPaino: rationale.text,
          edellinenKerta: prevLine?.text ?? null,
          edellinenKertaLabel: prevLine?.label ?? null,
          banneri: banner?.text ?? null,
          // Ramppi näytetään vain sillä liikkeellä joka sen kantaa (primary).
          lammittelyramppi: slot.role === "primary"
            ? ramp.rows.map(r => `${r.loadKg}×${r.reps}`)
            : [],
          note: slot.note ?? null,
        },
        // ── konteksti jota atletti voi kaivaa esiin ──
        konteksti: {
          e1rmSystem: rec.e1rmSystem ?? null,
          e1rmExternal: rec.e1rmExternal ?? null,
          bodyweightKg: rec.bodyweightKg ?? profile.meta.bodyweightKg,
          edellisenSessionSarjat: prevLine?.setsRaw ?? null,
          paiviaEdellisesta: prior ? daysBetween(prior.dateISO, dateISO) : null,
          readiness: readiness.combined,
          capLevel: readiness.capLevel,
          loadPct: slot.loadPct ?? null,
          velocityStop: slot.velocityStop ?? null,
        },
        // ── häiriöt jotka johtivat tähän ruutuun ──
        hairiot: {
          liikeVaihdettu: swap ? { mista: swap.from, mihin: swap.to } : null,
          kasimuokkaus: manual ? Math.round((manual.factor - 1) * 1000) / 10 : null,
        },
        // ── peilin sisäiset lisäkentät (EI atleetille näkyviä) ──
        _peili: {
          todellinenRaskainEdellinen: prior?._trueHeaviestLoadKg ?? null,
          narratiiviViittaus: rationale.prevRef,
          banneriVariantti: banner?.variant ?? null,
          engineKevensiOikeasti: banner?._engineActuallyReloaded ?? false,
          engineKevennysPct: banner?._engineReloadPct ?? null,
          engineAnkkuriKg: banner?._engineAnchorKg ?? null,
          rampinPohjakuorma: slot.role === "primary" ? (ramp.rampBaseKg ?? null) : null,
          rampinPohjaliike: slot.role === "primary" ? (ramp.rampBaseMovement ?? null) : null,
          rampinHyppyTyosarjaanPct: slot.role === "primary" ? ramp.jumpToWorkPct : null,
          rampinEsto: slot.role === "primary" ? ramp.suppressedBy : null,
        },
      });
    }

    // ── Simuloi suoritus (tuotantoschema: sessionId + completed + timestamp) ──
    const dayRng = rngForDay(profile, weekNum, dayOfWeek);
    const simSets = [];
    let counter = 0;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      let n = slot.sets ?? 0;
      const partial = (entry.partialSets || []).find(p => p.slotIndex === i);
      if (partial) n = Math.max(1, n - partial.drop);
      const manual = (entry.manualLoad || []).find(m => m.slotIndex === i);
      // KRIITTINEN (korjaus 12.8.2026): engine-pilotin simulateSet käyttää
      // fallbackia `slot.resolvedLoadKg ?? slot.suggestedLoadKg ?? 100` — se KEKSII
      // 100 kg aina kun engine ei osaa resolvoida kuormaa. Tuotannossa atletti näkee
      // tyhjän kentän; simulaattorissa syntyy 100 kg joka sitten progressoituu
      // (122 kg face pull). Fabrikoitu kuorma saastuttaa historian ja tekee
      // tuomarin syötteestä kelvottoman. Tässä se estetään: kuormaton slotti pysyy
      // kuormattomana koko ketjun läpi.
      const slotHasLoad = (slot.resolvedLoadKg ?? slot.suggestedLoadKg) != null;
      for (let s = 0; s < n; s++) {
        const set = simulateSet({ profile, weekNum, dayOfWeek, setIndex: counter++, slot, rngFn: dayRng });
        if (!slotHasLoad) {
          set.externalLoadKg = null;
          set.systemLoadKg = null;
          set.loadUnknown = true;   // atletti joutui itse päättämään kuorman
        }
        if (manual && slotHasLoad) {
          set.externalLoadKg = Math.round(set.externalLoadKg * manual.factor * 2) / 2;
          set.systemLoadKg = slot.competitionLift
            ? set.externalLoadKg + (profile.meta.bodyweightKg ?? 91)
            : set.externalLoadKg;
        }
        set.sessionId = sessionId;                       // ← engine-pilot jättää nulliksi
        set.completed = true;                            // ← tuotantoschema (H-019 OSA A)
        set.isWarmup = false;
        set.completedAtISO = `${dateISO}T18:00:00Z`;
        set.timestamp = `${dateISO}T18:${String(counter % 60).padStart(2, "0")}:00Z`;
        simSets.push(set);
      }
    }
    allSets.push(...simSets);
    sessions.push({
      sessionId, dateISO, weekNum, dayOfWeek,
      dayType: rec.dayType ?? null,
      mesocycleId: rec.mesocycleId ?? meso.mesocycleId ?? null,
      bodyweightKg: profile.meta.bodyweightKg,
      completedAtISO: `${dateISO}T19:00:00Z`,
      completed: true,
    });
  }

  return {
    profileId: profile.id,
    scenarioId: scenario.id,
    daysPlanned: scenario.days.length,
    daysTrained: sessions.length,
    prescriptions,
    events,
    errors,
    setsTotal: allSets.length,
  };
}
