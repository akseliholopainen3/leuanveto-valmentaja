#!/usr/bin/env node
// run-season.mjs — CLI
//
//   node tools/coach-judge/run-season.mjs --profile=akseli-elite-streetlifter
//   node tools/coach-judge/run-season.mjs --profile=all
//   node tools/coach-judge/run-season.mjs --profile=akseli-elite-streetlifter --clean
//
// --clean = ei häiriöitä (kontrolliajo). Käytetään tuomarin väärien positiivisten
//           mittaamiseen: puhtaassa ajossa lippujen pitäisi olla harvassa.
//
// Tuotos: tools/coach-judge/output/prescriptions-<profile>[-clean].json
//         = lista atleetille näkyviä reseptejä → syöte AI-tuomarille.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

import {
  createStreetlifting16WMesocycle, createDefaultMesocycle,
  createHypertrofiaMesocycle, createWendler531Mesocycle,
} from "../engine-pilot/lib/engine-bridge.mjs";
import { runSeason } from "./lib/season-runner.mjs";

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

const PROFILES = {
  "akseli-elite-streetlifter": AKSELI,
  "pl-advanced-male-75": PL_ADV,
  "beginner-male-60": BEG,
  "elite-female-hypertrophy-60": EL_F,
  "returner-3mo-break": RET,
  "streetlifter-novice-male-70": SL_NOV,
  "streetlifter-master-female-58": SL_MAS,
};

// Häiriöprofiili per atletti — kuvaa TODELLISTA käyttäytymistä.
// Akselille: mökkiloma vk 13 (ohjelmassa jo lepoviikko) + kohtalainen vaihtotaipumus.
const PERTURBATION = {
  "akseli-elite-streetlifter": {
    swapProb: 0.12, skipDayProb: 0.06, manualLoadProb: 0.12,
    breaks: [{ afterWeek: 12, weeks: 1 }],
  },
  "returner-3mo-break": {
    swapProb: 0.18, skipDayProb: 0.14, manualLoadProb: 0.10,
    breaks: [{ afterWeek: 5, weeks: 3 }],
  },
  _default: { swapProb: 0.10, skipDayProb: 0.08, manualLoadProb: 0.08, breaks: [] },
};
const CLEAN = { swapProb: 0, skipDayProb: 0, manualLoadProb: 0, partialSetsProb: 0, breaks: [] };

function buildMesocycle(profile) {
  const t = profile.mesoConfig.type;
  const start = profile.mesoConfig.startDateISO;
  if (t === "streetlifting_16w") return createStreetlifting16WMesocycle(start);
  if (t === "wendler531") return createWendler531Mesocycle(start);
  if (t === "hypertrofia") return createHypertrofiaMesocycle(start);
  return createDefaultMesocycle(start);
}
const defaultScenario = (p) => (p.mesoConfig.type === "streetlifting_16w" ? FULL_16W : WIZARD_GEN);

function parseArgs(argv) {
  const a = { profile: "akseli-elite-streetlifter", clean: false };
  for (const x of argv.slice(2)) {
    if (x.startsWith("--profile=")) a.profile = x.slice(10);
    else if (x === "--clean") a.clean = true;
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv);
  const list = args.profile === "all" ? Object.values(PROFILES) : [PROFILES[args.profile]].filter(Boolean);
  if (!list.length) {
    console.error(`Tuntematon profiili: ${args.profile}\nKäytettävissä: ${Object.keys(PROFILES).join(", ")}`);
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });

  for (const profile of list) {
    const scenario = defaultScenario(profile);
    const mesocycle = buildMesocycle(profile);
    const cfg = args.clean ? CLEAN : (PERTURBATION[profile.id] || PERTURBATION._default);
    const res = await runSeason({ profile, scenario, mesocycle, perturbationConfig: cfg });

    const swaps = res.events.filter(e => e.type === "SWAP").length;
    const skips = res.events.filter(e => e.type === "SKIP_DAY").length;
    const breaks = res.events.filter(e => e.type === "BREAK").length;
    console.log(`\n[${profile.id}]${args.clean ? " (CLEAN)" : ""}`);
    console.log(`  päiviä treenattu : ${res.daysTrained}/${res.daysPlanned}`);
    console.log(`  reseptejä        : ${res.prescriptions.length}`);
    console.log(`  settejä          : ${res.setsTotal}`);
    console.log(`  häiriöt          : ${swaps} liikevaihtoa · ${skips} väliin jäänyttä · ${breaks} taukopäivää`);
    if (res.errors.length) console.log(`  ⚠ virheitä       : ${res.errors.length} (${res.errors[0]?.message})`);

    const file = join(OUT, `prescriptions-${profile.id}${args.clean ? "-clean" : ""}.json`);
    writeFileSync(file, JSON.stringify({
      meta: {
        profileId: profile.id, scenarioId: res.scenarioId,
        clean: args.clean, perturbation: cfg,
        daysTrained: res.daysTrained, daysPlanned: res.daysPlanned,
      },
      events: res.events,
      errors: res.errors,
      prescriptions: res.prescriptions,
    }, null, 2), "utf8");
    console.log(`  → ${file}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
