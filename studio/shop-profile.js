// A shop profile file (decision 0019): one location's shop details and report branding in a JSON
// file, so a location is set up in one step and every computer of it prints the same shop. It holds
// only the shop's own business information, never records, accounts, licenses or keys. Every value
// is cleaned exactly as a value typed in Settings or received from the account would be.
import {syncedSettings} from './settings-sync.js';

export const SHOP_PROFILE_FORMAT = 'evcore-shop-profile';
const ALLOWED = ['shopName', 'shopPhone', 'shopAddress', 'shopEmail', 'shopHours', 'reportPrefix', 'shopTimeZone', 'reportLogo', 'reportAccent', 'reportFont'];

// Returns {name, settings} with the fields the file sets, or throws with a reason a person can act on.
export function parseShopProfile(textValue) {
  let data;
  try { data = JSON.parse(String(textValue)); } catch { throw new Error('This is not a shop profile file.'); }
  if (!data || data.format !== SHOP_PROFILE_FORMAT || data.version !== 1 || !data.shop || typeof data.shop !== 'object')
    throw new Error('This is not a shop profile file.');
  const clean = syncedSettings(data.shop);
  const settings = Object.fromEntries(ALLOWED.filter(key => Object.hasOwn(data.shop, key)).map(key => [key, clean[key]]));
  if (!settings.shopName) throw new Error('The shop profile has no shop name.');
  if (Object.hasOwn(data.shop, 'reportLogo') && data.shop.reportLogo && !settings.reportLogo) throw new Error('The shop profile\'s logo is not a PNG, JPEG, WebP or SVG image.');
  if (Object.hasOwn(data.shop, 'reportPrefix') && data.shop.reportPrefix && !settings.reportPrefix) throw new Error('The shop profile\'s report number prefix is not valid.');
  return {name: settings.shopName, settings};
}
