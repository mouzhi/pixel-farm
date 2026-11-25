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
}

export interface FrameStats {
  fps: number
  avgMs: number
  p95Ms: number
  frames: number
}

type Listener = (event: any) => void

const NULL_IDS = new Set(["minimap", "mmJump"])

function makeStubElement(id: string): any {
  const el: any = {
    id,
    style: {},
    dataset: {},
    hidden: false,
    textContent: "",
    innerHTML: "",
    title: "",
    children: [],
    childNodes: [],
    offsetWidth: 0,
    offsetHeight: 0,
    clientWidth: 0,
    clientHeight: 0,
    classList: {
      add: () => undefined,
      remove: () => undefined,
      toggle: () => false,
      contains: () => false,
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    appendChild: (child: any) => child,
    removeChild: (child: any) => child,
    insertBefore: (child: any) => child,
    append: () => undefined,
    prepend: () => undefined,
    remove: () => undefined,
    setAttribute: () => undefined,
    getAttribute: () => null,
    removeAttribute: () => undefined,
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    contains: () => false,
    insertAdjacentHTML: () => undefined,
    scrollIntoView: () => undefined,
    focus: () => undefined,
    blur: () => undefined,
    click: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }),
  }
  return el
}

function fakeImageData(this: any, a: any, b: number, c?: number) {
  if (typeof a === "number") {
    return { __fake: true, data: new Uint8ClampedArray(a * b * 4), width: a, height: b }
  }
  return { __fake: true, data: a, width: b, height: c ?? a.length / 4 / b }
}

function patchContext(ctx: any) {
  if (!ctx || ctx.__pfPatched) return ctx
  const put = ctx.putImageData
  // 不用展开参数：Taro 的宽松转译会把它编坏（预览里报 putImageData 收到 0 个参数）
  ctx.putImageData = function (img: any, x: number, y: number, dx?: number, dy?: number, dw?: number, dh?: number) {
    let target = img
    if (img && img.__fake) {
      target = ctx.createImageData(img.width, img.height)
      target.data.set(img.data)
    }
    if (dw === undefined) return put.call(ctx, target, x, y)
    return put.call(ctx, target, x, y, dx, dy, dw, dh)
  }
  ctx.__pfPatched = true
  return ctx
}

function wrapCanvas(canvas: any) {
  // 离屏画布可能没有 toDataURL（只在网页版的 DOM 图标里用到），给一个空实现，避免每帧报错
  if (typeof canvas.toDataURL !== "function") canvas.toDataURL = () => ""
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

export function createFarmEnv(p: FarmPlatform) {
  const winListeners = new Map<string, Listener[]>()
  const docListeners = new Map<string, Listener[]>()
  const canvasListeners = new Map<string, Listener[]>()
  const elements = new Map<string, any>()
  const add = (map: Map<string, Listener[]>) => (type: string, fn: Listener) => {
    const list = map.get(type) || []
    list.push(fn)
    map.set(type, list)
  }
  const remove = (map: Map<string, Listener[]>) => (type: string, fn: Listener) => {
    map.set(type, (map.get(type) || []).filter((f) => f !== fn))
  }
  const fire = (map: Map<string, Listener[]>, event: any) => {
    for (const fn of map.get(event.type) || []) {
      try {
        fn(event)
      } catch (err) {
        console.error("[farm-env] listener", event.type, err)
      }
    }
  }

  const main = wrapCanvas(p.mainCanvas)
  const fb = p.framebuffer ? wrapCanvas(p.createOffscreenCanvas(main.width || 300, main.height || 150)) : main
  let mainCtx: any = null
  let presentMode = "drawImage"
  const present = () => {
    if (fb === main) return
    if (!mainCtx) {
      mainCtx = main.getContext("2d")
      mainCtx.imageSmoothingEnabled = false
    }
    if (presentMode === "drawImage") {
      try {
        // 屏幕画布尺寸在启动时定好、之后不改（改尺寸会让预览器的画布代理报错），这里按比例铺满
        mainCtx.drawImage(fb, 0, 0, fb.width, fb.height, 0, 0, main.width, main.height)
        return
      } catch (err) {
        presentMode = "pixels"
        note("warn", ["[farm-env] drawImage(offscreen) failed, using putImageData", String(err)])
      }
    }
    const fctx = fb.getContext("2d")
    if (main.width !== fb.width) main.width = fb.width
    if (main.height !== fb.height) main.height = fb.height
    mainCtx.putImageData(fctx.getImageData(0, 0, fb.width, fb.height), 0, 0)
  }
  const canvasEl: any = makeStubElement("game")
  Object.defineProperties(canvasEl, {
    width: { get: () => fb.width, set: (v: number) => { fb.width = v } },
    height: { get: () => fb.height, set: (v: number) => { fb.height = v } },
  })
  canvasEl.getContext = (type: string, opts?: unknown) => fb.getContext(type, opts)
  canvasEl.addEventListener = add(canvasListeners)
  canvasEl.removeEventListener = remove(canvasListeners)
  canvasEl.setPointerCapture = () => undefined
  canvasEl.releasePointerCapture = () => undefined
  canvasEl.getBoundingClientRect = () => {
    const r = p.canvasRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top }
  }
  elements.set("game", canvasEl)

  const doc: any = {
    hidden: false,
    visibilityState: "visible",
    body: makeStubElement("body"),
    documentElement: makeStubElement("html"),
    getElementById: (id: string) => {
      if (NULL_IDS.has(id)) return null
      let el = elements.get(id)
      if (!el) {
        el = makeStubElement(id)
        elements.set(id, el)
      }
      return el
    },
    createElement: (tag: string) => (String(tag).toLowerCase() === "canvas" ? wrapCanvas(p.createOffscreenCanvas(300, 150)) : makeStubElement("")),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: add(docListeners),
    removeEventListener: remove(docListeners),
  }

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
  let scheduled = false
  let paused = false
  const workMs: number[] = []
  const stamps: number[] = []
  const tick = (now: number) => {
    scheduled = false
    if (paused || !pending) return
    const cb = pending
    pending = null
    const t0 = p.now()
    cb(t0)
    try {
      present()
    } catch (err) {
      note("error", ["[farm-env] present", String(err)])
    }
    const t1 = p.now()
    workMs.push(t1 - t0)
    stamps.push(t0)
    if (workMs.length > 240) workMs.shift()
    if (stamps.length > 240) stamps.shift()
    void now
  }
  const schedule = () => {
    if (scheduled || paused || !pending) return
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
    location: { search: "", hostname: "douyin-miniapp", protocol: "https:", href: "", reload: () => undefined },
    navigator: { userAgent: "douyin-miniapp", language: "zh-CN", maxTouchPoints: 5 },
    performance: { now: () => p.now() },
    Image: function ImageShim() { return p.createImage() },
    ImageData: p.nativeImageData || fakeImageData,
    CustomEvent: CustomEventShim,
    Event: CustomEventShim,
    URLSearchParams: URLSearchParamsShim,
    requestAnimationFrame: (cb: (now: number) => void) => {
      pending = cb
      schedule()
      return 1
    },
    cancelAnimationFrame: () => { pending = null },
    addEventListener: add(winListeners),
    removeEventListener: remove(winListeners),
    dispatchEvent: (event: any) => { fire(winListeners, event); return true },
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
  }
  Object.defineProperties(G, {
    innerWidth: { get: () => p.viewport().width },
    innerHeight: { get: () => p.viewport().height },
    devicePixelRatio: { get: () => p.viewport().dpr },
  })

  const pointer = (type: string, x: number, y: number, id: number) => {
    fire(canvasListeners, {
      type, clientX: x, clientY: y, pointerId: id, button: 0, buttons: type === "pointerup" ? 0 : 1, shiftKey: false,
      pointerType: "touch", target: canvasEl, preventDefault: () => undefined, stopPropagation: () => undefined,
    })
  }

  return {
    G,
    element: (id: string) => elements.get(id),
    pointer,
    wheel: (deltaY: number) => fire(winListeners, { type: "wheel", deltaY, target: canvasEl, preventDefault: () => undefined }),
    resize: () => fire(winListeners, { type: "resize" }),
    setHidden: (hidden: boolean) => {
      doc.hidden = hidden
      doc.visibilityState = hidden ? "hidden" : "visible"
      paused = hidden
      fire(docListeners, { type: "visibilitychange" })
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
    resetStats: () => { workMs.length = 0; stamps.length = 0 },
  }
}
