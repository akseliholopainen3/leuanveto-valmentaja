#!/usr/bin/env node
// a1-binding-stage.mjs — H-022 A1 KANAVA 2: mikä vaihe SITOI lopullisen kuorman?
//
//   node tools/coach-judge/a1-binding-stage.mjs "<polku snapshot.json>"
//
// KORJATTU 23.8. (v2) — ensimmäisessä versiossa oli KAKSI omaa bugia jotka
// tuottivat siistin mutta väärän tuloksen ("976/976 sitojana vReps"):
//   1. PROGRESSION_TARGET-tracet EIVÄT kanna liikenimeä (before: {targetExternalLoad})
//      → liikepohjainen matcher ei osunut koskaan → sitoja putosi aina vRepsiin.
//   2. SLOT_LOAD_RESOLVED_CROSSREF ei kanna pctForResolve-kenttää → cross-ref-rivit
//      ohitettiin kokonaan, eli juuri se polku jonka Code mittasi sitojaksi 13.8.
// Molemmat korjattu alla. Opetus on sama kuin koko H-022:n: liian siisti tulos on
// instrumentin oire, ei löydös.
//
// READ-ONLY: lukee vain snapshotin.

import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) { console.error("Anna snapshot-polku argumenttina."); process.exit(1); }
const d = JSON.parse(readFileSync(path, "utf8"));
const T = d.decisionTraces || [];
const num = v => (typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" && !isNaN(+v) ? +v : null));

const byRec = new Map();
for (const t of T) {
  if (!byRec.has(t.recId)) byRec.set(t.recId, []);
  byRec.get(t.recId).push(t);
}

const crossref = [], slotres = [];

for (const [recId, ts] of byRec) {
  // Progressio on suositustason (ei liikekohtainen) — kerätään recId-tasolla.
  const prog = ts.find(t => t.ruleId === "PROGRESSION_TARGET");
  const progBefore = prog ? num((prog.before || {}).targetExternalLoad) : null;
  const progAfter = prog ? num((prog.after || {}).targetExternalLoad) : null;
  const progHits = prog ? ((prog.after || {}).ruleHits || []) : [];

  for (const t of ts) {
    const a = t.after || {}, b = t.before || {};
    const mov = b.slotMovement || a.slotMovement || null;
    const role = b.slotRole || a.slotRole || null;

    // ── CROSS-REF: plan = refE1RM × pct; jos resolved ≠ plan → myöhempi kerros sitoi
    if (t.ruleId === "SLOT_LOAD_RESOLVED_CROSSREF") {
      const pct = num(a.pct), ref = num(a.refE1RM), resolved = num(a.resolvedLoadKg);
      if (pct == null || ref == null || resolved == null) continue;
      const planLoad = ref * pct;
      const devPct = (resolved / planLoad - 1) * 100;
      crossref.push({ recId, mov, role, pct, ref, planLoad, resolved, devPct, progHits });
      continue;
    }

    // ── SLOT_LOAD_RESOLVED / _OWN: pct vs pctForResolve (= vReps-yliajo pct-tasolla)
    if (t.ruleId === "SLOT_LOAD_RESOLVED" || t.ruleId === "SLOT_LOAD_RESOLVED_OWN") {
      const pct = num(a.pct), used = num(a.pctForResolve), resolved = num(a.resolvedLoadKg);
      if (pct == null || used == null) continue;
      slotres.push({ recId, mov, role, pct, used, resolved, src: a.resolveSource || null,
        devPP: (used - pct) * 100, progBefore, progAfter, progHits });
    }
  }
}

const line = n => "─".repeat(n);
console.log(`\n${"═".repeat(78)}`);
console.log("H-022 A1 — KANAVA 2 (snapshot decisionTraces)");
console.log("═".repeat(78));
console.log(`traceja ${T.length} · suosituksia ${byRec.size}`);
console.log(`slot-resoluutioita ${slotres.length} · cross-ref-resoluutioita ${crossref.length}\n`);

// ── A. Cross-ref: sitooko suunniteltu prosentti? ──
console.log("A. CROSS-REF-POLKU (plan = refE1RM × pct)");
console.log(line(78));
const crDev = crossref.filter(r => Math.abs(r.devPct) > 2);
console.log(`  resoluutioita ${crossref.length} · poikkeaa plan-tasosta >2 %: ${crDev.length}`);
if (crDev.length) {
  const up = crDev.filter(r => r.devPct > 0).length;
  console.log(`  suunta: ${up} yli suunnitellun · ${crDev.length - up} alle`);
  console.log("\n  liike                  rooli       pct   plan-kg  resolv.  ero");
  for (const r of crDev.sort((a, b) => Math.abs(b.devPct) - Math.abs(a.devPct)).slice(0, 10))
    console.log("  " + String(r.mov || "?").padEnd(23) + String(r.role || "?").padEnd(10) +
      String((r.pct * 100).toFixed(0) + "%").padStart(5) + String(r.planLoad.toFixed(1)).padStart(10) +
      String(r.resolved).padStart(9) + String((r.devPct > 0 ? "+" : "") + r.devPct.toFixed(0) + "%").padStart(7));
} else if (crossref.length) {
  console.log("  → kaikki cross-ref-resoluutiot vastaavat suunniteltua ±2 % (tässä datassa)");
}

// ── B. vReps-yliajo pct-tasolla ──
console.log("\nB. vReps-YLIAJO pct-TASOLLA (SLOT_LOAD_RESOLVED)");
console.log(line(78));
const dev = slotres.filter(r => Math.abs(r.devPP) > 2);
const up2 = dev.filter(r => r.devPP > 0).length;
console.log(`  resoluutioita ${slotres.length} · poikkeaa >2 pp: ${dev.length} (${up2} ylös, ${dev.length - up2} alas)`);
const bySrc = {};
for (const r of dev) bySrc[r.src || "(ei)"] = (bySrc[r.src || "(ei)"] || 0) + 1;
console.log("  lähde: " + Object.entries(bySrc).map(([k, v]) => `${k} ${v}`).join(" · "));
console.log("\n  liike                  rooli      plan  käyt.   ero    kuorma");
for (const r of dev.sort((a, b) => Math.abs(b.devPP) - Math.abs(a.devPP)).slice(0, 8))
  console.log("  " + String(r.mov || "?").padEnd(23) + String(r.role || "?").padEnd(10) +
    String((r.pct * 100).toFixed(0) + "%").padStart(5) + String((r.used * 100).toFixed(0) + "%").padStart(7) +
    String((r.devPP > 0 ? "+" : "") + r.devPP.toFixed(0) + "pp").padStart(7) + String(r.resolved ?? "—").padStart(10));

// ── C. Progressio: nostiko se targetia? ──
console.log("\nC. PROGRESSIO (PROGRESSION_TARGET, suositustaso)");
console.log(line(78));
const progs = [...byRec.values()].map(ts => ts.find(t => t.ruleId === "PROGRESSION_TARGET")).filter(Boolean);
let raised = 0, lowered = 0, same = 0;
const hitCount = {};
for (const p of progs) {
  const bfr = num((p.before || {}).targetExternalLoad), aft = num((p.after || {}).targetExternalLoad);
  if (bfr != null && aft != null) { if (aft > bfr * 1.02) raised++; else if (aft < bfr * 0.98) lowered++; else same++; }
  for (const h of ((p.after || {}).ruleHits || [])) hitCount[h] = (hitCount[h] || 0) + 1;
}
console.log(`  progressio-traceja ${progs.length}: nosti ${raised} · laski ${lowered} · ennallaan ${same}`);
console.log("  sääntöosumat:");
for (const [k, v] of Object.entries(hitCount).sort((a, b) => b[1] - a[1]).slice(0, 8))
  console.log(`    ${String(v).padStart(5)}  ${k}`);

console.log("\nRAJOITE: tracet eivät kanna yhtä 'lopullinen target per slotti' -kenttää,");
console.log("joten sitovan vaiheen attribuutio per slotti vaatii kanava 1:n (harness).");
