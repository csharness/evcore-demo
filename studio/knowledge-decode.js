// CAN frame decoding against knowledge protocol definitions (docs/knowledge-schema.md). Shared by
// the developer tool (scripts/knowledge.mjs decode) and Studio. Browser-safe: no Node imports.
// Signal bit numbering follows the DBC convention: little-endian (Intel) start_bit is the least
// significant bit; big-endian (Motorola) start_bit is the most significant bit, numbered
// byte * 8 + bit with bit 7 the top bit of each byte.

// Parses candump logs: "-L" format "(1700000000.123456) can0 18FF50E5#0102", the default format
// "can0  18FF50E5   [2]  01 02", or bare "123#0102". Lines that match none are counted as skipped.
export function parseCanLog(text) {
  const frames = [];
  let skipped = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let m = line.match(/^(?:\((\d+(?:\.\d+)?)\)\s+)?(?:(\S+)\s+)?([0-9A-Fa-f]{1,8})#([0-9A-Fa-f]*)$/);
    if (m && m[4].length % 2 === 0 && m[4].length <= 128) {
      frames.push(frame(m[1], m[2], m[3], m[4].match(/../g) || []));
      continue;
    }
    m = line.match(/^(?:\((\d+(?:\.\d+)?)\)\s+)?(\S+)\s+([0-9A-Fa-f]{1,8})\s+\[(\d{1,2})\]((?:\s+[0-9A-Fa-f]{2})*)\s*$/);
    if (m) {
      const bytes = m[5].trim() ? m[5].trim().split(/\s+/) : [];
      if (bytes.length === Number(m[4])) { frames.push(frame(m[1], m[2], m[3], bytes)); continue; }
    }
    skipped++;
  }
  return {frames, skipped};
}

function frame(time, iface, id, bytes) {
  return {time: time === undefined ? null : Number(time), iface: iface || null, id: parseInt(id, 16),
    extended: id.length > 3, data: bytes.map(b => parseInt(b, 16))};
}

export const hexId = (id, extended) => `0x${id.toString(16).toUpperCase().padStart(extended ? 8 : 3, '0')}`;

// Raw unsigned value of a signal, or null when the frame is too short.
export function extractRaw(data, {start_bit: start, length, byte_order: order}) {
  let value = 0n;
  if (order === 'little') {
    for (let i = 0; i < length; i++) {
      const pos = start + i, byte = pos >> 3;
      if (byte >= data.length) return null;
      value |= BigInt((data[byte] >> (pos & 7)) & 1) << BigInt(i);
    }
    return value;
  }
  let pos = start;
  for (let i = 0; i < length; i++) {
    const byte = pos >> 3, bit = pos & 7;
    if (byte >= data.length) return null;
    value = (value << 1n) | BigInt((data[byte] >> bit) & 1);
    pos = bit === 0 ? (byte + 1) * 8 + 7 : pos - 1;
  }
  return value;
}

export function decodeSignal(data, signal) {
  let raw = extractRaw(data, signal);
  if (raw === null) return {name: signal.name, raw: null, value: null, unit: signal.unit || '', status: signal.status, label: 'frame too short'};
  if (signal.signed && raw >= 1n << BigInt(signal.length - 1)) raw -= 1n << BigInt(signal.length);
  const value = Number(raw) * (signal.scale ?? 1) + (signal.offset ?? 0);
  return {name: signal.name, raw: Number(raw), value, unit: signal.unit || '', status: signal.status,
    label: signal.values?.[String(raw)] ?? null};
}

// The CAN messages of the given protocols, keyed by numeric id.
export function messageIndex(protocols) {
  const index = new Map();
  for (const p of protocols) {
    if (p.transport !== 'can') continue;
    for (const m of p.messages || []) {
      const id = parseInt(m.id, 16);
      if (!index.has(id)) index.set(id, []);
      index.get(id).push({protocol: p, message: m});
    }
  }
  return index;
}

export function decodeFrame(f, index) {
  const matches = index.get(f.id) || [];
  return matches.map(({protocol, message}) => ({protocol: protocol.id, message: message.name, status: message.status,
    lengthMatches: message.length === undefined || message.length === f.data.length,
    signals: (message.signals || []).map(s => decodeSignal(f.data, s))}));
}

// Per-id summary of a capture for reverse engineering: how often each id appears, its period,
// which bytes change, and whether any known protocol defines it.
export function summarizeCapture(frames, index = new Map()) {
  const byId = new Map();
  for (const f of frames) {
    const key = `${f.extended ? 'x' : 's'}${f.id}`;
    let s = byId.get(key);
    if (!s) byId.set(key, s = {id: hexId(f.id, f.extended), count: 0, lengths: new Set(), first: f.data.slice(), changing: new Set(), times: [], known: (index.get(f.id) || []).map(m => `${m.protocol.id}/${m.message.name}`)});
    s.count++;
    s.lengths.add(f.data.length);
    f.data.forEach((b, n) => { if (b !== s.first[n]) s.changing.add(n); });
    if (f.time !== null) s.times.push(f.time);
  }
  return [...byId.values()].map(s => {
    const gaps = s.times.slice(1).map((t, n) => t - s.times[n]).filter(g => g >= 0);
    return {id: s.id, count: s.count, lengths: [...s.lengths].sort((a, b) => a - b),
      period_ms: gaps.length ? Math.round(1000 * gaps.reduce((a, b) => a + b, 0) / gaps.length * 10) / 10 : null,
      changing_bytes: [...s.changing].sort((a, b) => a - b), known: s.known};
  }).sort((a, b) => a.id.localeCompare(b.id));
}
