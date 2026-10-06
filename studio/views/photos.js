// Work-order photos (decision 0014): the technician scans a QR code with their phone, takes photos,
// and they appear here, saved with the work order on this computer. Each photo can carry a caption
// and be left off the customer report. The panel refreshes in place, so photos arriving while a
// diagnosis is being typed never disturb the form around it.
import {esc, dialog, confirmAction} from '../core/ui.js';
import {icon} from '../core/icons.js';
import {drawMarks, canDrawMarks} from '../core/annotate.js';
import {aiAvailable} from '../core/ai-assist.js';
import {reviewPhotoMarks} from './ai-review.js';

const thumbs = new Map(); // photo id -> data address ('' while loading, MISSING when the file is not here)
const MISSING = 'missing';
const api = () => globalThis.evcore?.photos;

export function photoPanel(ctx, jobId) {
  const job = jobId && jobId !== 'new' ? ctx.db.job(jobId) : null;
  if (!job) return `<section class="panel" data-photo-panel=""><header class="panelhead"><h2>Photos</h2></header>
    <p class="muted">Link this diagnosis to a work order and save it, then add photos from your phone.</p></section>`;
  const photos = ctx.db.photosOf(job.id);
  const missing = photos.filter(p => !thumbs.has(p.id));
  if (missing.length) queueMicrotask(() => loadThumbs(ctx, missing.map(p => p.id)));
  const onReport = photos.filter(p => p.inReport).length;
  return `<section class="panel" data-photo-panel="${esc(job.id)}"><header class="panelhead"><h2>Photos</h2>
    <span class="sub">${photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'} · ${onReport} on the customer report` : 'Before-and-after shots, damage, labels and connectors'}</span><div class="spacer"></div>
    ${api()?.capture ? `<button type="button" class="primary small" data-action="photos-capture" data-job="${esc(job.id)}">${icon('plus')}Take photo</button>`
      : `<button type="button" class="primary small" data-action="photos-phone" data-job="${esc(job.id)}" ${api() ? '' : 'disabled title="Photos work in the desktop app"'}>${icon('plus')}Add photos from phone</button>`}</header>
    ${photos.length ? `<div class="photogrid">${photos.map((p, i) => `<figure class="photo">
      ${thumbs.get(p.id) === MISSING ? `<div class="photo-missing">${ctx.db.settings.recordSyncOn ? 'On its way from the device that took it' : 'The photo file is not on this computer'}</div>`
        : thumbs.get(p.id) ? `<img src="${esc(thumbs.get(p.id))}" alt="Photo ${i + 1}${p.caption ? `: ${esc(p.caption)}` : ''}">` : '<div class="photo-loading" aria-label="Loading photo"></div>'}
      <figcaption><input data-change="photo-caption" data-id="${esc(p.id)}" value="${esc(p.caption)}" maxlength="200" placeholder="Caption (shown on the report)" aria-label="Caption for photo ${i + 1}">
        <div class="photo-actions"><label class="photo-check"><input type="checkbox" data-change="photo-report" data-id="${esc(p.id)}" ${p.inReport ? 'checked' : ''}> On report</label>
        ${p.marks.length ? `<span class="muted small">${p.marks.length} mark${p.marks.length === 1 ? '' : 's'}</span>` : ''}<div class="spacer"></div>
        ${aiAvailable() && thumbs.get(p.id) && thumbs.get(p.id) !== MISSING ? `<button type="button" class="iconbtn" data-action="photo-ai" data-id="${esc(p.id)}" title="Suggest marks with AI" aria-label="Suggest marks for photo ${i + 1} with AI">${icon('spark')}</button>` : ''}
        <button type="button" class="iconbtn" data-action="photo-delete" data-id="${esc(p.id)}" aria-label="Delete photo ${i + 1}">${icon('trash')}</button></div></figcaption></figure>`).join('')}</div>`
      : `<div class="empty">${api()?.capture ? 'No photos yet. Use <b>Take photo</b>.' : 'No photos yet. Use <b>Add photos from phone</b> and scan the code with the phone\'s camera.'}</div>`}</section>`;
}

// Re-draws every photo panel on screen without re-rendering the page around it.
function refreshPanels(ctx) {
  for (const el of document.querySelectorAll('[data-photo-panel]')) {
    const holder = document.createElement('div');
    holder.innerHTML = photoPanel(ctx, el.dataset.photoPanel);
    el.replaceWith(holder.firstElementChild);
  }
}

async function loadThumbs(ctx, ids) {
  for (const id of ids) thumbs.set(id, '');
  await Promise.all(ids.map(async id => { thumbs.set(id, (await api()?.thumb(id)) || MISSING); }));
  refreshPanels(ctx);
}

// Photo files that just arrived through the account (core/photo-sync.js): shown in place.
export function photoFilesArrived(ctx, ids) {
  for (const id of ids) thumbs.delete(id);
  refreshPanels(ctx);
}

// Photo files for a report: the report-size copy of each photo marked for the report, in order.
// A photo whose file is not on this device yet is fetched through the account first, when sync is
// on; any still missing are left out and counted in `missing`.
export async function reportPhotos(db, jobId) {
  const chosen = jobId ? db.photosOf(jobId).filter(p => p.inReport) : [];
  if (!chosen.length || !api()) return Object.assign([], {missing: 0});
  let images = await api().reportImages(chosen.map(p => p.id));
  const absent = chosen.filter(p => !images[p.id]);
  if (absent.length && db.settings.recordSyncOn && api().download) {
    const fetched = await Promise.all(absent.map(p => api().download(p.id).then(r => r.ok, () => false)));
    if (fetched.some(Boolean)) images = await api().reportImages(chosen.map(p => p.id));
  }
  const shown = [];
  for (const p of chosen.filter(p => images[p.id])) {
    // Marks are drawn into the report copy, numbered to match the list under it (decision 0016).
    let src = images[p.id];
    if (p.marks.length && canDrawMarks()) src = await drawMarks(src, p.marks).catch(() => src);
    shown.push({src, caption: p.caption, marks: p.marks.length && src !== images[p.id] ? p.marks.map(m => m.label) : []});
  }
  return Object.assign(shown, {missing: chosen.length - shown.length});
}

// Said after a report is saved when photos marked for it could not be included.
export const missingPhotosNote = count => count
  ? ` ${count} photo${count === 1 ? ' was' : 's were'} left out: ${count === 1 ? 'its file is' : 'their files are'} not on this device yet.` : '';

// Photos arriving from the phone are added to the records as they come in.
export function listenForPhotos(ctx) {
  api()?.onReceived(async photo => {
    try { await ctx.db.add('photos', photo); } catch (error) { ctx.toast(error.message); return; }
    const counter = document.querySelector('#phone-count');
    if (counter) counter.textContent = String(Number(counter.textContent || 0) + 1);
    refreshPanels(ctx);
  });
  api()?.onSessionEnded(() => {
    const note = document.querySelector('#phone-note');
    if (note) note.textContent = 'This link ended after 30 minutes without a photo. Close this window and open a new one to add more.';
  });
}

export const photoHandlers = {
  actions: {
    // Phone and tablet app (decision 0015): the camera is on this device.
    async 'photos-capture'(el, ctx) {
      try { await api().capture(el.dataset.job); } catch (error) { ctx.toast(error.message || 'The photo could not be taken.'); }
    },
    async 'photos-phone'(el, ctx) {
      const job = ctx.db.job(el.dataset.job);
      if (!job || !api()) return;
      let link;
      try { link = await api().start(job.id, `${job.title} · ${job.vehicle}`); } catch (error) { ctx.toast(error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); return; }
      await dialog({title: `Photos for ${job.title}`, buttons: [{id: 'done', label: 'Done', tone: 'primary'}],
        html: `<div class="phone-pair"><img class="phone-qr" src="${esc(link.qr)}" alt="QR code for the photo page">
          <div><ol class="phone-steps"><li>Connect the phone to the <b>same Wi-Fi</b> as this computer.</li><li>Open the phone's camera and point it at the code.</li>
          <li>Tap the link, then <b>Take a photo</b>. Each photo appears here as it arrives.</li></ol>
          <p class="phone-received">Photos received: <b id="phone-count">0</b></p>
          <p class="muted small">Not opening? Type this into the phone's browser: <span class="mono">${esc(link.url)}</span>${link.others.length ? `, or try ${link.others.map(u => `<span class="mono">${esc(u)}</span>`).join(', ')}` : ''}.
          If Windows asks whether EVCore Studio may use the network, allow it on private networks.</p>
          <p class="muted small" id="phone-note">The link works while this window is open.</p></div></div>`});
      await api().stop();
    },
    // AI marks (decision 0016): suggestions the technician reviews before anything is saved.
    async 'photo-ai'(el, ctx) {
      const photo = ctx.db.photos.find(p => p.id === el.dataset.id);
      if (!photo) return;
      const {job, vehicle} = ctx.db.context(photo.jobId);
      el.disabled = true;
      try {
        const change = await reviewPhotoMarks(photo, {vehicle: vehicle?.name || job?.vehicle || '', toast: ctx.toast});
        if (!change) return;
        await ctx.db.update('photos', photo.id, change);
        ctx.toast(change.marks.length ? `${change.marks.length} mark${change.marks.length === 1 ? '' : 's'} saved; they show on the report.` : 'Marks removed.');
      } finally { el.disabled = false; refreshPanels(ctx); }
    },
    async 'photo-delete'(el, ctx) {
      if (!await confirmAction('Delete this photo?', 'It is removed from this computer and from future reports. Reports already saved keep it.', 'Delete', 'danger')) return;
      await ctx.db.remove('photos', el.dataset.id);
      await api()?.remove(el.dataset.id);
      thumbs.delete(el.dataset.id);
      refreshPanels(ctx);
    }
  },
  changes: {
    async 'photo-caption'(el, ctx) { await ctx.db.update('photos', el.dataset.id, {caption: el.value}); },
    async 'photo-report'(el, ctx) { await ctx.db.update('photos', el.dataset.id, {inReport: el.checked}); refreshPanels(ctx); }
  }
};
