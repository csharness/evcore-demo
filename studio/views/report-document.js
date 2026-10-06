// Customer-facing service report (knowledge base section 26). Pure function: returns a
// complete HTML document with inline styles. The desktop app renders it in a window with
// JavaScript disabled and prints it to PDF. Every value is escaped.
import {interpret} from '../domain.js';
import {isSimulated, readingVerdict} from '../records.js';
import {SAFETY_LEVELS, SAFETY_WARNING, CONFIDENCE, WARRANTY_STATUSES, INSPECTION, INSPECTION_RESULTS, AUDIT_ACTIONS, inspectionId} from '../diagnosis-fields.js';
import {CODES} from '../codes.js';
import {reportBrand} from '../branding.js';
import {validTimeZone} from '../settings-sync.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
// Times in the shop's time zone (Settings; the computer's own when none is set), named (PDT, PST),
// so a location's reports show its local time whichever computer prints them.
const when = (t, zone = '') => new Date(t).toLocaleString('en-US', {year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short', ...(validTimeZone(zone) ? {timeZone: zone} : {})});
const lines = text => esc(text).replaceAll('\n', '<br>');
// Reports load nothing from outside the document: the shop's logo and font are embedded data.
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">`;
const LOGO_STYLE = '.logo{display:block;max-height:64px;max-width:220px;margin:0 0 6px auto}';
// Work-order photos (decision 0014): report-size JPEG copies embedded as data, with their captions.
const PHOTO = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
const PHOTO_STYLE = '.photos{display:grid;grid-template-columns:1fr 1fr;gap:10px}.photos figure{margin:0;page-break-inside:avoid;border:1px solid #d9e0e7;border-radius:6px;padding:6px}'
  + '.photos img{display:block;width:100%;max-height:280px;object-fit:contain}.photos figcaption{font-size:8.5pt;color:#44505c;margin-top:4px}'
  + '.photos ol{margin:3px 0 0;padding-left:16px}';
const photoSection = photos => {
  const shown = (Array.isArray(photos) ? photos : []).filter(p => PHOTO.test(p?.src ?? ''));
  // A photo's marks are numbered in the picture; `marks` lists what each number shows, in order.
  const legend = p => (Array.isArray(p.marks) && p.marks.length ? `<ol>${p.marks.map(label => `<li>${esc(label)}</li>`).join('')}</ol>` : '');
  return shown.length ? `<h2>Photos</h2><div class="photos">${shown.map((p, i) => `<figure><img src="${p.src}" alt="Photo ${i + 1}">${p.caption || legend(p)
    ? `<figcaption>${esc(p.caption)}${legend(p)}</figcaption>` : ''}</figure>`).join('')}</div>` : '';
};
const shopBlock = (settings, logo) => `<div class="shop">${logo ? `<img class="logo" src="${esc(logo)}" alt="${esc(settings.shopName || 'Shop logo')}">` : ''}<b>${esc(settings.shopName || 'Service provider')}</b><br>${lines(settings.shopAddress)}${settings.shopPhone ? `<br>${esc(settings.shopPhone)}` : ''}${settings.shopEmail ? `<br>${esc(settings.shopEmail)}` : ''}${settings.shopHours ? `<br><span class="muted">${esc(settings.shopHours)}</span>` : ''}</div>`;
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

function testSection(entry, index, zone) {
  const r = entry.report;
  const reading = interpret(r);
  const events = r.fault_records ?? [];
  return `<div class="test"><h3>Test ${index + 1}: profile ${esc(r.profile_id)} · ${esc(when(entry.created, zone))} <span class="result ${esc(r.result)}">${esc(resultLabel[r.result] || r.result)}</span>
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

export function serviceReportHtml({job, vehicle, customer, reports, photos = [], settings = {}, generated = Date.now(), appVersion = ''}) {
  const ordered = [...reports].sort((a, b) => a.created - b.created);
  const count = result => ordered.filter(e => e.report.result === result).length;
  const simulated = ordered.some(e => isSimulated(e.source));
  const brand = reportBrand(settings);
  const brandCss = `${LOGO_STYLE}${brand.accent ? `.head{border-bottom-color:${brand.accent}}.code{border-left-color:${brand.accent}}` : ''}${brand.fontCss}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
${CSP}
<title>Service report ${esc(job.title)}</title><style>${STYLE}${brandCss}${PHOTO_STYLE}</style></head><body>
<div class="head"><div><h1>Service report</h1><div class="muted">Work order ${esc(job.title)} · ${esc(when(generated, settings.shopTimeZone))}</div></div>
${shopBlock(settings, brand.logo)}</div>
${simulated ? '<div class="sim">Contains simulated data. Readings marked SIMULATED did not come from a physical test of this vehicle.</div>' : ''}
<div class="grid" style="margin-top:12px"><div class="box"><b>Customer</b>${customer ? `${esc(customer.name)}<br>${esc([customer.phone, customer.email].filter(Boolean).join(' · '))}` : '<span class="muted">Not recorded</span>'}</div>
<div class="box"><b>Vehicle</b>${esc(vehicle?.name || job.vehicle)}${vehicle ? `<br>${esc([vehicle.serial && `Serial ${vehicle.serial}`, vehicle.battery && `Battery ${vehicle.battery}`, vehicle.motor && `Motor ${vehicle.motor}`, vehicle.controller && `Controller ${vehicle.controller}`].filter(Boolean).join(' · '))}` : ''}</div></div>
<h2>Reported symptom</h2><p>${job.symptom ? lines(job.symptom) : '<span class="muted">Not recorded</span>'}</p>
<h2>Summary</h2><p>${ordered.length} test(s) performed: ${count('PASS')} passed, ${count('FAIL')} outside expected limits, ${count('UNKNOWN')} without a conclusion.
Status: <b>${esc(job.status)}</b>.</p>
${job.notes ? `<h2>Technician notes</h2><p>${lines(job.notes)}</p>` : ''}
<h2>Tests performed</h2>${ordered.map((entry, i) => testSection(entry, i, settings.shopTimeZone)).join('')}
${photoSection(photos)}
<div class="sign"><div>Technician${settings.technician ? `: ${esc(settings.technician)}` : ''}</div><div>Date</div></div>
<div class="foot">Results describe only the tests listed, under the conditions recorded, against the limits of the selected test profile. They do not certify the whole
component or vehicle. "No conclusion" means the test could not produce a result; it is not a fault in the vehicle. Instrument and safety events describe the
test equipment and its setup. Generated by EVCore Studio ${esc(appVersion)}.</div>
</body></html>`;
}

// Manual diagnostic report (decisions 0006 and 0019): what the technician recorded without EVCore
// hardware. Readings are shown against the technician's own range and its source only, and are
// labeled as entered by the technician. Findings keep their status: a suspected cause is never shown
// as a confirmed diagnosis. The report says DRAFT on every page until a technician finalizes the
// diagnosis; a final report carries its location number and revision. The internal report adds the
// details a shop keeps to itself (internal notes, every inspection item, the history).
const DIAG_STYLE = `
@page{size:Letter;margin:0.5in}
*{box-sizing:border-box}body{font-family:"Segoe UI",Arial,Helvetica,sans-serif;color:#141b22;font-size:10pt;margin:0;line-height:1.45}
.band{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:3px solid #0a84ff;padding-bottom:12px}
.band h1{font-size:20pt;margin:0;letter-spacing:-.2px}.band .kind{font-size:9pt;letter-spacing:1.6px;text-transform:uppercase;color:#0a6fd6;font-weight:700;margin-bottom:4px}
.shop{text-align:right;font-size:9pt;color:#44505c}.shop b{font-size:11pt;color:#141b22}
.meta{display:flex;flex-wrap:wrap;gap:4px 22px;font-size:9pt;color:#44505c;margin:10px 0 2px}.meta b{color:#141b22}
.draft{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:90pt;font-weight:800;color:rgba(10,132,255,.08);transform:rotate(-24deg);z-index:-1}
.draftbar{border:2px dashed #a86a00;background:#fff8e6;color:#6b4500;font-weight:700;padding:6px 10px;border-radius:6px;margin:10px 0;font-size:9.5pt}
.internalbar{border:2px solid #44505c;background:#eef1f4;color:#141b22;font-weight:700;padding:6px 10px;border-radius:6px;margin:10px 0;font-size:9.5pt}
.danger{border:2px solid #a1161f;background:#fde6e6;color:#7a0f16;padding:8px 10px;border-radius:6px;margin:10px 0;font-size:10pt;page-break-inside:avoid}
.summary{border:1px solid #d9e0e7;border-radius:6px;padding:8px 12px;margin-top:12px;page-break-inside:avoid}.summary h3{margin:6px 0 2px;font-size:9pt}.summary p{margin:0 0 4px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.box{border:1px solid #d9e0e7;border-radius:6px;padding:8px 10px;font-size:9.5pt;page-break-inside:avoid}.box h3{margin:0 0 3px;font-size:8pt;letter-spacing:1.2px;text-transform:uppercase;color:#6a7784}
h2{font-size:11pt;margin:18px 0 6px;padding-bottom:3px;border-bottom:1px solid #d9e0e7;page-break-after:avoid}
table{width:100%;border-collapse:collapse}thead{display:table-header-group}tr{page-break-inside:avoid}
th,td{text-align:left;padding:5px 6px;border-bottom:1px solid #e6ebf0;font-size:9pt;vertical-align:top;overflow-wrap:anywhere}
th{font-size:7.5pt;letter-spacing:.8px;text-transform:uppercase;color:#6a7784;background:#f4f7fa;overflow-wrap:normal}
td.cond{font-size:8pt;color:#44505c;padding-top:0}
.num{font-family:Consolas,"Courier New",monospace;white-space:nowrap}
.v{display:inline-block;font-size:8pt;font-weight:700;padding:1px 6px;border-radius:3px}.within,.ok{background:#e3f5ec;color:#0e6b43}.outside,.fail{background:#fde6e6;color:#a1161f}.none,.na{background:#eef1f4;color:#5b6773}.attention{background:#fff1d6;color:#7a4c00}
.finding{border-left:3px solid #c3ccd5;padding:4px 10px;margin:6px 0;font-size:9.5pt;page-break-inside:avoid}.finding.confirmed{border-color:#0e6b43}.finding.suspected{border-color:#d48806}.finding.ruled-out{border-color:#9aa5b1}
.finding .s{font-size:7.5pt;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#6a7784}.finding.confirmed .s{color:#0e6b43}.finding.suspected .s{color:#a86a00}
.chips span{display:inline-block;border:1px solid #d9e0e7;border-radius:10px;padding:1px 8px;margin:0 4px 4px 0;font-size:8.5pt}
.notice{background:#f4f7fa;border:1px solid #d9e0e7;border-radius:6px;padding:8px 10px;font-size:8.5pt;color:#44505c;margin-top:16px;page-break-inside:avoid}
.sign{display:flex;gap:40px;margin-top:30px;page-break-inside:avoid}.sign div{flex:1;border-top:1px solid #141b22;padding-top:3px;font-size:8.5pt;color:#44505c}
.foot{margin-top:14px;font-size:7.5pt;color:#8a96a2;display:flex;justify-content:space-between;gap:12px}
.muted{color:#6a7784}`;
const VERDICT = {within: 'Within range', outside: 'Outside range', none: 'No range given'};
const STATUS_ORDER = ['confirmed', 'suspected', 'observed', 'ruled-out'];
const STATUS_LABEL = {confirmed: 'Confirmed', suspected: 'Suspected cause · not confirmed', observed: 'Observed', 'ruled-out': 'Checked and ruled out'};
const reading = r => r.value === null ? '<span class="muted">not recorded</span>' : `${esc(r.value)} ${esc(r.unit)}`;
const range = r => r.min === null && r.max === null ? '—' : r.min !== null && r.max !== null ? `${esc(r.min)} – ${esc(r.max)} ${esc(r.unit)}`
  : r.min !== null ? `≥ ${esc(r.min)} ${esc(r.unit)}` : `≤ ${esc(r.max)} ${esc(r.unit)}`;
const day = iso => iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'}) : '';
const SAFETY_TEXT = {unsafe: 'This vehicle is not safe to ride until the work below is done.',
  battery: 'The battery shows signs of a fire risk. Do not charge it indoors or unattended; ask us how to handle it safely.',
  'no-power': 'Do not switch this vehicle on or charge it until it has been repaired.'};

// What the customer sees first: what was found and what to do, in plain words, from the findings'
// own statuses. A suspected cause is described as suspected.
function customerSummary(d) {
  const confirmed = d.findings.filter(f => f.status === 'confirmed');
  const suspected = d.findings.filter(f => f.status === 'suspected');
  const found = confirmed.length ? confirmed.map(f => esc(f.text)).join(' ')
    : suspected.length ? `No cause is confirmed yet. The technician suspects: ${suspected.map(f => esc(f.text)).join('; ')}.` : 'No cause has been confirmed yet.';
  return `<div class="summary"><h3>What we found</h3><p>${found}</p>
    ${d.recommendations ? `<h3>What we recommend</h3><p>${lines(d.recommendations)}</p>` : ''}
    ${d.severity ? `<h3>Safety</h3><p>${esc(SAFETY_LEVELS[d.severity])}.</p>` : ''}</div>`;
}

function vehicleBox(d, vehicle, job) {
  const v = d.vehicleInfo ?? {};
  const name = [v.year, v.make, v.model].filter(Boolean).join(' ') || vehicle?.name || job?.vehicle || 'Not recorded';
  const facts = [v.category, v.color, (v.serial || vehicle?.serial) && `Serial ${v.serial || vehicle.serial}`, v.batteryClass && `Battery ${v.batteryClass}`,
    !v.batteryClass && vehicle?.battery && `Battery ${vehicle.battery}`, v.motorWatts !== null && v.motorWatts !== undefined && `Motor ${v.motorWatts} W (as labeled)`,
    !v.motorWatts && vehicle?.motor && `Motor ${vehicle.motor}`, (v.controller || vehicle?.controller) && `Controller ${v.controller || vehicle.controller}`,
    v.odometer !== null && v.odometer !== undefined && `Odometer ${v.odometer} ${v.odometerUnit || 'mi'}`].filter(Boolean);
  const received = [v.keys !== null && v.keys !== undefined && `${v.keys} key${v.keys === 1 ? '' : 's'}`, v.charger === 'yes' ? 'charger' : v.charger === 'no' ? 'no charger' : ''].filter(Boolean);
  return `<div class="box"><h3>Vehicle</h3>${esc(name)}${facts.length ? `<br>${esc(facts.join(' · '))}` : ''}${received.length ? `<br><span class="muted">Received with ${esc(received.join(', '))}</span>` : ''}
    ${v.warranty ? `<br><span class="muted">${esc(WARRANTY_STATUSES[v.warranty])}</span>` : ''}</div>`;
}

function inspectionTable(d, all) {
  const byId = new Map((d.inspection ?? []).map(i => [i.id, i]));
  const rows = Object.entries(INSPECTION).flatMap(([area, items]) => items.map(item => ({area, item, ...(byId.get(inspectionId(area, item)) ?? {result: '', note: ''})})))
    .filter(r => all ? r.result || r.note : (r.result && r.result !== 'ok' && r.result !== 'na') || r.note);
  const ok = (d.inspection ?? []).filter(i => i.result === 'ok').length;
  if (!rows.length && !ok) return '';
  return `<h2>Inspection</h2>${!all && ok ? `<p class="muted">${ok} item${ok > 1 ? 's' : ''} checked and found OK.</p>` : ''}
    ${rows.length ? `<table><thead><tr><th>Area</th><th>Item</th><th>Result</th><th>Note</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.area === 'mechanical' ? 'Mechanical' : 'Electrical'}</td>
      <td>${esc(r.item)}</td><td>${r.result ? `<span class="v ${esc(r.result)}">${esc(INSPECTION_RESULTS[r.result])}</span>` : '—'}</td><td>${esc(r.note) || '—'}</td></tr>`).join('')}</tbody></table>` : ''}`;
}

function readingsTable(d, all, at) {
  if (!d.readings.length) return '<h2>Tests and measurements</h2><p class="muted">No measurements were recorded.</p>';
  return `<h2>Tests and measurements</h2><table><thead><tr><th>Measurement</th><th>Where</th><th>Reading</th><th>Expected range</th><th>Range source</th><th>Result</th></tr></thead><tbody>
${d.readings.map(r => {
    const v = readingVerdict(r);
    const extra = [r.conditions && `Conditions: ${r.conditions}`, r.instrument && `Instrument: ${r.instrument}`, all && r.notes && `Notes: ${r.notes}`, all && r.takenAt && `Taken ${at(r.takenAt)}`].filter(Boolean);
    return `<tr><td>${esc(r.what)}</td><td>${esc(r.where) || '—'}</td><td class="num">${reading(r)}</td><td class="num">${range(r)}</td><td>${esc(r.source) || '—'}</td><td><span class="v ${v}">${VERDICT[v]}</span></td></tr>
      ${extra.length ? `<tr><td colspan="6" class="cond">${esc(extra.join(' · '))}</td></tr>` : ''}`;
  }).join('')}</tbody></table>`;
}

function findingsBlock(d) {
  const confirmed = d.findings.filter(f => f.status === 'confirmed');
  const others = STATUS_ORDER.slice(1).flatMap(status => d.findings.filter(f => f.status === status));
  const item = f => `<div class="finding ${f.status}"><div class="s">${STATUS_LABEL[f.status]}</div>${esc(f.text)}${f.how ? `<div class="muted">Confirmed by: ${esc(f.how)}</div>` : ''}</div>`;
  return `<h2>Confirmed diagnosis</h2>${confirmed.length ? confirmed.map(item).join('') : '<p class="muted">No cause is confirmed.</p>'}
    ${others.length ? `<h2>Other findings</h2>${others.map(item).join('')}` : ''}`;
}

function warrantyBlock(d) {
  const w = d.warranty ?? {};
  const facts = [w.proof === 'yes' ? 'Proof of purchase seen' : w.proof === 'no' ? 'Proof of purchase not provided' : '', w.purchased && `Purchased ${day(w.purchased)}`,
    w.expires && `Warranty expires ${day(w.expires)}`, w.caseNumber && `Manufacturer case ${w.caseNumber}`, w.partsShipped && `Parts shipped ${day(w.partsShipped)}`,
    w.partsReceived && `Parts received ${day(w.partsReceived)}`].filter(Boolean);
  if (!facts.length && !w.manufacturerDiagnosis && !w.notes) return '';
  return `<h2>Warranty</h2>${facts.length ? `<p>${esc(facts.join(' · '))}</p>` : ''}${w.manufacturerDiagnosis ? `<p><b>Manufacturer's diagnosis:</b> ${lines(w.manufacturerDiagnosis)}</p>` : ''}
    ${w.notes ? `<p><b>Notes:</b> ${lines(w.notes)}</p>` : ''}`;
}

function diagnosisDocument({diagnosis: d, job, vehicle, customer, photos = [], settings = {}, generated = Date.now(), appVersion = '', internal = false}) {
  const final = d.status === 'Final';
  const number = final && d.reportNumber ? d.reportNumber : d.reportNumber ? `${d.reportNumber} (reopened)` : `D-${d.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()}`;
  const revision = final ? `Revision ${Math.max(1, d.revision)}` : '';
  const brand = reportBrand(settings);
  const brandCss = `${LOGO_STYLE}${brand.accent ? `.band{border-bottom-color:${brand.accent}}` : ''}${brand.accentText ? `.band .kind{color:${brand.accentText}}` : ''}${brand.accent ? `.draft{color:${brand.accent}14}` : ''}${brand.fontCss}`;
  const title = `${internal ? 'Internal report' : 'Diagnostic report'} ${number}${revision ? ` ${revision}` : ''}`;
  const at = t => when(t, settings.shopTimeZone);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
${CSP}
<title>${esc(title)}</title><style>${DIAG_STYLE}${brandCss}${PHOTO_STYLE}</style></head><body>
${final ? '' : '<div class="draft">DRAFT</div>'}
<div class="band"><div><div class="kind">${internal ? 'Internal technician report' : 'Diagnostic report'}</div><h1>${esc([d.vehicleInfo?.make, d.vehicleInfo?.model].filter(Boolean).join(' ') || vehicle?.name || job?.vehicle || 'Vehicle')}</h1></div>
${shopBlock(settings, brand.logo)}</div>
<div class="meta"><span>Report <b>${esc(number)}</b></span>${revision ? `<span><b>${esc(revision)}</b></span>` : ''}${job ? `<span>Work order <b>${esc(job.title)}</b></span>` : ''}
<span>Date <b>${esc(at(final ? d.finalizedAt : d.updated))}</b></span><span>Status <b>${final ? 'Final' : 'DRAFT'}</b></span>${d.technician ? `<span>Technician <b>${esc(d.technician)}</b></span>` : ''}</div>
${internal ? '<div class="internalbar">INTERNAL: for the shop only. Contains internal notes and is not the customer report.</div>' : ''}
${final ? '' : '<div class="draftbar">DRAFT: this diagnosis has not been finalized. Findings and recommendations may change.</div>'}
${SAFETY_WARNING.includes(d.severity) ? `<div class="danger"><b>${esc(SAFETY_LEVELS[d.severity])}.</b> ${esc(SAFETY_TEXT[d.severity])}</div>` : ''}
${internal ? '' : customerSummary(d)}
<div class="grid"><div class="box"><h3>Customer</h3>${customer ? `${esc(customer.name)}${customer.phone || customer.email ? `<br>${esc([customer.phone, customer.email].filter(Boolean).join(' · '))}` : ''}` : '<span class="muted">Not recorded</span>'}</div>
${vehicleBox(d, vehicle, job)}</div>
<h2>Customer complaint</h2><p>${d.complaint ? lines(d.complaint) : job?.symptom ? lines(job.symptom) : '<span class="muted">Not recorded</span>'}</p>
${d.symptoms.length ? `<h2>Symptoms observed</h2><div class="chips">${d.symptoms.map(s => `<span>${esc(s)}</span>`).join('')}</div>` : ''}
${d.intakeCondition ? `<h2>Condition at intake</h2><p>${lines(d.intakeCondition)}</p>` : ''}
${inspectionTable(d, internal)}
${readingsTable(d, internal, at)}
${findingsBlock(d)}
${internal && (d.confidence || d.evidence) ? `<h2>Confidence and evidence</h2>${d.confidence ? `<p>Confidence: <b>${esc(CONFIDENCE[d.confidence])}</b></p>` : ''}${d.evidence ? `<p>${lines(d.evidence)}</p>` : ''}` : ''}
<h2>Safety status</h2><p>${d.severity ? esc(SAFETY_LEVELS[d.severity]) : '<span class="muted">Not assessed</span>'}</p>
${d.recommendations ? `<h2>Recommended work</h2><p>${lines(d.recommendations)}</p>` : ''}
${d.parts ? `<h2>Parts needed</h2><p>${lines(d.parts)}</p>` : ''}
${warrantyBlock(d)}
${d.verification ? `<h2>Verification after repair</h2><p>${lines(d.verification)}</p>` : ''}
${internal && d.internalNotes ? `<h2>Internal notes</h2><p>${lines(d.internalNotes)}</p>` : ''}
${photoSection(photos)}
${internal && d.audit?.length ? `<h2>History</h2><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>${d.audit.map(e => `<tr><td class="num">${esc(at(e.at))}</td><td>${esc(e.by) || '—'}</td><td>${esc(AUDIT_ACTIONS[e.action])}</td><td>${esc(e.note)}</td></tr>`).join('')}</tbody></table>` : ''}
<div class="notice">Measurements in this report were taken and entered by the technician; they were not recorded by EVCore test equipment.
Each reading is compared only with the expected range shown and its source. Suspected causes are the technician's assessment and are not confirmed unless marked Confirmed.
This report describes the checks listed and does not certify the whole vehicle. EVCore Studio organizes evidence and documentation; it does not replace the technician's
judgment, the manufacturer's instructions or required safety procedures.</div>
<div class="sign"><div>Technician${final && d.finalizedBy ? `: ${esc(d.finalizedBy)}` : d.technician ? `: ${esc(d.technician)}` : ''}</div>${internal ? '<div>Reviewed by</div>' : '<div>Customer</div>'}<div>Date${final ? `: ${esc(at(d.finalizedAt))}` : ''}</div></div>
<div class="foot"><span>${esc(settings.shopName || '')}${final ? ` · ${esc(number)} ${esc(revision)}` : ' · DRAFT'}</span><span>Prepared with EVCore Studio ${esc(appVersion)} · generated ${esc(at(generated))}</span></div>
</body></html>`;
}

export const diagnosisReportHtml = args => diagnosisDocument({...args, internal: false});
export const internalReportHtml = args => diagnosisDocument({...args, internal: true});

