// Pilot feedback dialog (decision 0019): from Help, or from a diagnosis with its report number.
// Sent through the account as a support request; nothing is promised about when it is answered.
import {esc, dialog} from '../core/ui.js';
import {FEEDBACK_CATEGORIES, FEEDBACK_ROLES, buildFeedback} from '../pilot-feedback.js';

const api = () => globalThis.evcore?.license;
export const feedbackAvailable = () => Boolean(api()?.supportRequest);

export async function openPilotFeedback(ctx, {screen = '', diagnosis = null} = {}) {
  if (!feedbackAvailable()) { ctx.toast('Send feedback from EVCore Studio on the PC, or on csharness.com/pages/feedback.'); return; }
  const ref = diagnosis ? esc(diagnosis.reportNumber || 'this draft') : '';
  const answer = await dialog({title: 'Send pilot feedback',
    body: 'It goes to CS Harness with your account email, so we can reply. Customer names and contact details are never included.',
    html: `<div class="formgrid two">
      <label class="field">Kind<select name="category">${Object.entries(FEEDBACK_CATEGORIES).map(([id, c]) => `<option value="${id}">${esc(c.label)}</option>`).join('')}</select></label>
      <label class="field">Your role<select name="role"><option value="">—</option>${FEEDBACK_ROLES.map(r => `<option>${esc(r)}</option>`).join('')}</select></label></div>
      <label class="field">Summary<input name="summary" maxlength="90" placeholder="One line"></label>
      <label class="field">What happened, or what you need<textarea name="details" maxlength="4000" rows="5"></textarea></label>
      ${diagnosis ? `<label class="check"><input type="checkbox" name="withDiagnosis" checked> Refer to diagnosis ${ref} (its number only)</label>` : ''}
      <label class="check"><input type="checkbox" name="call"> Ask for a call back</label>
      <label class="field">Number to call<input name="phone" maxlength="40" inputmode="tel"></label>`,
    buttons: [{id: 'cancel', label: 'Cancel'}, {id: 'send', label: 'Send', tone: 'primary'}],
    collect: layer => Object.fromEntries(['category', 'role', 'summary', 'details', 'phone'].map(name => [name, layer.querySelector(`[name="${name}"]`)?.value ?? ''])
      .concat([['call', Boolean(layer.querySelector('[name="call"]')?.checked)], ['withDiagnosis', Boolean(layer.querySelector('[name="withDiagnosis"]')?.checked)]]))});
  if (answer?.choice !== 'send') return;
  const a = answer.data;
  let request;
  try {
    request = buildFeedback({category: a.category, summary: a.summary, details: a.details, screen, role: a.role, location: ctx.db.settings.shopName,
      prefix: ctx.db.settings.reportPrefix, appVersion: ctx.about?.version, diagnosis: a.withDiagnosis ? diagnosis : null, call: {wanted: a.call, phone: a.phone}});
  } catch (e) { ctx.toast(e.message); return; }
  const result = await api().supportRequest({...request, ...(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ctx.about?.version ?? '') ? {appVersion: ctx.about.version} : {})});
  ctx.toast(result?.ok ? 'Feedback sent. CS Harness replies to your account email.'
    : result?.offline ? 'Not sent: Studio is offline. Try again when it is online.'
      : result?.message || 'Not sent. Sign in, or use csharness.com/pages/feedback.');
}
