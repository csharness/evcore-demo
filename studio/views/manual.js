// Manual diagnosis (decision 0006, both editions): the technician records the complaint, what
// they observed and measured, and their findings, and Studio produces a clean PDF report.
// Studio supplies no limits of its own: a reading is judged only against the range the
// technician entered, with its source. Suspected causes stay suspected until confirmed.
import {esc, dateTime, download} from '../core/ui.js';
import {studioGettingStarted} from './help.js';
import {icon} from '../core/icons.js';
import {readingVerdict, READING_UNITS, FINDING_STATUSES, diagnosisStatus} from '../records.js';
import {diagnosisReportHtml} from './report-document.js';

// Plain descriptions of what a customer or technician may notice. They carry no limits.
export const SYMPTOMS = ['Does not power on', 'Motor does not run', 'Cuts out under load', 'Intermittent power', 'Reduced power or speed',
  'Error code on display', 'Throttle not responding', 'Pedal assist not working', 'Battery drains quickly', 'Battery will not charge',
  'Charger fault light', 'Unusual motor noise', 'Overheating', 'Water exposure', 'Lights or accessories not working', 'Brake cut-off stuck on'];
const MEASUREMENTS = ['Battery voltage, at rest', 'Battery voltage, under load', 'Charger output voltage', 'Controller supply voltage',
  'Throttle supply', 'Throttle signal, closed', 'Throttle signal, fully open', 'Hall sensor supply', 'Hall sensor A', 'Hall sensor B', 'Hall sensor C',
  'Phase resistance A–B', 'Phase resistance B–C', 'Phase resistance C–A', 'Brake lever signal', 'Pedal assist sensor signal', 'Display supply',
  'Insulation resistance', 'Motor temperature', 'Battery temperature'];
const FINDING_LABEL = {observed: 'Observed', suspected: 'Suspected', confirmed: 'Confirmed'};
const VERDICT_LABEL = {within: 'Within range', outside: 'Outside range', none: 'No range'};

const blankReading = () => ({what: '', where: '', value: null, unit: 'V', min: null, max: null, source: ''});
const blankFinding = () => ({text: '', status: 'observed', how: ''});
const emptyDraft = (db) => ({id: null, jobId: db.settings.activeJobId, complaint: '', symptoms: [], readings: [blankReading()],
  findings: [blankFinding()], recommendations: '', parts: '', technician: db.settings.technician, status: 'Draft', newJob: {}});
const numberOrNull = v => { const t = String(v ?? '').trim().replace(',', '.'); return t === '' || !Number.isFinite(Number(t)) ? null : Number(t); };
const shown = v => v === null || v === undefined ? '' : String(v);

// Reads the editor form into the draft, keeping rows the technician has not filled in yet.
function collect(form, draft) {
  const data = new FormData(form);
  const count = name => Number(data.get(name)) || 0;
  draft.jobId = data.get('job') || null;
  draft.newJob = {title: String(data.get('new_title') ?? ''), vehicle: String(data.get('new_vehicle') ?? ''),
    customer: String(data.get('new_customer') ?? ''), phone: String(data.get('new_phone') ?? '')};
  draft.complaint = String(data.get('complaint') ?? '');
  draft.symptoms = [...data.getAll('sym').map(String), ...String(data.get('sym_other') ?? '').split(',').map(s => s.trim()).filter(Boolean)];
  draft.readings = Array.from({length: count('rc')}, (_, i) => ({what: String(data.get(`r${i}_what`) ?? ''), where: String(data.get(`r${i}_where`) ?? ''),
    value: numberOrNull(data.get(`r${i}_value`)), unit: String(data.get(`r${i}_unit`) ?? ''), min: numberOrNull(data.get(`r${i}_min`)),
    max: numberOrNull(data.get(`r${i}_max`)), source: String(data.get(`r${i}_source`) ?? '')}));
  draft.findings = Array.from({length: count('fc')}, (_, i) => ({text: String(data.get(`f${i}_text`) ?? ''),
    status: String(data.get(`f${i}_status`) ?? 'observed'), how: String(data.get(`f${i}_how`) ?? '')}));
  draft.recommendations = String(data.get('recommendations') ?? '');
  draft.parts = String(data.get('parts') ?? '');
  draft.technician = String(data.get('technician') ?? '');
  draft.status = diagnosisStatus(draft.findings);
  return draft;
}

// Saves the draft (creating the work order, vehicle and customer first when asked). Returns the record.
async function save(ctx, draft) {
  const {db} = ctx;
  if (draft.jobId === 'new') {
    const n = draft.newJob;
    if (!n.vehicle.trim()) throw new Error('Enter the vehicle for the new work order.');
    const customerId = n.customer.trim() ? (await db.add('customers', {name: n.customer, phone: n.phone})).record.id : null;
    const vehicleId = (await db.add('vehicles', {customerId, name: n.vehicle})).record.id;
    const title = n.title.trim() || `WO-${String(1001 + db.jobs.length)}`;
    draft.jobId = (await db.add('jobs', {title, vehicle: n.vehicle.trim(), vehicleId, customerId, symptom: draft.complaint.slice(0, 500), status: 'In progress'})).record.id;
    draft.newJob = {};
  }
  const fields = {jobId: draft.jobId, complaint: draft.complaint, symptoms: draft.symptoms, readings: draft.readings, findings: draft.findings,
    recommendations: draft.recommendations, parts: draft.parts, technician: draft.technician, status: diagnosisStatus(draft.findings), updated: Date.now()};
  if (!fields.readings.some(r => r.what.trim()) && !fields.findings.some(f => f.text.trim()) && !fields.complaint.trim())
    throw new Error('Record the complaint, a measurement or a finding before saving.');
  const record = draft.id ? await db.update('diagnoses', draft.id, fields) : (await db.add('diagnoses', fields)).record;
  if (fields.technician && !db.settings.technician) await db.setSetting('technician', fields.technician.slice(0, 80));
  draft.id = record.id;
  // Show the stored (sanitized) record, plus one empty row to keep typing into.
  Object.assign(draft, structuredClone(record), {readings: [...record.readings, blankReading()], findings: [...record.findings, blankFinding()]});
  return record;
}

export async function saveDiagnosisReport(db, id, about) {
  const diagnosis = db.diagnosis(id);
  if (!diagnosis) throw new Error('Diagnosis not found.');
  const {job, vehicle, customer} = db.context(diagnosis.jobId);
  const html = diagnosisReportHtml({diagnosis, job, vehicle, customer, settings: db.settings, appVersion: about?.version || 'preview'});
  const name = `diagnostic-report-${job?.title || diagnosis.id.slice(0, 8)}`.replace(/[^A-Za-z0-9._-]/g, '_');
  if (globalThis.evcore?.report) return globalThis.evcore.report.savePdf(html, name);
  download(`${name}.html`, html, 'text/html'); // Web preview: save the HTML and print it to PDF.
  return {saved: true, path: `${name}.html`};
}

function listView(ctx) {
  const {db} = ctx;
  const rows = db.diagnoses.slice(0, 200);
  return `${studioGettingStarted(ctx)}<div class="pagebar"><div class="spacer"></div><button class="primary" data-action="manual-new">${icon('plus')}New diagnosis</button></div>
  <section class="panel flush"><table class="list"><thead><tr><th>Updated</th><th>Vehicle</th><th>Work order</th><th>Complaint</th><th>Readings</th><th>Status</th><th></th></tr></thead><tbody>
  ${rows.map(d => {
    const {job, vehicle} = db.context(d.jobId);
    const outside = d.readings.filter(r => readingVerdict(r) === 'outside').length;
    return `<tr class="row-link" data-action="manual-open" data-id="${esc(d.id)}" tabindex="0" role="button"><td class="num">${esc(dateTime(d.updated))}</td>
      <td>${esc(vehicle?.name || job?.vehicle || '—')}</td><td class="num">${esc(job?.title || '—')}</td><td class="clip">${esc(d.complaint || '—')}</td>
      <td class="num">${d.readings.length}${outside ? ` <span class="tag bad">${outside} outside</span>` : ''}</td>
      <td><span class="tag ${d.status === 'Final' ? 'ok' : ''}">${esc(d.status)}</span></td>
      <td class="right"><button class="small quiet" data-action="manual-pdf" data-id="${esc(d.id)}" title="Save the diagnostic report as PDF">${icon('pdf')}PDF</button></td></tr>`;
  }).join('') || `<tr><td colspan="7"><div class="empty">No diagnoses yet.<br><button class="primary small" data-action="manual-new">${icon('plus')}New diagnosis</button></div></td></tr>`}
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
    <label class="field">Customer complaint<textarea name="complaint" maxlength="2000" placeholder="What the customer reports, in their words">${esc(d.complaint)}</textarea></label>
    <div class="fieldlabel">Symptoms observed</div><div class="chipset">${SYMPTOMS.map(s => `<label class="chip"><input type="checkbox" name="sym" value="${esc(s)}" ${d.symptoms.includes(s) ? 'checked' : ''}><span>${esc(s)}</span></label>`).join('')}</div>
    <label class="field">Other symptoms (comma separated)<input name="sym_other" value="${esc(d.symptoms.filter(s => !SYMPTOMS.includes(s)).join(', '))}" maxlength="400"></label></section>`;
}

function readingsSection(d) {
  return `<section class="panel flush"><header class="panelhead"><h2>Measurements</h2><span class="sub">Enter the expected range and where it comes from; Studio compares only against that.</span>
    <div class="spacer"></div><button type="button" class="small" data-action="manual-add-reading">${icon('plus')}Add measurement</button></header>
    <input type="hidden" name="rc" value="${d.readings.length}"><datalist id="measure-names">${MEASUREMENTS.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
    <table class="edit"><thead><tr><th>Measurement</th><th>Where</th><th>Reading</th><th>Unit</th><th>Expected min</th><th>Expected max</th><th>Range source</th><th>Result</th><th></th></tr></thead><tbody>
    ${d.readings.map((r, i) => {
      const v = readingVerdict({value: r.value, min: r.min, max: r.max});
      return `<tr><td><input name="r${i}_what" id="r${i}_what" list="measure-names" value="${esc(r.what)}" maxlength="120" aria-label="Measurement ${i + 1}"></td>
        <td><input name="r${i}_where" id="r${i}_where" value="${esc(r.where)}" maxlength="120" placeholder="Test points" aria-label="Where"></td>
        <td><input name="r${i}_value" id="r${i}_value" class="numin" inputmode="decimal" value="${esc(shown(r.value))}" aria-label="Reading"></td>
        <td><select name="r${i}_unit" aria-label="Unit">${READING_UNITS.map(u => `<option ${r.unit === u ? 'selected' : ''} value="${esc(u)}">${esc(u || '—')}</option>`).join('')}</select></td>
        <td><input name="r${i}_min" id="r${i}_min" class="numin" inputmode="decimal" value="${esc(shown(r.min))}" aria-label="Expected minimum"></td>
        <td><input name="r${i}_max" id="r${i}_max" class="numin" inputmode="decimal" value="${esc(shown(r.max))}" aria-label="Expected maximum"></td>
        <td><input name="r${i}_source" id="r${i}_source" value="${esc(r.source)}" maxlength="160" placeholder="e.g. service manual p. 12" aria-label="Range source"></td>
        <td><span class="tag ${v === 'within' ? 'ok' : v === 'outside' ? 'bad' : ''}">${VERDICT_LABEL[v]}</span></td>
        <td class="right"><button type="button" class="iconbtn" data-action="manual-remove-reading" data-index="${i}" aria-label="Remove measurement ${i + 1}">${icon('trash')}</button></td></tr>`;
    }).join('')}</tbody></table></section>`;
}

function findingsSection(d) {
  return `<section class="panel"><header class="panelhead"><h2>Findings</h2><span class="sub">Mark a cause Confirmed only when you have proven it, and say how.</span>
    <div class="spacer"></div><button type="button" class="small" data-action="manual-add-finding">${icon('plus')}Add finding</button></header>
    <input type="hidden" name="fc" value="${d.findings.length}">
    <div class="findings">${d.findings.map((f, i) => `<div class="findingrow"><input name="f${i}_text" id="f${i}_text" value="${esc(f.text)}" maxlength="500" placeholder="What you found" aria-label="Finding ${i + 1}">
      <select name="f${i}_status" data-change="manual-finding-status" aria-label="Status">${FINDING_STATUSES.map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${FINDING_LABEL[s]}</option>`).join('')}</select>
      <input name="f${i}_how" id="f${i}_how" data-change="manual-finding-status" value="${esc(f.how)}" maxlength="300" placeholder="${f.status === 'confirmed' ? 'How it was confirmed (required)' : 'How it was confirmed'}" aria-label="How confirmed" ${f.status === 'confirmed' ? '' : 'disabled'}>
      <button type="button" class="iconbtn" data-action="manual-remove-finding" data-index="${i}" aria-label="Remove finding ${i + 1}">${icon('trash')}</button></div>`).join('')}</div></section>`;
}

function editorView(ctx) {
  const d = ctx.state.manual.draft;
  const saved = d.id ? ctx.db.diagnosis(d.id) : null;
  return `<form data-form="manual-save" class="manual" autocomplete="off">
  <div class="pagebar"><button type="button" class="quiet" data-action="manual-close">${icon('back')}All diagnoses</button><div class="spacer"></div>
    ${saved ? `<span class="muted small">Saved ${esc(dateTime(saved.updated))}</span>` : ''}
    ${diagnosisStatus(d.findings) === 'Final'
      ? '<span class="tag ok" title="A finding is confirmed, so the report is final">Final: cause confirmed</span>'
      : '<span class="tag" title="The report says DRAFT until a finding is marked Confirmed, with how it was confirmed">Draft: nothing confirmed yet</span>'}
    <button type="submit">${icon('disk')}Save</button><button type="button" class="primary" data-action="manual-save-pdf">${icon('pdf')}Save and create PDF</button></div>
  ${jobSection(ctx, d)}${readingsSection(d)}${findingsSection(d)}
  <section class="panel"><div class="formgrid two"><label class="field">Recommended work<textarea name="recommendations" maxlength="4000">${esc(d.recommendations)}</textarea></label>
    <label class="field">Parts<textarea name="parts" maxlength="2000">${esc(d.parts)}</textarea></label></div>
    <label class="field narrow">Technician<input name="technician" value="${esc(d.technician)}" maxlength="80"></label>
    <p class="note">${icon('shield')}Readings you enter are labeled in the report as taken by the technician, not measured by EVCore equipment.</p></section></form>`;
}

const form = () => document.querySelector('form[data-form="manual-save"]');
const edit = (ctx, change) => { collect(form(), ctx.state.manual.draft); change(ctx.state.manual.draft); ctx.render(); };

export const manual = {
  id: 'manual',
  heading: 'Diagnoses',
  render(ctx) { return ctx.state.manual.draft ? editorView(ctx) : listView(ctx); },
  actions: {
    'manual-new'(_el, ctx) { ctx.state.manual.draft = emptyDraft(ctx.db); ctx.render(); },
    'manual-open'(el, ctx) {
      const d = ctx.db.diagnosis(el.dataset.id); if (!d) return;
      ctx.state.manual.draft = {...structuredClone(d), readings: [...d.readings, blankReading()], findings: [...d.findings, blankFinding()], newJob: {}};
      ctx.render();
    },
    'manual-close'(_el, ctx) { ctx.state.manual.draft = null; ctx.render(); },
    'manual-add-reading'(_el, ctx) { edit(ctx, d => d.readings.push(blankReading())); },
    'manual-remove-reading'(el, ctx) { edit(ctx, d => { d.readings.splice(Number(el.dataset.index), 1); if (!d.readings.length) d.readings.push(blankReading()); }); },
    'manual-add-finding'(_el, ctx) { edit(ctx, d => d.findings.push(blankFinding())); },
    'manual-remove-finding'(el, ctx) { edit(ctx, d => { d.findings.splice(Number(el.dataset.index), 1); if (!d.findings.length) d.findings.push(blankFinding()); }); },
    async 'manual-save-pdf'(_el, ctx) {
      try {
        const record = await save(ctx, collect(form(), ctx.state.manual.draft));
        const result = await saveDiagnosisReport(ctx.db, record.id, ctx.about);
        if (result?.saved) ctx.toast(`Diagnostic report saved: ${result.path}`);
        ctx.render();
      } catch (e) { ctx.toast(e.message); ctx.render(); }
    },
    async 'manual-pdf'(el, ctx) {
      try { const result = await saveDiagnosisReport(ctx.db, el.dataset.id, ctx.about); if (result?.saved) ctx.toast(`Diagnostic report saved: ${result.path}`); }
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

