import {esc, badge, date, dateTime, resultTone, confirmAction} from '../core/ui.js';
import {sourceBadge} from './components.js';

const field = (label, name, value, attrs = '') => `<label class="field">${label}<input name="${name}" value="${esc(value)}" ${attrs}></label>`;

function customerForm(customer = {}) {
  return `<form data-form="${customer.id ? 'customer-edit' : 'customer-create'}" data-id="${esc(customer.id || '')}" class="formgrid">
    ${field('Name', 'name', customer.name, 'maxlength="80" required')}${field('Phone', 'phone', customer.phone, 'maxlength="40"')}
    ${field('Email', 'email', customer.email, 'maxlength="120" type="email"')}
    <label class="field wide">Notes<textarea name="notes" maxlength="2000">${esc(customer.notes)}</textarea></label>
    <div class="actions wide"><button class="primary" type="submit">${customer.id ? 'Save customer' : 'Add customer'}</button></div></form>`;
}

function vehicleForm(vehicle = {}, customerId = '') {
  return `<form data-form="${vehicle.id ? 'vehicle-edit' : 'vehicle-create'}" data-id="${esc(vehicle.id || '')}" data-customer="${esc(customerId)}" class="formgrid">
    ${field('Make and model', 'name', vehicle.name, 'maxlength="80" required placeholder="e.g. Talaria Sting"')}${field('Serial / VIN', 'serial', vehicle.serial, 'maxlength="60"')}
    ${field('Battery', 'battery', vehicle.battery, 'maxlength="40" placeholder="e.g. 60 V 38 Ah"')}${field('Motor', 'motor', vehicle.motor, 'maxlength="80"')}
    ${field('Controller', 'controller', vehicle.controller, 'maxlength="80"')}
    <label class="field wide">Notes<textarea name="notes" maxlength="2000">${esc(vehicle.notes)}</textarea></label>
    <div class="actions wide"><button class="primary" type="submit">${vehicle.id ? 'Save vehicle' : 'Add vehicle'}</button></div></form>`;
}

// Readings of the same test across visits, oldest first, so drift is visible.
export function vehicleHistory(reports) {
  const byProfile = new Map();
  for (const entry of [...reports].sort((a, b) => a.created - b.created)) {
    const key = entry.report.profile_id;
    if (!byProfile.has(key)) byProfile.set(key, []);
    byProfile.get(key).push(entry);
  }
  return [...byProfile.entries()].map(([profile, entries]) => ({profile, entries}));
}

function listView({db, state}) {
  const q = state.search.customers.toLowerCase();
  const rows = db.customers.filter(c => [c.name, c.phone, c.email, ...db.vehiclesOf(c.id).map(v => `${v.name} ${v.serial}`)].join(' ').toLowerCase().includes(q));
  const unowned = db.vehicles.filter(v => !v.customerId);
  return `${state.customerDraft ? `<section class="panel"><div class="panelhead"><h2>New customer</h2><button class="small quiet" data-action="customer-new-cancel">Cancel</button></div>${customerForm()}</section>` : ''}
  <section class="panel"><div class="panelhead"><div><h2>Customers</h2><div class="sub">${db.customers.length} customers · ${db.vehicles.length} vehicles</div></div>
    ${state.customerDraft ? '' : '<button class="primary" data-action="customer-new">＋ New customer</button>'}</div>
    <div class="toolbar"><input type="search" id="customer-search" data-input="customer-search" value="${esc(state.search.customers)}" placeholder="Search names, phone, email, vehicles, serials…" aria-label="Search customers"></div>
    ${rows.map(c => `<article class="session row-link" data-action="customer-open" data-id="${esc(c.id)}" tabindex="0" role="button"><div><h3>${esc(c.name)}</h3>
      <p>${esc([c.phone, c.email].filter(Boolean).join(' · ') || 'No contact details')}</p><small>${db.vehiclesOf(c.id).map(v => esc(v.name)).join(', ') || 'No vehicles'}</small></div>
      <div class="row-side">${badge(`${db.jobs.filter(j => j.customerId === c.id).length} WORK ORDERS`, 'gray')}</div></article>`).join('') || '<div class="empty">No matching customers.</div>'}</section>
  ${unowned.length ? `<section class="panel"><h2>Vehicles without a customer</h2>${unowned.map(v => `<div class="catalogrow row-link" data-action="vehicle-open" data-id="${esc(v.id)}" tabindex="0" role="button"><div><h3>${esc(v.name)}</h3><p>${esc(v.serial || 'No serial')}</p></div></div>`).join('')}</section>` : ''}`;
}

function customerView({db, state}, customer) {
  const vehicles = db.vehiclesOf(customer.id);
  const jobs = db.jobs.filter(j => j.customerId === customer.id);
  return `<div class="toolbar"><button class="small quiet" data-action="customer-close">← All customers</button></div>
  <section class="panel"><div class="eyebrow">CUSTOMER</div><h2>${esc(customer.name)}</h2>${customerForm(customer)}</section>
  <section class="panel"><div class="panelhead"><h2>Vehicles</h2>${state.vehicleDraft ? '<button class="small quiet" data-action="vehicle-new-cancel">Cancel</button>' : '<button data-action="vehicle-new">＋ Add vehicle</button>'}</div>
    ${state.vehicleDraft ? vehicleForm({}, customer.id) : ''}
    ${vehicles.map(v => `<div class="catalogrow row-link" data-action="vehicle-open" data-id="${esc(v.id)}" tabindex="0" role="button"><div><h3>${esc(v.name)}</h3>
      <p>${esc([v.serial, v.battery, v.motor].filter(Boolean).join(' · ') || 'No details recorded')}</p></div>${badge(`${db.reportsForVehicle(v.id).length} TESTS`, 'gray')}</div>`).join('') || '<div class="empty">No vehicles yet.</div>'}</section>
  <section class="panel"><h2>Work orders</h2>${jobs.map(j => `<div class="catalogrow row-link" data-action="job-open" data-id="${esc(j.id)}" tabindex="0" role="button"><div><h3>${esc(j.title)}</h3><p>${esc(j.symptom || 'No symptom recorded')} · ${esc(date(j.created))}</p></div>${badge(j.status, j.status === 'Complete' ? '' : 'gray')}</div>`).join('') || '<div class="empty">No work orders.</div>'}</section>
  <div class="actions"><button class="danger small" data-action="customer-delete" data-id="${esc(customer.id)}" ${vehicles.length || jobs.length ? 'disabled title="Remove linked vehicles and work orders first"' : ''}>Delete customer</button></div>`;
}

function vehicleView({db}, vehicle) {
  const customer = vehicle.customerId ? db.customer(vehicle.customerId) : null;
  const history = vehicleHistory(db.reportsForVehicle(vehicle.id));
  const jobs = db.jobsOf(vehicle.id);
  return `<div class="toolbar"><button class="small quiet" data-action="${customer ? 'customer-open' : 'customer-close'}" data-id="${esc(customer?.id || '')}">← ${customer ? esc(customer.name) : 'All customers'}</button></div>
  <section class="panel"><div class="eyebrow">VEHICLE</div><h2>${esc(vehicle.name)}</h2>${vehicleForm(vehicle, vehicle.customerId || '')}</section>
  <section class="panel"><div class="panelhead"><div><h2>Test history</h2><div class="sub">Readings of each test across visits, oldest first</div></div>
    <button class="primary" data-action="vehicle-new-job" data-id="${esc(vehicle.id)}">＋ New work order</button></div>
    ${history.map(({profile, entries}) => `<h3>Profile ${esc(profile)}</h3><div class="tablewrap"><table><thead><tr><th>Date</th><th>Work order</th><th>Result</th><th>Readings</th><th>Source</th></tr></thead><tbody>
      ${entries.map(e => `<tr class="row-link" data-action="report-open" data-id="${esc(e.id)}" tabindex="0"><td>${esc(dateTime(e.created))}</td><td>${esc(db.job(e.jobId)?.title || '—')}</td>
        <td>${badge(e.report.result, resultTone(e.report.result))}</td><td class="mono">${e.report.samples.map(s => `${esc(s.value.toFixed(3))} ${esc(s.unit)}`).join(' · ') || '—'}</td><td>${sourceBadge(e.source)}</td></tr>`).join('')}</tbody></table></div>`).join('')
      || '<div class="empty">No tests recorded for this vehicle yet.</div>'}</section>
  <section class="panel"><h2>Work orders</h2>${jobs.map(j => `<div class="catalogrow row-link" data-action="job-open" data-id="${esc(j.id)}" tabindex="0" role="button"><div><h3>${esc(j.title)}</h3><p>${esc(date(j.created))}</p></div>${badge(j.status, 'gray')}</div>`).join('') || '<div class="empty">No work orders.</div>'}</section>
  <div class="actions"><button class="danger small" data-action="vehicle-delete" data-id="${esc(vehicle.id)}" ${jobs.length ? 'disabled title="Vehicles with work orders cannot be deleted"' : ''}>Delete vehicle</button></div>`;
}

export const customers = {
  id: 'customers',
  heading: 'Customers',
  render(ctx) {
    const {vehicleId, customerId} = ctx.state.selection;
    const vehicle = vehicleId ? ctx.db.vehicle(vehicleId) : null;
    if (vehicle) return vehicleView(ctx, vehicle);
    const customer = customerId ? ctx.db.customer(customerId) : null;
    return customer ? customerView(ctx, customer) : listView(ctx);
  },
  actions: {
    'customer-new'(_el, {state, render}) { state.customerDraft = true; render(); },
    'customer-new-cancel'(_el, {state, render}) { state.customerDraft = false; render(); },
    'customer-open'(el, {state, navigate}) { Object.assign(state.selection, {customerId: el.dataset.id || null, vehicleId: null}); state.vehicleDraft = false; navigate('customers'); },
    'customer-close'(_el, {state, render}) { Object.assign(state.selection, {customerId: null, vehicleId: null}); render(); },
    'vehicle-open'(el, {state, navigate}) { state.selection.vehicleId = el.dataset.id; navigate('customers'); },
    'vehicle-new'(_el, {state, render}) { state.vehicleDraft = true; render(); },
    'vehicle-new-cancel'(_el, {state, render}) { state.vehicleDraft = false; render(); },
    'vehicle-new-job'(el, {state, db, navigate}) {
      const vehicle = db.vehicle(el.dataset.id);
      state.jobDraft = {open: true, title: `WO-${String(db.jobs.length + 1).padStart(4, '0')}`, customerId: vehicle.customerId || '', vehicleId: vehicle.id};
      state.selection.jobId = null; navigate('jobs');
    },
    async 'customer-delete'(el, {db, state, render, toast}) {
      if (!await confirmAction('Delete this customer?', 'This cannot be undone.', 'Delete', 'danger')) return;
      try { await db.remove('customers', el.dataset.id); state.selection.customerId = null; render(); } catch (e) { toast(e.message); }
    },
    async 'vehicle-delete'(el, {db, state, render, toast}) {
      if (!await confirmAction('Delete this vehicle?', 'This cannot be undone.', 'Delete', 'danger')) return;
      try { await db.remove('vehicles', el.dataset.id); state.selection.vehicleId = null; render(); } catch (e) { toast(e.message); }
    }
  },
  forms: {
    async 'customer-create'(_form, data, {db, state, render, toast}) {
      try { const {record} = await db.add('customers', Object.fromEntries(data)); state.customerDraft = false; state.selection.customerId = record.id; render(); } catch (e) { toast(e.message); }
    },
    async 'customer-edit'(form, data, {db, render, toast}) {
      try { await db.update('customers', form.dataset.id, Object.fromEntries(data)); toast('Customer saved.'); render(); } catch (e) { toast(e.message); }
    },
    async 'vehicle-create'(form, data, {db, state, render, toast}) {
      try { await db.add('vehicles', {...Object.fromEntries(data), customerId: form.dataset.customer || null}); state.vehicleDraft = false; render(); } catch (e) { toast(e.message); }
    },
    async 'vehicle-edit'(form, data, {db, render, toast}) {
      try { await db.update('vehicles', form.dataset.id, Object.fromEntries(data)); toast('Vehicle saved.'); render(); } catch (e) { toast(e.message); }
    }
  },
  inputs: {'customer-search'(el, {state, render}) { state.search.customers = el.value; render(); }}
};
