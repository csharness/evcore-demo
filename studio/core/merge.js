// Field-by-field merge of two edits of one record (decision 0017). `base` is the copy both edits
// started from, `local` this device's edit, `remote` the edit already on the account.
//
// - A field changed on one side only takes that side's value, so edits to different fields both
//   survive (a reading added on the phone, the complaint edited on the PC).
// - Lists of items with ids (readings, findings) merge item by item: items added on either side are
//   kept, an item removed on one side and untouched on the other goes, and an item changed on both
//   sides merges field by field.
// - A field changed on both sides takes the local value: this device's change reaches the server
//   after the remote one, and the server's order decides which edit is later.
// - Removing an item never loses an edit: an item removed on one side but changed on the other is
//   kept with the change.
// Pure functions: no clocks, no storage.

const canonical = value => JSON.stringify(value, (_key, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v));
const same = (a, b) => a === b || canonical(a) === canonical(b);
const isObject = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isItemList = v => Array.isArray(v) && v.every(item => isObject(item) && typeof item.id === 'string');

export function mergeRecord(base, local, remote) {
  const b = isObject(base) ? base : {};
  const out = {};
  for (const key of new Set([...Object.keys(b), ...Object.keys(local), ...Object.keys(remote)])) {
    const [bv, lv, rv] = [b[key], local[key], remote[key]];
    let value;
    if (same(lv, rv)) value = lv;
    else if (same(lv, bv)) value = rv;
    else if (same(rv, bv)) value = lv;
    else if (isItemList(lv) && isItemList(rv) && (bv === undefined || isItemList(bv))) value = mergeItems(bv ?? [], lv, rv);
    else value = lv;
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function mergeItems(base, local, remote) {
  const byId = list => new Map(list.map(item => [item.id, item]));
  const [b, l, r] = [byId(base), byId(local), byId(remote)];
  const out = [];
  for (const item of remote) {
    if (l.has(item.id)) out.push(mergeRecord(b.get(item.id) ?? null, l.get(item.id), item));
    else if (!b.has(item.id)) out.push(item);              // added remotely
    else if (!same(b.get(item.id), item)) out.push(item);  // removed here, changed there: keep the change
    // otherwise removed here and untouched there: gone
  }
  for (const item of local) {
    if (r.has(item.id)) continue;
    if (!b.has(item.id)) out.push(item);                   // added here
    else if (!same(b.get(item.id), item)) out.push(item);  // removed there, changed here: keep the change
  }
  return out;
}
