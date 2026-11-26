/** v12：离屏画布没有 toDataURL（抖音 tt 画布、Worker 里的 OffscreenCanvas），界面图标用这里把像素编成 PNG data URL（不压缩，图标都很小）。 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
let CRC: Int32Array | null = null
function crcTable() {
  if (CRC) return CRC
  CRC = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    CRC[n] = c
  }
  return CRC
}
function crc32(b: Uint8Array, from: number, to: number) {
  const t = crcTable()
  let c = -1
  for (let i = from; i < to; i++) c = t[(c ^ b[i]) & 255] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function b64(bytes: Uint8Array) {
  let out = ''
  const n = bytes.length
  for (let i = 0; i < n; i += 3) {
    const a = bytes[i]
    const b = i + 1 < n ? bytes[i + 1] : 0
    const c = i + 2 < n ? bytes[i + 2] : 0
    const x = (a << 16) | (b << 8) | c
    out += B64[(x >> 18) & 63] + B64[(x >> 12) & 63] + (i + 1 < n ? B64[(x >> 6) & 63] : '=') + (i + 2 < n ? B64[x & 63] : '=')
  }
  return out
}

/** RGBA 像素 → PNG data URL（zlib 不压缩块） */
export function pngURL(w: number, h: number, px: ArrayLike<number>) {
  const row = w * 4 + 1
  const raw = row * h
  const blocks = Math.max(1, Math.ceil(raw / 65535))
  const idatLen = 2 + raw + blocks * 5 + 4
  const total = 8 + 25 + (12 + idatLen) + 12
  const b = new Uint8Array(total)
  let p = 0
  const u32 = (v: number) => {
    b[p++] = (v >>> 24) & 255
    b[p++] = (v >>> 16) & 255
    b[p++] = (v >>> 8) & 255
    b[p++] = v & 255
  }
  const sig = [137, 80, 78, 71, 13, 10, 26, 10]
  for (let i = 0; i < 8; i++) b[p++] = sig[i]
  // IHDR
  u32(13)
  let s = p
  b[p++] = 73; b[p++] = 72; b[p++] = 68; b[p++] = 82
  u32(w); u32(h)
  b[p++] = 8; b[p++] = 6; b[p++] = 0; b[p++] = 0; b[p++] = 0
  u32(crc32(b, s, p))
  // IDAT
  u32(idatLen)
  s = p
  b[p++] = 73; b[p++] = 68; b[p++] = 65; b[p++] = 84
  b[p++] = 0x78; b[p++] = 0x01
  let a1 = 1
  let a2 = 0
  let left = raw
  let x = 0 // position in the filtered stream
  for (let k = 0; k < blocks; k++) {
    const len = Math.min(65535, left)
    left -= len
    b[p++] = left ? 0 : 1
    b[p++] = len & 255; b[p++] = len >> 8
    b[p++] = ~len & 255; b[p++] = (~len >> 8) & 255
    for (let i = 0; i < len; i++, x++) {
      const r = (x / row) | 0
      const c = x - r * row
      const v = c === 0 ? 0 : px[r * w * 4 + c - 1] & 255
      b[p++] = v
      a1 = (a1 + v) % 65521
      a2 = (a2 + a1) % 65521
    }
  }
  u32(((a2 << 16) | a1) >>> 0)
  u32(crc32(b, s, p))
  // IEND
  u32(0)
  s = p
  b[p++] = 73; b[p++] = 69; b[p++] = 78; b[p++] = 68
  u32(crc32(b, s, p))
  return 'data:image/png;base64,' + b64(b)
}

const COLOR_CACHE: Record<string, number[]> = {}
function parseColor(c: string): number[] {
  const hit = COLOR_CACHE[c]
  if (hit) return hit
  let out = [0, 0, 0, 255]
  const s = String(c).trim()
  if (s[0] === '#') {
    const h = s.slice(1)
    if (h.length === 3 || h.length === 4) out = [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), h.length === 4 ? parseInt(h[3] + h[3], 16) : 255]
    else out = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255]
  } else {
    const m = /rgba?\(([^)]*)\)/.exec(s)
    if (m) {
      const v = m[1].split(',').map((x) => parseFloat(x))
      out = [v[0] | 0, v[1] | 0, v[2] | 0, v.length > 3 ? Math.round(v[3] * 255) : 255]
    }
  }
  COLOR_CACHE[c] = out
  return out
}

/** ui.js / plots-ui.js 的 pixIcon：16×16 字符画直接编码，不建画布（抖音上每张画布都是一个 GL 画布） */
export function pixURL(rows: string[], cols: Record<string, string>) {
  const px = new Uint8Array(16 * 16 * 4)
  for (let y = 0; y < rows.length && y < 16; y++) {
    const row = rows[y] || ''
    for (let x = 0; x < row.length && x < 16; x++) {
      const col = cols[row[x]]
      if (!col) continue
      const c = parseColor(col)
      const j = (y * 16 + x) * 4
      px[j] = c[0]; px[j + 1] = c[1]; px[j + 2] = c[2]; px[j + 3] = c[3]
    }
  }
  return pngURL(16, 16, px)
}
