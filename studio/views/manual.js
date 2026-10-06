// Manual diagnosis (decision 0006, both editions): the technician records the complaint, what
// they observed and measured, and their findings, and Studio produces a clean PDF report.
// Studio supplies no limits of its own: a reading is judged only against the range the
// technician entered, with its source. Suspected causes stay suspected until confirmed.
// Decision 0019 adds the vehicle as it arrived, warranty intake, the inspection checklist, safety
// status, and explicit finalizing: a diagnosis is a DRAFT until a technician finalizes it, a final
// diagnosis cannot be edited without reopening it with a reason, and every change is in its history.
import {esc, dateTime, printReport, reportSavedMessage, dialog, confirmAction, download} from '../core/ui.js';
import {diagnosesCsv} from '../diagnosis-export.js';
import {studioGettingStarted} from './help.js';
import {icon} from '../core/icons.js';
import {readingVerdict, READING_UNITS, FINDING_STATUSES, newItemId, sanitizeDiagnosis} from '../records.js';
import {VEHICLE_CATEGORIES, BATTERY_CLASSES, WARRANTY_STATUSES, SAFETY_LEVELS, CONFIDENCE, INSPECTION, INSPECTION_RESULTS, AUDIT_ACTIONS,
  inspectionId, auditEntry, changedFields, finalizeProblem, finalizeChanges, reopenChanges, duplicateNumbers} from '../diagnosis-fields.js';
import {makeChoices} from '../brand-presets.js';
import {diagnosisReportHtml, internalReportHtml} from './report-document.js';
import {photoPanel, reportPhotos, missingPhotosNote} from './photos.js';
import {aiAvailable} from '../core/ai-assist.js';
import {reviewWording} from './ai-review.js';
import {openPilotFeedback, feedbackAvailable} from './feedback.js';

// Plain descriptions of what a customer or technician may notice. They carry no limits.
export const SYMPTOMS = ['Does not power on', 'Motor does not run', 'Cuts out under load', 'Intermittent power', 'Reduced power or speed',
  'Error code on display', 'Throttle not responding', 'Pedal assist not working', 'Battery drains quickly', 'Battery will not charge',
  'Charger fault light', 'Unusual motor noise', 'Overheating', 'Water exposure', 'Lights or accessories not working', 'Brake cut-off stuck on'];
export const MEASUREMENTS = ['Battery voltage, at rest', 'Battery voltage, under load', 'Charger output voltage', 'Controller supply voltage',
  'Throttle supply', 'Throttle signal, closed', 'Throttle signal, fully open', 'Hall sensor supply', 'Hall sensor A', 'Hall sensor B', 'Hall sensor C',
  'Phase resistance A–B', 'Phase resistance B–C', 'Phase resistance C–A', 'Brake lever signal', 'Pedal assist sensor signal', 'Display supply',
  'Insulation resistance', 'Motor temperature', 'Battery temperature', 'Tire pressure, front', 'Tire pressure, rear'];
const FINDING_LABEL = {observed: 'Observed', suspected: 'Suspected', confirmed: 'Confirmed', 'ruled-out': 'Ruled out'};
const VERDICT_LABEL = {within: 'Within range', outside: 'Outside range', none: 'No range'};

const blankReading = () => ({id: newItemId(), what: '', where: '', value: null, unit: 'V', min: null, max: null, source: '', conditions: '', instrument: '', notes: '', takenAt: null});
const blankFinding = () => ({id: newItemId(), text: '', status: 'observed', how: ''});
const emptyDraft = (db) => ({id: null, jobId: db.settings.activeJobId, complaint: '', symptoms: [], readings: [blankReading()],
  findings: [blankFinding()], recommendations: '', parts: '', technician: db.settings.technician, vehicleInfo: {odometerUnit: 'mi'}, warranty: {},
  intakeCondition: '', inspection: [], confidence: '', evidence: '', severity: '', verification: '', internalNotes: '',
  reportNumber: '', revision: 0, finalizedAt: null, finalizedBy: '', audit: [], status: 'Draft', newJob: {}});
const numberOrNull = v => { const t = String(v ?? '').trim().replace(',', '.'); return t === '' || !Number.isFinite(Number(t)) ? null : Number(t); };
const integerOrNull = v => { const n = numberOrNull(v); return n !== null && Number.isInteger(n) ? n : null; };
const shown = v => v === null || v === undefined ? '' : String(v);
const str = (data, name) => String(data.get(name) ?? '');
const options = (map, current) => Object.entries(map).map(([value, label]) => `<option value="${esc(value)}" ${current === value ? 'selected' : ''}>${esc(label)}</option>`).join('');
const listOptions = (list, current, blank = '—') => `<option value="">${esc(blank)}</option>${list.map(v => `<option ${current === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}`;

// Reads the editor form into the draft, keeping rows the technician has not filled in yet.
function collect(form, draft) {
  const data = new FormData(form);
  const count = name => Number(data.get(name)) || 0;
  draft.jobId = data.get('job') || null;
  draft.newJob = {title: str(data, 'new_title'), vehicle: str(data, 'new_vehicle'), customer: str(data, 'new_customer'), phone: str(data, 'new_phone')};
  draft.complaint = str(data, 'complaint');
  draft.symptoms = [...data.getAll('sym').map(String), ...str(data, 'sym_other').split(',').map(s => s.trim()).filter(Boolean)];
  draft.vehicleInfo = {category: str(data, 'v_category'), make: str(data, 'v_make'), model: str(data, 'v_model'), year: integerOrNull(data.get('v_year')),
    color: str(data, 'v_color'), serial: str(data, 'v_serial'), keys: integerOrNull(data.get('v_keys')), charger: str(data, 'v_charger'),
    batteryClass: str(data, 'v_battery'), motorWatts: numberOrNull(data.get('v_motor')), controller: str(data, 'v_controller'),
    odometer: numberOrNull(data.get('v_odometer')), odometerUnit: str(data, 'v_odounit'), warranty: str(data, 'v_warranty')};
  draft.warranty = {proof: str(data, 'w_proof'), purchased: str(data, 'w_purchased'), expires: str(data, 'w_expires'), caseNumber: str(data, 'w_case'),
    manufacturerDiagnosis: str(data, 'w_mfr'), partsShipped: str(data, 'w_shipped'), partsReceived: str(data, 'w_received'), notes: str(data, 'w_notes')};
  draft.intakeCondition = str(data, 'intake');
  draft.inspection = Object.entries(INSPECTION).flatMap(([area, items]) => items.map(item => {
    const id = inspectionId(area, item);
    return {id, result: str(data, `i_${id}`), note: str(data, `in_${id}`)};
  }));
  draft.readings = Array.from({length: count('rc')}, (_, i) => {
    const before = draft.readings?.find(r => r.id === str(data, `r${i}_id`));
    const reading = {id: str(data, `r${i}_id`) || newItemId(), what: str(data, `r${i}_what`), where: str(data, `r${i}_where`),
      value: numberOrNull(data.get(`r${i}_value`)), unit: str(data, `r${i}_unit`), min: numberOrNull(data.get(`r${i}_min`)), max: numberOrNull(data.get(`r${i}_max`)),
      source: str(data, `r${i}_source`), conditions: str(data, `r${i}_cond`), instrument: str(data, `r${i}_inst`), notes: str(data, `r${i}_notes`), takenAt: before?.takenAt ?? null};
    // When the reading was taken: the first time a value was entered, unless it is changed.
    if (reading.value !== null && (reading.takenAt === null || before?.value !== reading.value)) reading.takenAt = Date.now();
    return reading;
  });
  draft.findings = Array.from({length: count('fc')}, (_, i) => ({id: str(data, `f${i}_id`) || newItemId(), text: str(data, `f${i}_text`),
    status: String(data.get(`f${i}_status`) ?? 'observed'), how: str(data, `f${i}_how`)}));
  draft.confidence = str(data, 'confidence');
  draft.evidence = str(data, 'evidence');
  draft.severity = str(data, 'severity');
  draft.recommendations = str(data, 'recommendations');
  draft.parts = str(data, 'parts');
  draft.verification = str(data, 'verification');
  draft.internalNotes = str(data, 'internal');
  draft.technician = str(data, 'technician');
  return draft;
}

const EDITABLE = ['jobId', 'complaint', 'symptoms', 'readings', 'findings', 'recommendations', 'parts', 'technician', 'vehicleInfo', 'warranty',
  'intakeCondition', 'inspection', 'confidence', 'evidence', 'severity', 'verification', 'internalNotes'];

// Saves the draft (creating the work order, vehicle and customer first when asked). Returns the record.
async function save(ctx, draft) {
  const {db} = ctx;
  const stored = draft.id ? db.diagnosis(draft.id) : null;
  if (stored?.finalizedAt) throw new Error('This diagnosis is final. Reopen it for correction to change it.');
  if (draft.jobId === 'new') {
    const n = draft.newJob;
    if (!n.vehicle.trim()) throw new Error('Enter the vehicle for the new work order.');
    const customerId = n.customer.trim() ? (await db.add('customers', {name: n.customer, phone: n.phone})).record.id : null;
    const vehicleId = (await db.add('vehicles', {customerId, name: n.vehicle})).record.id;
    const title = n.title.trim() || `WO-${String(1001 + db.jobs.length)}`;
    draft.jobId = (await db.add('jobs', {title, vehicle: n.vehicle.trim(), vehicleId, customerId, symptom: draft.complaint.slice(0, 500), status: 'In progress'})).record.id;
    draft.newJob = {};
  }
  const fields = Object.fromEntries(EDITABLE.map(key => [key, draft[key]]));
  if (!fields.readings.some(r => r.what.trim()) && !fields.findings.some(f => f.text.trim()) && !fields.complaint.trim())
    throw new Error('Record the complaint, a measurement or a finding before saving.');
  const unitless = fields.readings.find(r => r.what.trim() && r.value !== null && !r.unit);
  if (unitless) throw new Error(`Choose the unit for “${unitless.what.trim()}”.`);
  const by = fields.technician || db.settings.technician;
  let record;
  if (stored) {
    const candidate = {...stored, ...fields};
    const changed = changedFields(stored, sanitizeDiagnosis({...candidate, updated: Date.now()}));
    if (!changed.length) return stored;
    record = await db.update('diagnoses', stored.id, {...fields, updated: Date.now(), audit: [...stored.audit, auditEntry('edited', by, changed.join(', '))]});
  } else {
    record = (await db.add('diagnoses', {...fields, revision: 0, updated: Date.now(), audit: [auditEntry('created', by)]})).record;
  }
  if (fields.technician && !db.settings.technician) await db.setSetting('technician', fields.technician.slice(0, 80));
  draft.id = record.id;
  // Show the stored (sanitized) record, plus one empty row to keep typing into.
  Object.assign(draft, editable(record));
  return record;
}

const editable = record => ({...structuredClone(record), readings: [...record.readings, blankReading()], findings: [...record.findings, blankFinding()], newJob: {}});

// Builds the customer report, or with `internal` the technician's internal report, and saves it.
export async function saveDiagnosisReport(db, id, about, {internal = false} = {}) {
  const diagnosis = db.diagnosis(id);
  if (!diagnosis) throw new Error('Diagnosis not found.');
  const {job, vehicle, customer} = db.context(diagnosis.jobId);
  const photos = await reportPhotos(db, job?.id);
  const build = internal ? internalReportHtml : diagnosisReportHtml;
  const html = build({diagnosis, job, vehicle, customer, photos, settings: db.settings, appVersion: about?.version || 'preview'});
  const label = diagnosis.reportNumber ? `${diagnosis.reportNumber}${diagnosis.revision > 1 ? `-rev${diagnosis.revision}` : ''}` : `draft-${job?.title || diagnosis.id.slice(0, 8)}`;
  const name = `${internal ? 'internal' : 'diagnostic'}-report-${label}`.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  const result = globalThis.evcore?.report ? await globalThis.evcore.report.savePdf(html, name) : await printReport(html, name);
  if (result?.saved || result?.printed) {
    const by = db.settings.technician || diagnosis.technician;
    await db.update('diagnoses', id, {audit: [...diagnosis.audit, auditEntry(internal ? 'internal-report' : 'customer-report', by,
      `${diagnosis.status === 'Final' ? `${diagnosis.reportNumber} revision ${diagnosis.revision}` : 'DRAFT'}`)]});
  }
  return {...result, photosMissing: photos.missing};
}

function statusTag(d) {
  if (d.status === 'Final') return `<span class="tag ok" title="Finalized by ${esc(d.finalizedBy)} on ${esc(dateTime(d.finalizedAt))}">Final ${esc(d.reportNumber || '')}${d.revision > 1 ? ` · rev ${d.revision}` : ''}</span>`;
  return `<span class="tag" title="The report says DRAFT on every page until the diagnosis is finalized">Draft${d.reportNumber ? ` · ${esc(d.reportNumber)} reopened` : ''}</span>`;
}

function listView(ctx) {
  const {db} = ctx;
  const rows = db.diagnoses.slice(0, 200);
  const dupes = duplicateNumbers(db.diagnoses);
  return `${studioGettingStarted(ctx)}<div class="pagebar">${db.settings.reportPrefix ? `<span class="muted small">Report numbers ${esc(db.settings.reportPrefix)}-YYYY-NNNN</span>` : ''}<div class="spacer"></div>${db.diagnoses.length ? '<button data-action="manual-export" title="Every diagnosis as a spreadsheet, with this location on each row; no customer details">Export CSV</button>' : ''}<button class="primary" data-action="manual-new">${icon('plus')}New diagnosis</button></div>
  ${dupes.size ? `<p class="note warn">${icon('shield')}Report number${dupes.size > 1 ? 's' : ''} ${esc([...dupes].join(', '))} ${dupes.size > 1 ? 'are' : 'is'} used twice, probably by two computers finalizing offline at the same time. Reopen one of them and tell support; the number is not changed automatically.</p>` : ''}
  <section class="panel flush"><table class="list"><thead><tr><th>Updated</th><th>Report</th><th>Vehicle</th><th>Work order</th><th>Complaint</th><th>Readings</th><th>Safety</th><th>Status</th><th></th></tr></thead><tbody>
  ${rows.map(d => {
    const {job, vehicle} = db.context(d.jobId);
    const outside = d.readings.filter(r => readingVerdict(r) === 'outside').length;
    const vehicleName = [d.vehicleInfo.make, d.vehicleInfo.model].filter(Boolean).join(' ') || vehicle?.name || job?.vehicle || '—';
    return `<tr class="row-link" data-action="manual-open" data-id="${esc(d.id)}" tabindex="0" role="button"><td class="num">${esc(dateTime(d.updated))}</td>
      <td class="num">${esc(d.reportNumber || '—')}${dupes.has(d.reportNumber) ? ' <span class="tag bad">duplicate</span>' : ''}</td>
      <td>${esc(vehicleName)}</td><td class="num">${esc(job?.title || '—')}</td><td class="clip">${esc(d.complaint || '—')}</td>
      <td class="num">${d.readings.length}${outside ? ` <span class="tag bad">${outside} outside</span>` : ''}</td>
      <td>${d.severity ? `<span class="tag ${['unsafe', 'battery', 'no-power'].includes(d.severity) ? 'bad' : ''}">${esc(SAFETY_LEVELS[d.severity])}</span>` : '—'}</td>
      <td>${statusTag(d)}</td>
      <td class="right"><button class="small quiet" data-action="manual-pdf" data-id="${esc(d.id)}" title="Save the customer report as PDF">${icon('pdf')}PDF</button></td></tr>`;
  }).join('') || `<tr><td colspan="9"><div class="empty">No diagnoses yet.<br><button class="primary small" data-action="manual-new">${icon('plus')}New diagnosis</button></div></td></tr>`}
  </tbody></table></section>`;
}

function jobSection({db}, d) {
  const jobs = db.jobs.filter(j => j.status !== 'Complete' || j.id === d.jobId);
  const isNew = d.jobId === 'new';
  return `<section class="panel"><header class="panelhead"><h2>Vehicle and work order</h2></header>
    <div class="formgrid"><label class="field">Work order<select name="job" data-change="manual-job">
      <option value="" ${!d.jobId ? 'selected' : ''}>Not linked</option><option value="new" ${isNew ? 'selected' : ''}>New work order…</option>
      ${jobs.map(j => `<option value="${esc(j.id)}" ${d.jobId === j.id ? 'selected' : ''}>${esc(j.title)} · ${esc(j.vehicle)}</option>`).join('')}</select></label>
    ${isNew ? `<label class="field">Vehicle<input name="new_vehicle" value="${esc(d.newJob?.vehicle)}" placeholder="e.g. Bafang M500 e-bike" maxlength="80" required></label>
      <label class="field">Customer<input name="new_customer" value="${esc(d.newJob?.customer)}" maxlength="80"></label>
      <label class="field">Customer phone<input name="new_phone" value="${esc(d.newJob?.phone)}" maxlength="40"></label>
      <label class="field">Work order number<input name="new_title" value="${esc(d.newJob?.title)}" placeholder="WO-${1001 + db.jobs.length}" maxlength="80"></label>` : ''}</div>
    ${vehicleFields(db, d.vehicleInfo)}
    <label class="field">Customer complaint<textarea name="complaint" maxlength="2000" placeholder="What the customer reports, in their own words">${esc(d.complaint)}</textarea></label>
    <div class="fieldlabel">Symptoms observed</div><div class="chipset">${SYMPTOMS.map(s => `<label class="chip"><input type="checkbox" name="sym" value="${esc(s)}" ${d.symptoms.includes(s) ? 'checked' : ''}><span>${esc(s)}</span></label>`).join('')}</div>
    <label class="field">Other symptoms (comma separated)<input name="sym_other" value="${esc(d.symptoms.filter(s => !SYMPTOMS.includes(s)).join(', '))}" maxlength="400"></label>
    <label class="field">Condition at intake and safety check<textarea name="intake" maxlength="2000" placeholder="Damage, missing parts, battery swelling or heat, water exposure, anything unsafe before work starts">${esc(d.intakeCondition)}</textarea></label></section>`;
}

function vehicleFields(db, v) {
  return `<div class="fieldlabel">Vehicle as it arrived</div><datalist id="make-names">${makeChoices(db.diagnoses).map(m => `<option value="${esc(m)}">`).join('')}</datalist>
    <div class="formgrid">
    <label class="field">Category<select name="v_category">${listOptions(VEHICLE_CATEGORIES, v.category, 'Choose…')}</select></label>
    <label class="field">Make<input name="v_make" list="make-names" value="${esc(v.make)}" maxlength="60"></label>
    <label class="field">Model<input name="v_model" value="${esc(v.model)}" maxlength="80"></label>
    <label class="field">Model year<input name="v_year" inputmode="numeric" class="numin" value="${esc(shown(v.year))}" maxlength="4"></label>
    <label class="field">Colour<input name="v_color" value="${esc(v.color)}" maxlength="40"></label>
    <label class="field">Serial number<input name="v_serial" value="${esc(v.serial)}" maxlength="60"></label>
    <label class="field">Keys received<input name="v_keys" inputmode="numeric" class="numin" value="${esc(shown(v.keys))}" maxlength="2"></label>
    <label class="field">Charger received<select name="v_charger">${options({'': '—', yes: 'Yes', no: 'No'}, v.charger)}</select></label>
    <label class="field">Battery voltage class<select name="v_battery">${listOptions(BATTERY_CLASSES, v.batteryClass)}</select></label>
    <label class="field">Motor power (W, as labeled)<input name="v_motor" inputmode="decimal" class="numin" value="${esc(shown(v.motorWatts))}"></label>
    <label class="field">Controller<input name="v_controller" value="${esc(v.controller)}" maxlength="120" placeholder="Label, model or part number"></label>
    <label class="field">Odometer<span class="inline"><input name="v_odometer" inputmode="decimal" class="numin" value="${esc(shown(v.odometer))}" aria-label="Odometer">
      <select name="v_odounit" aria-label="Odometer unit">${options({mi: 'mi', km: 'km'}, v.odometerUnit || 'mi')}</select></span></label>
    <label class="field">Warranty<select name="v_warranty">${options(WARRANTY_STATUSES, v.warranty)}</select></label></div>`;
}

function warrantySection(d) {
  const w = d.warranty;
  const open = ['manufacturer', 'shop', 'claim'].includes(d.vehicleInfo.warranty) || Object.values(w).some(Boolean);
  return `<details class="panel" ${open ? 'open' : ''}><summary><h2>Warranty intake</h2><span class="sub">For warranty work: what the manufacturer needs, and the parts trail.</span></summary>
    <div class="formgrid">
    <label class="field">Proof of purchase<select name="w_proof">${options({'': '—', yes: 'Seen', no: 'Not provided'}, w.proof)}</select></label>
    <label class="field">Purchase date<input type="date" name="w_purchased" value="${esc(w.purchased)}"></label>
    <label class="field">Warranty expires<input type="date" name="w_expires" value="${esc(w.expires)}"></label>
    <label class="field">Manufacturer case number<input name="w_case" value="${esc(w.caseNumber)}" maxlength="80"></label>
    <label class="field">Warranty parts shipped<input type="date" name="w_shipped" value="${esc(w.partsShipped)}"></label>
    <label class="field">Warranty parts received<input type="date" name="w_received" value="${esc(w.partsReceived)}"></label></div>
    <label class="field">Manufacturer's diagnosis or instructions<textarea name="w_mfr" maxlength="2000">${esc(w.manufacturerDiagnosis)}</textarea></label>
    <label class="field">Warranty notes<textarea name="w_notes" maxlength="2000" placeholder="Photos and videos sent, correspondence, approvals">${esc(w.notes)}</textarea></label></details>`;
}

function inspectionSection(d) {
  const byId = new Map(d.inspection.map(i => [i.id, i]));
  const done = d.inspection.filter(i => i.result).length;
  const table = (area, title) => `<div><h3>${title}</h3><table class="edit inspection"><tbody>${INSPECTION[area].map(item => {
    const id = inspectionId(area, item); const i = byId.get(id) ?? {result: '', note: ''};
    return `<tr><td>${esc(item)}</td><td><select name="i_${id}" aria-label="${esc(item)}">${options(INSPECTION_RESULTS, i.result)}</select></td>
      <td><input name="in_${id}" value="${esc(i.note)}" maxlength="300" placeholder="Note" aria-label="${esc(item)} note"></td></tr>`;
  }).join('')}</tbody></table></div>`;
  return `<details class="panel" ${done ? 'open' : ''}><summary><h2>Inspection</h2><span class="sub">${done ? `${done} item${done > 1 ? 's' : ''} checked` : 'Mechanical and electrical checklist'}</span></summary>
    <div class="formgrid two">${table('mechanical', 'Mechanical')}${table('electrical', 'Electrical')}</div></details>`;
}

function readingsSection(d) {
  return `<section class="panel flush"><header class="panelhead"><h2>Measurements</h2><span class="sub">Enter the expected range and where it comes from; Studio compares only against that.</span>
    <div class="spacer"></div><button type="button" class="small" data-action="manual-add-reading">${icon('plus')}Add measurement</button></header>
    <input type="hidden" name="rc" value="${d.readings.length}"><datalist id="measure-names">${MEASUREMENTS.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
    <table class="edit"><thead><tr><th>Measurement</th><th>Where</th><th>Reading</th><th>Unit</th><th>Expected min</th><th>Expected max</th><th>Range source</th><th>Result</th><th></th></tr></thead><tbody>
    ${d.readings.map((r, i) => {
      const v = readingVerdict({value: r.value, min: r.min, max: r.max});
      return `<tr><td><input type="hidden" name="r${i}_id" value="${esc(r.id)}"><input name="r${i}_what" id="r${i}_what" list="measure-names" value="${esc(r.what)}" maxlength="120" aria-label="Measurement ${i + 1}"></td>
        <td><input name="r${i}_where" id="r${i}_where" value="${esc(r.where)}" maxlength="120" placeholder="Test points" aria-label="Where"></td>
        <td><input name="r${i}_value" id="r${i}_value" class="numin" inputmode="decimal" value="${esc(shown(r.value))}" aria-label="Reading"></td>
        <td><select name="r${i}_unit" aria-label="Unit">${READING_UNITS.map(u => `<option ${r.unit === u ? 'selected' : ''} value="${esc(u)}">${esc(u || '—')}</option>`).join('')}</select></td>
        <td><input name="r${i}_min" id="r${i}_min" class="numin" inputmode="decimal" value="${esc(shown(r.min))}" aria-label="Expected minimum"></td>
        <td><input name="r${i}_max" id="r${i}_max" class="numin" inputmode="decimal" value="${esc(shown(r.max))}" aria-label="Expected maximum"></td>
        <td><input name="r${i}_source" id="r${i}_source" value="${esc(r.source)}" maxlength="160" placeholder="e.g. service manual p. 12" aria-label="Range source"></td>
        <td><span class="tag ${v === 'within' ? 'ok' : v === 'outside' ? 'bad' : ''}">${VERDICT_LABEL[v]}</span></td>
        <td class="right"><button type="button" class="iconbtn" data-action="manual-remove-reading" data-index="${i}" aria-label="Remove measurement ${i + 1}">${icon('trash')}</button></td></tr>
        <tr class="subrow"><td colspan="2"><input name="r${i}_cond" value="${esc(r.conditions)}" maxlength="200" placeholder="Conditions (e.g. wheel lifted, full throttle, 21 °C)" aria-label="Test conditions"></td>
        <td colspan="2"><input name="r${i}_inst" value="${esc(r.instrument)}" maxlength="80" placeholder="Instrument" aria-label="Instrument"></td>
        <td colspan="3"><input name="r${i}_notes" value="${esc(r.notes)}" maxlength="300" placeholder="Notes" aria-label="Measurement notes"></td>
        <td colspan="2" class="muted small">${r.takenAt ? esc(dateTime(r.takenAt)) : ''}</td></tr>`;
    }).join('')}</tbody></table></section>`;
}

function findingsSection(d) {
  return `<section class="panel"><header class="panelhead"><h2>Findings</h2><span class="sub">Mark a cause Confirmed only when you have proven it, and say how. Ruled out records a cause you checked and excluded.</span>
    <div class="spacer"></div><button type="button" class="small" data-action="manual-add-finding">${icon('plus')}Add finding</button></header>
    <input type="hidden" name="fc" value="${d.findings.length}">
    <div class="findings">${d.findings.map((f, i) => `<div class="findingrow"><input type="hidden" name="f${i}_id" value="${esc(f.id)}"><input name="f${i}_text" id="f${i}_text" value="${esc(f.text)}" maxlength="500" placeholder="What you found" aria-label="Finding ${i + 1}">
      <select name="f${i}_status" data-change="manual-finding-status" aria-label="Status">${FINDING_STATUSES.map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${FINDING_LABEL[s]}</option>`).join('')}</select>
      <input name="f${i}_how" id="f${i}_how" data-change="manual-finding-status" value="${esc(f.how)}" maxlength="300" placeholder="${f.status === 'confirmed' ? 'How it was confirmed (required)' : 'How it was confirmed'}" aria-label="How confirmed" ${f.status === 'confirmed' ? '' : 'disabled'}>
      <button type="button" class="iconbtn" data-action="manual-remove-finding" data-index="${i}" aria-label="Remove finding ${i + 1}">${icon('trash')}</button></div>`).join('')}</div></section>`;
}

function conclusionSection(d) {
  return `<section class="panel"><h2>Conclusion</h2><div class="formgrid">
    <label class="field">Safety status<select name="severity">${options(SAFETY_LEVELS, d.severity)}</select></label>
    <label class="field">Diagnosis confidence<select name="confidence">${options(CONFIDENCE, d.confidence)}</select></label></div>
    <label class="field">Evidence for the diagnosis<textarea name="evidence" maxlength="2000" placeholder="What the conclusion rests on: measurements, reproduced symptom, part swap">${esc(d.evidence)}</textarea></label>
    <div class="formgrid two"><label class="field">Recommended work<textarea name="recommendations" maxlength="4000">${esc(d.recommendations)}</textarea></label>
    <label class="field">Parts needed<textarea name="parts" maxlength="2000">${esc(d.parts)}</textarea></label></div>
    <label class="field">Verification after repair and final road test<textarea name="verification" maxlength="2000" placeholder="The same test repeated after the repair, and the road test">${esc(d.verification)}</textarea></label>
    <label class="field">Internal notes (not on the customer report)<textarea name="internal" maxlength="4000">${esc(d.internalNotes)}</textarea></label>
    <label class="field narrow">Technician<input name="technician" value="${esc(d.technician)}" maxlength="80"></label>
    <p class="note">${icon('shield')}Readings you enter are labeled in the report as taken by the technician, not measured by EVCore equipment. EVCore organizes evidence and documentation; it does not replace technician judgment, manufacturer instructions or required safety procedures.</p></section>`;
}

function historySection(d) {
  if (!d.audit?.length) return '';
  return `<details class="panel"><summary><h2>History</h2><span class="sub">${d.audit.length} entr${d.audit.length > 1 ? 'ies' : 'y'}</span></summary>
    <table class="list"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>
    ${[...d.audit].reverse().map(e => `<tr><td class="num">${esc(dateTime(e.at))}</td><td>${esc(e.by || '—')}</td><td>${esc(AUDIT_ACTIONS[e.action])}</td><td>${esc(e.note)}</td></tr>`).join('')}
    </tbody></table></details>`;
}

function editorView(ctx) {
  const d = ctx.state.manual.draft;
  const saved = d.id ? ctx.db.diagnosis(d.id) : null;
  const final = Boolean(saved?.finalizedAt);
  const problem = final ? '' : finalizeProblem(saved || d);
  return `<form data-form="manual-save" class="manual" autocomplete="off">
  <div class="pagebar"><button type="button" class="quiet" data-action="manual-close">${icon('back')}All diagnoses</button><div class="spacer"></div>
    ${saved ? `<span class="muted small">Saved ${esc(dateTime(saved.updated))}</span>` : ''}${statusTag(saved || d)}
    ${!final && aiAvailable() ? `<button type="button" data-action="manual-ai-wording" title="Suggest customer wording with AI">${icon('spark')}Customer wording</button>` : ''}
    ${final ? `<button type="button" data-action="manual-reopen">Reopen for correction</button>`
      : `<button type="submit">${icon('disk')}Save</button><button type="button" data-action="manual-finalize" title="${esc(problem || 'Sign off the diagnosis and give it its report number')}">Finalize</button>`}
    ${saved && feedbackAvailable() ? '<button type="button" class="quiet" data-action="manual-feedback" title="Tell CS Harness about this screen or this diagnosis">Feedback</button>' : ''}
    ${saved ? `<button type="button" data-action="manual-internal-pdf" title="Every detail, including internal notes, for the shop only">${icon('pdf')}Internal report</button>` : ''}
    <button type="button" class="primary" data-action="manual-save-pdf">${icon('pdf')}${final ? 'Customer PDF' : 'Save and create PDF'}</button></div>
  ${final ? `<p class="note">${icon('shield')}Final ${esc(saved.reportNumber)}${saved.revision > 1 ? ` revision ${saved.revision}` : ''}, finalized by ${esc(saved.finalizedBy || '—')} on ${esc(dateTime(saved.finalizedAt))}. To change it, reopen it for correction: the change is recorded and the next report is a new revision.</p>`
    : problem && saved ? `<p class="note">${icon('shield')}The report says DRAFT until the diagnosis is finalized. ${esc(problem)}</p>` : ''}
  <fieldset class="plain" ${final ? 'disabled' : ''}>
  ${jobSection(ctx, d)}${warrantySection(d)}${inspectionSection(d)}${readingsSection(d)}${findingsSection(d)}${conclusionSection(d)}</fieldset>
  ${historySection(saved || d)}</form>
  ${photoPanel(ctx, d.jobId)}`;
}

const form = () => document.querySelector('form[data-form="manual-save"]');
const isFinal = ctx => Boolean(ctx.state.manual.draft?.id && ctx.db.diagnosis(ctx.state.manual.draft.id)?.finalizedAt);
const edit = (ctx, change) => { if (isFinal(ctx)) return; collect(form(), ctx.state.manual.draft); change(ctx.state.manual.draft); ctx.render(); };
const toastResult = (ctx, result, internal) => {
  const message = reportSavedMessage(internal ? 'Internal report' : 'Diagnostic report', result, missingPhotosNote(result?.photosMissing));
  if (message) ctx.toast(message);
};

export const manual = {
  id: 'manual',
  heading: 'Diagnoses',
  render(ctx) { return ctx.state.manual.draft ? editorView(ctx) : listView(ctx); },
  actions: {
    'manual-new'(_el, ctx) { ctx.state.manual.draft = emptyDraft(ctx.db); ctx.render(); },
    'manual-open'(el, ctx) {
      const d = ctx.db.diagnosis(el.dataset.id); if (!d) return;
      ctx.state.manual.draft = editable(d);
      ctx.render();
    },
    'manual-close'(_el, ctx) { ctx.state.manual.draft = null; ctx.render(); },
    'manual-export'(_el, {db}) {
      const name = `evcore-diagnoses-${(db.settings.reportPrefix || 'shop').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
      download(name, diagnosesCsv(db.diagnoses, {settings: db.settings, jobOf: id => db.job(id)}), 'text/csv');
    },
    'manual-add-reading'(_el, ctx) { edit(ctx, d => d.readings.push(blankReading())); },
    'manual-remove-reading'(el, ctx) { edit(ctx, d => { d.readings.splice(Number(el.dataset.index), 1); if (!d.readings.length) d.readings.push(blankReading()); }); },
    'manual-add-finding'(_el, ctx) { edit(ctx, d => d.findings.push(blankFinding())); },
    'manual-remove-finding'(el, ctx) { edit(ctx, d => { d.findings.splice(Number(el.dataset.index), 1); if (!d.findings.length) d.findings.push(blankFinding()); }); },
    // AI wording (decision 0016): the technician picks which suggestions replace their words.
    async 'manual-ai-wording'(el, ctx) {
      if (isFinal(ctx)) return;
      const draft = collect(form(), ctx.state.manual.draft);
      const {job, vehicle} = ctx.db.context(draft.jobId);
      el.disabled = true;
      try {
        const change = await reviewWording(draft, {vehicle: vehicle?.name || job?.vehicle || draft.newJob?.vehicle || '', toast: ctx.toast});
        if (!change) return;
        Object.assign(draft, change);
        ctx.toast('Wording updated. Save to keep it.');
      } finally { el.disabled = false; ctx.render(); }
    },
    async 'manual-finalize'(_el, ctx) {
      try {
        const record = await save(ctx, collect(form(), ctx.state.manual.draft));
        const problem = finalizeProblem(record);
        if (problem) { ctx.toast(problem); ctx.render(); return; }
        if (!await confirmAction('Finalize this diagnosis?', `It gets its report number and is signed off by ${record.technician}. A final diagnosis can only be changed by reopening it for correction, which is recorded.`, 'Finalize')) { ctx.render(); return; }
        const changes = finalizeChanges(record, {diagnoses: ctx.db.diagnoses, prefix: ctx.db.settings.reportPrefix, by: record.technician});
        const final = await ctx.db.update('diagnoses', record.id, {...changes, updated: Date.now()});
        ctx.state.manual.draft = editable(final);
        ctx.toast(`Final: ${final.reportNumber}${final.revision > 1 ? ` revision ${final.revision}` : ''}.`);
        ctx.render();
      } catch (e) { ctx.toast(e.message); ctx.render(); }
    },
    async 'manual-reopen'(_el, ctx) {
      const record = ctx.db.diagnosis(ctx.state.manual.draft?.id);
      if (!record?.finalizedAt) return;
      const answer = await dialog({title: `Reopen ${record.reportNumber} for correction?`,
        body: 'The diagnosis becomes a draft again. Its number stays; finalizing it again issues the next revision. The reason is kept in its history.',
        html: '<label class="field">Reason for the correction<textarea name="reason" maxlength="500" required></textarea></label>',
        buttons: [{id: 'cancel', label: 'Cancel'}, {id: 'reopen', label: 'Reopen', tone: 'primary'}],
        collect: layer => ({reason: layer.querySelector('[name="reason"]')?.value ?? ''})});
      if (answer?.choice !== 'reopen') return;
      try {
        const changes = reopenChanges(record, {by: ctx.db.settings.technician || record.technician, reason: answer.data.reason});
        const reopened = await ctx.db.update('diagnoses', record.id, {...changes, updated: Date.now()});
        ctx.state.manual.draft = editable(reopened);
        ctx.toast('Reopened for correction. Finalize it again when the correction is done.');
        ctx.render();
      } catch (e) { ctx.toast(e.message); }
    },
    async 'manual-save-pdf'(_el, ctx) {
      try {
        const record = isFinal(ctx) ? ctx.db.diagnosis(ctx.state.manual.draft.id) : await save(ctx, collect(form(), ctx.state.manual.draft));
        toastResult(ctx, await saveDiagnosisReport(ctx.db, record.id, ctx.about), false);
        ctx.state.manual.draft = editable(ctx.db.diagnosis(record.id));
        ctx.render();
      } catch (e) { ctx.toast(e.message); ctx.render(); }
    },
    async 'manual-internal-pdf'(_el, ctx) {
      try {
        const record = isFinal(ctx) ? ctx.db.diagnosis(ctx.state.manual.draft.id) : await save(ctx, collect(form(), ctx.state.manual.draft));
        toastResult(ctx, await saveDiagnosisReport(ctx.db, record.id, ctx.about, {internal: true}), true);
        ctx.state.manual.draft = editable(ctx.db.diagnosis(record.id));
        ctx.render();
      } catch (e) { ctx.toast(e.message); ctx.render(); }
    },
    'manual-feedback'(_el, ctx) { return openPilotFeedback(ctx, {screen: 'Diagnosis', diagnosis: ctx.db.diagnosis(ctx.state.manual.draft?.id)}); },
    async 'manual-pdf'(el, ctx) {
      try { toastResult(ctx, await saveDiagnosisReport(ctx.db, el.dataset.id, ctx.about), false); ctx.render(); }
      catch (e) { ctx.toast(e.message); }
    }
  },
  forms: {
    async 'manual-save'(formEl, _data, ctx) {
      try { await save(ctx, collect(formEl, ctx.state.manual.draft)); ctx.toast('Diagnosis saved.'); ctx.render(); }
      catch (e) { ctx.toast(e.message); ctx.render(); }
    }
  },
  changes: {
    'manual-job'(_el, ctx) { edit(ctx, () => {}); },
    'manual-finding-status'(_el, ctx) { edit(ctx, () => {}); }
  }
};
