import {esc, badge, dateTime, download} from '../core/ui.js';
import {statistics, compareReports, guides} from '../workshop.js';
import {isSimulated} from '../records.js';

export const guide = {
  id: 'guide',
  heading: 'Troubleshooting',
  render({state}) {
    const g = guides[state.guide];
    return `<section class="panel"><h2>Guided troubleshooting</h2><label class="field">Reported symptom<select data-change="guide-choice">
      ${Object.entries(guides).map(([k, v]) => `<option value="${k}" ${state.guide === k ? 'selected' : ''}>${esc(v.title)}</option>`).join('')}</select></label>
      <ol>${g.steps.map(s => `<li class="catalogrow">${esc(s)}</li>`).join('')}</ol>
      <button class="primary" data-action="test-choose" data-id="${g.test}">Open recommended test</button>
      <div class="notice">This is a checklist, not automated fault identification. Physical procedures and approved limits depend on the finalized hardware.</div></section>`;
  },
  changes: {'guide-choice'(el, {state, render}) { state.guide = el.value; render(); }}
};

const reportOption = (db, entry, selected) => `<option value="${esc(entry.id)}" ${entry.id === selected ? 'selected' : ''}>${esc(dateTime(entry.created))} · ${esc(db.job(entry.jobId)?.title || entry.session)} · P${esc(entry.report.profile_id)} · ${esc(entry.report.result)}${isSimulated(entry.source) ? ' · simulated' : ''}</option>`;

export const compare = {
  id: 'compare',
  heading: 'Compare reports',
  render({db, state}) {
    const a = db.report(state.compare.left), b = db.report(state.compare.right);
    const rows = compareReports(a, b);
    const options = selected => `<option value="">Select a report</option>${db.reports.slice(0, 300).map(r => reportOption(db, r, selected)).join('')}`;
    return `<section class="panel"><h2>Before / after comparison</h2><p>Compare reports from the same source, profile and revision. This is a numerical comparison, not proof of repair.</p>
      <div class="twocol"><label class="field">Before<select data-change="compare-left">${options(state.compare.left)}</select></label>
      <label class="field">After<select data-change="compare-right">${options(state.compare.right)}</select></label></div>
      ${a && b ? (rows ? `<div class="tablewrap"><table><thead><tr><th>Channel</th><th>Before</th><th>After</th><th>Change</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${esc(r.channel)}</td><td class="mono">${r.before.toFixed(3)} ${esc(r.unit)}</td><td class="mono">${r.after.toFixed(3)} ${esc(r.unit)}</td><td class="mono">${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(3)} ${esc(r.unit)}</td></tr>`).join('')}</tbody></table></div>
        ${rows.length ? '' : '<p>No matching measurement channels.</p>'}` : '<div class="notice">These reports cannot be compared: source, profile and revision must match.</div>')
        : '<div class="empty">Choose two saved reports to compare.</div>'}</section>`;
  },
  changes: {
    'compare-left'(el, {state, render}) { state.compare.left = el.value; render(); },
    'compare-right'(el, {state, render}) { state.compare.right = el.value; render(); }
  }
};

export const capture = {
  id: 'capture',
  heading: 'Capture analysis',
  render({state}) {
    const snapshot = state.capture;
    const samples = snapshot?.samples || state.samples;
    return `<section class="panel"><div class="panelhead"><h2>Capture analysis</h2><div class="actions">
      <button data-action="capture-take" ${state.samples.length ? '' : 'disabled'}>Snapshot rolling buffer</button>
      <button data-action="capture-export" ${snapshot ? '' : 'disabled'}>Export snapshot</button><button data-action="capture-clear">Return to current buffer</button></div></div>
      <p>${snapshot ? `Frozen snapshot · ${esc(dateTime(snapshot.created))}` : 'Current rolling buffer'} · ${samples.length} samples · ${esc(isSimulated(snapshot?.source ?? state.source) ? 'simulated' : 'device')} ${snapshot ? badge('FROZEN', 'gray') : ''}</p>
      <div class="tablewrap"><table><thead><tr><th>Signal</th><th>Minimum</th><th>Maximum</th><th>Mean</th><th>Samples</th></tr></thead><tbody>
      ${[['voltage', 'Bus voltage / V'], ['signal', 'Sensor / V'], ['current', 'Current / A']].map(([k, label]) => {
        const s = statistics(samples, k);
        return `<tr><td>${label}</td>${s ? [s.min, s.max, s.mean].map(v => `<td class="mono">${v.toFixed(4)}</td>`).join('') + `<td>${s.count}</td>` : '<td colspan="4">No samples</td>'}</tr>`;
      }).join('')}</tbody></table></div>
      <p>Snapshots stay in memory until this window closes; export to keep them. Simulated captures are labeled in the exported file.</p></section>`;
  },
  actions: {
    'capture-take'(_el, {state, render}) { state.capture = {source: state.source, created: Date.now(), samples: state.samples.map(s => ({...s}))}; render(); },
    'capture-clear'(_el, {state, render}) { state.capture = null; render(); },
    'capture-export'(_el, {state}) { if (state.capture) download('evcore-capture.json', JSON.stringify({schema_version: 1, simulated: isSimulated(state.capture.source), ...state.capture}, null, 2)); }
  }
};
