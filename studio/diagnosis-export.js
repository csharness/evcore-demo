// Diagnoses as CSV (decision 0019), one row each, with the location on every row so exports from
// several locations can be combined. For the shop's own analysis: no customer names, phone numbers
// or email addresses. Times are ISO 8601 in UTC. Cells that a spreadsheet would run as a formula
// are prefixed with an apostrophe.
import {readingVerdict} from './records.js';
import {SAFETY_LEVELS, CONFIDENCE, WARRANTY_STATUSES} from './diagnosis-fields.js';

const COLUMNS = ['location', 'location_prefix', 'report_number', 'revision', 'status', 'finalized_at', 'finalized_by', 'technician', 'work_order', 'created_at', 'updated_at',
  'vehicle_category', 'make', 'model', 'model_year', 'serial', 'battery_class', 'warranty', 'safety', 'confidence', 'complaint', 'confirmed_findings',
  'suspected_findings', 'ruled_out', 'readings', 'readings_outside_range', 'recommended_work', 'parts'];

const iso = t => (Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : '');
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function diagnosesCsv(diagnoses, {settings = {}, jobOf = () => null} = {}) {
  const rows = diagnoses.map(d => {
    const v = d.vehicleInfo ?? {};
    const findings = status => d.findings.filter(f => f.status === status).map(f => f.text).join(' | ');
    return [settings.shopName, settings.reportPrefix, d.reportNumber, d.status === 'Final' ? d.revision : '', d.status, iso(d.finalizedAt), d.finalizedBy, d.technician,
      jobOf(d.jobId)?.title ?? '', iso(d.created), iso(d.updated), v.category, v.make, v.model, v.year ?? '', v.serial, v.batteryClass,
      v.warranty ? WARRANTY_STATUSES[v.warranty] : '', d.severity ? SAFETY_LEVELS[d.severity] : '', d.confidence ? CONFIDENCE[d.confidence] : '', d.complaint,
      findings('confirmed'), findings('suspected'), findings('ruled-out'), d.readings.length, d.readings.filter(r => readingVerdict(r) === 'outside').length,
      d.recommendations, d.parts];
  });
  return [COLUMNS, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
