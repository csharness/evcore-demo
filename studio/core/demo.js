// Interactive demo (demo.csharness.com): the web app with sample shop records and no account.
// scripts/build-demo.mjs builds it from public/ and marks index.html with data-demo="studio".
// Studio is what a visitor can pre-order; the Studio Pro preview runs on the in-app demo device,
// and every reading from it is labeled simulated as always. Nothing leaves the browser.
import {esc} from './ui.js';
import {icon} from './icons.js';

export const isDemo = () => globalThis.document?.documentElement.dataset.demo === 'studio';
export const SITE = 'https://csharness.com';

// A website page opened from the demo, tagged so the shop's analytics can see where visits came from.
export const siteUrl = page => `${SITE}${/^\/[a-z0-9/-]{0,80}$/.test(page) ? page : '/'}?utm_source=studio-demo&utm_medium=demo`;

// The license the demo runs under: usable, no account, the edition the visitor is looking at.
export const demoLicense = plan => ({state: 'demo', plan: plan === 'pro' ? 'pro' : 'studio'});

const SHOP = {shopName: 'Riverside E-Bike Repair (sample)', shopPhone: '(555) 010-0144', shopAddress: '12 Mill Street, Springfield', technician: 'A. Rivera'};
const DAY = 86400000;

// Sample records, added once to an empty demo. Names, phone numbers and readings are invented;
// each range carries the source a technician would have written down.
export async function seedDemo(db, now = Date.now()) {
  if (db.jobs.length || db.customers.length || db.diagnoses.length) return false;
  for (const [key, value] of Object.entries(SHOP)) await db.setSetting(key, value);
  const job = async (title, customer, vehicle, symptom, status, age) => {
    const {record: c} = await db.add('customers', {name: customer.name, phone: customer.phone, email: customer.email || '', created: now - age});
    const {record: v} = await db.add('vehicles', {customerId: c.id, created: now - age, ...vehicle});
    const {record: j} = await db.add('jobs', {title, vehicle: vehicle.name, symptom, status, customerId: c.id, vehicleId: v.id, created: now - age,
      closed: status === 'Complete' ? now - age + DAY : null});
    return j;
  };
  const done = await job('WO-0139', {name: 'Priya Natarajan (sample)', phone: '(555) 010-0107'},
    {name: 'Folding e-scooter, 36 V', battery: '36 V 10 Ah', controller: 'Stock'}, 'Will not power on after a wet ride', 'Complete', 6 * DAY);
  await db.add('diagnoses', {jobId: done.id, technician: 'A. Rivera', created: now - 6 * DAY,
    complaint: 'Scooter will not power on after being ridden in heavy rain.',
    symptoms: ['Will not power on', 'Water exposure'],
    readings: [
      {what: 'Battery voltage, at rest', where: 'Battery output connector', value: 39.8, unit: 'V', min: 30, max: 42, source: 'Battery label'},
      {what: 'Voltage after the power switch', where: 'Switch output, switch on', value: 0.2, unit: 'V', min: 30, max: 42, source: 'Should match the battery voltage'}],
    findings: [
      {text: 'Power switch contacts corroded', status: 'confirmed', how: 'Switch opened; green corrosion on the contacts, no continuity when pressed'}],
    recommendations: 'Replace the power switch and seal the switch housing.', parts: 'Power switch assembly'});
  const main = await job('WO-0142', {name: 'Dana Whitfield (sample)', phone: '(555) 010-0199', email: 'dana@example.com'},
    {name: 'Commuter e-bike, rear hub motor', battery: '48 V 14 Ah', motor: 'Rear hub, 500 W', controller: 'Stock'},
    'Cuts out when the throttle is opened', 'In progress', 2 * DAY);
  await db.add('diagnoses', {jobId: main.id, technician: 'A. Rivera', created: now - 2 * DAY,
    complaint: 'Motor cuts out under load on hills; restarts after the throttle is released.',
    symptoms: ['Cuts out under load', 'Intermittent power', 'Throttle not responding'],
    readings: [
      {what: 'Battery voltage, at rest', value: 51.4, unit: 'V', min: 42, max: 54.6, source: 'Battery label'},
      {what: 'Battery voltage, under load', value: 43.9, unit: 'V', min: 44, max: 54.6, source: 'Shop practice'},
      {what: 'Throttle signal, closed', value: 0.84, unit: 'V', min: 0.8, max: 1.0, source: 'Throttle datasheet'},
      {what: 'Throttle signal, fully open', value: 4.21, unit: 'V', min: 4.0, max: 4.4, source: 'Throttle datasheet'}],
    findings: [
      {text: 'Battery voltage sags below the expected range under load', status: 'confirmed', how: 'Measured at the controller input on a hill climb'},
      {text: 'Weak cell group in the battery pack', status: 'suspected'},
      {text: 'Throttle output within range', status: 'observed'}],
    recommendations: 'Capacity-test the battery pack. Replace or rebuild it if a cell group is confirmed weak.',
    parts: 'Battery pack (pending capacity test)'});
  const next = await job('WO-0143', {name: 'Marcus Lee (sample)', phone: '(555) 010-0162'},
    {name: 'Cargo e-bike, mid-drive', battery: '48 V 20 Ah', motor: 'Mid-drive, 750 W'},
    'Power drops in and out; one phase connector looks discoloured', 'Open', 3 * 3600000);
  await db.setSetting('activeJobId', next.id);
  return true;
}

// The strip above every demo screen: what this is, the edition switch and the way to buy.
export function demoBanner(plan, touring, audience = 'shop') {
  const pro = plan === 'pro';
  return `<section class="demo-banner" aria-label="About this demo">
    <div class="demo-copy"><b>${icon('bolt')}Interactive demo</b>
      <span>${pro ? 'Studio Pro preview: it works with the EVCore D1 (coming later). Here a simulated D1 runs the tests, so every reading is simulated.'
        : 'Sample shop records. Try anything: what you type stays in this browser and is never sent anywhere.'}</span></div>
    <div class="demo-actions">${touring ? '' : '<button class="small" data-action="demo-tour-start">Guided tour</button>'}
      <div class="mode" role="group" aria-label="Edition">
        <button data-action="demo-edition" data-plan="studio" class="${pro ? '' : 'on'}" aria-pressed="${!pro}">Studio</button>
        <button data-action="demo-edition" data-plan="pro" class="${pro ? 'on' : ''}" aria-pressed="${pro}">Studio Pro preview</button></div>
      ${audience === 'business' ? '<button class="small primary" data-action="demo-contact" data-to="business">Talk to us</button>'
        : '<button class="small primary" data-action="open-website" data-page="/pages/software">Pre-order Studio</button>'}
      <button class="small quiet" data-action="demo-reset">Reset demo</button></div></section>`;
}

// The guided tour. Each step opens a screen (view), optionally a diagnosis ('sample' is WO-0142's)
// or a new one ('new'), and highlights one part of it: a CSS selector, or the panel whose heading
// is `heading`. Facts about the offer are the website's (csharness.com/pages/software).
const STEPS = [
  {view: 'manual', plan: 'studio', target: '.main table, .main .empty', title: 'Welcome to EVCore Studio',
    body: 'This is a sample e-bike repair shop. In about two minutes you will see how a technician records a diagnosis and gives the customer a clear report.'},
  {view: 'jobs', plan: 'studio', heading: 'Work orders', title: 'Every job is a work order',
    body: 'Each work order is linked to the customer and the bike, so a bike’s whole repair history is in one place. WO-0142 is a commuter e-bike that cuts out on hills.'},
  {view: 'manual', plan: 'studio', open: 'sample', heading: 'Measurements', title: 'Readings, checked against the right range',
    body: 'The technician enters each reading with its expected range and where that range comes from, like the battery label or a datasheet. Studio flags the one outside it: the voltage under load.'},
  {view: 'manual', plan: 'studio', open: 'sample', heading: 'Findings', title: 'Findings you can stand behind',
    body: 'Each finding is Observed, Suspected or Confirmed. A confirmed finding must say how it was confirmed, so a guess is never presented as a proven fault.'},
  {view: 'manual', plan: 'studio', open: 'sample', target: '[data-action="manual-save-pdf"]', title: 'A report for your customer', image: '../img/evcore-studio-report.jpg',
    body: 'One click turns the diagnosis into a PDF report with your shop’s details, ready to print or email. This is the one for WO-0142.'},
  {view: 'manual', plan: 'studio', open: 'new', heading: 'Vehicle and work order', title: 'Now try one yourself',
    body: 'Pick a work order (WO-0143 is waiting), add a measurement and a finding, then save. Everything stays in this browser.'},
  {view: 'diagnostics', plan: 'pro', target: '#start-test', title: 'Coming next: Studio Pro with the EVCore D1',
    body: 'With our EVCore D1 device, Studio Pro runs the tests for you and reads the results straight in. Here a simulated D1 stands in: tick the checklist and press Start test.'},
];
const FINAL = {
  shop: {view: 'manual', plan: 'studio', target: '.demo-banner [data-page="/pages/software"]', title: 'Get EVCore Studio', final: true,
    body: 'Pre-order Studio for $150 for 6 months and start with the beta straight away, on Windows 10 or 11. Full refund within 14 days.'},
  business: {view: 'manual', plan: 'studio', target: '.demo-banner [data-action="demo-contact"]', title: 'Bring this to your service network', final: true,
    body: 'Tell us about your dealers, service partners or fleet workshops, and we will set up a short call to see whether EVCore Studio fits how you handle service.'}
};
const WELCOME = {
  shop: STEPS[0].body,
  business: 'This is a sample repair shop using Studio. In about two minutes you will see the diagnosis and report every bike could get, at every shop that services your riders.'
};

export const AUDIENCES = ['shop', 'business'];
export const audienceOf = value => AUDIENCES.includes(value) ? value : 'shop';

// The tour for a lead from a repair shop, or for a business (brand, dealer, fleet).
export function tourSteps(audience = 'shop') {
  const who = audienceOf(audience);
  return [{...STEPS[0], body: WELCOME[who]}, ...STEPS.slice(1), FINAL[who]];
}
export const TOUR_STEPS = tourSteps('shop');

// The floating card that walks through TOUR_STEPS.
export function tourCard(index, audience = 'shop') {
  const steps = tourSteps(audience);
  const step = steps[index];
  if (!step) return '';
  const last = index === steps.length - 1;
  const business = audienceOf(audience) === 'business';
  return `<aside class="tour-card" role="dialog" aria-labelledby="tour-title" aria-live="polite">
    <div class="tour-progress"><span>Step ${index + 1} of ${steps.length}</span><button class="iconbtn" data-action="demo-tour-end" aria-label="Close the tour">✕</button></div>
    <h2 id="tour-title">${esc(step.title)}</h2><p>${esc(step.body)}</p>
    ${step.image ? `<img src="${esc(step.image)}" alt="The customer report for WO-0142">` : ''}
    <div class="tour-dots" aria-hidden="true">${steps.map((_, i) => `<span class="${i === index ? 'on' : i < index ? 'done' : ''}"></span>`).join('')}</div>
    ${last && !business ? '<p class="tour-aside">Questions first? <button class="linklike" data-action="demo-contact" data-to="shop">Ask us</button> and we reply within one business day.</p>' : ''}
    <div class="actions">${index ? '<button class="small" data-action="demo-tour-back">Back</button>' : ''}<div class="spacer"></div>
      ${last ? `<button class="small" data-action="demo-tour-end">Explore on my own</button>${business
          ? '<button class="small primary" data-action="demo-contact" data-to="business">Talk to us</button>'
          : '<button class="small primary" data-action="open-website" data-page="/pages/software">Pre-order Studio</button>'}`
        : `<button class="small primary" data-action="demo-tour-next">${index ? 'Next' : 'Start the tour'}</button>`}</div></aside>`;
}

// The element a step points at, once its screen is on the page.
export function tourTarget(step, root = document) {
  if (!step) return null;
  if (step.heading) return [...root.querySelectorAll('.main h2')].find(h => h.textContent.trim() === step.heading)?.closest('section') ?? null;
  return step.target ? root.querySelector(step.target) : null;
}

// The landing pages' contact forms, next to the app on the demo site.
export const CONTACT = {shop: '../#question', business: '../business/#contact'};
