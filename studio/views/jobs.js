import {esc, badge, date, relative, download, confirmAction} from '../core/ui.js';
import {JOB_STATUSES, parseJobImport, pickFile, importSummary} from '../records.js';
import {reportRow} from './components.js';
import {photoPanel, photoHandlers} from './photos.js';

const statusTone = status => status === 'Complete' ? '' : status === 'Open' ? 'gray' : 'amber';

function vehicleLabel(db, job) {
  const {vehicle, customer} = db.context(job.id);
  return [customer?.name, vehicle?.name || job.vehicle].filter(Boolean).join(' · ');
}

export function jobCreateForm({db, state}) {
  const customerId = state.jobDraft.customerId;
  const vehicles = customerId && customerId !== 'new' ? db.vehiclesOf(customerId) : [];
  return `<section class="panel"><div class="panelhead"><h2>New work order</h2><button class="small quiet" data-action="job-new-cancel">Cancel</button></div>
    <form data-form="job-create" class="formgrid">
      <label class="field">Work order reference<input name="title" maxlength="80" required value="${esc(state.jobDraft.title)}" placeholder="e.g. WO-1042"></label>
      <label class="field">Customer<select name="customerId" data-change="job-draft-customer">
        <option value="">No customer</option><option value="new" ${customerId === 'new' ? 'selected' : ''}>+ New customer…</option>
        ${db.customers.map(c => `<option value="${esc(c.id)}" ${c.id === customerId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      ${customerId === 'new' ? `<label class="field">Customer name<input name="customerName" maxlength="80" required></label>
        <label class="field">Customer phone<input name="customerPhone" maxlength="40"></label>` : ''}
      <label class="field">Vehicle<select name="vehicleId" data-change="job-draft-vehicle">
        <option value="new" ${state.jobDraft.vehicleId === 'new' || !vehicles.length ? 'selected' : ''}>+ New vehicle…</option>
        ${vehicles.map(v => `<option value="${esc(v.id)}" ${v.id === state.jobDraft.vehicleId ? 'selected' : ''}>${esc(v.name)}${v.serial ? ` · ${esc(v.serial)}` : ''}</option>`).join('')}</select></label>
      ${state.jobDraft.vehicleId === 'new' || !vehicles.length ? `<label class="field">Vehicle make and model<input name="vehicleName" maxlength="80" required placeholder="e.g. Sur-Ron Light Bee X"></label>
        <label class="field">Serial / VIN<input name="vehicleSerial" maxlength="60"></label>
        <label class="field">Battery<input name="vehicleBattery" maxlength="40" placeholder="e.g. 60 V 32 Ah"></label>` : ''}
      <label class="field wide">Reported symptom<input name="symptom" maxlength="500" placeholder="What the customer reports"></label>
      <label class="check wide"><input type="checkbox" name="activate" checked> Make this the active work order (new test reports link to it)</label>
      <div class="actions wide"><button class="primary" type="submit">Create work order</button></div>
    </form></section>`;
}

function listView(ctx) {
  const {db, state} = ctx;
  const q = state.search.jobs.toLowerCase();
  const rows = db.jobs.filter(j => (state.jobFilter === 'All' || j.status === state.jobFilter) &&
    [j.title, j.symptom, vehicleLabel(db, j)].join(' ').toLowerCase().includes(q));
  return `${state.jobDraft.open ? jobCreateForm(ctx) : ''}<section class="panel"><div class="panelhead"><div><h2>Work orders</h2><div class="sub">${db.jobs.length} total · ${db.jobs.filter(j => j.status !== 'Complete').length} open</div></div>
    <div class="actions">${state.jobDraft.open ? '' : '<button class="primary" data-action="job-new">＋ New work order</button>'}</div></div>
    <div class="toolbar"><input type="search" id="job-search" data-input="job-search" value="${esc(state.search.jobs)}" placeholder="Search work orders, customers, vehicles…" aria-label="Search work orders">
      <select data-change="job-filter" aria-label="Filter by status">${['All', ...JOB_STATUSES].map(s => `<option ${state.jobFilter === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <span class="spacer"></span><button data-action="jobs-import">Import</button><button data-action="jobs-export" ${db.jobs.length ? '' : 'disabled'}>Export</button></div>
    <div id="job-results">${rows.map(j => `<article class="session row-link" data-action="job-open" data-id="${esc(j.id)}" tabindex="0" role="button">
      <div><h3>${esc(j.title)}${db.settings.activeJobId === j.id ? ' ' + badge('ACTIVE') : ''}</h3><p>${esc(vehicleLabel(db, j))}</p><p>${esc(j.symptom)}</p>
      <small>${db.reportsOf(j.id).length} linked report(s) · created ${esc(relative(j.created))}</small></div>
      <div class="row-side">${badge(j.status, statusTone(j.status))}</div></article>`).join('') || '<div class="empty">No matching work orders.</div>'}</div></section>`;
}

function detailView(ctx, job) {
  const {db} = ctx;
  const {vehicle, customer} = db.context(job.id);
  const reports = db.reportsOf(job.id);
  const active = db.settings.activeJobId === job.id;
  return `<div class="toolbar"><button class="small quiet" data-action="job-close">← All work orders</button></div>
  <section class="panel"><div class="panelhead"><div><div class="eyebrow">WORK ORDER</div><h2>${esc(job.title)} ${active ? badge('ACTIVE') : ''}</h2>
    <div class="sub">Created ${esc(date(job.created))}${job.closed ? ` · completed ${esc(date(job.closed))}` : ''}</div></div>
    <div class="actions"><select data-change="job-status" data-id="${esc(job.id)}" aria-label="Work order status">${JOB_STATUSES.map(s => `<option ${job.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
    ${active ? '<button data-action="job-deactivate">Stop using for tests</button>' : `<button class="primary" data-action="job-activate" data-id="${esc(job.id)}">Use for next tests</button>`}</div></div>
    <div class="twocol"><div><h3>Customer</h3>${customer ? `<p><button class="linklike" data-action="customer-open" data-id="${esc(customer.id)}">${esc(customer.name)}</button><br>${esc([customer.phone, customer.email].filter(Boolean).join(' · '))}</p>` : '<p class="muted">No customer recorded.</p>'}</div>
      <div><h3>Vehicle</h3>${vehicle ? `<p><button class="linklike" data-action="vehicle-open" data-id="${esc(vehicle.id)}">${esc(vehicle.name)}</button><br>${esc([vehicle.serial, vehicle.battery].filter(Boolean).join(' · '))}</p>` : `<p>${esc(job.vehicle)}</p>`}</div></div>
    <form data-form="job-edit" data-id="${esc(job.id)}"><label class="field">Reported symptom<input name="symptom" maxlength="500" value="${esc(job.symptom)}"></label>
      <label class="field">Technician notes<textarea name="notes" class="notebook" maxlength="4000" placeholder="Findings, parts, work done…">${esc(job.notes)}</textarea></label>
      <div class="actions"><button type="submit">Save notes</button></div></form></section>
  <section class="panel"><div class="panelhead"><div><h2>Test reports</h2><div class="sub">${reports.length} linked</div></div>
    <div class="actions"><button data-action="job-run" data-id="${esc(job.id)}">▶ Run a test</button><button class="primary" data-action="service-report" data-id="${esc(job.id)}" ${reports.length ? '' : 'disabled'}>Service report (PDF)</button></div></div>
    ${reports.map(r => reportRow(r)).join('') || '<div class="empty">No tests yet. Make this the active work order, then run a test.</div>'}</section>
  ${photoPanel(ctx, job.id)}
  <div class="actions"><button class="danger small" data-action="job-delete" data-id="${esc(job.id)}" ${reports.length ? 'disabled title="Work orders with reports cannot be deleted"' : ''}>Delete work order</button></div>`;
}

export const jobs = {
  id: 'jobs',
  heading: 'Work orders',
  render(ctx) {
    const job = ctx.state.selection.jobId ? ctx.db.job(ctx.state.selection.jobId) : null;
    return job ? detailView(ctx, job) : listView(ctx);
  },
  actions: {
    ...photoHandlers.actions,
    'job-new'(_el, {state, db, render}) { state.jobDraft = {open: true, title: `WO-${String(db.jobs.length + 1).padStart(4, '0')}`, customerId: '', vehicleId: 'new'}; render(); },
    'job-new-cancel'(_el, {state, render}) { state.jobDraft.open = false; render(); },
    'job-open'(el, {state, navigate}) { state.selection.jobId = el.dataset.id; navigate('jobs'); },
    'job-close'(_el, {state, render}) { state.selection.jobId = null; render(); },
    async 'job-activate'(el, {db, state, render, toast}) {
      if (state.status.busy) { toast('Stop the active test before changing work orders.'); return; }
      await db.setSetting('activeJobId', el.dataset.id); toast('New test reports will link to this work order.'); render();
    },
    async 'job-deactivate'(_el, {db, render}) { await db.setSetting('activeJobId', null); render(); },
    async 'job-run'(el, {db, state, navigate, toast}) {
      if (state.status.busy) { toast('A test is already running.'); return; }
      await db.setSetting('activeJobId', el.dataset.id); navigate('diagnostics');
    },
    async 'job-delete'(el, {db, state, render, toast}) {
      if (!await confirmAction('Delete this work order?', 'This cannot be undone. Work orders with test reports cannot be deleted.', 'Delete', 'danger')) return;
      try { await db.remove('jobs', el.dataset.id); state.selection.jobId = null; toast('Work order deleted.'); render(); } catch (e) { toast(e.message); }
    },
    'jobs-export'(_el, {db}) { download('evcore-work-orders.json', JSON.stringify({schema_version: 1, jobs: db.jobs}, null, 2)); },
    async 'jobs-import'(_el, {db, render, toast}) {
      try {
        const text = await pickFile(); if (text === null) return;
        const {jobs: incoming, rejected} = parseJobImport(text);
        const result = await db.merge('jobs', incoming);
        toast(importSummary('work order', {added: result.added, duplicates: result.skipped}, rejected)); render();
      } catch (e) { toast(e.message); }
    }
  },
  forms: {
    async 'job-create'(form, data, {db, state, render, toast}) {
      try {
        let customerId = data.get('customerId') || null;
        if (customerId === 'new') customerId = (await db.add('customers', {name: data.get('customerName'), phone: data.get('customerPhone')})).record.id;
        let vehicleId = data.get('vehicleId');
        if (!vehicleId || vehicleId === 'new') vehicleId = (await db.add('vehicles', {customerId, name: data.get('vehicleName'),
          serial: data.get('vehicleSerial'), battery: data.get('vehicleBattery')})).record.id;
        const vehicle = db.vehicle(vehicleId);
        const {record} = await db.add('jobs', {title: String(data.get('title')).trim(), vehicle: vehicle.name, vehicleId, customerId: customerId ?? vehicle.customerId,
          symptom: data.get('symptom'), status: 'Open'});
        if (data.get('activate')) await db.setSetting('activeJobId', record.id);
        state.jobDraft = {open: false}; state.selection.jobId = record.id;
        toast('Work order created.'); render();
      } catch (e) { toast(e.message); }
    },
    async 'job-edit'(form, data, {db, render, toast}) {
      try { await db.update('jobs', form.dataset.id, {symptom: data.get('symptom'), notes: data.get('notes')}); toast('Saved.'); render(); } catch (e) { toast(e.message); }
    }
  },
  changes: {
    ...photoHandlers.changes,
    async 'job-status'(el, {db, render}) {
      await db.update('jobs', el.dataset.id, {status: el.value, closed: el.value === 'Complete' ? Date.now() : null}); render();
    },
    'job-filter'(el, {state, render}) { state.jobFilter = el.value; render(); },
    'job-draft-customer'(el, {state, render}) {
      Object.assign(state.jobDraft, readDraft(el.form), {customerId: el.value, vehicleId: 'new'}); render();
    },
    'job-draft-vehicle'(el, {state, render}) { Object.assign(state.jobDraft, readDraft(el.form), {vehicleId: el.value}); render(); }
  },
  inputs: {'job-search'(el, {state, render}) { state.search.jobs = el.value; render(); }}
};

const readDraft = form => ({title: form.elements.title.value});
