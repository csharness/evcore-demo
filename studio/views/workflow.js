// Guided job: the knowledge base's technician workflow (section 1) as one screen.
// Connect -> Identify -> Verify safe conditions -> Test -> Review -> Report.
import {esc, badge} from '../core/ui.js';
import {interpret} from '../domain.js';
import {isSimulated} from '../records.js';
import {resultPanel, reportRow, sourceBadge} from './components.js';
import {SOURCE_LABEL} from '../core/device.js';
import {jobCreateForm} from './jobs.js';

export const STEPS = ['Connect', 'Identify', 'Verify safety', 'Test', 'Review', 'Report'];

// Checklist items are generic precautions, not hardware procedures; the test-specific
// item depends on whether the profile energizes the device under test.
export function safetyChecklist(profileId) {
  const passive = Number(profileId) === 3;
  return [
    ['vehicle', 'The vehicle is stable and secured for this test.'],
    ['adapter', 'The adapter harness matches the vehicle connector and the selected test.'],
    ['wiring', 'Connectors and wiring were inspected: no damaged insulation, melted or loose pins.'],
    passive ? ['motion', 'I will turn the wheel by hand only as the test requires, with hands clear of moving parts.']
      : ['isolated', 'The vehicle battery and controller are disconnected as the test requires.'],
    ['stop', 'I know where the device’s STOP control is and will use it if anything looks wrong.']
  ];
}

// Which step the job can be on, given what exists. The technician may go back but not skip ahead.
export function reachableStep({connected, job, checklistComplete, reportCount}) {
  if (!connected) return 0;
  if (!job) return 1;
  if (!checklistComplete && !reportCount) return 2;
  return reportCount ? 5 : 3;
}

function stepper(current, reachable) {
  return `<ol class="wizard" aria-label="Job progress">${STEPS.map((name, i) => `<li class="${i === current ? 'current' : i < current ? 'done' : ''}">
    <button data-action="flow-step" data-step="${i}" ${i <= reachable ? '' : 'disabled'} ${i === current ? 'aria-current="step"' : ''}><b>${i + 1}</b>${name}</button></li>`).join('')}</ol>`;
}

const nav = (back, next, nextEnabled, nextLabel = 'Next →') => `<div class="actions wizard-nav">${back !== null ? `<button data-action="flow-step" data-step="${back}">← Back</button>` : ''}
  <span class="spacer"></span>${next !== null ? `<button class="primary" data-action="flow-step" data-step="${next}" ${nextEnabled ? '' : 'disabled'}>${nextLabel}</button>` : ''}</div>`;

function connectStep({state, platform}) {
  return `<section class="panel"><h2>1. Connect</h2><p>${platform.simulation ? 'Connect the EVCore device, or a simulator to practise the workflow.' : 'Connect your EVCore D1 with its USB cable.'}</p>
    <div class="choices">${[['usb', 'USB device', platform.serial], ['simulator', 'Firmware simulator', platform.firmware], ['demo', 'In-app demo', true]]
      .filter(([id]) => id === 'usb' || platform.simulation)
      .map(([id, label, ok]) => `<div class="choice ${state.connected && state.source === id ? 'selected' : ''}"><h3>${label}</h3>
      <button class="small ${state.connected && state.source === id ? '' : 'primary'}" data-action="connect" data-source="${id}" ${ok ? '' : 'disabled'}>${state.connected && state.source === id ? 'Connected ✓' : 'Connect'}</button></div>`).join('')}</div>
    ${state.connected ? `<p>Connected to <b>${esc(SOURCE_LABEL[state.source])}</b>. Device state: <b>${esc(state.status.state)}</b>.</p>` : ''}
    ${nav(null, 1, state.connected)}</section>`;
}

function identifyStep(ctx) {
  const {db, state} = ctx;
  const active = db.activeJob();
  const open = db.jobs.filter(j => j.status !== 'Complete').slice(0, 8);
  if (!state.jobDraft.open && !active) state.jobDraft = {open: true, title: `WO-${String(db.jobs.length + 1).padStart(4, '0')}`, customerId: '', vehicleId: 'new'};
  return `<section class="panel"><h2>2. Identify</h2><p>Which vehicle is on the bench? Every test in this job is saved to its work order.</p>
    ${active ? `<div class="jobbar"><div><span class="eyebrow">ACTIVE WORK ORDER</span><b>${esc(active.title)}</b><span class="muted">${esc([db.context(active.id).customer?.name, db.context(active.id).vehicle?.name || active.vehicle].filter(Boolean).join(' · '))}</span></div>
      <button class="small quiet" data-action="flow-change-job">Choose a different one</button></div>` : ''}
    ${!active && open.length ? `<h3>Continue an open work order</h3>${open.map(j => `<div class="catalogrow"><div><h3>${esc(j.title)}</h3><p>${esc([db.context(j.id).customer?.name, db.context(j.id).vehicle?.name || j.vehicle].filter(Boolean).join(' · '))}</p></div>
      <button class="small" data-action="job-activate" data-id="${esc(j.id)}">Use this one</button></div>`).join('')}<h3>Or start a new one</h3>` : ''}
    ${!active ? `<div id="flow-new-job">${jobCreateForm(ctx)}</div>` : ''}
    ${nav(0, 2, Boolean(active))}</section>`;
}

function verifyStep({state}) {
  const items = safetyChecklist(state.selected);
  const complete = items.every(([id]) => state.flow.checks[id]);
  return `<section class="panel"><h2>3. Verify safe conditions</h2>
    <label class="field">Test to run<select data-change="flow-test">${state.profiles.map(p => `<option value="${esc(p.id)}" ${p.id === Number(state.selected) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <p>Confirm each item before the test can start. ${isSimulated(state.source) ? 'This is a simulated device, so these checks are practice.' : ''}</p>
    <div class="checklist">${items.map(([id, text]) => `<label class="check"><input type="checkbox" id="flow-check-${id}" data-change="flow-check" data-id="${id}" ${state.flow.checks[id] ? 'checked' : ''}> ${esc(text)}</label>`).join('')}</div>
    ${nav(1, 3, complete)}</section>`;
}

function testStep(ctx) {
  const {state, device} = ctx;
  state.confirmed = safetyChecklist(state.selected).every(([id]) => state.flow.checks[id]);
  return `<section class="panel"><h2>4. Test</h2><p>${esc(state.profiles.find(p => p.id === Number(state.selected))?.name || 'No test selected')} ·
    device state <b>${esc(state.status.state)}</b></p>
    <div class="actions"><button id="start-test" class="primary" data-action="test-start" ${device.canStart() ? '' : 'disabled'}>${state.status.busy ? 'Test running…' : '▶ Start test'}</button>
      <button class="danger" data-action="stop" ${state.status.busy ? '' : 'disabled'}>■ Stop</button>
      <button data-action="device-reset" ${state.status.state === 'FAULT' ? '' : 'disabled'}>Reset fault</button></div>
    ${state.status.busy ? '<div class="progress" role="progressbar" aria-label="Test running"><div></div></div>' : ''}
    <div class="sectionrow">${resultPanel(state.latest, state.source, {entryId: state.latestEntryId})}</div>
    ${nav(2, 4, Boolean(state.latest) && !state.status.busy, 'Review results →')}
    ${state.latest && !state.status.busy ? '<p class="protocol-note">Another test on this vehicle? Go back to step 3, choose it and confirm the checklist again.</p>' : ''}</section>`;
}

function reviewStep({db}) {
  const job = db.activeJob();
  const reports = job ? db.reportsOf(job.id) : [];
  const counts = ['PASS', 'FAIL', 'UNKNOWN'].map(r => reports.filter(e => e.report.result === r).length);
  return `<section class="panel"><h2>5. Review and explain</h2>
    <p>${reports.length} test(s) on this work order: ${counts[0]} passed, ${counts[1]} outside limits, ${counts[2]} without a conclusion.</p>
    ${reports.map(e => `<div class="catalogrow"><div><h3>${esc(interpret(e.report).title)} ${badge(e.report.result, e.report.result === 'FAIL' ? 'amber' : e.report.result === 'UNKNOWN' ? 'gray' : '')}</h3>
      <p>${esc(interpret(e.report).body)}</p></div>${sourceBadge(e.source)}</div>`).join('')}
    <form data-form="job-edit" data-id="${esc(job?.id || '')}"><label class="field">Symptom<input name="symptom" maxlength="500" value="${esc(job?.symptom)}"></label>
      <label class="field">Findings and recommendation for the customer<textarea name="notes" class="notebook" maxlength="4000" placeholder="What you found, what you did or recommend, and why.">${esc(job?.notes)}</textarea></label>
      <div class="actions"><button type="submit">Save</button></div></form>
    ${nav(3, 5, reports.length > 0)}</section>`;
}

function reportStep({db}) {
  const job = db.activeJob();
  const reports = job ? db.reportsOf(job.id) : [];
  const simulated = reports.some(e => isSimulated(e.source));
  return `<section class="panel"><h2>6. Report</h2>
    <p>Create the service report for the customer. It lists every test on work order <b>${esc(job?.title)}</b>, the readings against their expected ranges, your notes, and the instrument versions.</p>
    ${simulated ? '<div class="notice">This work order includes simulated tests. The report will say so prominently.</div>' : ''}
    ${db.settings.shopName ? '' : '<div class="notice">Add your shop details in Settings so they appear on the report. <button class="small" data-action="nav" data-view="settings:shop">Shop details</button></div>'}
    <div class="actions"><button class="primary" data-action="service-report" data-id="${esc(job?.id || '')}" ${reports.length ? '' : 'disabled'}>Save service report (PDF)</button>
      <button data-action="flow-complete" ${job && job.status !== 'Complete' ? '' : 'disabled'}>${job?.status === 'Complete' ? 'Work order completed ✓' : 'Mark work order complete'}</button>
      <button data-action="flow-new">Start the next job</button></div>
    <h3 class="sectionrow">Tests in this report</h3>${reports.map(r => reportRow(r)).join('')}
    ${nav(4, null, false)}</section>`;
}

export const workflow = {
  id: 'workflow',
  heading: 'Guided job',
  render(ctx) {
    const {state, db} = ctx;
    const job = db.activeJob();
    const reachable = reachableStep({connected: state.connected, job,
      checklistComplete: safetyChecklist(state.selected).every(([id]) => state.flow.checks[id]), reportCount: job ? db.reportsOf(job.id).length : 0});
    const step = Math.min(state.flow.step, reachable); // never beyond what the job has reached
    state.flow.step = step;
    const body = [connectStep, identifyStep, verifyStep, testStep, reviewStep, reportStep][step](ctx);
    return `${stepper(step, reachable)}${body}`;
  },
  actions: {
    'flow-step'(el, {state, render}) {
      const target = Number(el.dataset.step);
      if (target === 2 && state.flow.step > 2) { state.flow.checks = {}; state.confirmed = false; } // re-confirm safety for every test
      state.flow.step = target; render();
    },
    async 'flow-change-job'(_el, {db, state, render}) { await db.setSetting('activeJobId', null); state.flow.checks = {}; render(); },
    async 'flow-complete'(_el, {db, render, toast}) {
      const job = db.activeJob(); if (!job) return;
      await db.update('jobs', job.id, {status: 'Complete', closed: Date.now()}); toast('Work order completed.'); render();
    },
    async 'flow-new'(_el, {db, state, render}) {
      if (state.status.busy) return;
      await db.setSetting('activeJobId', null);
      Object.assign(state, {latest: null, latestEntryId: null, notes: ''});
      state.flow = {step: state.connected ? 1 : 0, checks: {}};
      state.jobDraft = {open: false};
      render();
    }
  },
  changes: {
    'flow-check'(el, {state, render}) { state.flow.checks[el.dataset.id] = el.checked; render(); },
    'flow-test'(el, {state, render}) { state.selected = Number(el.value); state.flow.checks = {}; state.confirmed = false; render(); }
  }
};
