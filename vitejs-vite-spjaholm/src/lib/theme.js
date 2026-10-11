// School color theme.
//
// Each school sets its colors in Netlify → Site configuration → Environment variables:
//   VITE_THEME_PRIMARY     main school color — top bar, headings, active nav, "good" results (e.g. navy  #0C2340)
//   VITE_THEME_ACCENT      second school color — buttons and selected items                (e.g. orange #E87722)
//   VITE_THEME_BACKGROUND  page background (optional, e.g. #F4F6F9)
//
// Leave them unset and the app keeps the original green-and-cream look exactly.
// Every other shade is derived from these, so a school only ever picks two or three colors.
//
// CSS variables (see index.css):
//   --green-900/700/200/100  shades of the primary color (names kept so page files didn't all change)
//   --green-500              accent: buttons, selected toggles
//   --on-accent              text color on accent (white, or dark if the accent is bright)
//   --good / --good-ink      good results: birdie, GIR/fairway hit, holed putt. Always kept
//                            clearly different from --flag (red = bad result).

const env = import.meta.env;

function parseHex(value) {
  if (!value) return null;
  let h = String(value).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) {
    console.warn(`[theme] Ignoring "${value}" — use a hex color like #0C2340`);
    return null;
  }
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const toHex = (rgb) =>
  '#' + rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('');

// Blend color a toward color b by amount t (0 = all a, 1 = all b)
const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];
const DEFAULT_GOOD = [46, 139, 87]; // original green

function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Hue in degrees and saturation 0–1
function hueSat(rgb) {
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return { hue: 0, sat: 0 };
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  const l = (max + min) / 2;
  return { hue, sat: d / (1 - Math.abs(2 * l - 1)) };
}
// Red, orange-red, maroon, pink — anything a coach could mistake for the red "bad" color
function looksRed(rgb) {
  const { hue, sat } = hueSat(rgb);
  return sat > 0.35 && (hue < 30 || hue > 330);
}

// Deepen a color just enough that white text on it is readable
function readableUnderWhite(rgb) {
  let c = rgb;
  for (let i = 0; i < 20 && contrast(c, WHITE) < 4.5; i++) c = mix(c, BLACK, 0.06);
  return c;
}

export function applyTheme() {
  const primary = parseHex(env.VITE_THEME_PRIMARY);
  const accent = parseHex(env.VITE_THEME_ACCENT) || primary;
  const background = parseHex(env.VITE_THEME_BACKGROUND);
  if (!primary && !accent && !background) return; // default green theme

  const vars = {};
  const darkText = primary ? mix(primary, BLACK, 0.35) : [28, 38, 32];

  // "Good result" color: the primary school color, unless it could be confused with red
  const goodBase = primary && !looksRed(primary) ? primary
    : accent && !looksRed(accent) ? accent
    : DEFAULT_GOOD;
  const good = readableUnderWhite(goodBase);
  vars['--good'] = toHex(good);
  vars['--good-ink'] = toHex(mix(good, BLACK, 0.25));

  if (primary) {
    // Light highlight shades mark positive things (GPS fix OK, 2 putts, stat boxes), next to
    // pink for problems — so a red school gets them from the "good" color, not red.
    const tintBase = looksRed(primary) ? goodBase : primary;
    vars['--green-900'] = toHex(darkText);                   // headings, stat numbers
    vars['--green-700'] = toHex(primary);                    // top bar, active nav, secondary buttons
    vars['--green-200'] = toHex(mix(tintBase, WHITE, 0.8));  // under-par chip, success messages
    vars['--green-100'] = toHex(mix(tintBase, WHITE, 0.9));  // light highlight panels, stat boxes
    // Neutral text and borders, lightly tinted toward the school color instead of green
    vars['--ink'] = toHex(mix([28, 28, 30], primary, 0.2));
    vars['--muted'] = toHex(mix([107, 110, 115], primary, 0.15));
    vars['--line'] = toHex(mix([218, 220, 224], primary, 0.06));
  }

  if (accent) {
    // Keep the school's true accent color; pick whichever text color reads better on it
    vars['--green-500'] = toHex(accent);
    vars['--on-accent'] = contrast(accent, WHITE) >= 4.5 || contrast(accent, WHITE) >= contrast(accent, darkText)
      ? '#ffffff'
      : toHex(darkText);
  }

  if (background) vars['--cream'] = toHex(background);

  const root = document.documentElement.style;
  Object.entries(vars).forEach(([k, v]) => root.setProperty(k, v));

  // Phone status-bar color on Android / installed web app
  if (vars['--green-700']) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = vars['--green-700'];
  }
}
