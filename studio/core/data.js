// In-memory record database with durable persistence (see core/storage.js).
// Collections: customers -> vehicles -> jobs (work orders) -> reports.
import {sanitizeEntry, sanitizeJob, sanitizeCustomer, sanitizeVehicle, sanitizeDiagnosis,
  REPORT_LIMIT, JOB_LIMIT, CUSTOMER_LIMIT, VEHICLE_LIMIT, DIAGNOSIS_LIMIT} from '../records.js';

const SPEC = {
  customers: {sanitize: sanitizeCustomer, limit: CUSTOMER_LIMIT, label: 'customer'},
  vehicles: {sanitize: sanitizeVehicle, limit: VEHICLE_LIMIT, label: 'vehicle'},
  jobs: {sanitize: sanitizeJob, limit: JOB_LIMIT, label: 'work order'},
  reports: {sanitize: sanitizeEntry, limit: REPORT_LIMIT, label: 'report'},
  diagnoses: {sanitize: sanitizeDiagnosis, limit: DIAGNOSIS_LIMIT, label: 'diagnosis'}
};
const SETTINGS_DEFAULTS = {shopName: '', shopPhone: '', shopAddress: '', technician: '', activeJobId: null,
  mode: 'guided', baud: 115200, reportPageNote: '', theme: 'dark', onboardingHidden: false};
const newId = () => crypto.randomUUID();

export async function openDatabase(storage) {
  const db = {kind: storage.kind, notices: [], settings: {...SETTINGS_DEFAULTS}};
  const queues = {};
  // Saves of one collection run one at a time, in order, so a slow write never races a newer one.
  const persist = name => {
    const snapshot = name === 'settings' ? {...db.settings} : db[name];
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
      return {record, dropped: Math.max(0, dropped)};
    }
    if (db[name].length >= spec.limit) throw new Error(`The ${spec.label} limit (${spec.limit}) is reached.`);
    db[name].unshift(record);
    await persist(name);
    return {record, dropped: 0};
  }

  async function update(name, id, patch) {
    const index = db[name].findIndex(item => item.id === id);
    if (index < 0) throw new Error('That record no longer exists.');
    const record = SPEC[name].sanitize({...db[name][index], ...patch, id, created: db[name][index].created});
    if (!record) throw new Error(`The ${SPEC[name].label} is missing required details.`);
    db[name][index] = record;
    await persist(name);
    return record;
  }

  // Deletion is refused while other records still point at this one.
  async function remove(name, id) {
    const blockers = {
      customers: () => db.vehicles.some(v => v.customerId === id) || db.jobs.some(j => j.customerId === id),
      vehicles: () => db.jobs.some(j => j.vehicleId === id),
      jobs: () => db.reports.some(r => r.jobId === id) || db.diagnoses.some(d => d.jobId === id)
    }[name];
    if (!blockers) throw new Error('Reports cannot be deleted from Studio.');
    if (blockers()) throw new Error(`This ${SPEC[name].label} still has linked records.`);
    db[name] = db[name].filter(item => item.id !== id);
    if (name === 'jobs' && db.settings.activeJobId === id) await setSetting('activeJobId', null);
    await persist(name);
  }

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
  return Object.assign(db, {add, update, remove, setSetting, merge}, queries);
}
