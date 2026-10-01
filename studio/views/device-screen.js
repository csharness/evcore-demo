// The device's own screen and controls (firmware evcore_ui, roadmap item 95). With the firmware
// simulator, the knob and STOP work, so the local interface can be used without hardware. With a
// USB device the screen is a read-only mirror: the real knob and STOP are physical.
import {esc, badge} from '../core/ui.js';
import {isSimulated} from '../records.js';

export const KNOB_KEYS = {ArrowRight: 'CW', ArrowDown: 'CW', ArrowLeft: 'CCW', ArrowUp: 'CCW', Enter: 'PRESS', Backspace: 'HOLD'};

export function screenHtml(screen) {
  if (!screen) return '<div class="tft-off">Waiting for the device screen…</div>';
  const scroll = screen.total > screen.visible
    ? `<div class="tft-scroll" aria-hidden="true"><span style="top:${(100 * screen.top / screen.total).toFixed(1)}%;height:${(100 * screen.visible / screen.total).toFixed(1)}%"></span></div>` : '';
  return `<div class="tft-title tone-${esc(screen.tone)}">${esc(screen.title)}</div>
    <div class="tft-status">${esc(screen.status)}</div>
    <div class="tft-body">${scroll}<div class="tft-rows" role="list">${screen.rows.map(row =>
      `<div role="listitem" class="tft-row k-${esc(row.kind)}${row.selected ? ' selected' : ''}"${row.selected ? ' aria-current="true"' : ''}>${esc(row.text)}</div>`).join('')}</div></div>
    <div class="tft-notice" role="status">${esc(screen.notice)}</div>
    <div class="tft-hint">${esc(screen.hint)}</div>`;
}

export const deviceScreen = {
  id: 'device-screen',
  heading: 'Device screen',
  render({state, device, platform}) {
    if (!state.connected && !platform.simulation) {
      return `<section class="panel"><h2>Connect your EVCore D1</h2>
        <p>This page mirrors the D1’s own screen and lets you use its knob from Studio. Connect the D1 with its USB cable.</p>
        <div class="actions"><button class="primary" data-action="connect" data-source="usb">Connect over USB</button></div></section>`;
    }
    if (!state.connected || state.source === 'demo') {
      return `<section class="panel"><h2>Connect the firmware simulator</h2>
        <p>The in-app demo has no device firmware, so it has no device screen. Connect the <b>firmware simulator</b> to use the
        simulated screen, knob and STOP. With a USB device, this page mirrors what the device’s screen shows.</p>
        <div class="actions"><button class="primary" data-action="connect" data-source="simulator">Connect firmware simulator</button></div></section>`;
    }
    const knob = device.hasKnob;
    const simulated = isSimulated(state.source);
    return `<div class="twocol"><section class="panel brickpanel"><div class="brick">
        <div class="brick-label">EVCORE D1 ${simulated ? '<span>SIMULATED</span>' : ''}</div>
        <div class="tft" id="device-tft" aria-live="polite" aria-label="Device screen">${screenHtml(state.screen)}</div>
        <div class="brick-controls">
          <div class="knob-group" role="group" aria-label="Encoder knob">
            <button class="knob-turn" data-action="knob" data-knob="CCW" ${knob ? '' : 'disabled'} aria-label="Turn the knob left">⟲</button>
            <button class="knob" id="device-knob" data-action="knob" data-knob="PRESS" ${knob ? '' : 'disabled'} aria-label="Press the knob" title="Press (Enter). Scroll the mouse wheel here to turn."></button>
            <button class="knob-turn" data-action="knob" data-knob="CW" ${knob ? '' : 'disabled'} aria-label="Turn the knob right">⟳</button>
          </div>
          <button class="small" data-action="knob" data-knob="HOLD" ${knob ? '' : 'disabled'} title="Long press on the device (Backspace)">Hold knob (back)</button>
          <button class="estop ${state.simStop ? 'pressed' : ''}" data-action="brick-stop" ${knob ? '' : 'disabled'} aria-pressed="${Boolean(state.simStop)}"
            title="${state.simStop ? 'Twist to release the STOP button' : 'Press the STOP button'}">${state.simStop ? 'RELEASE' : 'STOP'}</button>
        </div></div></section>
      <section class="panel"><div class="panelhead"><h2>Using the device screen</h2>${badge(knob ? 'INTERACTIVE' : 'MIRROR', knob ? '' : 'gray')}</div>
        ${knob ? `<p>Turn the knob with the arrow keys or the mouse wheel over the knob. <b>Enter</b> presses it and <b>Backspace</b> is a long press (back).</p>
          <p>Starting a test on the device takes two steps: choose the test, then turn to <b>Start test</b> on the confirmation page, which always opens on Cancel.
          Pressing the knob during a test stops it. Results started here are saved to the active work order like any other test.</p>
          <p><b>STOP</b> is the device’s hardware stop button. It stops everything whatever the screen shows, and latches until it is released and the fault is reset.</p>`
          : '<p>This is a live mirror of the USB device’s screen. Use the knob and STOP on the device itself.</p>'}
        <div class="notice">The screen layout is illustrative. The display size, resolution and fonts are open hardware decisions
        (D1 Rev 0.9: 4-inch colour TFT, rotary encoder with push).</div></section></div>`;
  },
  actions: {
    knob(el, {device}) { device.knob(el.dataset.knob); refreshSoon(); },
    'brick-stop'(_el, {state, device, render}) {
      if (state.simStop) device.releaseStop(); else device.injectFault();
      state.simStop = !state.simStop;
      render(); refreshSoon();
    }
  }
};

let refresher = null;
// app.js registers the function that fetches and draws the screen; knob actions ask for it early.
export function setScreenRefresher(fn) { refresher = fn; }
function refreshSoon() { setTimeout(() => refresher?.(), 40); }
