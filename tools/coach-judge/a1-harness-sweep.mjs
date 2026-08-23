#!/usr/bin/env node
// a1-harness-sweep.mjs — H-022 A1 KANAVA 1: sitova vaihe per slotti, koko ohjelma
//
//   node tools/coach-judge/a1-harness-sweep.mjs
//
// Ajaa aktiivisen streetlifting_16w-ohjelman KAIKKI viikot (1–17) × kaikki slotit
// recommend()-polun läpi ja dumppaa per slotti:
//   viikko · päivä · liike · rooli · polkuluokka · plan-% · resolvoitu kuorma ·
//   plan-taso kg · poikkeama · sitova vaihe (traceista)
//
// Ratkaisee A1(iii):n kanavaristiriidan: trace-kanava sanoo vReps yliajaa 976×
// yksisuuntaisesti, harness-kokeilu 13.8. antoi LOAD-DIFF 0. Hypoteesit H1/H2/H3.
//
// Tuottaa myös §6-3:n luettelon: slotit joilla loadPct puuttuu tai on neuvoa-antava.
// READ-ONLY repon suhteen.

import { recommend, getTodayPlan, createStreetlifting16WMesocycle }
  from "../engine-pilot/lib/engine-bridge.mjs";
import AKSELI from "../engine-pilot/profiles/akseli-elite-streetlifter.mjs";
import { simulateSet, rngForDay } from "../engine-pilot/lib/athlete-simulator.mjs";
import { PRESET_MOVEMENTS } from "../engine-pilot/lib/engine-bridge.mjs";

const bw = AKSELI.meta.bodyweightKg ?? 91;
const meso = createStreetlifting16WMesocycle(AKSELI.mesoConfig.startDateISO);

// Liikekatalogi mesosyklistä
const cat = new Map();
for (const wp of meso.weekPlans) for (const d of wp.days) for (const s of d.slots) {
  const n = s.movementName || s.defaultMovementName;
  if (n && !cat.has(n)) cat.set(n, {
    movementId: n, name: n, category: s.category || "muu",
    isPrimary: s.role === "primary", isPreset: true,
    isCompetitionLift: !!s.competitionLift,
    loadType: s.competitionLift ? "system" : "external",
    // A1-KORJAUS 23.8.: tier PUUTTUI → vReps-haara (ehto tier 1/2/3) ei koskaan
    // ajautunut harnessissa. Tämä selittää 13.8. LOAD-DIFF 0:n: patchattu haara
    // ei suorittunut. Haetaan tier PRESET_MOVEMENTSista kuten tuotannossa.
    ...(() => { const p = PRESET_MOVEMENTS.find(m => m.name === n); return p ? { tier: p.tier, loadType: p.loadType ?? (s.competitionLift ? "system" : "external") } : {}; })(),
  });
}
const movements = [...cat.values()];

const iso = (dayIndex) => {
  const d = new Date(meso.startDateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dayIndex);
  return d.toISOString().slice(0, 10);
};

const pathClass = (s) => {
  if (s.loadPctReferenceMovementName) return "cross-ref";
  if (s.attemptsPct) return "attemptsPct";
  if (s.reps === 1 && !s.attemptsPct && s.loadPct != null) return "OBS-049-top-single";
  if (s.role === "primary") return "primary";
  return "non-primary";
};

const rows = [], noPlan = [];
const allSets = [], sessions = [];

for (const wp of meso.weekPlans) {
  for (const day of wp.days) {
    const dayIndex = (wp.week - 1) * 7 + (day.dayOfWeek - 1);
    const dateISO = iso(dayIndex);
    const plan = getTodayPlan(meso, wp.week, day.dayOfWeek);
    if (!plan?.slots?.length) continue;
    const primary = plan.slots.find(s => s.role === "primary");

    let rec;
    try {
      rec = await recommend({
        settings: { bodyweightKg: bw, e1rmExternalSetting: AKSELI.cfgBaselines?.["Takakyykky"] ?? 185 },
        bodyweightKg: bw, dateISO, mesocycle: meso, allMovements: movements,
        allSets, sessions,
        readiness: { combined: "GREEN", capLevel: 0, channels: { velocity: { class: "GREEN" }, hrv: { class: "GREEN" }, vara: { class: "GREEN" } } },
        primaryMovementId: primary ? (primary.movementName || primary.defaultMovementName) : movements[0]?.movementId,
        dryRun: true,
      });
    } catch (e) { continue; }
    if (rec?.error) continue;

    const traces = rec.traces || [];
    const out = rec.dayPlan?.slots || [];

    for (let i = 0; i < out.length; i++) {
      const s = out[i], def = plan.slots[i] || {};
      const mov = s.movementName || s.defaultMovementName;
      const cls = pathClass(def);
      const planPct = def.loadPct ?? def.nominalLoadPct ?? null;
      const resolved = s.resolvedLoadKg ?? s.suggestedLoadKg ?? null;

      if (planPct == null) { noPlan.push({ wk: wp.week, dow: day.dayOfWeek, mov, role: def.role, cls }); continue; }
      if (resolved == null) continue;

      // Sitova vaihe traceista: etsi tätä liikettä koskevat load-tracet
      const rel = traces.filter(t => {
        const j = JSON.stringify(t);
        return j.includes(mov) && /LOAD_PCT_RESOLVED|SLOT_LOAD_RESOLVED|PROGRESSION_TARGET|BREAK_RELOAD/.test(t.ruleId || "");
      });
      const srcs = [...new Set(rel.map(t => (t.after || {}).resolveSource).filter(Boolean))];
      const hasProg = rel.some(t => /PROGRESSION_TARGET/.test(t.ruleId || ""));
      const binding = srcs.includes("vRepsToExpectedPct") ? "vRepsToExpectedPct"
        : hasProg ? "computeProgressionTarget"
        : srcs[0] || "(ei traceä)";

      const e1 = rec.e1rmExternal ?? null;
      rows.push({ wk: wp.week, dow: day.dayOfWeek, mov, role: def.role, cls,
        planPct, resolved, binding, srcs: srcs.join("/"), deload: (wp.deltaPctBase ?? 0) < 0, e1 });
    }

    // simuloi sessio jotta historia kertyy (progressio tarvitsee sen)
    const rng = rngForDay(AKSELI, wp.week, day.dayOfWeek);
    const sid = `a1-w${wp.week}d${day.dayOfWeek}`;
    let c = 0; const sim = [];
    for (const s of out) for (let k = 0; k < (s.sets ?? 0); k++) {
      const st = simulateSet({ profile: AKSELI, weekNum: wp.week, dayOfWeek: day.dayOfWeek, setIndex: c++, slot: s, rngFn: rng });
      if ((s.resolvedLoadKg ?? s.suggestedLoadKg) == null) { st.externalLoadKg = null; st.systemLoadKg = null; }
      st.sessionId = sid; st.completed = true; st.isWarmup = false;
      st.timestamp = `${dateISO}T18:${String(c % 60).padStart(2, "0")}:00Z`;
      sim.push(st);
    }
    allSets.push(...sim);
    sessions.push({ sessionId: sid, dateISO, weekNum: wp.week, dayOfWeek: day.dayOfWeek, completed: true, bodyweightKg: bw });
  }
}

console.log(`\n${"═".repeat(78)}`);
console.log("H-022 A1 — KANAVA 1 (harness-sweep): sitova vaihe per slotti");
console.log("═".repeat(78));
console.log(`slotteja plan-%:lla ${rows.length} · ilman plan-%:a ${noPlan.length}\n`);

console.log("SITOVA VAIHE (kaikki plan-% -slotit):");
const byB = {}; for (const r of rows) byB[r.binding] = (byB[r.binding] || 0) + 1;
for (const [k, v] of Object.entries(byB).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);

console.log("\nPOLKULUOKAT:");
const byC = {}; for (const r of rows) byC[r.cls] = (byC[r.cls] || 0) + 1;
for (const [k, v] of Object.entries(byC).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);

console.log("\nSITOVA VAIHE × POLKULUOKKA:");
const cross = {};
for (const r of rows) { const k = r.cls + " → " + r.binding; cross[k] = (cross[k] || 0) + 1; }
for (const [k, v] of Object.entries(cross).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);

console.log("\n§6-3 — SLOTIT ILMAN plan-%:a (neuvoa-antava/puuttuva loadPct):");
const npByMov = {}; for (const r of noPlan) npByMov[`${r.mov} (${r.role})`] = (npByMov[`${r.mov} (${r.role})`] || 0) + 1;
for (const [k, v] of Object.entries(npByMov).sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`  ${String(v).padStart(4)}×  ${k}`);
console.log(`  … yhteensä ${Object.keys(npByMov).length} uniikkia liike/rooli-paria`);
