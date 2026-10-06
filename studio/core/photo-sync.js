// Photo files synced through the account (decision 0015, milestone T-2). Photo records travel with
// the other records (record-sync.js); this moves the image behind each one, so a photo taken on the
// phone shows on the PC and on its reports. Only the full photo travels; each device makes its own
// thumbnail and report copy. Runs after each record sync, on whichever device has the file:
//   - a photo here that the account does not have yet is sent;
//   - a photo record whose file is not here is fetched (it may not have arrived yet: tried again
//     on the next run);
//   - a photo deleted on any device has its file removed from the account and from here.
// db.photoFiles holds the ids whose file the account has. `photos` is the platform's photo bridge.
const PER_RUN = 25; // transfers per run, so one run never holds the next record sync for long

export async function syncPhotoFiles(db, photos) {
  const result = {sent: 0, fetched: 0, removed: 0, waiting: 0, arrived: []};
  if (!photos?.upload || !photos.download || !photos.missing) return result;
  const stop = outcome => !outcome.ok && !outcome.missing;
  let budget = PER_RUN, changed = false;

  // Deleted photos: their files leave the account and this device.
  const live = new Set(db.photos.map(p => p.id));
  for (const id of [...db.photoFiles]) {
    if (live.has(id)) continue;
    if (budget-- <= 0) break;
    const outcome = await photos.removeRemote(id);
    if (!outcome.ok) { if (changed) await db.savePhotoFiles(); return {...result, failed: outcome}; }
    await photos.remove(id);
    db.photoFiles.delete(id); changed = true; result.removed++;
  }

  const absent = new Set(await photos.missing(db.photos.map(p => p.id)));
  for (const photo of db.photos) {
    if (absent.has(photo.id)) {
      if (budget-- <= 0) { result.waiting++; continue; }
      const outcome = await photos.download(photo.id);
      if (outcome.ok) { db.photoFiles.add(photo.id); changed = true; result.fetched++; result.arrived.push(photo.id); }
      else if (outcome.missing) result.waiting++;
      else { if (changed) await db.savePhotoFiles(); return {...result, failed: outcome}; }
    } else if (!db.photoFiles.has(photo.id)) {
      if (budget-- <= 0) { result.waiting++; continue; }
      const outcome = await photos.upload(photo.id);
      if (stop(outcome)) { if (changed) await db.savePhotoFiles(); return {...result, failed: outcome}; }
      if (outcome.ok) { db.photoFiles.add(photo.id); changed = true; result.sent++; }
    }
  }
  if (changed) await db.savePhotoFiles();
  return result;
}
