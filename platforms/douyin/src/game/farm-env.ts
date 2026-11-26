/**
 * 网页版像素农场在小程序里运行所需的「浏览器环境」替身。
 * farm-engine.js（由网页版源码构建）里所有浏览器全局变量都改成了对这里返回的对象 G 的读取，
 * 所以游戏不会碰真实的 document / window：画布、离屏画布、图片、帧循环、存储都由 FarmPlatform 提供。
 */
export interface FarmPlatform {
  mainCanvas: any
  createOffscreenCanvas: (width: number, height: number) => any
  createImage: () => any
  requestFrame: (cb: (now: number) => void) => void
  now: () => number
  storage: {
    get: (key: string) => string | null
    set: (key: string, value: string) => void
    remove: (key: string) => void
    keys: () => string[]
  }
  viewport: () => { width: number; height: number; dpr: number }
  canvasRect: () => { left: number; top: number; width: number; height: number }
  nativeImageData?: any
  /** 游戏画在本地离屏画布上，每帧只把整帧拷到屏幕画布一次（屏幕画布跨线程代理时更稳更快） */
  framebuffer?: boolean
  /** v12：界面元素的估算位置（真实布局在视图层） */
  rectOf?: (id: string, el: any) => Rect | null
}

export interface FrameSample {
  t: number
  total: number
  sim: number
  render: number
  hud: number
  present: number
  getN: number
  getMs: number
  putN: number
  putMs: number
  drawN: number
  parts: Record<string, number>
}

/** 最近约 1.5 秒的平均值，给真机上的性能面板用 */
export interface PerfReport {
  fps: number
  avgMs: number
  maxMs: number
  sim: number
  render: number
  hud: number
  present: number
  getN: number
  getMs: number
  putN: number
  putMs: number
  drawN: number
  parts: Record<string, number>
  fbW: number
  fbH: number
  backW: number
  backH: number
  frames: number
  /** 每秒新建的离屏画布数（Krypton 上每个都是一个 GL 画布） */
  canvasPerSec: number
  canvasSizes: string
  canvasTotal: number
}

export interface FrameStats {
  fps: number
  avgMs: number
  p95Ms: number
  frames: number
}

type Listener = (event: any) => void

import { createDocument, MElement, type Rect } from "./mini-dom"
import { pngURL, pixURL } from "./png"
import { FARM_UI_HTML } from "./farm-ui-html"

// v12：手机上不显示的网页版元素（同小红书版 mobile.css 隐藏的那些）：不画、改了也不触发重画
const UI_SKIP_IDS: Record<string, number> = {
  wrap: 1, act: 1, prices: 1, title: 1, titleS: 1, syncHint: 1, storeHud: 1, loveLab: 1, loveBar: 1, menuBtn: 1, shopBtn: 1, storeBtn: 1, codexBtn: 1,
  diaryBtn: 1, albumBtn: 1, mapBtn: 1, mmJump: 1, speed: 1, log: 1, say: 1, catches: 1, rlabs: 1, plabs: 1, fakecursor: 1, menu: 1,
}

function fakeImageData(this: any, a: any, b: number, c?: number) {
  if (typeof a === "number") {
    return { __fake: true, data: new Uint8ClampedArray(a * b * 4), width: a, height: b }
  }
  return { __fake: true, data: a, width: b, height: c ?? a.length / 4 / b }
}

/** 每帧的画布调用计数（所有经过 wrapCanvas 的画布共用），用于真机上看清时间花在哪 */
const calls = { getN: 0, getMs: 0, putN: 0, putMs: 0, drawN: 0 }
let clock: () => number = () => Date.now()

function patchContext(ctx: any) {
  if (!ctx || ctx.__pfPatched) return ctx
  const put = ctx.putImageData
  const get = ctx.getImageData
  const draw = ctx.drawImage
  // 不用展开参数：Taro 的宽松转译会把它编坏（预览里报 putImageData 收到 0 个参数）
  ctx.putImageData = function (img: any, x: number, y: number, dx?: number, dy?: number, dw?: number, dh?: number) {
    const t0 = clock()
    let target = img
    if (img && img.__fake) {
      target = ctx.createImageData(img.width, img.height)
      target.data.set(img.data)
    }
    const r = dw === undefined ? put.call(ctx, target, x, y) : put.call(ctx, target, x, y, dx, dy, dw, dh)
    calls.putN++
    calls.putMs += clock() - t0
    return r
  }
  ctx.getImageData = function (x: number, y: number, w: number, h: number) {
    const t0 = clock()
    const r = get.call(ctx, x, y, w, h)
    calls.getN++
    calls.getMs += clock() - t0
    return r
  }
  ctx.drawImage = function (a: any, b: number, c: number, d?: number, e?: number, f?: number, g?: number, h?: number, i?: number) {
    calls.drawN++
    if (d === undefined) return draw.call(ctx, a, b, c)
    if (f === undefined) return draw.call(ctx, a, b, c, d, e)
    return draw.call(ctx, a, b, c, d, e, f, g, h, i)
  }
  ctx.__pfPatched = true
  return ctx
}

function wrapCanvas(canvas: any) {
  // 离屏画布的 toDataURL 一律自己编 PNG，且只给小图（界面图标）：相册拍照要整块读回 GPU 画布、存进本地存储，手机上不做（返回空 = 不拍，同 v11）
  // v14：原来的留着给「拍照存相册」用（只在玩家点按时整张导出主画布）
  if (typeof canvas.toDataURL === "function" && !canvas.__realToDataURL) canvas.__realToDataURL = canvas.toDataURL.bind(canvas)
  canvas.toDataURL = () => {
    try {
      const w = canvas.width | 0
      const h = canvas.height | 0
      if (!w || !h || w * h > 96 * 96) return ""
      const img = canvas.getContext("2d").getImageData(0, 0, w, h)
      return pngURL(w, h, img.data)
    } catch (err) {
      return ""
    }
  }
  const getContext = canvas.getContext.bind(canvas)
  canvas.getContext = (type: string, opts?: unknown) => patchContext(opts ? getContext(type || "2d", opts) : getContext(type || "2d"))
  return canvas
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
function btoaPoly(input: string) {
  let out = ""
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i), b = input.charCodeAt(i + 1), c = input.charCodeAt(i + 2)
    const n = (a << 16) | ((b || 0) << 8) | (c || 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (Number.isNaN(b) ? "=" : B64[(n >> 6) & 63]) + (Number.isNaN(c) ? "=" : B64[n & 63])
  }
  return out
}
function atobPoly(input: string) {
  const s = input.replace(/[^A-Za-z0-9+/]/g, "")
  let out = ""
  for (let i = 0; i < s.length; i += 4) {
    const n = (B64.indexOf(s[i]) << 18) | (B64.indexOf(s[i + 1]) << 12) | ((B64.indexOf(s[i + 2]) & 63) << 6) | (B64.indexOf(s[i + 3]) & 63)
    out += String.fromCharCode((n >> 16) & 255)
    if (s[i + 2]) out += String.fromCharCode((n >> 8) & 255)
    if (s[i + 3]) out += String.fromCharCode(n & 255)
  }
  return out
}

// 谁建的画布：调用栈里 createElement 之后的前两个函数名（跳过 mk/mkc 这类薄包装），V8「at 名字 (…)」和 JSC「名字@…」两种格式
function creatorOf(stack: unknown) {
  if (typeof stack !== "string") return ""
  const names: string[] = []
  for (const raw of stack.split("\n")) {
    const line = raw.trim()
    const m = line.startsWith("at ") ? /^at (?:new )?([\w$.<>]+) \(/.exec(line) : /^([\w$.<>]+)@/.exec(line)
    if (!m) continue
    const name = m[1].replace(/^Object\./, "")
    if (name.length <= 2 || /createElement|^mkc?$|^wrapCanvas$/.test(name)) continue // 两个字母以内是压缩后的薄包装
    names.push(name)
    if (names.length >= 2) break
  }
  return names.join("<")
}

export function createFarmEnv(p: FarmPlatform) {
  clock = p.now
  let canvasCount = 0
  // 最近新建的画布（看尺寸就知道是谁在建：树、物件缓存、临时画布…）
  const born: { at: number; c: any; by: string }[] = []
  let lastCount = { at: 0, n: 0, rate: 0 }
  const main = wrapCanvas(p.mainCanvas)
  const fb = p.framebuffer ? wrapCanvas(p.createOffscreenCanvas(main.width || 300, main.height || 150)) : main
  let mainCtx: any = null
  let presentMode = "drawImage"
  // 屏幕画布的像素 = 游戏画面 × presentScale（整数倍，像素画不糊）；画质「高」用 2，「中/低」用 1
  let presentScale = 2
  const present = () => {
    if (fb === main) return
    const bw = fb.width * presentScale
    const bh = fb.height * presentScale
    if (main.width !== bw || main.height !== bh) {
      main.width = bw
      main.height = bh
      mainCtx = null
    }
    if (!mainCtx) {
      mainCtx = main.getContext("2d")
      mainCtx.imageSmoothingEnabled = false
    }
    if (presentMode === "drawImage") {
      try {
        mainCtx.drawImage(fb, 0, 0, fb.width, fb.height, 0, 0, bw, bh)
        return
      } catch (err) {
        presentMode = "pixels"
        note("warn", ["[farm-env] drawImage(offscreen) failed, using putImageData", String(err)])
      }
    }
    presentScale = 1
    const fctx = fb.getContext("2d")
    mainCtx.putImageData(fctx.getImageData(0, 0, fb.width, fb.height), 0, 0)
  }
  // v12：真正的（极简）DOM：网页版的界面（ui.js 等）在这里建节点、改 innerHTML，落地页节流后画成 Taro 组件
  const dom: any = createDocument()
  dom.skipIds = UI_SKIP_IDS
  const realCreate = dom.createElement.bind(dom)
  dom.createElement = (tag: string) => {
    if (String(tag).toLowerCase() !== "canvas") return realCreate(tag)
    canvasCount++
    const made = wrapCanvas(p.createOffscreenCanvas(300, 150))
    const at = p.now()
    born.push({ at, c: made, by: G.__mkTag ? String(G.__mkTag).replace(/<\?/g, "") : creatorOf(new Error().stack) })
    G.__mkTag = ""
    // v16：这张表只给面板看「最近 3 秒谁在建画布」；以前留着最近 300 张画布本身，丢掉的临时画布也被它攥着放不掉
    while (born.length && (born.length > 300 || at - born[0].at > 3000)) born.shift()
    return made
  }
  dom.body.innerHTML = FARM_UI_HTML
  if (p.rectOf) dom.rectOf = (el: any) => p.rectOf!(el._attrs.id || "", el)
  // 画面画布 #game：MElement 本身（监听、冒泡都走 DOM），宽高和 getContext 指到帧缓冲
  let canvasEl: any = dom.getElementById("game")
  if (!canvasEl) {
    canvasEl = realCreate("canvas")
    canvasEl.id = "game"
    dom.body.appendChild(canvasEl)
  }
  Object.defineProperties(canvasEl, {
    width: { get: () => fb.width, set: (v: number) => { fb.width = v }, configurable: true },
    height: { get: () => fb.height, set: (v: number) => { fb.height = v }, configurable: true },
  })
  canvasEl.getContext = (type: string, opts?: unknown) => fb.getContext(type, opts)
  canvasEl.setPointerCapture = () => undefined
  canvasEl.releasePointerCapture = () => undefined
  canvasEl.toDataURL = () => fb.toDataURL()
  canvasEl.getBoundingClientRect = () => {
    const r = p.canvasRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top }
  }
  const doc = dom
  const elements = { get: (id: string) => dom.getElementById(id) }

  const storage: any = {
    getItem: (k: string) => p.storage.get(String(k)),
    setItem: (k: string, v: string) => p.storage.set(String(k), String(v)),
    removeItem: (k: string) => p.storage.remove(String(k)),
    key: (i: number) => p.storage.keys()[i] ?? null,
    clear: () => p.storage.keys().forEach((k) => p.storage.remove(k)),
  }
  Object.defineProperty(storage, "length", { get: () => p.storage.keys().length })

  // 帧循环：游戏每帧末尾调用 requestAnimationFrame(frame)，这里统计帧间隔和每帧耗时
  let pending: ((now: number) => void) | null = null
  // v12：界面脚本也会要帧（游戏那一个仍是 pending），其余的同一帧里接着跑
  let extra: ((now: number) => void)[] = []
  let gameFrame: ((now: number) => void) | null = null
  let scheduled = false
  let paused = false
  const workMs: number[] = []
  const stamps: number[] = []
  const samples: FrameSample[] = []
  // 拖动地图时的帧（落地页在按下/抬起时开关 G.__dragging）
  const drag = { n: 0, sum: 0, max: 0, draws: 0, c0: -1, c1: 0, s0: null as Record<string, number> | null, s1: null as Record<string, number> | null, mf: 0, cx: NaN, cy: NaN }
  // v9：地图真的跟着动了至少 10 帧才算一次拖动（轻点、按住不动都不算），面板保留上一次完整的拖动
  const dragReal = (d: typeof drag) => d.mf >= 10
  let lastDrag: typeof drag | null = null
  const DRAG_KEYS = ['soilBuild', 'objBuild', 'soilChunk', 'objChunk', 'soilFb', 'objFb', 'patch', 'defer']
  const pfcSnap = () => {
    const st = G.__pfcStats
    if (!st) return null
    const o: Record<string, number> = {}
    for (const k of DRAG_KEYS) o[k] = st[k] || 0
    return o
  }
  // v10：加载后前 20 秒每秒的帧数（第一帧起算），面板按 5 秒一段显示 最低/平均
  const early = { t0: -1, first: 0, fps: new Array(20).fill(0) as number[] }
  let frameSplit = { sim: 0, render: 0, hud: 0 }
  let lastProf: Record<string, number> = {}
  const slow = { ew: 16, since: -1, cool: 0, n: 0 }
  const memLog = { at: 0, n: 0 }
  const tick = (now: number) => {
    scheduled = false
    if (paused || (!pending && !extra.length)) return
    const cb = pending || (() => undefined)
    pending = null
    const more = extra
    extra = []
    calls.getN = 0
    calls.getMs = 0
    calls.putN = 0
    calls.putMs = 0
    calls.drawN = 0
    frameSplit = { sim: 0, render: 0, hud: 0 }
    const t0 = p.now()
    cb(t0)
    for (let i = 0; i < more.length; i++) {
      try { more[i](t0) } catch (err) { note("error", ["[farm-env] raf", String(err)]) }
    }
    const t1 = p.now()
    const drawGame = calls.drawN
    try {
      present()
    } catch (err) {
      note("error", ["[farm-env] present", String(err)])
    }
    const t2 = p.now()
    // 游戏自带的分段计时（?prof）：累计值，取与上一帧的差
    const prof: Record<string, number> = G.__prof || {}
    const parts: Record<string, number> = {}
    for (const k in prof) {
      parts[k] = prof[k] - (lastProf[k] || 0)
    }
    lastProf = Object.assign({}, prof)
    samples.push({
      t: t0,
      total: t2 - t0,
      sim: frameSplit.sim,
      render: frameSplit.render,
      hud: frameSplit.hud,
      present: t2 - t1,
      getN: calls.getN,
      getMs: calls.getMs,
      putN: calls.putN,
      putMs: calls.putMs,
      drawN: drawGame,
      parts,
    })
    if (samples.length > 90) samples.shift()
    if (early.t0 < 0) { early.t0 = t0; early.first = t2 - t0 }
    { const sec = Math.floor((t0 - early.t0) / 1000); if (sec < 20) early.fps[sec]++ }
    if (G.__dragging) {
      drag.n++
      drag.sum += t2 - t0
      if (t2 - t0 > drag.max) drag.max = t2 - t0
      drag.draws += drawGame
      if (drag.c0 < 0) drag.c0 = canvasCount
      drag.c1 = canvasCount
      drag.s1 = pfcSnap()
      const cam = G.__trialHooks && G.__trialHooks.cam
      if (cam) {
        if (drag.n > 1 && (Math.abs(cam.x - drag.cx) + Math.abs(cam.y - drag.cy)) > 0.01) drag.mf++
        drag.cx = cam.x
        drag.cy = cam.y
      }
    }
    // v16 保险：画面长时间卡住（帧间隔或单帧耗时持续很大）就让页面降画质、清缓存（G.__onSlow）
    {
      const prev = stamps.length ? stamps[stamps.length - 1] : -1
      const gap = prev < 0 || t0 - prev > 2000 ? 16 : t0 - prev
      const cost = Math.max(gap, t2 - t0)
      slow.ew = slow.ew * 0.9 + cost * 0.1
      if (slow.ew > 150 && t0 > slow.cool) {
        if (slow.since < 0) slow.since = t0
        else if (t0 - slow.since > 6000) {
          slow.since = -1
          slow.cool = t0 + 30000
          slow.n++
          const msg = `[farm-valve] slow frames ~${Math.round(slow.ew)}ms for 6s, step ${slow.n}`
          note("warn", [msg])
          console.warn(msg)
          try { if (G.__onSlow) G.__onSlow(slow.n) } catch (err) { note("error", ["[farm-valve]", String(err)]) }
        }
      } else if (slow.ew < 80) slow.since = -1
      if (t0 - memLog.at > 60000) {
        memLog.at = t0
        const mem = typeof performance !== 'undefined' && performance && (performance as any).memory
        const heap = mem ? Math.round(mem.usedJSHeapSize / 1e6) + 'MB' : '?'
        console.log('[farm-mem] canvases made ' + canvasCount + ' (+' + (canvasCount - memLog.n) + '/min) heap ' + heap + ' frame ' + Math.round(slow.ew) + 'ms valve ' + slow.n)
        memLog.n = canvasCount
      }
    }
    workMs.push(t2 - t0)
    stamps.push(t0)
    if (workMs.length > 240) workMs.shift()
    if (stamps.length > 240) stamps.shift()
    void now
  }
  const schedule = () => {
    if (scheduled || paused || (!pending && !extra.length)) return
    scheduled = true
    p.requestFrame(tick)
  }

  class CustomEventShim {
    type: string
    detail: unknown
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type
      this.detail = init?.detail
    }
  }
  class URLSearchParamsShim {
    private map = new Map<string, string>()
    constructor(search?: string) {
      String(search || "").replace(/^\?/, "").split("&").filter(Boolean).forEach((part) => {
        const [k, v = ""] = part.split("=")
        this.map.set(decodeURIComponent(k), decodeURIComponent(v))
      })
    }
    get(k: string) { return this.map.has(k) ? (this.map.get(k) as string) : null }
    has(k: string) { return this.map.has(k) }
  }

  // 游戏自己的 console 输出：照常转发，同时记下最近的警告和错误，方便在页面上直接看到
  const problems: string[] = []
  const note = (level: string, args: unknown[]) => {
    const text = args.map((a) => (a instanceof Error ? `${a.message}` : typeof a === "string" ? a : String(a))).join(" ")
    if (/off-palette/.test(text)) return
    problems.push(`${level}: ${text}`.slice(0, 200))
    if (problems.length > 8) problems.shift()
  }
  const forward = (fn: (...a: unknown[]) => void, args: ArrayLike<unknown>) => {
    try {
      fn.apply(console, Array.prototype.slice.call(args))
    } catch {
      // ignore
    }
  }
  const gameConsole = {
    log: function (...a: unknown[]) { forward(console.log, a) },
    info: function (...a: unknown[]) { forward(console.info, a) },
    debug: () => undefined,
    warn: function (...a: unknown[]) {
      // 调色板自检在每次画图时都会提醒，量很大，不转发
      if (typeof a[0] === "string" && a[0].indexOf("off-palette") === 0) return
      note("warn", a)
      forward(console.warn, a)
    },
    error: function (...a: unknown[]) {
      note("error", a)
      forward(console.error, a)
    },
  }

  const G: any = {
    console: gameConsole,
    document: doc,
    localStorage: storage,
    location: { search: "?prof=1", hostname: "douyin-miniapp", protocol: "https:", href: "", reload: () => undefined },
    navigator: { userAgent: "douyin-miniapp", language: "zh-CN", maxTouchPoints: 5 },
    performance: { now: () => p.now() },
    Image: function ImageShim() { return p.createImage() },
    ImageData: p.nativeImageData || fakeImageData,
    CustomEvent: CustomEventShim,
    Event: CustomEventShim,
    URLSearchParams: URLSearchParamsShim,
    requestAnimationFrame: (cb: (now: number) => void) => {
      // 第一个要帧的是游戏主循环（game.js 末尾）；界面脚本的放进 extra
      if (!gameFrame) gameFrame = cb
      if (cb === gameFrame) pending = cb
      else if (extra.indexOf(cb) < 0) extra.push(cb)
      schedule()
      return 1
    },
    cancelAnimationFrame: () => { pending = null },
    addEventListener: (type: string, fn: Listener, opts?: unknown) => MElement.prototype.addEventListener.call(dom.win as any, type, fn, opts),
    removeEventListener: (type: string, fn: Listener, opts?: unknown) => MElement.prototype.removeEventListener.call(dom.win as any, type, fn, opts),
    dispatchEvent: (event: any) => { winFire(event); return true },
    ontouchstart: null,
    // 空闲时预热建筑缓存：每次最多占 8ms，不一次性卡住主线程
    requestIdleCallback: (cb: (deadline: { timeRemaining: () => number }) => void) =>
      setTimeout(() => {
        const end = p.now() + 8
        cb({ timeRemaining: () => Math.max(0, end - p.now()) })
      }, 30),
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    atob: atobPoly,
    btoa: btoaPoly,
    // v12：界面图标直接编码（不建画布）
    __pixURL: pixURL,
    __pngURL: pngURL,
  }
  // v15：黄昏 / 清晨的暖色和雨天的灰蓝罩子在网页版里是 multiply 混合；抖音手机上这个混合出来是一片灰。
  // 原生画布环境照旧用 multiply；抖音端改成等效的普通叠色（按场景平均亮度配的颜色，误差约 5/255）
  G.__mulFill = (ctx: any, r: number, g: number, b: number, a: number, w: number, h: number) => {
    if (G.__nativeMul && !G.__forceMulFallback) {
      ctx.save()
      ctx.globalCompositeOperation = "multiply"
      ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a})`
      ctx.fillRect(0, 0, w, h)
      ctx.restore()
      return
    }
    // 乘上 (r,g,b)/255、不透明度 a：每个通道的系数 f = 1 - a(1 - c/255)。用 α = 1 - min(f) 的普通叠色，
    // 最暗那个通道叠黑，其余通道叠到「刚好等效于参考亮度」的颜色
    const f = [1 - a * (1 - r / 255), 1 - a * (1 - g / 255), 1 - a * (1 - b / 255)]
    const fmin = Math.min(f[0], f[1], f[2])
    const al = 1 - fmin
    if (al <= 0.002) return
    const REF = 110
    const k = f.map((fc) => Math.max(0, Math.min(255, (REF * (fc - 1 + al)) / al)))
    const sv = ctx.globalAlpha
    ctx.globalAlpha = al
    ctx.fillStyle = `rgb(${k[0] | 0},${k[1] | 0},${k[2] | 0})`
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = sv
  }
  G.__frameProf = (sim: number, render: number, hud: number) => {
    frameSplit = { sim, render, hud }
  }
  Object.defineProperties(G, {
    innerWidth: { get: () => p.viewport().width },
    innerHeight: { get: () => p.viewport().height },
    devicePixelRatio: { get: () => p.viewport().dpr },
  })

  const winFire = (event: any) => {
    const ev = event && event.preventDefault ? event : dom.makeEvent(event.type, event)
    if (!ev.target) ev.target = G
    dom._callList(dom.win, ev, null)
  }
  dom.win.target = G
  const pointer = (type: string, x: number, y: number, id: number) => {
    // v12：从画布冒泡到 document / window（界面在 window 的 pointerdown 里收面板）
    dom._dispatch(canvasEl, dom.makeEvent(type, {
      clientX: x, clientY: y, pointerId: id, button: 0, buttons: type === "pointerup" ? 0 : 1, shiftKey: false, pointerType: "touch",
    }))
  }
  const touchList = (list: { id: number; x: number; y: number }[]) => list.map((t) => ({ identifier: t.id, clientX: t.x, clientY: t.y, pageX: t.x, pageY: t.y }))
  const touch = (type: string, touches: { id: number; x: number; y: number }[], changed: { id: number; x: number; y: number }[]) => {
    dom._dispatch(canvasEl, dom.makeEvent(type, { touches: touchList(touches), changedTouches: touchList(changed), targetTouches: touchList(touches) }))
  }

  return {
    G,
    element: (id: string) => elements.get(id),
    pointer,
    touch,
    dom,
    wheel: (deltaY: number) => winFire({ type: "wheel", deltaY, target: canvasEl }),
    resize: () => winFire({ type: "resize" }),
    setHidden: (hidden: boolean) => {
      doc.hidden = hidden
      doc.visibilityState = hidden ? "hidden" : "visible"
      paused = hidden
      dom._dispatch(null, dom.makeEvent("visibilitychange"))
      if (!hidden) schedule()
    },
    stats: (): FrameStats => {
      const n = workMs.length
      if (n < 2) return { fps: 0, avgMs: 0, p95Ms: 0, frames: n }
      const sorted = workMs.slice().sort((a, b) => a - b)
      const span = stamps[stamps.length - 1] - stamps[0]
      return {
        fps: span > 0 ? ((stamps.length - 1) * 1000) / span : 0,
        avgMs: workMs.reduce((a, b) => a + b, 0) / n,
        p95Ms: sorted[Math.min(n - 1, Math.floor(n * 0.95))],
        frames: n,
      }
    },
    problems: () => problems.slice(),
    perf: (): PerfReport => {
      const n = samples.length
      const sum = { total: 0, sim: 0, render: 0, hud: 0, present: 0, getN: 0, getMs: 0, putN: 0, putMs: 0, drawN: 0 }
      const parts: Record<string, number> = {}
      let maxMs = 0
      for (const f of samples) {
        sum.total += f.total
        sum.sim += f.sim
        sum.render += f.render
        sum.hud += f.hud
        sum.present += f.present
        sum.getN += f.getN
        sum.getMs += f.getMs
        sum.putN += f.putN
        sum.putMs += f.putMs
        sum.drawN += f.drawN
        if (f.total > maxMs) maxMs = f.total
        for (const k in f.parts) parts[k] = (parts[k] || 0) + f.parts[k]
      }
      const d = n || 1
      for (const k in parts) parts[k] /= d
      const span = n > 1 ? samples[n - 1].t - samples[0].t : 0
      const now = p.now()
      if (now - lastCount.at >= 1000) {
        lastCount = { at: now, n: canvasCount, rate: lastCount.at ? ((canvasCount - lastCount.n) * 1000) / (now - lastCount.at) : 0 }
      }
      return {
        canvasPerSec: lastCount.rate,
        canvasSizes: (() => {
          const bySize: Record<string, number> = {}
          for (const b of born) if (now - b.at < 3000) {
            const k = `${b.c.width}x${b.c.height}${b.by ? ` ${b.by}` : ''}`
            bySize[k] = (bySize[k] || 0) + 1
          }
          return Object.keys(bySize).sort((a, b) => bySize[b] - bySize[a]).slice(0, 3).map((k) => `${k}×${bySize[k]}`).join(' ')
        })(),
        canvasTotal: canvasCount,
        fps: span > 0 ? ((n - 1) * 1000) / span : 0,
        avgMs: sum.total / d,
        maxMs,
        sim: sum.sim / d,
        render: sum.render / d,
        hud: sum.hud / d,
        present: sum.present / d,
        getN: sum.getN / d,
        getMs: sum.getMs / d,
        putN: sum.putN / d,
        putMs: sum.putMs / d,
        drawN: sum.drawN / d,
        parts,
        fbW: fb.width,
        fbH: fb.height,
        backW: main.width,
        backH: main.height,
        frames: n,
      }
    },
    setPresentScale: (scale: number) => {
      presentScale = scale
    },
    dragStats: () => {
      // 还没有完整的拖动：显示 0（不显示轻点/短按）
      const d = G.__dragging && dragReal(drag) ? drag : lastDrag || { n: 0, sum: 0, max: 0, draws: 0, c0: -1, c1: 0, s0: null, s1: null, mf: 0, cx: NaN, cy: NaN }
      const pfc: Record<string, number> = {}
      if (d.s0 && d.s1) for (const k of DRAG_KEYS) pfc[k] = d.s1[k] - d.s0[k]
      return { frames: d.n, avgMs: d.n ? d.sum / d.n : 0, maxMs: d.max, draws: d.n ? d.draws / d.n : 0, canvases: d.c0 < 0 ? 0 : d.c1 - d.c0, secs: d.sum / 1000, pfc }
    },
    resetDrag: () => {
      if (dragReal(drag)) lastDrag = Object.assign({}, drag)
      drag.n = 0; drag.sum = 0; drag.max = 0; drag.draws = 0; drag.c0 = -1; drag.c1 = 0; drag.s0 = pfcSnap(); drag.s1 = drag.s0; drag.mf = 0; drag.cx = NaN; drag.cy = NaN
    },
    // 松手：完整的拖动记下来
    endDrag: () => {
      if (dragReal(drag)) lastDrag = Object.assign({}, drag)
    },
    // v10：加载后前 20 秒的 FPS，每 5 秒一段（最低 1 秒/平均），只算已经走完的段
    bootFps: () => {
      const out: { min: number; avg: number }[] = []
      if (early.t0 < 0) return { first: 0, secs: 0, buckets: out }
      const secs = Math.min(20, Math.floor((p.now() - early.t0) / 1000))
      for (let b = 0; b + 5 <= secs; b += 5) {
        const w = early.fps.slice(b, b + 5)
        out.push({ min: Math.min(...w), avg: w.reduce((x, y) => x + y, 0) / 5 })
      }
      return { first: early.first, secs, buckets: out }
    },
    resetStats: () => { workMs.length = 0; stamps.length = 0; samples.length = 0 },
  }
}
