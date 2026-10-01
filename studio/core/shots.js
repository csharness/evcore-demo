// Website screenshots (development only): `electron . --screenshots=<folder>` stages each scene
// with sample data and desktop/main.cjs captures it. Runs against the throwaway local license
// server the smoke test uses, so the frame shows a real Studio or Studio Pro license. Every Pro
// scene uses the in-app demo, and Studio labels it simulated as always; the website captions say
// so. Never available in packaged builds.
import {diagnosisReportHtml} from '../views/report-document.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

export function installShots(ctx) {
  const {state, navigate, setLicense} = ctx;
  const email = 'screenshots@example.test', admin = (...a) => globalThis.evcore.license.smokeAdmin(...a);
  const click = selector => { const el = document.querySelector(selector); if (!el) throw new Error(`Missing ${selector}`); el.click(); };
  let diagnosisId = null;

  async function signIn() {
    await globalThis.evcore.license.signUp(email, 'screenshot-password-1');
    await setLicense(await globalThis.evcore.license.verifyEmail(email, await admin('code', email)));
    const {db} = ctx;
    for (const [key, value] of Object.entries({shopName: 'Riverside E-Bike Repair', shopPhone: '(555) 010-0144',
      shopAddress: '12 Mill Street, Springfield', technician: 'A. Rivera'})) await db.setSetting(key, value);
  }

  async function sampleJob(title, customerName, vehicleName, symptom) {
    const {db} = ctx;
    const {record: customer} = await db.add('customers', {name: customerName, phone: '(555) 010-0199'});
    const {record: vehicle} = await db.add('vehicles', {customerId: customer.id, name: vehicleName});
    const {record: job} = await db.add('jobs', {title, vehicle: vehicleName, symptom, status: 'Open', customerId: customer.id, vehicleId: vehicle.id});
    await db.setSetting('activeJobId', job.id);
    return job;
  }

  // Blog article images (`--shots=blog-`): sample manual diagnoses in the light theme under a Studio
  // license from the throwaway license server, and their PDF reports at full page height. The
  // articles caption them as sample jobs.
  let signedIn = false;
  const blogIds = {};
  async function blogDiagnosis(key, job, fields) {
    if (!signedIn) {
      await signIn(); await admin('grant-studio', email);
      await setLicense(await globalThis.evcore.license.renew()); await wait(1200);
      await ctx.db.setSetting('theme', 'light'); state.hideGettingStarted = true; signedIn = true;
    }
    const {id} = await sampleJob(...job);
    const {record} = await ctx.db.add('diagnoses', {jobId: id, technician: 'A. Rivera', status: 'Final', ...fields});
    blogIds[key] = record.id;
    navigate('manual'); await wait(300);
    // As the list's open action does, minus the empty rows to type into: this is a finished diagnosis.
    state.manual.draft = {...structuredClone(ctx.db.diagnosis(record.id)), newJob: {}}; ctx.render(); await wait(300);
  }
  const panel = title => [...document.querySelectorAll('.manual section.panel')].find(s => s.querySelector('h2')?.textContent === title);
  const field = id => document.getElementById(id);
  const row = id => field(id).closest('tr');

  // Numbered callouts drawn over the window: a ring and a number on each element, and a key below
  // the panels saying what the technician is doing at each step. Styles go through the CSSOM (the
  // page's CSP allows no inline styles).
  const ACCENT = '#d9480f', FONT = "Inter,'Segoe UI',system-ui,sans-serif";
  function make(tag, css, parent, text) {
    const el = document.createElement(tag); el.style.cssText = css; if (text !== undefined) el.textContent = text; parent.append(el); return el;
  }
  const badge = (parent, n, css = '') => make('span', `flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;
    border-radius:50%;background:${ACCENT};color:#fff;font:700 13px/1 ${FONT};box-shadow:0 0 0 2px #fff;${css}`, parent, String(n));
  function annotate(notes, area) {
    document.getElementById('shot-notes')?.remove();
    const layer = make('div', 'position:fixed;inset:0;pointer-events:none;z-index:99999', document.body);
    layer.id = 'shot-notes';
    notes.forEach(({target, corner = 'left'}, i) => {
      const r = target.getBoundingClientRect(), pad = 4;
      const ring = make('div', `position:fixed;left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + 2 * pad}px;height:${r.height + 2 * pad}px;
        border:2.5px solid ${ACCENT};border-radius:8px;box-sizing:border-box`, layer);
      badge(ring, i + 1, `position:absolute;top:-13px;${corner === 'right' ? 'right' : 'left'}:-13px`);
    });
    const key = make('div', `position:fixed;left:${area.left}px;top:${area.bottom + 12}px;width:${area.width}px;box-sizing:border-box;
      display:grid;grid-template-columns:repeat(${notes.length > 3 ? 2 : notes.length},minmax(0,1fr));gap:10px 28px;padding:16px 20px;
      background:#fff;border:1.5px solid ${ACCENT};border-radius:10px`, layer);
    notes.forEach(({text}, i) => {
      const item = make('div', `display:flex;gap:10px;align-items:flex-start;font:400 15px/1.45 ${FONT};color:#1f2937`, key);
      badge(item, i + 1); make('span', 'padding-top:2px', item, text);
    });
    return layer;
  }
  // The window area covering these panels and their notes, with a margin, after scrolling the first near the top.
  function cropTo(titles, notes = []) {
    const panels = titles.map(panel);
    panels[0].scrollIntoView({block: 'start'});
    document.querySelector('.main').scrollTop -= 16;
    const box = panels.map(p => p.getBoundingClientRect()).reduce((a, r) => ({left: Math.min(a.left, r.left), bottom: Math.max(a.bottom, r.bottom), right: Math.max(a.right, r.right)}),
      {left: Infinity, bottom: -Infinity, right: -Infinity});
    const layer = notes.length ? annotate(notes.map(n => ({...n, target: n.target()})), {...box, width: box.right - box.left}) : null;
    const rects = [...panels, ...(layer ? layer.children : [])].map(p => p.getBoundingClientRect()), m = 14;
    const x = Math.max(0, Math.min(...rects.map(r => r.left)) - m), y = Math.max(0, Math.min(...rects.map(r => r.top)) - m);
    const right = Math.min(innerWidth, Math.max(...rects.map(r => r.right)) + m), bottom = Math.min(innerHeight, Math.max(...rects.map(r => r.bottom)) + (layer ? 3 : m));
    return {rect: {x: Math.round(x), y: Math.round(y), width: Math.round(right - x), height: Math.round(bottom - y)}};
  }

  // The PDF report with numbered notes in a right margin, next to the heading each explains. The
  // report view runs no scripts, so the notes are plain markup and CSS added to the page.
  const MARGIN = 330;
  function blogReport(key, notes) {
    const {db, about} = ctx, diagnosis = db.diagnosis(blogIds[key]);
    const {job, vehicle, customer} = db.context(diagnosis.jobId);
    let html = diagnosisReportHtml({diagnosis, job, vehicle, customer, settings: db.settings, generated: Date.now(), appVersion: about?.version || 'preview'});
    // The page keeps its Letter width; the notes sit in the margin to its right, past its own padding.
    const css = `<style>html{background:#fff}body{width:816px;box-sizing:border-box;margin:0!important}h2,.meta{position:relative}
      .shot-note{position:absolute;left:calc(100% + 72px);top:-8px;width:${MARGIN - 30}px;box-sizing:border-box;display:flex;gap:9px;align-items:flex-start;
        padding:8px 12px 8px 8px;background:#fff4ec;border:1.5px solid ${ACCENT};border-radius:8px;font:500 13.5px/1.4 ${FONT};color:#3b1606;
        text-transform:none;letter-spacing:0;white-space:normal}
      .shot-note b{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${ACCENT};
        color:#fff;font:700 12.5px/1 ${FONT}}
      .shot-note::before{content:'';position:absolute;right:100%;top:18px;width:62px;border-top:1.5px dashed ${ACCENT}}</style></head>`;
    html = html.replace('</head>', css);
    notes.forEach(([anchor, text], i) => {
      const note = `<span class="shot-note"><b>${i + 1}</b><span>${text}</span></span>`;
      html = anchor === 'meta' ? html.replace(/(<div class="meta">)/, `$1${note}`) : html.replace(`<h2>${anchor}</h2>`, `<h2>${anchor}${note}</h2>`);
    });
    return {fullPage: true, width: 816 + MARGIN, html};
  }
  const cutout = {
    complaint: 'Bike dies on hills and when I accelerate hard. The display goes off too. Comes back after a few seconds.',
    symptoms: ['Cuts out under load', 'Intermittent power'],
    readings: [
      {what: 'Battery voltage, at rest', where: 'Battery output, fully charged', value: 54.2, unit: 'V', min: 42, max: 54.6, source: 'Battery label'},
      {what: 'Battery voltage, under load', where: 'Battery output, bench load test', value: 43.4, unit: 'V', min: 44, max: 54.6, source: 'Shop practice'},
      {what: 'Controller supply voltage', where: 'Controller input, bench load test', value: 43.1, unit: 'V', min: 44, max: 54.6, source: 'Shop practice'}],
    findings: [
      {text: 'Battery voltage sags below the expected range under load, and the system shuts off', status: 'confirmed', how: 'Bench load test; a known-good battery passes the same test without cutting out'},
      {text: 'Weak cell group in the battery pack', status: 'suspected', how: ''},
      {text: 'Main connectors clean, no heat marks; only 0.3 V lost across them under load', status: 'observed', how: ''},
      {text: 'Brake cut-off switches release correctly', status: 'observed', how: ''}],
    recommendations: 'Capacity-test the battery pack and check the cell-group voltages. Replace or rebuild the pack if a cell group is confirmed weak.',
    parts: 'Battery pack (pending capacity test)'};
  const throttle = {
    complaint: 'Throttle does nothing. Pedal assist still works.',
    symptoms: ['Throttle not responding'],
    readings: [
      {what: 'Throttle supply', where: 'Throttle connector, red to black', value: 5.02, unit: 'V', min: 4.75, max: 5.25, source: 'Controller manual'},
      {what: 'Throttle signal, closed', where: 'Throttle connector, green to black', value: 0.86, unit: 'V', min: 0.8, max: 1.0, source: 'Throttle datasheet'},
      {what: 'Throttle signal, fully open', where: 'Throttle connector, green to black', value: 0.87, unit: 'V', min: 4.0, max: 4.4, source: 'Throttle datasheet'},
      {what: 'Throttle signal, fully open', where: 'Known-good throttle fitted', value: 4.19, unit: 'V', min: 4.0, max: 4.4, source: 'Throttle datasheet'}],
    findings: [
      {text: 'Throttle supply within range at the connector', status: 'observed', how: ''},
      {text: 'Signal does not change when the cable is moved', status: 'observed', how: ''},
      {text: 'Throttle sensor failed: the signal does not rise when the throttle is opened', status: 'confirmed', how: 'Known-good throttle of the same type reaches 4.19 V; motor responds'}],
    recommendations: 'Replace the throttle.',
    parts: 'Thumb throttle, same type as fitted'};

  async function runDemoTest(profile, scenario) {
    ctx.device.setScenario(scenario);
    navigate('diagnostics');
    state.selected = profile; ctx.render();
    const box = document.querySelector('#confirmed'); box.checked = true; box.dispatchEvent(new Event('change', {bubbles: true}));
    click('#start-test'); await wait(3000);
  }

  const scenes = {
    // Studio: a manual diagnosis, filled in by the technician.
    async 'studio-diagnosis'() {
      await signIn();
      const job = await sampleJob('WO-0142', 'Dana Whitfield', 'Commuter e-bike, rear hub motor', 'Cuts out when the throttle is opened');
      const {record} = await ctx.db.add('diagnoses', {jobId: job.id, technician: 'A. Rivera', status: 'Final',
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
      diagnosisId = record.id;
      navigate('manual'); click(`[data-action="manual-open"][data-id="${diagnosisId}"]`); await wait(300);
      // Show the measurements and findings, the heart of a diagnosis.
      [...document.querySelectorAll('h2, h3')].find(h => h.textContent.startsWith('Measurements'))?.closest('section')?.scrollIntoView({block: 'start'});
    },
    // Studio: the PDF diagnostic report for that diagnosis (rendered by main.cjs as a page).
    async 'studio-report'() {
      const {db, about} = ctx;
      const diagnosis = db.diagnosis(diagnosisId);
      const {job, vehicle, customer} = db.context(diagnosis.jobId);
      return {html: diagnosisReportHtml({diagnosis, job, vehicle, customer, settings: db.settings, generated: Date.now(), appVersion: about?.version || 'preview'})};
    },
    // Studio Pro: the Bench with results from the in-app demo (labeled simulated).
    async 'pro-bench'() {
      state.manual.draft = null;
      state.hideGettingStarted = true;
      await admin('grant', email);
      await setLicense(await globalThis.evcore.license.renew()); await wait(1200);
      await sampleJob('WO-0143', 'Marcus Lee', 'Cargo e-bike, mid-drive', 'Power drops in and out; one phase connector looks discoloured');
      await runDemoTest(1, 'healthy');
      await runDemoTest(2, 'phase-imbalance');
      navigate('dashboard'); await wait(20000); // let the signal trace fill
    },
    // Studio Pro: the Tests screen with the failing result and its diagnostic code.
    async 'pro-tests'() { navigate('diagnostics'); await wait(500); },
    // Blog: "E-bike cuts out under load": the complaint and symptoms, then measurements and findings.
    async 'blog-cutout-job'() {
      await blogDiagnosis('cutout', ['WO-0161', 'Sam Okafor', 'Commuter e-bike, 48 V, rear hub motor', 'Cuts out on hills'], cutout);
      const chip = name => [...document.querySelectorAll('.chip')].find(c => c.textContent.trim() === name);
      const chips = () => chip('Cuts out under load').parentElement;
      return cropTo(['Vehicle and work order'], [
        {target: () => document.querySelector('select[name="job"]'), text: 'Open the diagnosis on the customer\'s work order.'},
        {target: () => document.querySelector('textarea[name="complaint"]'),
          text: 'Write the complaint in the customer\'s words: when it cuts out, whether the display goes off, how it comes back.'},
        {target: chips, text: 'Tick the symptoms you saw yourself, kept apart from what you were told.'}]);
    },
    async 'blog-cutout-measurements'() {
      const tagOf = id => field(id).closest('tr').querySelector('.tag');
      return cropTo(['Measurements', 'Findings'], [
        {target: () => row('r0_what'), text: 'Fully charged and at rest, the battery reads 54.2 V: inside the range printed on its label.'},
        {target: () => { const a = tagOf('r1_value').getBoundingClientRect(), b = tagOf('r2_value').getBoundingClientRect();
          return {getBoundingClientRect: () => ({left: a.left, top: a.top, width: a.width, height: b.bottom - a.top, right: a.right, bottom: b.bottom})}; },
          corner: 'right', text: 'Under load it sags to 43.4 V at the battery and 43.1 V at the controller. Studio marks both outside the range.'},
        {target: () => field('r2_source'), text: 'Each range records where it came from, so the next technician can check it.'},
        {target: () => field('f0_how'), corner: 'right', text: 'The cause is marked Confirmed only with proof: a known-good battery passes the same load test.'},
        {target: () => field('f1_text').closest('.findingrow').querySelector('select'), text: 'A weak cell group is likely but not proven yet, so it stays Suspected.'},
        {target: () => field('f2_text'), text: 'Observations are recorded too: the connectors were checked and ruled out.'}]);
    },
    // Blog: "What to include in an e-bike repair report": that diagnosis's PDF, the whole page.
    async 'blog-cutout-report'() {
      return blogReport('cutout', [
        ['meta', 'Report number, work order and date. Status is Final only once a cause is confirmed; until then the report says Draft.'],
        ['Customer complaint', 'The complaint in the customer\'s words, and the symptoms the technician observed'],
        ['Measurements', 'Each reading with where it was taken, its expected range, where the range comes from, and the result'],
        ['Findings', 'Confirmed, suspected and observed findings kept apart. A confirmed cause says how it was proven.'],
        ['Recommended work', 'What the shop recommends, and the parts involved']]);
    },
    // Blog: "How to test an e-bike throttle with a multimeter".
    async 'blog-throttle-measurements'() {
      await blogDiagnosis('throttle', ['WO-0162', 'Priya Natarajan', 'City e-bike, thumb throttle', 'Throttle not responding'], throttle);
      return cropTo(['Measurements', 'Findings'], [
        {target: () => field('r0_value'), text: 'Step 1: the supply at the throttle connector reads 5.02 V, inside the controller\'s range.'},
        {target: () => field('r1_value'), text: 'Step 2: the signal with the throttle released reads 0.86 V, at the low end as expected.'},
        {target: () => field('r2_value').closest('tr').querySelector('.tag'), corner: 'right',
          text: 'Step 3: fully open, the signal stays at 0.87 V when it should rise to about 4 V. Studio marks it outside the range.'},
        {target: () => field('r3_where'), text: 'A known-good throttle of the same type reaches 4.19 V on the same connector.'},
        {target: () => field('f1_text'), text: 'Wiggling the cable changes nothing, so the wiring is not the cause.'},
        {target: () => field('f2_how'), corner: 'right', text: 'The swap proves the cause, so the throttle is marked Confirmed and the report is Final.'}]);
    }
  };
  window.__evcoreShots = {scenes: Object.keys(scenes), stage: async name => {
    const result = (await scenes[name]()) || {};
    document.activeElement?.blur(); // no focus outline in a screenshot
    return result;
  }};
}
