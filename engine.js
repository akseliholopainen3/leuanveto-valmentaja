// engine.js — Computation engine: e1RM, baselines, readiness, recommend(), mesocycle, decisionTrace
// LeVe Coach v1.0.0

import {
  uid, todayISO, parseNumericInput,
  getAllSessions, getSetsForSession, getAllSets, getSetsForMovement,
  getActiveMesocycle, saveMesocycle, createDefaultMesocycle,
  getSettings, saveBaseline, getBaseline,
  saveRecommendation, saveDecisionTrace,
  getAllMovements, getMovementProgress, saveMovementProgress,
  getMeasurementsByType,
  getAllMesocycles,
} from "./data.js";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const DAY_TYPE_MULTIPLIERS = {
  heavy: 1.0,
  volume: 0.6,
  speed: 0.4,
  accessory: 0.0,
  rest: 0,
};

const DAY_TYPE_SET_RECIPES = {
  heavy: { sets: 3, repsRange: [2, 3], targetVxRange: [1, 2] },
  volume: { sets: [4, 5], repsRange: [4, 6], targetVxRange: [2, 3] },
  speed: { sets: [4, 5], repsRange: [2, 2], targetVxRange: [4, 5] },
};

const READINESS_CLASSES = { GREEN: 0, YELLOW: 1, RED: 2 };

// ═══════════════════════════════════════════════════════════════
// MATH UTILITIES
// ═══════════════════════════════════════════════════════════════

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mad(arr) {
  const med = median(arr);
  return median(arr.map((x) => Math.abs(x - med)));
}

function madSigma(arr) {
  const rawMad = mad(arr);
  const sigma = 1.4826 * rawMad;
  return sigma === 0 ? 1e-6 : sigma;
}

function zScore(value, med, sigma) {
  return (value - med) / Math.max(1e-6, sigma);
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundToHalf(value) {
  return Math.round(value * 2) / 2;
}

// ═══════════════════════════════════════════════════════════════
// e1RM CALCULATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * System e1RM: uses bodyweight + external load + Epley with Vara
 * e1RM_system = systemLoadKg × (1 + (reps + Vx) / 30)
 */
function e1rmSystem(bodyweightKg, externalLoadKg, reps, vara) {
  const systemLoad = bodyweightKg + externalLoadKg;
  if (systemLoad <= 0 || reps < 1) return null;
  const effectiveReps = reps + (vara ?? 2);
  return systemLoad * (1 + effectiveReps / 30);
}

/**
 * External e1RM: e1RM_system - bodyweight
 */
function e1rmExternal(bodyweightKg, externalLoadKg, reps, vara) {
  const sys = e1rmSystem(bodyweightKg, externalLoadKg, reps, vara);
  if (sys === null) return null;
  return Math.max(0, sys - bodyweightKg);
}

/**
 * Accessory e1RM: simple Epley without system load logic
 * e1RM = weight × (1 + reps / 30)
 */
function e1rmAccessory(weightKg, reps) {
  if (weightKg <= 0 || reps < 1) return null;
  return weightKg * (1 + reps / 30);
}

/**
 * Calculate target load from e1RM backward:
 * targetSystemLoad = e1RM_system / (1 + effectiveReps / 30)
 * targetExternalLoad = targetSystemLoad - bodyweightKg
 */
function targetLoadFromE1RM(e1rmSys, bodyweightKg, targetReps, targetVx) {
  if (e1rmSys === null || e1rmSys <= 0) return null;
  const effectiveReps = targetReps + targetVx;
  const targetSystemLoad = e1rmSys / (1 + effectiveReps / 30);
  const external = targetSystemLoad - bodyweightKg;
  return roundToHalf(Math.max(0, external));
}

// ═══════════════════════════════════════════════════════════════
// BASELINE CALCULATIONS (rolling median + MAD)
// ═══════════════════════════════════════════════════════════════

function computeBaseline(values, windowN) {
  const windowed = values.slice(-windowN);
  if (windowed.length < 3) return null;
  const med = median(windowed);
  const sigma = madSigma(windowed);
  return { median: med, madSigma: sigma, n: windowed.length };
}

function classifyReadinessZ(z) {
  if (z >= -0.5) return "GREEN";
  if (z >= -1.0) return "YELLOW";
  return "RED";
}

// ═══════════════════════════════════════════════════════════════
// READINESS SYSTEM: 2/3 rule + velocity veto
// ═══════════════════════════════════════════════════════════════

/**
 * Compute velocity readiness from readiness test rep1 velocity
 */
function velocityReadiness(todayVelocity, baselineValues, windowN = 10) {
  if (todayVelocity === null || todayVelocity === undefined) {
    return { z: null, class: null, channel: "velocity" };
  }
  const bl = computeBaseline(baselineValues, windowN);
  if (!bl) return { z: null, class: null, channel: "velocity" };
  const z = zScore(todayVelocity, bl.median, bl.madSigma);
  return { z, class: classifyReadinessZ(z), channel: "velocity", baseline: bl };
}

/**
 * Compute HRV readiness from Oura night HRV (already as lnRMSSD)
 */
function hrvReadiness(todayLnRMSSD, baselineValues, windowN = 14) {
  if (todayLnRMSSD === null || todayLnRMSSD === undefined) {
    return { z: null, class: null, channel: "hrv" };
  }
  const bl = computeBaseline(baselineValues, windowN);
  if (!bl) return { z: null, class: null, channel: "hrv" };
  const z = zScore(todayLnRMSSD, bl.median, bl.madSigma);
  return { z, class: classifyReadinessZ(z), channel: "hrv", baseline: bl };
}

/**
 * Compute Vara readiness from recent top-set overshoot
 */
function varaReadiness(recentTopSets, windowN = 5) {
  const sets = recentTopSets.slice(-windowN).filter(
    (s) => s.targetVx !== null && s.targetVx !== undefined &&
           s.actualVx !== null && s.actualVx !== undefined
  );
  if (sets.length < 2) return { z: null, class: null, channel: "vara", meanOvershoot: null };

  const overshoots = sets.map((s) => s.targetVx - s.actualVx);
  const meanOvershoot = avg(overshoots);

  let cls;
  if (meanOvershoot >= 2) cls = "RED";
  else if (meanOvershoot >= 1) cls = "YELLOW";
  else cls = "GREEN";

  return { z: null, class: cls, channel: "vara", meanOvershoot };
}

/**
 * Combine readiness channels using 2/3 rule + velocity veto
 */
function combineReadiness(velocityR, hrvR, varaR) {
  const channels = [velocityR, hrvR, varaR];
  const active = channels.filter((c) => c.class !== null);

  if (active.length === 0) {
    return { combined: "GREEN", capLevel: 0, channels: { velocity: velocityR, hrv: hrvR, vara: varaR } };
  }

  // Count colors
  const counts = { GREEN: 0, YELLOW: 0, RED: 0 };
  for (const ch of active) counts[ch.class]++;

  let combined;

  // 2/3 rule
  if (counts.GREEN >= 2) combined = "GREEN";
  else if (counts.RED >= 2 || (counts.RED >= 1 && counts.YELLOW >= 1)) combined = "RED";
  else combined = "YELLOW";

  // Velocity VETO
  if (velocityR.class === "RED") {
    if (combined === "GREEN") combined = "YELLOW";
    const othersYellowOrRed = [hrvR, varaR].filter(
      (c) => c.class === "YELLOW" || c.class === "RED"
    ).length;
    if (othersYellowOrRed >= 1) combined = "RED";
  }

  const capLevel = combined === "GREEN" ? 0 : combined === "YELLOW" ? 1 : 2;

  return {
    combined,
    capLevel,
    channels: { velocity: velocityR, hrv: hrvR, vara: varaR },
  };
}

// ═══════════════════════════════════════════════════════════════
// MESOCYCLE LOGIC
// ═══════════════════════════════════════════════════════════════

/**
 * Determine which week of the mesocycle we're in based on date
 */
function getMesocycleWeek(mesocycle, dateISO) {
  if (!mesocycle || !mesocycle.startDateISO) return null;
  const start = new Date(mesocycle.startDateISO);
  const current = new Date(dateISO);
  const diffDays = Math.floor((current - start) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return null;
  const weekNum = Math.floor(diffDays / 7) + 1;
  if (weekNum > mesocycle.weekCount) return null; // Past end of mesocycle
  return weekNum;
}

/**
 * Get the week definition for a given week number
 */
function getWeekDef(mesocycle, weekNum) {
  if (!mesocycle || !mesocycle.weekDefs) return null;
  return mesocycle.weekDefs.find((w) => w.week === weekNum) || null;
}

/**
 * Get the planned day for today from the week plan.
 * If no exact match for dayOfWeek, finds the nearest training day in the week.
 * This ensures the user always gets a full program when they open the app.
 */
function getTodayPlan(mesocycle, weekNum, dayOfWeek) {
  if (!mesocycle || !mesocycle.weekPlans) return null;
  const weekPlan = mesocycle.weekPlans.find((w) => w.week === weekNum);
  if (!weekPlan || !weekPlan.days || !weekPlan.days.length) return null;
  // Exact match
  const exact = weekPlan.days.find((d) => d.dayOfWeek === dayOfWeek);
  if (exact) return exact;
  // Find nearest training day (prefer same day or next, fallback to previous)
  let best = null;
  let bestDist = Infinity;
  for (const d of weekPlan.days) {
    const dist = Math.abs(d.dayOfWeek - dayOfWeek);
    const wrapDist = Math.min(dist, 7 - dist);
    if (wrapDist < bestDist) {
      bestDist = wrapDist;
      best = d;
    }
  }
  return best;
}

/**
 * deltaPct_raw calculation: mesocycle week coefficient × day type multiplier
 */
function deltaPctRaw(weekDef, dayType) {
  if (!weekDef) return 0;
  const weekCoeff = weekDef.deltaPctBase || 0;
  const dayMult = DAY_TYPE_MULTIPLIERS[dayType] ?? 1.0;
  return weekCoeff * dayMult;
}

/**
 * Adaptive mesocycle calibration after cycle completion
 * Returns adjustment to deltaPct values for next cycle
 */
function calibrateMesocycle(varaFeedbackSets) {
  if (!varaFeedbackSets.length) return { adjustment: 0, reason: "Ei dataa" };
  const overshoots = varaFeedbackSets
    .filter((s) => s.targetVx !== null && s.actualVx !== null)
    .map((s) => s.targetVx - s.actualVx);
  if (!overshoots.length) return { adjustment: 0, reason: "Ei Vara-dataa" };

  const avgOvershoot = avg(overshoots);
  let adj = 0;
  let reason = "";

  if (avgOvershoot > 1.0) {
    adj = 0.01; // +1%
    reason = `Liian kevyt (avgOvershoot=${avgOvershoot.toFixed(2)}) → +1%`;
  } else if (avgOvershoot < -0.5) {
    adj = -0.01; // -1%
    reason = `Liian raskas (avgOvershoot=${avgOvershoot.toFixed(2)}) → -1%`;
  } else {
    reason = `Sopiva (avgOvershoot=${avgOvershoot.toFixed(2)})`;
  }

  return { adjustment: adj, avgOvershoot, reason };
}

// ═══════════════════════════════════════════════════════════════
// VARA FEEDBACK LOOP
// ═══════════════════════════════════════════════════════════════

/**
 * Analyze recent Vara data for session-level calibration
 */
function varaFeedback(recentSets) {
  const withVara = recentSets.filter(
    (s) => s.actualVx !== null && s.actualVx !== undefined &&
           s.targetVx !== null && s.targetVx !== undefined
  );
  if (withVara.length < 3) return { suggestion: null, type: null };

  const last3 = withVara.slice(-3);
  const allTooEasy = last3.every((s) => s.actualVx > s.targetVx + 1);
  const tooHard = last3.filter((s) => s.actualVx < s.targetVx - 1).length >= 2;

  if (allTooEasy) {
    return { suggestion: "Kuorma liian kevyt, harkitse +1-2 kg", type: "too_easy" };
  }
  if (tooHard) {
    return { suggestion: "Kuorma liian raskas, harkitse -1-2 kg", type: "too_hard" };
  }
  return { suggestion: null, type: null };
}

/**
 * Compute Vara trend correction for recommend()
 */
function varaTrendCorrection(recentTopSets, maxCorrection = 0.015) {
  const withVara = recentTopSets.filter(
    (s) => s.actualVx !== null && s.targetVx !== null
  ).slice(-6);
  if (withVara.length < 4) return 0;

  const overshoots = withVara.map((s) => s.targetVx - s.actualVx);
  const meanOvr = avg(overshoots);

  // Systematic undershoot → negative correction (too heavy)
  // Systematic overshoot → positive correction (too easy)
  if (meanOvr > 0.5) return clamp(meanOvr * 0.005, 0, maxCorrection);
  if (meanOvr < -0.5) return clamp(meanOvr * 0.005, -maxCorrection, 0);
  return 0;
}

// ═══════════════════════════════════════════════════════════════
// RETURN FROM BREAK
// ═══════════════════════════════════════════════════════════════

function breakAnalysis(lastSessionDateISO, todayDateISO) {
  if (!lastSessionDateISO) return { breakDays: null, modifier: 0, forcedDayType: null, message: null };

  const last = new Date(lastSessionDateISO);
  const today = new Date(todayDateISO || todayISO());
  const breakDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));

  if (breakDays < 7) return { breakDays, modifier: 0, forcedDayType: null, message: null };

  if (breakDays < 14) {
    return {
      breakDays,
      modifier: -0.05,
      forcedDayType: null,
      message: "Viikon tauko — aloitetaan hieman kevyemmin",
    };
  }
  if (breakDays < 28) {
    return {
      breakDays,
      modifier: -0.10,
      forcedDayType: "volume",
      message: "2 viikon tauko — volume-päivä ensin",
    };
  }
  return {
    breakDays,
    modifier: -0.15,
    forcedDayType: "volume",
    message: "Pitkä tauko — aloitetaan konservatiivisesti, 1-2 viikossa normaaliin",
  };
}

/**
 * Check if mesocycle needs reset after break
 */
function mesocycleBreakReset(mesocycle, skippedWeeks) {
  if (skippedWeeks >= 2) {
    return { reset: true, reason: "2+ viikkoa skipattiin → mesosykli nollattu viikkoon 1" };
  }
  return { reset: false, reason: null };
}

// ═══════════════════════════════════════════════════════════════
// FAILURE REACTION
// ═══════════════════════════════════════════════════════════════

function failureReaction(currentLoadKg, targetReps, isPrimary, consecutiveFailures) {
  const nextSetLoad = roundToHalf(currentLoadKg * 0.90);
  const nextSetReps = isPrimary ? Math.max(targetReps - 1, 1) : targetReps;

  if (consecutiveFailures >= 2) {
    return {
      nextSetLoad,
      nextSetReps,
      shouldStop: true,
      message: "2× failure — lopetatko tähän liikkeeseen?",
    };
  }
  return {
    nextSetLoad,
    nextSetReps,
    shouldStop: false,
    message: `Failure — seuraava sarja: ${nextSetLoad} kg`,
  };
}

// ═══════════════════════════════════════════════════════════════
// ACCESSORY PROGRESSION LOGIC
// ═══════════════════════════════════════════════════════════════

function accessoryProgression(progress, isLowerBody = false) {
  if (!progress) return { action: "hold", suggestedLoad: null, reason: "Ei progressiodataa" };

  const increment = isLowerBody ? 5 : 2.5;

  if (progress.consecutiveTargetMetSessions >= 2) {
    const newLoad = roundToHalf((progress.lastLoadKg || 0) + increment);
    return {
      action: "increase",
      suggestedLoad: newLoad,
      reason: `Target saavutettu ${progress.consecutiveTargetMetSessions}× peräkkäin → +${increment}kg`,
    };
  }

  if (progress.stagnationWeeks >= 3) {
    return {
      action: "hold",
      suggestedLoad: progress.lastLoadKg,
      reason: `Stagnaatio ${progress.stagnationWeeks} viikkoa — harkitse liikkeen vaihtoa`,
      stagnationWarning: true,
    };
  }

  return {
    action: "hold",
    suggestedLoad: progress.lastLoadKg,
    reason: "Jatka samalla painolla",
  };
}

/**
 * Update movement progress after a session
 */
function updateMovementProgressFromSets(existingProgress, sessionSets, targetReps, targetVx) {
  if (!sessionSets.length) return existingProgress;

  const lastSet = sessionSets[sessionSets.length - 1];
  const lastLoadKg = lastSet.externalLoadKg;
  const lastReps = lastSet.reps;

  // Calculate e1RM for accessory
  const e1rm = e1rmAccessory(lastLoadKg, lastReps);

  // Check if target was met for all sets
  const allTargetMet = sessionSets.every((s) => {
    const repsMet = s.reps >= (s.targetReps || targetReps);
    const varaMet = targetVx === null || s.actualVx === null || s.actualVx >= targetVx;
    return repsMet && varaMet;
  });

  const progress = existingProgress || {
    movementId: lastSet.movementId,
    currentE1RM: null,
    e1rmHistory: [],
    lastLoadKg: null,
    lastReps: null,
    suggestedLoadKg: null,
    suggestedAction: "hold",
    consecutiveTargetMetSessions: 0,
    stagnationWeeks: 0,
    stagnationFlagged: false,
    stagnationNotifiedAt: null,
    status: "active",
    restingSince: null,
  };

  // Update e1RM
  const prevE1RM = progress.currentE1RM;
  progress.currentE1RM = e1rm;
  progress.e1rmHistory = progress.e1rmHistory || [];
  if (e1rm !== null) {
    progress.e1rmHistory.push({ dateISO: todayISO(), e1rm });
  }
  progress.lastLoadKg = lastLoadKg;
  progress.lastReps = lastReps;

  // Update target met counter
  if (allTargetMet) {
    progress.consecutiveTargetMetSessions = (progress.consecutiveTargetMetSessions || 0) + 1;
  } else {
    progress.consecutiveTargetMetSessions = 0;
  }

  // Update stagnation
  if (prevE1RM !== null && e1rm !== null && e1rm <= prevE1RM) {
    progress.stagnationWeeks = (progress.stagnationWeeks || 0) + 1;
  } else if (e1rm !== null && prevE1RM !== null && e1rm > prevE1RM) {
    progress.stagnationWeeks = 0;
    progress.stagnationFlagged = false;
  }

  if (progress.stagnationWeeks >= 3) {
    progress.stagnationFlagged = true;
  }

  // Compute suggestion
  const prog = accessoryProgression(progress);
  progress.suggestedLoadKg = prog.suggestedLoad;
  progress.suggestedAction = prog.action;

  return progress;
}

// ═══════════════════════════════════════════════════════════════
// NEW MOVEMENT INITIAL WEIGHT
// ═══════════════════════════════════════════════════════════════

function initialWeightFrom1RM(oneRepMax) {
  return roundToHalf(oneRepMax * 0.70);
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT DAY PLAN GENERATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a full day plan with primary + accessories based on dayType.
 * This ensures the user ALWAYS gets a complete program, even if the
 * mesocycle weekPlan didn't have an entry for today's weekday.
 */
function generateDefaultDayPlan(dayType, weekDef, accessoryCapActive) {
  const primaryReps = weekDef?.heavyReps || (dayType === "volume" ? 5 : dayType === "speed" ? 2 : 3);
  const primaryVx = weekDef?.heavyTargetVx || (dayType === "volume" ? 3 : dayType === "speed" ? 4 : 2);
  const primarySets = dayType === "volume" ? 5 : dayType === "speed" ? 4 : 3;

  const slots = [
    { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: primarySets, reps: primaryReps, targetVx: primaryVx },
  ];

  if (dayType === "heavy") {
    slots.push(
      { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 4, reps: 6, targetVx: 3 },
      { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 8, targetVx: 3 },
      { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 10, targetVx: null },
    );
  } else if (dayType === "volume") {
    slots.push(
      { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 4, reps: 8, targetVx: 3 },
      { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 3, reps: 10, targetVx: 3 },
      { role: "accessory", category: "ojentajaekstensio", defaultMovementName: "Tricep pushdown", sets: 3, reps: 12, targetVx: null },
    );
  } else if (dayType === "speed") {
    // Speed day: lighter accessories
    slots.push(
      { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 3, reps: 10, targetVx: 4 },
      { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hammer curl", sets: 2, reps: 10, targetVx: null },
    );
  }

  return { dayOfWeek: null, dayType, slots };
}

// ═══════════════════════════════════════════════════════════════
// VELOCITY LOSS %
// ═══════════════════════════════════════════════════════════════

function velocityLossPercent(rep1Velocity, lastRepVelocity) {
  if (!rep1Velocity || !lastRepVelocity || rep1Velocity <= 0) return null;
  return ((rep1Velocity - lastRepVelocity) / rep1Velocity) * 100;
}

// ═══════════════════════════════════════════════════════════════
// RECOMMEND() — DETERMINISTIC RECOMMENDATION ENGINE
// ═══════════════════════════════════════════════════════════════

/**
 * Main recommendation function.
 * Input: mesocycle state, e1RM, readiness, settings
 * Output: recommended load, set prescription, decisionTrace
 */
async function recommend(options = {}) {
  const settings = options.settings || (await getSettings());
  const bodyweightKg = options.bodyweightKg || settings.bodyweightKg || 91;
  const dateISO = options.dateISO || todayISO();

  const traces = [];
  function trace(ruleId, before, after, why) {
    traces.push({ traceId: uid(), recId: null, ruleId, before: { ...before }, after: { ...after }, why });
  }

  // 1. Get mesocycle
  let mesocycle = options.mesocycle || (await getActiveMesocycle());
  if (!mesocycle) {
    mesocycle = createDefaultMesocycle(dateISO);
    if (!options.dryRun) await saveMesocycle(mesocycle);
    trace("MESOCYCLE_CREATED", {}, { mesocycleId: mesocycle.mesocycleId }, "Uusi mesosykli luotu automaattisesti");
  }

  // 2. Determine week and day
  let weekNum = getMesocycleWeek(mesocycle, dateISO);
  if (weekNum === null) {
    // Past end of mesocycle - start new one
    mesocycle = createDefaultMesocycle(dateISO);
    if (!options.dryRun) await saveMesocycle(mesocycle);
    weekNum = 1;
    trace("MESOCYCLE_NEW_CYCLE", {}, { weekNum: 1 }, "Edellinen mesosykli päättyi → uusi aloitettu");
  }

  const weekDef = getWeekDef(mesocycle, weekNum);
  const dayOfWeek = new Date(dateISO).getDay() || 7; // 1=Mon, 7=Sun
  let dayPlan = getTodayPlan(mesocycle, weekNum, dayOfWeek);
  let dayType = dayPlan?.dayType || options.dayType || "heavy";

  trace("MESOCYCLE_PHASE", {}, { weekNum, dayType, label: weekDef?.label }, `Viikko ${weekNum}: ${weekDef?.label || "?"}`);

  // 3. Break analysis
  const sessions = options.sessions || (await getAllSessions());
  const lastSession = sessions[sessions.length - 1];
  const breakInfo = breakAnalysis(lastSession?.dateISO, dateISO);

  if (breakInfo.modifier !== 0) {
    if (breakInfo.forcedDayType) {
      const oldDayType = dayType;
      dayType = breakInfo.forcedDayType;
      trace("RETURN_FROM_BREAK_DAYTYPE", { dayType: oldDayType }, { dayType }, breakInfo.message);
    }
    trace("RETURN_FROM_BREAK", { modifier: 0 }, { modifier: breakInfo.modifier, breakDays: breakInfo.breakDays }, breakInfo.message);

    // Check mesocycle reset
    if (breakInfo.breakDays >= 14) {
      const skippedWeeks = Math.floor(breakInfo.breakDays / 7);
      const resetInfo = mesocycleBreakReset(mesocycle, skippedWeeks);
      if (resetInfo.reset) {
        mesocycle = createDefaultMesocycle(dateISO);
        if (!options.dryRun) await saveMesocycle(mesocycle);
        weekNum = 1;
        trace("MESOCYCLE_BREAK_RESET", {}, { weekNum: 1 }, resetInfo.reason);
      }
    }
  }

  // 4. Compute e1RM from recent top sets
  const allSets = options.allSets || (await getAllSets());
  const primaryMovementId = options.primaryMovementId || null;

  // Filter to primary movement top sets, sorted by date
  const topSets = allSets
    .filter((s) => {
      if (primaryMovementId && s.movementId !== primaryMovementId) return false;
      return s.setRole === "top" || s.setRole === "readiness_test";
    })
    .sort((a, b) => {
      // Sort by session date via sessionId lookup or timestamp
      return (a.timestamp || "").localeCompare(b.timestamp || "");
    });

  // e1RM from last 4-6 top sets
  const recentTopSets = topSets.slice(-6);
  const e1rmValues = recentTopSets
    .map((s) => {
      const vara = s.actualVx ?? s.targetVx ?? 2;
      return e1rmSystem(bodyweightKg, s.externalLoadKg || 0, s.reps || s.targetReps || 3, vara);
    })
    .filter((v) => v !== null);

  const currentE1RMSystem = e1rmValues.length > 0 ? median(e1rmValues) : null;
  const currentE1RMExternal = currentE1RMSystem !== null ? Math.max(0, currentE1RMSystem - bodyweightKg) : null;

  trace("E1RM_COMPUTED", {}, {
    e1rmSystem: currentE1RMSystem?.toFixed(1),
    e1rmExternal: currentE1RMExternal?.toFixed(1),
    fromSets: recentTopSets.length,
  }, `e1RM laskettu ${recentTopSets.length} viimeisimmästä top-setistä`);

  // 5. Readiness
  const readiness = options.readiness || { combined: "GREEN", capLevel: 0, channels: {} };
  const capLevel = readiness.capLevel;

  // 6. deltaPct calculation
  const dayMult = DAY_TYPE_MULTIPLIERS[dayType] ?? 1.0;
  let deltaPctRawValue = (weekDef?.deltaPctBase || 0) * dayMult;
  trace("DELTA_PCT_RAW", {}, { deltaPctRaw: deltaPctRawValue }, `deltaPct_raw = ${weekDef?.deltaPctBase || 0} × ${dayMult}`);

  // 7. Vara trend correction
  const varaCorr = varaTrendCorrection(recentTopSets);
  if (varaCorr !== 0) {
    const oldDelta = deltaPctRawValue;
    deltaPctRawValue += varaCorr;
    trace("VARA_TREND_CORRECTION", { deltaPct: oldDelta }, { deltaPct: deltaPctRawValue }, `Vara-trendikorjaus: ${varaCorr > 0 ? "+" : ""}${(varaCorr * 100).toFixed(2)}%`);
  }

  // 8. Break modifier
  if (breakInfo.modifier !== 0) {
    const oldDelta = deltaPctRawValue;
    deltaPctRawValue += breakInfo.modifier;
    trace("BREAK_MODIFIER", { deltaPct: oldDelta }, { deltaPct: deltaPctRawValue }, `Tauko-modifikaattori: ${breakInfo.modifier * 100}%`);
  }

  // 9. Clamp
  const maxDelta = settings.maxDelta || 0.25;
  let deltaPct = clamp(deltaPctRawValue, -maxDelta, maxDelta);

  // 10. Apply readiness cap
  if (capLevel === 2) {
    // RED: no increase, heavy → volume
    const oldDelta = deltaPct;
    deltaPct = Math.min(deltaPct, 0);
    if (dayType === "heavy") {
      const oldDayType = dayType;
      dayType = "volume";
      trace("CAP_RED_DAYTYPE", { dayType: oldDayType }, { dayType: "volume" }, "RED readiness → heavy vaihdettu volume:ksi");
    }
    trace("CAP_RED", { deltaPct: oldDelta }, { deltaPct }, "RED readiness → deltaPct capped to ≤ 0");
  } else if (capLevel === 1) {
    // YELLOW: halve adjustment
    const oldDelta = deltaPct;
    deltaPct = deltaPct * 0.5;
    trace("CAP_YELLOW", { deltaPct: oldDelta }, { deltaPct }, "YELLOW readiness → deltaPct puolitettu");
  }

  // 11. Compute target load
  let targetReps, targetVx;
  if (weekDef) {
    targetReps = dayType === "heavy" ? weekDef.heavyReps : (dayType === "volume" ? 5 : 2);
    targetVx = dayType === "heavy" ? weekDef.heavyTargetVx : (dayType === "volume" ? 3 : 4);
  } else {
    targetReps = 3;
    targetVx = 2;
  }

  let targetExternalLoad;
  if (currentE1RMSystem !== null) {
    const effectiveReps = targetReps + targetVx;
    const targetSystemLoad = currentE1RMSystem / (1 + effectiveReps / 30);
    const rawExternal = targetSystemLoad * (1 + deltaPct) - bodyweightKg;
    targetExternalLoad = roundToHalf(Math.max(0, rawExternal));
  } else {
    targetExternalLoad = null;
  }

  trace("TARGET_LOAD", {}, {
    targetExternalLoad,
    deltaPct: (deltaPct * 100).toFixed(2) + "%",
    targetReps,
    targetVx,
  }, `Ehdotettu kuorma: +${targetExternalLoad} kg`);

  // 12. Set prescription
  let setCount;
  const recipe = DAY_TYPE_SET_RECIPES[dayType];
  if (recipe) {
    setCount = Array.isArray(recipe.sets) ? recipe.sets[0] : recipe.sets;
  } else {
    setCount = 3;
  }

  // 13. Vara feedback
  const varaFB = varaFeedback(recentTopSets);
  if (varaFB.suggestion) {
    trace("VARA_FEEDBACK", {}, { suggestion: varaFB.suggestion, type: varaFB.type }, varaFB.suggestion);
  }

  // 14. Accessory cap (independent from primary)
  let accessoryCapActive = false;
  if (capLevel === 2) {
    // Check if ALL 3 channels are RED/YELLOW
    const channels = readiness.channels || {};
    const allBad = [channels.velocity, channels.hrv, channels.vara]
      .filter((c) => c && c.class)
      .every((c) => c.class === "RED" || c.class === "YELLOW");
    if (allBad) {
      accessoryCapActive = true;
      trace("ACCESSORY_CAP_ACTIVE", {}, { volumeReduction: "30%" }, "3/3 kanavaa RED/YELLOW → tukiliikkeet -30% volyymi");
    }
  }

  // 15. Ensure dayPlan always has slots (fallback if mesocycle plan didn't match)
  if (!dayPlan || !dayPlan.slots || dayPlan.slots.length === 0) {
    dayPlan = generateDefaultDayPlan(dayType, weekDef, accessoryCapActive);
    trace("DAY_PLAN_GENERATED", {}, { dayType, slotsCount: dayPlan.slots.length },
      "Päivän ohjelma generoitu oletusliikkeillä");
  }

  // Apply accessory cap: reduce accessory set counts by 30% if active
  if (accessoryCapActive && dayPlan && dayPlan.slots) {
    dayPlan = { ...dayPlan, slots: dayPlan.slots.map(s => {
      if (s.role === "accessory") {
        return { ...s, sets: Math.max(2, Math.round(s.sets * 0.7)) };
      }
      return s;
    })};
  }

  // Build recommendation
  const rec = {
    recId: uid(),
    dateISO,
    mesocycleId: mesocycle.mesocycleId,
    weekNum,
    weekLabel: weekDef?.label || "?",
    dayType,
    targetExternalLoad,
    targetReps,
    targetVx,
    setCount,
    deltaPct,
    capLevel,
    readiness,
    e1rmSystem: currentE1RMSystem,
    e1rmExternal: currentE1RMExternal,
    bodyweightKg,
    varaFeedback: varaFB,
    breakInfo: breakInfo.breakDays >= 7 ? breakInfo : null,
    accessoryCapActive,
    dayPlan,
    traces,
  };

  // Assign recId to all traces
  for (const t of traces) t.recId = rec.recId;

  // Save if not dry run
  if (!options.dryRun) {
    await saveRecommendation({
      recId: rec.recId,
      sessionId: null,
      variantId: null,
      targetSetRole: "top",
      targetLoadKg: targetExternalLoad,
      deltaPct,
      capLevel,
      mesocycleWeek: weekNum,
      dayType,
      targetReps,
      targetVx,
      createdAtISO: new Date().toISOString(),
    });
    for (const t of traces) {
      await saveDecisionTrace(t);
    }
  }

  return rec;
}

// ═══════════════════════════════════════════════════════════════
// WEEKLY STIMULUS TRACKER
// ═══════════════════════════════════════════════════════════════

function weeklyStimulus(sets, movements) {
  const movementMap = new Map(movements.map((m) => [m.movementId, m]));

  let pullVolumeSets = 0;
  let pullVolumeTonnage = 0;
  let heavyExposures = 0;
  let totalTonnageExternal = 0;
  let totalTonnageSystem = 0;
  const byCategory = {};

  for (const s of sets) {
    const mov = movementMap.get(s.movementId);
    const category = mov?.category || "muu";
    const loadKg = s.externalLoadKg || 0;
    const reps = s.reps || 0;
    const tonnage = loadKg * reps;

    totalTonnageExternal += tonnage;

    if (mov?.countsAsPullVolume) {
      pullVolumeSets++;
      pullVolumeTonnage += tonnage;
    }

    const effectiveReps = reps + (s.actualVx ?? s.targetVx ?? 2);
    if (effectiveReps <= 4) heavyExposures++;

    if (!byCategory[category]) byCategory[category] = { sets: 0, tonnage: 0 };
    byCategory[category].sets++;
    byCategory[category].tonnage += tonnage;
  }

  return {
    pullVolumeSets,
    pullVolumeTonnage,
    heavyExposures,
    totalTonnageExternal,
    byCategory,
  };
}

// ═══════════════════════════════════════════════════════════════
// STAGNATION DETECTION
// ═══════════════════════════════════════════════════════════════

function checkStagnation(progress) {
  if (!progress || progress.stagnationWeeks < 3) {
    return { stagnated: false, severity: null, message: null };
  }
  if (progress.stagnationWeeks >= 6) {
    return {
      stagnated: true,
      severity: "orange",
      message: `${progress.stagnationWeeks} viikkoa ilman edistystä — suosittelemme liikkeen vaihtoa`,
    };
  }
  return {
    stagnated: true,
    severity: "yellow",
    message: `${progress.stagnationWeeks} viikkoa ilman edistystä — harkitse liikkeen vaihtoa`,
  };
}

// ═══════════════════════════════════════════════════════════════
// SPEED DAY LOAD
// ═══════════════════════════════════════════════════════════════

function speedDayLoad(e1rmExternal, bodyweightKg) {
  // Speed day: ~55-60% of 1RM, max intent
  if (e1rmExternal === null) return null;
  const pct = 0.575; // midpoint of 55-60%
  const systemE1RM = e1rmExternal + bodyweightKg;
  const targetSystem = systemE1RM * pct;
  return roundToHalf(Math.max(0, targetSystem - bodyweightKg));
}

// ═══════════════════════════════════════════════════════════════
// OURA HRV CONVERSION
// ═══════════════════════════════════════════════════════════════

function ouraHRVtoLnRMSSD(hrvMs) {
  if (hrvMs === null || hrvMs === undefined || hrvMs <= 0) return null;
  return Math.log(hrvMs);
}

// ═══════════════════════════════════════════════════════════════
// ADAPTIVE VOLUME OPTIMIZATION
// ═══════════════════════════════════════════════════════════════

/**
 * Analyze a completed session and compute adaptive adjustments
 * for future workouts. If the user did extra sets/exercises or
 * skipped some, the engine learns and adjusts.
 */
function analyzeSessionAdaptation(sessionExercises, dayPlanSlots) {
  const adjustments = [];

  // 1. Check per-slot: did the user do more or fewer sets than planned?
  //    Use originalCategory if available (survives mid-workout swaps)
  for (const slot of dayPlanSlots) {
    const matchedExercises = sessionExercises.filter(
      (ex) => (ex.originalCategory || ex.category) === slot.category && ex.role === slot.role
    );

    if (matchedExercises.length === 0) continue;

    for (const ex of matchedExercises) {
      const completedSets = ex.sets.filter((s) => s.completed).length;
      const plannedSets = slot.sets;
      const delta = completedSets - plannedSets;

      if (delta >= 2) {
        // User consistently does more → suggest increasing volume
        adjustments.push({
          category: slot.category,
          role: slot.role,
          movementName: ex.name,
          type: "volume_up",
          delta,
          suggestedSets: Math.min(plannedSets + 1, 6),
          reason: `${ex.name}: ${completedSets} sarjaa tehty (suunniteltu ${plannedSets}) → +1 sarja`,
        });
      } else if (delta <= -1 && completedSets > 0) {
        // User did fewer → reduce volume next time
        adjustments.push({
          category: slot.category,
          role: slot.role,
          movementName: ex.name,
          type: "volume_down",
          delta,
          suggestedSets: Math.max(plannedSets - 1, 2),
          reason: `${ex.name}: ${completedSets} sarjaa tehty (suunniteltu ${plannedSets}) → -1 sarja`,
        });
      }
    }
  }

  // 2. Check for extra exercises the user added (not in plan)
  const plannedCategories = new Set(dayPlanSlots.map((s) => s.category));
  const extraExercises = sessionExercises.filter(
    (ex) => !plannedCategories.has(ex.originalCategory || ex.category) && ex.sets.some((s) => s.completed)
  );

  for (const ex of extraExercises) {
    adjustments.push({
      category: ex.category,
      role: "accessory",
      movementName: ex.name,
      type: "new_exercise",
      suggestedSets: ex.sets.filter((s) => s.completed).length,
      reason: `${ex.name}: lisätty käsin → harkitaan lisäämistä ohjelmaan`,
    });
  }

  return adjustments;
}

/**
 * Apply accumulated session adaptations to mesocycle weekPlan.
 * Only applies after 2+ consistent sessions with same pattern.
 */
function applyAdaptations(mesocycle, adaptationHistory) {
  if (!adaptationHistory || adaptationHistory.length < 2) return { applied: false, changes: [] };

  // Group by category+type and count occurrences
  const counts = {};
  for (const adj of adaptationHistory) {
    const key = `${adj.category}:${adj.type}`;
    if (!counts[key]) counts[key] = { ...adj, count: 0 };
    counts[key].count++;
  }

  const changes = [];
  for (const [key, entry] of Object.entries(counts)) {
    if (entry.count < 2) continue; // Need 2+ sessions with same pattern

    // Apply to all matching weekPlan slots
    for (const wp of mesocycle.weekPlans) {
      for (const day of wp.days) {
        for (const slot of day.slots) {
          if (slot.category === entry.category && slot.role === entry.role) {
            if (entry.type === "volume_up" && entry.suggestedSets > slot.sets) {
              const oldSets = slot.sets;
              slot.sets = entry.suggestedSets;
              changes.push(`${entry.movementName}: ${oldSets} → ${slot.sets} sarjaa`);
            } else if (entry.type === "volume_down" && entry.suggestedSets < slot.sets) {
              const oldSets = slot.sets;
              slot.sets = entry.suggestedSets;
              changes.push(`${entry.movementName}: ${oldSets} → ${slot.sets} sarjaa`);
            }
          }
        }
      }
    }

    if (entry.type === "new_exercise") {
      changes.push(`${entry.movementName}: harkitse ohjelmaan lisäämistä`);
    }
  }

  return { applied: changes.length > 0, changes };
}

// ═══════════════════════════════════════════════════════════════
// FUTURE WORKOUTS PREVIEW
// ═══════════════════════════════════════════════════════════════

/**
 * Generate preview of upcoming workouts for N days ahead.
 * Returns array of { dateISO, dayOfWeek, dayType, weekNum, weekLabel, slots }
 */
function getFutureWorkouts(mesocycle, currentDateISO, daysAhead = 14) {
  if (!mesocycle || !mesocycle.weekPlans) return [];

  const results = [];
  const startDate = new Date(currentDateISO);

  for (let d = 1; d <= daysAhead; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    const dateISO = date.toISOString().slice(0, 10);
    const dayOfWeek = date.getDay() || 7; // 1=Mon, 7=Sun

    const weekNum = getMesocycleWeek(mesocycle, dateISO);
    if (weekNum === null) continue; // Past end of mesocycle

    const weekDef = getWeekDef(mesocycle, weekNum);
    const weekPlan = mesocycle.weekPlans.find((w) => w.week === weekNum);
    if (!weekPlan) continue;

    const dayPlan = weekPlan.days.find((dp) => dp.dayOfWeek === dayOfWeek);
    if (!dayPlan) continue;

    results.push({
      dateISO,
      dayOfWeek,
      dayType: dayPlan.dayType,
      weekNum,
      weekLabel: weekDef?.label || "",
      deltaPctBase: weekDef?.deltaPctBase || 0,
      slots: dayPlan.slots,
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// ELITE VOLUME/INTENSITY CHECK
// ═══════════════════════════════════════════════════════════════

/**
 * Check if weekly volume meets elite-level minimum thresholds.
 * Returns warnings if below recommended minimums.
 */
function eliteVolumeCheck(weekSets, movements) {
  const stimulus = weeklyStimulus(weekSets, movements);
  const warnings = [];

  // Elite pull volume: minimum ~15 hard sets/week for vertical + horizontal pull
  if (stimulus.pullVolumeSets < 12) {
    warnings.push({
      type: "low_pull_volume",
      current: stimulus.pullVolumeSets,
      target: 15,
      message: `Vetosarjoja ${stimulus.pullVolumeSets}/viikko — eliittitasolla suositus ≥15`,
    });
  }

  // Heavy exposure frequency: at least 4 heavy sets/week
  if (stimulus.heavyExposures < 3) {
    warnings.push({
      type: "low_heavy_exposure",
      current: stimulus.heavyExposures,
      target: 6,
      message: `Heavy-altistuksia ${stimulus.heavyExposures}/viikko — suositus ≥6`,
    });
  }

  // Check push-pull balance
  const pushSets = (stimulus.byCategory["horisontaalityöntö"]?.sets || 0) +
                   (stimulus.byCategory["vertikaalityöntö"]?.sets || 0);
  const pullSets = stimulus.pullVolumeSets;
  if (pullSets > 0 && pushSets < pullSets * 0.5) {
    warnings.push({
      type: "push_pull_imbalance",
      pushSets,
      pullSets,
      message: `Työntö/veto-suhde ${pushSets}:${pullSets} — lisää työntöliikkeitä (tavoite ≥1:2)`,
    });
  }

  return { stimulus, warnings, isEliteReady: warnings.length === 0 };
}

// ═══════════════════════════════════════════════════════════════
// ALL-MOVEMENT e1RM COMPUTATION
// ═══════════════════════════════════════════════════════════════

/**
 * Compute e1RM for any movement from its set history.
 * Uses accessory Epley for non-primary, system Epley for primary.
 */
function computeMovementE1RM(movementSets, isPrimary, bodyweightKg) {
  if (!movementSets.length) return null;

  // Take last 6 sets with valid data
  const recent = movementSets
    .filter((s) => s.externalLoadKg > 0 && s.reps >= 1)
    .slice(-6);

  if (!recent.length) return null;

  const values = recent.map((s) => {
    if (isPrimary) {
      const vara = s.actualVx ?? s.targetVx ?? 2;
      return e1rmSystem(bodyweightKg, s.externalLoadKg, s.reps, vara);
    } else {
      return e1rmAccessory(s.externalLoadKg, s.reps);
    }
  }).filter((v) => v !== null);

  return values.length > 0 ? median(values) : null;
}

/**
 * Compute e1RM history (time series) for any movement
 */
function computeMovementE1RMHistory(movementSets, sessions, isPrimary, bodyweightKg) {
  const sessionMap = new Map(sessions.map((s) => [s.sessionId, s]));
  const points = [];

  for (const s of movementSets) {
    if (s.externalLoadKg <= 0 || s.reps < 1) continue;
    const session = sessionMap.get(s.sessionId);
    if (!session) continue;

    let e1rm;
    if (isPrimary) {
      const vara = s.actualVx ?? s.targetVx ?? 2;
      e1rm = e1rmSystem(bodyweightKg, s.externalLoadKg, s.reps, vara);
    } else {
      e1rm = e1rmAccessory(s.externalLoadKg, s.reps);
    }

    if (e1rm !== null) {
      points.push({ dateISO: session.dateISO, e1rm, load: s.externalLoadKg, reps: s.reps });
    }
  }

  return points;
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export {
  // Constants
  DAY_TYPE_MULTIPLIERS,
  DAY_TYPE_SET_RECIPES,
  READINESS_CLASSES,
  // Math
  median,
  mad,
  madSigma,
  zScore,
  avg,
  clamp,
  roundToHalf,
  // e1RM
  e1rmSystem,
  e1rmExternal,
  e1rmAccessory,
  targetLoadFromE1RM,
  // Baseline
  computeBaseline,
  classifyReadinessZ,
  // Readiness
  velocityReadiness,
  hrvReadiness,
  varaReadiness,
  combineReadiness,
  // Mesocycle
  getMesocycleWeek,
  getWeekDef,
  getTodayPlan,
  deltaPctRaw,
  calibrateMesocycle,
  // Vara
  varaFeedback,
  varaTrendCorrection,
  // Break
  breakAnalysis,
  mesocycleBreakReset,
  // Failure
  failureReaction,
  // Accessory
  accessoryProgression,
  updateMovementProgressFromSets,
  initialWeightFrom1RM,
  // Velocity
  velocityLossPercent,
  // Recommend
  recommend,
  // Weekly
  weeklyStimulus,
  // Stagnation
  checkStagnation,
  // Default plan
  generateDefaultDayPlan,
  // Speed
  speedDayLoad,
  // HRV
  ouraHRVtoLnRMSSD,
  // Adaptive
  analyzeSessionAdaptation,
  applyAdaptations,
  // Future workouts
  getFutureWorkouts,
  // Elite check
  eliteVolumeCheck,
  // Movement e1RM
  computeMovementE1RM,
  computeMovementE1RMHistory,
};
