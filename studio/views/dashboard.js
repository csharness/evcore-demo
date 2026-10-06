// Bench: the Studio Pro home screen. Live readouts, the signal trace, the active job's next
// step and the latest results.
import {esc, time} from '../core/ui.js';
import {icon} from '../core/icons.js';
import {isSimulated} from '../records.js';
import {CODES} from '../codes.js';
import {metrics, chart} from './components.js';
import {gettingStarted} from './help.js';
import {STEPS, reachableStep} from './workflow.js';

const RESULT = {PASS: ['PASS', 'ok'], FAIL: ['FAIL', 'bad'], UNKNOWN: ['NO CONCLUSION', 'warn']};
export const resultTag = result => { const [label, tone] = RESULT[result] || [result, '']; return `<span class="res ${tone}">${esc(label)}</span>`; };

function jobPanel({db, state}) {
  const {job, vehicle, customer} = db.context(db.settings.activeJobId);
  if (!job) return `<section class="panel flush"><header class="panelhead"><h2>No active work order</h2></header>
    <div class="body"><p class="muted">Choose or create a work order so every result is filed with its vehicle and customer.</p>
    <div class="actions"><button class="primary" data-action="nav" data-view="workflow">${icon('play')}Start a guided job</button><button data-action="nav" data-view="jobs">Work orders</button></div></div></section>`;
  const reached = reachableStep({connected: state.connected, job, checklistComplete: false, reportCount: db.reportsOf(job.id).length});
  return `<section class="panel flush"><header class="panelhead"><h2>${esc(job.title)}</h2><span class="sub clip">${esc(job.symptom || [vehicle?.name, customer?.name].filter(Boolean).join(' · '))}</span></header>
    <div class="body"><ol class="jobsteps">${STEPS.map((name, i) => `<li class="${i < reached ? 'done' : i === reached ? 'now' : ''}"><span class="i">${i < reached ? icon('check') : i + 1}</span><span>${esc(name)}</span></li>`).join('')}</ol>
    <button class="primary wide" data-action="nav" data-view="workflow">${icon('play')}Continue: ${esc(STEPS[Math.min(reached, STEPS.length - 1)].toLowerCase())}</button></div></section>`;
}

function recent({db}) {
  const rows = db.reports.slice(0, 6);
  return `<section class="panel flush"><header class="panelhead"><h2>Recent results</h2><div class="spacer"></div><button class="small" data-action="nav" data-view="reports">All reports</button></header>
    ${rows.length ? `<table class="list"><thead><tr><th>Time</th><th>Test</th><th>Result</th><th>Code</th><th>Work order</th><th>Source</th></tr></thead><tbody>
    ${rows.map(r => {
      const code = r.report.diagnostic_codes?.[0];
      return `<tr class="row-link" data-action="report-open" data-id="${esc(r.id)}" tabindex="0" role="button"><td class="num">${esc(time(r.created))}</td><td>${esc(r.session)}</td>
        <td>${resultTag(r.report.result)}</td><td>${code ? `<span class="code">${esc(code)}</span> ${esc(CODES[code]?.title || '')}` : '<span class="muted">—</span>'}</td>
        <td class="num">${esc(db.job(r.jobId)?.title || '—')}</td><td>${isSimulated(r.source) ? '<span class="tag warn">Simulated</span>' : '<span class="tag ok">Device</span>'}</td></tr>`;
    }).join('')}</tbody></table>` : '<div class="empty">No results yet. Run a test and it appears here.</div>'}</section>`;
}

export const dashboard = {
  id: 'dashboard',
  heading: 'Bench',
  render(ctx) {
    const {state} = ctx;
    return `${gettingStarted(ctx)}${metrics()}
    <div class="grid-bench"><section class="panel flush"><header class="panelhead"><h2>Sensor signal</h2><span class="sub num">AIN · 0–5 V · 60 s</span></header>
      ${state.connected && state.source === 'demo' ? `<div class="scope">${chart()}</div>`
        : !state.connected ? `<div class="empty">No EVCore D1 connected.<br><button class="small primary" data-action="connect" data-source="usb">Connect over USB</button></div>`
        : '<div class="empty">This firmware reports test results and device state.<br>Continuous sample streaming is not available yet.</div>'}</section>
      ${jobPanel(ctx)}</div>
    <div class="quick">${[['2', 'Motor not running?', 'Compare phase-pair resistance'], ['1', 'Sensor acting up?', 'Check the analog signal range'],
      ['3', 'Uneven phase signal?', 'Inspect passive back-EMF']].map(([id, q, a]) => `<button class="quicktest" data-action="test-choose" data-id="${id}"><b>${q}</b><span>${a}</span></button>`).join('')}
      <button class="quicktest" data-action="nav" data-view="bus"><b>Communication issue?</b><span>Capture bus frames</span></button></div>
    ${recent(ctx)}`;
  }
};
