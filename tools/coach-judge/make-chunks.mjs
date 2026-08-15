#!/usr/bin/env node
// make-chunks.mjs — valmistelee reseptit AI-tuomarille
//
//   node tools/coach-judge/make-chunks.mjs --profile=akseli-elite-streetlifter --chunks=8
//
// VALIDITEETTISÄÄNTÖ: `_peili`-kenttä RIISUTAAN. Se sisältää peilin sisäisiä
// vihjeitä (todellinen raskain sarja, banneri-variantti, rampin hyppyprosentti)
// joita atletti ei näe ruudulla. Jos tuomari näkisi ne, se ei enää LÖYTÄISI
// vikoja vaan lukisi vastaukset — ja koko todiste romahtaisi.
//
// Tuomari saa täsmälleen sen mitä atletti näkee + sen kontekstin jonka atletti
// voi kaivaa sovelluksesta esiin. Ei enempää.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "output");

function parseArgs(argv) {
  const a = { profile: "akseli-elite-streetlifter", chunks: 8, clean: false };
  for (const x of argv.slice(2)) {
    if (x.startsWith("--profile=")) a.profile = x.slice(10);
    else if (x.startsWith("--chunks=")) a.chunks = parseInt(x.slice(9), 10);
    else if (x === "--clean") a.clean = true;
  }
  return a;
}

const args = parseArgs(process.argv);
const src = join(OUT, `prescriptions-${args.profile}${args.clean ? "-clean" : ""}.json`);
const data = JSON.parse(readFileSync(src, "utf8"));

// Riisu vihjekentät + häiriömetatieto (tuomarin ei pidä tietää että liike vaihdettiin
// — sen pitää huomata epäkoherenssi ITSE reseptistä).
const blinded = data.prescriptions.map(p => ({
  id: p.id,
  viikko: p.weekNum,
  paiva: p.dayOfWeek,
  pvm: p.dateISO,
  viikkoLeima: p.weekLabel,
  paivaTyyppi: p.dayType,
  naytto: p.naytto,
  konteksti: p.konteksti,
}));

const per = Math.ceil(blinded.length / args.chunks);
mkdirSync(join(OUT, "chunks"), { recursive: true });
const files = [];
for (let i = 0; i < args.chunks; i++) {
  const slice = blinded.slice(i * per, (i + 1) * per);
  if (!slice.length) continue;
  const f = join(OUT, "chunks", `${args.profile}${args.clean ? "-clean" : ""}-${String(i).padStart(2, "0")}.json`);
  writeFileSync(f, JSON.stringify(slice, null, 1), "utf8");
  files.push({ file: f, count: slice.length });
}
console.log(`${blinded.length} reseptiä → ${files.length} palaa`);
for (const f of files) console.log(`  ${f.file}  (${f.count})`);
