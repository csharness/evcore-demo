// Pure workshop helpers: capture statistics, report comparison and troubleshooting guides.
export function statistics(samples, key) {
  const values = samples.map(s => s[key]).filter(Number.isFinite);
  if (!values.length) return null;
  return {count: values.length, min: Math.min(...values), max: Math.max(...values), mean: values.reduce((a, b) => a + b, 0) / values.length};
}

// Compares two reports of the same source, profile and revision, channel by channel.
export function compareReports(a, b) {
  if (!a || !b || a.source !== b.source || a.report.profile_id !== b.report.profile_id || a.report.profile_revision !== b.report.profile_revision) return null;
  return a.report.samples.map(s => {
    const other = b.report.samples.find(x => x.channel === s.channel && x.kind === s.kind && x.unit === s.unit);
    return other ? {channel: s.channel, unit: s.unit, before: s.value, after: other.value, delta: other.value - s.value} : null;
  }).filter(Boolean);
}

// Transparent checklists, not automated fault identification.
export const guides = {
  motor: {title: 'Motor will not run', test: 2, steps: ['Inspect connectors and harness condition with power isolated.',
    'Verify the approved adapter and motor profile.', 'Run a phase comparison; investigate contact resistance before concluding a winding fault.']},
  sensor: {title: 'Intermittent sensor response', test: 1, steps: ['Record when the symptom occurs and inspect the connector.',
    'Confirm the sensor supply and signal specifications from its documentation.', 'Run an analog range check. A passing snapshot does not exclude an intermittent fault.']},
  emf: {title: 'Uneven motor phase signals', test: 3, steps: ['Use the approved passive measurement setup.',
    'Keep speed and conditions consistent across all phase readings.', 'Compare passive back-EMF amplitudes. Do not connect a live vehicle to an unapproved fixture.']}
};
