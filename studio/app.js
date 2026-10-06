// EVCore Studio: bootstrap, shell, navigation and event wiring.
import {$, esc, badge, toast, dialog, confirmAction} from './core/ui.js';
import {openStorage} from './core/storage.js';
import {openDatabase} from './core/data.js';
import {createSettingsSync} from './core/account-sync.js';
import {createRecordSync} from './core/record-sync.js';
import {createDevice, SOURCE_LABEL} from './core/device.js';
import {isSimulated} from './records.js';
import {dashboard} from './views/dashboard.js';
import {diagnostics} from './views/diagnostics.js';
import {live, bus, busTable} from './views/signals.js';
import {jobs} from './views/jobs.js';
import {customers} from './views/customers.js';
import {reports, saveServiceReport} from './views/reports.js';
import {guide, compare, capture} from './views/tools.js';
import {profiles, settings} from './views/settings.js';
import {workflow} from './views/workflow.js';
import {help} from './views/help.js';
import {deviceScreen, screenHtml, setScreenRefresher, KNOB_KEYS} from './views/device-screen.js';
import {accountGate, accountActions, accountForms, usable} from './views/account.js';
import {manual} from './views/manual.js';
import {listenForPhotos, reportPhotos, photoFilesArrived} from './views/photos.js';
import {library} from './views/library.js';
import {installShots} from './core/shots.js';
import {icon} from './core/icons.js';
import {isDemo, siteUrl, demoLicense, seedDemo, demoBanner, tourSteps, tourCard, tourTarget, audienceOf, CONTACT} from './core/demo.js';
import {clearBrowserStorage} from './core/storage.js';

const VIEWS = [workflow, dashboard, diagnostics, manual, deviceScreen, live, bus, jobs, customers, reports, library, guide, compare, capture, profiles, settings, help];
const byId = Object.fromEntries(VIEWS.map(v => [v.id, v]));

// Editions (decision 0006). Studio: manual diagnosis and shop records. Studio Pro adds everything
// that works with the EVCore D1. Development builds have everything.
const PRO_VIEWS = new Set(['dashboard', 'workflow', 'diagnostics', 'device-screen', 'live', 'bus', 'guide', 'compare', 'capture', 'profiles']);
const edition = () => license.state === 'development' ? 'development' : license.plan === 'pro' ? 'pro' : 'studio';
const hasPro = () => edition() !== 'studio';
const EDITION_LABEL = {pro: 'Studio Pro', studio: 'Studio', development: 'Development build'};
const demo = isDemo(); // demo.csharness.com (core/demo.js)
const NAV_PRO = [
  ['', [['dashboard', 'bench', 'Bench'], ['workflow', 'job', 'Guided job'], ['diagnostics', 'test', 'Tests'], ['manual', 'manual', 'Diagnoses'],
    ['live', 'live', 'Live data'], ['device-screen', 'screen', 'Device screen'], ['bus', 'bus', 'Bus frames']]],
  ['Shop', [['jobs', 'orders', 'Work orders'], ['customers', 'people', 'Customers'], ['reports', 'report', 'Reports']]],
  ['Tools', [['library', 'library', 'Vehicle library'], ['guide', 'guide', 'Troubleshooting'], ['compare', 'compare', 'Compare reports'], ['capture', 'capture', 'Capture analysis'], ['profiles', 'profiles', 'Profiles']]]
];
const NAV_STUDIO = [
  ['', [['manual', 'manual', 'Diagnoses'], ['jobs', 'orders', 'Work orders'], ['customers', 'people', 'Customers'], ['library', 'library', 'Vehicle library']]],
  ['Studio Pro', [['dashboard', 'bench', 'Bench'], ['workflow', 'job', 'Guided job'], ['diagnostics', 'test', 'Tests'], ['live', 'live', 'Live data'], ['device-screen', 'screen', 'Device screen']]]
];
const PRO_FEATURES = ['Run tests on the EVCore D1 with its safety interlocks', 'Guided jobs from connection to service report', 'Live readings, the signal trace and the device screen',
  'Diagnostic codes with their meaning and next checks', 'Bus frame capture, troubleshooting guides and report comparison', 'Firmware update checks for your D1'];

const state = {
  view: 'dashboard', mode: 'guided', connected: false, source: 'demo', profiles: [], device: null,
  status: {state: 'DISCONNECTED', busy: false, outputs: null, faults: null},
  samples: [], frames: [], events: [], latest: null, latestEntryId: null, selected: 2, confirmed: false,
  scenario: 'healthy', frozen: false, filter: '', error: '', baud: 115200, notes: '', guide: 'motor', capture: null,
  selection: {jobId: null, customerId: null, vehicleId: null, reportId: null},
  search: {jobs: '', customers: '', reports: ''}, library: {query: '', open: null}, jobFilter: 'All', reportFilter: 'All', reportSource: 'All',
  jobDraft: {open: false}, flow: {step: 0, checks: {}}, customerDraft: false, vehicleDraft: false, compare: {left: '', right: ''}, backupMessage: '',
  screen: null, simStop: false, firmwareUpdate: null, manual: {draft: null}, studioUpdate: null,
  accountMode: 'sign-in', accountEmail: '', accountMessage: '', accountBusy: false,
  tour: null, audience: 'shop' // demo only: the guided tour step shown, and who it is for (core/demo.js)
};

// simulation: false in customer builds (no in-app demo, no firmware simulator); true in development.
// desktop: the Windows app. On phones and tablets (decision 0015) the bridge has no serial link yet (T-6).
const platform = {desktop: globalThis.evcore?.platform === 'desktop', mobile: Boolean(globalThis.evcore) && globalThis.evcore.platform !== 'desktop', firmware: false,
  serial: !demo && (globalThis.evcore ? Boolean(globalThis.evcore.serial) : Boolean(navigator.serial)), simulation: true};
let db, device, settingsSync, recordSync, about = null, license = {state: 'development'};
const ctx = {
  state, platform, toast, dialog,
  get db() { return db; }, get device() { return device; }, get about() { return about; }, get license() { return license; },
  setLicense,
  // Shop details or branding changed in Settings: mark it and save it to the account (decision 0013).
  async shopChanged() { await settingsSync.edited(); syncShop(); },
  // Record sync through the account (decisions 0015, 0017): the switch is the account's.
  recordSync: {
    async enable() { state.recordSync = await recordSync.enable(license.email); watchRecords(); render(); },
    async disable() { state.recordSync = await recordSync.disable(); watchRecords(); render(); },
    async useAccount() { state.recordSync = await recordSync.useAccount(license.email); watchRecords(); render(); },
    async now() { await syncRecords({force: true}); render(); }
  },
  render, refreshLive, refreshBus, navigate, checkFirmware,
  async refreshAbout() { about = await globalThis.evcore?.about?.() ?? null; }
};

function navigate(view) {
  state.view = byId[view] ? view : homeView();
  if (view === 'manual') state.manual.draft = null;
  render();
  $('#main-heading')?.focus();
}
const homeView = () => hasPro() ? 'dashboard' : 'manual';

// A Studio Pro screen opened on a Studio license: what it does and how to get it. It starts nothing.
function upsell(title) {
  return `<section class="panel upsell"><div class="lockmark">${icon('lock')}</div><h2>${esc(title)} is part of Studio Pro</h2>
    <p>Studio Pro works with the EVCore D1 diagnostic device. Your Studio license covers manual diagnoses, work orders, customers and reports.</p>
    <ul class="ticks">${PRO_FEATURES.map(f => `<li>${icon('check')}${esc(f)}</li>`).join('')}</ul>
    <div class="actions">${demo ? '<button class="primary" data-action="demo-edition" data-plan="pro">Preview Studio Pro</button>'
      : '<button class="primary" data-action="open-website" data-page="/pages/software">See Studio Pro</button>'}<button data-action="nav" data-view="manual">Back to diagnoses</button></div>
    <p class="muted">Every EVCore D1 comes with three months of Studio Pro.</p></section>`;
}

function statusBar(simulated) {
  const pro = hasPro();
  const data = !pro ? `<span>${icon('manual')}Manual diagnosis: readings are entered by the technician</span>`
    : !state.connected ? '<span class="off">● No device connected</span>'
    : simulated ? `<span class="warn">● Simulated data (${esc(SOURCE_LABEL[state.source])}). No hardware connected.</span>` : '<span class="ok">● EVCore D1 connected</span>';
  const lic = license.state === 'demo' ? 'Interactive demo · no account' : license.state === 'development' ? 'Development build · licensing off'
    : `${EDITION_LABEL[edition()]} · works offline for ${license.daysLeft ?? '—'} more day${license.daysLeft === 1 ? '' : 's'}`;
  const saved = db.kind === 'desktop' ? `Saved on this computer · ${about?.lastBackup ? `backed up ${new Date(about.lastBackup).toLocaleDateString()}` : 'no backup yet'}`
    : db.kind === 'device' ? `Saved on this device${db.settings.recordSyncOn ? ' · synced with your account' : ''}`
    : demo ? 'Sample records · stay in this browser' : 'Web preview · records stay in this browser';
  return `<footer class="statusbar">${data}<span>${icon('cloud')}${esc(lic)}</span><span>${esc(saved)}</span><span class="r num">Studio ${esc(about?.version || 'preview')}</span></footer>`;
}

function frame() {
  const {job, vehicle, customer} = db.context(db.settings.activeJobId);
  const simulated = isSimulated(state.source);
  const pro = hasPro();
  const view = byId[state.view];
  const locked = !pro && PRO_VIEWS.has(state.view);
  const title = typeof view.heading === 'string' ? view.heading : view.heading[1];
  const open = db.jobs.filter(j => j.status !== 'Complete').length;
  const navButton = ([id, ic, name]) => `<button data-action="nav" data-view="${id}" class="${state.view === id ? 'on' : ''}" ${state.view === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${name}</span>${
    !pro && PRO_VIEWS.has(id) ? '<span class="pro">PRO</span>' : id === 'jobs' && open ? `<span class="count">${open}</span>` : ''}</button>`;
  return `<div class="app"><aside class="side"><div class="logo"><span class="mark">${icon('bolt')}</span><b>EVCORE</b><span>${pro ? 'STUDIO PRO' : 'STUDIO'}</span></div>
    <nav class="nav" aria-label="Main">${(pro ? NAV_PRO : NAV_STUDIO).map(([label, items]) => `${label ? `<div class="group">${esc(label)}</div>` : ''}${items.map(navButton).join('')}`).join('')}</nav>
    <div class="sidebottom"><nav class="nav">${navButton(['settings', 'gear', 'Settings'])}${navButton(['help', 'help', 'Help'])}</nav>
      <div class="account"><div class="avatar">${esc((db.settings.shopName || license.email || 'EV').slice(0, 2).toUpperCase())}</div>
        <div><div class="clip">${esc(db.settings.shopName || 'Your shop')}</div><small class="clip">${esc(license.email || EDITION_LABEL[edition()])}</small></div></div></div></aside>
  <header class="top"><button class="jobpick" data-action="nav" data-view="jobs" title="Work orders">${job ? `<span class="wo">${esc(job.title)}</span><span class="veh">${esc(vehicle?.name || job.vehicle)}</span>${customer ? `<span class="cust">· ${esc(customer.name)}</span>` : ''}`
      : '<span class="cust">No active work order</span>'}${icon('down')}</button><div class="spacer"></div>
    ${pro ? `${state.connected && simulated ? `<span class="pill sim">${esc(SOURCE_LABEL[state.source]).toUpperCase()}</span>` : ''}
      <div class="mode" role="group" aria-label="Experience mode"><button data-action="mode" data-mode="guided" class="${state.mode === 'guided' ? 'on' : ''}" aria-pressed="${state.mode === 'guided'}">Guided</button><button data-action="mode" data-mode="expert" class="${state.mode === 'expert' ? 'on' : ''}" aria-pressed="${state.mode === 'expert'}">Expert</button></div>
      <button class="devchip" data-action="nav" data-view="settings:device" title="Connection"><span class="dot ${state.connected ? 'on' : ''}"></span>${state.connected ? `EVCore D1 <span class="num">${esc([state.device?.serial, state.device?.firmware && `fw ${state.device.firmware}`].filter(Boolean).join(' · ') || SOURCE_LABEL[state.source])}</span>` : 'No device'}</button>
      <button class="stop" data-action="stop" ${state.connected ? '' : 'disabled'} title="Stop the running test (Esc)">${icon('stop')}STOP <kbd>Esc</kbd></button>`
      : `<span class="pill edition">STUDIO</span>${demo ? '' : '<button class="small" data-action="open-website" data-page="/pages/software">Upgrade to Pro</button>'}`}</header>
  <main class="main">${demo ? demoBanner(edition(), state.tour !== null, state.audience) : ''}<div class="pagehead"><h1 id="main-heading" tabindex="-1">${esc(title)}</h1><div class="spacer"></div>
    ${state.view === 'workflow' && pro ? '<button data-action="nav" data-view="diagnostics">Expert test bench</button>' : ''}</div>
  ${db.notices.map((n, i) => `<div class="notice dismissible">${esc(n)} <button class="small quiet" data-action="notice-dismiss" data-index="${i}" aria-label="Dismiss">✕</button></div>`).join('')}
  ${license.state === 'valid' && license.daysLeft <= 7 ? `<div class="notice" role="status">Studio must reach the account server within ${license.daysLeft} day(s) to keep working offline. Connect this computer to the internet.</div>` : ''}
  ${studioUpdateBanner()}${pro ? firmwareBanner() : ''}
  ${state.error ? `<div class="errorbox" role="alert">${esc(state.error)}</div>` : ''}
  <div id="view">${locked ? upsell(title) : view.render(ctx)}${!locked && state.mode === 'expert' && ['dashboard', 'diagnostics'].includes(state.view) ? expertPanel() : ''}</div></main>
  ${statusBar(simulated)}${demo && state.tour !== null ? tourCard(state.tour, state.audience) : ''}</div>`;
}

// A downloaded Studio update (desktop/updater.cjs). Installing restarts Studio, so it is refused
// while a test is running.
function studioUpdateBanner() {
  const update = state.studioUpdate;
  if (update?.state !== 'ready') return '';
  return `<div class="notice update-banner" role="status"><span>EVCore Studio <b>${esc(update.available)}</b> is ready to install. It also installs the next time you close Studio.</span>
    <button class="small primary" data-action="studio-update-install" ${state.status.busy ? 'disabled title="Stop the running test first"' : ''}>Restart and update</button></div>`;
}

// Firmware update check, run on every connection to a device (decision 0004).
async function checkFirmware(info) {
  const bridge = globalThis.evcore?.updates;
  if (!bridge || !info) return;
  state.firmwareUpdate = {state: 'checking'};
  let result;
  try { result = await bridge.check(info.board, info.firmware); } catch { result = {state: 'error', message: 'The firmware update check failed.'}; }
  if (state.device !== info) return; // A different device connected meanwhile.
  state.firmwareUpdate = {...result, board: info.board};
  render();
}

function firmwareBanner() {
  const update = state.firmwareUpdate;
  if (!state.connected || !['available', 'required'].includes(update?.state)) return '';
  const required = update.state === 'required';
  return `<div class="${required ? 'errorbox' : 'notice'} update-banner" role="status"><span><b>${required ? 'Required firmware update' : 'Firmware update available'}:</b>
    version ${esc(update.latest.version)} for this device (installed ${esc(update.current)}).${required ? ' It includes a fix CS Harness marked as required.' : ''}</span>
    <button class="small" data-action="firmware-notes">What’s new</button></div>`;
}

function expertPanel() {
  return `<section class="panel sectionrow"><h2>Expert evidence inspector</h2><p>Raw firmware state and latest validated report. Outputs are a firmware bitmask; null means unconfirmed.</p>
    <pre class="raw-evidence">${esc(JSON.stringify({source: state.source, device: state.device, status: state.status, report: state.latest}, null, 2))}</pre></section>`;
}

// Applies a license status from the main process. Studio connects to devices only while usable.
// Studio Pro connects the in-app demo on start; a Studio license never connects a device (decision 0006).
async function setLicense(next) {
  const wasPro = usable(license) && hasPro();
  license = next || {state: 'signed_out'};
  const isPro = usable(license) && hasPro();
  if (usable(license) && !hasPro() && PRO_VIEWS.has(state.view)) state.view = homeView();
  if (!wasPro && isPro && !state.connected) { state.view = homeView(); render(); if (platform.simulation) await device.connect('demo'); }
  if (wasPro && !isPro && state.connected) await device.disconnect();
  render();
  syncShop();
}

// Shop details and branding follow the account to every computer signed in to it (decision 0013).
// Never blocks: offline simply leaves the change marked for the next run.
function syncShop() {
  if (demo || license.state !== 'valid' || !license.email || !settingsSync) return;
  settingsSync.run(license.email).then(result => { state.shopSync = result; }).catch(error => reportError(error, false));
  syncRecords();
}

// Shop records follow the account to every device once the shop turns sync on (decisions 0015,
// 0017). The account's switch decides, so this runs on every device signed in with a license.
function syncRecords(options) {
  if (demo || license.state !== 'valid' || !license.email || !recordSync) return Promise.resolve();
  return recordSync.run(license.email, options).then(result => {
    const changed = result.state !== state.recordSync?.state;
    state.recordSync = result;
    if (changed) { watchRecords(); if (state.view === 'settings') render(); }
  }).catch(error => reportError(error, false));
}
// Live updates while sync is on: another device's change starts a sync here within a second.
function watchRecords() { globalThis.evcore?.license?.watchRecords?.(state.recordSync?.state === 'synced' && license.state === 'valid'); }

// Unexpected errors: logged by the desktop app (Help > Save support info collects them) and shown
// briefly, so a problem is never silent. Handler errors that explain themselves (run()) are not these.
let lastErrorToast = 0;
function reportError(error, notify = true) {
  const message = error?.message || String(error ?? 'Unknown error');
  try { globalThis.evcore?.log?.error(message, error?.stack || ''); } catch { /* logging must never throw */ }
  if (notify && Date.now() - lastErrorToast > 10000) {
    lastErrorToast = Date.now();
    toast('Something went wrong. Studio saved the details: Help > Save support info.');
  }
}

// What Save support info sends to the desktop app: counts and state only, never records.
function supportPage() {
  return {license: {state: license.state, plan: license.plan, email: license.email, daysLeft: license.daysLeft},
    device: state.connected ? state.device : null, view: state.view, mode: state.mode, theme: db.settings.theme,
    counts: {customers: db.customers.length, vehicles: db.vehicles.length, jobs: db.jobs.length, reports: db.reports.length, diagnoses: db.diagnoses.length}};
}

// Demo guided tour: opens the step's edition, screen and diagnosis, then render() highlights its target.
async function showTourStep(index) {
  const step = tourSteps(state.audience)[index];
  if (!demo || !step) return;
  state.tour = index;
  if (license.plan !== step.plan) await setLicense(demoLicense(step.plan));
  navigate(step.view);
  if (step.open === 'new') lookup('actions', 'manual-new')(null, ctx);
  else if (step.open === 'sample') {
    const sample = db.diagnoses.find(d => db.job(d.jobId)?.title === 'WO-0142') ?? db.diagnoses[0];
    if (sample) lookup('actions', 'manual-open')({dataset: {id: sample.id}}, ctx);
  }
}

let tourShown = null;
function highlightTour() {
  document.querySelectorAll('.tour-target').forEach(el => el.classList.remove('tour-target'));
  if (!demo || state.tour === null) { tourShown = null; return; }
  const target = tourTarget(tourSteps(state.audience)[state.tour]);
  target?.classList.add('tour-target');
  // Scroll only when the step changes, so typing on a highlighted screen never jumps. Deferred until
  // the step's screen is final: navigate() focuses the page heading and a diagnosis may open after it.
  if (tourShown !== state.tour) setTimeout(() => tourTarget(tourSteps(state.audience)[state.tour])?.scrollIntoView({block: 'start', behavior: 'smooth'}), 60);
  tourShown = state.tour;
}

function render() {
  document.documentElement.dataset.theme = db?.settings.theme === 'light' ? 'light' : 'dark';
  const active = document.activeElement;
  const id = active?.id, start = active?.selectionStart, end = active?.selectionEnd;
  let html;
  try { html = usable(license) ? frame() : accountGate(license, state); } catch (error) {
    // A screen that fails to draw shows what happened and a way out, never a blank window (S-9).
    reportError(error, false);
    html = `<div class="gate"><div class="gatecard" role="alert"><div class="brand dark">EVCORE<span>STUDIO</span></div>
      <h1 id="main-heading" tabindex="-1">This screen could not be shown</h1>
      <p>Your records are safe. Studio saved the details of the problem.</p><p class="muted">${esc(error?.message || String(error))}</p>
      <div class="actions"><button class="primary" data-action="nav" data-view="${esc(homeView())}">Back to the start</button>
        <button data-action="support-save">Save support info</button></div>
      <p class="protocol-note">Then tell us on <button class="linklike" data-action="open-website" data-page="/pages/feedback">the feedback page</button> and attach the file.</p></div></div>`;
  }
  $('#app').innerHTML = html;
  refreshLive();
  highlightTour();
  const again = id && document.getElementById(id);
  if (again) { again.focus(); if (typeof start === 'number' && again.setSelectionRange) try { again.setSelectionRange(start, end); } catch { /* not a text field */ } }
}

function refreshLive() {
  const s = state.samples.at(-1);
  for (const [key, unit, digits] of [['voltage', 'V', 2], ['signal', 'V', 2], ['current', 'A', 3]]) {
    const el = document.querySelector(`[data-metric="${key}"]`);
    if (el) el.innerHTML = `${s ? Number(s[key]).toFixed(digits) : '—'}<span class="unit">${unit}</span>`;
  }
  document.querySelectorAll('[data-metric="state"]').forEach(el => { el.textContent = state.status.state; el.classList.add('statevalue'); });
  const path = $('#signal-path');
  if (path) {
    const points = state.samples.slice(-240);
    path.setAttribute('d', points.map((p, i) => `${i ? 'L' : 'M'}${35 + i * 605 / 239},${175 - Math.max(0, Math.min(5, p.signal)) * 30}`).join(' '));
  }
}

// The device's own screen, fetched only while its page is open (views/device-screen.js).
let screenBusy = false;
async function refreshScreen() {
  if (screenBusy || state.view !== 'device-screen' || !state.connected || !device) return;
  screenBusy = true;
  try {
    state.screen = await device.screen();
    const tft = $('#device-tft');
    if (tft) tft.innerHTML = screenHtml(state.screen);
  } catch { /* A missed frame is redrawn on the next poll. */ } finally { screenBusy = false; }
}

function refreshBus() { const table = $('#bus-table'); if (table) table.innerHTML = busTable(state); }

// Actions shared by several views.
const globalActions = {
  nav(el) {
    // data-view="settings:device" opens Settings at that topic.
    const [view, tab] = String(el.dataset.view).split(':');
    if (tab) state.settingsTab = tab;
    if (view === 'jobs' && state.view !== 'jobs') state.selection.jobId = null;
    navigate(view);
    // data-then: an action of the opened screen to run next, like starting a new work order.
    const then = el.dataset.then && lookup('actions', el.dataset.then);
    if (then) return run(then, el);
  },
  mode(el) { state.mode = el.dataset.mode; db.setSetting('mode', state.mode); render(); },
  'test-choose'(el) { state.selected = Number(el.dataset.id); state.confirmed = false; navigate('diagnostics'); },
  'test-select'(el) { state.selected = Number(el.dataset.id); state.confirmed = false; render(); },
  async 'test-start'() { await device.start(); render(); },
  async stop() { await device.stop(); toast('Stop requested. Check the device state for confirmation.'); render(); },
  async 'device-reset'() { await device.reset(); render(); },
  'device-estop'() { device.injectFault(); },
  'device-release'() { device.releaseStop(); },
  async 'getting-started-hide'() { state.hideGettingStarted = true; await db.setSetting('onboardingHidden', true); render(); },
  async 'studio-update-install'() {
    if (state.status.busy) { toast('Stop the running test first.'); return; }
    if (!await globalThis.evcore?.studioUpdate?.install()) toast('The update is not ready yet.');
  },
  async 'studio-update-check'() { state.studioUpdate = await globalThis.evcore?.studioUpdate?.check() ?? state.studioUpdate; render(); },
  async 'open-website'(el) {
    if (globalThis.evcore?.openWebsite) await globalThis.evcore.openWebsite(el.dataset.page);
    else if (demo) globalThis.open(siteUrl(el.dataset.page), '_blank', 'noopener');
    else toast(`See https://csharness.com${el.dataset.page}`);
  },
  // Demo only (core/demo.js): switch edition, follow a tour step, start again with the sample records.
  async 'demo-edition'(el) { if (demo) await setLicense(demoLicense(el.dataset.plan)); },
  'demo-tour-start'() { return demo && showTourStep(0); },
  'demo-tour-next'() { return showTourStep(state.tour + 1); },
  'demo-tour-back'() { return showTourStep(state.tour - 1); },
  'demo-tour-end'() { state.tour = null; render(); },
  'demo-contact'(el) { if (demo) globalThis.location.assign(CONTACT[el.dataset.to] ?? CONTACT.shop); },
  async 'demo-reset'() {
    if (!demo || !await confirmAction('Reset the demo?', 'This removes what you added and brings back the sample records.', 'Reset demo')) return;
    await device.disconnect(); clearBrowserStorage(); globalThis.location.reload();
  },
  ...accountActions,
  async 'firmware-notes'() {
    const update = state.firmwareUpdate;
    if (!update?.latest) return;
    await dialog({title: `EVCore firmware ${update.latest.version}`,
      body: `Installed on this device: ${update.current}.${update.newer > 1 ? ` ${update.newer} newer releases are available; this is the latest.` : ''}`,
      html: `<pre class="release-notes">${esc(update.latest.notes || 'No release notes.')}</pre>
        <div class="notice">Installing firmware from Studio needs the device bootloader, which is not built yet (roadmap #98). Until then, contact CS Harness to update this device.</div>`,
      buttons: [{id: 'ok', label: 'Close'}]});
  },
  async 'support-save'() {
    if (!globalThis.evcore?.support) { toast('Support info is saved by the EVCore Studio desktop app.'); return; }
    const result = await globalThis.evcore.support.save(supportPage());
    if (result?.saved) toast(`Support info saved: ${result.path}. Attach it on csharness.com/pages/feedback.`);
  },
  'notice-dismiss'(el) { db.notices.splice(Number(el.dataset.index), 1); render(); }
};
const lookup = (kind, name) => byId[state.view][kind]?.[name] || VIEWS.find(v => v[kind]?.[name])?.[kind][name];

async function run(fn, ...args) {
  try { await fn(...args, ctx); } catch (error) { state.error = error.message; toast(error.message); render(); }
}

function wireEvents() {
  globalThis.addEventListener('error', event => reportError(event.error || event.message));
  globalThis.addEventListener('unhandledrejection', event => reportError(event.reason));
  document.addEventListener('click', event => {
    if (event.target.closest('.modal-layer')) return;
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const handler = globalActions[el.dataset.action] || lookup('actions', el.dataset.action);
    if (handler) run(handler, el);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.connected && state.status.busy && !document.querySelector('.modal-layer')) run(globalActions.stop, null);
    // Device screen: arrow keys turn the simulated knob, Enter presses it, Backspace holds it.
    const knob = KNOB_KEYS[event.key];
    if (knob && state.view === 'device-screen' && device?.hasKnob && !document.querySelector('.modal-layer') &&
        !event.target.closest?.('input, textarea, select, button, [role="button"]')) {
      event.preventDefault(); device.knob(knob); setTimeout(refreshScreen, 40);
    }
    // Rows marked role="button" activate with Enter or Space like real buttons.
    const row = event.target.closest?.('[role="button"][data-action]');
    if (row && row.tagName !== 'BUTTON' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); row.click(); }
  });
  document.addEventListener('wheel', event => {
    if (!event.target.closest?.('#device-knob, #device-tft') || !device?.hasKnob) return;
    event.preventDefault(); device.knob(event.deltaY > 0 ? 'CW' : 'CCW'); setTimeout(refreshScreen, 40);
  }, {passive: false});
  document.addEventListener('submit', event => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    const handler = accountForms[form.dataset.form] || lookup('forms', form.dataset.form);
    if (handler) run(handler, form, new FormData(form));
  });
  document.addEventListener('change', event => {
    const handler = event.target.dataset?.change && lookup('changes', event.target.dataset.change);
    if (handler) run(handler, event.target);
  });
  document.addEventListener('input', event => {
    const handler = event.target.dataset?.input && lookup('inputs', event.target.dataset.input);
    if (handler) run(handler, event.target);
  });
}

// Desktop USB: Electron asks the page to choose a serial port (desktop/main.cjs).
function wireSerialPicker() {
  globalThis.evcore?.serial?.onChoose(async ports => {
    const choice = await dialog({title: 'Choose the EVCore device',
      body: ports.length ? 'Select the USB serial port of the EVCore device.' : 'No USB serial devices were found. Check the cable and that the device is powered.',
      html: `<div class="choices">${ports.map(p => `<button class="choice-button" data-modal="${esc(p.portId)}">${esc(p.displayName || p.portName)} <span class="muted">${esc(p.portName)}${p.vendorId ? ` · VID ${esc(p.vendorId)}` : ''}</span></button>`).join('')}</div>`,
      buttons: [{id: '', label: 'Cancel'}]});
    globalThis.evcore.serial.choose(choice || '');
  });
}

// Desktop smoke test, run only when main.cjs starts Studio with --smoke-test.
function installSmokeTest() {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // Waits until a condition holds (or the limit passes) instead of a fixed delay, so a slower
  // computer, such as the CI runner, cannot fail a check that only needed more time.
  const until = async (ok, ms = 8000) => { for (const end = Date.now() + ms; !ok() && Date.now() < end;) await wait(50); return Boolean(ok()); };
  const click = selector => { const el = document.querySelector(selector); if (!el) throw new Error(`Missing ${selector}`); el.click(); };
  window.__evcoreSmoke = async () => {
    const checks = {};
    const text = () => document.body.textContent;
    // Accounts (decision 0003) against the throwaway license server main.cjs starts for this run.
    const email = 'smoke@example.test', admin = globalThis.evcore.license.smokeAdmin;
    const submit = async (fields, selector) => {
      for (const [id, value] of Object.entries(fields)) document.querySelector(`#${id}`).value = value;
      document.querySelector(selector).requestSubmit(); await wait(100);
    };
    checks.gateShown = text().includes('Sign in to EVCore Studio') && !state.connected;
    click('[data-action="account-mode"][data-mode="sign-up"]');
    await submit({'account-email': email, 'account-password': 'smoke-password-1', 'account-password2': 'smoke-password-1'}, 'form[data-form="account-sign-up"]');
    checks.signUpNeedsConfirm = await until(() => license.state === 'email_not_confirmed' && text().includes('Confirm your email address') &&
      Boolean(document.querySelector('form[data-form="account-verify"] #account-code')) && text().includes(email));
    const code = await admin('code', email); // what the confirmation email would contain
    await submit({'account-code': code === '000000' ? '111111' : '000000'}, 'form[data-form="account-verify"]');
    checks.badCodeRefused = await until(() => license.state === 'email_not_confirmed' && text().includes('not correct or has expired'));
    click('[data-action="account-resend"]');
    checks.resendAnswered = await until(() => text().includes('Wait a minute') && license.state === 'email_not_confirmed');
    await submit({'account-code': code}, 'form[data-form="account-verify"]');
    // No free trial: a new account has no license until one is bought (owner, 2026-09-26).
    checks.noTrial = await until(() => license.state === 'no_license' && text().includes('This account has no active Studio license') &&
      Boolean(document.querySelector('[data-action="open-website"][data-page="/pages/software"]')));
    // Editions (decision 0006): a Studio license gives manual diagnosis, no device.
    await admin('grant-studio', email); click('[data-action="account-renew"]');
    checks.studioEdition = await until(() => license.state === 'valid' && license.plan === 'studio' && !state.connected && state.view === 'manual' &&
      !document.querySelector('.stop') && text().includes('Upgrade to Pro'));
    // Shop details and branding follow the account (decision 0013): saved here, then changed on "another computer".
    await db.setSetting('shopName', 'Smoke Test Cycles'); await ctx.shopChanged();
    const remoteName = async () => (await admin('settings', email))?.settings?.shopName;
    let uploaded = false;
    for (const end = Date.now() + 8000; !uploaded && Date.now() < end; await wait(50)) uploaded = await remoteName() === 'Smoke Test Cycles';
    await admin('save-settings', email, {shopName: 'Smoke Test Cycles Downtown', reportAccent: '#d9480f'});
    await setLicense(await globalThis.evcore.license.renew());
    checks.shopSettingsSynced = uploaded && await until(() => db.settings.shopName === 'Smoke Test Cycles Downtown' && db.settings.reportAccent === '#d9480f');
    // Records sync through the account once turned on (decision 0015): up from here, down from "another device".
    const smokeCustomer = (await db.add('customers', {name: 'Smoke Sync Customer'})).record;
    await ctx.recordSync.enable();
    const onServer = (await admin('records', email)).some(r => r.collection === 'customers' && r.id === smokeCustomer.id);
    await admin('put-record', email, {collection: 'jobs', id: 'smoke-remote-job', data: {title: 'WO-REMOTE', vehicle: 'Phone-entered bike', status: 'Open', created: Date.now()}});
    await ctx.recordSync.now();
    checks.recordSync = onServer && db.settings.recordSyncOn && db.job('smoke-remote-job')?.title === 'WO-REMOTE' && state.recordSync?.state === 'synced';
    navigate('diagnostics');
    checks.proLocked = text().includes('Tests is part of Studio Pro') && !document.querySelector('#start-test');
    navigate('library'); // the vehicle library ships with every edition (decision 0007)
    checks.libraryOpens = $('#main-heading')?.textContent === 'Vehicle library' && text().includes('Library ') && !text().includes('part of Studio Pro');
    navigate('manual'); click('[data-action="manual-new"]'); await wait(50);
    const mform = () => document.querySelector('form[data-form="manual-save"]');
    mform().elements.job.value = 'new'; mform().elements.job.dispatchEvent(new Event('change', {bubbles: true})); await wait(50);
    Object.assign(mform().elements.new_vehicle, {value: 'Smoke e-scooter'}); Object.assign(mform().elements.complaint, {value: 'Will not power on'});
    Object.assign(mform().elements.r0_what, {value: 'Battery voltage, at rest'}); Object.assign(mform().elements.r0_value, {value: '36.2'});
    Object.assign(mform().elements.r0_min, {value: '30'}); Object.assign(mform().elements.r0_max, {value: '42'}); Object.assign(mform().elements.r0_source, {value: 'Battery label'});
    Object.assign(mform().elements.f0_text, {value: 'Power switch contact worn'}); mform().elements.f0_status.value = 'suspected';
    click('[data-action="manual-save-pdf"]');
    const saved = () => db.diagnoses[0];
    checks.manualDiagnosis = await until(() => saved()?.readings[0]?.value === 36.2 && saved().findings[0]?.status === 'suspected' && db.job(saved().jobId)?.vehicle === 'Smoke e-scooter');
    // Phone photos (decision 0014): the receiver takes a JPEG over HTTP; it lands on the work order and its report.
    const photoJob = saved().jobId, link = await globalThis.evcore.photos.start(photoJob, 'Smoke');
    const photoStatus = await globalThis.evcore.photos.smokeUpload(link.url);
    checks.phonePhoto = photoStatus === 200 && await until(() => db.photosOf(photoJob).length === 1 && Boolean(document.querySelector(`[data-photo-panel="${photoJob}"] img`)));
    checks.phonePhotoOnReport = (await reportPhotos(db, photoJob)).length === 1;
    await globalThis.evcore.photos.stop();
    // Finalizing (decision 0019): the diagnosis gets this shop's report number, locks, and its PDF is recorded in its history.
    await db.setSetting('reportPrefix', 'SMK');
    mform().elements.f0_status.value = 'confirmed'; mform().elements.f0_status.dispatchEvent(new Event('change', {bubbles: true})); await wait(50);
    Object.assign(mform().elements.f0_how, {value: 'Switch opened; no continuity when pressed'}); mform().elements.severity.value = 'service';
    Object.assign(mform().elements.technician, {value: 'Smoke Tech'});
    click('[data-action="manual-finalize"]'); await until(() => document.querySelector('.modal [data-modal="confirm"]')); click('.modal [data-modal="confirm"]');
    const reportNumber = `SMK-${new Date().getFullYear()}-0001`;
    const finalized = await until(() => saved()?.reportNumber === reportNumber && saved().status === 'Final' && Boolean(document.querySelector('fieldset.plain[disabled]')));
    click('[data-action="manual-save-pdf"]');
    checks.diagnosisFinalized = finalized && await until(() => saved().audit.some(e => e.action === 'customer-report' && e.note.startsWith(reportNumber)));
    // Photo files follow their records through the account (decision 0015, T-2): this photo goes up,
    // and one taken on "the phone" comes down, onto this computer's panel and report.
    await ctx.recordSync.now();
    const sentFiles = await admin('photo-files', email);
    const phoneShot = crypto.randomUUID();
    await admin('put-record', email, {collection: 'photos', id: phoneShot, data: {jobId: photoJob, created: Date.now(), caption: 'From the phone', inReport: true}});
    await admin('put-photo', email, phoneShot);
    await ctx.recordSync.now();
    checks.photoFilesSync = sentFiles.includes(db.photosOf(photoJob)[0]?.id) && db.photoFiles.has(phoneShot)
      && (await reportPhotos(db, photoJob)).length === 2;
    // AI marks (decision 0016): a suggestion from the account is saved only once the technician keeps it.
    const aiPhoto = db.photosOf(photoJob)[0];
    const aiButton = await until(() => document.querySelector(`[data-action="photo-ai"][data-id="${aiPhoto.id}"]`));
    if (aiButton) click(`[data-action="photo-ai"][data-id="${aiPhoto.id}"]`);
    const reviewOpen = await until(() => document.querySelector('.ai-review [data-keep="0"]'));
    const savedBeforeKeep = db.photosOf(photoJob)[0].marks.length;
    if (reviewOpen) { document.querySelector('.ai-review [data-keep="0"]').checked = true; click('[data-modal="save"]'); }
    checks.aiMarks = aiButton && reviewOpen && savedBeforeKeep === 0 && await until(() => db.photosOf(photoJob)[0]?.marks[0]?.ai === true)
      && (await reportPhotos(db, photoJob))[0]?.marks.length === 1;
    // A D1 purchase adds Studio Pro: the device features switch on without a reinstall.
    await admin('grant', email);
    await setLicense(await globalThis.evcore.license.renew());
    // Customer builds carry no simulation, so nothing connects until a real D1 is plugged in.
    const sim = platform.simulation;
    checks.licensed = await until(() => license.state === 'valid' && license.plan === 'pro' && license.daysLeft === 30 && state.connected === sim && state.view === 'dashboard');
    checks.unregisteredDeviceBlocked = await globalThis.evcore.license.allowsDevice('EVC-SMOKE-1') === false;
    await admin('register', email, 'EVC-SMOKE-1'); await setLicense(await globalThis.evcore.license.renew());
    await admin('publish-firmware', email, {board: 'mvp-sim-1', version: '0.2.0', notes: 'Smoke test release', required: false});
    checks.registeredDeviceAllowed = await globalThis.evcore.license.allowsDevice('EVC-SMOKE-1') === true;
    // Forgotten password: reset with the emailed code from the sign-in screen, which signs straight in.
    state.accountMode = 'sign-in'; await setLicense(await globalThis.evcore.license.signOut());
    click('[data-action="account-mode"][data-mode="reset"]');
    await submit({'account-email': email}, 'form[data-form="account-reset"]');
    const resetForm = await until(() => document.querySelector('form[data-form="account-reset-code"]'));
    await submit({'account-code': await admin('recovery-code', email), 'account-password': 'smoke-password-2', 'account-password2': 'smoke-password-2'}, 'form[data-form="account-reset-code"]');
    checks.passwordReset = await until(() => Boolean(resetForm) && license.state === 'valid' && state.connected === sim);
    checks.rendered = $('#main-heading')?.textContent === 'Bench' && document.querySelectorAll('.readout').length === 4 && Boolean(document.querySelector('.statusbar'));
    if (sim) checks.simulationLabeled = Boolean(document.querySelector('.top .pill.sim')) && document.querySelector('.statusbar')?.textContent.includes('Simulated data');
    else {
      checks.customerBuildNoSimulation = about?.simulation === false && !document.querySelector('.top .pill.sim') &&
        !(await globalThis.evcore.firmware.available()) && Boolean(document.querySelector('[data-action="connect"][data-source="usb"]'));
      await device.connect('demo');
      checks.customerBuildRefusesDemo = !state.connected && state.error.includes('only to an EVCore D1');
      state.settingsTab = 'device'; navigate('settings');
      checks.customerSettingsUsbOnly = !document.querySelector('[data-source="demo"], [data-source="simulator"], option[value="demo"], option[value="simulator"]');
      navigate('dashboard');
    }
    checks.noNode = typeof globalThis.require === 'undefined' && typeof globalThis.process === 'undefined';
    click('[data-view="jobs"]'); click('[data-action="job-new"]');
    let form = document.querySelector('form[data-form="job-create"]');
    form.elements.customerId.value = 'new'; form.elements.customerId.dispatchEvent(new Event('change', {bubbles: true})); await wait(50);
    form = document.querySelector('form[data-form="job-create"]');
    form.elements.title.value = 'SMOKE-1'; form.elements.customerName.value = 'Smoke Test Customer';
    form.elements.vehicleName.value = 'Test e-moto'; form.elements.symptom.value = 'No throttle response';
    form.requestSubmit();
    checks.jobCreated = await until(() => text().includes('SMOKE-1') && db.customers.some(c => c.name === 'Smoke Test Customer') && db.activeJob()?.title === 'SMOKE-1');
    // Support info (S-8): the page's errors are logged; the file has versions and counts, never records.
    globalThis.evcore.log.error('Smoke check error for smoke@example.test', 'at smokeCheck (app.js)');
    const support = await globalThis.evcore.support.save(supportPage());
    checks.supportInfo = support.saved === true && support.text.includes('Smoke check error for <email>') &&
      support.text.includes(`Version: ${about.version}`) && !support.text.includes('Smoke Test Customer') && !support.text.includes('Test e-moto');
    if (sim) {
    await until(() => document.querySelector('[data-action="job-run"]'));
    click('[data-action="job-run"]');
    await until(() => document.querySelector('#confirmed'));
    const confirm = document.querySelector('#confirmed'); confirm.checked = true; confirm.dispatchEvent(new Event('change', {bubbles: true}));
    click('#start-test');
    checks.demoTestSaved = await until(() => db.reportsOf(db.activeJob().id).length === 1 && text().includes('PASS'));
    const pdf = await saveServiceReport(db, db.activeJob().id, about);
    checks.serviceReportPdf = pdf.saved === true && pdf.bytes > 5000;
    if (await globalThis.evcore.firmware.available()) {
      await device.connect('simulator');
      checks.firmwareConnected = state.connected && state.source === 'simulator' && state.device?.firmware === '0.1.0';
      navigate('diagnostics');
      const box = document.querySelector('#confirmed'); box.checked = true; box.dispatchEvent(new Event('change', {bubbles: true}));
      click('#start-test');
      const simReports = () => db.reportsOf(db.activeJob().id).filter(r => r.source === 'simulator');
      checks.firmwareTestSaved = await until(() => simReports().length === 1 && simReports()[0].device?.board === 'mvp-sim-1');
      // Every connection checks for newer firmware for the device's board (decision 0004).
      checks.firmwareUpdateFound = await until(() => state.firmwareUpdate?.state === 'available' && state.firmwareUpdate.latest.version === '0.2.0' &&
        text().includes('Firmware update available'));
      // The device's own screen and knob (firmware evcore_ui): back, Run a test, first test, Start test, press.
      navigate('device-screen');
      checks.deviceScreenShown = await until(() => $('#device-tft')?.textContent.includes('Result: PASS'));
      for (const action of ['HOLD', 'PRESS', 'PRESS', 'CCW', 'PRESS']) { click(`[data-knob="${action}"]`); await wait(150); }
      checks.deviceScreenTestSaved = await until(() => simReports().length === 2 && $('#device-tft')?.textContent.includes('Result: PASS'));
      click('[data-action="brick-stop"]');
      checks.deviceScreenStop = await until(() => $('#device-tft')?.textContent.includes('Safety stop') && state.status.state === 'FAULT');
      click('[data-action="brick-stop"]'); await wait(200); await device.reset();
      await device.disconnect();
    }
    }
    await db.flush();
    const stored = await globalThis.evcore.store.load('jobs');
    checks.persisted = stored.data?.some(j => j.title === 'SMOKE-1');
    checks.backup = (await globalThis.evcore.backups.create()).files >= 3;
    click('[data-view="customers"]'); click('[data-action="customer-open"]'); click('[data-action="vehicle-open"]');
    checks.vehicleHistory = text().includes('Test history') && (!sim || text().includes('Profile 2'));
    click('[data-view="workflow"]');
    checks.guidedJob = document.querySelectorAll('.wizard li').length === 6 && $('#main-heading')?.textContent === 'Guided job';
    return {ready: true, checks};
  };
}

async function start() {
  const storage = openStorage();
  db = await openDatabase(storage);
  settingsSync = createSettingsSync({db, onPulled: () => { render(); toast('Shop details and report branding were updated from your account.'); }});
  // Records from other devices: redraw, except under a diagnosis being typed (it redraws on save).
  recordSync = createRecordSync({db, onPulled: () => { if (!(state.view === 'manual' && state.manual.draft)) render(); }, onPhotos: ids => photoFilesArrived(ctx, ids)});
  let syncSoon = null;
  const syncAfter = ms => { clearTimeout(syncSoon); syncSoon = setTimeout(syncRecords, ms); };
  db.onLocalChange = () => syncAfter(1500);
  globalThis.evcore?.license?.onRecordsChanged?.(what => { if (what === 'changed') syncAfter(300); });
  setInterval(syncRecords, 15000);
  await ctx.refreshAbout();
  platform.simulation = about?.simulation !== false;
  platform.firmware = platform.simulation && Boolean(await globalThis.evcore?.firmware?.available?.());
  if (!platform.simulation) state.source = 'usb';
  state.mode = db.settings.mode === 'expert' ? 'expert' : 'guided';
  state.baud = db.settings.baud;
  device = createDevice({state, db, render, refreshLive, refreshBus, toast, checkFirmware, simulation: platform.simulation,
    allowsDevice: serial => globalThis.evcore?.license ? globalThis.evcore.license.allowsDevice(serial) : Promise.resolve(true)});
  wireEvents();
  listenForPhotos(ctx);
  setScreenRefresher(refreshScreen);
  setInterval(refreshScreen, 300);
  wireSerialPicker();
  if (about?.smoke) installSmokeTest();
  if (about?.shots) installShots(ctx); // website screenshots, development builds only
  // A first visit, or a link from the landing page (?tour), starts the guided tour.
  if (demo) {
    const query = new URLSearchParams(globalThis.location.search);
    state.audience = audienceOf(query.get('for'));
    if (await seedDemo(db) || query.has('tour')) { state.hideGettingStarted = true; state.tour = 0; }
  }
  license = demo ? demoLicense('studio') : await globalThis.evcore?.license?.status?.() ?? {state: 'development'};
  state.studioUpdate = await globalThis.evcore?.studioUpdate?.status?.() ?? null;
  // Re-render only when the update state changes, not on every download-progress tick.
  globalThis.evcore?.studioUpdate?.onStatus(next => { const changed = next.state !== state.studioUpdate?.state; state.studioUpdate = next; if (changed) render(); });
  globalThis.evcore?.license?.onChanged(next => setLicense(next));
  state.view = homeView();
  render();
  syncShop();
  if (usable(license) && hasPro() && platform.simulation) await device.connect('demo');
  // Renew in the background; a slow or absent network never delays startup.
  globalThis.evcore?.license?.renew().then(next => { if (next.state !== license.state || next.daysLeft !== license.daysLeft) setLicense(next); }).catch(() => {});
}

start().catch(error => {
  reportError(error, false);
  document.querySelector('#app').innerHTML = `<div class="errorbox" role="alert">EVCore Studio could not start: ${esc(error.message)}</div>`;
});
