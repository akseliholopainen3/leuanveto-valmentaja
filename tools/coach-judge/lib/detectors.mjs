// detectors.mjs — OHJELMOINTIKONEEN AUDIT-DETEKTORIT
//
// Jokainen detektori vastaa yhteen vikaluokkaan joka on TODISTETTU tuotannossa
// 12.-13.8.2026 (Akselin kenttähavainnot O1-O9 + verifioinnit). Tarkoitus ei ole
// löytää "kaikkea" vaan estää näiden luokkien palaaminen — sama logiikka kuin
// lukkotesteillä, mutta koko kauden preskriptiopinnalla.
//
// Detektori saa syötteekseen coach-judgen prescriptions-JSONin (atleetille näkyvä
// resepti per slotti) ja palauttaa löydökset. Puhtaita funktioita, ei sivuvaikutuksia.
//
// KATTAVUUSRAJAUS (rehellisyys ennen täydellisyyttä):
// D4 vaatii lämmittelykuormat jotka nykyinen kaappaus ei säilytä numeroina →
// se raportoi RAJOITETTU eikä väitä puhdasta tulosta.

// ── Epley + Vara: kuorma × (1 + (toistot + vara) / 30) ──
const e1rmEpleyVara = (loadKg, reps, vx) =>
  (loadKg == null || reps == null) ? null : loadKg * (1 + (reps + (vx ?? 0)) / 30);

const pct = (a, b) => (b === 0 || b == null || a == null) ? null : (a / b - 1) * 100;

// ═══════════════════════════════════════════════════════════════
// D1 — RESEPTI_EPÄKOHERENTTI  (O3: 15×V4 @ 92,5 kg, historia 8×90 V2)
// ═══════════════════════════════════════════════════════════════
// Määrätty resepti implikoi e1RM:n joka on kaukana siitä mitä liikkeen oma
// edellinen sessio osoitti. Ei rangaista progressiosta — kynnys on väljä (+15 %).
function d1PrescriptionCoherence(p, cfg) {
  const { kuormaKg, toistotavoite, varaTavoite } = p.naytto;
  const hist = p.konteksti.edellisenSessionSarjat;
  if (kuormaKg == null || kuormaKg <= 0 || !toistotavoite || !hist?.length) return null;
  const targetE1 = e1rmEpleyVara(kuormaKg, toistotavoite, varaTavoite);
  const histE1 = Math.max(...hist.map(s => e1rmEpleyVara(s.loadKg, s.reps, s.vara) ?? 0));
  if (!targetE1 || !histE1) return null;
  // Lattia: jos historian kuormat ovat null/nollan tuntumassa (kuormaton apuliike
  // dry-run-harnessissa), suhdeluku räjähtää eikä kerro mitään. Verifiointi
  // 13.8.2026: ilman tätä pahin "löydös" oli +21172 % historiasta 0,3 kg.
  if (histE1 < cfg.d1MinHistE1RM) return null;
  const d = pct(targetE1, histE1);
  if (d == null || d <= cfg.d1ThresholdPct) return null;
  return {
    koodi: "RESEPTI_EPÄKOHERENTTI",
    vakavuus: d > 40 ? "KRIITTINEN" : "VAKAVA",
    viesti: `${p.naytto.sarjat}×${toistotavoite} V${varaTavoite} @ ${kuormaKg} kg implikoi e1RM ${targetE1.toFixed(1)} kg, mutta edellinen sessio osoitti ${histE1.toFixed(1)} kg (+${d.toFixed(0)} %)`,
    mitattu: { targetE1: +targetE1.toFixed(1), histE1: +histE1.toFixed(1), deltaPct: +d.toFixed(1) },
  };
}

// ═══════════════════════════════════════════════════════════════
// D2 — KUORMA_PUUTTUU  (49→231 slottia ilman kuormaa)
// ═══════════════════════════════════════════════════════════════
function d2MissingLoad(p) {
  if (p.naytto.kuormaKg != null) return null;
  if (/liikkuvuus|venytys|plank|hollow|kävely|hyppynaru/i.test(p.naytto.liike)) return null;
  return {
    koodi: "KUORMA_PUUTTUU",
    vakavuus: p.naytto.rooli === "primary" ? "KRIITTINEN" : "VAKAVA",
    viesti: `${p.naytto.liike} (${p.naytto.rooli}) ${p.naytto.sarjat}×${p.naytto.toistotavoite}: ei kuormaehdotusta — atletti ei tiedä mitä ladata`,
  };
}

// ═══════════════════════════════════════════════════════════════
// D3 — KUORMA_NOLLA  (O9: Muscle-up 0 kg V3-tavoitteella)
// ═══════════════════════════════════════════════════════════════
function d3ZeroLoad(p) {
  if (p.naytto.kuormaKg !== 0) return null;
  const v = p.naytto.varaTavoite;
  if (v != null && v >= 4) return null; // kevyt BW-tekniikkasarja on ok
  return {
    koodi: "KUORMA_NOLLA",
    vakavuus: "VAKAVA",
    viesti: `${p.naytto.liike} 0 kg mutta varatavoite V${v} (= lähellä maksimia). Kuorma clampautui nollaan tai fallback ei palautunut`,
  };
}

// ═══════════════════════════════════════════════════════════════
// D5 — VIIKKOHYPPY  (selittämätön kuormamuutos peräkkäisten esiintymien välillä)
// ═══════════════════════════════════════════════════════════════
function d5WeekJump(prescriptions, cfg) {
  const out = [];
  const byMov = new Map();
  for (const p of prescriptions) {
    if (p.naytto.kuormaKg == null || p.naytto.kuormaKg <= 0) continue;
    const k = `${p.naytto.liike}|${p.naytto.rooli}`;
    if (!byMov.has(k)) byMov.set(k, []);
    byMov.get(k).push(p);
  }
  for (const [k, list] of byMov) {
    list.sort((a, b) => (a.weekNum - b.weekNum) || (a.dayOfWeek - b.dayOfWeek));
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      const d = pct(b.naytto.kuormaKg, a.naytto.kuormaKg);
      if (d == null || Math.abs(d) < cfg.d5ThresholdPct) continue;
      // Deload-viikot ja taper ovat suunniteltuja pudotuksia — ei flagata alaspäin niissä
      const plannedDown = d < 0 && [4, 8, 12, 13, 14, 15, 16].includes(b.weekNum);
      if (plannedDown) continue;
      out.push({
        koodi: "VIIKKOHYPPY",
        vakavuus: Math.abs(d) > 25 ? "VAKAVA" : "HUOMIO",
        id: b.id, weekNum: b.weekNum, dayOfWeek: b.dayOfWeek, liike: b.naytto.liike,
        viesti: `${k}: vk${a.weekNum} ${a.naytto.kuormaKg} kg → vk${b.weekNum} ${b.naytto.kuormaKg} kg (${d > 0 ? "+" : ""}${d.toFixed(0)} %) ilman selittävää sääntöä`,
      });
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// D6 — VOLYYMI_IKKUNAN_ULKOPUOLELLA  (taper-romahdus: vk 15 oli −83 %)
// ═══════════════════════════════════════════════════════════════
// Ohjelman OMA siteeraama lähde (data.js, Bosquet 2007 + Pritchard 2016):
// taperin volyymileikkaus 41-60 %, ei 100 %.
function d6TaperVolume(prescriptions, cfg) {
  const weekSets = {};
  for (const p of prescriptions) weekSets[p.weekNum] = (weekSets[p.weekNum] || 0) + (p.naytto.sarjat || 0);
  const base = cfg.baselineWeeks.map(w => weekSets[w]).filter(n => n != null);
  if (base.length < 2) return [];
  const baseline = base.reduce((a, b) => a + b, 0) / base.length;
  const lo = baseline * (1 - cfg.taperMaxCutPct / 100);   // syvin sallittu
  const hi = baseline * (1 - cfg.taperMinCutPct / 100);   // matalin sallittu leikkaus
  const out = [];
  for (const w of cfg.taperWeeks) {
    const n = weekSets[w];
    if (n == null) continue;
    if (n >= lo && n <= hi) continue;
    const cut = (1 - n / baseline) * 100;
    out.push({
      koodi: "VOLYYMI_IKKUNAN_ULKOPUOLELLA",
      vakavuus: cut > 70 ? "VAKAVA" : "HUOMIO",
      weekNum: w,
      viesti: `vk ${w}: ${n} sarjaa = −${cut.toFixed(0)} % perustasosta ${baseline.toFixed(0)} (tutkimusikkuna −${cfg.taperMinCutPct}…−${cfg.taperMaxCutPct} % = ${lo.toFixed(0)}–${hi.toFixed(0)} sarjaa)`,
      mitattu: { sarjat: n, baseline: +baseline.toFixed(1), cutPct: +cut.toFixed(1) },
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// D7 — NARRATIIVI_RISTIRIITA  (O2: "viime kerta 160" kun raskain oli 177,5)
// ═══════════════════════════════════════════════════════════════
function d7NarrativeMismatch(p) {
  const ref = p._peili?.narratiiviViittaus;
  const real = p._peili?.todellinenRaskainEdellinen;
  if (ref == null || real == null || Math.abs(ref - real) <= 0.4) return null;
  return {
    koodi: "NARRATIIVI_RISTIRIITA",
    vakavuus: "HUOMIO",
    viesti: `"${p.naytto.miksiTamaPaino}" — mutta edellisen session raskain sarja oli ${real} kg, ei ${ref} kg`,
    mitattu: { narratiivi: ref, raskain: real },
  };
}

// ═══════════════════════════════════════════════════════════════
// D8 — BANNERI_RISTIRIIDASSA  (O1: "ei kevene automaattisesti" kun engine keventi)
// ═══════════════════════════════════════════════════════════════
function d8BannerContradiction(p) {
  const m = p._peili;
  if (!m?.engineKevensiOikeasti) return null;
  if (m.banneriVariantti !== "BLUE_MANUAL_ADVICE") return null;
  return {
    koodi: "BANNERI_RISTIRIIDASSA",
    vakavuus: "VAKAVA",
    viesti: `Banneri väittää "ehdotus ei kevene automaattisesti", mutta engine keventi −${((m.engineKevennysPct ?? 0) * 100).toFixed(0)} % ankkurista ${m.engineAnkkuriKg} kg`,
  };
}

export const DEFAULT_CFG = {
  d1ThresholdPct: 15,
  d1MinHistE1RM: 10,   // alle tämän historia on kuormaton apuliike, ei evidenssiä
  d5ThresholdPct: 25,  // viritetty 15 -> 25: alle sen on normaalia blokkiprogressiota
  taperWeeks: [13, 14, 15, 16],
  baselineWeeks: [9, 10, 11],
  taperMinCutPct: 41,
  taperMaxCutPct: 60,
};

export function runDetectors(prescriptions, cfg = DEFAULT_CFG) {
  const findings = [];
  const push = (p, f) => f && findings.push({
    id: p.id, weekNum: p.weekNum, dayOfWeek: p.dayOfWeek, liike: p.naytto.liike, rooli: p.naytto.rooli, ...f,
  });
  for (const p of prescriptions) {
    push(p, d1PrescriptionCoherence(p, cfg));
    push(p, d2MissingLoad(p));
    push(p, d3ZeroLoad(p));
    push(p, d7NarrativeMismatch(p));
    push(p, d8BannerContradiction(p));
  }
  findings.push(...d5WeekJump(prescriptions, cfg));
  findings.push(...d6TaperVolume(prescriptions, cfg));
  return findings;
}

export const KATTAVUUS_RAJAUS = [
  "D4 (lämmittelyhyppy) EI ole toteutettu: prescription-kaappaus ei säilytä lämmittelykuormia numeroina (`?×5`). Vaatii season-runnerin kaappauksen laajennuksen. O7 (117,5 → 167,5) EI siis ole tämän auditin kattama.",
  "D2 yliraportoi dry-run-harnessissa: kuormaton apuliike ei koskaan saa kuormaa historiaan → kehäpäätelmä. Tuotannossa atletti syöttää kuorman kerran. Lukua on tulkittava 'montako slottia EI saa kuormaehdotusta ensiesiintymällä', ei absoluuttisena.",
  "Detektorit katsovat vain recommend()-preskriptiopintaa. UI-kerroksen viat (kuollut koodi, löydettävyys, järjestys) eivät näy tässä — ne vaativat DOM-tason harnessin.",
];
