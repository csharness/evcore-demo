// Contact forms on demo.csharness.com (decision 0011). Each form[data-lead] sends its fields to
// submit_lead in the account service with the public key; staff read the leads and each new one
// is emailed to support@csharness.com. Without JavaScript the form stays hidden and the page shows
// the email address instead, so nothing typed can end up in a URL.
const SERVICE = 'https://ueywbfrhcbqugoajuinx.supabase.co';
const KEY = 'sb_publishable_-GTHFiy9E9cf8tC7yf0m-A_CBpfr3DO';
const FIELDS = ['name', 'company', 'email', 'phone', 'company_type', 'locations', 'message', 'website'];
const MESSAGES = {
  rate_limited: 'We already have your message. We will reply by email soon.',
  busy: 'Too many messages right now. Please email support@csharness.com instead.'
};

// Where the visitor came from: the outreach email's utm_source, else the page.
function source(form) {
  const utm = new URLSearchParams(location.search).get('utm_source') || '';
  return (/^[\w.-]{1,40}$/.test(utm) ? `${utm} · ` : '') + form.dataset.lead + '-page';
}

function show(form, text, tone) {
  const box = form.querySelector('.form-status');
  box.textContent = text;
  box.className = `form-status ${tone}`;
  box.hidden = false;
}

async function submit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const lead = {audience: form.dataset.lead, source: source(form)};
  for (const name of FIELDS) if (form.elements[name]) lead[name] = String(form.elements[name].value || '').trim();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  show(form, 'Sending…', '');
  try {
    const response = await fetch(`${SERVICE}/rest/v1/rpc/submit_lead`, {method: 'POST',
      headers: {apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json'}, body: JSON.stringify({p: lead})});
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const known = Object.keys(MESSAGES).find(key => String(error.message || '').includes(key));
      throw new Error(known ? MESSAGES[known] : 'Your message could not be sent. Check the fields, or email support@csharness.com.');
    }
    form.querySelector('.form-fields').hidden = true;
    show(form, form.dataset.thanks || 'Thank you. We will reply by email within one business day.', 'ok');
  } catch (error) {
    show(form, error.message === 'Failed to fetch' ? 'No connection. Try again, or email support@csharness.com.' : error.message, 'bad');
    button.disabled = false;
  }
}

for (const form of document.querySelectorAll('form[data-lead]')) {
  form.addEventListener('submit', submit);
  form.hidden = false;
  form.parentElement.querySelector('.form-fallback')?.remove();
}
