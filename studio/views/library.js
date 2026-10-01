// Vehicle library: the knowledge database shipped with this Studio version (decision 0007,
// public/knowledge.js, generated from knowledge/). Vehicles, components, connectors, communication
// protocols and error-code lists, each with how well it is established. Available in both editions.
import {esc} from '../core/ui.js';
import {KNOWLEDGE} from '../knowledge.js';

const SECTIONS = [['vehicles', 'Vehicles', 'vehicle'], ['components', 'Components', 'component'], ['protocols', 'Communication protocols', 'protocol'],
  ['fault_codes', 'Error code lists', 'fault-codes'], ['connectors', 'Connectors', 'connector']];
const TONE = {validated: 'ok', verified: 'ok', high: 'ok', reviewed: '', observed: '', medium: '', draft: 'warn', hypothesis: 'warn', low: 'warn', unverified: 'warn'};
const tag = value => value ? `<span class="tag ${TONE[value] ?? ''}">${esc(value)}</span>` : '';
const words = text => String(text ?? '').toLowerCase();

function haystack(e) {
  return [e.id, e.title, e.make, e.model, e.manufacturer, e.family, e.vendor, e.type, e.category, e.transport, ...(e.aliases || []),
    ...(e.codes || []).flatMap(c => [c.code, c.title]), ...(e.messages || []).flatMap(m => [m.id, m.name])].map(words).join(' ');
}

export function searchLibrary(k, query) {
  const terms = words(query).split(/\s+/).filter(Boolean);
  return SECTIONS.flatMap(([key]) => (k[key] || []).filter(e => terms.every(t => haystack(e).includes(t))).map(entry => ({section: key, entry})));
}

// An error code as shown on a display, looked up in every error-code list (case-insensitive).
export function lookupCode(k, query) {
  const code = String(query ?? '').trim().toLowerCase();
  if (!code) return [];
  return (k.fault_codes || []).flatMap(list => list.codes.filter(c => c.code.toLowerCase() === code).map(c => ({list, code: c})));
}

// The shipped bundle; tests pass another (the fictional examples) as ctx.knowledge.
let data = KNOWLEDGE;
const find = (section, id) => (data[section] || []).find(e => e.id === id);
const link = (section, id) => {
  const e = find(section, id);
  return e ? `<button class="linklike" data-action="library-open" data-key="${esc(`${section}:${id}`)}">${esc(e.title)}</button>` : '';
};
const links = (section, ids) => (ids || []).map(id => link(section, id)).filter(Boolean).join(', ') || '<span class="muted">none listed</span>';
const row = (label, value) => value === undefined || value === null || value === '' ? '' : `<tr><th>${esc(label)}</th><td>${value}</td></tr>`;

function detail(section, e) {
  const kv = [];
  if (section === 'vehicles') kv.push(row('Make', esc(e.make)), row('Model', esc(e.model)), row('Type', esc(e.category)),
    row('Years', e.years ? esc(`${e.years.from}${e.years.to ? `–${e.years.to}` : ' on'}`) : ''),
    row('Components', (e.components || []).map(c => `${link('components', c.component)}${c.role ? ` <span class="muted">${esc(c.role)}</span>` : ''}`).filter(Boolean).join('<br>') || '<span class="muted">none listed</span>'),
    row('Communication', links('protocols', e.protocols)));
  if (section === 'components') kv.push(row('Type', esc(e.type)), row('Manufacturer', esc(e.manufacturer)), row('Model', esc(e.model)),
    ...(e.specs || []).map(s => row(s.name, esc(`${s.value}${s.unit ? ` ${s.unit}` : ''}`))),
    row('Connectors', links('connectors', e.connectors)), row('Communication', links('protocols', e.protocols)), row('Error codes', links('fault_codes', e.fault_codes)));
  if (section === 'protocols') kv.push(row('Transport', esc(e.transport.toUpperCase())),
    row('Settings', esc(Object.entries(e.settings || {}).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(' · '))),
    row('Recognizing it', (e.detection || []).map(esc).join('<br>')), row('Checksum', esc(e.checksum)));
  if (section === 'fault_codes') kv.push(row('Vendor', esc(e.vendor)), row('Components', links('components', e.applies_to_components)), row('Communication', links('protocols', e.applies_to_protocols)));
  if (section === 'connectors') kv.push(row('Family', esc(e.family)), row('Pins', esc(e.pin_count)));
  let extra = '';
  if (section === 'connectors' && e.pins?.length) extra = `<h3>Pinout</h3><table class="list"><thead><tr><th>Pin</th><th>Signal</th><th>Wire colour</th><th>Confidence</th></tr></thead><tbody>
    ${e.pins.map(p => `<tr><td class="num">${esc(p.pin)}</td><td>${esc(p.signal)}</td><td>${esc(p.wire_color || '—')}</td><td>${tag(p.confidence)}</td></tr>`).join('')}</tbody></table>
    <p class="muted">Wire colours are never proof of a signal on their own. Check with a pinout document, continuity or a measurement.</p>`;
  if (section === 'protocols' && e.messages?.length) extra = `<h3>Messages</h3><table class="list"><thead><tr><th>ID</th><th>Name</th><th>Bytes</th><th>Every</th><th>Status</th></tr></thead><tbody>
    ${e.messages.map(m => `<tr><td class="num">${esc(m.id)}</td><td>${esc(m.name)}${(m.signals || []).length ? `<div class="muted">${m.signals.map(s => `${esc(s.name)}${s.unit ? ` (${esc(s.unit)})` : ''} ${tag(s.status)}`).join(' · ')}</div>` : ''}</td>
      <td class="num">${esc(m.length ?? '—')}</td><td class="num">${m.period_ms ? esc(`${m.period_ms} ms`) : '—'}</td><td>${tag(m.status)}</td></tr>`).join('')}</tbody></table>`;
  if (section === 'fault_codes') extra = `<h3>Codes</h3><table class="list"><thead><tr><th>Code</th><th>Meaning</th><th>Status</th></tr></thead><tbody>
    ${e.codes.map(c => `<tr><td class="num"><b>${esc(c.code)}</b></td><td><b>${esc(c.title)}</b>${c.meaning ? `<div>${esc(c.meaning)}</div>` : ''}${(c.checks || []).length ? `<ol class="helplist">${c.checks.map(t => `<li>${esc(t)}</li>`).join('')}</ol>` : ''}</td><td>${tag(c.status)}</td></tr>`).join('')}</tbody></table>`;
  const p = e.provenance || {};
  return `<section class="panel"><div class="panelhead"><h2>${esc(e.title)}</h2><div class="spacer"></div>${tag(p.status)} ${tag(p.confidence)}
      <button class="small quiet" data-action="library-close">Close</button></div>
    ${e.aliases?.length ? `<p class="muted">Also known as ${esc(e.aliases.join(', '))}</p>` : ''}
    <table class="kvt">${kv.join('')}</table>${e.notes ? `<p>${esc(e.notes)}</p>` : ''}${extra}
    <h3>Sources</h3><ul class="helplist">${(p.sources || []).map(s => `<li>${esc(s.kind.replace('-', ' '))}: ${esc(s.ref)}${s.date ? ` <span class="muted">(${esc(s.date)})</span>` : ''}</li>`).join('')}</ul></section>`;
}

export const library = {
  id: 'library',
  heading: 'Vehicle library',
  render({state, knowledge}) {
    data = knowledge || KNOWLEDGE;
    const k = data, q = state.library.query;
    const counts = SECTIONS.map(([key, label]) => `${(k[key] || []).length} ${label.toLowerCase()}`).join(' · ');
    const total = SECTIONS.reduce((n, [key]) => n + (k[key] || []).length, 0);
    const [openSection, openId] = String(state.library.open || '').split(':');
    const opened = openSection && find(openSection, openId);
    const codes = lookupCode(k, q);
    const hits = searchLibrary(k, q);
    const intro = `<div class="notice">Library ${esc(k.version)}: ${esc(counts)}. It is updated with every Studio release. Each fact shows how well it is
      established: <b>verified</b> (manufacturer document or bench test), <b>observed</b> (seen on vehicles) or <b>hypothesis</b> (not yet confirmed).</div>`;
    if (!total) return `${intro}<section class="panel"><h2>The library is empty in this version</h2>
      <p>Vehicles, communication protocols and error codes are added as CS Harness confirms them, and arrive with Studio updates.</p></section>`;
    return `<div class="toolbar"><input type="search" id="library-search" data-input="library-search" value="${esc(q)}" placeholder="Search make, model, part, protocol, or an error code like E10…" aria-label="Search the vehicle library"></div>
      ${intro}
      ${codes.length ? `<section class="panel flush"><header class="panelhead"><h2>Error code ${esc(q.trim().toUpperCase())}</h2></header><table class="list"><tbody>
        ${codes.map(({list, code}) => `<tr class="row-link" data-action="library-open" data-key="${esc(`fault_codes:${list.id}`)}" tabindex="0" role="button">
          <td><b>${esc(code.title)}</b><div class="muted">${esc(list.title)}</div>${code.meaning ? `<div>${esc(code.meaning)}</div>` : ''}</td><td>${tag(code.status)}</td></tr>`).join('')}</tbody></table></section>` : ''}
      <div class="${opened ? 'twocol' : ''}"><section class="panel flush"><table class="list"><thead><tr><th>Name</th><th>Kind</th><th>Status</th></tr></thead><tbody>
        ${hits.map(({section, entry}) => `<tr class="row-link" data-action="library-open" data-key="${esc(`${section}:${entry.id}`)}" tabindex="0" role="button">
          <td>${esc(entry.title)}</td><td>${esc(SECTIONS.find(s => s[0] === section)[1])}</td><td>${tag(entry.provenance?.status)}</td></tr>`).join('') ||
          '<tr><td colspan="3" class="muted">Nothing matches. Try a make, a part name or a code.</td></tr>'}</tbody></table></section>
      ${opened ? detail(openSection, opened) : ''}</div>`;
  },
  actions: {
    'library-open'(el, {state, render}) { state.library.open = el.dataset.key; render(); },
    'library-close'(_el, {state, render}) { state.library.open = null; render(); }
  },
  inputs: {'library-search'(el, {state, render}) { state.library.query = el.value.slice(0, 80); render(); }}
};
