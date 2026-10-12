import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { deflateSync } from 'node:zlib'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), schoolBranding(env)],
  }
})

// ---------------------------------------------------------------------------
// School branding: page title, home-screen name and home-screen icon.
//
// Netlify environment variables (all optional):
//   VITE_APP_NAME          name under the home-screen icon and in the browser tab
//                          (keep it short, about 12 letters, e.g. "BHS Golf")
//   VITE_THEME_PRIMARY     icon background (same color setting as the app theme)
//   VITE_THEME_ACCENT      icon flag color
//
// The icon is drawn at build time in the school's colors, so each school's site
// gets its own icon with nothing to upload.
// ---------------------------------------------------------------------------
function schoolBranding(env) {
  const name = (env.VITE_APP_NAME || 'Golf Team Tracker').trim()
  const primary = hex(env.VITE_THEME_PRIMARY) || [27, 94, 58]          // default green
  const accent = hex(env.VITE_THEME_ACCENT) || (env.VITE_THEME_PRIMARY ? [255, 255, 255] : [192, 57, 43])
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

  return {
    name: 'school-branding',
    transformIndexHtml(html) {
      return html
        .replace(/<title>.*?<\/title>/, `<title>${esc(name)}</title>`)
        .replace(
          '</head>',
          `    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-title" content="${esc(name)}" />
    <meta name="theme-color" content="${toHex(primary)}" />
  </head>`,
        )
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'apple-touch-icon.png', source: drawIcon(primary, accent) })
    },
  }
}

function hex(v) {
  if (!v) return null
  let h = String(v).trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('')
  return /^[0-9a-f]{6}$/i.test(h) ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) : null
}
const toHex = (c) => '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')
const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t)

// 180×180 icon: flagstick on a green, in the school's colors.
function drawIcon(primary, accent) {
  const S = 180, SS = 4 // supersampling for smooth edges
  const WHITE = [255, 255, 255]
  const green = mix(primary, WHITE, 0.22)
  const hole = mix(primary, [0, 0, 0], 0.45)
  const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
  const colorAt = (x, y) => {
    if (x >= 0.455 && x <= 0.495 && y >= 0.17 && y <= 0.78) return WHITE                       // pole
    if (x > 0.495 && y >= 0.17 && y <= 0.45 && x <= 0.495 + 0.33 * (1 - Math.abs(y - 0.31) / 0.14)) return accent // flag
    if (inEllipse(x, y, 0.64, 0.765, 0.045, 0.045)) return WHITE                              // ball
    if (inEllipse(x, y, 0.475, 0.785, 0.075, 0.022)) return hole                              // cup
    if (inEllipse(x, y, 0.5, 0.80, 0.36, 0.085)) return green                                 // putting green
    return primary
  }
  const raw = Buffer.alloc((S * 3 + 1) * S)
  for (let py = 0; py < S; py++) {
    raw[py * (S * 3 + 1)] = 0
    for (let px = 0; px < S; px++) {
      const sum = [0, 0, 0]
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt((px + (sx + 0.5) / SS) / S, (py + (sy + 0.5) / SS) / S)
          sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]
        }
      const o = py * (S * 3 + 1) + 1 + px * 3
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(sum[i] / (SS * SS))
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4)
  ihdr[8] = 8; ihdr[9] = 2 // 8-bit RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function pngChunk(type, data) {
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  let crc = 0xffffffff
  for (const b of td) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const out = Buffer.alloc(4); out.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([len, td, out])
}
