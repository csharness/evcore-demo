// Shop details and report branding saved with the account (decision 0013), so every computer
// signed in to the same account prints the same shop on its reports. Pure functions: what to send,
// how to clean what comes back, and whether to download, upload or do nothing.
import {sanitizeBranding} from './branding.js';

const SHOP_LIMITS = {shopName: 80, shopPhone: 80, shopAddress: 300};
// Added for the two-location pilot (decision 0019): service email, opening hours, the report number
// prefix and the shop's time zone (an IANA name such as America/Los_Angeles; '' is the computer's).
// A server without the 20261005 migration rejects them, so a rejected save is repeated without them,
// and a saved copy without them never clears them here.
export const PILOT_LIMITS = Object.freeze({shopEmail: 120, shopHours: 200, reportPrefix: 12, shopTimeZone: 40});
export const PILOT_KEYS = Object.freeze(Object.keys(PILOT_LIMITS));
export const SYNCED_KEYS = Object.freeze([...Object.keys(SHOP_LIMITS), ...PILOT_KEYS, 'reportLogo', 'reportAccent', 'reportFont', 'reportFontFile', 'reportFontName']);

// A report number prefix: 1 to 12 capital letters, digits or dashes, starting with a letter.
export const REPORT_PREFIX = /^[A-Z][A-Z0-9-]{0,11}$/;
export const cleanPrefix = value => {
  const p = String(value ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
  return REPORT_PREFIX.test(p) ? p : '';
};
// A time zone this computer knows by its IANA name.
export const validTimeZone = zone => {
  if (typeof zone !== 'string' || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(zone)) return false;
  try { new Intl.DateTimeFormat('en-US', {timeZone: zone}); return true; } catch { return false; }
};
const cleanText = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max) : '';

// The synced fields of a settings object (from this computer or from the server), each valid.
export function syncedSettings(source = {}) {
  const out = {};
  for (const [key, max] of Object.entries({...SHOP_LIMITS, ...PILOT_LIMITS})) out[key] = cleanText(source[key], max);
  out.reportPrefix = cleanPrefix(out.reportPrefix);
  if (!validTimeZone(out.shopTimeZone)) out.shopTimeZone = '';
  return {...out, ...sanitizeBranding(source)};
}

// What a server without the pilot fields accepts.
export const withoutPilotKeys = settings => Object.fromEntries(Object.entries(settings).filter(([key]) => !PILOT_KEYS.includes(key)));

// The values a pull writes here: a pilot field the saved copy does not have at all keeps this
// computer's value (the copy was saved by an older Studio or before the server accepted it).
export function pulledSettings(local, remote = {}) {
  const incoming = syncedSettings(remote);
  for (const key of PILOT_KEYS) if (!Object.hasOwn(remote, key)) incoming[key] = syncedSettings(local)[key];
  return incoming;
}

const hasContent = settings => SYNCED_KEYS.some(key => settings[key]);

// Decides one sync step. `sync` is this computer's record of the last sync:
//   account   email of the account it synced with
//   remoteAt  the server's save time it last matched ('' if never)
//   editedAt  when shop details or branding were last changed here (ms; 0 if never)
//   syncedAt  when this computer last matched the server (ms)
// `remote` is the server's {settings, updated}, or null if the account has none yet.
// When both sides changed, the later change wins.
export function planSync({local, remote, sync, account}) {
  const sameAccount = sync.account === account;
  const remoteChanged = Boolean(remote) && (!sameAccount || remote.updated !== sync.remoteAt);
  // An edit in the same millisecond as the last sync counts as a change: at worst it is sent twice.
  const localChanged = sameAccount && sync.editedAt > 0 && sync.editedAt >= sync.syncedAt;
  if (remoteChanged && localChanged) return Date.parse(remote.updated) >= sync.editedAt ? 'pull' : 'push';
  if (remoteChanged) return 'pull';
  if (localChanged || (!remote && hasContent(local))) return 'push';
  return 'none';
}
