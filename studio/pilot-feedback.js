// Pilot feedback from inside Studio (decision 0019). It goes to the same support requests as the
// website's feedback page (decision 0009), through the account, so it needs no new server table:
// the category leads the title, and the context (screen, location, role, app version and, when the
// technician chooses, a diagnosis's report number) is a block at the end of the details.
// Customer details are never included: a diagnosis is referred to by its report number or id only.
export const FEEDBACK_CATEGORIES = {
  bug: {label: 'Bug', kind: 'bug'},
  workflow: {label: 'Workflow friction', kind: 'feature'},
  feature: {label: 'Feature request', kind: 'feature'},
  report: {label: 'Report issue', kind: 'bug'},
  training: {label: 'Training question', kind: 'feature'},
  urgent: {label: 'Urgent support', kind: 'bug'}
};
export const FEEDBACK_ROLES = ['Owner', 'Service manager', 'Technician', 'Reviewer'];
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

// {kind, title, details} for submit_support_request, or throws with what is missing.
export function buildFeedback({category, summary, details, screen = '', location = '', prefix = '', role = '', appVersion = '', diagnosis = null, call = null}) {
  const c = FEEDBACK_CATEGORIES[category];
  if (!c) throw new Error('Choose what kind of feedback this is.');
  const s = clean(summary, 90);
  if (s.length < 3) throw new Error('Give the feedback a short summary.');
  const body = clean(details, 4000);
  if (body.length < 10) throw new Error('Say a little more about what happened or what you need.');
  const phone = clean(call?.phone, 40);
  if (call?.wanted && !/\d{3}/.test(phone)) throw new Error('Enter the number to call back.');
  const context = [`Pilot feedback: ${c.label}`, screen && `Screen: ${clean(screen, 60)}`, location && `Location: ${clean(location, 80)}${prefix ? ` (${clean(prefix, 12)})` : ''}`,
    FEEDBACK_ROLES.includes(role) && `Role: ${role}`, appVersion && `EVCore Studio ${clean(appVersion, 20)}`,
    diagnosis && `Diagnosis: ${clean(diagnosis.reportNumber || `id ${diagnosis.id}`, 64)}`,
    call?.wanted && `Call back requested: ${phone}`].filter(Boolean);
  return {kind: c.kind, title: `[Pilot · ${c.label}] ${s}`.slice(0, 120), details: `${body}\n\n---\n${context.join('\n')}`.slice(0, 5000)};
}
