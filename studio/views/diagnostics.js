// Tests (Studio Pro): choose a test, confirm the setup, run it on the device and read the result.
import {esc} from '../core/ui.js';
import {icon} from '../core/icons.js';
import {roadmap} from '../domain.js';
import {isSimulated} from '../records.js';
import {resultPanel} from './components.js';

const scenarios = [['healthy', 'Healthy signals'], ['phase-imbalance', 'Phase resistance imbalance'], ['sensor-high', 'Sensor stuck high']];

function testList({state}) {
  if (!state.profiles.length) return `<section class="panel tlist"><div class="empty">Connect a device or simulator to see its tests.<br>
    <button class="small primary" data-action="nav" data-view="settings">Connect</button></div></section>`;
  const groups = [...new Set(state.profiles.map(p => p.category))];
  return `<section class="panel tlist" aria-label="Tests">${groups.map(g => `<div class="grp">${esc(g)}</div>${state.profiles.filter(p => p.category === g).map(p =>
    `<button data-action="test-select" data-id="${esc(p.id)}" class="${p.id === state.selected ? 'on' : ''}" aria-pressed="${p.id === state.selected}"><b>${esc(p.name)}</b><span>${esc(p.detail)}</span></button>`).join('')}`).join('')}</section>`;
}

export const diagnostics = {
  id: 'diagnostics',
  heading: 'Tests',
  render({state, device}) {
    const profile = state.profiles.find(p => p.id === Number(state.selected));
    const simulated = isSimulated(state.source);
    return `<div class="tests">${testList({state})}
    <section class="panel flush setup"><div class="body">
      <h3>${esc(profile?.name || 'Choose a test')}</h3><p class="muted">${esc(profile?.detail || '')}</p>
      <dl class="kv"><dt>Profile</dt><dd class="num">${profile ? `${esc(profile.id)} · ${simulated ? 'simulated fixture' : 'device supplied'}` : '—'}</dd><dt>Mode</dt><dd>${state.mode === 'guided' ? 'Guided' : 'Expert'}</dd></dl>
      <p>${simulated ? 'This is a simulated device. Limits are illustrative, not approved thresholds.' : 'Check the firmware profile against your adapter and the vehicle. A profile ID alone does not identify compatible hardware.'}</p>
      ${state.source === 'demo' ? `<label class="field">Simulation scenario<select data-change="scenario">${scenarios.map(([v, l]) => `<option value="${v}" ${state.scenario === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      <label class="check"><input id="confirmed" data-change="confirm" type="checkbox" ${state.confirmed ? 'checked' : ''}>
        <span>${simulated ? 'I understand this is a simulated test with illustrative limits.' : 'I have checked the adapter, profile and test setup against the vehicle.'}</span></label>
      ${state.mode === 'expert' ? '<p class="note">Expert mode shows raw evidence and capture tools. It never overrides interlocks or permits arbitrary output commands.</p>' : ''}
      <div class="actions"><button id="start-test" class="primary big" data-action="test-start" ${device.canStart() ? '' : 'disabled'}>${icon('play')}${state.status.busy ? 'Test running…' : 'Start test'}</button>
        <button data-action="device-reset" ${state.connected && state.status.state === 'FAULT' ? '' : 'disabled'}>Reset fault</button>
        ${simulated ? `<button class="danger" data-action="device-estop" ${state.connected ? '' : 'disabled'}>Simulate E-stop</button>` : ''}
        ${state.source === 'simulator' ? `<button data-action="device-release" ${state.connected ? '' : 'disabled'}>Release E-stop</button>` : ''}</div>
      ${state.status.busy ? '<div class="progress" role="progressbar" aria-label="Test running"><div></div></div><p>The device is running the test. Stop it at any time with Esc.</p>' : ''}
      <p class="note">${icon('shield')}The D1 checks its own interlocks before energizing and stops on any fault, even if Studio is closed.</p></div></section>
    <section class="panel flush result"><div class="body">${resultPanel(state.latest, state.source, {entryId: state.latestEntryId})}</div></section></div>
    <section class="panel flush planned"><header class="panelhead"><h2>Planned tests</h2><span class="sub">Not in this version</span></header>
      <table class="list"><tbody>${roadmap.map(([name, detail]) => `<tr><td><b>${esc(name)}</b></td><td class="muted">${esc(detail)}</td></tr>`).join('')}</tbody></table></section>`;
  },
  changes: {
    confirm(el, {state, device}) { state.confirmed = el.checked; document.querySelector('#start-test').disabled = !device.canStart(); },
    scenario(el, {device}) { device.setScenario(el.value); }
  }
};
