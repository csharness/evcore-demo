// View fragments shared by several screens.
import {esc, badge, time, dateTime, resultTone} from '../core/ui.js';
import {interpret} from '../domain.js';
import {isSimulated} from '../records.js';
import {showMismatch} from './report-document.js';
import {CODES} from '../codes.js';

export const sourceBadge = source => badge(isSimulated(source) ? 'SIMULATED' : 'DEVICE', isSimulated(source) ? 'gray' : '');

export function metrics() {
  return `<div class="readouts">${[['Bus voltage', 'voltage', 'V', 'HV'], ['Sensor signal', 'signal', 'V', 'AIN'],
    ['Stimulus current', 'current', 'A', 'OUT'], ['Device state', 'state', '', '']]
    .map(([label, key, unit, channel]) => `<div class="readout"><div class="k">${label}${channel ? `<span class="ch">${channel}</span>` : ''}</div>
      <div class="v" data-metric="${key}">—<span class="unit">${unit}</span></div></div>`).join('')}</div>`;
}

export function chart() {
  return `<svg class="chart" id="trace" viewBox="0 0 650 205" preserveAspectRatio="none" role="img" aria-label="Live trace: simulated sensor signal voltage, 0 to 5 volts">
    <g class="grid">${[0, 1, 2, 3, 4, 5].map(v => `<line x1="35" y1="${175 - v * 30}" x2="640" y2="${175 - v * 30}"/><text x="4" y="${179 - v * 30}">${v} V</text>`).join('')}
    ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => `<line x1="${35 + i * 60.5}" y1="25" x2="${35 + i * 60.5}" y2="175"/>`).join('')}</g>
    <path id="signal-path" class="trace"/><text x="35" y="199">−60 s</text><text x="612" y="199">now</text></svg>`;
}

// Instrument, safety, configuration, internal and operator events, kept apart from findings (roadmap #14).
export function faultEvents(report) {
  const list = report.fault_records ?? [];
  if (!list.length) return '';
  return `<h3>Instrument and safety events</h3><p class="protocol-note">These describe EVCore, its interlocks, its setup or operator actions. They are not findings about the device under test.</p>
    <div class="tablewrap"><table><thead><tr><th>Event</th><th>Category</th><th>Action</th><th>Source</th><th>Evidence</th></tr></thead><tbody>
    ${list.map(f => `<tr><td>${esc(f.name.replaceAll('_', ' '))}</td><td>${badge(f.category, f.category === 'safety' ? 'amber' : 'gray')}</td><td>${esc(f.action)}</td><td>${esc(f.source)}</td>
      <td class="mono">${esc(f.evidence)}${f.value === null ? '' : ` · ${esc(f.value)}`}</td></tr>`).join('')}</tbody></table></div>`;
}

export function measurementTable(report) {
  if (!report.samples.length) return '<p class="muted">No valid measurement was recorded.</p>';
  return `<div class="tablewrap"><table><thead><tr><th>Channel</th><th>Reading</th><th>Limits</th><th>Within limits</th></tr></thead><tbody>
    ${report.samples.map(s => {
      const inside = s.value >= s.minimum && s.value <= s.maximum;
      return `<tr><td>${esc(s.channel)}</td><td class="mono">${esc(s.value.toFixed(3))} ${esc(s.unit)}</td><td>${esc(s.minimum)}–${esc(s.maximum)} ${esc(s.unit)}</td><td>${inside ? 'Yes' : badge('No', 'amber')}</td></tr>`;
    }).join('')}</tbody></table></div>
    ${showMismatch(report) ? `<p>Phase mismatch <b>${Number(report.mismatch_percent).toFixed(2)}%</b> · limit ${esc(report.mismatch_limit_percent)}%</p>` : ''}`;
}

// Diagnostic codes with their meaning and checks, from the same library as the device firmware.
export function codeList(report) {
  const codes = (report.diagnostic_codes ?? []).map(code => [code, CODES[code]]);
  if (!codes.length) return '';
  return `<h3>Diagnostic codes</h3>${codes.map(([code, info]) => `<div class="codecard ${info?.category === 'instrument' ? 'instrument' : ''}">
    <div class="codehead"><span class="code">${esc(code)}</span><b>${esc(info?.title || 'Unknown code')}</b>${info?.draft ? badge('DRAFT TEXT', 'gray') : ''}</div>
    ${info ? `<p>${esc(info.meaning)}</p><ul>${info.checks.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p class="muted">This code is not in this version of Studio. Update Studio to see its description.</p>'}</div>`).join('')}`;
}

export function resultPanel(report, source, {entryId = null} = {}) {
  if (!report) return `<div class="empty">No completed test yet.<br>Run a test to build an evidence trail.</div>`;
  const reading = interpret(report);
  return `<div class="panelhead"><div><div class="resultbig ${esc(report.result)}">${esc(report.result)}</div><p><b>${esc(reading.title)}</b></p></div>${sourceBadge(source)}</div>
    <p>${esc(reading.body)}</p>${codeList(report)}${measurementTable(report)}${faultEvents(report)}
    ${entryId ? `<div class="actions"><button class="small" data-action="report-open" data-id="${esc(entryId)}">Open report →</button></div>` : ''}`;
}

export function deviceTable(device) {
  if (!device) return '<p class="muted">Not recorded (saved before version tracking).</p>';
  return `<div class="tablewrap"><table><tbody>${[['Protocol', device.protocol], ['Firmware', device.firmware], ['Build', device.build],
    ['Board definition', device.board], ['Serial number', device.serial ?? 'not recorded'], ['Knowledge', device.knowledge], ['Calibration', device.calibration]]
    .map(([k, v]) => `<tr><td>${k}</td><td class="mono">${esc(v)}</td></tr>`).join('')}</tbody></table></div>`;
}

export function timeline(events, count = 6) {
  if (!events.length) return '<p class="muted">No activity yet.</p>';
  return `<ol class="timeline">${events.slice(0, count).map(e => `<li><time>${time(e.time)}</time><span>${esc(e.message)}</span></li>`).join('')}</ol>`;
}

// One-line summary of a saved report for lists.
export function reportRow(entry, {showJob = false, jobTitle = ''} = {}) {
  const r = entry.report;
  return `<article class="session row-link" data-action="report-open" data-id="${esc(entry.id)}" tabindex="0" role="button" aria-label="Open report from ${esc(dateTime(entry.created))}">
    <div><h3>${esc(entry.session)}</h3><span class="tag">${esc(dateTime(entry.created))} · PROFILE ${esc(r.profile_id)}${showJob && jobTitle ? ` · ${esc(jobTitle)}` : ''}</span>
    <p>${esc(r.reason)}</p><small>${r.samples.map(s => `${esc(s.value.toFixed(3))} ${esc(s.unit)}`).join(' · ') || 'No valid measurement'}</small></div>
    <div class="row-side">${badge(r.result, resultTone(r.result))}${sourceBadge(entry.source)}</div></article>`;
}

// Active job banner used at the top of test screens.
export function jobBanner(context) {
  const {job, vehicle, customer} = context;
  if (!job) return `<div class="notice">No active work order. Results will be saved as unassigned tests. <button class="small" data-action="nav" data-view="jobs">Choose a work order</button></div>`;
  return `<div class="jobbar"><div><span class="eyebrow">ACTIVE WORK ORDER</span><b>${esc(job.title)}</b>
    <span class="muted">${esc([customer?.name, vehicle?.name || job.vehicle].filter(Boolean).join(' · '))}</span></div>
    <button class="small quiet" data-action="job-open" data-id="${esc(job.id)}">View work order</button></div>`;
}
