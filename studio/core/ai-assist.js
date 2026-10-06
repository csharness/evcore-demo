// AI assist (decision 0016): suggestions from the account's ai-assist service, for the PC and the
// phone screens alike. Two tasks in the standard edition: marks and a caption for a work-order
// photo, and customer wording for a diagnosis's notes. Every suggestion is checked here, then
// shown to the technician, who keeps, edits or drops each one; nothing reaches a record or a
// report without that. Findings keep the status the technician gave them: the AI rewrites words,
// never certainty.
import {sanitizeMarks} from '../records.js';

const account = () => globalThis.evcore?.license;
const MAX = {caption: 200, complaint: 2000, recommendations: 4000, parts: 2000, finding: 500};
const clean = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// True when this app can ask for AI suggestions (a signed-in, licensed account is still needed).
export const aiAvailable = () => typeof account()?.aiAssist === 'function';

// What the technician is told when no suggestions came back.
export function aiMessage(result) {
  if (result?.quota) return `This month's ${result.limit} AI requests are used up. They renew on the 1st.`;
  if (result?.offline) return 'AI suggestions need an internet connection.';
  if (result?.ended) return 'Sign in again to use AI suggestions.';
  if (result?.no_license) return 'AI suggestions need an active Studio license.';
  if (result?.declined) return 'The AI could not help with this one. Add the details yourself.';
  if (result?.unavailable) return 'AI suggestions are not available right now. Try again later.';
  return 'The AI suggestions could not be fetched. Try again.';
}
const usage = result => (Number.isInteger(result.used) && Number.isInteger(result.limit) ? {used: result.used, limit: result.limit} : {});

// Marks and a caption for a photo. Resolves {ok, marks, caption, used, limit} or {ok: false, message}.
export async function suggestPhotoMarks(photo, vehicle = '') {
  if (!aiAvailable()) return {ok: false, message: 'AI suggestions work in the EVCore apps.'};
  const images = await globalThis.evcore.photos?.reportImages([photo.id]).catch(() => ({})) ?? {};
  const src = images[photo.id];
  if (!src) return {ok: false, message: 'The photo file is not on this device yet.'};
  const result = await account().aiAssist({task: 'photo', image: src.replace(/^data:image\/jpeg;base64,/, ''), caption: photo.caption || '', vehicle});
  if (!result?.ok) return {ok: false, message: aiMessage(result)};
  return {ok: true, marks: sanitizeMarks(result.suggestions?.marks).map(m => ({...m, ai: true})),
    caption: clean(result.suggestions?.caption, MAX.caption), ...usage(result)};
}

// Customer wording for a diagnosis. Resolves {ok, fields: {complaint, recommendations, parts,
// findings: [text]}, used, limit}, a suggestion only where the technician had written something;
// or {ok: false, message}.
// The findings the AI may reword: written ones, except a cause ruled out (decision 0019), which the
// account server does not take and which stays in the technician's words.
export const wordable = f => Boolean(f.text) && f.status !== 'ruled-out';

export async function suggestWording(diagnosis, vehicle = '') {
  if (!aiAvailable()) return {ok: false, message: 'AI suggestions work in the EVCore apps.'};
  const findings = diagnosis.findings.filter(wordable).map(f => ({text: f.text, status: f.status}));
  const fields = {complaint: diagnosis.complaint || '', recommendations: diagnosis.recommendations || '', parts: diagnosis.parts || '', findings};
  if (!fields.complaint && !fields.recommendations && !fields.parts && !findings.length) return {ok: false, message: 'Write the complaint, a finding or the recommended work first.'};
  const result = await account().aiAssist({task: 'wording', fields, vehicle});
  if (!result?.ok) return {ok: false, message: aiMessage(result)};
  const s = result.suggestions ?? {};
  const keep = (name, max) => (fields[name] ? clean(s[name], max) : '');
  return {ok: true, ...usage(result), fields: {complaint: keep('complaint', MAX.complaint), recommendations: keep('recommendations', MAX.recommendations),
    parts: keep('parts', MAX.parts), findings: findings.map((_, i) => clean(Array.isArray(s.findings) ? s.findings[i] : '', MAX.finding))}};
}

// Applies the wording the technician accepted: `accepted` is {complaint, recommendations, parts,
// findings: [text or '']} with '' meaning "keep mine". Findings are matched in the order they were
// sent (those with text), and keep their status and how they were confirmed.
export function applyWording(diagnosis, accepted) {
  let n = 0;
  const findings = diagnosis.findings.map(f => {
    if (!wordable(f)) return f;
    const text = accepted.findings?.[n++];
    return text ? {...f, text} : f;
  });
  const pick = name => accepted[name] || diagnosis[name];
  return {complaint: pick('complaint'), recommendations: pick('recommendations'), parts: pick('parts'), findings};
}
