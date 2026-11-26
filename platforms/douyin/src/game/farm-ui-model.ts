// v12：把迷你 DOM 的节点翻成要画的东西（Taro 页面和本地测试页共用）
import { FARM_UI_ATTRS } from "./farm-ui-html"

let keySeq = 0
/** 稳定的 React key（节点对象活多久就用多久） */
export function nodeKey(n: any): number {
  if (!n._key) n._key = ++keySeq
  return n._key
}

const clean = (v: string) => String(v).replace(/[^a-zA-Z0-9_-]/g, "_")
/** class 串：通用 + 标签 + 自己的 class + CSS 里用到的属性（[disabled] → a-disabled，[data-id="can"] → a-data-id-can） */
export function nodeClass(el: any): string {
  let c = "pf-n t-" + el.localName
  const own = el._attrs["class"]
  if (own) c += " " + own
  for (let i = 0; i < FARM_UI_ATTRS.length; i++) {
    const a = FARM_UI_ATTRS[i]
    const v = el._attrs[a]
    if (v === undefined) continue
    c += " a-" + a
    if (v !== "") c += " a-" + a + "-" + clean(v)
  }
  return c
}

/** 要画吗：hidden、手机上不显示的、<style>/<script> 都不画；排版用的换行空白也不画 */
export function shouldDraw(n: any): boolean {
  if (n.nodeType === 3) {
    const d = n.data as string
    return !(d.indexOf("\n") >= 0 && /^\s*$/.test(d)) && d !== ""
  }
  if (n.nodeType !== 1) return false
  if (n._skip || n._attrs.hidden !== undefined) return false
  const t = n.localName
  return t !== "style" && t !== "script" && t !== "head" && t !== "canvas" && t !== "template"
}

// 行内样式里的 data:...;base64, 图片：小程序端把 style 串按 ; 拆开，base64 标记会被拆坏（样式表里的不受影响）。
// 换成不带 ; 的百分号编码（图标都很小），按原串缓存
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
const urlCache: Record<string, string> = {}
let urlCacheN = 0
function plainDataURL(type: string, b64: string): string {
  const key = type + b64
  const hit = urlCache[key]
  if (hit) return hit
  let out = "data:" + type + ","
  let buf = 0
  let bits = 0
  for (let i = 0; i < b64.length; i++) {
    const v = B64.indexOf(b64[i])
    if (v < 0) continue
    buf = (buf << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      const b = (buf >> bits) & 255
      out += (b >= 48 && b <= 57) || (b >= 65 && b <= 90) || (b >= 97 && b <= 122) ? String.fromCharCode(b) : "%" + (b < 16 ? "0" : "") + b.toString(16).toUpperCase()
    }
  }
  if (++urlCacheN > 400) {
    for (const k in urlCache) delete urlCache[k]
    urlCacheN = 0
  }
  urlCache[key] = out
  return out
}
export function styleOf(el: any): string {
  const s = el.getAttribute("style")
  if (!s) return ""
  if (s.indexOf(";base64,") < 0) return s
  return s.replace(/url\(\s*["']?data:([a-z/+.-]+);base64,([A-Za-z0-9+/=]+)["']?\s*\)/g, (_m: string, t: string, b: string) => "url(" + plainDataURL(t, b) + ")")
}

/** 估算的位置（视图层的真实排版拿不到同步结果）：只有放提示、⚒ 工具箱要用，按 mobile.css 的版式推 */
export function estimateRect(id: string, ins: { top: number; bottom: number }, vw: number, vh: number) {
  const barH = 56
  const barTop = vh - Math.max(8, ins.bottom) - barH
  switch (id) {
    case "xhs-bar": return { left: 6, top: barTop, width: vw - 12, height: barH }
    case "hud": return { left: 12, top: ins.top, width: vw - 24, height: 92 }
    case "coins": return { left: 44, top: ins.top + 34, width: 64, height: 20 }
    case "xhs-inv-dock": return { left: 8, top: barTop - 220, width: vw - 16, height: 216 }
    default: return null
  }
}
