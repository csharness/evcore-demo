// Connection manager: one transport at a time (in-app demo, firmware simulator, or USB),
// translating transport events into application state and saved reports.
import {DemoTransport, SerialTransport, FirmwareSimTransport} from '../transport.js';
import {validateReport} from '../domain.js';
import {isSimulatedDevice} from '../records.js';

export const SOURCE_LABEL = {demo: 'In-app demo', simulator: 'Firmware simulator', usb: 'USB device', emulator: 'D1 emulator'};

export function createDevice(app) {
  const {state, db} = app;
  let transport = null;

  function event(message) {
    state.events.unshift({time: Date.now(), message});
    state.events = state.events.slice(0, 80);
  }

  async function saveReport(report) {
    const {job} = db.context(db.settings.activeJobId);
    try {
      const {record, dropped} = await db.add('reports', {session: job ? job.title : 'Unassigned test', notes: state.notes,
        jobId: job?.id ?? null, source: state.source, device: state.device, report});
      state.latestEntryId = record.id;
      if (dropped) app.toast(`Report storage is full; the ${dropped} oldest report(s) were removed. Daily backups still hold them.`);
      if (job && job.status === 'Open') await db.update('jobs', job.id, {status: 'In progress'});
    } catch (error) { app.toast(`Could not save the report: ${error.message}`); }
  }

  function receive(e) {
    switch (e.type) {
    case 'connection': {
      // A simulator identity on the USB link is the D1 emulator: its data is labeled simulated.
      const source = e.mode === 'usb' && isSimulatedDevice(e.device) ? 'emulator' : e.mode;
      Object.assign(state, {connected: true, source, profiles: e.profiles, device: e.device || null, confirmed: false, error: ''});
      state.selected = e.profiles.find(p => p.id === state.selected)?.id ?? e.profiles[0]?.id ?? null;
      event(source === 'usb' ? 'USB device connected.' : `${SOURCE_LABEL[source]} connected. All data is simulated.`);
      app.render();
      if (e.mode !== 'demo') app.checkFirmware?.(state.device); // Every connection checks for newer firmware.
      break;
    }
    case 'status': {
      const previous = state.status;
      state.status = e;
      if (e.state !== previous.state || e.busy !== previous.busy) {
        event(`Device state: ${e.state}${e.outputs === 0 ? ' · outputs OFF' : ''}`);
        app.render();
      } else app.refreshLive();
      break;
    }
    case 'telemetry':
      state.samples.push(e.sample);
      state.samples = state.samples.slice(-480);
      if (!state.frozen) app.refreshLive();
      break;
    case 'frame':
      state.frames.unshift(e.frame);
      state.frames = state.frames.slice(0, 200);
      if (!state.frozen) app.refreshBus();
      break;
    case 'report':
      if (!validateReport(e.report)) { app.toast('Rejected an invalid device report.'); return; }
      state.latest = e.report;
      event(`${e.report.result}: ${e.report.reason}`);
      saveReport(e.report).then(app.render);
      break;
    case 'event': event(e.message); app.render(); break;
    case 'error': state.error = e.message; event(e.message); app.render(); break;
    case 'disconnected':
      state.connected = false;
      state.status = {state: e.unexpected ? 'LINK LOST' : 'DISCONNECTED', outputs: null, faults: null, busy: false};
      if (e.unexpected) { state.error = 'Connection lost. Physical output state is unconfirmed; use the device’s local STOP control.'; event(state.error); }
      app.render();
      break;
    default: break;
    }
  }

  async function connect(source) {
    state.error = '';
    // Customer builds carry no simulation; only a real EVCore D1 over USB (desktop/main.cjs).
    if (source !== 'usb' && app.simulation === false) {
      state.error = 'This version of EVCore Studio connects only to an EVCore D1 over USB.';
      app.render(); return;
    }
    try {
      if (transport) await transport.disconnect();
      Object.assign(state, {samples: [], frames: [], latest: null, latestEntryId: null, confirmed: false, device: null, screen: null, simStop: false, firmwareUpdate: null});
      transport = source === 'usb' ? new SerialTransport(receive) : source === 'simulator' ? new FirmwareSimTransport(receive) : new DemoTransport(receive);
      if (source === 'demo') transport.scenario = state.scenario;
      await transport.connect(db.settings.baud);
    } catch (error) {
      transport = null;
      state.connected = false;
      state.error = error.name === 'NotFoundError' ? 'No device was selected.' : error.message;
      app.render();
    }
  }

  const canStart = () => state.connected && !state.status.busy && state.status.state === 'DISARMED' && state.confirmed && state.selected;

  return {
    connect, canStart, receive,
    get transport() { return transport; },
    async start() {
      if (!canStart()) throw new Error('Verify the setup and device state before starting.');
      // Studio runs tests only on devices registered to the signed-in account (decision 0003).
      if (state.source === 'usb' && !await app.allowsDevice(state.device?.serial))
        throw new Error(`This device (serial ${state.device?.serial || 'unknown'}) is not registered to your account. Contact CS Harness to register it.`);
      state.latest = null;
      await transport.start(state.selected);
      event(`Started profile ${state.selected}`);
    },
    async stop() { await transport?.stop(); event('Stop requested through the device API.'); },
    async reset() { await transport?.reset(); state.error = ''; event('Explicit fault reset requested.'); },
    injectFault() { transport?.injectFault?.(); },
    // The device's own screen (SCREEN) and, on the firmware simulator only, its knob.
    async screen() { return state.connected && transport?.screen ? transport.screen() : null; },
    get hasKnob() { return state.connected && typeof transport?.knob === 'function'; },
    knob(action) { transport?.knob?.(action); },
    releaseStop() { transport?.releaseStop?.(); },
    setScenario(value) { state.scenario = value; if (transport instanceof DemoTransport) transport.scenario = value; },
    async disconnect() { await transport?.disconnect(); }
  };
}
