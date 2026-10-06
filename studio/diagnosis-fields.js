// The parts of a manual diagnosis added for the two-location pilot (decision 0019): the vehicle as
// it arrived, warranty intake, the mechanical and electrical inspection, confidence and safety
// severity, verification, internal notes, and explicit finalizing with a location report number,
// revisions and an audit trail. Pure functions; records.js applies them inside sanitizeDiagnosis.
// Nothing here carries a limit or a specification: Studio judges readings only against the range
// the technician entered, with its source (decision 0006).

const text = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max) : '';
const one = (v, list, fallback = '') => list.includes(v) ? v : fallback;
const stamp = v => Number.isFinite(v) && v > 0 ? v : null;
const count = (v, max) => Number.isInteger(v) && v >= 0 && v <= max ? v : null;
const amount = (v, max) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
// A calendar date that exists (2026-02-30 does not; Date would roll it into March).
const day = v => typeof v === 'string' && DATE.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v ? v : '';
const ITEM_ID = /^[A-Za-z0-9-]{1,40}$/;

export const VEHICLE_CATEGORIES = ['Conventional bicycle', 'E-bike', 'Cargo e-bike', 'Trike', 'Folding e-bike', 'eMTB', 'Beach cruiser',
  'Fat-tire bike', 'Moto-style e-bike', 'E-moto / e-dirt bike', 'Kids e-bike', 'Electric board', 'Scooter', 'Other'];
// Nominal pack classes as printed on batteries; a class, not a measured voltage.
export const BATTERY_CLASSES = ['24 V', '36 V', '48 V', '52 V', '60 V', '72 V', '84 V', '96 V', 'Other', 'Unknown'];
export const WARRANTY_STATUSES = {'': 'Not recorded', none: 'Not under warranty', manufacturer: 'Manufacturer warranty', shop: 'Shop warranty',
  claim: 'Warranty claim in progress', unknown: 'Unknown, checking'};
export const SAFETY_LEVELS = {'': 'Not assessed', info: 'Informational', service: 'Service recommended', unsafe: 'Unsafe to ride',
  battery: 'Battery or fire risk', 'no-power': 'Do not power or charge'};
// The levels a customer must be warned about at the top of the report.
export const SAFETY_WARNING = ['unsafe', 'battery', 'no-power'];
export const CONFIDENCE = {'': 'Not stated', low: 'Low', medium: 'Medium', high: 'High'};
export const FINDING_STATUSES = ['observed', 'suspected', 'confirmed', 'ruled-out'];

// The inspection checklist: what to look at, not what it should measure. The result is the
// technician's: OK, needs attention, failed, or not checked.
export const INSPECTION = {
  mechanical: ['Tire pressure and condition', 'Wheels and spokes', 'Brakes', 'Drivetrain and chain', 'Steering and headset', 'Suspension', 'Frame',
    'Controls and levers', 'Fasteners and torque', 'Accessories', 'Road test'],
  electrical: ['Battery condition', 'Charge port', 'Charger output', 'Connectors', 'Wiring and harness', 'Display', 'Throttle', 'Pedal-assist sensor',
    'Brake cut-offs', 'Controller', 'Motor phases and halls', 'Communications', 'Lights', 'Error codes', 'Insulation and shorts']
};
export const INSPECTION_RESULTS = {'': 'Not checked', ok: 'OK', attention: 'Needs attention', fail: 'Failed', na: 'Not applicable'};
export const inspectionId = (area, item) => `${area === 'mechanical' ? 'm' : 'e'}-${item.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`.slice(0, 40);
const INSPECTION_IDS = new Map(Object.entries(INSPECTION).flatMap(([area, items]) => items.map(item => [inspectionId(area, item), {area, item}])));

export const AUDIT_ACTIONS = {created: 'Created', edited: 'Edited', finalized: 'Finalized', reopened: 'Reopened for correction',
  'customer-report': 'Customer report generated', 'internal-report': 'Internal report generated'};
export const AUDIT_LIMIT = 300;

export function sanitizeVehicleInfo(v) {
  const o = v && typeof v === 'object' ? v : {};
  return {category: one(o.category, VEHICLE_CATEGORIES), make: text(o.make, 60), model: text(o.model, 80), year: count(o.year, 2100) >= 1900 ? o.year : null,
    color: text(o.color, 40), serial: text(o.serial, 60), keys: count(o.keys, 20), charger: one(o.charger, ['yes', 'no']),
    batteryClass: one(o.batteryClass, BATTERY_CLASSES), motorWatts: amount(o.motorWatts, 100000), controller: text(o.controller, 120),
    odometer: amount(o.odometer, 1e7), odometerUnit: one(o.odometerUnit, ['mi', 'km'], 'mi'), warranty: one(o.warranty, Object.keys(WARRANTY_STATUSES))};
}

export function sanitizeWarranty(w) {
  const o = w && typeof w === 'object' ? w : {};
  return {proof: one(o.proof, ['yes', 'no']), purchased: day(o.purchased), expires: day(o.expires), caseNumber: text(o.caseNumber, 80),
    manufacturerDiagnosis: text(o.manufacturerDiagnosis, 2000), partsShipped: day(o.partsShipped), partsReceived: day(o.partsReceived), notes: text(o.notes, 2000)};
}

// Only checklist items Studio knows, each once; items not checked yet are not stored.
export function sanitizeInspection(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).flatMap(i => {
    if (!i || typeof i !== 'object' || !INSPECTION_IDS.has(i.id) || seen.has(i.id)) return [];
    const result = one(i.result, Object.keys(INSPECTION_RESULTS));
    const note = text(i.note, 300).trim();
    if (!result && !note) return [];
    seen.add(i.id);
    return [{id: i.id, result, note}];
  });
}

// In time order; entries made in the same millisecond keep the order they were written in.
export function sanitizeAudit(list) {
  return (Array.isArray(list) ? list : []).flatMap(e => {
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !ITEM_ID.test(e.id) || !stamp(e.at) || !Object.hasOwn(AUDIT_ACTIONS, e.action)) return [];
    return [{id: e.id, at: e.at, by: text(e.by, 80), action: e.action, note: text(e.note, 500)}];
  }).sort((a, b) => a.at - b.at).slice(-AUDIT_LIMIT);
}

export const auditEntry = (action, by, note = '', at = Date.now()) => ({id: crypto.randomUUID(), at, by: text(by, 80), action, note: text(note, 500)});

// A report number: PREFIX-YYYY-NNNN, unique within the location's records. Studio numbers in
// order from the highest number it has seen this year; with record sync every computer of the
// location sees the others' numbers within seconds (decision 0019 says what is left).
export const REPORT_NUMBER = /^([A-Z][A-Z0-9-]{0,11})-(\d{4})-(\d{4,6})$/;
export function nextReportNumber(diagnoses, prefix, at = Date.now()) {
  const p = prefix || 'DR';
  const year = new Date(at).getFullYear();
  let highest = 0;
  for (const d of diagnoses) {
    const m = REPORT_NUMBER.exec(d?.reportNumber ?? '');
    if (m && m[1] === p && Number(m[2]) === year) highest = Math.max(highest, Number(m[3]));
  }
  return `${p}-${year}-${String(highest + 1).padStart(4, '0')}`;
}
// Report numbers used by more than one diagnosis (possible only when two computers of one location
// finalized offline at the same time). Shown to the technician; never renumbered silently.
export function duplicateNumbers(diagnoses) {
  const seen = new Map();
  for (const d of diagnoses) if (d.reportNumber) seen.set(d.reportNumber, (seen.get(d.reportNumber) ?? 0) + 1);
  return new Set([...seen].filter(([, n]) => n > 1).map(([number]) => number));
}

// Why a diagnosis cannot be finalized yet, or '' when it can. A qualified person signs it off:
// the technician's name is required, and a cause must be confirmed, with how.
export function finalizeProblem(d) {
  if (d.finalizedAt) return 'This diagnosis is already final.';
  if (!String(d.technician ?? '').trim()) return 'Enter the technician who signs off the diagnosis.';
  if (!d.findings.some(f => f.status === 'confirmed' && f.text.trim() && f.how.trim())) return 'Confirm a finding, and say how it was confirmed, before finalizing.';
  if (!d.severity) return 'Choose the safety status before finalizing.';
  return '';
}

// The changes that finalize a diagnosis: the number (kept from an earlier revision), the next
// revision, who and when, and the audit entry.
export function finalizeChanges(d, {diagnoses, prefix, by, at = Date.now()}) {
  const problem = finalizeProblem({...d, technician: by || d.technician});
  if (problem) throw new Error(problem);
  const reportNumber = d.reportNumber || nextReportNumber(diagnoses.filter(x => x.id !== d.id), prefix, at);
  const revision = (d.revision || 0) + 1;
  return {reportNumber, revision, finalizedAt: at, finalizedBy: text(by || d.technician, 80),
    audit: [...d.audit, auditEntry('finalized', by || d.technician, `${reportNumber} revision ${revision}`, at)]};
}

// Reopening keeps the number; the next finalize issues the next revision.
export function reopenChanges(d, {by, reason, at = Date.now()}) {
  if (!d.finalizedAt) throw new Error('Only a final diagnosis can be reopened.');
  if (!String(reason ?? '').trim()) throw new Error('Say why the diagnosis is being corrected.');
  return {finalizedAt: null, finalizedBy: '', audit: [...d.audit, auditEntry('reopened', by, reason, at)]};
}

// Plain-language names of what changed between two saved copies, for the audit entry.
const LABELS = {complaint: 'complaint', symptoms: 'symptoms', readings: 'measurements', findings: 'findings', recommendations: 'recommended work',
  parts: 'parts', technician: 'technician', vehicleInfo: 'vehicle details', warranty: 'warranty', inspection: 'inspection', intakeCondition: 'intake condition',
  confidence: 'confidence', evidence: 'evidence', severity: 'safety status', verification: 'verification', internalNotes: 'internal notes', jobId: 'work order'};
export function changedFields(before, after) {
  return Object.keys(LABELS).filter(key => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null)).map(key => LABELS[key]);
}
