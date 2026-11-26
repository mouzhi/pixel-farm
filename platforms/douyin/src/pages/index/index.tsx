import Taro, { useDidHide, useDidShow, useReady, useUnload } from '@tarojs/taro'
import { Canvas, ScrollView, Text, View } from '@tarojs/components'
import { useCallback, useEffect, useRef, useState } from 'react'

import { CustomNavSpace } from '@/components/custom-nav-space'
import { measureCustomNavLayout } from '@/lib/custom-nav-layout'
import bootFarm from '@/game/farm-engine'
import { createFarmEnv, type PerfReport } from '@/game/farm-env'
import { DEMO_SAVE, DEMO_SAVE_KEY } from '@/game/demo-save'
import { FarmUI } from '@/game/farm-ui'
import { estimateRect } from '@/game/farm-ui-model'

import './index.css'

declare const tt: unknown

const CANVAS_ID = 'farm-canvas'
const BOOT_LOG_KEY = 'pf-douyin-boot-log'
const MAX_QUERY_ATTEMPTS = 12
const pageT0 = Date.now()
const DEMO_MARK_KEY = 'pf-douyin-trial-demo'
const DEMO_VERSION = 'e2c8d83-day31-r2'
type Phase = 'loading' | 'ready' | 'error'
type QualityLevel = 'high' | 'mid' | 'low'
type QualityChoice = 'auto' | QualityLevel
const LEVEL_TEXT: Record<QualityLevel, string> = { high: '高', mid: '中', low: '低' }
/** 渲染里最耗时的 5 段（游戏自带分段名） */
function topParts(parts: Record<string, number>) {
  return Object.keys(parts)
    .map((k) => [k, parts[k]] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `${k}${v.toFixed(1)}`)
    .join(' ')
}
/** 把游戏自带的渲染分段归成几类：地面水面 / 物件(叠层精灵) / 阴影 / 雾 / 特效+夜间光照 */
function renderGroups(parts: Record<string, number>) {
  const g = (keys: string[]) => keys.reduce((a, k) => a + (parts[k] || 0), 0)
  return {
    ground: g(['ground', 'water', 'flow', 'soil+decals']),
    objects: g(['list+shadowmask', 'o.tree', 'o.small', 'o.big', 'objects', 'o.scan', 'o.hash', 'o.build', 'o.cache', 'o.dyn']),
    shadow: g(['applyShadows']),
    fog: g(['fog']),
    fx: g(['marks', 'fx+light']),
  }
}
type FarmEnv = ReturnType<typeof createFarmEnv>

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

// v10：页面脚本开始运行的时间（启动分段的“准备”从这里算）
const PAGE_T0 = nowMs()
// v10：自动画质的起点：抖音（无原生 OffscreenCanvas）直接从 低 开始，加载后的头十几秒不再先跑在 中
const AUTO_START = (): QualityLevel => (typeof OffscreenCanvas === 'function' ? 'high' : 'low')
// v11：初始化再细分：基础=调色板/工具/地图数据，世界=河山与扩建区，工坊=工坊等，城镇=城镇/家园/民宿等各区，其余=初始化余下
const BOOT_PART_TEXT: [string, string][] = [['prep', '准备'], ['files', '前置'], ['i.base', '基础'], ['i.world', '世界'], ['i.works', '工坊'], ['i.town', '城镇'], ['init', '其余'], ['save', '存档'], ['region', '区域'], ['ground', '地面'], ['write', '写档'], ['offline', '补算'], ['tail', '其他']]

// v10：地面图：缓存命中=上次画好的整张图直接贴上；未命中=屏幕下的先画，其余空闲时画（百分比=已画）
// v11：加载填充（首帧之后屏上的东西陆续画出来）还没完时，角标显示“加载中”
function loadingText(st: any) {
  return st && !st.loadF && st.load0 ? ' 加载中' : ''
}
// v11：首帧分项 + 模型懒建进度
function frameText(G: any) {
  const st = (G && G.__pfcStats) || {}
  const ff = st.ff || {}
  const Z = G && G.__lzm
  const md = Z ? `模型${Z.built}/${Z.n}` : ''
  const ld = st.loadF ? `填充${st.loadF}帧${st.loadMs}ms` : st.load0 ? '填充中' : ''
  return `首帧 ${ff.ms || 0}ms(地面${ff.gb || 0}/${ff.gbn || 0}块 模型${ff.mdlMs || 0}/${ff.mdl || 0}个 图${ff.stk || 0}/${ff.stkN || 0}张) ${ld} ${md}`
}
function groundText(L: any) {
  if (!L) return ''
  const c = L.cache === 'hit' || L.cache === 'mem' ? '缓存' : '现画'
  return `地面${c}${L.left ? `${Math.round(100 * (1 - L.left / L.n))}%` : '完'}`
}

function readStorage(key: string): string | null {
  const value = Taro.getStorageSync(key)
  return typeof value === 'string' && value !== '' ? value : null
}

// v13：玩家版不显示任何调试信息（角标、面板、启动日志）。开发时在本地存储里写 pf-douyin-debug=1 才打开
const DEBUG_KEY = 'pf-douyin-debug'
const isDebug = () => {
  try {
    return readStorage(DEBUG_KEY) === '1'
  } catch {
    return false
  }
}

/** 完整农场第一阶段：在落地页跑网页版的模拟与渲染，并测帧率 */
// 预览器（逻辑层跑在 Worker 里）：图片在本地解码到离屏画布，不走画布代理，避免代理层报错
function canDecodeLocally() {
  return typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function' && typeof Blob === 'function' && typeof atob === 'function'
}
function createLocalImage() {
  const c: any = new OffscreenCanvas(1, 1)
  let src = ''
  c.complete = false
  c.naturalWidth = 0
  c.naturalHeight = 0
  c.onload = null
  c.onerror = null
  Object.defineProperty(c, 'src', {
    get: () => src,
    set: (v: string) => {
      src = String(v)
      // 游戏的图片都是内嵌 data URL；其它地址（如网页版的 assets/ 小地图图标）这里没有，直接按加载失败处理
      const m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(src)
      Promise.resolve()
        .then(() => {
          if (!m) throw new Error(`no local image for ${src.slice(0, 40)}`)
          const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3])
          const bytes = new Uint8Array(raw.length)
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
          return createImageBitmap(new Blob([bytes], { type: m[1] || 'image/png' }))
        })
        .then((bmp) => {
          c.width = bmp.width
          c.height = bmp.height
          c.getContext('2d').drawImage(bmp, 0, 0)
          c.naturalWidth = bmp.width
          c.naturalHeight = bmp.height
          c.complete = true
          if (typeof c.onload === 'function') c.onload({ type: 'load', target: c })
        })
        .catch((err) => {
          c.complete = true
          if (typeof c.onerror === 'function') c.onerror(err)
        })
    },
  })
  return c
}

export default function Index() {
  const DEBUG = useRef(isDebug()).current
  const envRef = useRef<FarmEnv | null>(null)
  const rectRef = useRef({ left: 0, top: 0, width: 375, height: 760 })
  const touchRef = useRef<{ id: number; x: number; y: number } | null>(null)
  const bootedRef = useRef(false)
  const [phase, setPhase] = useState<Phase>('loading')
  const [errorText, setErrorText] = useState('')
  const [bootMs, setBootMs] = useState(0)
  // v10：启动分段（毫秒）：准备=页面打开到引擎开始，前置=game.js 之前的文件，初始化=模型/地图/布局，存档=读档+迁移，地面=首帧前画的地面，写档，补算=离线补算，其他，首帧
  const [bootParts, setBootParts] = useState<Record<string, number>>({})
  // v11：调试面板默认收起成角上一行小字，点一下展开/收起
  const [panelOpen, setPanelOpen] = useState(false)
  const [step, setStep] = useState('准备中')
  const [perf, setPerf] = useState<PerfReport | null>(null)
  const [quality, setQuality] = useState<QualityChoice>('auto')
  const [level, setLevel] = useState<QualityLevel>('mid')
  const levelRef = useRef<QualityLevel>('mid')
  const qualityRef = useRef<QualityChoice>('auto')
  const sysRef = useRef<Record<string, unknown>>({})
  // v12：界面避让：顶部 = 抖音导航栏（左上角返回）下沿，底部 = 系统安全区
  const insetsRef = useRef({ top: 96, bottom: 8 })
  const [fastForward, setFastForward] = useState(false)
  const cacheRef = useRef(true)
  const [cacheOn, setCacheOn] = useState(true)
  const [pfc, setPfc] = useState({ statics: 0, dyn: 0, redraw: 0, whole: 0, wipe: 0, wipeWhy: '', blankOff: false, soilRate: 0, objRate: 0, patchRate: 0, patchDraws: 0, objWhy: '', soilWhy: '', objPatchWhy: '', soilPatchWhy: '', treeChg: 0, treeShare: 0, stkEvict: 0, stkRate: 0, stkTop: '', scrollRate: 0, scrollDraws: 0, fb: 0, chunks: 0, preStk: 0, defer: 0, fbRate: 0, deferRate: 0, scan: '' })
  const pfcPrevRef = useRef<{ at: number; soil: number; obj: number; patch: number; pd: number; stk: number; who: Record<string, number>; sc: number; sd: number; fb: number; df: number } | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [prevLog, setPrevLog] = useState<string[]>([])

  // 启动诊断：每一步都写到屏幕上，并存一份到本地；手机上卡住时，下次打开能看到上次停在哪一步
  const logRef = useRef<string[]>([])
  const attemptRef = useRef(0)
  const startedRef = useRef(false)
  const [bootLog, setBootLog] = useState<string[]>([])
  const log = (line: string) => {
    const t = Date.now() - pageT0
    logRef.current = logRef.current.concat(`${t}ms ${line}`).slice(-14)
    if (DEBUG) setBootLog(logRef.current)
    try {
      Taro.setStorageSync(BOOT_LOG_KEY, JSON.stringify({ at: Date.now(), done: false, lines: logRef.current }))
    } catch {
      // ignore
    }
  }

  const describeRes = (res: any) => {
    if (!Array.isArray(res)) return `res=${res === null ? 'null' : typeof res}`
    const part = (x: any) => {
      if (x == null) return String(x)
      const keys = Object.keys(x).slice(0, 6).join(',')
      const size = typeof x.width === 'number' ? ` ${Math.round(x.width)}x${Math.round(x.height)}` : ''
      return `{${keys}}${size}${x.node ? ` node:${typeof x.node}` : ''}`
    }
    return `res[${res.length}] [0]=${part(res[0])} [1]=${part(res[1])}`
  }

  const queryCanvas = (attempt: number) => {
    if (bootedRef.current) return
    attemptRef.current = attempt
    // 先按页面查；没有回调或拿不到节点时，换成 .in(当前页面) 再查
    const scoped = attempt % 2 === 1
    const how = scoped ? 'in(page)' : 'page'
    setStep(`查找画布 第${attempt + 1}次 ${how}`)
    let answered = false
    const watchdog = setTimeout(() => {
      if (answered || bootedRef.current || attemptRef.current !== attempt) return
      log(`第${attempt + 1}次查询 ${how} 1.5秒无回调`)
      retry(attempt)
    }, 1500)
    try {
      let query: any = Taro.createSelectorQuery()
      if (scoped) {
        const page = Taro.getCurrentInstance()?.page
        if (page) query = query.in(page as any)
        else log('getCurrentInstance().page 为空，按页面查')
      }
      query.select(`#${CANVAS_ID}`).fields({ node: true, size: true })
      query.select(`#${CANVAS_ID}`).boundingClientRect()
      query.exec((res: any[]) => {
        answered = true
        clearTimeout(watchdog)
        if (bootedRef.current) return
        log(`第${attempt + 1}次 ${how} 回调 ${describeRes(res)}`)
        const node = res?.[0]?.node
        if (!node) {
          retry(attempt)
          return
        }
        bootedRef.current = true
        const rect = res?.[1] || {}
        const size = res?.[0] || {}
        rectRef.current = {
          left: rect.left || 0,
          top: rect.top || 0,
          width: rect.width || size.width || 375,
          height: rect.height || size.height || 760,
        }
        setStep('拿到画布，准备引擎')
        // 先让界面刷新出当前步骤，再进入耗时的启动
        setTimeout(() => startGame(node), 60)
      })
    } catch (err) {
      clearTimeout(watchdog)
      log(`第${attempt + 1}次查询出错 ${String((err as Error)?.message || err)}`)
      retry(attempt)
    }
  }

  const retry = (attempt: number) => {
    if (bootedRef.current) return
    if (attempt + 1 >= MAX_QUERY_ATTEMPTS) {
      setErrorText(`查了 ${MAX_QUERY_ATTEMPTS} 次都没拿到画布节点`)
      setPhase('error')
      return
    }
    setTimeout(() => queryCanvas(attempt + 1), 200)
  }

  const fail = (where: string, err: unknown) => {
    const msg = String((err as Error)?.message || err)
    log(`${where} 出错：${msg}`)
    console.error('[farm]', where, err)
    setErrorText(`${where}：${msg}`)
    setPhase('error')
  }

  const startGame = (node: any) => {
    let env: FarmEnv
    try {
      const info = Taro.getSystemInfoSync()
      try {
        const nav = measureCustomNavLayout()
        const sa: any = (info as any).safeArea
        const sh = Number((info as any).screenHeight) || info.windowHeight
        insetsRef.current = { top: Math.round((nav.paddingTop || 88) + 6), bottom: Math.max(8, Math.round(sa && sa.bottom ? sh - sa.bottom : 0) + 6) }
      } catch {
        // 用默认值
      }
      sysRef.current = { brand: info.brand, model: info.model, platform: info.platform, system: info.system, version: info.version, sdk: info.SDKVersion, pixelRatio: info.pixelRatio, ww: info.windowWidth, wh: info.windowHeight, offscreen: typeof OffscreenCanvas === 'function' ? 'native' : 'tt' }
      log(`系统 ${info.platform || ''} ${info.system || ''} 宿主 ${info.version || ''} SDK ${info.SDKVersion || ''} 窗口 ${info.windowWidth}x${info.windowHeight}`)
      // 离屏画布：原生 OffscreenCanvas → Taro.createOffscreenCanvas → tt.createOffscreenCanvas
      const ttApi = typeof tt !== 'undefined' ? (tt as any) : null
      const taroApi = Taro as unknown as { createOffscreenCanvas?: (opts: Record<string, unknown>) => any }
      const runtime = {
        createOffscreenCanvas:
          typeof taroApi.createOffscreenCanvas === 'function'
            ? taroApi.createOffscreenCanvas
            : ttApi && typeof ttApi.createOffscreenCanvas === 'function'
              ? (opts: Record<string, unknown>) => ttApi.createOffscreenCanvas(opts)
              : undefined,
      }
      // 测速版：演示存档版本变了（或还没有存档）就换成这份演示存档
      if (!readStorage(DEMO_SAVE_KEY) || readStorage(DEMO_MARK_KEY) !== DEMO_VERSION) {
        Taro.setStorageSync(DEMO_SAVE_KEY, DEMO_SAVE)
        Taro.setStorageSync(DEMO_MARK_KEY, DEMO_VERSION)
      }
      const testCtx = node.getContext('2d')
      log(`画布 ${node.width}x${node.height} ctx:${testCtx ? 'ok' : '无'} 离屏:${typeof OffscreenCanvas === 'function' ? '原生' : typeof runtime.createOffscreenCanvas === 'function' ? 'tt' : '无'} createImage:${typeof node.createImage} rAF:${typeof node.requestAnimationFrame} ImageData:${typeof ImageData}`)
      env = createFarmEnv({
        mainCanvas: node,
        createOffscreenCanvas: (width, height) => {
          // 有原生 OffscreenCanvas 的环境直接用；抖音端走 tt.createOffscreenCanvas
          const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : runtime.createOffscreenCanvas!({ type: '2d', width, height })
          c.width = width
          c.height = height
          return c
        },
        createImage: () => (canDecodeLocally() ? createLocalImage() : typeof node.createImage === 'function' ? node.createImage() : new Image()),
        requestFrame: (cb) => {
          if (typeof node.requestAnimationFrame === 'function') node.requestAnimationFrame(cb)
          else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(cb)
          else setTimeout(() => cb(nowMs()), 16)
        },
        now: nowMs,
        storage: {
          get: readStorage,
          set: (k, v) => Taro.setStorageSync(k, v),
          remove: (k) => Taro.removeStorageSync(k),
          keys: () => Taro.getStorageInfoSync().keys || [],
        },
        // 画面像素大小按手机竖屏统一（约 280 像素宽的画面放大铺满），不随设备像素比变化
        viewport: () => ({ width: info.windowWidth, height: info.windowHeight, dpr: 3 }),
        canvasRect: () => rectRef.current,
        nativeImageData: typeof ImageData === 'function' ? ImageData : undefined,
        framebuffer: true,
        rectOf: (id) => estimateRect(id, insetsRef.current, info.windowWidth, info.windowHeight),
      })
      envRef.current = env
    } catch (err) {
      fail('准备运行环境', err)
      return
    }
    setStep('运行游戏引擎（手机上可能要十几秒）')
    log('开始运行游戏引擎')
    setTimeout(() => {
      const t0 = nowMs()
      const parts: Record<string, number> = { prep: Math.round(t0 - PAGE_T0) }
      let tb = t0
      env.G.__bp = (name: string) => {
        const t = nowMs()
        parts[name] = (parts[name] || 0) + Math.round(t - tb)
        tb = t
      }
      // v10：整张地图的地面不在启动时一次画完：屏幕下的先画，其余每帧在空闲预算里画（画面相同）
      env.G.__lazyGround = true
      // v11：体素模型用到时才建（屏上的先建），其余在每帧空闲预算里补建；首帧后屏上东西几帧内陆续画出
      env.G.__lazyModels = true
      let stage = '开始'
      let lastSaved = 0
      env.G.__bootMark = (file: string) => {
        if (file === 'game.js') env.G.__bp('files')
        stage = file
        const t = nowMs()
        // 引擎是同步跑完的，界面刷新不了；把进度存起来，万一卡死，下次打开能看到停在哪个文件
        if (t - lastSaved > 300) {
          lastSaved = t
          try {
            Taro.setStorageSync(BOOT_LOG_KEY, JSON.stringify({ at: Date.now(), done: false, lines: logRef.current.concat(`引擎进行到 ${file}（${Math.round(t - t0)}ms）`) }))
          } catch {
            // ignore
          }
        }
      }
      // Krypton（离屏tt）上每个预热角度都是新的 GL 画布，跳过空闲预热
      env.G.__noWarm = typeof OffscreenCanvas !== 'function'
      // v12：网页版界面（小红书版的手机外壳）：避让距离；地图上的区域牌子不显示（界面层节流刷新，会跟不上地图）
      env.G.__dyInsets = insetsRef.current
      env.G.__noSigns = true
      try {
        bootFarm(env.G)
      } catch (err) {
        fail(`游戏引擎（${stage}）`, err)
        return
      }
      env.G.__bp('tail')
      const ms = Math.round(nowMs() - t0)
      setBootMs(ms)
      setBootParts(parts)
      log(`引擎启动完成 ${ms}ms`)
      try {
        Taro.setStorageSync(BOOT_LOG_KEY, JSON.stringify({ at: Date.now(), done: true, lines: logRef.current }))
      } catch {
        // ignore
      }
      applyLevel(AUTO_START(), '自动起始')
      setPhase('ready')
    }, 60)
  }

  const kick = (from: string) => {
    if (startedRef.current) return
    startedRef.current = true
    log(`开始查找画布（${from}）`)
    queryCanvas(0)
  }

  useEffect(() => {
    // 上一次启动没走完：把它停下的位置显示出来
    try {
      const prev = readStorage(BOOT_LOG_KEY)
      const last = prev ? JSON.parse(prev) : null
      if (last && !last.done && Array.isArray(last.lines) && last.lines.length) {
        setPrevLog([`上次启动没完成（${new Date(last.at).toLocaleTimeString()}），最后几步：`].concat(last.lines.slice(-4)))
      }
    } catch {
      // ignore
    }
    log('页面已渲染')
    // useReady 是首选；万一真机没触发，1.2 秒后用 nextTick 兜底
    const timer = setTimeout(() => {
      if (!startedRef.current) {
        log('useReady 1.2秒未触发，改用 nextTick')
        Taro.nextTick(() => kick('nextTick'))
      }
    }, 1200)
    return () => clearTimeout(timer)
  }, [])

  useReady(() => {
    log('useReady')
    Taro.nextTick(() => kick('useReady'))
  })
  useDidShow(() => envRef.current?.setHidden(false))
  useDidHide(() => envRef.current?.setHidden(true))
  useUnload(() => envRef.current?.setHidden(true))

  useEffect(() => {
    if (phase !== 'ready') return undefined
    let ticks = 0
    const timer = setInterval(() => {
      const env = envRef.current
      if (!env) return
      ticks++
      const report = env.perf()
      if (DEBUG) setPerf(report)
      const st = DEBUG ? env.G.__pfcStats : null
      if (st) {
        const now = nowMs()
        const prev = pfcPrevRef.current
        const dt = prev ? (now - prev.at) / 1000 : 0
        setPfc({
          statics: st.statics, dyn: st.dyn, redraw: st.redraw, whole: st.badStatic || 0, wipe: st.wipe || 0, wipeWhy: st.wipeWhy || '', blankOff: !!st.blankOff,
          soilRate: dt > 0 ? (st.soilBuild - prev!.soil) / dt : 0,
          objRate: dt > 0 ? (st.objBuild - prev!.obj) / dt : 0,
          patchRate: dt > 0 ? ((st.patch || 0) - prev!.patch) / dt : 0,
          patchDraws: dt > 0 && (st.patch || 0) > prev!.patch ? ((st.patchDraws || 0) - prev!.pd) / ((st.patch || 0) - prev!.patch) : 0,
          objWhy: st.objWhy || '', soilWhy: st.soilWhy || '', objPatchWhy: st.objPatchWhy || '', soilPatchWhy: st.soilPatchWhy || '',
          treeChg: st.treeChg || 0, treeShare: st.treeShare || 0, stkEvict: st.stkEvict || 0,
          stkRate: dt > 0 ? ((st.stkNew || 0) - prev!.stk) / dt : 0,
          // 这段时间里新做堆块图最多的模型（宽x深x高）
          stkTop: Object.entries((st.stkWho || {}) as Record<string, number>).map(([k, v]) => [k, v - ((prev && prev.who[k]) || 0)] as [string, number]).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}×${v}`).join(' '),
          scrollRate: dt > 0 ? ((st.chunkBuild || 0) - prev!.sc) / dt : 0,
          scrollDraws: (st.chunkBuild || 0) > (prev ? prev.sc : 0) ? ((st.chunkDraws || 0) - (prev ? prev.sd : 0)) / ((st.chunkBuild || 0) - (prev ? prev.sc : 0)) : 0,
          fb: (st.soilFb || 0) + (st.objFb || 0), chunks: st.chunks || 0, preStk: (st.preStk || 0) + (st.preTree || 0), defer: st.defer || 0,
          fbRate: dt > 0 ? ((st.soilFb || 0) + (st.objFb || 0) - prev!.fb) / dt : 0, deferRate: dt > 0 ? ((st.defer || 0) - prev!.df) / dt : 0,
          scan: st.scanProf ? `树${st.scanProf.tree.toFixed(1)} 作物${st.scanProf.crop.toFixed(1)} 贴片${st.scanProf.spr.toFixed(1)} 堆块${st.scanProf.stack.toFixed(1)} 热表${st.scanProf.hot.toFixed(1)} 共${st.scanProf.n}` : '',
        })
        pfcPrevRef.current = { at: now, soil: st.soilBuild, obj: st.objBuild, patch: st.patch || 0, pd: st.patchDraws || 0, stk: st.stkNew || 0, who: Object.assign({}, st.stkWho || {}), sc: st.chunkBuild || 0, sd: st.chunkDraws || 0, fb: (st.soilFb || 0) + (st.objFb || 0), df: st.defer || 0 }
      }
      if (DEBUG) setProblems(env.problems())
      // 自动画质：攒够约 45 帧后，低于 30 FPS 就降一档（只降不升，避免来回跳）
      if (qualityRef.current === 'auto' && ticks % 4 === 0 && report.frames >= 45 && report.fps < 30) {
        const next = levelRef.current === 'high' ? 'mid' : levelRef.current === 'mid' ? 'low' : null
        if (next) applyLevel(next, `自动：${report.fps.toFixed(1)} FPS < 30`)
      }
    }, 500)
    return () => clearInterval(timer)
  }, [phase])

  // 到夜晚：加速到晚上 19:30 左右就恢复正常速度（入睡后游戏自己会快进，所以停在入夜前后）
  useEffect(() => {
    if (!fastForward) return undefined
    const timer = setInterval(() => {
      const farm = envRef.current?.G.__farm
      if (!farm) return
      const minute = Math.floor(farm.S.t % 1440)
      if (minute >= 19 * 60 + 30 || minute < 4 * 60) {
        farm.setSpeed(1)
        setFastForward(false)
      }
    }, 50)
    return () => clearInterval(timer)
  }, [fastForward])

  // 画质：高 = 屏幕画布 2 倍 + 精确阴影（逐像素读回）；中 = 1 倍 + GPU 阴影（不读回）；低 = 1 倍、不画阴影、雾和夜间光照关
  // 缓存（A/B）：新 = 地块+静物各合成一张缓存层、每帧只贴一次（画面不变；低画质另把风吹摆动定格，树也能进缓存）；旧 = 逐个贴图
  const applyCache = (level: QualityLevel) => {
    const env = envRef.current
    if (!env) return
    const on = cacheRef.current
    env.G.__soilCache = on
    // 中/高 的树在摆动，静物层收益小于开销：只在 低 开
    env.G.__objCache = on && level === 'low'
    env.G.__noSway = on && level === 'low'
    // 低：水面动画每 3 帧算一次，中间帧把上次结果贴回（省掉整块读像素）
    env.G.__waterEvery = on && level === 'low' ? 3 : 1
  }
  const toggleCache = () => {
    cacheRef.current = !cacheRef.current
    setCacheOn(cacheRef.current)
    applyCache(levelRef.current)
    envRef.current?.resetStats()
    log(`缓存 ${cacheRef.current ? '新' : '旧'}`)
  }
  const applyLevel = (next: QualityLevel, why: string) => {
    const env = envRef.current
    if (!env) return
    applyCache(next)
    env.setPresentScale(next === 'high' ? 2 : 1)
    env.G.__gpuShadow = next !== 'high'
    env.G.__trialNoShadow = next === 'low'
    env.G.__trialNoLight = next === 'low'
    const hooks = env.G.__trialHooks
    if (hooks) hooks.FOG.on = next !== 'low'
    levelRef.current = next
    setLevel(next)
    env.resetStats()
    log(`画质 ${LEVEL_TEXT[next]}（${why}）`)
  }
  const cycleQuality = () => {
    const order: QualityChoice[] = ['auto', 'high', 'mid', 'low']
    const next = order[(order.indexOf(qualityRef.current) + 1) % order.length]
    qualityRef.current = next
    setQuality(next)
    applyLevel(next === 'auto' ? AUTO_START() : next, next === 'auto' ? '自动' : '手动')
  }
  const goNight = () => {
    const farm = envRef.current?.G.__farm
    if (!farm || fastForward) return
    farm.setSpeed(16)
    setFastForward(true)
  }
  const zoom = (delta: number) => envRef.current?.G.__trialHooks?.zoomBy(delta)

  const point = (e: any) => {
    const t = e?.changedTouches?.[0] || e?.touches?.[0]
    if (!t) return null
    const r = rectRef.current
    const x = typeof t.clientX === 'number' ? t.clientX : r.left + (t.x || 0)
    const y = typeof t.clientY === 'number' ? t.clientY : r.top + (t.y || 0)
    return { id: Number(t.identifier) || 0, x, y }
  }
  // v12：多指也转给界面脚本（小红书版的双指缩放 / 旋转），单指照旧走 pointer
  const touchList = (list: any) => {
    const r = rectRef.current
    const out: { id: number; x: number; y: number }[] = []
    for (let i = 0; list && i < list.length; i++) {
      const t = list[i]
      out.push({ id: Number(t.identifier) || 0, x: typeof t.clientX === 'number' ? t.clientX : r.left + (t.x || 0), y: typeof t.clientY === 'number' ? t.clientY : r.top + (t.y || 0) })
    }
    return out
  }
  const forwardTouch = (type: string, e: any) => envRef.current?.touch(type, touchList(e?.touches), touchList(e?.changedTouches))
  const onTouchStart = (e: any) => {
    forwardTouch('touchstart', e)
    const p = point(e)
    if (!p || touchRef.current || (e?.touches?.length || 1) > 1) return
    touchRef.current = p
    const env = envRef.current
    if (env) {
      env.G.__dragging = true
      env.resetDrag()
    }
    envRef.current?.pointer('pointerdown', p.x, p.y, p.id)
  }
  const onTouchMove = (e: any) => {
    forwardTouch('touchmove', e)
    const p = point(e)
    if (!p || !touchRef.current) return
    envRef.current?.pointer('pointermove', p.x, p.y, touchRef.current.id)
  }
  const onTouchEnd = (e: any) => {
    forwardTouch(e?.type === 'touchcancel' ? 'touchcancel' : 'touchend', e)
    const p = point(e) || touchRef.current
    if (!p || !touchRef.current) return
    envRef.current?.pointer('pointerup', p.x, p.y, touchRef.current.id)
    touchRef.current = null
    if (envRef.current) {
      envRef.current.G.__dragging = false
      envRef.current.endDrag()
    }
  }

  return (
    <View className="farm-page">
      <Canvas
        id={CANVAS_ID}
        type="2d"
        className="farm-canvas"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      />
      {/* v12：调试角标在界面层下面（面板盖住它）；展开后浮到最上面，画质/缓存/到夜晚/缩放都在展开的面板里 */}
      {DEBUG && phase === 'ready' && perf ? (
        <View className={panelOpen ? 'farm-perf-wrap is-open' : 'farm-perf-wrap'} style={{ top: `${insetsRef.current.top + 120}px` }}>
          <View className="farm-badge" onClick={() => setPanelOpen(!panelOpen)}>
            <Text className="farm-badge-text text-xs">{`v12 · FPS ${perf.fps.toFixed(0)} · 启动${((bootMs + (envRef.current?.bootFps().first || 0)) / 1000).toFixed(1)}s${loadingText(envRef.current?.G.__pfcStats)} ${panelOpen ? '▲' : '▼'}`}</Text>
          </View>
          {panelOpen ? (
            <ScrollView className="farm-perf" scrollY>
              <Text className="farm-perf-line text-xs">{`FPS ${perf.fps.toFixed(1)} 均${perf.avgMs.toFixed(0)} 最大${perf.maxMs.toFixed(0)}ms`}</Text>
              {(() => {
                const env = envRef.current
                const d = env ? env.dragStats() : { frames: 0, avgMs: 0, maxMs: 0, draws: 0, canvases: 0, secs: 0, pfc: {} as Record<string, number> }
                const q = d.pfc || {}
                // 整层：整层重建（应为0）；区块：建好的区块；缺块：屏上区块没建完、直接画的次数
                const rb = `整层${(q.soilBuild || 0) + (q.objBuild || 0)} 区块${(q.soilChunk || 0) + (q.objChunk || 0)} 缺块${(q.soilFb || 0) + (q.objFb || 0)} 补丁${q.patch || 0}`
                return <Text className="farm-perf-line text-xs">{`拖动 帧${d.frames} 均${d.avgMs.toFixed(0)} 最大${d.maxMs.toFixed(0)}ms 贴图${d.draws.toFixed(0)} 新画布${d.canvases} ${rb}`}</Text>
              })()}
              <Text className="farm-perf-line text-xs">{`dpr${String(sysRef.current.pixelRatio ?? '?')} 画布${perf.backW}x${perf.backH} 画面${perf.fbW}x${perf.fbH} 启动${(bootMs / 1000).toFixed(1)}s`}</Text>
              <Text className="farm-perf-line text-xs">{`启动 ${BOOT_PART_TEXT.filter(([k]) => bootParts[k] !== undefined).map(([k, t]) => `${t}${bootParts[k]}`).join(' ')} 首帧${Math.round(envRef.current?.bootFps().first || 0)}ms ${groundText(envRef.current?.G.__gbl)}`}</Text>
              <Text className="farm-perf-line text-xs">{frameText(envRef.current?.G)}</Text>
              {(() => {
                const b = envRef.current ? envRef.current.bootFps() : { first: 0, secs: 0, buckets: [] as { min: number; avg: number }[] }
                const done = b.buckets.map((x, i) => `${i * 5}-${i * 5 + 5}s ${x.min}/${x.avg.toFixed(0)}`).join(' ')
                return <Text className="farm-perf-line text-xs">{`前20秒FPS(最低/均) ${done}${b.secs < 20 ? ` 测量中${b.secs}s` : ''}`}</Text>
              })()}
              <Text className="farm-perf-line text-xs">{`模拟${perf.sim.toFixed(1)} 渲染${perf.render.toFixed(1)} 上屏${perf.present.toFixed(1)} 界面${perf.hud.toFixed(1)}`}</Text>
              {(() => {
                const gr = renderGroups(perf.parts)
                return <Text className="farm-perf-line text-xs">{`地面${gr.ground.toFixed(1)} 物件${gr.objects.toFixed(1)} 阴影${gr.shadow.toFixed(1)} 雾${gr.fog.toFixed(1)} 光效${gr.fx.toFixed(1)}`}</Text>
              })()}
              <Text className="farm-perf-line text-xs">{topParts(perf.parts)}</Text>
              <Text className="farm-perf-line text-xs">{`新建画布${perf.canvasPerSec.toFixed(1)}/秒 共${perf.canvasTotal} 预热${envRef.current?.G.__noWarm ? '关' : '开'}`}</Text>
              <Text className="farm-perf-line text-xs">{`新画布 ${perf.canvasSizes || '无'}`}</Text>
              <Text className="farm-perf-line text-xs">{`缓存全清${pfc.wipe}次${pfc.wipeWhy ? `(${pfc.wipeWhy})` : ''} 空白检查${pfc.blankOff ? '已停' : '在跑'} 水面每${envRef.current?.G.__waterEvery || 1}帧`}</Text>
              <Text className="farm-perf-line text-xs">{`缓存${cacheOn ? '新' : '旧'} 静物${pfc.statics} 动态${pfc.dyn} 补画${pfc.redraw} 整屏框${pfc.whole} 整层重建 地块${pfc.soilRate.toFixed(1)} 静物${pfc.objRate.toFixed(1)}/秒`}</Text>
              <Text className="farm-perf-line text-xs">{`最近重建 地块:${pfc.soilWhy || '无'} 静物:${pfc.objWhy || '无'}`}</Text>
              <Text className="farm-perf-line text-xs">{`局部补丁${pfc.patchRate.toFixed(1)}/秒 每次${pfc.patchDraws.toFixed(0)}贴 最近 静物:${pfc.objPatchWhy || '无'} 地块:${pfc.soilPatchWhy || '无'}`}</Text>
              <Text className="farm-perf-line text-xs">{`树换样${pfc.treeChg} 共用树图${pfc.treeShare} 堆块淘汰${pfc.stkEvict} 新堆块${pfc.stkRate.toFixed(1)}/秒 ${pfc.stkTop || ''}`}</Text>
              <Text className="farm-perf-line text-xs">{`区块新建${pfc.scrollRate.toFixed(1)}/秒 每块${pfc.scrollDraws.toFixed(0)}贴 区块${pfc.chunks} 缺块${pfc.fbRate.toFixed(1)}/秒(共${pfc.fb}) 预建图${pfc.preStk} 延后${pfc.deferRate.toFixed(0)}/秒(共${pfc.defer}) 扫描ms ${pfc.scan || '无'}`}</Text>
              <Text className="farm-perf-line text-xs">{`读像素${perf.getN.toFixed(1)}次${perf.getMs.toFixed(1)}ms 写像素${perf.putN.toFixed(1)}次${perf.putMs.toFixed(1)}ms 贴图${perf.drawN.toFixed(0)}`}</Text>
              <Text className="farm-perf-line text-xs">{`画质 ${quality === 'auto' ? `自动·${LEVEL_TEXT[level]}` : LEVEL_TEXT[level]} · 离屏${String(sysRef.current.offscreen ?? '')}`}</Text>
              {problems.slice(-2).map((line, i) => (
                <Text key={`p-${i}`} className="farm-perf-warn text-xs">{line}</Text>
              ))}
              <View className="farm-controls">
                <View className="farm-btn is-on" onClick={cycleQuality}>
                  <Text className="farm-btn-text text-sm">{`画质 ${quality === 'auto' ? '自动' : LEVEL_TEXT[level]}`}</Text>
                </View>
                <View className={cacheOn ? 'farm-btn is-on' : 'farm-btn'} onClick={toggleCache}>
                  <Text className="farm-btn-text text-sm">{`缓存 ${cacheOn ? '新' : '旧'}`}</Text>
                </View>
                <View className={fastForward ? 'farm-btn is-on' : 'farm-btn'} onClick={goNight}>
                  <Text className="farm-btn-text text-sm">{fastForward ? '快进中…' : '到夜晚'}</Text>
                </View>
                <View className="farm-btn" onClick={() => zoom(-1)}>
                  <Text className="farm-btn-text text-sm">缩小</Text>
                </View>
                <View className="farm-btn" onClick={() => zoom(1)}>
                  <Text className="farm-btn-text text-sm">放大</Text>
                </View>
              </View>
            </ScrollView>
          ) : null}
        </View>
      ) : null}
      {phase === 'ready' && envRef.current ? <FarmUI env={envRef.current} /> : null}
      <View className="farm-overlay">
        {phase !== 'ready' ? <CustomNavSpace /> : null}
        {phase === 'loading' ? <Text className="farm-state text-base">{DEBUG ? `农场加载中…（${step}）` : '农场加载中…'}</Text> : null}
        {phase === 'error' ? (
          <View className="farm-error">
            <Text className="farm-state text-base">{`农场没能打开：${errorText}`}</Text>
          </View>
        ) : null}
        {DEBUG && phase !== 'ready' ? (
          <View className="farm-bootlog">
            {prevLog.map((line, i) => (
              <Text key={`prev-${i}`} className="farm-perf-warn text-xs">{line}</Text>
            ))}
            {bootLog.map((line, i) => (
              <Text key={`log-${i}`} className="farm-perf-line text-xs">{line}</Text>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  )
}
