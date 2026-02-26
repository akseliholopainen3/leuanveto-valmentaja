// data.js — IndexedDB, stores, migration, CRUD, import/export, backup/restore, guards
// LeVe Coach v1.0.0 — Schema version 3

const APP_VERSION = "1.0.0";
const SCHEMA_VERSION = 3;
const DB_NAME = "LeVeCoachDB";
const TIMEZONE = "Europe/Helsinki";

// ── Store names ──
const STORES = {
  appMeta: "appMeta",
  movements: "movements",
  variants: "variants",
  sessions: "sessions",
  sets: "sets",
  measurements: "measurements",
  protocols: "protocols",
  baselines: "baselines",
  mesocycles: "mesocycles",
  recommendations: "recommendations",
  decisionTraces: "decisionTraces",
  movementProgress: "movementProgress",
};

// ── Movement categories ──
const CATEGORIES = [
  "vertikaaliveto",
  "horisontaaliveto",
  "hauisfleksio",
  "vertikaalityöntö",
  "horisontaalityöntö",
  "ojentajaekstensio",
  "core",
  "alaraaja",
  "muu",
];

const PULL_VOLUME_CATEGORIES = new Set([
  "vertikaaliveto",
  "horisontaaliveto",
  "hauisfleksio",
]);

// ── Preset movements ──
const PRESET_MOVEMENTS = [
  // Primary
  { name: "Lisäpainoleuanveto", category: "vertikaaliveto", isPrimary: true, isPreset: true },
  // Vertical pull
  { name: "Ylätalja", category: "vertikaaliveto", isPrimary: false, isPreset: true },
  { name: "Lat pulldown", category: "vertikaaliveto", isPrimary: false, isPreset: true },
  { name: "Pullover kone", category: "vertikaaliveto", isPrimary: false, isPreset: true },
  // Horizontal pull
  { name: "Penkkiveto", category: "horisontaaliveto", isPrimary: false, isPreset: true },
  { name: "Alatalja", category: "horisontaaliveto", isPrimary: false, isPreset: true },
  { name: "Seated row", category: "horisontaaliveto", isPrimary: false, isPreset: true },
  { name: "Cable row", category: "horisontaaliveto", isPrimary: false, isPreset: true },
  { name: "T-bar row", category: "horisontaaliveto", isPrimary: false, isPreset: true },
  // Bicep flexion
  { name: "Hauiskääntö tanko", category: "hauisfleksio", isPrimary: false, isPreset: true },
  { name: "Hauiskääntö käsipainot", category: "hauisfleksio", isPrimary: false, isPreset: true },
  { name: "Hammer curl", category: "hauisfleksio", isPrimary: false, isPreset: true },
  { name: "Preacher curl", category: "hauisfleksio", isPrimary: false, isPreset: true },
  // Vertical push
  { name: "Pystypunnerrus", category: "vertikaalityöntö", isPrimary: false, isPreset: true },
  { name: "Shoulder press laite", category: "vertikaalityöntö", isPrimary: false, isPreset: true },
  // Horizontal push
  { name: "Penkkipunnerrus", category: "horisontaalityöntö", isPrimary: false, isPreset: true },
  { name: "Chest press", category: "horisontaalityöntö", isPrimary: false, isPreset: true },
  { name: "Pec deck", category: "horisontaalityöntö", isPrimary: false, isPreset: true },
  // Tricep extension
  { name: "Tricep pushdown", category: "ojentajaekstensio", isPrimary: false, isPreset: true },
  { name: "French press", category: "ojentajaekstensio", isPrimary: false, isPreset: true },
  // Core
  { name: "Ab crunch", category: "core", isPrimary: false, isPreset: true },
  { name: "Cable crunch", category: "core", isPrimary: false, isPreset: true },
];

// ── Primary variants ──
const PRIMARY_VARIANTS = [
  { name: "Kilpaveto (leveä myötäote)", movementName: "Lisäpainoleuanveto", isDefault: true },
  { name: "Korokeveto", movementName: "Lisäpainoleuanveto", isDefault: false },
  { name: "Nopeusveto kuminauhalla", movementName: "Lisäpainoleuanveto", isDefault: false },
  { name: "Myötäoteveto", movementName: "Lisäpainoleuanveto", isDefault: false },
];

// ── Utility ──
function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function todayISO() {
  return new Date()
    .toLocaleDateString("sv-SE", { timeZone: TIMEZONE })
    .slice(0, 10);
}

function parseNumericInput(v) {
  if (v === null || v === undefined || v === "") return null;
  const cleaned = String(v).trim().replace(/,/g, ".").replace(/[^0-9.+\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ── Measurement quality guards ──
const GUARDS = {
  velocity: (v) => v > 0 && v <= 3.0,
  load: (v) => v >= 0,
  reps: (v) => v >= 1 && v <= 30,
  hrv: (v) => v >= 10 && v <= 200,
  bodyweight: (v) => v >= 30 && v <= 250,
};

function validateVelocity(v) {
  if (v === null || v === undefined) return { valid: true, value: null };
  const n = parseNumericInput(v);
  if (n === null) return { valid: false, value: null, error: "Virheellinen arvo" };
  if (!GUARDS.velocity(n))
    return { valid: false, value: n, error: "Velocity oltava 0–3.0 m/s" };
  return { valid: true, value: n };
}

function validateLoad(v) {
  if (v === null || v === undefined) return { valid: true, value: null };
  const n = parseNumericInput(v);
  if (n === null) return { valid: false, value: null, error: "Virheellinen arvo" };
  if (!GUARDS.load(n)) return { valid: false, value: n, error: "Kuorma ei voi olla negatiivinen" };
  return { valid: true, value: n };
}

function validateReps(v) {
  if (v === null || v === undefined) return { valid: true, value: null };
  const n = parseNumericInput(v);
  if (n === null) return { valid: false, value: null, error: "Virheellinen arvo" };
  if (!GUARDS.reps(n)) return { valid: false, value: n, error: "Toistot oltava 1–30" };
  return { valid: true, value: Math.round(n) };
}

function validateHRV(v) {
  if (v === null || v === undefined) return { valid: true, value: null };
  const n = parseNumericInput(v);
  if (n === null) return { valid: false, value: null, error: "Virheellinen arvo" };
  if (!GUARDS.hrv(n)) return { valid: false, value: n, error: "HRV oltava 10–200 ms" };
  return { valid: true, value: n };
}

function validateBodyweight(v) {
  if (v === null || v === undefined) return { valid: true, value: null };
  const n = parseNumericInput(v);
  if (n === null) return { valid: false, value: null, error: "Virheellinen arvo" };
  if (!GUARDS.bodyweight(n)) return { valid: false, value: n, error: "Kehonpaino oltava 30–250 kg" };
  return { valid: true, value: n };
}

// ── Typo detection ──
function isVelocityTypo(value, baselineMedian, threshold = 0.4) {
  if (baselineMedian === null || baselineMedian === undefined || baselineMedian === 0) return false;
  if (value === null || value === undefined) return false;
  const deviation = Math.abs(value - baselineMedian) / baselineMedian;
  return deviation > threshold;
}

// ── IndexedDB ──
let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in self)) {
      console.warn("IndexedDB not available");
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, SCHEMA_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;

      // Create all stores if they don't exist
      if (!db.objectStoreNames.contains(STORES.appMeta)) {
        db.createObjectStore(STORES.appMeta, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORES.movements)) {
        const store = db.createObjectStore(STORES.movements, { keyPath: "movementId" });
        store.createIndex("category", "category", { unique: false });
        store.createIndex("isPrimary", "isPrimary", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.variants)) {
        const store = db.createObjectStore(STORES.variants, { keyPath: "variantId" });
        store.createIndex("movementId", "movementId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.sessions)) {
        const store = db.createObjectStore(STORES.sessions, { keyPath: "sessionId" });
        store.createIndex("dateISO", "dateISO", { unique: false });
        store.createIndex("mesocycleId", "mesocycleId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.sets)) {
        const store = db.createObjectStore(STORES.sets, { keyPath: "setId" });
        store.createIndex("sessionId", "sessionId", { unique: false });
        store.createIndex("movementId", "movementId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.measurements)) {
        const store = db.createObjectStore(STORES.measurements, { keyPath: "measurementId" });
        store.createIndex("dateISO", "dateISO", { unique: false });
        store.createIndex("type", "type", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.protocols)) {
        db.createObjectStore(STORES.protocols, { keyPath: "protocolId" });
      }
      if (!db.objectStoreNames.contains(STORES.baselines)) {
        const store = db.createObjectStore(STORES.baselines, { keyPath: "baselineId" });
        store.createIndex("protocolId", "protocolId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.mesocycles)) {
        db.createObjectStore(STORES.mesocycles, { keyPath: "mesocycleId" });
      }
      if (!db.objectStoreNames.contains(STORES.recommendations)) {
        const store = db.createObjectStore(STORES.recommendations, { keyPath: "recId" });
        store.createIndex("sessionId", "sessionId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.decisionTraces)) {
        const store = db.createObjectStore(STORES.decisionTraces, { keyPath: "traceId" });
        store.createIndex("recId", "recId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.movementProgress)) {
        db.createObjectStore(STORES.movementProgress, { keyPath: "movementId" });
      }
    };

    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onerror = () => {
      console.error("IndexedDB open failed:", req.error);
      resolve(null);
    };
  });
}

function getDB() {
  return _db;
}

// ── Generic CRUD ──
function dbPut(storeName, obj) {
  return new Promise((resolve) => {
    if (!_db) { resolve(false); return; }
    try {
      const tx = _db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(obj);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => { console.error("dbPut error:", tx.error); resolve(false); };
    } catch (e) {
      console.error("dbPut exception:", e);
      resolve(false);
    }
  });
}

function dbGet(storeName, key) {
  return new Promise((resolve) => {
    if (!_db) { resolve(null); return; }
    try {
      const tx = _db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

function dbGetAll(storeName) {
  return new Promise((resolve) => {
    if (!_db) { resolve([]); return; }
    try {
      const tx = _db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

function dbGetByIndex(storeName, indexName, value) {
  return new Promise((resolve) => {
    if (!_db) { resolve([]); return; }
    try {
      const tx = _db.transaction(storeName, "readonly");
      const idx = tx.objectStore(storeName).index(indexName);
      const req = idx.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

function dbDelete(storeName, key) {
  return new Promise((resolve) => {
    if (!_db) { resolve(false); return; }
    try {
      const tx = _db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

function dbClear(storeName) {
  return new Promise((resolve) => {
    if (!_db) { resolve(false); return; }
    try {
      const tx = _db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

// ── Bulk put (transactional) ──
function dbPutBulk(storeName, items) {
  return new Promise((resolve) => {
    if (!_db || !items.length) { resolve(true); return; }
    try {
      const tx = _db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => { console.error("dbPutBulk error:", tx.error); resolve(false); };
    } catch (e) {
      console.error("dbPutBulk exception:", e);
      resolve(false);
    }
  });
}

// ── Initialization: seed preset movements + variants ──
async function seedPresets() {
  const existingMovements = await dbGetAll(STORES.movements);
  if (existingMovements.length > 0) return; // Already seeded

  const movements = PRESET_MOVEMENTS.map((m) => ({
    movementId: uid(),
    name: m.name,
    category: m.category,
    isPrimary: m.isPrimary,
    countsAsPullVolume: PULL_VOLUME_CATEGORIES.has(m.category),
    isPreset: true,
    tags: [],
  }));

  await dbPutBulk(STORES.movements, movements);

  // Create variants for primary movement
  const primaryMov = movements.find((m) => m.isPrimary);
  if (primaryMov) {
    const variants = PRIMARY_VARIANTS.map((v) => ({
      variantId: uid(),
      movementId: primaryMov.movementId,
      name: v.name,
      isDefault: v.isDefault,
      notes: "",
    }));
    await dbPutBulk(STORES.variants, variants);
  }

  // Store app meta
  await dbPut(STORES.appMeta, {
    key: "meta",
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    createdAtISO: nowISO(),
    lastOpenedISO: nowISO(),
    timezone: TIMEZONE,
  });
}

// ── High-level data access ──

// Movements
async function getAllMovements() {
  return dbGetAll(STORES.movements);
}

async function getMovementsByCategory(category) {
  return dbGetByIndex(STORES.movements, "category", category);
}

async function getPrimaryMovement() {
  const all = await dbGetAll(STORES.movements);
  return all.find((m) => m.isPrimary) || null;
}

async function addMovement(name, category) {
  const mov = {
    movementId: uid(),
    name,
    category,
    isPrimary: false,
    countsAsPullVolume: PULL_VOLUME_CATEGORIES.has(category),
    isPreset: false,
    tags: [],
  };
  await dbPut(STORES.movements, mov);
  return mov;
}

async function updateMovement(movementId, updates) {
  const existing = await dbGet(STORES.movements, movementId);
  if (!existing) return null;
  const updated = { ...existing, ...updates };
  if (updates.category !== undefined) {
    updated.countsAsPullVolume = PULL_VOLUME_CATEGORIES.has(updates.category);
  }
  await dbPut(STORES.movements, updated);
  return updated;
}

async function deleteMovement(movementId) {
  return dbDelete(STORES.movements, movementId);
}

// Variants
async function getVariantsForMovement(movementId) {
  return dbGetByIndex(STORES.variants, "movementId", movementId);
}

async function addVariant(movementId, name, notes = "") {
  const v = { variantId: uid(), movementId, name, isDefault: false, notes };
  await dbPut(STORES.variants, v);
  return v;
}

// Sessions
async function getAllSessions() {
  const sessions = await dbGetAll(STORES.sessions);
  return sessions.sort((a, b) => (a.dateISO || "").localeCompare(b.dateISO || ""));
}

async function getSession(sessionId) {
  return dbGet(STORES.sessions, sessionId);
}

async function saveSession(session) {
  if (!session.sessionId) session.sessionId = uid();
  return dbPut(STORES.sessions, session);
}

async function deleteSession(sessionId) {
  // Delete associated sets
  const sets = await dbGetByIndex(STORES.sets, "sessionId", sessionId);
  for (const s of sets) {
    await dbDelete(STORES.sets, s.setId);
  }
  // Delete associated recommendations
  const recs = await dbGetByIndex(STORES.recommendations, "sessionId", sessionId);
  for (const r of recs) {
    // Delete associated traces
    const traces = await dbGetByIndex(STORES.decisionTraces, "recId", r.recId);
    for (const t of traces) await dbDelete(STORES.decisionTraces, t.traceId);
    await dbDelete(STORES.recommendations, r.recId);
  }
  return dbDelete(STORES.sessions, sessionId);
}

// Sets
async function getSetsForSession(sessionId) {
  return dbGetByIndex(STORES.sets, "sessionId", sessionId);
}

async function getSetsForMovement(movementId) {
  return dbGetByIndex(STORES.sets, "movementId", movementId);
}

async function getAllSets() {
  return dbGetAll(STORES.sets);
}

async function saveSet(set) {
  if (!set.setId) set.setId = uid();
  return dbPut(STORES.sets, set);
}

async function saveSets(sets) {
  return dbPutBulk(STORES.sets, sets);
}

async function deleteSet(setId) {
  return dbDelete(STORES.sets, setId);
}

// Measurements
async function getMeasurementsByType(type) {
  return dbGetByIndex(STORES.measurements, "type", type);
}

async function getMeasurementsByDate(dateISO) {
  return dbGetByIndex(STORES.measurements, "dateISO", dateISO);
}

async function saveMeasurement(measurement) {
  if (!measurement.measurementId) measurement.measurementId = uid();
  return dbPut(STORES.measurements, measurement);
}

// Mesocycles
async function getAllMesocycles() {
  return dbGetAll(STORES.mesocycles);
}

async function getActiveMesocycle() {
  const all = await getAllMesocycles();
  if (!all.length) return null;
  // Return the most recent mesocycle
  all.sort((a, b) => (b.startDateISO || "").localeCompare(a.startDateISO || ""));
  return all[0];
}

async function saveMesocycle(meso) {
  if (!meso.mesocycleId) meso.mesocycleId = uid();
  return dbPut(STORES.mesocycles, meso);
}

// Baselines
async function getBaseline(protocolId) {
  const all = await dbGetByIndex(STORES.baselines, "protocolId", protocolId);
  return all[0] || null;
}

async function saveBaseline(baseline) {
  if (!baseline.baselineId) baseline.baselineId = uid();
  return dbPut(STORES.baselines, baseline);
}

// Recommendations
async function saveRecommendation(rec) {
  if (!rec.recId) rec.recId = uid();
  return dbPut(STORES.recommendations, rec);
}

// Decision Traces
async function saveDecisionTrace(trace) {
  if (!trace.traceId) trace.traceId = uid();
  return dbPut(STORES.decisionTraces, trace);
}

async function getTracesForRec(recId) {
  return dbGetByIndex(STORES.decisionTraces, "recId", recId);
}

// Movement Progress
async function getMovementProgress(movementId) {
  return dbGet(STORES.movementProgress, movementId);
}

async function getAllMovementProgress() {
  return dbGetAll(STORES.movementProgress);
}

async function saveMovementProgress(progress) {
  progress.updatedAtISO = nowISO();
  return dbPut(STORES.movementProgress, progress);
}

// Protocols
async function getAllProtocols() {
  return dbGetAll(STORES.protocols);
}

async function saveProtocol(protocol) {
  if (!protocol.protocolId) protocol.protocolId = uid();
  return dbPut(STORES.protocols, protocol);
}

// App Meta
async function getAppMeta() {
  return dbGet(STORES.appMeta, "meta");
}

async function updateLastOpened() {
  const meta = (await getAppMeta()) || {
    key: "meta",
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    createdAtISO: nowISO(),
    timezone: TIMEZONE,
  };
  meta.lastOpenedISO = nowISO();
  meta.appVersion = APP_VERSION;
  return dbPut(STORES.appMeta, meta);
}

// Settings (stored in appMeta store)
async function getSettings() {
  const s = await dbGet(STORES.appMeta, "settings");
  return s || {
    key: "settings",
    bodyweightKg: 91,
    maxDelta: 0.25,
    readinessVelocityWindowN: 10,
    readinessHrvWindowN: 14,
    readinessVaraWindowN: 5,
    velocityTypoThreshold: 0.4,
    vlStopPercent: 20,
    accessoryIncrementUpper: 2.5,
    accessoryIncrementLower: 5,
    stagnationThresholdWeeks: 3,
  };
}

async function saveSettings(settings) {
  settings.key = "settings";
  return dbPut(STORES.appMeta, settings);
}

// ── Backup / Restore ──
async function exportFullBackup() {
  const data = {};
  for (const storeName of Object.values(STORES)) {
    data[storeName] = await dbGetAll(storeName);
  }
  data._meta = {
    exportedAtISO: nowISO(),
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
  };
  return data;
}

async function importFullBackup(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Virheellinen backup-tiedosto");
  }

  // Clear all stores
  for (const storeName of Object.values(STORES)) {
    await dbClear(storeName);
  }

  // Import each store
  for (const storeName of Object.values(STORES)) {
    if (Array.isArray(data[storeName]) && data[storeName].length > 0) {
      await dbPutBulk(storeName, data[storeName]);
    }
  }

  // Re-seed presets if movements were empty
  const movements = await dbGetAll(STORES.movements);
  if (movements.length === 0) {
    await seedPresets();
  }
}

// ── CSV Import (historical data) ──
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else if (ch === ";" && !inQuotes) {
      // Support semicolon-separated CSV (common in Finnish locale)
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map((l) => parseCSVLine(l));
  return { headers, rows };
}

async function importHistoricalCSV(text, columnMapping) {
  // columnMapping: { date: colIdx, movement: colIdx, weight: colIdx, reps: colIdx, sets: colIdx, vara: colIdx }
  const { headers, rows } = parseCSV(text);
  if (!rows.length) throw new Error("CSV on tyhjä");

  const movements = await getAllMovements();
  const movementByName = new Map(movements.map((m) => [m.name.toLowerCase(), m]));

  const sessionsByDate = new Map();
  const newSets = [];

  for (const row of rows) {
    const dateISO = row[columnMapping.date] || todayISO();
    const movementName = row[columnMapping.movement] || "Lisäpainoleuanveto";
    const weightKg = parseNumericInput(row[columnMapping.weight]);
    const reps = parseNumericInput(row[columnMapping.reps]);
    const setCount = parseNumericInput(row[columnMapping.sets]) || 1;
    const vara = columnMapping.vara !== undefined ? parseNumericInput(row[columnMapping.vara]) : null;

    if (reps === null || reps < 1) continue;

    // Find or create movement
    let mov = movementByName.get(movementName.toLowerCase());
    if (!mov) {
      mov = await addMovement(movementName, "muu");
      movementByName.set(movementName.toLowerCase(), mov);
    }

    // Find or create session for this date
    if (!sessionsByDate.has(dateISO)) {
      const session = {
        sessionId: uid(),
        dateISO,
        plannedDayType: null,
        mesocycleWeek: null,
        mesocycleId: null,
        bodyweightKg: null,
        notes: "CSV import",
        readinessCapLevel: null,
        readinessDetails: null,
      };
      sessionsByDate.set(dateISO, session);
    }

    const session = sessionsByDate.get(dateISO);

    for (let i = 0; i < setCount; i++) {
      newSets.push({
        setId: uid(),
        sessionId: session.sessionId,
        movementId: mov.movementId,
        variantId: null,
        setRole: "top",
        externalLoadKg: weightKg,
        reps: reps,
        targetReps: reps,
        targetVx: null,
        actualVx: vara,
        velocityMean: null,
        velocityPeak: null,
        velocityRep1: null,
        velocityLossPercent: null,
        tempo: null,
        restSec: null,
        deviceMeta: null,
        manualOverride: null,
      });
    }
  }

  // Save sessions and sets
  const sessions = Array.from(sessionsByDate.values());
  await dbPutBulk(STORES.sessions, sessions);
  await dbPutBulk(STORES.sets, newSets);

  return { sessionsImported: sessions.length, setsImported: newSets.length };
}

// ── Create default mesocycle ──
function createDefaultMesocycle(startDateISO) {
  return {
    mesocycleId: uid(),
    startDateISO: startDateISO || todayISO(),
    weekCount: 4,
    weekDefs: [
      { week: 1, deltaPctBase: 0, label: "Adaptaatio", heavyReps: 3, heavyTargetVx: 2 },
      { week: 2, deltaPctBase: 0.025, label: "Loading", heavyReps: 3, heavyTargetVx: 2 },
      { week: 3, deltaPctBase: 0.05, label: "Overreach", heavyReps: 2, heavyTargetVx: 1 },
      { week: 4, deltaPctBase: -0.25, label: "Deload", heavyReps: 3, heavyTargetVx: 4 },
    ],
    weekPlans: [
      {
        week: 1,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 3, targetVx: 2 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 4, reps: 6, targetVx: 3 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 8, targetVx: 3 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "volume",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 5, targetVx: 3 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 4, reps: 8, targetVx: 3 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 3, reps: 10, targetVx: 3 },
              { role: "accessory", category: "ojentajaekstensio", defaultMovementName: "Tricep pushdown", sets: 3, reps: 12, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "heavy",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 3, targetVx: 2 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Chest press", sets: 4, reps: 8, targetVx: 3 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 3, reps: 10, targetVx: 3 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hammer curl", sets: 3, reps: 10, targetVx: null },
            ],
          },
        ],
      },
      {
        week: 2,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 3, targetVx: 2 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 4, reps: 6, targetVx: 3 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 8, targetVx: 3 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "volume",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 5, targetVx: 3 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 4, reps: 8, targetVx: 3 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 3, reps: 10, targetVx: 3 },
              { role: "accessory", category: "ojentajaekstensio", defaultMovementName: "Tricep pushdown", sets: 3, reps: 12, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "heavy",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 3, targetVx: 2 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Chest press", sets: 4, reps: 8, targetVx: 3 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 3, reps: 10, targetVx: 3 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hammer curl", sets: 3, reps: 10, targetVx: null },
            ],
          },
        ],
      },
      {
        week: 3,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 2, targetVx: 1 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 4, reps: 6, targetVx: 2 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 8, targetVx: 2 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "volume",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 4, reps: 4, targetVx: 2 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 4, reps: 8, targetVx: 3 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 3, reps: 10, targetVx: 3 },
              { role: "accessory", category: "ojentajaekstensio", defaultMovementName: "Tricep pushdown", sets: 3, reps: 12, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "heavy",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 2, targetVx: 1 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Chest press", sets: 4, reps: 8, targetVx: 2 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 3, reps: 10, targetVx: 2 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hammer curl", sets: 3, reps: 10, targetVx: null },
            ],
          },
        ],
      },
      {
        week: 4,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 3, targetVx: 4 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 3, reps: 6, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 8, targetVx: 4 },
            ],
          },
          {
            dayOfWeek: 3, dayType: "volume",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 5, targetVx: 4 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 3, reps: 8, targetVx: 4 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 3, reps: 10, targetVx: 4 },
            ],
          },
          {
            dayOfWeek: 5, dayType: "speed",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 4, reps: 2, targetVx: 4 },
            ],
          },
        ],
      },
    ],
    postCycleAnalysis: null,
  };
}

// ── Initialize database ──
async function initDB() {
  await openDB();
  if (_db) {
    await seedPresets();
    await updateLastOpened();
  }
  return _db;
}

// ── Export module ──
export {
  // Constants
  APP_VERSION,
  SCHEMA_VERSION,
  TIMEZONE,
  STORES,
  CATEGORIES,
  PULL_VOLUME_CATEGORIES,
  PRESET_MOVEMENTS,
  PRIMARY_VARIANTS,
  // Utilities
  uid,
  nowISO,
  todayISO,
  parseNumericInput,
  // Guards
  GUARDS,
  validateVelocity,
  validateLoad,
  validateReps,
  validateHRV,
  validateBodyweight,
  isVelocityTypo,
  // DB operations
  openDB,
  getDB,
  initDB,
  dbPut,
  dbGet,
  dbGetAll,
  dbGetByIndex,
  dbDelete,
  dbClear,
  dbPutBulk,
  seedPresets,
  // Movements
  getAllMovements,
  getMovementsByCategory,
  getPrimaryMovement,
  addMovement,
  updateMovement,
  deleteMovement,
  // Variants
  getVariantsForMovement,
  addVariant,
  // Sessions
  getAllSessions,
  getSession,
  saveSession,
  deleteSession,
  // Sets
  getSetsForSession,
  getSetsForMovement,
  getAllSets,
  saveSet,
  saveSets,
  deleteSet,
  // Measurements
  getMeasurementsByType,
  getMeasurementsByDate,
  saveMeasurement,
  // Mesocycles
  getAllMesocycles,
  getActiveMesocycle,
  saveMesocycle,
  createDefaultMesocycle,
  // Baselines
  getBaseline,
  saveBaseline,
  // Recommendations
  saveRecommendation,
  // Decision Traces
  saveDecisionTrace,
  getTracesForRec,
  // Movement Progress
  getMovementProgress,
  getAllMovementProgress,
  saveMovementProgress,
  // Protocols
  getAllProtocols,
  saveProtocol,
  // App Meta & Settings
  getAppMeta,
  updateLastOpened,
  getSettings,
  saveSettings,
  // Backup / Restore
  exportFullBackup,
  importFullBackup,
  // CSV
  parseCSV,
  importHistoricalCSV,
};
