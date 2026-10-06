// In-memory record database with durable persistence (see core/storage.js).
// Collections: customers -> vehicles -> jobs (work orders) -> reports.
import {sanitizeEntry, sanitizeJob, sanitizeCustomer, sanitizeVehicle, sanitizeDiagnosis, sanitizePhoto,
  REPORT_LIMIT, JOB_LIMIT, CUSTOMER_LIMIT, VEHICLE_LIMIT, DIAGNOSIS_LIMIT, PHOTO_LIMIT} from '../records.js';
import {BRANDING_DEFAULTS, sanitizeBranding} from '../branding.js';
import {syncedSettings, PILOT_KEYS} from '../settings-sync.js';
const pick = (object, keys) => Object.fromEntries(keys.map(key => [key, object[key]]));

const SPEC = {
  customers: {sanitize: sanitizeCustomer, limit: CUSTOMER_LIMIT, label: 'customer'},
  vehicles: {sanitize: sanitizeVehicle, limit: VEHICLE_LIMIT, label: 'vehicle'},
  jobs: {sanitize: sanitizeJob, limit: JOB_LIMIT, label: 'work order'},
  reports: {sanitize: sanitizeEntry, limit: REPORT_LIMIT, label: 'report'},
  diagnoses: {sanitize: sanitizeDiagnosis, limit: DIAGNOSIS_LIMIT, label: 'diagnosis'},
  photos: {sanitize: sanitizePhoto, limit: PHOTO_LIMIT, label: 'photo'}
};
const SETTINGS_DEFAULTS = {shopName: '', shopPhone: '', shopAddress: '', shopEmail: '', shopHours: '', reportPrefix: '', shopTimeZone: '', technician: '', activeJobId: null,
  mode: 'guided', baud: 115200, reportPageNote: '', theme: 'dark', onboardingHidden: false, ...BRANDING_DEFAULTS,
  // Account sync of shop details and branding (core/account-sync.js).
  syncAccount: '', syncRemoteAt: '', syncedAt: 0, shopEditedAt: 0,
  // Record sync through the account (decision 0015, core/record-sync.js): on or off, the account it
  // syncs with, the position reached in the server's change list, and whether the first sync is due.
  recordSyncOn: false, recordSyncAccount: '', recordSyncAt: '', recordSyncInitial: false};
const newId = () => crypto.randomUUID();
// The collections that sync between devices. Settings never do (shop details have their own sync).
export const SYNCED_COLLECTIONS = Object.freeze(Object.keys(SPEC));
const OUTBOX_KEY = /^(customers|vehicles|jobs|reports|diagnoses|photos)\/[A-Za-z0-9._-]{1,64}$/;

export async function openDatabase(storage) {
  const db = {kind: storage.kind, notices: [], settings: {...SETTINGS_DEFAULTS}};
  const queues = {};
  // Saves of one collection run one at a time, in order, so a slow write never races a newer one.
  const persist = name => {
    const snapshot = name === 'settings' ? {...db.settings} : name === 'outbox' ? [...db.outbox].map(([key, e]) => ({key, changed: e.changed, base: e.base}))
      : name === 'versions' ? Object.fromEntries(db.versions) : name === 'photofiles' ? [...db.photoFiles] : db[name];
    queues[name] = (queues[name] || Promise.resolve()).then(() => storage.save(name, snapshot));
    return queues[name];
  };

  for (const [name, spec] of Object.entries(SPEC)) {
    const {data, source} = await storage.load(name);
    const items = Array.isArray(data) ? data.map(spec.sanitize).filter(Boolean) : [];
    if (Array.isArray(data) && items.length < data.length)
      db.notices.push(`${data.length - items.length} unreadable ${spec.label} record(s) were skipped.`);
    if (source === 'backup') db.notices.push(`The ${spec.label} file was unreadable, so the previous saved version was loaded.`);
    db[name] = items.slice(0, spec.limit);
    if (source === 'migrated' && items.length) {
      await persist(name);
      db.notices.push(`Moved ${items.length} ${spec.label} record(s) from the previous version's browser storage.`);
    }
  }
  const saved = await storage.load('settings');
  if (saved.data && typeof saved.data === 'object') {
    for (const key of Object.keys(SETTINGS_DEFAULTS))
      if (typeof saved.data[key] === typeof SETTINGS_DEFAULTS[key] || (key === 'activeJobId' && typeof saved.data[key] === 'string'))
        db.settings[key] = saved.data[key];
  }
  db.settings.shopName = String(db.settings.shopName).slice(0, 80);
  Object.assign(db.settings, pick(syncedSettings(db.settings), PILOT_KEYS));
  Object.assign(db.settings, sanitizeBranding(db.settings));

  // Local changes not yet sent to the account (decision 0017): 'collection/id' -> {changed, base},
  // where changed is when it last changed here (ms) and base is the account's copy the change
  // started from ({version, data}; null for a record the account has not had). Recorded only while
  // record sync is on.
  const box = await storage.load('outbox');
  const validBase = b => (b && Number.isInteger(b.version) && b.version >= 0 && (b.data === null || typeof b.data === 'object') ? {version: b.version, data: b.data} : null);
  db.outbox = new Map(Array.isArray(box.data) ? box.data.filter(e => OUTBOX_KEY.test(e?.key) && Number.isFinite(e?.changed))
    .map(e => [e.key, {changed: e.changed, base: validBase(e.base)}]) : []);
  // The account's version of each record this device has: 'collection/id' -> version.
  const versions = await storage.load('versions');
  db.versions = new Map(versions.data && typeof versions.data === 'object' && !Array.isArray(versions.data)
    ? Object.entries(versions.data).filter(([key, v]) => OUTBOX_KEY.test(key) && Number.isInteger(v) && v > 0) : []);
  // Change times on this device only go up, even within one millisecond, so the server (where the
  // later change wins) never mistakes a second edit for a repeat of the first.
  // Photos whose file the account has (core/photo-sync.js), by id.
  const files = await storage.load('photofiles');
  db.photoFiles = new Set(Array.isArray(files.data) ? files.data.filter(id => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)) : []);
  let lastStamp = Math.max(0, ...[...db.outbox.values()].map(e => e.changed));
  db.stamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1));
  // Records a local change: `items` are [{id, before}] with the record as it was before this change
  // (null when new). The first change since the last send keeps the account's copy as its base.
  const track = (name, items) => {
    if (!db.settings.recordSyncOn || !items.length) return;
    for (const {id, before} of items) {
      const key = `${name}/${id}`, pending = db.outbox.get(key);
      if (pending) pending.changed = db.stamp();
      else db.outbox.set(key, {changed: db.stamp(), base: db.versions.has(key) ? {version: db.versions.get(key), data: before ?? null} : null});
    }
    persist('outbox');
    db.onLocalChange?.();
  };

  const find = (name, id) => db[name].find(item => item.id === id) || null;

  // Adds a record after validation. Returns the stored record, or throws a message for the user.
  async function add(name, fields) {
    const spec = SPEC[name];
    const record = spec.sanitize({id: newId(), created: Date.now(), ...fields});
    if (!record) throw new Error(`The ${spec.label} is missing required details.`);
    if (name === 'reports') {
      db.reports.unshift(record);
      const dropped = db.reports.length - spec.limit;
      if (dropped > 0) db.reports.length = spec.limit;
      await persist(name);
      track(name, [{id: record.id, before: null}]);
      return {record, dropped: Math.max(0, dropped)};
    }
    if (db[name].length >= spec.limit) throw new Error(`The ${spec.label} limit (${spec.limit}) is reached.`);
    db[name].unshift(record);
    await persist(name);
    track(name, [{id: record.id, before: null}]);
    return {record, dropped: 0};
  }

  async function update(name, id, patch) {
    const index = db[name].findIndex(item => item.id === id);
    if (index < 0) throw new Error('That record no longer exists.');
    const record = SPEC[name].sanitize({...db[name][index], ...patch, id, created: db[name][index].created});
    if (!record) throw new Error(`The ${SPEC[name].label} is missing required details.`);
    const before = db[name][index];
    db[name][index] = record;
    await persist(name);
    track(name, [{id, before}]);
    return record;
  }

  // Deletion is refused while other records still point at this one.
  async function remove(name, id) {
    const blockers = {
      customers: () => db.vehicles.some(v => v.customerId === id) || db.jobs.some(j => j.customerId === id),
      vehicles: () => db.jobs.some(j => j.vehicleId === id),
      jobs: () => db.reports.some(r => r.jobId === id) || db.diagnoses.some(d => d.jobId === id) || db.photos.some(p => p.jobId === id),
      photos: () => false // the image files are removed by the desktop app (desktop/photos.cjs)
    }[name];
    if (!blockers) throw new Error('Reports cannot be deleted from Studio.');
    if (blockers()) throw new Error(`This ${SPEC[name].label} still has linked records.`);
    const before = find(name, id);
    db[name] = db[name].filter(item => item.id !== id);
    if (name === 'jobs' && db.settings.activeJobId === id) await setSetting('activeJobId', null);
    await persist(name);
    if (before) track(name, [{id, before}]);
  }

  // Applies records received from the account (record sync): [{collection, id, data}] where data is
  // null for a deletion. Not recorded as local changes. Each touched collection is saved once.
  // Returns how many records changed here.
  async function applyRemote(rows) {
    const touched = new Set();
    for (const {collection: name, id, data} of rows) {
      if (!SPEC[name]) continue;
      const index = db[name].findIndex(item => item.id === id);
      if (data === null) {
        if (index < 0) continue;
        db[name].splice(index, 1);
        if (name === 'jobs' && db.settings.activeJobId === id) db.settings.activeJobId = null;
        touched.add(name);
        continue;
      }
      const record = SPEC[name].sanitize({...data, id});
      if (!record) continue;
      if (index >= 0) db[name][index] = record;
      else if (name === 'reports' || db[name].length < SPEC[name].limit) db[name].unshift(record);
      else continue;
      touched.add(name);
    }
    if (touched.has('reports')) { db.reports.sort((a, b) => b.created - a.created); db.reports.length = Math.min(db.reports.length, SPEC.reports.limit); }
    for (const name of touched) await persist(name);
    if (touched.has('jobs')) await persist('settings');
    return touched.size ? rows.length : 0;
  }
  const saveOutbox = () => persist('outbox');
  const savePhotoFiles = () => persist('photofiles');
  const saveVersions = () => persist('versions');

  async function setSetting(key, value) {
    if (!(key in SETTINGS_DEFAULTS)) throw new Error(`Unknown setting ${key}`);
    db.settings[key] = value;
    await persist('settings');
  }

  // Merges imported records (same rules as backup import: never overwrite an existing id).
  async function merge(name, incoming) {
    const ids = new Set(db[name].map(item => item.id));
    const fresh = incoming.map(SPEC[name].sanitize).filter(item => item && !ids.has(item.id));
    const room = Math.max(0, SPEC[name].limit - db[name].length);
    const accepted = name === 'reports' ? fresh : fresh.slice(0, room);
    db[name] = [...db[name], ...accepted];
    track(name, accepted.map(item => ({id: item.id, before: null})));
    if (name === 'reports') { db.reports.sort((a, b) => b.created - a.created); db.reports.length = Math.min(db.reports.length, SPEC.reports.limit); }
    await persist(name);
    return {added: accepted.length, skipped: incoming.length - accepted.length};
  }

  const queries = {
    customer: id => find('customers', id),
    vehicle: id => find('vehicles', id),
    job: id => find('jobs', id),
    report: id => find('reports', id),
    vehiclesOf: customerId => db.vehicles.filter(v => v.customerId === customerId),
    jobsOf: vehicleId => db.jobs.filter(j => j.vehicleId === vehicleId),
    reportsOf: jobId => db.reports.filter(r => r.jobId === jobId),
    diagnosis: id => find('diagnoses', id),
    diagnosesOf: jobId => db.diagnoses.filter(d => d.jobId === jobId),
    photosOf: jobId => db.photos.filter(p => p.jobId === jobId).sort((a, b) => a.created - b.created),
    // Every report for a vehicle across all of its work orders, newest first.
    reportsForVehicle: vehicleId => {
      const jobIds = new Set(db.jobs.filter(j => j.vehicleId === vehicleId).map(j => j.id));
      return db.reports.filter(r => jobIds.has(r.jobId));
    },
    activeJob: () => db.settings.activeJobId ? find('jobs', db.settings.activeJobId) : null,
    // Customer, vehicle and job for a work order, each possibly null.
    context: jobId => {
      const job = jobId ? find('jobs', jobId) : null;
      const vehicle = job?.vehicleId ? find('vehicles', job.vehicleId) : null;
      const customer = (job?.customerId || vehicle?.customerId) ? find('customers', job?.customerId || vehicle.customerId) : null;
      return {job, vehicle, customer};
    },
    flush: () => Promise.all(Object.values(queues))
  };
  return Object.assign(db, {add, update, remove, setSetting, merge, applyRemote, saveOutbox, savePhotoFiles, saveVersions, find}, queries);
}
