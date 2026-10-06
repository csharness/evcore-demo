// Keeps this computer's shop details and report branding in step with the account (decision 0013).
// Runs when a license becomes valid (start, sign-in, the 6-hourly renewal) and after every change
// in Settings. Offline is normal: changes stay marked and go up on the next run.
import {SYNCED_KEYS, syncedSettings, pulledSettings, withoutPilotKeys, planSync} from '../settings-sync.js';

export function createSettingsSync({db, api = () => globalThis.evcore?.license, onPulled = () => {}}) {
  let running = null, again = false;

  async function mark(account, remoteAt, started) {
    await db.setSetting('syncAccount', account);
    await db.setSetting('syncRemoteAt', remoteAt);
    await db.setSetting('syncedAt', started); // when the copy that was sent or received was taken
  }

  async function step(account) {
    const service = api();
    if (!service?.shopSettings) return {state: 'unavailable'};
    const started = Date.now();
    const got = await service.shopSettings();
    if (!got.ok) return {state: got.offline ? 'offline' : got.unavailable ? 'unavailable' : 'error'};
    const s = db.settings;
    const action = planSync({local: syncedSettings(s), remote: got.remote, account,
      sync: {account: s.syncAccount, remoteAt: s.syncRemoteAt, editedAt: s.shopEditedAt, syncedAt: s.syncedAt}});
    if (action === 'pull') {
      const incoming = pulledSettings(s, got.remote.settings);
      const changed = SYNCED_KEYS.filter(key => s[key] !== incoming[key]);
      for (const key of changed) await db.setSetting(key, incoming[key]);
      await mark(account, got.remote.updated, started);
      if (changed.length) onPulled();
    } else if (action === 'push') {
      let saved = await service.saveShopSettings(syncedSettings(s));
      // A server without the pilot fields' migration rejects the whole save: save the rest.
      if (!saved.ok && !saved.offline) saved = await service.saveShopSettings(withoutPilotKeys(syncedSettings(s)));
      if (!saved.ok) return {state: saved.offline ? 'offline' : 'error'};
      await mark(account, saved.updated, started);
    } else if (s.syncAccount !== account) await mark(account, got.remote?.updated ?? '', started);
    return {state: 'synced', action, at: Date.now()};
  }

  // One sync at a time. A request that arrives during a sync runs once more after it, so a change
  // made while an upload is in flight is never lost.
  async function run(account) {
    if (!account) return {state: 'unavailable'};
    if (running) { again = true; return running; }
    running = (async () => {
      let result;
      do { again = false; result = await step(account); } while (again && result.state === 'synced');
      return result;
    })();
    try { return await running; } finally { running = null; }
  }

  // Shop details or branding changed on this computer.
  const edited = () => db.setSetting('shopEditedAt', Date.now());
  return {run, edited};
}
