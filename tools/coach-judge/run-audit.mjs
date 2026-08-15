#!/usr/bin/env node
// run-audit.mjs — OHJELMOINTIKONEEN AUDIT
//
//   node tools/coach-judge/run-audit.mjs                 # kaikki profiilit, häiriöillä
//   node tools/coach-judge/run-audit.mjs --clean         # ilman häiriöitä (ohjelma sellaisenaan)
//   node tools/coach-judge/run-audit.mjs --profile=akseli-elite-streetlifter
//
// Ajaa kauden jokaiselle profiilille ja pyörittää detektorit koko preskriptiopinnalle.
// Tuotos: ranked findings + per-profiili-matriisi + kattavuusrajaus.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

import {
  createStreetlifting16WMesocycle, createDefaultMesocycle,
  createHypertrofiaMesocycle, createWendler531Mesocycle,
} from "../engine-pilot/lib/engine-bridge.mjs";
import { runSeason } from "./lib/season-runner.mjs";
import { runDetectors, DEFAULT_CFG, KATTAVUUS_RAJAUS } from "./lib/detectors.mjs";

import AKSELI from "../engine-pilot/profiles/akseli-elite-streetlifter.mjs";
import PL_ADV from "../engine-pilot/profiles/pl-advanced-male-75.mjs";
import BEG from "../engine-pilot/profiles/beginner-male-60.mjs";
import EL_F from "../engine-pilot/profiles/elite-female-hypertrophy-60.mjs";
import RET from "../engine-pilot/profiles/returner-3mo-break.mjs";
import SL_NOV from "../engine-pilot/profiles/streetlifter-novice-male-70.mjs";
import SL_MAS from "../engine-pilot/profiles/streetlifter-master-female-58.mjs";
import FULL_16W from "../engine-pilot/scenarios/full-16w.mjs";
import WIZARD_GEN from "../engine-pilot/scenarios/wizard-generated.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "output");
const PROFILES = [AKSELI, PL_ADV, BEG, EL_F, RET, SL_NOV, SL_MAS];
const SEV = { KRIITTINEN: 0, VAKAVA: 1, HUOMIO: 2 };

const buildMeso = p => {
  const t = p.mesoConfig.type, s = p.mesoConfig.startDateISO;
  if (t === "streetlifting_16w") return createStreetlifting16WMesocycle(s);
  if (t === "wendler531") return createWendler531Mesocycle(s);
  if (t === "hypertrofia") return createHypertrofiaMesocycle(s);
  return createDefaultMesocycle(s);
};
const scenarioFor = p => (p.mesoConfig.type === "streetlifting_16w" ? FULL_16W : WIZARD_GEN);

const CLEAN = { swapProb: 0, skipDayProb: 0, manualLoadProb: 0, partialSetsProb: 0, breaks: [] };
const PERTURBED = { swapProb: 0.12, skipDayProb: 0.08, manualLoadProb: 0.10, breaks: [] };

async function main() {
  const args = process.argv.slice(2);
  const clean = args.includes("--clean");
  const only = args.find(a => a.startsWith("--profile="))?.slice(10);
  const list = only ? PROFILES.filter(p => p.id === only) : PROFILES;
  mkdirSync(OUT, { recursive: true });

  const all = [];
  const perProfile = [];

  for (const profile of list) {
    const res = await runSeason({
      profile, scenario: scenarioFor(profile), mesocycle: buildMeso(profile),
      perturbationConfig: clean ? CLEAN : PERTURBED,
    });
    // Volyymi-ikkuna vain 16 vk:n ohjelmalle (muilla ei taper-rakennetta)
    const cfg = profile.mesoConfig.type === "streetlifting_16w"
      ? DEFAULT_CFG : { ...DEFAULT_CFG, taperWeeks: [], baselineWeeks: [] };
    const f = runDetectors(res.prescriptions, cfg).map(x => ({ ...x, profileId: profile.id }));
    all.push(...f);
    const bySev = { KRIITTINEN: 0, VAKAVA: 0, HUOMIO: 0 };
    for (const x of f) bySev[x.vakavuus] = (bySev[x.vakavuus] || 0) + 1;
    perProfile.push({ id: profile.id, reseptit: res.prescriptions.length, loydokset: f.length, ...bySev });
  }

  // ── Raportti ──
  const byCode = {};
  for (const f of all) {
    byCode[f.koodi] = byCode[f.koodi] || { n: 0, vakavuus: f.vakavuus, profiilit: new Set(), esim: f };
    byCode[f.koodi].n++;
    byCode[f.koodi].profiilit.add(f.profileId);
  }

  console.log(`\n${"═".repeat(78)}`);
  console.log(`OHJELMOINTIKONEEN AUDIT — ${clean ? "CLEAN (ohjelma sellaisenaan)" : "HÄIRIÖILLÄ (todellinen käyttö)"}`);
  console.log("═".repeat(78));
  console.log(`profiileja ${list.length} · reseptejä ${perProfile.reduce((a, b) => a + b.reseptit, 0)} · löydöksiä ${all.length}\n`);

  console.log("PER PROFIILI");
  console.log("─".repeat(78));
  console.log("profiili".padEnd(32) + "reseptit".padStart(9) + "🔴".padStart(5) + "🟠".padStart(5) + "🟡".padStart(5));
  for (const p of perProfile)
    console.log(p.id.padEnd(32) + String(p.reseptit).padStart(9) + String(p.KRIITTINEN).padStart(5) + String(p.VAKAVA).padStart(5) + String(p.HUOMIO).padStart(5));

  console.log("\nVIKALUOKAT (yleisyys × vakavuus)");
  console.log("─".repeat(78));
  const codes = Object.entries(byCode).sort((a, b) =>
    (SEV[a[1].vakavuus] - SEV[b[1].vakavuus]) || (b[1].n - a[1].n));
  for (const [code, v] of codes) {
    console.log(`\n[${v.vakavuus}] ${code} — ${v.n} osumaa, ${v.profiilit.size}/${list.length} profiilissa`);
    console.log(`   esim: vk${v.esim.weekNum} ${v.esim.liike} — ${v.esim.viesti}`);
  }

  console.log("\n\nKATTAVUUSRAJAUS (mitä tämä audit EI kata)");
  console.log("─".repeat(78));
  for (const r of KATTAVUUS_RAJAUS) console.log("· " + r);

  const file = join(OUT, `audit${clean ? "-clean" : ""}.json`);
  writeFileSync(file, JSON.stringify({
    meta: { clean, profiilit: list.map(p => p.id), cfg: DEFAULT_CFG },
    perProfile, findings: all, kattavuusRajaus: KATTAVUUS_RAJAUS,
  }, null, 2), "utf8");
  console.log(`\n→ ${file}`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
