// ui-mirror.mjs — index.html:n atleetille näkyvien johdannaisten USKOLLINEN PEILI
//
// ⚠️  KRIITTINEN SÄÄNTÖ: TÄMÄ TIEDOSTO PEILAA, EI KORJAA.
//
// Jokainen funktio tässä reprodusoi index.html:n logiikan TÄSMÄLLEEN sellaisena kuin
// se on — bugit mukaan lukien. Jos peili "korjaisi" bugin, tuomari näkisi ruudun jota
// atletti ei koskaan näe, ja koko harness menettäisi todistusarvonsa.
//
// Jokainen funktio kantaa lähdeviitteen (index.html:<rivi>). Kun index.html muuttuu,
// tämä tiedosto on päivitettävä samassa commitissa — muuten peili ajautuu hiljaa.
//
// Peilatut lokukset:
//   mirrorPriorSessionSummary  ← index.html:5826-5868  (computePriorSessionSummary)
//   mirrorLoadRationale        ← index.html:7131-7143  ("Miksi tämä paino? · viime kerta X")
//   mirrorBreakBanner          ← index.html:7516-7547  (paluuramppi-banneri + dead-code-haara)
//   mirrorPrevSessionLine      ← index.html:5870+      ("EDELLINEN KERTA · N PV SITTEN")

// ── index.html:5826-5868 ─────────────────────────────────────────────────────
// HUOM: kenttä `heaviest` EI ole raskain kuorma vaan suurimman TONNAASIN sarja
// (load × reps). Alkuperäinen kommentti rivillä 5851 myöntää tämän
// ("max load × reps tonnage proxy"), mutta kenttänimi ja sen kuluttaja (7132)
// lukevat sitä "viime kerran kuormana". Peili säilyttää tämän sellaisenaan.
export function mirrorPriorSessionSummary(allSets, sessions, movementId, excludeSessionId) {
  if (!movementId) return null;
  const completedSets = allSets
    .filter(s => s.movementId === movementId && !s.isWarmup
      && s.setRole !== "skipped" && s.reps !== null && s.reps !== undefined)
    .filter(s => {
      const sess = sessions.find(x => x.sessionId === s.sessionId);
      return sess && sess.sessionId !== excludeSessionId;
    });
  if (!completedSets.length) return null;

  const sessionMap = {};
  for (const s of completedSets) {
    if (!sessionMap[s.sessionId]) sessionMap[s.sessionId] = [];
    sessionMap[s.sessionId].push(s);
  }
  const grouped = Object.entries(sessionMap)
    .map(([sid, sets]) => ({
      sessionId: sid,
      dateISO: sessions.find(x => x.sessionId === sid)?.dateISO || "",
      sets: sets.slice().sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || "")),
    }))
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO));

  const latestSession = grouped[0];
  const sets = latestSession.sets;

  // ← index.html:5852-5856 — TONNAASI-maksimi, ei kuorma-maksimi. PEILATTU SELLAISENAAN.
  const heaviest = sets.reduce((max, s) => {
    const tonn = (s.externalLoadKg || 0) * (s.reps || 0);
    const maxTonn = (max?.externalLoadKg || 0) * (max?.reps || 0);
    return tonn > maxTonn ? s : max;
  }, sets[0]);

  const loads = sets.map(s => s.externalLoadKg);
  const uniformLoad = loads.every(l => l === loads[0]);

  return {
    dateISO: latestSession.dateISO,
    setCount: sets.length,
    sets,
    heaviest,
    uniformLoad,
    avgLoad: loads.reduce((a, b) => a + b, 0) / loads.length,
    // Peilin lisäkenttä (EI index.html:ssä) — kertoo tuomarille mitä atletti OLISI
    // odottanut näkevänsä. Käytetään vain raportointiin, ei UI-tekstin tuottamiseen.
    _trueHeaviestLoadKg: sets.reduce((m, s) => Math.max(m, s.externalLoadKg || 0), 0),
  };
}

// ── index.html:7131-7143 ─────────────────────────────────────────────────────
// "🧭 Miksi tämä paino? · viime kerta X → nyt Y kg (±Z %)"
export function mirrorLoadRationale(priorSummary, currentLoadKg) {
  const prev = priorSummary?.heaviest?.externalLoadKg ?? null;
  const cur = currentLoadKg ?? null;
  if (prev != null && cur != null && prev > 0) {
    const d = cur - prev;
    const pct = Math.round((cur / prev - 1) * 100);
    if (d > 0.25) return { text: `viime kerta ${prev} → nyt ${cur} kg (+${pct} %)`, prevRef: prev, pct };
    if (d < -0.25) return { text: `viime kerta ${prev} → nyt ${cur} kg (${pct} %)`, prevRef: prev, pct };
    return { text: `sama taso kuin viime kerralla (${prev} kg)`, prevRef: prev, pct: 0 };
  }
  if (cur != null) return { text: "ensimmäinen kirjaus tälle liikkeelle", prevRef: null, pct: null };
  return { text: "", prevRef: null, pct: null };
}

// ── index.html:5870+ ─────────────────────────────────────────────────────────
// "EDELLINEN KERTA · N PV SITTEN": 177.5×1V1 · 167.5×2V1 · 160×3V2 …
// Tämä on ERI lähde kuin mirrorLoadRationale — se näyttää RAAKASARJAT.
// Juuri tämä rinnakkaisuus tekee ristiriidan atleetille näkyväksi.
export function mirrorPrevSessionLine(priorSummary, todayISO, maxShown = 4) {
  if (!priorSummary) return null;
  const shown = priorSummary.sets.slice(0, maxShown).map(s =>
    `${s.externalLoadKg == null ? "—" : s.externalLoadKg}×${s.reps}V${s.vara ?? "?"}`);
  const hidden = Math.max(0, priorSummary.sets.length - maxShown);
  const days = daysBetween(priorSummary.dateISO, todayISO);
  return {
    text: shown.join(" · ") + (hidden > 0 ? ` +${hidden}` : ""),
    daysAgo: days,
    label: days >= 14 ? `${Math.round(days / 7)} VK SITTEN` : `${days} PV SITTEN`,
    setsRaw: priorSummary.sets.map(s => ({
      loadKg: s.externalLoadKg, reps: s.reps, vara: s.vara, setRole: s.setRole,
    })),
  };
}

// ── index.html:7516-7547 ─────────────────────────────────────────────────────
// Paluuramppi-banneri. KRIITTINEN PEILATTU BUGI (O1):
// rivi 7525 lukee `state.recommendation?.slots`, mutta recommend() palauttaa slotit
// polussa `rec.dayPlan.slots` — ylätason `slots`-kenttää EI OLE. Siksi vihreä
// "Paluuramppi käynnissä" -haara on kuollutta koodia ja atletti näkee AINA sinisen
// "ei kevene automaattisesti" -bannerin, myös silloin kun engine keventi kuorman.
export function mirrorBreakBanner({ rec, exerciseName, movementId, allSets, todayISO, slotReload }) {
  // Peilaa rivin 7525 lookup: ylätason rec.slots (ei dayPlan.slots).
  const topLevelSlots = rec?.slots || [];
  const _rl = topLevelSlots.find(s =>
    s.role === "primary" && s._reload && s.defaultMovementName === exerciseName)?._reload;

  if (_rl) {
    return {
      variant: "GREEN_RELOAD_ACTIVE",
      text: `↩ Paluuramppi käynnissä — tauko ${_rl.breakDays} pv. Kevennys −${(_rl.reloadPct * 100).toFixed(0)} % tauon-edeltävästä (${_rl.anchorKg} kg).`,
      deadCodeReached: true,
    };
  }

  const hist = allSets.filter(s =>
    s.movementId === movementId && s.setRole !== "warmup" &&
    s.setRole !== "skipped" && s.reps != null && s.timestamp);
  if (!hist.length) return null;
  let maxTs = 0;
  for (const s of hist) { const t = new Date(s.timestamp).getTime(); if (t > maxTs) maxTs = t; }
  const gapDays = Math.floor((new Date(todayISO + "T18:00:00Z").getTime() - maxTs) / 86400000);
  if (gapDays < 14) return null;

  return {
    variant: "BLUE_MANUAL_ADVICE",
    text: `↩ Paluu tauolta — edellinen ${exerciseName}-suoritus ${gapDays} pv sitten. Ehdotus ei kevene automaattisesti: 1. paluusessio −15–20 % ehdotuksesta (napauta lukua) · ei kalibrointisettiä · ei V0-grindiä.`,
    gapDays,
    // Peilin lisäkenttä: onko engine TOSIASIASSA jo keventänyt? Jos on, bannerin
    // väite "ei kevene automaattisesti" on ristiriidassa kuorman kanssa.
    _engineActuallyReloaded: !!slotReload,
    _engineReloadPct: slotReload?.reloadPct ?? null,
    _engineAnchorKg: slotReload?.anchorKg ?? null,
  };
}

// ── index.html:13622-13696 ───────────────────────────────────────────────────
// Lämmittelyramppi. PEILATTU SELLAISENAAN, mukaan lukien kaksi rakenteellista
// piirrettä jotka ovat tuomarin kannalta olennaisia:
//   1. `if (!isPeakingMeso)` — peaking-mesosyklissä ramppia EI rakenneta lainkaan
//   2. wuLoad = rec.targetExternalLoad = PRIMARYn kuorma. Ramppi liitetään
//      ramp-carrier-liikkeeseen (13802). Jos carrier ≠ primary, prosentit lasketaan
//      eri liikkeen kuormasta kuin mihin ne liitetään.
//   3. Rampin viimeisen portaan ja työsarjan väliin ei ole mitään gap-tarkistusta.
const RAMP_FALLBACK_60 = [0, 0.30, 0.55, 0.75, 0.90];
const RAMP_FALLBACK_30 = [0, 0.50, 0.80];
const RAMP_FALLBACK_20 = [0, 0.60];

export function mirrorWarmupRamp({ rec, isPeakingMeso, roundToHalf = (v) => Math.round(v * 2) / 2 }) {
  if (isPeakingMeso) {
    return { rows: [], suppressedBy: "isPeakingMeso", jumpToWorkPct: null };
  }
  const wuLoad = rec?.targetExternalLoad;
  const primarySlot = rec?.dayPlan?.slots?.find(s => s.role === "primary");
  const skeletonRamp = Array.isArray(primarySlot?.warmupSets) && primarySlot.warmupSets.length > 0
    ? primarySlot.warmupSets : null;

  const isBWAdded = primarySlot && (
    primarySlot.category === "vertikaaliveto" ||
    (primarySlot.category === "horisontaalityöntö" &&
      (primarySlot.defaultMovementName || "").toLowerCase().includes("dippi")));
  const microLoad = isBWAdded && typeof wuLoad === "number" && wuLoad > 0 && wuLoad < 10;

  const pcts = microLoad ? null
    : skeletonRamp && wuLoad ? [0, ...skeletonRamp.map(r => r.pct).filter(p => typeof p === "number")]
    : wuLoad && wuLoad >= 60 ? RAMP_FALLBACK_60
    : wuLoad && wuLoad >= 30 ? RAMP_FALLBACK_30
    : wuLoad && wuLoad >= 20 ? RAMP_FALLBACK_20
    : null;

  if (!pcts) {
    return { rows: [], suppressedBy: microLoad ? "microLoad→BW-fallback" : "noLoad→BW-fallback", jumpToWorkPct: null };
  }

  const rows = pcts.map((pct, i) => {
    const skel = skeletonRamp ? skeletonRamp[i - 1] : null;
    return {
      pct,
      loadKg: roundToHalf(wuLoad * pct),
      reps: skel?.reps ?? (pct === 0 ? 5 : pct < 0.7 ? 3 : 2),
      note: skel?.note ?? null,
    };
  });

  // Viimeisen lämmittelyportaan ja työsarjan välinen hyppy — O7:n mittari.
  const lastPct = pcts[pcts.length - 1];
  return {
    rows,
    suppressedBy: null,
    rampBaseKg: wuLoad,
    rampBaseMovement: primarySlot?.movementName || primarySlot?.defaultMovementName || null,
    jumpToWorkPct: typeof lastPct === "number" ? Math.round((1 - lastPct) * 1000) / 10 : null,
  };
}

export function daysBetween(fromISO, toISO) {
  if (!fromISO || !toISO) return null;
  const a = new Date(fromISO + "T00:00:00Z").getTime();
  const b = new Date(toISO + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}
