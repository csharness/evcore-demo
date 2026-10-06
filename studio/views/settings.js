import {esc, badge, dateTime, relative, confirmAction, dialog, printReport, reportSavedMessage} from '../core/ui.js';
import {isSimulated, sanitizeDiagnosis, pickFile} from '../records.js';
import {cleanPrefix, validTimeZone} from '../settings-sync.js';
// Time zones offered for reports; '' prints the computer's own.
const TIME_ZONES = [['', "This computer's time zone"], ['America/Los_Angeles', 'Pacific (Los Angeles)'], ['America/Denver', 'Mountain (Denver)'],
  ['America/Phoenix', 'Arizona (Phoenix)'], ['America/Chicago', 'Central (Chicago)'], ['America/New_York', 'Eastern (New York)'], ['America/Anchorage', 'Alaska'], ['Pacific/Honolulu', 'Hawaii']];
import {parseShopProfile} from '../shop-profile.js';
import {BRAND_FONTS, LOGO_MAX_BYTES, FONT_MAX_BYTES, sanitizeBranding, fontDataUrl} from '../branding.js';
import {diagnosisReportHtml} from './report-document.js';
import {deviceTable} from './components.js';
import {SOURCE_LABEL} from '../core/device.js';
import {accountPanel} from './account.js';
import {KNOWLEDGE} from '../knowledge.js';

export const profiles = {
  id: 'profiles',
  heading: 'Profiles and adapters',
  render({state}) {
    return `<section class="panel"><div class="panelhead"><h2>Discovered profiles</h2>${badge(isSimulated(state.source) ? 'SIMULATED' : 'FROM DEVICE', 'gray')}</div>
      ${state.profiles.map(p => `<div class="catalogrow"><div><h3>${esc(p.name)}</h3><p>${esc(p.detail)}</p><p class="mono">PROFILE_ID ${esc(p.id)}${p.min !== undefined ? ` · range ${esc(p.min)}–${esc(p.max)} ${esc(p.unit)}` : ''}</p></div>
        <button data-action="test-choose" data-id="${esc(p.id)}" class="small">Use profile →</button></div>`).join('') || '<div class="empty">Connect to discover profiles.</div>'}
      <div class="notice">${isSimulated(state.source) ? 'Simulated fixture values are for software testing only. They are not approved electrical thresholds.' : 'Profiles are reported as valid for the connected adapter. Harness identity and approved limits must still be verified.'}</div></section>
      <section class="panel"><h2>Device capability boundaries</h2><p>The device protocol currently offers profile discovery, bounded tests, status, reports, logs, STOP and explicit reset.
      It does not yet provide continuous telemetry, bus streaming, calibration writeback or profile upload, so those controls are not shown.</p></section>`;
  }
};

function connectionPanel({state, platform}) {
  const options = [
    ['demo', 'In-app demo', 'Synthetic signals and results generated inside Studio. Always available.', true],
    ['simulator', 'Firmware simulator', 'The real EVCore firmware running on this computer, with simulated hardware. Desktop app only.', platform.firmware],
    ['usb', 'USB device', 'An EVCore D1 over USB.', platform.serial]].filter(([id]) => id === 'usb' || platform.simulation);
  return `<section class="panel"><h2>Connection</h2>
    <p>${state.connected ? `Connected to <b>${esc(SOURCE_LABEL[state.source])}</b>.` : 'Not connected.'} ${state.connected && isSimulated(state.source) ? 'All data is simulated and labeled that way.' : ''}</p>
    <div class="choices">${options.map(([id, label, detail, available]) => `<div class="choice ${state.connected && state.source === id ? 'selected' : ''}"><div><h3>${label}</h3><p>${detail}</p></div>
      <button class="${state.connected && state.source === id ? '' : 'primary'} small" data-action="connect" data-source="${id}" ${available ? '' : 'disabled'}>${state.connected && state.source === id ? 'Reconnect' : 'Connect'}</button></div>`).join('')}</div>
    <label class="field">USB serial baud rate (provisional)<input type="number" data-change="baud" min="1200" max="3000000" value="${esc(state.baud)}"></label>
    <div class="actions"><button data-action="disconnect" ${state.connected ? '' : 'disabled'}>Disconnect</button></div>
    <h3>Connected device</h3>${state.connected ? deviceTable(state.device) + firmwareLine(state.firmwareUpdate) : '<p class="muted">No device connected.</p>'}</section>`;
}

function firmwareLine(update) {
  if (!update) return '';
  const text = update.state === 'checking' ? 'Checking for firmware updates…'
    : update.state === 'current' ? 'Firmware is up to date.'
    : ['available', 'required'].includes(update.state) ? `Firmware ${update.latest.version} is available${update.state === 'required' ? ' (required update)' : ''}.`
    : update.message || 'Firmware updates could not be checked.';
  return `<p class="protocol-note" id="firmware-update-status">${esc(text)}</p>`;
}

// Where the shop details and branding are kept (decision 0013).
function syncNote({license, state}) {
  if (license?.state !== 'valid' || !license.email) return '';
  const r = state.shopSync;
  const status = r?.state === 'offline' ? ' Not saved to the account yet: Studio will try again when it is online.'
    : r?.state === 'error' ? ' The account server did not accept the last save; Studio will try again.' : '';
  return `<p class="muted">Shop details and report branding are saved to your account (${esc(license.email)}), so every computer signed in to it uses them. The technician name stays on this computer.${status}</p>`;
}

function shopPanel({db, license, state}) {
  const s = db.settings;
  return `<section class="panel"><header class="panelhead"><div><h2>Shop details</h2><div class="sub">Printed at the top of every report.</div></div></header>
    <form data-form="shop" autocomplete="off">
    <div class="formgrid two"><label class="field">Shop name<input name="shopName" maxlength="80" value="${esc(s.shopName)}" placeholder="As customers know you"></label>
      <label class="field">Phone<input name="shopPhone" maxlength="80" value="${esc(s.shopPhone)}"></label>
      <label class="field">Service email<input name="shopEmail" type="email" maxlength="120" value="${esc(s.shopEmail)}"></label>
      <label class="field">Opening hours<input name="shopHours" maxlength="200" value="${esc(s.shopHours)}" placeholder="e.g. Thu–Tue 10 AM–6 PM, closed Wed"></label></div>
    <label class="field">Address<textarea name="shopAddress" maxlength="300" rows="2">${esc(s.shopAddress)}</textarea></label>
    <h3 class="settings-sub">Report numbers and time</h3>
    <div class="formgrid two"><label class="field">Report number prefix<input name="reportPrefix" maxlength="12" value="${esc(s.reportPrefix)}" placeholder="e.g. ESC">
      <small class="muted">Final reports are numbered ${esc(s.reportPrefix || 'DR')}-${new Date().getFullYear()}-0001, 0002… Give each location its own prefix.</small></label>
      <label class="field">Time zone on reports<select name="shopTimeZone">${TIME_ZONES.map(([zone, label]) => `<option value="${esc(zone)}" ${s.shopTimeZone === zone ? 'selected' : ''}>${esc(label)}</option>`).join('')}
      ${s.shopTimeZone && !TIME_ZONES.some(([zone]) => zone === s.shopTimeZone) ? `<option value="${esc(s.shopTimeZone)}" selected>${esc(s.shopTimeZone)}</option>` : ''}</select></label></div>
    <div class="actions"><button class="primary" type="submit">Save shop details</button><div class="spacer"></div>
      <button type="button" class="quiet" data-action="shop-profile-import" title="Load a location's details and branding from a shop profile file">Import shop profile…</button></div></form>
    ${syncNote({license, state})}</section>`;
}

// What the top of a customer report will look like with the current details and branding. The
// accent rule is an SVG fill, since the page's security policy allows no inline styles.
function reportPreview(s, b) {
  return `<div class="report-preview" aria-label="Preview of the top of a report"><div class="rp-head"><div><div class="rp-kind">Diagnostic report</div><div class="rp-title">Sample e-bike</div></div>
    <div class="rp-shop">${b.reportLogo ? `<img src="${esc(b.reportLogo)}" alt="">` : ''}<b>${esc(s.shopName || 'Your shop name')}</b>${s.shopAddress ? `<span>${esc(s.shopAddress).replaceAll('\n', '<br>')}</span>` : ''}
      ${s.shopPhone ? `<span>${esc(s.shopPhone)}</span>` : ''}${s.shopEmail ? `<span>${esc(s.shopEmail)}</span>` : ''}</div></div>
    <svg class="rp-rule" viewBox="0 0 100 1" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="1" fill="${esc(b.reportAccent || '#0a84ff')}"/></svg>
    <div class="rp-lines"><i></i><i></i><i></i></div></div>`;
}

// Logo, brand colour and font for customer reports (branding.js validates every value). Each
// change is saved at once; the preview shows the result.
function brandingPanel({db}) {
  const b = sanitizeBranding(db.settings);
  const fonts = Object.entries(BRAND_FONTS).filter(([id]) => id !== 'custom' || b.reportFontFile);
  return `<section class="panel"><header class="panelhead"><div><h2>Report branding</h2><div class="sub">Your logo, colour and font on every customer report. Changes save as you make them.</div></div></header>
    <div class="branding-layout"><div class="branding-controls">
      <div class="setting-row"><div><b>Logo</b><small class="muted">PNG, JPEG, WebP or SVG, up to ${LOGO_MAX_BYTES / 1048576} MB. A wide logo on a clear background prints best.</small></div>
        <div class="setting-control"><label class="filebutton">${b.reportLogo ? 'Change logo' : 'Choose logo'}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-change="brand-logo"></label>
        ${b.reportLogo ? '<button class="small quiet" data-action="brand-logo-clear">Remove</button>' : ''}</div></div>
      <div class="setting-row"><div><b>Brand colour</b><small class="muted">${b.reportAccent ? `The line under the report header (${esc(b.reportAccent)}).` : "Using the report's default blue."}</small></div>
        <div class="setting-control"><input type="color" class="brand-color" data-change="brand-accent" value="${esc(b.reportAccent || '#0a84ff')}" aria-label="Brand colour">
        ${b.reportAccent ? '<button class="small quiet" data-action="brand-accent-clear">Use default</button>' : ''}</div></div>
      <div class="setting-row"><div><b>Font</b><small class="muted">Fonts that come with Windows, or your own file.</small></div>
        <div class="setting-control"><select data-change="brand-font" aria-label="Report font">${fonts.map(([id, f]) => `<option value="${id}" ${b.reportFont === id ? 'selected' : ''}>${esc(id === 'custom' ? `${f.label}: ${b.reportFontName}` : f.label)}</option>`).join('')}</select></div></div>
      <div class="setting-row"><div><b>Your own font file</b><small class="muted">TTF, OTF, WOFF or WOFF2, up to ${FONT_MAX_BYTES / 1048576} MB, that your license allows in documents.</small></div>
        <div class="setting-control"><label class="filebutton">${b.reportFontFile ? 'Change file' : 'Choose file'}<input type="file" accept=".ttf,.otf,.woff,.woff2" data-change="brand-font-file"></label>
        ${b.reportFontFile ? '<button class="small quiet" data-action="brand-font-clear">Remove</button>' : ''}</div></div>
    </div><div>${reportPreview(db.settings, b)}<div class="actions"><button data-action="brand-sample">Save a sample report</button></div></div></div></section>`;
}

// What belongs to this computer only: who works at it, and how Studio looks on it.
function computerPanel({db}) {
  const s = db.settings;
  return `<section class="panel"><header class="panelhead"><div><h2>This computer</h2><div class="sub">Kept on this computer only; the shop's other computers keep their own.</div></div></header>
    <form data-form="local" class="setting-row"><div><b>Technician name</b><small class="muted">Filled in on new diagnoses and on the reports this computer saves.</small></div>
      <div class="setting-control"><input name="technician" maxlength="80" value="${esc(s.technician)}" aria-label="Technician name" placeholder="Your name"><button class="primary small" type="submit">Save</button></div></form>
    <div class="setting-row"><div><b>Theme</b><small class="muted">Light is easier to read in a bright shop.</small></div>
      <div class="setting-control"><select data-change="theme" aria-label="Theme">${[['dark', 'Dark'], ['light', 'Light']].map(([v, l]) => `<option value="${v}" ${s.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div></section>`;
}

const readDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('The file could not be read.'));
  reader.readAsDataURL(file);
});

// Saves branding fields after validation and, if anything changed, marks it for the account
// (decision 0013). Returns what was stored.
async function saveBranding(db, patch, shopChanged) {
  const clean = sanitizeBranding({...db.settings, ...patch});
  let changed = false;
  for (const [key, value] of Object.entries(clean)) if (db.settings[key] !== value) { await db.setSetting(key, value); changed = true; }
  if (changed) await shopChanged?.();
  return clean;
}

// A made-up job that shows the shop's branding. It carries no ranges, so it states no limits.
async function saveSampleReport({db, about, toast}) {
  const diagnosis = sanitizeDiagnosis({id: 'sample', created: Date.now(), technician: db.settings.technician,
    complaint: 'Sample report to preview your branding. This is not a real diagnosis.',
    symptoms: ['Sample symptom'], readings: [{what: 'Sample reading', where: 'Sample location', value: 12.6, unit: 'V'}],
    findings: [{text: 'Sample finding, shown here only to preview the layout.', status: 'observed'}]});
  const html = diagnosisReportHtml({diagnosis, job: {title: 'SAMPLE'}, vehicle: {name: 'Sample e-bike'}, customer: {name: 'Sample customer'},
    settings: db.settings, appVersion: about?.version || 'preview'});
  const result = globalThis.evcore?.report ? await globalThis.evcore.report.savePdf(html, 'sample-branded-report')
    : await printReport(html, 'sample-branded-report');
  const message = reportSavedMessage('Sample report', result);
  if (message) toast(message);
}

// Record sync through the account (decisions 0015, 0017). The switch is the account's: turning it
// on or off here does it for every device signed in to the account.
const RECORD_SYNC_TEXT = {offline: 'Not synced: the account server could not be reached. Studio keeps trying on its own.',
  ended: 'Not synced: sign in again.', error: 'Not synced: the account server refused the last sync. Studio keeps trying on its own.',
  unavailable: 'Sync is not available in this build.'};
function recordSyncPanel({db, license, state}) {
  if (license?.state !== 'valid' || !license.email || !globalThis.evcore?.license?.syncState) return '';
  const r = state.recordSync, on = db.settings.recordSyncOn;
  if (r?.state === 'other_account') return `<section class="panel"><h2>Sync records across devices</h2>
    <p class="notice">This computer has records from <b>${esc(r.previous)}</b>, and <b>${esc(license.email)}</b> is now signed in. Its records stay on the
    ${esc(r.previous)} account. To sync with ${esc(license.email)}, this computer replaces them with that account's records.</p>
    <div class="actions"><button class="primary" data-action="record-sync-use-account">Use ${esc(license.email)}'s records here</button></div></section>`;
  const status = !on ? 'Off for this account. Each device keeps its own records.'
    : r?.state === 'synced' ? `On for every device signed in to this account. Last synced ${esc(relative(r.at))}${db.outbox.size ? `; ${db.outbox.size} change${db.outbox.size === 1 ? '' : 's'} waiting` : ''}.`
    : RECORD_SYNC_TEXT[r?.state] || 'On for every device signed in to this account.';
  return `<section class="panel"><h2>Sync records across devices</h2>
    <p>Customers, vehicles, work orders, diagnoses, test reports and photos are shared with every computer, phone and tablet signed in to
    <b>${esc(license.email)}</b>, within seconds of each change. Records and photos are stored on the CS Harness account service and only this account can read them.</p>
    <p class="${r?.state && !['synced', 'off'].includes(r.state) ? 'notice' : 'muted'}">${status}</p>
    <div class="actions">${on ? '<button data-action="record-sync-now">Sync now</button><button data-action="record-sync-off">Turn off for all devices</button>'
      : '<button class="primary" data-action="record-sync-on">Turn on sync</button>'}</div></section>`;
}

function dataPanel({db, about, state}) {
  if (db.kind === 'device') return `<section class="panel"><h2>Data</h2><p>Records are saved in the app on this ${esc(about?.platform === 'ios' ? 'iPhone or iPad' : 'phone or tablet')}.
    ${db.settings.recordSyncOn ? 'They are synced with your account, so your other devices have them too.' : 'Turn on sync under <b>Account and sync</b> to keep a copy on your account; without it, removing the app removes them.'}</p></section>`;
  if (db.kind !== 'desktop') return `<section class="panel"><h2>Data</h2><div class="notice">This is the developer web preview. Records are kept in this browser only and are not backed up. Use the desktop app for real work.</div></section>`;
  return `<section class="panel"><h2>Data and backups</h2>
    <p>Records are saved on this computer in <span class="mono">${esc(about?.dataDir || '')}</span>. A snapshot is taken automatically once a day when Studio starts.</p>
    <p>Last backup: <b>${about?.lastBackup ? `${esc(dateTime(about.lastBackup))} (${esc(relative(about.lastBackup))})` : 'none yet'}</b></p>
    <div class="actions"><button class="primary" data-action="backup-now">Back up now</button><button data-action="backup-restore">Restore a backup…</button><button data-action="backup-folder">Open backups folder</button></div>
    ${state.backupMessage ? `<p class="protocol-note">${esc(state.backupMessage)}</p>` : ''}</section>`;
}

// Studio's own updates (desktop/updater.cjs): version and the latest check.
const UPDATE_TEXT = {
  disabled: 'Automatic updates are off in development builds.', idle: 'Studio checks for updates shortly after it starts and every few hours.',
  checking: 'Checking for updates…', current: 'Studio is up to date.', error: ''
};
function updatesPanel({state}) {
  const u = state.studioUpdate;
  if (!u) return '';
  const text = u.state === 'downloading' ? `Downloading EVCore Studio ${u.available}${u.percent !== null ? ` (${u.percent}%)` : ''}…`
    : u.state === 'ready' ? `EVCore Studio ${u.available} is ready. Restart Studio to install it.` : u.state === 'error' ? u.message : UPDATE_TEXT[u.state];
  return `<section class="panel"><div class="panelhead"><h2>Studio updates</h2><div class="spacer"></div><span class="tag">Version ${esc(u.version)}</span> <span class="tag" title="Vehicle library shipped with this version">Library ${esc(KNOWLEDGE.version)}</span></div>
    <p>${esc(text)}${u.checked ? ` <span class="muted">Last checked ${esc(new Date(u.checked).toLocaleString())}.</span>` : ''}</p>
    ${u.notes && ['downloading', 'ready'].includes(u.state) ? `<pre class="release-notes">${esc(u.notes)}</pre>` : ''}
    <div class="actions"><button data-action="studio-update-check" ${['disabled', 'checking', 'downloading'].includes(u.state) ? 'disabled' : ''}>Check now</button>
      ${u.state === 'ready' ? `<button class="primary" data-action="studio-update-install" ${state.status.busy ? 'disabled title="Stop the running test first"' : ''}>Restart and update</button>` : ''}</div></section>`;
}

// Settings, one topic at a time (owner, 2026-10-06: the single long page was confusing).
const SETTINGS_TABS = [['shop', 'Shop'], ['branding', 'Report branding'], ['computer', 'This computer'], ['account', 'Account and sync'],
  ['device', 'Device'], ['data', 'Data and backups'], ['about', 'About and updates']];

export const settings = {
  id: 'settings',
  heading: 'Settings',
  render(ctx) {
    const {about, platform, state} = ctx;
    const pro = ctx.license?.state === 'development' || ctx.license?.plan === 'pro'; // device connections are Studio Pro (decision 0006)
    const tabs = SETTINGS_TABS.filter(([id]) => id !== 'device' || pro);
    const tab = tabs.some(([id]) => id === state.settingsTab) ? state.settingsTab : 'shop';
    const aboutPanel = `<section class="panel"><h2>About</h2><p>EVCore Studio ${esc(about?.version || '(web preview)')}${about?.electron ? ` · Electron ${esc(about.electron)}` : ''} · host protocol 2 ·
      ${platform.desktop ? 'desktop app' : platform.mobile ? 'phone and tablet app' : 'developer web preview'}.</p><p>Studio requests actions; the device owns test execution and safety.
      Closing Studio or losing the connection never confirms that outputs are off: use the device's local STOP.</p></section>`;
    const body = {shop: () => shopPanel(ctx), branding: () => brandingPanel(ctx), computer: () => computerPanel(ctx),
      account: () => accountPanel(ctx.license) + recordSyncPanel(ctx), device: () => connectionPanel(ctx), data: () => dataPanel(ctx),
      about: () => updatesPanel(ctx) + aboutPanel}[tab]();
    return `<div class="settings-layout"><nav class="settings-nav" aria-label="Settings sections">${tabs.map(([id, label]) =>
      `<button class="${id === tab ? 'on' : ''}" data-action="settings-tab" data-tab="${id}" ${id === tab ? 'aria-current="page"' : ''}>${esc(label)}</button>`).join('')}</nav>
      <div class="settings-body">${body}</div></div>`;
  },
  actions: {
    'settings-tab'(el, {state, render}) { state.settingsTab = el.dataset.tab; render(); },
    async connect(el, {device}) { await device.connect(el.dataset.source); },
    async disconnect(_el, {device}) { await device.disconnect(); },
    async 'backup-now'(_el, ctx) {
      const result = await globalThis.evcore.backups.create();
      await ctx.refreshAbout(); ctx.state.backupMessage = `Backup saved (${result.files} files).`; ctx.render();
    },
    'backup-folder'() { globalThis.evcore.backups.openFolder(); },
    async 'brand-logo-clear'(_el, {db, render, toast, shopChanged}) { await saveBranding(db, {reportLogo: ''}, shopChanged); toast('Logo removed.'); render(); },
    async 'brand-accent-clear'(_el, {db, render, shopChanged}) { await saveBranding(db, {reportAccent: ''}, shopChanged); render(); },
    async 'brand-font-clear'(_el, {db, render, toast, shopChanged}) { await saveBranding(db, {reportFontFile: '', reportFontName: ''}, shopChanged); toast('Font file removed.'); render(); },
    async 'brand-sample'(_el, ctx) { await saveSampleReport(ctx); },
    async 'record-sync-on'(_el, ctx) {
      if (!await confirmAction('Turn on sync?', `Every computer, phone and tablet signed in to ${ctx.license.email} will share customers, vehicles, work orders, diagnoses, reports and photos, including the ones already on this computer. Edits made on two devices at once are combined.`, 'Turn on sync')) return;
      await ctx.recordSync.enable();
    },
    async 'record-sync-off'(_el, ctx) {
      if (!await confirmAction('Turn off sync for all devices?', `Every device signed in to ${ctx.license.email} stops syncing and keeps the records it has. The account keeps its copies, so turning sync on again picks up where it left off.`, 'Turn off', 'danger')) return;
      await ctx.recordSync.disable();
    },
    async 'record-sync-now'(_el, ctx) { await ctx.recordSync.now(); },
    async 'record-sync-use-account'(_el, ctx) {
      if (!await confirmAction(`Use ${ctx.license.email}'s records?`, `The records from ${ctx.state.recordSync?.previous} are removed from this computer; they stay on that account. Changes not yet synced from it are lost.`, 'Replace', 'danger')) return;
      await ctx.recordSync.useAccount();
    },
    // A location's shop details and branding from a shop profile file (decision 0019).
    async 'shop-profile-import'(_el, {db, render, toast, shopChanged}) {
      let profile;
      try { const text = await pickFile(); if (text === null) return; profile = parseShopProfile(text); }
      catch (e) { toast(e.message); return; }
      const keys = Object.keys(profile.settings);
      if (!await confirmAction(`Use the shop profile for ${profile.name}?`, `It replaces this computer's ${keys.includes('reportLogo') ? 'shop details and report branding' : 'shop details'}. Records are not changed.`, 'Use profile')) return;
      let changed = false;
      for (const [key, value] of Object.entries(profile.settings)) if (db.settings[key] !== value) { await db.setSetting(key, value); changed = true; }
      if (changed) await shopChanged?.();
      toast(`Shop profile loaded: ${profile.name}.`); render();
    },
    async 'backup-restore'(_el, ctx) {
      const list = await globalThis.evcore.backups.list();
      if (!list.length) { ctx.toast('There are no backups yet.'); return; }
      const choice = await dialog({title: 'Restore a backup', body: 'Studio will reload with the chosen snapshot. Your current records are saved as a pre-restore backup first.',
        html: `<div class="choices">${list.slice(0, 12).map(b => `<button class="choice-button" data-modal="${esc(b.id)}">${esc(b.id.slice(0, 10))} ${esc(b.id.slice(11, 19).replaceAll('-', ':'))} UTC · ${esc(b.id.slice(25) || 'snapshot')} · ${b.files} files</button>`).join('')}</div>`,
        buttons: [{id: 'cancel', label: 'Cancel'}]});
      if (!choice || choice === 'cancel') return;
      if (!await confirmAction('Restore this backup?', 'All current records are replaced by the snapshot. A safety copy of the current data is kept.', 'Restore', 'danger')) return;
      if (ctx.state.connected) await ctx.device.disconnect();
      await globalThis.evcore.backups.restore(choice);
      location.reload();
    }
  },
  forms: {
    async shop(_form, data, {db, render, toast, shopChanged}) {
      let changed = false;
      const limits = {shopName: 80, shopPhone: 80, shopAddress: 300, shopEmail: 120, shopHours: 200, reportPrefix: 12, shopTimeZone: 40};
      const prefix = String(data.get('reportPrefix') || '').trim();
      if (prefix && !cleanPrefix(prefix)) { toast('The report number prefix starts with a letter and uses letters, digits and dashes only.'); return; }
      for (const key of Object.keys(limits)) {
        const raw = String(data.get(key) || '').trim().slice(0, limits[key]);
        const value = key === 'reportPrefix' ? cleanPrefix(prefix) : key === 'shopTimeZone' ? (validTimeZone(raw) ? raw : '') : raw;
        if (db.settings[key] !== value) { await db.setSetting(key, value); changed = true; }
      }
      if (changed) await shopChanged?.();
      toast('Shop details saved.'); render();
    },
    // The technician name stays on this computer (decision 0013).
    async local(_form, data, {db, render, toast}) {
      await db.setSetting('technician', String(data.get('technician') || '').trim().slice(0, 80));
      toast('Saved on this computer.'); render();
    }
  },
  changes: {
    async theme(el, {db, render}) { await db.setSetting('theme', el.value === 'light' ? 'light' : 'dark'); render(); },
    async 'brand-logo'(el, {db, render, toast, shopChanged}) {
      const file = el.files?.[0];
      if (!file) return;
      if (file.size > LOGO_MAX_BYTES) { toast(`That image is over ${LOGO_MAX_BYTES / 1048576} MB. Save a smaller copy and try again.`); return; }
      const url = await readDataUrl(file);
      if (!(await saveBranding(db, {reportLogo: url}, shopChanged)).reportLogo) toast('Choose a PNG, JPEG, WebP or SVG image.');
      else toast('Logo saved. It appears on every new report.');
      render();
    },
    async 'brand-accent'(el, {db, render, shopChanged}) { await saveBranding(db, {reportAccent: el.value.toLowerCase()}, shopChanged); render(); },
    async 'brand-font'(el, {db, render, shopChanged}) { await saveBranding(db, {reportFont: el.value}, shopChanged); render(); },
    async 'brand-font-file'(el, {db, render, toast, shopChanged}) {
      const file = el.files?.[0];
      if (!file) return;
      if (file.size > FONT_MAX_BYTES) { toast(`That font file is over ${FONT_MAX_BYTES / 1048576} MB.`); return; }
      const url = fontDataUrl(file.name, (await readDataUrl(file)).split(',')[1] || '');
      const saved = url && await saveBranding(db, {reportFontFile: url, reportFontName: file.name, reportFont: 'custom'}, shopChanged);
      toast(saved?.reportFontFile ? 'Font saved and selected for reports.' : 'Choose a TTF, OTF, WOFF or WOFF2 font file.');
      render();
    },
    async baud(el, {db, state, toast}) {
      const value = Number(el.value);
      if (Number.isInteger(value) && value >= 1200 && value <= 3000000) { state.baud = value; await db.setSetting('baud', value); }
      else toast('Enter a baud rate between 1200 and 3000000.');
    }
  }
};
