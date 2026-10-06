import {esc, badge, dateTime, download, confirmAction, printReport, reportSavedMessage, toast as notify} from '../core/ui.js';
import {interpret} from '../domain.js';
import {parseSessionImport, mergeReports, importSummary, pickFile, isSimulated, sanitizeEntry} from '../records.js';
import {reportRow, measurementTable, faultEvents, deviceTable, sourceBadge, codeList} from './components.js';
import {serviceReportHtml} from './report-document.js';
import {reportPhotos, missingPhotosNote} from './photos.js';

function listView({db, state}) {
  const q = state.search.reports.toLowerCase();
  const rows = db.reports.filter(r => (state.reportFilter === 'All' || r.report.result === state.reportFilter) &&
    (state.reportSource === 'All' || (state.reportSource === 'Device' ? !isSimulated(r.source) : isSimulated(r.source))) &&
    [r.session, r.notes, r.report.reason, r.report.result, `profile ${r.report.profile_id}`, db.job(r.jobId)?.title].join(' ').toLowerCase().includes(q));
  const shown = rows.slice(0, 200);
  return `<section class="panel"><div class="panelhead"><div><h2>Test reports</h2><div class="sub">${db.reports.length} saved${db.kind === 'desktop' ? ' on this computer' : db.kind === 'device' ? ' on this device' : ' in this browser (preview only)'}</div></div>
    <div class="actions"><button data-action="reports-import">Import archive ↑</button><button data-action="reports-export" ${db.reports.length ? '' : 'disabled'}>Export archive ↓</button></div></div>
    <div class="toolbar"><input type="search" id="report-search" data-input="report-search" value="${esc(state.search.reports)}" placeholder="Search work order, result, profile, notes…" aria-label="Search reports">
      <select data-change="report-filter" aria-label="Filter by result">${['All', 'PASS', 'FAIL', 'UNKNOWN'].map(s => `<option ${state.reportFilter === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <select data-change="report-source" aria-label="Filter by source">${['All', 'Device', 'Simulated'].map(s => `<option ${state.reportSource === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    ${shown.map(r => reportRow(r, {showJob: true, jobTitle: db.job(r.jobId)?.title})).join('') || '<div class="empty">No matching reports. Completed tests are saved here automatically.</div>'}
    ${rows.length > shown.length ? `<p class="muted">Showing the newest ${shown.length} of ${rows.length} matches. Refine the search to see older reports.</p>` : ''}</section>`;
}

function detailView({db}, entry) {
  const r = entry.report;
  const reading = interpret(r);
  const {job, vehicle, customer} = db.context(entry.jobId);
  return `<div class="toolbar"><button class="small quiet" data-action="report-close">← All reports</button></div>
  <section class="panel"><div class="panelhead"><div><div class="eyebrow">TEST REPORT · PROFILE ${esc(r.profile_id)} REVISION ${esc(r.profile_revision)}</div>
    <div class="resultbig ${esc(r.result)}">${esc(r.result)}</div><p><b>${esc(reading.title)}</b></p></div>${sourceBadge(entry.source)}</div>
    ${isSimulated(entry.source) ? '<div class="notice">Simulated data. These readings did not come from a physical device.</div>' : ''}
    <p>${esc(reading.body)}</p>
    <p class="muted">${esc(dateTime(entry.created))} · ${job ? `work order <button class="linklike" data-action="job-open" data-id="${esc(job.id)}">${esc(job.title)}</button>` : 'not linked to a work order'}${vehicle ? ` · ${esc(vehicle.name)}` : ''}${customer ? ` · ${esc(customer.name)}` : ''}</p>
    ${codeList(r)}<h3>Measurements</h3>${measurementTable(r)}${faultEvents(r)}
    <form data-form="report-notes" data-id="${esc(entry.id)}"><label class="field">Technician notes<textarea name="notes" class="notebook" maxlength="2000">${esc(entry.notes)}</textarea></label>
      <div class="actions"><button type="submit">Save notes</button><button type="button" data-action="report-json" data-id="${esc(entry.id)}">Export JSON ↓</button>
      ${job ? `<button type="button" class="primary" data-action="service-report" data-id="${esc(job.id)}">Service report (PDF)</button>` : ''}</div></form></section>
  <section class="panel"><h2>Device and firmware</h2><p>The instrument versions that produced this result.</p>${deviceTable(entry.device)}</section>`;
}

// Builds the customer-facing service report for a work order and saves it as PDF.
export async function saveServiceReport(db, jobId, about) {
  const {job, vehicle, customer} = db.context(jobId);
  if (!job) throw new Error('Work order not found.');
  const reports = db.reportsOf(job.id);
  if (!reports.length) throw new Error('This work order has no test reports yet.');
  const photos = await reportPhotos(db, job.id);
  const html = serviceReportHtml({job, vehicle, customer, reports, photos, settings: db.settings, generated: Date.now(), appVersion: about?.version || 'preview'});
  const name = `service-report-${job.title}`.replace(/[^A-Za-z0-9._-]/g, '_');
  if (globalThis.evcore?.report) return {...await globalThis.evcore.report.savePdf(html, name), photosMissing: photos.missing};
  return {...await printReport(html, name), photosMissing: photos.missing};
}

export const reports = {
  id: 'reports',
  heading: 'Reports',
  render(ctx) {
    const entry = ctx.state.selection.reportId ? ctx.db.report(ctx.state.selection.reportId) : null;
    return entry ? detailView(ctx, entry) : listView(ctx);
  },
  actions: {
    'report-open'(el, {state, navigate}) { state.selection.reportId = el.dataset.id; navigate('reports'); },
    'report-close'(_el, {state, render}) { state.selection.reportId = null; render(); },
    'report-json'(el, {db}) { const entry = db.report(el.dataset.id); if (entry) download(`evcore-report-${entry.id}.json`, JSON.stringify(entry, null, 2)); },
    'reports-export'(_el, {db}) { download('evcore-sessions.json', JSON.stringify({schema_version: 1, reports: db.reports}, null, 2)); },
    async 'reports-import'(_el, {db, render, toast}) {
      try {
        const text = await pickFile(); if (text === null) return;
        const {entries, rejected} = parseSessionImport(text);
        const preview = mergeReports(db.reports, entries.map(sanitizeEntry).filter(Boolean), 5000);
        if (preview.displaced && !await confirmAction('Replace older reports?', `Importing would remove the ${preview.displaced} oldest local report(s) to stay within the limit.`, 'Import')) return;
        const result = await db.merge('reports', entries);
        toast(importSummary('report', {added: result.added, duplicates: result.skipped}, rejected)); render();
      } catch (e) { toast(e.message); }
    },
    async 'service-report'(el, {db, about, toast}) {
      try {
        const result = await saveServiceReport(db, el.dataset.id, about);
        const message = reportSavedMessage('Service report', result, missingPhotosNote(result?.photosMissing));
        if (message) toast(message);
      } catch (e) { toast(e.message); }
    }
  },
  forms: {
    async 'report-notes'(form, data, {db, render}) {
      const entry = db.report(form.dataset.id); if (!entry) return;
      entry.notes = String(data.get('notes')).slice(0, 2000);
      await db.update('reports', entry.id, {notes: entry.notes}); notify('Notes saved.'); render();
    }
  },
  changes: {
    'report-filter'(el, {state, render}) { state.reportFilter = el.value; render(); },
    'report-source'(el, {state, render}) { state.reportSource = el.value; render(); }
  },
  inputs: {'report-search'(el, {state, render}) { state.search.reports = el.value; render(); }}
};
