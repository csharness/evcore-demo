// Help: how Studio is meant to be used, and where its safety boundaries are (roadmap #96).
import {openPilotFeedback, feedbackAvailable} from './feedback.js';

export const help = {
  id: 'help',
  actions: {'pilot-feedback'(_el, ctx) { return openPilotFeedback(ctx, {screen: 'Help'}); }},
  heading: 'Help',
  render({db, platform, license}) {
    const sim = platform.simulation;
    return `<div class="twocol"><section class="panel"><h2>A typical job</h2><ol class="helplist">
      <li><b>Connect</b> the EVCore D1 by USB${sim ? ', or use a simulator to practise' : ''}.</li>
      <li><b>Identify</b> the vehicle: choose or create the customer, vehicle and work order. Every test is saved to the active work order.</li>
      <li><b>Verify safe conditions</b> with the checklist before each test.</li>
      <li><b>Test.</b> The device runs the test and decides whether outputs may turn on. Stop it at any time with <b>Stop test</b> or <kbd>Esc</kbd>.</li>
      <li><b>Review</b> the results and write your findings and recommendation.</li>
      <li><b>Report:</b> save the service report PDF for the customer.</li></ol>
      <button class="primary" data-action="nav" data-view="workflow">Start a guided job ➜</button></section>
    <section class="panel"><h2>Reading results</h2>
      <p><b>PASS</b> means the readings met the selected test profile's limits. It does not certify the whole component or vehicle.</p>
      <p><b>FAIL</b> means a reading was outside the profile's limits. Check the adapter and profile before treating it as a component failure.</p>
      <p><b>UNKNOWN (no conclusion)</b> means the test could not produce a result. The reason is listed under <i>Instrument and safety events</i>:
      an instrument problem, a safety interlock, a setup problem or a cancelled test. None of these are faults in the vehicle.</p>
      ${sim ? '<p><b>SIMULATED</b> marks data from the in-app demo or the firmware simulator. It never came from a physical test, and service reports say so.</p>' : ''}</section></div>
    <div class="twocol"><section class="panel"><h2>Safety boundaries</h2><ul class="helplist">
      <li>The device enforces every interlock itself. Studio only asks; it cannot override STOP, faults or output permissions, in any mode.</li>
      <li>Closing Studio or losing the connection never confirms that outputs are off. Use the device's local STOP control.</li>
      <li>After a fault, fix the cause, then reset it explicitly. A reset never restarts a test.</li>
      <li>Test limits in this version are illustrative until approved test profiles exist.</li></ul></section>
    <section class="panel"><h2>Keyboard and data</h2><ul class="helplist">
      <li><kbd>Esc</kbd> stops a running test. <kbd>Tab</kbd> moves through controls; <kbd>Enter</kbd> or <kbd>Space</kbd> opens a highlighted row.</li>
      <li>${db.kind === 'desktop' ? 'Records are saved on this computer and backed up automatically once a day. Manage backups in Settings &gt; Data and backups.'
        : db.kind === 'device' ? 'Records are saved in the app on this device. Turn on Sync records across devices in Settings to keep them on your account too.'
        : license?.state === 'demo' ? 'This is the interactive demo: records stay in this browser. EVCore Studio saves them on your computer and backs them up every day.'
        : 'This is the developer web preview: records stay in this browser and are not backed up.'}</li>
      <li>Export work orders and report archives from their screens to move them to another computer.</li>
      ${sim ? '<li>On <b>Device screen</b> with the firmware simulator, the arrow keys turn the knob, <kbd>Enter</kbd> presses it and <kbd>Backspace</kbd> goes back.</li>' : ''}
      <li>Each time a device connects, Studio checks for newer firmware for it and shows a notice when there is one.</li></ul></section></div>
    <section class="panel"><h2>Report a problem or ask for a feature</h2>
      <p>Tell us what is not working or what you would like Studio to do. Sign in on the website with this Studio account; you can follow our answers there.</p>
      <div class="actions"><button class="primary" data-action="open-website" data-page="/pages/feedback">Report a problem or request a feature</button>
        ${feedbackAvailable() ? '<button data-action="pilot-feedback">Send feedback from Studio</button>' : ''}
        <button data-action="support-save">Save support info</button>
        <button data-action="open-website" data-page="/pages/get-started">Getting started guide</button></div>
      <p class="protocol-note">Reporting a problem? Save support info and attach the file: it holds Studio's version, your license state and recent errors, never your customers, vehicles or reports.</p></section>`;
  }
};

// First-run checklist for Studio (manual diagnosis), shown above the diagnoses until every step is
// done or the technician hides it: from a fresh install to the first report for a customer.
export function studioSteps(db) {
  return [
    [Boolean(db.settings.shopName), 'Add your shop details', 'Your shop name, phone and address are printed on every report. Add your logo, colour and font under Report branding.', 'settings:shop', ''],
    [db.jobs.length > 0, 'Create your first work order', 'Add the customer and their bike. Every diagnosis belongs to a work order.', 'jobs', 'job-new'],
    [db.diagnoses.length > 0, 'Write your first diagnosis', 'Record the complaint, your readings with their expected range, and what you found.', 'manual', 'manual-new'],
    [db.diagnoses.some(d => d.status === 'Final'), 'Confirm a finding and finalize the report', 'Mark the cause Confirmed and say how, choose the safety status, then Finalize: the report gets its number. Save and create PDF makes the customer copy.', 'manual', '']];
}

export function studioGettingStarted({db, state}) {
  const steps = studioSteps(db);
  const left = steps.filter(([done]) => !done).length;
  if (!left || state.hideGettingStarted || db.settings.onboardingHidden) return '';
  const next = steps.findIndex(([done]) => !done);
  return `<section class="panel getting-started"><div class="panelhead"><div><h2>${left === steps.length ? 'Welcome to EVCore Studio' : 'Getting started'}</h2>
      <div class="sub">${left === steps.length ? 'Four steps to your first report for a customer, about ten minutes.' : `${steps.length - left} of ${steps.length} done.`}</div></div>
      <button class="small quiet" data-action="getting-started-hide">Hide</button></div>
    <ol class="startlist welcome-steps">${steps.map(([done, title, detail, view, then], i) => `<li class="${done ? 'done' : i === next ? 'next' : ''}"><span aria-hidden="true">${done ? '✓' : i + 1}</span>
      <div><b>${done ? `<s>${title}</s>` : title}</b><small>${detail}</small></div>
      ${done ? '' : `<button class="small ${i === next ? 'primary' : ''}" data-action="nav" data-view="${view}"${then ? ` data-then="${then}"` : ''}>${i === next ? 'Start' : 'Open'}</button>`}</li>`).join('')}</ol>
    <p class="protocol-note">Stuck? <button class="linklike" data-action="nav" data-view="help">See Help</button> or <button class="linklike" data-action="open-website" data-page="/pages/feedback">ask us</button>. We answer within one business day.</p></section>`;
}

// First-run checklist for the dashboard; hidden once every step is done.
export function gettingStarted({db, state, platform}) {
  const steps = [
    [Boolean(db.settings.shopName), 'Add your shop details for service reports', 'settings:shop'],
    [state.connected, platform.simulation ? 'Connect the EVCore D1, or a simulator to practise' : 'Connect your EVCore D1 by USB', 'settings:device'],
    [db.jobs.length > 0, 'Create your first work order', 'workflow'],
    [db.jobs.some(j => j.status === 'Complete'), 'Finish a guided job and save its service report', 'workflow']];
  if (steps.every(([done]) => done) || state.hideGettingStarted || db.settings.onboardingHidden) return '';
  return `<section class="panel getting-started"><div class="panelhead"><h2>Getting started</h2><button class="small quiet" data-action="getting-started-hide">Hide</button></div>
    <ol class="startlist">${steps.map(([done, text, view]) => `<li class="${done ? 'done' : ''}"><span aria-hidden="true">${done ? '✓' : '○'}</span>
      ${done ? `<s>${text}</s>` : `<button class="linklike" data-action="nav" data-view="${view}">${text}</button>`}</li>`).join('')}</ol></section>`;
}
