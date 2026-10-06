// Makes offered when the technician types a vehicle's make (decision 0019). Selection aids only:
// a name, never a specification, voltage, limit or claim that a make is supported. The list is the
// brands the first pilot shops (EZE Ryders / eBike Super Shop) publicly sell or service, plus any
// make the shop has already typed. Any other make can be typed in.
export const BRAND_PRESETS = Object.freeze(['Rad Power Bikes', 'Juiced', 'Aventon', 'Magnum', 'Himiway', 'Sondors', 'Ecotric', 'Biktrix', 'Electra',
  'Lectric', 'iZip', 'SMLRO', 'QuietKat', 'XERO2', 'Talaria', 'Mokwheel', 'Pedal Electric', 'Sur-Ron', 'RAEV', 'Urtopia', 'Eunorau', 'Ride1Up', 'Murf',
  'Fiido', 'Rawrr', 'Super73', 'FLX / Superhuman', 'Coastal Cruiser', 'Macfox', 'EBOX / Stomp', 'eRide Pro', 'Velotric', 'Ghostcat', 'Heybike',
  'Arctic Leopard', 'Segway', 'Throne / SRPNT', 'Tuttio', 'Revi', 'Blix', 'Coswheel', 'Kasen', 'Yozma']);

// The presets plus the makes already used in this shop's diagnoses, each once, in order.
export function makeChoices(diagnoses = []) {
  const seen = new Map(BRAND_PRESETS.map(name => [name.toLowerCase(), name]));
  for (const d of diagnoses) {
    const make = String(d?.vehicleInfo?.make ?? '').trim();
    if (make && !seen.has(make.toLowerCase())) seen.set(make.toLowerCase(), make);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'en', {sensitivity: 'base'}));
}
