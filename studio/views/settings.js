import {esc, badge, dateTime, relative, confirmAction, dialog} from '../core/ui.js';
import {isSimulated} from '../records.js';
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

function shopPanel({db}) {
  const s = db.settings;
  return `<section class="panel"><h2>Shop details</h2><p>Printed at the top of every service report.</p>
    <form data-form="shop" class="formgrid"><label class="field">Shop name<input name="shopName" maxlength="80" value="${esc(s.shopName)}"></label>
    <label class="field">Phone<input name="shopPhone" maxlength="40" value="${esc(s.shopPhone)}"></label>
    <label class="field wide">Address<textarea name="shopAddress" maxlength="300">${esc(s.shopAddress)}</textarea></label>
    <label class="field">Technician name<input name="technician" maxlength="80" value="${esc(s.technician)}"></label>
    <div class="actions wide"><button class="primary" type="submit">Save shop details</button></div></form></section>`;
}

function dataPanel({db, about, state}) {
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

export const settings = {
  id: 'settings',
  heading: 'Settings',
  render(ctx) {
    const {about, platform, db} = ctx;
    const pro = ctx.license?.state === 'development' || ctx.license?.plan === 'pro'; // device connections are Studio Pro (decision 0006)
    const appearance = `<section class="panel"><h2>Appearance</h2><label class="field narrow">Theme<select data-change="theme">
      ${[['dark', 'Dark'], ['light', 'Light (bright shops, printing)']].map(([v, l]) => `<option value="${v}" ${db.settings.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></section>`;
    return `${accountPanel(ctx.license)}<div class="twocol">${pro ? connectionPanel(ctx) : appearance}${shopPanel(ctx)}</div>${pro ? appearance : ''}${updatesPanel(ctx)}${dataPanel(ctx)}
      <section class="panel"><h2>About</h2><p>EVCore Studio ${esc(about?.version || '(web preview)')}${about?.electron ? ` · Electron ${esc(about.electron)}` : ''} · host protocol 2 ·
      ${platform.desktop ? 'desktop app' : 'developer web preview'}.</p><p>Studio requests actions; the device owns test execution and safety.
      Closing Studio or losing the connection never confirms that outputs are off: use the device's local STOP.</p></section>`;
  },
  actions: {
    async connect(el, {device}) { await device.connect(el.dataset.source); },
    async disconnect(_el, {device}) { await device.disconnect(); },
    async 'backup-now'(_el, ctx) {
      const result = await globalThis.evcore.backups.create();
      await ctx.refreshAbout(); ctx.state.backupMessage = `Backup saved (${result.files} files).`; ctx.render();
    },
    'backup-folder'() { globalThis.evcore.backups.openFolder(); },
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
    async shop(_form, data, {db, render, toast}) {
      for (const key of ['shopName', 'shopPhone', 'shopAddress', 'technician']) await db.setSetting(key, String(data.get(key) || '').slice(0, key === 'shopAddress' ? 300 : 80));
      toast('Shop details saved.'); render();
    }
  },
  changes: {
    async theme(el, {db, render}) { await db.setSetting('theme', el.value === 'light' ? 'light' : 'dark'); render(); },
    async baud(el, {db, state, toast}) {
      const value = Number(el.value);
      if (Number.isInteger(value) && value >= 1200 && value <= 3000000) { state.baud = value; await db.setSetting('baud', value); }
      else toast('Enter a baud rate between 1200 and 3000000.');
    }
  }
};
