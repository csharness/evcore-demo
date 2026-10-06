// Line icons for the Studio interface (24 × 24, stroked). Drawn for EVCore Studio; no external files.
const PATHS = {
  bench: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M7 20h10M12 16v4M7 12l3-3 2 2 4-4"/>',
  job: '<path d="M9 4h6l1 2h3v14H5V6h3z"/><path d="M9 12l2 2 4-4"/>',
  test: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  manual: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  live: '<circle cx="12" cy="12" r="8"/><path d="M12 12l4-3M12 4v2M4 12h2M18 12h2"/>',
  screen: '<rect x="4" y="3" width="16" height="18" rx="3"/><rect x="7" y="6" width="10" height="7" rx="1"/><circle cx="12" cy="17" r="1.5"/>',
  library: '<path d="M4 5.5C6 4.5 9 4.5 12 6c3-1.5 6-1.5 8-.5V19c-2-1-5-1-8 .5-3-1.5-6-1.5-8-.5z"/><path d="M12 6v13.5"/>',
  bus: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  orders: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5M15.5 5.2a3 3 0 010 5.6M17.5 14.8c1.5.6 2.5 2 3 4.2"/>',
  report: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  guide: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  compare: '<path d="M8 4v16M16 4v16M4 8h4M16 16h4M4 14h4M16 10h4"/>',
  capture: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15l3-4 3 3 4-6"/>',
  profiles: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 014.8 1c0 1.7-2.3 2-2.3 3.5M12 17h.01"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  play: '<path d="M7 5v14l12-7z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  pdf: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M12 11v6M9 14l3 3 3-3"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor" stroke="none"/>',
  cloud: '<path d="M7 18h10a4 4 0 00.5-8A6 6 0 006 11a3.5 3.5 0 001 7z"/>',
  disk: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>'
};

export const icon = (name, cls = '') =>
  `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
