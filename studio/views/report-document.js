// Customer-facing service report (knowledge base section 26). Pure function: returns a
// complete HTML document with inline styles. The desktop app renders it in a window with
// JavaScript disabled and prints it to PDF. Every value is escaped.
import {interpret} from '../domain.js';
import {isSimulated, readingVerdict} from '../records.js';
import {CODES} from '../codes.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const when = t => new Date(t).toLocaleString('en-US', {year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
const lines = text => esc(text).replaceAll('\n', '<br>');
// Only a completed three-phase comparison has a meaningful mismatch figure.
export const showMismatch = r => r.phase_comparison && r.result !== 'UNKNOWN' && r.samples.length === 3 && Number.isFinite(r.mismatch_percent);
const resultLabel = {PASS: 'Pass', FAIL: 'Fail', UNKNOWN: 'No conclusion'};

const STYLE = `
*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1d2f2b;font-size:10.5pt;margin:0;line-height:1.4}
h1{font-size:19pt;margin:0}h2{font-size:12pt;margin:18px 0 6px;border-bottom:1px solid #cfd9d4;padding-bottom:3px}h3{font-size:10.5pt;margin:12px 0 4px}
.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #176855;padding-bottom:10px}
.shop{text-align:right;font-size:9.5pt;color:#43564f}.muted{color:#5d6e68}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.box{border:1px solid #cfd9d4;border-radius:6px;padding:8px 10px}.box b{display:block;font-size:8.5pt;letter-spacing:.8px;color:#5d6e68;text-transform:uppercase;margin-bottom:3px}
table{width:100%;border-collapse:collapse;margin:4px 0}th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #e3e9e6;font-size:9.5pt}th{background:#f1f5f3}
.test{page-break-inside:avoid;border:1px solid #cfd9d4;border-radius:6px;padding:8px 10px;margin:10px 0}
.result{display:inline-block;font-weight:700;padding:2px 8px;border-radius:4px;font-size:9.5pt}.PASS{background:#dff0e7;color:#135a44}.FAIL{background:#fbe6d8;color:#8a3a10}.UNKNOWN{background:#e8ecea;color:#44524d}
.sim{border:2px solid #b8520f;background:#fff4ec;color:#7a3409;padding:8px 10px;border-radius:6px;font-weight:700;margin:10px 0}
.events{background:#f7f9f8;border-left:3px solid #9aa9a3;padding:4px 8px;margin-top:6px;font-size:9pt}
.foot{margin-top:18px;font-size:8.5pt;color:#5d6e68;border-top:1px solid #cfd9d4;padding-top:6px}.sign{display:flex;gap:40px;margin-top:26px}.sign div{flex:1;border-top:1px solid #1d2f2b;padding-top:3px;font-size:9pt}
.mono{font-family:Consolas,"Courier New",monospace}
.code{border-left:3px solid #176855;background:#f1f7f3;padding:5px 8px;margin:6px 0;font-size:9.5pt}`;

function testSection(entry, index) {
  const r = entry.report;
  const reading = interpret(r);
  const events = r.fault_records ?? [];
  return `<div class="test"><h3>Test ${index + 1}: profile ${esc(r.profile_id)} · ${esc(when(entry.created))} <span class="result ${esc(r.result)}">${esc(resultLabel[r.result] || r.result)}</span>
    ${isSimulated(entry.source) ? ' <span class="result UNKNOWN">SIMULATED</span>' : ''}</h3>
    <p><b>${esc(reading.title)}.</b> ${esc(reading.body)}</p>
    ${(r.diagnostic_codes ?? []).map(code => CODES[code] ? `<div class="code"><b>${esc(code)} ${esc(CODES[code].title)}.</b> ${esc(CODES[code].meaning)} <i>Next checks:</i> ${esc(CODES[code].checks.join(' '))}</div>` : `<div class="code"><b>${esc(code)}</b></div>`).join('')}
    ${r.samples.length ? `<table><thead><tr><th>Channel</th><th>Reading</th><th>Expected range</th><th>Within range</th></tr></thead><tbody>
      ${r.samples.map(s => `<tr><td>${esc(s.channel)}</td><td class="mono">${esc(s.value.toFixed(3))} ${esc(s.unit)}</td><td>${esc(s.minimum)} – ${esc(s.maximum)} ${esc(s.unit)}</td>
        <td>${s.value >= s.minimum && s.value <= s.maximum ? 'Yes' : '<b>No</b>'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No valid measurement was recorded.</p>'}
    ${showMismatch(r) ? `<p>Phase mismatch: <b>${esc(Number(r.mismatch_percent).toFixed(2))}%</b> (limit ${esc(r.mismatch_limit_percent)}%)</p>` : ''}
    ${events.length ? `<div class="events"><b>Instrument and safety events (not findings about the vehicle):</b> ${events.map(f => esc(f.name.replaceAll('_', ' '))).join(', ')}</div>` : ''}
    ${entry.notes ? `<p><b>Notes:</b> ${lines(entry.notes)}</p>` : ''}
    <p class="muted">Instrument: firmware ${esc(entry.device?.firmware ?? 'not recorded')}, build ${esc(entry.device?.build ?? '—')}, board ${esc(entry.device?.board ?? '—')}, protocol ${esc(entry.device?.protocol ?? '—')}</p></div>`;
}

export function serviceReportHtml({job, vehicle, customer, reports, settings = {}, generated = Date.now(), appVersion = ''}) {
  const ordered = [...reports].sort((a, b) => a.created - b.created);
  const count = result => ordered.filter(e => e.report.result === result).length;
  const simulated = ordered.some(e => isSimulated(e.source));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Service report ${esc(job.title)}</title><style>${STYLE}</style></head><body>
<div class="head"><div><h1>Service report</h1><div class="muted">Work order ${esc(job.title)} · ${esc(when(generated))}</div></div>
<div class="shop"><b>${esc(settings.shopName || 'Service provider')}</b><br>${lines(settings.shopAddress)}${settings.shopPhone ? `<br>${esc(settings.shopPhone)}` : ''}</div></div>
${simulated ? '<div class="sim">Contains simulated data. Readings marked SIMULATED did not come from a physical test of this vehicle.</div>' : ''}
<div class="grid" style="margin-top:12px"><div class="box"><b>Customer</b>${customer ? `${esc(customer.name)}<br>${esc([customer.phone, customer.email].filter(Boolean).join(' · '))}` : '<span class="muted">Not recorded</span>'}</div>
<div class="box"><b>Vehicle</b>${esc(vehicle?.name || job.vehicle)}${vehicle ? `<br>${esc([vehicle.serial && `Serial ${vehicle.serial}`, vehicle.battery && `Battery ${vehicle.battery}`, vehicle.motor && `Motor ${vehicle.motor}`, vehicle.controller && `Controller ${vehicle.controller}`].filter(Boolean).join(' · '))}` : ''}</div></div>
<h2>Reported symptom</h2><p>${job.symptom ? lines(job.symptom) : '<span class="muted">Not recorded</span>'}</p>
<h2>Summary</h2><p>${ordered.length} test(s) performed: ${count('PASS')} passed, ${count('FAIL')} outside expected limits, ${count('UNKNOWN')} without a conclusion.
Status: <b>${esc(job.status)}</b>.</p>
${job.notes ? `<h2>Technician notes</h2><p>${lines(job.notes)}</p>` : ''}
<h2>Tests performed</h2>${ordered.map(testSection).join('')}
<div class="sign"><div>Technician${settings.technician ? `: ${esc(settings.technician)}` : ''}</div><div>Date</div></div>
<div class="foot">Results describe only the tests listed, under the conditions recorded, against the limits of the selected test profile. They do not certify the whole
component or vehicle. "No conclusion" means the test could not produce a result; it is not a fault in the vehicle. Instrument and safety events describe the
test equipment and its setup. Generated by EVCore Studio ${esc(appVersion)}.</div>
</body></html>`;
}

// Manual diagnostic report (decision 0006): what the technician recorded without EVCore hardware.
// Readings are shown against the technician's own range and its source only, and are labeled as
// entered by the technician. Findings keep their status; a suspected cause is never shown as a
// confirmed failure.
const DIAG_STYLE = `
*{box-sizing:border-box}body{font-family:"Segoe UI",Arial,Helvetica,sans-serif;color:#141b22;font-size:10pt;margin:0;line-height:1.45}
.band{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0a84ff;padding-bottom:12px}
.band h1{font-size:20pt;margin:0;letter-spacing:-.2px}.band .kind{font-size:9pt;letter-spacing:1.6px;text-transform:uppercase;color:#0a6fd6;font-weight:700;margin-bottom:4px}
.shop{text-align:right;font-size:9pt;color:#44505c}.shop b{font-size:11pt;color:#141b22}
.meta{display:flex;gap:22px;font-size:9pt;color:#44505c;margin:10px 0 2px}.meta b{color:#141b22}
.draft{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:90pt;font-weight:800;color:rgba(10,132,255,.08);transform:rotate(-24deg);z-index:-1}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.box{border:1px solid #d9e0e7;border-radius:6px;padding:8px 10px;font-size:9.5pt}.box h3{margin:0 0 3px;font-size:8pt;letter-spacing:1.2px;text-transform:uppercase;color:#6a7784}
h2{font-size:11pt;margin:18px 0 6px;padding-bottom:3px;border-bottom:1px solid #d9e0e7}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:5px 6px;border-bottom:1px solid #e6ebf0;font-size:9pt;vertical-align:top}
th{font-size:7.5pt;letter-spacing:.8px;text-transform:uppercase;color:#6a7784;background:#f4f7fa}
.num{font-family:Consolas,"Courier New",monospace;white-space:nowrap}
.v{display:inline-block;font-size:8pt;font-weight:700;padding:1px 6px;border-radius:3px}.within{background:#e3f5ec;color:#0e6b43}.outside{background:#fde6e6;color:#a1161f}.none{background:#eef1f4;color:#5b6773}
.finding{border-left:3px solid #c3ccd5;padding:4px 10px;margin:6px 0;font-size:9.5pt}.finding.confirmed{border-color:#0e6b43}.finding.suspected{border-color:#d48806}
.finding .s{font-size:7.5pt;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#6a7784}.finding.confirmed .s{color:#0e6b43}.finding.suspected .s{color:#a86a00}
.chips span{display:inline-block;border:1px solid #d9e0e7;border-radius:10px;padding:1px 8px;margin:0 4px 4px 0;font-size:8.5pt}
.notice{background:#f4f7fa;border:1px solid #d9e0e7;border-radius:6px;padding:8px 10px;font-size:8.5pt;color:#44505c;margin-top:16px}
.sign{display:flex;gap:40px;margin-top:30px}.sign div{flex:1;border-top:1px solid #141b22;padding-top:3px;font-size:8.5pt;color:#44505c}
.foot{margin-top:14px;font-size:7.5pt;color:#8a96a2;display:flex;justify-content:space-between}
.muted{color:#6a7784}`;
const VERDICT = {within: 'Within range', outside: 'Outside range', none: 'No range given'};
const STATUS_ORDER = ['confirmed', 'suspected', 'observed'];
const STATUS_LABEL = {confirmed: 'Confirmed', suspected: 'Suspected cause · not confirmed', observed: 'Observed'};
const reading = r => r.value === null ? '<span class="muted">not recorded</span>' : `${esc(r.value)} ${esc(r.unit)}`;
const range = r => r.min === null && r.max === null ? '—' : r.min !== null && r.max !== null ? `${esc(r.min)} – ${esc(r.max)} ${esc(r.unit)}`
  : r.min !== null ? `≥ ${esc(r.min)} ${esc(r.unit)}` : `≤ ${esc(r.max)} ${esc(r.unit)}`;

export function diagnosisReportHtml({diagnosis: d, job, vehicle, customer, settings = {}, generated = Date.now(), appVersion = ''}) {
  const number = `D-${d.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()}`;
  const findings = STATUS_ORDER.flatMap(status => d.findings.filter(f => f.status === status));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Diagnostic report ${esc(number)}</title><style>${DIAG_STYLE}</style></head><body>
${d.status === 'Draft' ? '<div class="draft">DRAFT</div>' : ''}
<div class="band"><div><div class="kind">Diagnostic report</div><h1>${esc(vehicle?.name || job?.vehicle || 'Vehicle')}</h1></div>
<div class="shop"><b>${esc(settings.shopName || 'Service provider')}</b><br>${lines(settings.shopAddress)}${settings.shopPhone ? `<br>${esc(settings.shopPhone)}` : ''}</div></div>
<div class="meta"><span>Report <b>${esc(number)}</b></span>${job ? `<span>Work order <b>${esc(job.title)}</b></span>` : ''}<span>Date <b>${esc(when(d.updated))}</b></span><span>Status <b>${esc(d.status)}</b></span></div>
<div class="grid"><div class="box"><h3>Customer</h3>${customer ? `${esc(customer.name)}${customer.phone || customer.email ? `<br>${esc([customer.phone, customer.email].filter(Boolean).join(' · '))}` : ''}` : '<span class="muted">Not recorded</span>'}</div>
<div class="box"><h3>Vehicle</h3>${esc(vehicle?.name || job?.vehicle || 'Not recorded')}${vehicle ? `<br>${esc([vehicle.serial && `Serial ${vehicle.serial}`, vehicle.battery && `Battery ${vehicle.battery}`, vehicle.motor && `Motor ${vehicle.motor}`, vehicle.controller && `Controller ${vehicle.controller}`].filter(Boolean).join(' · '))}` : ''}</div></div>
<h2>Customer complaint</h2><p>${d.complaint ? lines(d.complaint) : job?.symptom ? lines(job.symptom) : '<span class="muted">Not recorded</span>'}</p>
${d.symptoms.length ? `<h2>Symptoms observed</h2><div class="chips">${d.symptoms.map(s => `<span>${esc(s)}</span>`).join('')}</div>` : ''}
<h2>Measurements</h2>${d.readings.length ? `<table><thead><tr><th>Measurement</th><th>Where</th><th>Reading</th><th>Expected range</th><th>Range source</th><th>Result</th></tr></thead><tbody>
${d.readings.map(r => { const v = readingVerdict(r); return `<tr><td>${esc(r.what)}</td><td>${esc(r.where) || '—'}</td><td class="num">${reading(r)}</td><td class="num">${range(r)}</td><td>${esc(r.source) || '—'}</td><td><span class="v ${v}">${VERDICT[v]}</span></td></tr>`; }).join('')}</tbody></table>`
  : '<p class="muted">No measurements were recorded.</p>'}
<h2>Findings</h2>${findings.length ? findings.map(f => `<div class="finding ${f.status}"><div class="s">${STATUS_LABEL[f.status]}</div>${esc(f.text)}${f.how ? `<div class="muted">Confirmed by: ${esc(f.how)}</div>` : ''}</div>`).join('') : '<p class="muted">No findings recorded.</p>'}
${d.recommendations ? `<h2>Recommended work</h2><p>${lines(d.recommendations)}</p>` : ''}
${d.parts ? `<h2>Parts</h2><p>${lines(d.parts)}</p>` : ''}
<div class="notice">Measurements in this report were taken and entered by the technician; they were not recorded by EVCore test equipment.
Each reading is compared only with the expected range shown and its source. Suspected causes are the technician's assessment and are not confirmed unless marked Confirmed.
This report describes the checks listed and does not certify the whole vehicle.</div>
<div class="sign"><div>Technician${d.technician ? `: ${esc(d.technician)}` : ''}</div><div>Customer</div><div>Date</div></div>
<div class="foot"><span>${esc(settings.shopName || '')}</span><span>Prepared with EVCore Studio ${esc(appVersion)} · generated ${esc(when(generated))}</span></div>
</body></html>`;
}