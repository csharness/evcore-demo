// Shop branding for customer reports: a logo, a brand colour and a font, chosen in Settings and
// stored with the shop's settings. Pure functions. Every value is validated again whenever it is
// read, so a damaged or edited settings file can never put markup, a script or a remote address
// into a report: logos and fonts are embedded data only, and the colour is a plain hex value.

// Size limits keep a report well under the 5 MB the desktop app accepts for printing.
export const LOGO_MAX_BYTES = 1024 * 1024;
export const FONT_MAX_BYTES = 1536 * 1024;
const base64Length = bytes => Math.ceil(bytes / 3) * 4;
const LOGO = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;
const FONT_FILE = /^data:font\/(ttf|otf|woff|woff2);base64,[A-Za-z0-9+/]+={0,2}$/;
const COLOR = /^#[0-9a-f]{6}$/;

// Fonts installed with Windows, so the report looks the same on every shop computer. 'custom' is
// the shop's own font file.
export const BRAND_FONTS = {
  '': {label: 'Report default', stack: null},
  arial: {label: 'Arial', stack: 'Arial,Helvetica,sans-serif'},
  segoe: {label: 'Segoe UI', stack: '"Segoe UI",Arial,sans-serif'},
  calibri: {label: 'Calibri', stack: 'Calibri,Arial,sans-serif'},
  verdana: {label: 'Verdana', stack: 'Verdana,Arial,sans-serif'},
  tahoma: {label: 'Tahoma', stack: 'Tahoma,Arial,sans-serif'},
  trebuchet: {label: 'Trebuchet MS', stack: '"Trebuchet MS",Arial,sans-serif'},
  bahnschrift: {label: 'Bahnschrift', stack: 'Bahnschrift,Arial,sans-serif'},
  georgia: {label: 'Georgia', stack: 'Georgia,"Times New Roman",serif'},
  times: {label: 'Times New Roman', stack: '"Times New Roman",Georgia,serif'},
  custom: {label: 'Your font file', stack: 'ShopBrandFont,Arial,sans-serif'}
};

export const BRANDING_DEFAULTS = Object.freeze({reportLogo: '', reportAccent: '', reportFont: '', reportFontFile: '', reportFontName: ''});

export const validLogo = value => typeof value === 'string' && value.length <= base64Length(LOGO_MAX_BYTES) + 40 && LOGO.test(value);
export const validFontFile = value => typeof value === 'string' && value.length <= base64Length(FONT_MAX_BYTES) + 40 && FONT_FILE.test(value);
export const validAccent = value => typeof value === 'string' && COLOR.test(value);

// The branding fields of a settings object, each valid or reset to its default.
export function sanitizeBranding(settings = {}) {
  const fontFile = validFontFile(settings.reportFontFile) ? settings.reportFontFile : '';
  const font = Object.hasOwn(BRAND_FONTS, settings.reportFont) && (settings.reportFont !== 'custom' || fontFile) ? settings.reportFont : '';
  return {
    reportLogo: validLogo(settings.reportLogo) ? settings.reportLogo : '',
    reportAccent: validAccent(settings.reportAccent) ? settings.reportAccent : '',
    reportFont: font,
    reportFontFile: fontFile,
    reportFontName: fontFile && typeof settings.reportFontName === 'string' ? settings.reportFontName.replace(/[^\w .()-]/g, '').slice(0, 80) : ''
  };
}

// WCAG relative luminance; a colour at or below 0.18 has at least 4.5:1 contrast on white, enough
// for small text. Lighter brand colours are used for rules and borders only.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const readableOnWhite = hex => luminance(hex) <= 0.18;

// The same hue, darkened in steps until it is readable as small text on white.
export function textShade(hex) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  for (let f = 1; f > 0; f -= 0.05) {
    const shade = `#${rgb.map(c => Math.round(c * f).toString(16).padStart(2, '0')).join('')}`;
    if (readableOnWhite(shade)) return shade;
  }
  return '#000000';
}

// What a report needs: the logo source, the accent for rules and for text, and the CSS that applies
// the font (with its embedded @font-face when the shop uploaded one).
export function reportBrand(settings = {}) {
  const b = sanitizeBranding(settings);
  const stack = BRAND_FONTS[b.reportFont].stack;
  return {
    logo: b.reportLogo,
    accent: b.reportAccent || null,
    accentText: b.reportAccent ? textShade(b.reportAccent) : null,
    fontCss: (b.reportFont === 'custom' ? `@font-face{font-family:ShopBrandFont;src:url("${b.reportFontFile}")}` : '')
      + (stack ? `body{font-family:${stack}}` : '')
  };
}

// Builds a font data address from a file's name and base64 contents, or null for another file type.
export function fontDataUrl(fileName, base64) {
  const ext = /\.(ttf|otf|woff2?)$/i.exec(String(fileName))?.[1].toLowerCase();
  return ext ? `data:font/${ext};base64,${base64}` : null;
}
