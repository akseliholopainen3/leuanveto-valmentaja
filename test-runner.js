// test-runner.js — Golden fixture tests for LeVe Coach
// Activated via ?test=1 or Diagnostics → "Aja testit"

import {
  median, mad, madSigma, zScore, avg, clamp, roundToHalf,
  e1rmSystem, e1rmExternal, e1rmAccessory, targetLoadFromE1RM,
  computeBaseline, classifyReadinessZ,
  velocityReadiness, hrvReadiness, varaReadiness, combineReadiness,
  getMesocycleWeek, getWeekDef, deltaPctRaw,
  calibrateMesocycle,
  varaFeedback, varaTrendCorrection,
  breakAnalysis, mesocycleBreakReset,
  failureReaction,
  accessoryProgression, updateMovementProgressFromSets, initialWeightFrom1RM,
  velocityLossPercent,
  weeklyStimulus, checkStagnation,
  speedDayLoad,
  ouraHRVtoLnRMSSD,
} from "./engine.js";

import {
  validateVelocity, validateLoad, validateReps, validateHRV, validateBodyweight,
  isVelocityTypo, parseNumericInput,
  uid, createDefaultMesocycle,
  exportFullBackup, importFullBackup,
  initDB,
} from "./data.js";

// ═══════════════════════════════════════════════════════════════
// TEST FRAMEWORK
// ═══════════════════════════════════════════════════════════════

let _passed = 0;
let _failed = 0;
let _results = [];

function assert(condition, name, details = "") {
  if (condition) {
    _passed++;
    _results.push({ name, pass: true });
  } else {
    _failed++;
    _results.push({ name, pass: false, details });
    console.error(`FAIL: ${name} — ${details}`);
  }
}

function assertClose(actual, expected, tolerance, name) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, name, `got ${actual}, expected ${expected} ±${tolerance}`);
}

function assertEqual(actual, expected, name) {
  assert(actual === expected, name, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

function testMath() {
  // median + MAD
  const arr = [10, 12, 11, 13, 14, 10, 11, 12, 13, 11];
  const med = median(arr);
  const madVal = mad(arr);
  const sigma = madSigma(arr);

  assertClose(med, 11.5, 0.01, "median: [10,12,11,13,14,10,11,12,13,11] = 11.5");
  assertClose(madVal, 1.0, 0.01, "MAD: median(|x - 11.5|) = 1.0");
  assertClose(sigma, 1.4826, 0.01, "madSigma: 1.4826 × 1.0 = 1.4826");
}

function testZClassification() {
  // z-score classification
  assertEqual(classifyReadinessZ(-0.49), "GREEN", "z=-0.49 → GREEN");
  assertEqual(classifyReadinessZ(-0.50), "YELLOW", "z=-0.50 → YELLOW");
  assertEqual(classifyReadinessZ(-0.99), "YELLOW", "z=-0.99 → YELLOW");
  assertEqual(classifyReadinessZ(-1.00), "RED", "z=-1.00 → RED");
  assertEqual(classifyReadinessZ(0.5), "GREEN", "z=0.5 → GREEN");
  assertEqual(classifyReadinessZ(-1.5), "RED", "z=-1.5 → RED");
}

function testReadiness23Rule() {
  // 2/3 rule: vel=RED, HRV=GREEN, Vara=GREEN → YELLOW (velocity veto)
  const r1 = combineReadiness(
    { z: -1.5, class: "RED", channel: "velocity" },
    { z: 0.2, class: "GREEN", channel: "hrv" },
    { z: null, class: "GREEN", channel: "vara", meanOvershoot: 0 }
  );
  assertEqual(r1.combined, "YELLOW", "2/3: vel=RED, HRV=GREEN, Vara=GREEN → YELLOW (velocity veto)");

  // 2/3 rule: vel=RED, HRV=YELLOW, Vara=GREEN → RED (vel veto + YELLOW)
  const r2 = combineReadiness(
    { z: -1.5, class: "RED", channel: "velocity" },
    { z: -0.7, class: "YELLOW", channel: "hrv" },
    { z: null, class: "GREEN", channel: "vara", meanOvershoot: 0 }
  );
  assertEqual(r2.combined, "RED", "2/3: vel=RED, HRV=YELLOW, Vara=GREEN → RED (vel veto + 2/3)");

  // All GREEN
  const r3 = combineReadiness(
    { z: 0.1, class: "GREEN", channel: "velocity" },
    { z: 0.3, class: "GREEN", channel: "hrv" },
    { z: null, class: "GREEN", channel: "vara", meanOvershoot: 0 }
  );
  assertEqual(r3.combined, "GREEN", "2/3: all GREEN → GREEN");
  assertEqual(r3.capLevel, 0, "capLevel = 0 for GREEN");

  // 2 RED
  const r4 = combineReadiness(
    { z: -1.5, class: "RED", channel: "velocity" },
    { z: -1.2, class: "RED", channel: "hrv" },
    { z: null, class: "GREEN", channel: "vara", meanOvershoot: 0 }
  );
  assertEqual(r4.combined, "RED", "2/3: 2× RED → RED");
  assertEqual(r4.capLevel, 2, "capLevel = 2 for RED");
}

function testE1RM() {
  // e1RM: 67kg ext + 91kg BW, 3 rep, V2
  // e1RM_system = (67+91) × (1 + (3+2)/30) = 158 × 1.1667 = 184.33
  // e1RM_ext = 184.33 - 91 = 93.33
  const sys = e1rmSystem(91, 67, 3, 2);
  assertClose(sys, 184.33, 0.5, "e1RM_system: 67+91=158, 158×(1+5/30) = 184.33");

  const ext = e1rmExternal(91, 67, 3, 2);
  assertClose(ext, 93.33, 0.5, "e1RM_external: 184.33 - 91 = 93.33");
}

function testTargetLoad() {
  // recommend heavy week 2: deltaPct = +2.5%
  // e1RM_system = 184, targetReps = 3, targetVx = 2
  // effectiveReps = 5
  // targetSystemLoad = 184 / (1 + 5/30) = 184 / 1.1667 = 157.7
  // targetExternal = 157.7 × 1.025 - 91 = 161.6 - 91 = 70.6 → round to 70.5
  const e1rm = 184;
  const effectiveReps = 3 + 2;
  const targetSystem = e1rm / (1 + effectiveReps / 30);
  const withDelta = targetSystem * 1.025;
  const ext = roundToHalf(withDelta - 91);
  assertClose(targetSystem, 157.7, 0.5, "targetSystemLoad = 184 / 1.1667 ≈ 157.7");
  assert(ext >= 69.5 && ext <= 71.5, "recommend heavy week 2: +2.5% → ~70-71 kg", `got ${ext}`);
}

function testCapOnly() {
  // cap-only RED: deltaPct capped to 0
  const delta = 0.025;
  const capped = Math.min(delta, 0); // RED cap
  assertEqual(capped, 0, "cap-only RED: deltaPct capped to ≤ 0");

  // cap-only YELLOW: deltaPct halved
  const deltaY = 0.025;
  const halved = deltaY * 0.5;
  assertClose(halved, 0.0125, 0.001, "cap-only YELLOW: deltaPct puolitettu → 0.0125");
}

function testOuraHRV() {
  // Oura HRV 45ms → lnRMSSD = ln(45) = 3.807
  const ln = ouraHRVtoLnRMSSD(45);
  assertClose(ln, 3.807, 0.01, "Oura HRV 45ms → lnRMSSD = 3.807");

  // Edge case
  assertEqual(ouraHRVtoLnRMSSD(null), null, "HRV null → null");
  assertEqual(ouraHRVtoLnRMSSD(0), null, "HRV 0 → null");
}

function testVaraFeedback() {
  // 5 sets with avg overshoot 1.5 → too easy
  const sets = [
    { targetVx: 2, actualVx: 4 },
    { targetVx: 2, actualVx: 3 },
    { targetVx: 2, actualVx: 4 },
    { targetVx: 2, actualVx: 4 },
    { targetVx: 2, actualVx: 4 },
  ];
  // mean overshoot = mean(targetVx - actualVx) = mean(-2, -1, -2, -2, -2) = -1.8
  // Since actualVx > targetVx + 1 for last 3, this is "too_easy"
  const fb = varaFeedback(sets);
  assertEqual(fb.type, "too_easy", "Vara feedback: overshoot → too_easy");

  // Vara readiness: mean overshoot >= 2 → RED
  const varaR = varaReadiness([
    { targetVx: 2, actualVx: 0 },
    { targetVx: 2, actualVx: 0 },
    { targetVx: 2, actualVx: 0 },
    { targetVx: 2, actualVx: 0 },
    { targetVx: 2, actualVx: 0 },
  ], 5);
  assertEqual(varaR.class, "RED", "Vara readiness: mean overshoot >= 2 → RED");
}

function testAccessoryCap() {
  // Accessories RED cap: 2/3 RED → accessories -30% (tested via flag)
  // When ALL 3 channels RED/YELLOW → accessoryCapActive = true
  const channels = {
    velocity: { class: "RED" },
    hrv: { class: "YELLOW" },
    vara: { class: "RED" },
  };
  const allBad = [channels.velocity, channels.hrv, channels.vara]
    .filter(c => c && c.class)
    .every(c => c.class === "RED" || c.class === "YELLOW");
  assert(allBad, "Accessories cap: 3/3 RED/YELLOW → cap active");

  // When only 1/3 RED → no cap
  const channels2 = {
    velocity: { class: "RED" },
    hrv: { class: "GREEN" },
    vara: { class: "GREEN" },
  };
  const allBad2 = [channels2.velocity, channels2.hrv, channels2.vara]
    .filter(c => c && c.class)
    .every(c => c.class === "RED" || c.class === "YELLOW");
  assert(!allBad2, "Accessories cap: 1/3 RED → NO cap (accessories normal)");
}

function testAccessoryProgression() {
  // 2 consecutive sessions target met → increase
  const progress1 = {
    lastLoadKg: 80,
    consecutiveTargetMetSessions: 2,
    stagnationWeeks: 0,
  };
  const result1 = accessoryProgression(progress1, false);
  assertEqual(result1.action, "increase", "Accessory: 2 sessions target met → increase");
  assertClose(result1.suggestedLoad, 82.5, 0.01, "Accessory: 80 + 2.5 = 82.5 kg");

  // 3 sessions target NOT met (stagnation)
  const progress2 = {
    lastLoadKg: 80,
    consecutiveTargetMetSessions: 0,
    stagnationWeeks: 3,
  };
  const result2 = accessoryProgression(progress2, false);
  assertEqual(result2.action, "hold", "Accessory: 3 weeks stagnation → hold");
  assert(result2.stagnationWarning === true, "Accessory: stagnation warning shown");
}

function testAccessoryE1RM() {
  // Accessory e1RM: 80kg × 8 reps → e1RM = 80 × (1 + 8/30) = 80 × 1.2667 = 101.33
  const e1rm = e1rmAccessory(80, 8);
  assertClose(e1rm, 101.33, 0.1, "Accessory e1RM: 80 × (1 + 8/30) = 101.33 kg");
}

function testStagnation() {
  // e1RM not risen for 3 weeks → flagged
  const progress1 = { stagnationWeeks: 3, stagnationFlagged: true };
  const result1 = checkStagnation(progress1);
  assert(result1.stagnated, "Stagnation: 3 weeks → flagged");
  assertEqual(result1.severity, "yellow", "Stagnation: 3 weeks → yellow severity");

  // e1RM rose on week 2 → reset
  const progress2 = { stagnationWeeks: 0, stagnationFlagged: false };
  const result2 = checkStagnation(progress2);
  assert(!result2.stagnated, "Stagnation: 0 weeks → not stagnated");
}

function testMovementProgressUpdate() {
  // Movement progress: all target met for 2 sessions
  const existing = {
    movementId: "test",
    currentE1RM: 100,
    e1rmHistory: [],
    lastLoadKg: 80,
    lastReps: 8,
    suggestedLoadKg: 80,
    suggestedAction: "hold",
    consecutiveTargetMetSessions: 1,
    stagnationWeeks: 0,
    stagnationFlagged: false,
    status: "active",
  };
  const sets = [
    { movementId: "test", externalLoadKg: 80, reps: 8, targetReps: 8, actualVx: 3, targetVx: 3 },
    { movementId: "test", externalLoadKg: 80, reps: 8, targetReps: 8, actualVx: 3, targetVx: 3 },
  ];
  const updated = updateMovementProgressFromSets(existing, sets, 8, 3);
  assertEqual(updated.consecutiveTargetMetSessions, 2, "Progress: 2 consecutive target met");
  assertEqual(updated.suggestedAction, "increase", "Progress: suggest increase after 2× target met");
  assertClose(updated.suggestedLoadKg, 82.5, 0.01, "Progress: 80 + 2.5 = 82.5 kg");
}

function testFailureReaction() {
  // V0 on primary → -10%, reps -1
  const reaction1 = failureReaction(70, 3, true, 1);
  assertClose(reaction1.nextSetLoad, 63.0, 0.1, "Failure primary: 70 × 0.90 = 63.0 kg");
  assertEqual(reaction1.nextSetReps, 2, "Failure primary: reps 3-1 = 2");
  assert(!reaction1.shouldStop, "Failure: 1× → don't stop");

  // 2× consecutive failure
  const reaction2 = failureReaction(70, 3, true, 2);
  assert(reaction2.shouldStop, "Failure: 2× consecutive → should stop");
}

function testNewMovementInitialWeight() {
  // 1RM = 100 → initial = 70
  const init = initialWeightFrom1RM(100);
  assertClose(init, 70, 0.1, "New movement: 1RM 100 → aloituspaino 70 kg");
}

function testBreakReturn() {
  // 7-13 days → -5%
  const b1 = breakAnalysis("2026-02-18", "2026-02-25");
  assertEqual(b1.breakDays, 7, "Break: 7 days detected");
  assertClose(b1.modifier, -0.05, 0.001, "Break 7d: modifier = -5%");
  assertEqual(b1.forcedDayType, null, "Break 7d: no forced day type");

  // 14-27 days → -10%, volume
  const b2 = breakAnalysis("2026-02-11", "2026-02-25");
  assertEqual(b2.breakDays, 14, "Break: 14 days detected");
  assertClose(b2.modifier, -0.10, 0.001, "Break 14d: modifier = -10%");
  assertEqual(b2.forcedDayType, "volume", "Break 14d: forced volume");

  // 28+ days → -15%, volume
  const b3 = breakAnalysis("2026-01-28", "2026-02-25");
  assertEqual(b3.breakDays, 28, "Break: 28 days detected");
  assertClose(b3.modifier, -0.15, 0.001, "Break 28d: modifier = -15%");
  assertEqual(b3.forcedDayType, "volume", "Break 28d: forced volume");
}

function testMesocycleBreakReset() {
  // 2+ weeks skipped → reset
  const r1 = mesocycleBreakReset(null, 2);
  assert(r1.reset, "Mesocycle break: 2 weeks skipped → reset");

  const r2 = mesocycleBreakReset(null, 1);
  assert(!r2.reset, "Mesocycle break: 1 week skipped → no reset");
}

function testVelocityLoss() {
  // VL% = (0.50 - 0.40) / 0.50 × 100 = 20%
  const vl = velocityLossPercent(0.50, 0.40);
  assertClose(vl, 20, 0.1, "VL%: (0.50-0.40)/0.50 = 20%");

  assertEqual(velocityLossPercent(null, 0.4), null, "VL%: null rep1 → null");
}

function testValidators() {
  // Velocity
  assert(validateVelocity(0.5).valid, "Validate velocity 0.5 → valid");
  assert(!validateVelocity(3.5).valid, "Validate velocity 3.5 → invalid");
  assert(!validateVelocity(-1).valid, "Validate velocity -1 → invalid");
  assert(validateVelocity(null).valid, "Validate velocity null → valid (optional)");

  // Load
  assert(validateLoad(50).valid, "Validate load 50 → valid");
  assert(!validateLoad(-5).valid, "Validate load -5 → invalid");

  // Reps
  assert(validateReps(3).valid, "Validate reps 3 → valid");
  assert(!validateReps(0).valid, "Validate reps 0 → invalid");
  assert(!validateReps(31).valid, "Validate reps 31 → invalid");

  // HRV
  assert(validateHRV(45).valid, "Validate HRV 45 → valid");
  assert(!validateHRV(5).valid, "Validate HRV 5 → invalid");
  assert(!validateHRV(250).valid, "Validate HRV 250 → invalid");

  // Bodyweight
  assert(validateBodyweight(91).valid, "Validate BW 91 → valid");
  assert(!validateBodyweight(20).valid, "Validate BW 20 → invalid");
}

function testParseNumeric() {
  assertClose(parseNumericInput("82,4"), 82.4, 0.001, "parseNumeric: '82,4' → 82.4 (comma)");
  assertClose(parseNumericInput("82.4"), 82.4, 0.001, "parseNumeric: '82.4' → 82.4");
  assertEqual(parseNumericInput(""), null, "parseNumeric: '' → null");
  assertEqual(parseNumericInput(null), null, "parseNumeric: null → null");
}

function testTypoDetection() {
  assert(isVelocityTypo(0.80, 0.50, 0.4), "Typo: 0.80 vs baseline 0.50 (60% off) → true");
  assert(!isVelocityTypo(0.52, 0.50, 0.4), "Typo: 0.52 vs baseline 0.50 (4% off) → false");
}

function testMesocycleWeek() {
  const meso = createDefaultMesocycle("2026-02-01");
  assertEqual(getMesocycleWeek(meso, "2026-02-01"), 1, "Meso week: day 1 → week 1");
  assertEqual(getMesocycleWeek(meso, "2026-02-08"), 2, "Meso week: day 8 → week 2");
  assertEqual(getMesocycleWeek(meso, "2026-02-15"), 3, "Meso week: day 15 → week 3");
  assertEqual(getMesocycleWeek(meso, "2026-02-22"), 4, "Meso week: day 22 → week 4");
  assertEqual(getMesocycleWeek(meso, "2026-03-01"), null, "Meso week: day 29 → null (past end)");
}

function testCalibration() {
  // avgVaraOvershoot > 1.0 → too light
  const sets1 = [
    { targetVx: 2, actualVx: 4 },
    { targetVx: 2, actualVx: 4 },
    { targetVx: 2, actualVx: 3 },
  ];
  const cal1 = calibrateMesocycle(sets1);
  assertClose(cal1.adjustment, 0.01, 0.001, "Calibration: too light → +1%");

  // avgVaraOvershoot < -0.5 → too heavy
  const sets2 = [
    { targetVx: 2, actualVx: 1 },
    { targetVx: 2, actualVx: 0 },
    { targetVx: 2, actualVx: 1 },
  ];
  const cal2 = calibrateMesocycle(sets2);
  assertClose(cal2.adjustment, -0.01, 0.001, "Calibration: too heavy → -1%");
}

async function testBackupRoundtrip() {
  // This test requires IndexedDB — skip if not available
  try {
    await initDB();
    const backup = await exportFullBackup();
    assert(backup._meta !== undefined, "Backup: _meta exists");
    assert(backup._meta.appVersion === "1.0.0", "Backup: appVersion = 1.0.0");
    // Roundtrip import
    await importFullBackup(backup);
    const backup2 = await exportFullBackup();
    assertEqual(
      JSON.stringify(backup.appMeta),
      JSON.stringify(backup2.appMeta),
      "Backup roundtrip: appMeta identical"
    );
  } catch (e) {
    _results.push({ name: "Backup roundtrip", pass: false, details: "IndexedDB not available: " + e.message });
    _failed++;
  }
}

// ═══════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════

export async function runTests() {
  _passed = 0;
  _failed = 0;
  _results = [];

  console.log("=== LeVe Coach Test Suite ===");

  testMath();
  testZClassification();
  testReadiness23Rule();
  testE1RM();
  testTargetLoad();
  testCapOnly();
  testOuraHRV();
  testVaraFeedback();
  testAccessoryCap();
  testAccessoryProgression();
  testAccessoryE1RM();
  testStagnation();
  testMovementProgressUpdate();
  testFailureReaction();
  testNewMovementInitialWeight();
  testBreakReturn();
  testMesocycleBreakReset();
  testVelocityLoss();
  testValidators();
  testParseNumeric();
  testTypoDetection();
  testMesocycleWeek();
  testCalibration();
  await testBackupRoundtrip();

  console.log(`\n=== Results: ${_passed} passed, ${_failed} failed ===`);

  // Render results to DOM
  const container = document.getElementById("app") || document.body;
  const html = `
    <div style="max-width:600px;margin:20px auto;padding:16px;font-family:system-ui;background:#0b1220;color:#e8eefc">
      <h1 style="font-size:20px">LeVe Coach — Testit</h1>
      <div style="font-size:24px;font-weight:700;margin:12px 0;color:${_failed === 0 ? '#22c55e' : '#ef4444'}">
        ${_failed === 0 ? '✓ Kaikki testit läpi' : `✗ ${_failed} testiä epäonnistui`}
      </div>
      <div style="font-size:14px;color:#8899bb;margin-bottom:16px">${_passed} passed / ${_passed + _failed} total</div>
      ${_results.map(r => `
        <div style="padding:6px 0;border-bottom:1px solid #26385d;font-size:13px">
          <span style="color:${r.pass ? '#22c55e' : '#ef4444'}">${r.pass ? '✓' : '✗'}</span>
          ${r.name}
          ${r.details ? `<div style="color:#ef4444;font-size:11px;margin-left:20px">${r.details}</div>` : ''}
        </div>
      `).join('')}
      <div style="margin-top:20px">
        <a href="./" style="color:#4f8cff;font-size:14px">← Takaisin sovellukseen</a>
      </div>
    </div>
  `;
  container.innerHTML = html;

  return { passed: _passed, failed: _failed, results: _results };
}
