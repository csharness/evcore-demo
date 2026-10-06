import {esc, badge, time, download} from '../core/ui.js';
import {csv} from '../domain.js';
import {metrics, chart} from './components.js';

export const live = {
  id: 'live',
  heading: 'Live data',
  render({state}) {
    return `${metrics()}<section class="panel"><div class="panelhead"><div><h2>Signal capture</h2><div class="sub">Rolling buffer · up to 480 samples</div></div>
      <div class="actions"><button data-action="freeze" aria-pressed="${state.frozen}">${state.frozen ? 'Resume view' : 'Freeze view'}</button>
      <button data-action="export-trace" ${state.samples.length ? '' : 'disabled'}>Export CSV ↓</button></div></div>
      ${state.source === 'demo' ? chart() : '<div class="empty">Live sample acquisition is not yet part of the device protocol.<br>Completed measurements remain available in Diagnostics.</div>'}
      <p>Freezing pauses the view only. The device and data collection keep running.</p></section>
      <section class="panel"><h2>Test notes</h2><p>Saved with the next completed test report.</p>
      <textarea class="notebook" id="notes" data-input="notes" maxlength="2000" aria-label="Test notes" placeholder="Symptom, operating conditions, adapter, observations…">${esc(state.notes)}</textarea></section>`;
  },
  actions: {
    freeze(_el, {state, render}) { state.frozen = !state.frozen; render(); },
    'export-trace'(_el, {state}) {
      const label = state.source === 'usb' ? 'device' : 'simulation';
      download(`evcore-${label}-trace.csv`, csv([['source', 'time_iso', 'bus_voltage_V', 'signal_V', 'current_A'],
        ...state.samples.map(s => [label, new Date(s.time).toISOString(), s.voltage, s.signal, s.current])]), 'text/csv');
    }
  },
  inputs: {notes(el, {state}) { state.notes = el.value.slice(0, 2000); }}
};

export function busTable(state) {
  const q = state.filter.toLowerCase();
  const rows = state.frames.filter(f => (`${f.id} ${f.data.map(x => x.toString(16).padStart(2, '0')).join(' ')}`).toLowerCase().includes(q)).slice(0, 16);
  return `<div class="tablewrap"><table><thead><tr><th>Time</th><th>Bus</th><th>Identifier</th><th>Length</th><th>Payload · hex</th><th>Source</th></tr></thead><tbody>
    ${rows.map(f => `<tr><td class="mono">${time(f.time)}</td><td>${esc(f.bus)}</td><td class="mono">${esc(f.id)}</td><td>${f.data.length}</td>
      <td class="mono">${f.data.map(x => x.toString(16).padStart(2, '0').toUpperCase()).join(' ')}</td><td>${badge('SIM', 'gray')}</td></tr>`).join('')}</tbody></table>
    ${rows.length ? '' : '<div class="empty">No matching frames.</div>'}</div>`;
}

export const bus = {
  id: 'bus',
  heading: 'Bus frames',
  render({state}) {
    return `<section class="panel"><div class="panelhead"><div><h2>Raw frame inspector</h2><div class="sub">${state.source === 'demo' ? 'Synthetic classic CAN frames · no decoded claims' : 'Bus streaming is not yet part of the device protocol'}</div></div>${badge('RECEIVE ONLY', 'gray')}</div>
      <div class="toolbar"><input type="text" id="frame-filter" data-input="frame-filter" placeholder="Filter by ID or bytes…" value="${esc(state.filter)}" aria-label="Filter bus frames">
      <button data-action="freeze" aria-pressed="${state.frozen}">${state.frozen ? 'Resume capture view' : 'Freeze capture view'}</button><span class="spacer"></span>
      <button data-action="export-bus" ${state.frames.length ? '' : 'disabled'}>Export CSV ↓</button></div><div id="bus-table">${busTable(state)}</div>
      <div class="notice">Transmission, protocol decoders and termination control are not enabled. Expert mode cannot unlock a capability the device does not offer.</div></section>`;
  },
  actions: {
    'export-bus'(_el, {state}) {
      download('evcore-simulated-can.csv', csv([['source', 'time_iso', 'bus', 'id', 'data_hex'],
        ...state.frames.map(f => ['simulation', new Date(f.time).toISOString(), f.bus, f.id, f.data.map(x => x.toString(16).padStart(2, '0')).join(' ')])]), 'text/csv');
    }
  },
  inputs: {'frame-filter'(el, {state, refreshBus}) { state.filter = el.value; refreshBus(); }}
};
