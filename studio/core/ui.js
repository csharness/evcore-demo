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

// Web preview and demo: there is no PDF printer, so the report opens in the browser's print
// window, where "Save as PDF" makes the file. The page's security policy blocks a document's own
// <style> and style="" markup, so the report's styles go in through the CSSOM, which it allows.
// The report's embedded font is blocked the same way and falls back to the system font.
export async function printReport(html, title) {
  const css = [];
  // Lift the CSS out before parsing: even an inert parsed <style> reports a policy violation.
  const source = new DOMParser().parseFromString(html.replace(/<style>([\s\S]*?)<\/style>/g, (_, text) => { css.push(text); return ''; }), 'text/html');
  for (const el of source.body.querySelectorAll('[style]')) { el.dataset.reportStyle = el.getAttribute('style'); el.removeAttribute('style'); }
  document.querySelector('iframe.report-print')?.remove();
  const frame = document.createElement('iframe');
  frame.className = 'report-print';
  frame.title = title; frame.tabIndex = -1; frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.append(frame);
  const win = frame.contentWindow, doc = frame.contentDocument;
  const sheet = new win.CSSStyleSheet();
  sheet.replaceSync(css.join('\n'));
  doc.adoptedStyleSheets = [sheet];
  doc.documentElement.lang = source.documentElement.lang || 'en';
  doc.title = title;
  doc.body.replaceChildren(...[...source.body.childNodes].map(node => doc.importNode(node, true)));
  for (const el of doc.querySelectorAll('[data-report-style]')) { el.style.cssText = el.dataset.reportStyle; delete el.dataset.reportStyle; }
  await Promise.all([...doc.images].map(img => img.decode().catch(() => {})));
  win.addEventListener('afterprint', () => frame.remove(), {once: true});
  win.focus();
  win.print();
  return {printed: true};
}

// What to tell the technician once a report is saved (desktop) or open in the print window (web).
export function reportSavedMessage(kind, result, note = '') {
  if (result?.printed) return `${kind} ready: choose "Save as PDF" in the print window to keep it.${note}`;
  return result?.saved ? `${kind} saved: ${result.path}.${note}` : '';
}

// Accessible modal dialog. Resolves with the id of the chosen button, or null when dismissed.
// With `collect(layer, choice)`, the dialog resolves {choice, data} with what it read from the
// dialog's fields before closing.
export function dialog({title, body = '', buttons = [{id: 'ok', label: 'OK', tone: 'primary'}], html = '', collect = null}) {
  return new Promise(resolve => {
    const layer = document.createElement('div');
    layer.className = 'modal-layer';
    layer.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <h2 id="modal-title">${esc(title)}</h2>${body ? `<p>${esc(body)}</p>` : ''}${html}
      <div class="actions modal-actions">${buttons.map(b => `<button data-modal="${esc(b.id)}" class="${esc(b.tone || '')}">${esc(b.label)}</button>`).join('')}</div></div>`;
    const previous = document.activeElement;
    const close = value => {
      const data = collect ? collect(layer, value) : undefined;
      layer.remove(); document.removeEventListener('keydown', onKey, true); previous?.focus?.();
      resolve(collect ? {choice: value, data} : value);
    };
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
