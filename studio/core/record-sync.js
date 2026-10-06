// Shop records synced through the account (decisions 0015 and 0017): customers, vehicles, work
// orders, diagnoses, test reports and photo records, so every device signed in to the shop's
// account has the same jobs.
//
// - The switch belongs to the account. Once someone turns sync on, every device signed in to the
//   account syncs, including new installs; turning it off stops every device. A device that has
//   never synced joins: the account's records come down and the device's own records go up.
// - The server orders changes. Each change goes up with the account version it started from; if
//   another device got there first, the server answers with its copy and the two edits are merged
//   field by field (core/merge.js), then sent again. Device clocks decide nothing.
// - Each run fetches what other devices changed, merging into any change still waiting here, then
//   sends this device's changes, then moves photo files (core/photo-sync.js).
// Offline is normal: changes wait in db.outbox for the next run.
import {SYNCED_COLLECTIONS} from './data.js';
import {mergeRecord} from './merge.js';
import {syncPhotoFiles} from './photo-sync.js';

// Each run re-reads the last few seconds of the server's change list, because a change can be
// committed a moment after a later one; applying a record twice is harmless.
const OVERLAP_MS = 10000;
const MAX_PUSH = 200, MAX_PUSH_CHARS = 3 * 1024 * 1024, PUSH_ROUNDS = 4;
const SWITCH_CHECK_MS = 15000;

// `photos` is the platform's photo bridge; onPhotos(ids) is told which photo files just arrived.
export function createRecordSync({db, api = () => globalThis.evcore?.license, photos = () => globalThis.evcore?.photos, onPulled = () => {},
  onPhotos = () => {}, now = () => Date.now()}) {
  let running = null, again = false, switchCheckedAt = 0;
  const failure = result => ({state: result.offline ? 'offline' : result.ended ? 'ended' : 'error', message: result.message || ''});
  const keyOf = (collection, id) => `${collection}/${id}`;
  const split = key => [key.slice(0, key.indexOf('/')), key.slice(key.indexOf('/') + 1)];

  // Applies one record from the account here, merging it into a change still waiting to go up.
  // `changedAt` is when the account's copy was written (from a pull), for the one case without a
  // base: a change left waiting by a version before 0017, which follows the old rule (later wins).
  async function receive(collection, id, remote, version, changedAt = null) {
    const key = keyOf(collection, id), pending = db.outbox.get(key);
    db.versions.set(key, version);
    if (!pending) { await db.applyRemote([{collection, id, data: remote}]); return 1; }
    const local = db.find(collection, id);
    if (remote === null) {
      // Deleted on the account: the deletion wins over an edit waiting here.
      db.outbox.delete(key);
      await db.applyRemote([{collection, id, data: null}]);
      return 1;
    }
    if (local && !pending.base && changedAt && Date.parse(changedAt) > pending.changed) {
      // An old waiting change that the account's later copy replaces.
      db.outbox.delete(key);
      await db.applyRemote([{collection, id, data: remote}]);
      return 1;
    }
    if (local && pending.base) await db.applyRemote([{collection, id, data: mergeRecord(pending.base.data, local, remote)}]);
    // Still waiting to go up, now on top of the account's latest copy.
    pending.base = {version, data: remote};
    return 1;
  }

  async function pull(service) {
    const s = db.settings;
    const serverKeys = new Set();
    let cursor = s.recordSyncAt, changed = 0;
    let position = cursor ? {synced: new Date(Math.max(0, Date.parse(cursor) - OVERLAP_MS)).toISOString()} : {};
    for (;;) {
      const page = await service.pullRecords(position);
      if (!page.ok) return page;
      for (const row of page.records) {
        if (!SYNCED_COLLECTIONS.includes(row?.collection) || typeof row.id !== 'string' || typeof row.synced !== 'string' || !Number.isInteger(row.version)) continue;
        const key = keyOf(row.collection, row.id);
        serverKeys.add(key);
        if (db.versions.get(key) === row.version && !db.outbox.has(key)) continue; // already have this version
        changed += await receive(row.collection, row.id, row.deleted ? null : row.data, row.version, typeof row.changed === 'string' ? row.changed : null);
      }
      const last = page.records.at(-1);
      if (last) {
        position = {synced: last.synced, collection: last.collection, id: last.id};
        if (!cursor || Date.parse(last.synced) >= Date.parse(cursor)) cursor = last.synced;
      }
      if (!page.more || !last) break;
    }
    if (cursor !== s.recordSyncAt) await db.setSetting('recordSyncAt', cursor);
    // Joining the account: everything this device has that the account does not goes up.
    if (s.recordSyncInitial) {
      for (const name of SYNCED_COLLECTIONS) for (const record of db[name]) {
        const key = keyOf(name, record.id);
        if (!serverKeys.has(key) && !db.outbox.has(key)) db.outbox.set(key, {changed: db.stamp(), base: null});
      }
      await db.setSetting('recordSyncInitial', false);
    }
    await db.saveOutbox(); await db.saveVersions();
    return {ok: true, changed};
  }

  async function push(service) {
    let sent = 0, merged = 0;
    for (let round = 0; round < PUSH_ROUNDS && db.outbox.size; round++) {
      let conflicts = 0;
      const entries = [...db.outbox];
      for (let i = 0; i < entries.length;) {
        const batch = [];
        let size = 0;
        for (; i < entries.length && batch.length < MAX_PUSH; i++) {
          const [key, entry] = entries[i];
          const [collection, id] = split(key);
          const record = db.find(collection, id);
          const expected = entry.base ? entry.base.version : db.versions.get(key) ?? 0;
          const change = {collection, id, data: record ?? null, deleted: !record, expected};
          const chars = JSON.stringify(change).length;
          if (batch.length && size + chars > MAX_PUSH_CHARS) break;
          batch.push({key, entry, changed: entry.changed, change}); size += chars;
        }
        const result = await service.pushRecordsV2(batch.map(b => b.change));
        if (!result.ok) { await db.saveOutbox(); await db.saveVersions(); return result; }
        for (const [n, {key, entry, changed, change}] of batch.entries()) {
          const answer = result.results[n];
          if (answer?.status === 'ok' && Number.isInteger(answer.version)) {
            db.versions.set(key, answer.version);
            // A change made here while this was on its way stays waiting, based on what was sent.
            if (db.outbox.get(key) === entry && entry.changed === changed) db.outbox.delete(key);
            else entry.base = {version: answer.version, data: change.data};
            sent++;
          } else if (answer?.status === 'conflict' && Number.isInteger(answer.current?.version)) {
            // Another device got there first: merge its copy in and send again next round.
            const [collection, id] = split(key);
            await receive(collection, id, answer.current.deleted ? null : answer.current.data, answer.current.version);
            conflicts++; merged++;
          } else {
            await db.saveOutbox(); await db.saveVersions();
            return {ok: false, error: true, message: 'The account service gave an answer Studio did not expect.'};
          }
        }
      }
      if (!conflicts) break;
    }
    await db.saveOutbox(); await db.saveVersions();
    return {ok: true, sent, merged};
  }

  // The account's switch, checked at most every 15 seconds. Offline, the last known state holds.
  async function accountSwitch(service, force) {
    if (!force && now() - switchCheckedAt < SWITCH_CHECK_MS) return {ok: true, on: db.settings.recordSyncOn};
    const answer = await service.syncState();
    if (!answer.ok) return answer.offline ? {ok: true, on: db.settings.recordSyncOn, offline: true} : answer;
    switchCheckedAt = now();
    return answer;
  }

  const hasRecords = () => SYNCED_COLLECTIONS.some(name => db[name].length);

  async function step(account, force) {
    const service = api();
    if (!service?.syncState || !service.pushRecordsV2) return {state: 'unavailable'};
    const s = db.settings;
    const sw = await accountSwitch(service, force);
    if (!sw.ok) return failure(sw);
    if (!sw.on) {
      if (s.recordSyncOn) await db.setSetting('recordSyncOn', false);
      if (db.outbox.size) { db.outbox.clear(); await db.saveOutbox(); }
      return {state: 'off'};
    }
    if (s.recordSyncAccount !== account) {
      // This device last synced with another account: its records belong to that shop. They are
      // replaced only when the technician says so (useAccount), never mixed in.
      if (s.recordSyncAccount && hasRecords()) return {state: 'other_account', previous: s.recordSyncAccount};
      await join(account, true);
    }
    // Sync was off here (turned off for the account, or never on): rejoin, so records made
    // meanwhile go up and everything else is checked against the account.
    else if (!s.recordSyncOn) await join(account, true);
    // A device that synced before versions existed fetches everything once to learn them.
    if (!db.versions.size && s.recordSyncAt) await db.setSetting('recordSyncAt', '');
    const pulled = await pull(service);
    if (!pulled.ok) return failure(pulled);
    if (pulled.changed) onPulled(pulled.changed);
    const pushed = await push(service);
    if (!pushed.ok) return failure(pushed);
    if (pushed.merged) onPulled(pushed.merged);
    // Photo files follow their records (T-2); a photo problem does not hide that records synced.
    const files = await syncPhotoFiles(db, photos());
    if (files.arrived.length) onPhotos(files.arrived);
    return {state: 'synced', at: now(), pulled: pulled.changed, pushed: pushed.sent, pending: db.outbox.size,
      photosSent: files.sent, photosFetched: files.fetched, photosWaiting: files.waiting, photoProblem: files.failed ? failure(files.failed).state : null};
  }

  // A device joining the account: its records go up (upload) or it starts empty.
  async function join(account, upload) {
    for (const [key, value] of Object.entries({recordSyncAccount: account, recordSyncAt: '', recordSyncInitial: upload, recordSyncOn: true}))
      await db.setSetting(key, value);
    db.versions.clear(); await db.saveVersions();
    db.outbox.clear(); await db.saveOutbox();
    db.photoFiles.clear(); await db.savePhotoFiles(); // the account may not have them: each photo is checked again
  }

  // One run at a time; a request during a run runs once more after it.
  async function run(account, {force = false} = {}) {
    if (!account) return {state: 'unavailable'};
    if (running) { again = true; return running; }
    running = (async () => {
      let result;
      do { again = false; result = await step(account, force); force = false; } while (again && result.state === 'synced');
      return result;
    })();
    try { return await running; } finally { running = null; }
  }

  return {
    run,
    // Turns sync on for the whole account, then runs the first sync on this device.
    async enable(account) {
      const service = api();
      const answer = await service?.setSyncState?.(true);
      if (!answer?.ok) return failure(answer ?? {error: true});
      switchCheckedAt = 0;
      return run(account, {force: true});
    },
    // Turns sync off for the whole account. Every device keeps its records; nothing more is sent.
    async disable() {
      const answer = await api()?.setSyncState?.(false);
      if (!answer?.ok) return failure(answer ?? {error: true});
      await db.setSetting('recordSyncOn', false);
      db.outbox.clear(); await db.saveOutbox();
      return {state: 'off'};
    },
    // On a device that last synced with another account: removes that shop's records from this
    // device and takes this account's (they stay safe on the other account).
    async useAccount(account) {
      for (const name of SYNCED_COLLECTIONS) {
        const ids = db[name].map(r => r.id);
        if (ids.length) await db.applyRemote(ids.map(id => ({collection: name, id, data: null})));
      }
      await join(account, false);
      return run(account, {force: true});
    }
  };
}
