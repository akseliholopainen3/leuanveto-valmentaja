#!/usr/bin/env node
// a2-plan-floor-sweep.mjs — H-022 A2/A3: paljonko resolvoitu kuorma poikkeaa
// SUUNNITELLUSTA slot-tasosta, per polkuluokka ja per viikkoluokka?
//
//   node tools/coach-judge/a2-plan-floor-sweep.mjs [--json=<polku>]
//
// PRE/POST-mittari: aja ennen korjausta ja sen jälkeen → LOAD-DIFF-sweep (§9.4).
//
// Viikkoluokka luetaan mesocycle.weekDefs[].deltaPctBase:sta — EI weekPlans:sta.
// A1:n harness luki weekPlans[].deltaPctBase:a joka on undefined KAIKILLA viikoilla
// (kenttä asuu weekDefs-listalla) → sen deload-lippu oli aina false. Sama
// instrumenttiluokka kuin A1:n puuttuva tier-kenttä.
//
// Plan-taso kg johdetaan traceista, ei omalla kaavalla (instrumenttioppi 1):
//   Haara A  (SLOT_LOAD_RESOLVED)          → pct vs pctForResolve, pp-erona
//   Haara B  (PROGRESSION_TARGET_CROSSREF) → before.resolvedLoadKg = plan-taso kg
//
// READ-ONLY.
//
// ⚠ TÄMÄ EI OLE YLEINEN LOAD-DIFF-INSTRUMENTTI. Se mittaa poikkeamaa
// SUUNNITELLUSTA slot-tasosta. H-021 (23.8.) osoitti rajan konkreettisesti:
// e1RM-evidenssisuodatin muutti engine-pilotissa kaksi preskriptiota
// (vk 5 120 → 123,5 kg, vk 9 151 → 157 kg) ja neljä kalibrointikuormaa,
// mutta tämä sweep raportoi 442/442 bittitarkkaa. Syy on populaatiossa:
// sweep ajaa oman sessiosimulaationsa eri seedillä kuin scenario-runner,
// eikä sen kalibrointihistoria kehity samoin.
// AUKTORITATIIVINEN LOAD-DIFF on engine-pilotin trace-diff:
//   node tools/engine-pilot/run-pilot.mjs --profile=<p> --scenario=full-16w
//   → vertaa output/traces/<p>-full-16w.json kahden version välillä.
// Käytä tätä sweeppiä plan-%-kysymyksiin, älä "muuttuiko mikään" -kysymykseen.

import { recommend, getTodayPlan, createStreetlifting16WMesocycle, PRESET_MOVEMENTS }
  from "../engine-pilot/lib/engine-bridge.mjs";
import AKSELI from "../engine-pilot/profiles/akseli-elite-streetlifter.mjs";
import { simulateSet, rngForDay } from "../engine-pilot/lib/athlete-simulator.mjs";
import { writeFileSync } from "node:fs";

const bw = AKSELI.meta.bodyweightKg ?? 91;

// --cal={"kyykkyExtKg":185,...} → ohjelma rakennetaan atleetin todellisilla
// Asetukset-arvoilla. Ilman tätä preset käyttää oletuksia (kyykky 160), jolloin
// cross-ref-slottien plan-taso on matalampi kuin tuotannossa.
const calArg = process.argv.find(a => a.startsWith("--cal="));
const cal = calArg ? JSON.parse(calArg.slice(6)) : {};
const meso = createStreetlifting16WMesocycle(AKSELI.mesoConfig.startDateISO, cal);
if (calArg) console.log(`kalibrointi: ${JSON.stringify(meso.streetliftingConfig?.calibration)}`);

// --drop-weekdef=17 → poista viikkomäärittely ajon ajaksi. Eristää yksittäisen
// weekDef-rivin oman kuormavaikutuksen muista saman kierroksen muutoksista
// (H-022: vk 17 sai määrittelyn omassa commitissaan).
const dropArg = process.argv.find(a => a.startsWith("--drop-weekdef="));
if (dropArg) {
  const w = Number(dropArg.split("=")[1]);
  meso.weekDefs = (meso.weekDefs || []).filter(d => d.week !== w);
  console.log(`weekDef vk ${w} poistettu ajon ajaksi → weekDefs ${meso.weekDefs.length}`);
}

// Viikkoluokka: kevennys jos ohjelmoitu deltaPctBase < 0 (enginen oma määrittely,
// sama ehto kuin computeProgressionTarget-funktion isDeload).
const deltaByWeek = new Map((meso.weekDefs || []).map(w => [w.week, w.deltaPctBase]));
const isDeloadWeek = (wk) => (deltaByWeek.get(wk) ?? 0) < 0;

const cat = new Map();
for (const wp of meso.weekPlans) for (const d of wp.days) for (const s of d.slots) {
  const n = s.movementName || s.defaultMovementName;
  if (n && !cat.has(n)) {
    const p = PRESET_MOVEMENTS.find(m => m.name === n);
    cat.set(n, {
      movementId: n, name: n, category: s.category || "muu",
      isPrimary: s.role === "primary", isPreset: true,
      isCompetitionLift: !!s.competitionLift,
      loadType: s.competitionLift ? "system" : "external",
      ...(p ? { tier: p.tier, loadType: p.loadType ?? (s.competitionLift ? "system" : "external") } : {}),
    });
  }
}
const movements = [...cat.values()];

const iso = (dayIndex) => {
  const d = new Date(meso.startDateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dayIndex);
  return d.toISOString().slice(0, 10);
};

const allSets = [], sessions = [];
const branchA = [], crossRef = [], crossRefFinal = [], loads = [];

const dumpArg = process.argv.find(a => a.startsWith("--dump="));
const dumpKey = dumpArg
  ? (([d, mov]) => ({ day: d, mov: mov || null }))(dumpArg.slice(7).split(":"))
  : null;

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
    const dl = isDeloadWeek(wp.week);

    // ── Haara A: SLOT_LOAD_RESOLVED — pct (suunniteltu) vs pctForResolve (käytetty)
    for (const t of traces.filter(t => t.ruleId === "SLOT_LOAD_RESOLVED")) {
      const a = t.after || {}, b = t.before || {};
      if (typeof a.pct !== "number" || typeof a.pctForResolve !== "number") continue;
      branchA.push({
        wk: wp.week, dow: day.dayOfWeek, deload: dl, delta: deltaByWeek.get(wp.week) ?? null,
        mov: b.slotMovement, role: b.slotRole,
        planPct: a.pct, usedPct: a.pctForResolve, src: a.resolveSource, tier: a.tier,
        ppDiff: (a.pctForResolve - a.pct) * 100,
        resolvedLoadKg: a.resolvedLoadKg,
      });
    }

    // ── Haara B: PROGRESSION_TARGET_CROSSREF — before = plan-taso, after = progressoitu
    for (const t of traces.filter(t => t.ruleId === "PROGRESSION_TARGET_CROSSREF")) {
      const a = t.after || {}, b = t.before || {};
      if (typeof b.resolvedLoadKg !== "number" || typeof a.resolvedLoadKg !== "number") continue;
      const planKg = b.resolvedLoadKg, gotKg = a.resolvedLoadKg;
      crossRef.push({
        wk: wp.week, dow: day.dayOfWeek, deload: dl, delta: deltaByWeek.get(wp.week) ?? null,
        mov: a.slotMovement, ref: a.referenceMovement,
        planKg, gotKg, pctDiff: planKg > 0 ? ((gotKg - planKg) / planKg) * 100 : null,
        ruleHits: (a.ruleHits || []).join("+"),
      });
    }

    // ── Haara B LOPULLINEN: SLOT_LOAD_RESOLVED_CROSSREF (cap on jo ajettu)
    // A2:n cap ajetaan PROGRESSION_TARGET_CROSSREF-tracen JÄLKEEN, joten pelkkä
    // progressiovaiheen before/after ei kerro lopputulosta.
    for (const t of traces.filter(t => t.ruleId === "SLOT_LOAD_RESOLVED_CROSSREF")) {
      const a = t.after || {}, b = t.before || {};
      if (typeof a.resolvedLoadKg !== "number") continue;
      crossRefFinal.push({
        wk: wp.week, dow: day.dayOfWeek, deload: dl,
        mov: b.slotMovement, ref: b.referenceMovement,
        planKg: typeof a.planLoadKg === "number" ? a.planLoadKg : null,
        gotKg: a.resolvedLoadKg, source: a.resolveSource ?? null,
        pctDiff: typeof a.planLoadKg === "number" && a.planLoadKg > 0
          ? ((a.resolvedLoadKg - a.planLoadKg) / a.planLoadKg) * 100 : null,
      });
    }

    // ── LOAD-DIFF-dumppi: jokaisen slotin lopullinen kuorma (§9.4)
    (rec.dayPlan?.slots || []).forEach((s, i) => {
      loads.push({
        key: `w${wp.week}d${day.dayOfWeek}s${i}`,
        wk: wp.week, dow: day.dayOfWeek, idx: i,
        mov: s.movementName || s.defaultMovementName, role: s.role,
        kg: s.resolvedLoadKg ?? s.suggestedLoadKg ?? null,
      });
    });

    // --dump=w16d7[:Takakyykky] → kaikki kyseisen päivän kuormatracet (juurianalyysiin)
    if (dumpKey && dumpKey.day === `w${wp.week}d${day.dayOfWeek}`) {
      console.log(`\n--- TRACE-DUMP ${dumpKey.day}${dumpKey.mov ? " / " + dumpKey.mov : ""} ---`);
      for (const t of traces) {
        const j = JSON.stringify(t);
        if (dumpKey.mov && !j.includes(dumpKey.mov)) continue;
        if (!/LOAD|PROGRESSION|PLAN_PCT|DELOAD|ANCHOR|BREAK|CAP/.test(t.ruleId || "")) continue;
        console.log(`  ${t.ruleId}: ${JSON.stringify(t.after)}`);
      }
      console.log("--- /dump ---\n");
    }

    const rng = rngForDay(AKSELI, wp.week, day.dayOfWeek);
    const sid = `a2-w${wp.week}d${day.dayOfWeek}`;
    let c = 0; const sim = [];
    for (const s of (rec.dayPlan?.slots || [])) for (let k = 0; k < (s.sets ?? 0); k++) {
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

const TOL_PP = 2;      // A2/A3 toleranssi prosenttiyksikköinä (P3)
const TOL_PCT = 2;     // cross-ref: %-poikkeama plan-tasosta

const line = (n = 78) => "═".repeat(n);
console.log(`\n${line()}\nH-022 A2/A3 — PLAN-FLOOR-SWEEP (PRE/POST-mittari)\n${line()}`);
console.log(`Kevennysviikot (deltaPctBase < 0): ${[...deltaByWeek].filter(([, d]) => d < 0).map(([w]) => w).join(", ")}`);
console.log(`Ilman weekDefiä: ${meso.weekPlans.filter(w => !deltaByWeek.has(w.week)).map(w => w.week).join(", ") || "—"}\n`);

// ── HAARA A
const aOver = branchA.filter(r => r.ppDiff > TOL_PP);
console.log(`HAARA A (same-liike, SLOT_LOAD_RESOLVED): ${branchA.length} riviä, ylitys > ${TOL_PP} pp: ${aOver.length}`);
{
  const byW = {};
  for (const r of aOver) { const k = `vk ${String(r.wk).padStart(2)} (${r.deload ? "KEVENNYS" : "työviikko"})`; (byW[k] ||= []).push(r); }
  for (const k of Object.keys(byW).sort()) {
    const rs = byW[k], worst = rs.slice().sort((x, y) => y.ppDiff - x.ppDiff)[0];
    console.log(`  ${k}: ${String(rs.length).padStart(3)} slottia · pahin ${worst.mov} ${Math.round(worst.planPct * 100)} % → ${Math.round(worst.usedPct * 100)} % (+${worst.ppDiff.toFixed(1)} pp, ${worst.resolvedLoadKg} kg)`);
  }
  const dlRows = aOver.filter(r => r.deload);
  console.log(`  → kevennysviikoilla ${dlRows.length} · työviikoilla ${aOver.length - dlRows.length}`);
}

// ── HAARA B
const bOver = crossRef.filter(r => r.pctDiff != null && r.pctDiff > TOL_PCT);
console.log(`\nHAARA B (cross-ref, PROGRESSION_TARGET_CROSSREF): ${crossRef.length} riviä, nosto > ${TOL_PCT} %: ${bOver.length}`);
for (const r of bOver.slice().sort((x, y) => y.pctDiff - x.pctDiff)) {
  console.log(`  vk ${String(r.wk).padStart(2)} pv ${r.dow} ${r.deload ? "KEVENNYS " : "työviikko"} | ${String(r.mov).padEnd(14)} ← ${String(r.ref).padEnd(12)} | plan ${String(r.planKg).padStart(6)} kg → ${String(r.gotKg).padStart(6)} kg (+${r.pctDiff.toFixed(1)} %) | ${r.ruleHits}`);
}
{
  const dlRows = bOver.filter(r => r.deload);
  console.log(`  → kevennysviikoilla ${dlRows.length} · työviikoilla ${bOver.length - dlRows.length}`);
}

// ── HAARA B, LOPULLINEN ARVO (cap mukana)
const bFinalOver = crossRefFinal.filter(r => r.pctDiff != null && r.pctDiff > TOL_PCT);
console.log(`\nHAARA B — LOPULLINEN (SLOT_LOAD_RESOLVED_CROSSREF): ${crossRefFinal.length} riviä`);
if (crossRefFinal.every(r => r.planKg == null)) {
  console.log("  (plan-taso ei tracessa — vanha koodi, vertaa LOAD-DIFF-dumpilla)");
} else {
  console.log(`  yli plan-tason > ${TOL_PCT} %: ${bFinalOver.length}`);
  for (const r of bFinalOver.slice().sort((x, y) => y.pctDiff - x.pctDiff)) {
    console.log(`  vk ${String(r.wk).padStart(2)} pv ${r.dow} | ${String(r.mov).padEnd(14)} | plan ${r.planKg} kg → ${r.gotKg} kg (+${r.pctDiff.toFixed(1)} %) | ${r.source}`);
  }
  const bySrc = {};
  for (const r of crossRefFinal) bySrc[r.source ?? "?"] = (bySrc[r.source ?? "?"] || 0) + 1;
  console.log(`  sitova lähde: ${Object.entries(bySrc).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
}

const jsonArg = process.argv.find(a => a.startsWith("--json="));
if (jsonArg) {
  const out = { branchA, crossRef, crossRefFinal, loads,
    deloadWeeks: [...deltaByWeek].filter(([, d]) => d < 0).map(([w]) => w) };
  writeFileSync(jsonArg.slice(7), JSON.stringify(out, null, 1));
  console.log(`\nJSON → ${jsonArg.slice(7)}`);
}
console.log("");
