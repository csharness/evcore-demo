// AI suggestions reviewed by the technician (decision 0016), on the PC and the phone alike. Each
// suggestion starts unticked: the technician keeps what they can see or stand behind, can change
// its words, and drops the rest. Only kept suggestions are saved, and only they reach a report.
import {esc, dialog} from '../core/ui.js';
import {suggestPhotoMarks, suggestWording, applyWording, wordable} from '../core/ai-assist.js';
import {drawMarks, canDrawMarks} from '../core/annotate.js';

const usageLine = s => (s.limit ? `<p class="muted small">${esc(s.used)} of ${esc(s.limit)} AI requests used this month.</p>` : '');
const FINDING = {observed: 'Observed', suspected: 'Suspected', confirmed: 'Confirmed', 'ruled-out': 'Ruled out'};

// Asks for marks on a photo and lets the technician choose. Resolves the photo fields to save
// ({marks, caption?}), or null when nothing changes; `toast` reports problems.
export async function reviewPhotoMarks(photo, {vehicle = '', toast}) {
  toast('Looking at the photo…');
  const s = await suggestPhotoMarks(photo, vehicle);
  if (!s.ok) { toast(s.message); return null; }
  if (!s.marks.length && !s.caption) { toast('The AI found nothing to mark in this photo.'); return null; }
  const kept = photo.marks.length, all = [...photo.marks, ...s.marks];
  const src = (await globalThis.evcore.photos.reportImages([photo.id]))[photo.id];
  const preview = canDrawMarks() ? await drawMarks(src, all, i => ({dashed: i >= kept})).catch(() => src) : src;
  const {choice, data} = await dialog({title: 'Marks on this photo', buttons: [{id: 'cancel', label: 'Cancel'}, {id: 'save', label: 'Save', tone: 'primary'}],
    html: `<div class="ai-review"><img class="ai-preview" src="${esc(preview)}" alt="The photo with numbered marks">
      <p class="muted small">AI suggestions have dashed boxes. Keep only what you can see in the photo yourself. You can change the words.</p>
      <ol class="ai-list">${all.map((m, i) => `<li><b class="ai-num">${i + 1}</b><label class="photo-check"><input type="checkbox" data-keep="${i}" ${i < kept ? 'checked' : ''}> ${i < kept ? 'Keep' : 'Add'}</label>
        <input data-label="${i}" value="${esc(m.label)}" maxlength="80" aria-label="Words for mark ${i + 1}"></li>`).join('')}</ol>
      ${s.caption ? `<div class="ai-field"><label class="photo-check"><input type="checkbox" data-use-caption> Use as caption</label>
        <input data-caption value="${esc(s.caption)}" maxlength="200" aria-label="Suggested caption">${photo.caption ? `<p class="muted small">Now: ${esc(photo.caption)}</p>` : ''}</div>` : ''}
      ${usageLine(s)}</div>`,
    collect: layer => ({
      marks: all.map((m, i) => (layer.querySelector(`[data-keep="${i}"]`)?.checked ? {...m, label: layer.querySelector(`[data-label="${i}"]`).value.trim() || m.label} : null)).filter(Boolean),
      caption: layer.querySelector('[data-use-caption]')?.checked ? layer.querySelector('[data-caption]').value.trim() : null
    })});
  if (choice !== 'save') return null;
  return {marks: data.marks, ...(data.caption ? {caption: data.caption} : {})};
}

// Asks for customer wording of a diagnosis and lets the technician choose field by field.
// Resolves {complaint, recommendations, parts, findings} to put into the diagnosis, or null.
export async function reviewWording(diagnosis, {vehicle = '', toast}) {
  toast('Writing customer wording…');
  const s = await suggestWording(diagnosis, vehicle);
  if (!s.ok) { toast(s.message); return null; }
  const written = diagnosis.findings.filter(wordable);
  const rows = [
    ...['complaint', 'recommendations', 'parts'].map(name => ({key: name, title: {complaint: 'Customer complaint', recommendations: 'Recommended work', parts: 'Parts'}[name],
      mine: diagnosis[name], suggestion: s.fields[name]})),
    ...written.map((f, i) => ({key: `finding-${i}`, title: `Finding ${i + 1} (${FINDING[f.status]}, stays ${FINDING[f.status].toLowerCase()})`, mine: f.text, suggestion: s.fields.findings[i]}))
  ].filter(r => r.mine && r.suggestion && r.suggestion !== r.mine);
  if (!rows.length) { toast('The AI had no changes to suggest.'); return null; }
  const {choice, data} = await dialog({title: 'Customer wording', buttons: [{id: 'cancel', label: 'Cancel'}, {id: 'use', label: 'Use ticked wording', tone: 'primary'}],
    html: `<div class="ai-review"><p class="muted small">Check each suggestion says only what you found. Tick the ones to use; you can edit them first.</p>
      ${rows.map(r => `<div class="ai-field"><label class="photo-check"><input type="checkbox" data-use="${esc(r.key)}"> ${esc(r.title)}</label>
        <textarea data-text="${esc(r.key)}" rows="3" maxlength="${r.key === 'recommendations' ? 4000 : r.key.startsWith('finding') ? 500 : 2000}">${esc(r.suggestion)}</textarea>
        <p class="muted small">Yours: ${esc(r.mine)}</p></div>`).join('')}
      ${usageLine(s)}</div>`,
    collect: layer => Object.fromEntries(rows.map(r => [r.key, layer.querySelector(`[data-use="${r.key}"]`)?.checked ? layer.querySelector(`[data-text="${r.key}"]`).value.trim() : '']))});
  if (choice !== 'use' || !Object.values(data).some(Boolean)) return null;
  return applyWording(diagnosis, {complaint: data.complaint, recommendations: data.recommendations, parts: data.parts,
    findings: written.map((_, i) => data[`finding-${i}`] || '')});
}
