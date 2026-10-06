// Persistence adapters. The desktop app stores collections as files through the preload
// bridge (desktop/store.cjs); the developer web preview falls back to localStorage.
// Records saved by Studio 0.1 (browser storage) migrate once and are left in place.
const LEGACY = {reports: 'evcore-studio.sessions.v1', jobs: 'evcore.jobs.v1'};
const BROWSER_PREFIX = 'evcore-studio.v2.';

function readLegacy(name) {
  try {
    const raw = localStorage.getItem(LEGACY[name]);
    const data = raw ? JSON.parse(raw) : null;
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

// The Windows app ('desktop') and the phone and tablet app ('device', decision 0015) both store
// records through their bridge.
function desktopStorage(bridge) {
  return {
    kind: bridge.platform === 'desktop' ? 'desktop' : 'device',
    async load(name) {
      const {data, source} = await bridge.store.load(name);
      if (data === null && LEGACY[name]) {
        const legacy = readLegacy(name);
        if (legacy) return {data: legacy, source: 'migrated'};
      }
      return {data, source};
    },
    save: (name, data) => bridge.store.save(name, data)
  };
}

function browserStorage() {
  return {
    kind: 'browser',
    async load(name) {
      try {
        const raw = localStorage.getItem(BROWSER_PREFIX + name);
        if (raw) return {data: JSON.parse(raw), source: 'file'};
      } catch { /* fall through */ }
      const legacy = LEGACY[name] ? readLegacy(name) : null;
      return legacy ? {data: legacy, source: 'migrated'} : {data: null, source: 'empty'};
    },
    async save(name, data) {
      try { localStorage.setItem(BROWSER_PREFIX + name, JSON.stringify(data)); return true; }
      catch { throw new Error('Browser storage is full. Use the desktop app for durable records.'); }
    }
  };
}

// Removes every record the web app keeps in this browser (the demo's Reset).
export function clearBrowserStorage() {
  try { for (const key of Object.keys(localStorage)) if (key.startsWith(BROWSER_PREFIX)) localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

export const openStorage = () => (globalThis.evcore?.store ? desktopStorage(globalThis.evcore) : browserStorage());
