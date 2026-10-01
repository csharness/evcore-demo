// Shared rendering helpers. Every value placed into HTML goes through esc().
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const $ = selector => document.querySelector(selector);
export const badge = (text, tone = '') => `<span class="badge ${tone}">${esc(text)}</span>`;
export const time = t => new Date(t).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'});
export const dateTime = t => new Date(t).toLocaleString([], {year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
export const date = t => new Date(t).toLocaleDateString([], {year: 'numeric', month: 'short', day: 'numeric'});
export const resultTone = result => result === 'FAIL' ? 'amber' : result === 'UNKNOWN' ? 'gray' : '';

export function relative(t) {
  const minutes = Math.round((Date.now() - t) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

let toastTimer;
export function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 4500);
}

export function download(name, data, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], {type}));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Accessible modal dialog. Resolves with the id of the chosen button, or null when dismissed.
export function dialog({title, body = '', buttons = [{id: 'ok', label: 'OK', tone: 'primary'}], html = ''}) {
  return new Promise(resolve => {
    const layer = document.createElement('div');
    layer.className = 'modal-layer';
    layer.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <h2 id="modal-title">${esc(title)}</h2>${body ? `<p>${esc(body)}</p>` : ''}${html}
      <div class="actions modal-actions">${buttons.map(b => `<button data-modal="${esc(b.id)}" class="${esc(b.tone || '')}">${esc(b.label)}</button>`).join('')}</div></div>`;
    const previous = document.activeElement;
    const close = value => { layer.remove(); document.removeEventListener('keydown', onKey, true); previous?.focus?.(); resolve(value); };
    const onKey = event => { if (event.key === 'Escape') { event.stopPropagation(); close(null); } };
    layer.addEventListener('click', event => {
      const button = event.target.closest('[data-modal]');
      if (button) close(button.dataset.modal);
      else if (event.target === layer) close(null);
    });
    document.addEventListener('keydown', onKey, true);
    document.body.append(layer);
    (layer.querySelector('.primary') || layer.querySelector('button'))?.focus();
  });
}

export const confirmAction = (title, body, confirmLabel = 'Continue', tone = 'primary') =>
  dialog({title, body, buttons: [{id: 'cancel', label: 'Cancel'}, {id: 'confirm', label: confirmLabel, tone}]}).then(choice => choice === 'confirm');
