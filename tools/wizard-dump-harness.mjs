// wizard-dump-harness.mjs — KAPSTONI pilari 3 W1-dumppi (read-only diagnostiikka)
// Ajaa Wizard-mapperin + mesosykligeneraattorin + post-process-pipelinen 8 profiilille
// ja kirjoittaa SOKKOUTETUN dumpin (ohjelmat erillään tyylivalinnoista) → tools/output/wizard-dump-8profiles.md.
// EI engine-muutoksia. Replikoi index.html:n finalize-ketjun (4019→4122) uskollisesti.
import { writeFileSync, mkdirSync } from "node:fs";
globalThis.self = globalThis; // data.js IDB-tarkistus (engine-bridge-malli)

import {
  mapWizardToProgram,
  applySplitFilter, applyVolumeCap, applySessionFocusLabels, applyTierProgression,
  // Pilari 3 C2/C3: kalusto-suodatin + alaraaja-guarantor (osa index.html finalize-ketjua)
  applyEquipmentFilter, ensureLowerBody,
  // Pilari 3 R2 (A+C): aloitus-kapasiteetti-intensiteetti-degradaatio
  applyStartingCapacityDegradation,
  // Pilari 3 R2 (Cowork AUKKO 2): sessiotason slot.targetVx-propagaatio
  applyStartingCapacityToSlots,
  // Pilari 3 R2 (B): aikabudjetti rajaa työsarjat
  applyTimeBudgetCap,
  // Pilari 3 R3 (P2): hypertrofia MEV-floor + komposiitti-advisory
  applyHypertrophyMevFloor, mevTimeBudgetAdvisory,
  // Pilari 3 R2 (F): apuliike-tason vamma-suodatin
  applyInjuryFilter,
} from "../wizard/wizard-2b-mapper.js";
import { generateCustomMesocycle, generateMultiBlockMesocycle } from "../data.js";
import { WIZARD_PROFILES as profiles } from "./wizard-profiles.mjs"; // K5: jaettu profiilidata (dump + pilot)

const GEN_DATE = "2026-06-14"; // ohjelmien startDate-ankkuri (vakio → vertailukelpoisuus; EI dumpin generointipäivä)
const DUMP_DATE = "2026-07-01"; // dumpin re-generointipäivä (header) — eri kuin start-ankkuri
const APP_VERSION = "4.52.54";  // pidä synkassa sw.js APP_VERSION:in kanssa (header-tuoreusportti)

// ─────────────────────────────────────────────────────────────────────────
// 11 PROFIILIA — 33Q-vektorit. neutralNotes = persona ei määritä → neutraali/tyypillinen.
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// AJO: replikoi index.html finalize-ketju (4019 → 4122) per profiili.
// ─────────────────────────────────────────────────────────────────────────
function runProfile(p) {
  const cfg = { wizardId: `wiz_${p.id}`, schemaVersion: "3.3", completedAtISO: `${GEN_DATE}T10:00:00Z`, answers: p.answers };
  const out = { id: p.id, persona: p.persona, neutralNotes: p.neutralNotes, error: null };
  try {
    const mapped = mapWizardToProgram(cfg, null);
    let meso = mapped.isMultiBlock
      ? generateMultiBlockMesocycle(mapped, mapped.startDateISO)
      : generateCustomMesocycle(mapped, mapped.startDateISO);
    if (!meso.customConfig) meso.customConfig = {};
    meso.customConfig._wizardMeta = mapped._wizardMeta;
    const splitPref = cfg.answers.q21_splitPreference;
    if (mapped.isMultiBlock && Array.isArray(meso.customConfig?.blocks)) {
      meso.weekPlans = applySplitFilter(meso.weekPlans, splitPref);
      const capped = [];
      for (const block of meso.customConfig.blocks) {
        const bw = meso.weekPlans.filter(wp => wp.week >= block.startWeek && wp.week <= block.endWeek);
        capped.push(...applyVolumeCap(bw, block.goal));
      }
      meso.weekPlans = capped;
    } else {
      meso.weekPlans = applySplitFilter(meso.weekPlans, splitPref);
      meso.weekPlans = applyVolumeCap(meso.weekPlans, mapped.goal);
    }
    // Pilari 3 R2 (F): apuliike-tason vamma-suodatin (ennen kalusto-suodatinta)
    meso.weekPlans = applyInjuryFilter(meso.weekPlans, cfg.answers.q11_injuries);
    // Pilari 3 C2/C3: kalusto-suodatin + alaraaja-takuu (index.html finalize-ketju)
    meso.weekPlans = applyEquipmentFilter(meso.weekPlans, cfg.answers.q17_equipment);
    meso.weekPlans = ensureLowerBody(meso.weekPlans, cfg.answers.q17_equipment);
    // Pilari 3 R3 (P2): hypertrofia MEV-floor ENNEN aikabudjettia (aikabudjetti voittaa)
    meso.weekPlans = applyHypertrophyMevFloor(meso.weekPlans, meso.weekDefs, cfg.answers.q12_primaryGoal, mapped._wizardMeta?._capacityTriggers, cfg.answers.q17_equipment, cfg.answers.q11_injuries);
    // Pilari 3 R2 (B): aikabudjetti rajaa työsarjat (index.html finalize-ketju)
    meso.weekPlans = applyTimeBudgetCap(meso.weekPlans, cfg.answers.q24_frequency, mapped.goal);
    // Pilari 3 R2 (Cowork AUKKO 2): sessiotason slot.targetVx-propagaatio (näyttö = live)
    meso.weekPlans = applyStartingCapacityToSlots(meso.weekPlans, mapped._wizardMeta?._capacityTriggers);
    meso.weekPlans = applySessionFocusLabels(meso.weekPlans);
    // Pilari 3 R3 (P2): komposiitti-advisory POST-B (aikabudjetti trimmasi MEV-flooratun lihasryhmän)
    const _volAdv = mevTimeBudgetAdvisory(meso.weekPlans, meso.weekDefs, cfg.answers.q12_primaryGoal, mapped._wizardMeta?._capacityTriggers);
    if (_volAdv && mapped._wizardMeta) mapped._wizardMeta.goalConflictAdvisory = [mapped._wizardMeta.goalConflictAdvisory, _volAdv].filter(Boolean).join(" ");
    if (Array.isArray(meso.weekDefs)) {
      meso.weekDefs = applyTierProgression(meso.weekDefs, cfg.answers.q08_selfLevel, cfg.answers.q02_sex);
      // Pilari 3 R2 (A+C): aloitus-kapasiteetti-intensiteetti-degradaatio (index.html finalize-ketju)
      meso.weekDefs = applyStartingCapacityDegradation(meso.weekDefs, mapped._wizardMeta?._capacityTriggers);
    }
    out.mapped = mapped;
    out.meso = meso;
  } catch (e) {
    out.error = e.message + "\n" + (e.stack || "").split("\n").slice(0, 3).join("\n");
  }
  return out;
}

const results = profiles.map(runProfile);

// ─────────────────────────────────────────────────────────────────────────
// FORMATOINTI
// ─────────────────────────────────────────────────────────────────────────
function fmtSlots(slots) {
  return (slots || []).map(s => {
    const vx = (s.targetVx === null || s.targetVx === undefined) ? "—" : `V${s.targetVx}`;
    const v = s.variantName ? ` [${s.variantName}]` : "";
    return `      · ${s.role}: ${s.defaultMovementName}${v} — ${s.sets}×${s.reps} @ ${vx} (${s.category})`;
  }).join("\n");
}
function fmtProgramBlinded(r) {
  if (r.error) return `### ${r.id}\n> ${r.persona}\n\n**❌ GENEROINTI EPÄONNISTUI:** \`${r.error}\`\n`;
  const m = r.meso, mp = r.mapped;
  let s = `### ${r.id}\n> ${r.persona}\n\n`;
  s += `- **Liikevalinta (primaryt):** ${mp.primaries.map(x => x.name).join(" + ")}\n`;
  s += `- **Frekvenssi:** ${mp.daysPerWeek} pv/vk · **Palautumiskapasiteetti (johdettu):** ${mp.recoveryCapacity}\n`;
  // Pilari 3: rehellinen advisory (ristiriita / resurssirajoite / aloitusturvallisuus / MEV-aikabudjetti)
  const _gca = mp._wizardMeta && mp._wizardMeta.goalConflictAdvisory;
  if (_gca) s += `- **ℹ Huomio:** ${_gca}\n`;
  const materialized = Array.isArray(m.weekDefs) ? m.weekDefs.length : (m.weekPlans?.length || 0);
  let wcNote = "";
  if (typeof mp.weekCount === "number" && mp.weekCount !== materialized) wcNote += ` · mapper-aikomus ${mp.weekCount} vk`;
  if (m.weekCount !== materialized) wcNote += ` · ⚠ deklaroitu weekCount=${m.weekCount} ≠ materialisoitu ${materialized}`;
  s += `- **Periodisaatio:** ${materialized} vk (materialisoitu)${wcNote}${mp.isMultiBlock ? ` · MULTI-BLOKKI (blokkiperiodisaatio)` : ""}\n`;
  if (mp.isMultiBlock && Array.isArray(m.customConfig?.blocks)) {
    // Näytä blokkien GOAL-sekvenssi (rakenteellinen periodisaatio), EI style-nimeävää labelia
    s += `- **Blokkisekvenssi:** ${m.customConfig.blocks.map(b => `${b.goal} (vk ${b.startWeek}–${b.endWeek})`).join(" → ")}\n`;
  }
  s += `\n**Viikkomääritykset (periodisaatio/progressio — numeerinen, sokko):**\n`;
  // Labelit siirretty Section B:hen (jotkin labelit nimeävät tyylin, esim. "RP Min")
  s += (m.weekDefs || []).map(w => `  - vk ${w.week}: ΔPct ${w.deltaPctBase}% · pää ${w.heavyReps ?? "?"} × V${w.heavyTargetVx ?? "?"}`).join("\n");
  s += `\n\n**Viikko-ohjelmat (liikkeet · volyymi sets×reps · intensiteetti V):**\n`;
  // Näytä vk 1 + (jos eri) viimeinen vk edustavasti; muut tiivistettynä määränä
  const wpToShow = m.weekPlans.length <= 2 ? m.weekPlans : [m.weekPlans[0], m.weekPlans[m.weekPlans.length - 1]];
  for (const wp of wpToShow) {
    s += `  **Viikko ${wp.week}:**\n`;
    for (const d of (wp.days || [])) {
      s += `    Päivä (dow ${d.dayOfWeek}, ${d.dayType})${d.sessionFocus ? ` — fokus: ${d.sessionFocus}` : ""}:\n`;
      s += fmtSlots(d.slots) + "\n";
    }
  }
  if (m.weekPlans.length > 2) s += `  *(vk 2…${m.weekPlans.length - 1} rakenne progressoituu weekDefs-ΔPct:n mukaan; näytetty vk 1 + vk ${m.weekPlans.length})*\n`;
  return s;
}
function fmtStyle(r) {
  if (r.error) return `### ${r.id}\n**❌ generointi epäonnistui** (ks. Section A)\n`;
  const wm = r.meso.customConfig._wizardMeta || r.mapped._wizardMeta;
  let s = `### ${r.id} — ${r.persona.split(",")[0]}\n`;
  s += `- **VALITTU TYYLI:** \`${wm.chosenStyleId}\` — ${wm.chosenStyleLabel}\n`;
  const goalStr = r.mapped.isMultiBlock
    ? `multi-blokki [${(r.meso.customConfig?.blocks || []).map(b => b.goal).join(" → ")}]`
    : r.mapped.goal;
  s += `- **goal:** ${goalStr} · **skeleton:** ${r.meso.customConfig.skeletonFactoryName || (r.mapped.isMultiBlock ? "multi-block-chain" : "?")} · **weekCount:** ${r.meso.weekCount}\n`;
  s += `- **Top-3 kandidaatit (confidence):**\n`;
  s += (wm.styleCandidates || []).map((c, i) =>
    `    ${i + 1}. \`${c.styleId}\` (${c.label}) — **conf ${c.confidence}**` +
    (c.rationale && c.rationale.length ? `\n        rationale: ${c.rationale.join("; ")}` : "")
  ).join("\n");
  // Viikkomääritysten labelit (siirretty Section A:sta koska osa nimeää tyylin)
  const labels = (r.meso.weekDefs || []).map(w => `vk${w.week}: ${w.label}`).join(" · ");
  if (labels) s += `\n- **Viikko-labelit:** ${labels}\n`;
  s += "\n";
  return s;
}
function fmtVector(r) {
  let s = `### ${r.id}\n> ${r.persona}\n\n**33Q-vektori:**\n\`\`\`json\n${JSON.stringify(r.id ? profiles.find(p => p.id === r.id).answers : {}, null, 1)}\n\`\`\`\n`;
  s += `**Neutraalivalinnat (persona ei määritä → neutraali/tyypillinen):**\n`;
  s += r.neutralNotes.map(n => `- ${n}`).join("\n");
  s += "\n";
  return s;
}

const okCount = results.filter(r => !r.error).length;
let md = `# Wizard-dumppi — ${profiles.length} profiilia (KAPSTONI pilari 3, W1-standardi)

> **POST-FIX RE-DUMPPI — retroauditti K1–K6**. Generoitu ${DUMP_DATE} · APP_VERSION ${APP_VERSION} ·
> ohjelmien start-ankkuri ${GEN_DATE}. Ajettu repon oikealla Wizard-mapperilla
> (\`wizard/wizard-2b-mapper.js\` \`mapWizardToProgram\`) + mesosykligeneraattorilla (\`data.js\`) +
> KORJATULLA post-process-pipelinella (\`applySplitFilter\` → \`applyVolumeCap\` → \`applyInjuryFilter\` →
> \`applyEquipmentFilter\` → \`ensureLowerBody\` → \`applyHypertrophyMevFloor\` → \`applyTimeBudgetCap\` →
> \`applyStartingCapacityToSlots\` → \`applySessionFocusLabels\` → \`applyTierProgression\` →
> \`applyStartingCapacityDegradation\`), joka replikoi index.html:n finalize-ketjun.
> Round 1: goal-aware primaarit + K kategoria-slot-täyttö + kalusto-suodatin + alaraaja-takuu + P8 kehonpaino/advisory.
> Round 2 (A–F): A aloittelija-turvaraja (freq-cap + V3-aloitus, sessiotaso) · B aikabudjetti-cap ·
> C q34-palautuminen (volyymi −30 % + intensiteetti) · D primaari-demote (ei katoa) · E Käsipainosoutu-substituutio · F vamma-modified.
> Round 3 (P2 + P6): P2 hypertrofia MEV-floor (≥10 settiä/päälihas/vk, recovery/aikabudjetti voittaa + advisory) ·
> P6 kavennettu olkapää-blocklist (penkki säilyy, vain pystypunnerrus/dippi poistuu). P3 LYKÄTTY γ/M2 (pilotti bittitarkka).
> Round 4 (P2 jakautuminen): per-(sessio×liike)-katto 6 + add-movement yksiliikkeisille (olkapää HSPU+pystypunnerrus) +
> spread (selän duplikaatti-kasauma levitetty) → yksikään liike ei kasaa >6 sarjaa/sessio. Vain hypertrofia (P2/P9).
> Round 5 (P2 kalustovirhe): GHR→machines (ei bodyweight) + Käsipainopenkki→penkki-proxy + substituutit (käsipaino-lattiapunnerrus /
> Nordic ham / käsipaino-RDL) → yksikään liike ei vaadi q17:stä puuttuvaa kalustoa. Muuttaa P2/P8/P9/P11 (kalustorajoitteiset).
> Round 5b (P8 kalustovirhe): Lisäpainoleuanveto/dippi → painolähde-proxy (leukatanko/dip + käsipaino/tanko/laite); P8 (pelkkä
> leukatanko) → Leuanveto (kehonpaino). BOUNDED SCAN: kaikkien 11 profiilin liikkeet ↔ q17 → 11/11 puhdas (ei kalustorikkomuksia).
> Retroauditti K1–K6 (pilari 3 suljettu → jälkiauditti): MEV-floor-rajaukset (spread vain accessoryihin — primaari/backoff
> koskematon; deload-kynnys −0.20; lisätty liike perii viikon Vx:n) · duplikaatti-rivien merge (equipment+injury) · MEV-advisory
> post-aktivointi-toastiksi · UUSI assertoiva wizard-pilot Stop hookiin (löysi + korjasi: splitFilter pudotti demotatun primaarin
> — P7 vk4 Maastaveto palautettu) · RDL-kerrosristiriita → OBS-044. Näkyy dumpissa: P2/P9 Vx-perintä + merge-rivit, P7 vk4.
> mapper-versio 2D-gamma-v1.0. Mainappstate = null (synteettiset personat, ei DB-dataa).
>
> **Tulos: ${okCount}/${profiles.length} profiilia generoitui onnistuneesti.** (P1–P8 W2-perusprofiilit + P9–P11 pilari 3 (b) kalusto-kattavuuslisäys.)
>
> ## ⚠️ SOKKOUTUSOHJE W2-ARVIOIJALLE
> Tämä dumppi on **kolmessa erillisessä lohkossa**. Lue järjestyksessä:
> 1. **SECTION A — OHJELMAT (sokko):** lue VAIN ohjelmat. Arvioi kukin ohjelma ja **päättele itse mikä ohjelmointityyli se on** ja sopiiko se personalle. Tyylin nimeä EI ole tässä lohkossa.
> 2. **SECTION B — TYYLIVALINNAT:** vasta kun olet tehnyt sokkoarviot, lue todelliset tyylivalinnat + confidence + top-3 kandidaatit ja vertaa päätelmääsi.
> 3. **SECTION C — VEKTORIT + NEUTRAALIVALINNAT:** syöte-audit (33Q-vektorit + jokainen neutraalivalinta).
>
> Älä lue Section B ennen Section A:n arviota.

---

# SECTION A — GENEROIDUT OHJELMAT (sokko: tyyliä ei nimetty)

${results.map(fmtProgramBlinded).join("\n---\n\n")}

---
---

# SECTION B — WIZARDIN TYYLIVALINNAT (lue vasta Section A:n arvion jälkeen)

${results.map(fmtStyle).join("\n")}

---
---

# SECTION C — 33Q-VEKTORIT + NEUTRAALIVALINNAT (syöte-audit)

${results.map(fmtVector).join("\n---\n\n")}
`;

mkdirSync(new URL("../tools/output/", import.meta.url), { recursive: true });
writeFileSync(new URL("../tools/output/wizard-dump-8profiles.md", import.meta.url), md, "utf8");
console.log(`DUMP VALMIS: ${okCount}/${profiles.length} onnistui → tools/output/wizard-dump-8profiles.md (${md.length} merkkiä)`);
for (const r of results) {
  if (r.error) console.log(`  ${r.id}: ❌ ${r.error.split("\n")[0]}`);
  else console.log(`  ${r.id}: ✓ style=${(r.meso.customConfig._wizardMeta||r.mapped._wizardMeta).chosenStyleId} goal=${r.mapped.goal} weeks=${r.meso.weekCount} days=${r.mapped.daysPerWeek}${r.mapped.isMultiBlock?" MULTI":""}`);
}
