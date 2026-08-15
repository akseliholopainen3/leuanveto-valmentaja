#!/usr/bin/env node
// score.mjs — pisteyttää AI-tuomarin mekaanisesti
//
//   node tools/coach-judge/score.mjs --judge=output/judge-flags.json
//
// TODISTUKSEN LOGIIKKA:
//   Totuuspohja lasketaan `_peili`-kentistä, joita tuomari EI nähnyt (make-chunks.mjs
//   riisuu ne). Tuomarin liput tulevat sokkoutetusta datasta. Näiden leikkaus
//   lasketaan koneellisesti — ei mallin itsearviona.
//
//   Recall  = kuinka moni totuuspohjan tapaus sai lipun  → löytääkö tuomari viat?
//   Kontrolli = lippufrekvenssi häiriöttömässä ajossa    → ylireagoiko tuomari?
//   UUSI    = liput jotka eivät osu mihinkään tunnettuun → löytääkö se jotain uutta?

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Totuuspohjan luokittelijat (_peili-kentistä, tuomarille näkymättömistä) ──
const GROUND_TRUTH = {
  "O1-banneri-valehtelee": (p) =>
    p._peili.banneriVariantti === "BLUE_MANUAL_ADVICE" && p._peili.engineKevensiOikeasti === true,
  "O2-viime-kerta-vaara": (p) =>
    p._peili.narratiiviViittaus != null && p._peili.todellinenRaskainEdellinen != null &&
    Math.abs(p._peili.narratiiviViittaus - p._peili.todellinenRaskainEdellinen) > 0.4,
  "O3-liikevaihto-resepti": (p) => p.hairiot.liikeVaihdettu != null,
  "O7-lammittelyhyppy": (p) =>
    typeof p._peili.rampinHyppyTyosarjaanPct === "number" && p._peili.rampinHyppyTyosarjaanPct >= 15,
  "O9-nollakuorma": (p) => p.naytto.kuormaKg === 0,
  "X-kuorma-puuttuu": (p) => p.naytto.kuormaKg == null,
};

function parseArgs(argv) {
  const a = { judge: null, profile: "akseli-elite-streetlifter" };
  for (const x of argv.slice(2)) {
    if (x.startsWith("--judge=")) a.judge = x.slice(8);
    else if (x.startsWith("--profile=")) a.profile = x.slice(10);
  }
  return a;
}

const args = parseArgs(process.argv);
if (!args.judge) { console.error("Anna --judge=<tiedosto>"); process.exit(1); }

const judge = JSON.parse(readFileSync(args.judge, "utf8"));
const load = (clean) => JSON.parse(readFileSync(
  join(__dirname, "output", `prescriptions-${args.profile}${clean ? "-clean" : ""}.json`), "utf8")).prescriptions;
const pert = load(false);
const clean = load(true);
const byId = new Map([...pert, ...clean].map(p => [p.id, p]));

const flagsH = judge.tuomarit.filter(t => t.run === "hairio").flatMap(t => t.flags || []);
const flagsK = judge.tuomarit.filter(t => t.run === "kontrolli").flatMap(t => t.flags || []);
const reviewedH = judge.tuomarit.filter(t => t.run === "hairio").reduce((s, t) => s + (t.reviewed_count || 0), 0);
const reviewedK = judge.tuomarit.filter(t => t.run === "kontrolli").reduce((s, t) => s + (t.reviewed_count || 0), 0);
const flaggedIdsH = new Set(flagsH.map(f => f.id));

console.log("═".repeat(74));
console.log("  AI-TUOMARIN PISTEYTYS — totuuspohja peilin sisäkentistä (tuomari ei nähnyt)");
console.log("═".repeat(74));
console.log(`\nHäiriöajo   : ${flagsH.length} lippua / ${reviewedH} ruutua  (${(flagsH.length / reviewedH * 100).toFixed(1)} %)`);
console.log(`Kontrolliajo: ${flagsK.length} lippua / ${reviewedK} ruutua  (${(flagsK.length / reviewedK * 100).toFixed(1)} %)`);

console.log(`\n── RECALL: löysikö tuomari tunnetut viat? ──`);
console.log(`${"luokka".padEnd(26)} ${"tapauksia".padStart(9)} ${"liputettu".padStart(9)} ${"recall".padStart(8)}`);
console.log("─".repeat(74));
const matchedIds = new Set();
let anyRecall = false;
for (const [name, fn] of Object.entries(GROUND_TRUTH)) {
  const cases = pert.filter(fn);
  const hit = cases.filter(c => flaggedIdsH.has(c.id));
  hit.forEach(h => matchedIds.add(h.id));
  const r = cases.length ? (hit.length / cases.length * 100) : null;
  if (cases.length) anyRecall = true;
  console.log(`${name.padEnd(26)} ${String(cases.length).padStart(9)} ${String(hit.length).padStart(9)} ${(r === null ? "—" : r.toFixed(0) + " %").padStart(8)}`);
}

console.log(`\n── UUDET LÖYDÖKSET: liput jotka eivät osu mihinkään tunnettuun ──`);
const novel = flagsH.filter(f => !matchedIds.has(f.id));
const byCat = {};
for (const f of novel) (byCat[f.luokka] = byCat[f.luokka] || []).push(f);
const cats = Object.entries(byCat).sort((a, b) => b[1].length - a[1].length);
console.log(`${novel.length} lippua · ${cats.length} luokkaa\n`);
for (const [cat, fs] of cats.slice(0, 12)) {
  const sev = fs.filter(x => x.vakavuus === "KRIITTINEN").length;
  console.log(`  ${cat}  (${fs.length}${sev ? `, ${sev} kriittistä` : ""})`);
  console.log(`     ${fs[0].mita_nakyy}`);
  console.log(`     → ${fs[0].miksi_vialla}\n`);
}

console.log("─".repeat(74));
console.log(`VERDIKTI:`);
const ctrlRate = flagsK.length / reviewedK;
const pertRate = flagsH.length / reviewedH;
console.log(`  · signaali/kohina : häiriöajo liputti ${(pertRate / (ctrlRate || 1e-9)).toFixed(1)}× kontrollia tiheämmin`);
console.log(`  · uusia luokkia   : ${cats.length}`);
console.log(`  · tunnettuja      : ${matchedIds.size} ruutua osui totuuspohjaan`);
if (!anyRecall) console.log(`  ⚠ totuuspohja tyhjä — tarkista _peili-kentät`);
