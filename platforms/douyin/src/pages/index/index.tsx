import Taro, { useDidHide, useDidShow, useReady, useUnload } from '@tarojs/taro'
import { Canvas, Text, View } from '@tarojs/components'
import { useCallback, useEffect, useRef, useState } from 'react'

import { CustomNavSpace } from '@/components/custom-nav-space'
import bootFarm from '@/game/farm-engine'
import { createFarmEnv, type PerfReport } from '@/game/farm-env'
import { DEMO_SAVE, DEMO_SAVE_KEY } from '@/game/demo-save'

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
    objects: g(['list+shadowmask', 'o.tree', 'o.small', 'o.big', 'objects', 'o.hash', 'o.build', 'o.cache', 'o.dyn']),
    shadow: g(['applyShadows']),
    fog: g(['fog']),
    fx: g(['marks', 'fx+light']),
  }
}
type FarmEnv = ReturnType<typeof createFarmEnv>
type Hud = { day: string; clock: string; coins: string }

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

function readStorage(key: string): string | null {
  const value = Taro.getStorageSync(key)
  return typeof value === 'string' && value !== '' ? value : null
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
  const envRef = useRef<FarmEnv | null>(null)
  const rectRef = useRef({ left: 0, top: 0, width: 375, height: 760 })
  const touchRef = useRef<{ id: number; x: number; y: number } | null>(null)
  const bootedRef = useRef(false)
  const [phase, setPhase] = useState<Phase>('loading')
  const [errorText, setErrorText] = useState('')
  const [bootMs, setBootMs] = useState(0)
  const [step, setStep] = useState('准备中')
  const [perf, setPerf] = useState<PerfReport | null>(null)
  const [quality, setQuality] = useState<QualityChoice>('auto')
  const [level, setLevel] = useState<QualityLevel>('mid')
  const levelRef = useRef<QualityLevel>('mid')
  const qualityRef = useRef<QualityChoice>('auto')
  const sysRef = useRef<Record<string, unknown>>({})
  const [hud, setHud] = useState<Hud>({ day: '', clock: '', coins: '' })
  const [fastForward, setFastForward] = useState(false)
  const cacheRef = useRef(true)
  const [cacheOn, setCacheOn] = useState(true)
  const [pfc, setPfc] = useState({ statics: 0, dyn: 0, redraw: 0, whole: 0, wipe: 0, wipeWhy: '', blankOff: false, soilRate: 0, objRate: 0, patchRate: 0, patchDraws: 0, objWhy: '', soilWhy: '', objPatchWhy: '', soilPatchWhy: '', treeChg: 0, treeShare: 0, stkEvict: 0 })
  const dragBaseRef = useRef<{ soil: number; obj: number; sync: number } | null>(null)
  const pfcPrevRef = useRef<{ at: number; soil: number; obj: number; patch: number; pd: number } | null>(null)
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
    setBootLog(logRef.current)
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
      let stage = '开始'
      let lastSaved = 0
      env.G.__bootMark = (file: string) => {
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
      try {
        bootFarm(env.G)
      } catch (err) {
        fail(`游戏引擎（${stage}）`, err)
        return
      }
      const ms = Math.round(nowMs() - t0)
      setBootMs(ms)
      log(`引擎启动完成 ${ms}ms`)
      try {
        Taro.setStorageSync(BOOT_LOG_KEY, JSON.stringify({ at: Date.now(), done: true, lines: logRef.current }))
      } catch {
        // ignore
      }
      applyLevel(typeof OffscreenCanvas === 'function' ? 'high' : 'mid', '自动起始')
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
      setPerf(report)
      const st = env.G.__pfcStats
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
        })
        pfcPrevRef.current = { at: now, soil: st.soilBuild, obj: st.objBuild, patch: st.patch || 0, pd: st.patchDraws || 0 }
      }
      setProblems(env.problems())
      setHud({
        day: env.element('day')?.textContent || '',
        clock: env.element('clock')?.textContent || '',
        coins: env.element('coins')?.textContent || '',
      })
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
    applyLevel(next === 'auto' ? (typeof OffscreenCanvas === 'function' ? 'high' : 'mid') : next, next === 'auto' ? '自动' : '手动')
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
  const onTouchStart = (e: any) => {
    const p = point(e)
    if (!p || touchRef.current || (e?.touches?.length || 1) > 1) return
    touchRef.current = p
    const env = envRef.current
    if (env) {
      env.G.__dragging = true
      env.resetDrag()
      const st = env.G.__pfcStats
      dragBaseRef.current = st ? { soil: st.soilBuild, obj: st.objBuild, sync: (st.soilSync || 0) + (st.objSync || 0) } : null
    }
    envRef.current?.pointer('pointerdown', p.x, p.y, p.id)
  }
  const onTouchMove = (e: any) => {
    const p = point(e)
    if (!p || !touchRef.current) return
    envRef.current?.pointer('pointermove', p.x, p.y, touchRef.current.id)
  }
  const onTouchEnd = (e: any) => {
    const p = point(e) || touchRef.current
    if (!p || !touchRef.current) return
    envRef.current?.pointer('pointerup', p.x, p.y, touchRef.current.id)
    touchRef.current = null
    if (envRef.current) envRef.current.G.__dragging = false
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
      <View className="farm-overlay">
        <View className="farm-top-shade">
          <CustomNavSpace />
          {phase === 'ready' ? (
            <View className="farm-hud">
              <Text className="farm-hud-day text-sm">{`${hud.day} ${hud.clock}`}</Text>
              <Text className="farm-hud-coins text-base">{`${hud.coins} 金`}</Text>
            </View>
          ) : null}
        </View>
        {phase === 'ready' && perf ? (
          <View className="farm-perf">
            <Text className="farm-perf-big text-xl">{`FPS ${perf.fps.toFixed(1)}  均${perf.avgMs.toFixed(0)} 最大${perf.maxMs.toFixed(0)}ms`}</Text>
            <Text className="farm-perf-line text-base">{`模拟${perf.sim.toFixed(1)} 渲染${perf.render.toFixed(1)} 上屏${perf.present.toFixed(1)} 界面${perf.hud.toFixed(1)}`}</Text>
            {(() => {
              const gr = renderGroups(perf.parts)
              return <Text className="farm-perf-line text-base">{`地面${gr.ground.toFixed(1)} 物件${gr.objects.toFixed(1)} 阴影${gr.shadow.toFixed(1)} 雾${gr.fog.toFixed(1)} 光效${gr.fx.toFixed(1)}`}</Text>
            })()}
            <Text className="farm-perf-line text-base">{topParts(perf.parts)}</Text>
            <Text className="farm-perf-line text-base">{`新建画布${perf.canvasPerSec.toFixed(1)}/秒 共${perf.canvasTotal} 预热${envRef.current?.G.__noWarm ? '关' : '开'}`}</Text>
            <Text className="farm-perf-line text-base">{`新画布 ${perf.canvasSizes || '无'}`}</Text>
            <Text className="farm-perf-line text-base">{`缓存全清${pfc.wipe}次${pfc.wipeWhy ? `(${pfc.wipeWhy})` : ''} 空白检查${pfc.blankOff ? '已停' : '在跑'} 水面每${envRef.current?.G.__waterEvery || 1}帧`}</Text>
            <Text className="farm-perf-line text-base">{`缓存${cacheOn ? '新' : '旧'} 静物${pfc.statics} 动态${pfc.dyn} 补画${pfc.redraw} 整屏框${pfc.whole} 重建 地块${pfc.soilRate.toFixed(1)} 静物${pfc.objRate.toFixed(1)}/秒`}</Text>
            <Text className="farm-perf-line text-base">{`最近重建 地块:${pfc.soilWhy || '无'} 静物:${pfc.objWhy || '无'}`}</Text>
            <Text className="farm-perf-line text-base">{`局部补丁${pfc.patchRate.toFixed(1)}/秒 每次${pfc.patchDraws.toFixed(0)}贴 最近 静物:${pfc.objPatchWhy || '无'} 地块:${pfc.soilPatchWhy || '无'}`}</Text>
            <Text className="farm-perf-line text-base">{`树换样${pfc.treeChg} 共用树图${pfc.treeShare} 堆块淘汰${pfc.stkEvict}`}</Text>
            {(() => {
              const env = envRef.current
              const d = env ? env.dragStats() : { frames: 0, avgMs: 0, maxMs: 0 }
              const st = env?.G.__pfcStats
              const base = dragBaseRef.current
              const rb = st && base ? `${st.soilBuild - base.soil}+${st.objBuild - base.obj}（整帧${(st.soilSync || 0) + (st.objSync || 0) - base.sync}）` : '0'
              return <Text className="farm-perf-line text-base">{`拖动 帧${d.frames} 均${d.avgMs.toFixed(0)} 最大${d.maxMs.toFixed(0)}ms 重建${rb}`}</Text>
            })()}
            <Text className="farm-perf-line text-base">{`读像素${perf.getN.toFixed(1)}次${perf.getMs.toFixed(1)}ms 写像素${perf.putN.toFixed(1)}次${perf.putMs.toFixed(1)}ms 贴图${perf.drawN.toFixed(0)}`}</Text>
            <Text className="farm-perf-line text-base">{`dpr${String(sysRef.current.pixelRatio ?? '?')} 画布${perf.backW}x${perf.backH} 画面${perf.fbW}x${perf.fbH} 启动${(bootMs / 1000).toFixed(1)}s`}</Text>
            <Text className="farm-perf-line text-base">{`v6静止 画质 ${quality === 'auto' ? `自动·${LEVEL_TEXT[level]}` : LEVEL_TEXT[level]} · 离屏${String(sysRef.current.offscreen ?? '')}`}</Text>
            {problems.slice(-2).map((line, i) => (
              <Text key={`p-${i}`} className="farm-perf-warn text-sm">{line}</Text>
            ))}
          </View>
        ) : null}
        {phase === 'loading' ? <Text className="farm-state text-base">{`农场加载中…（${step}）`}</Text> : null}
        {phase === 'error' ? (
          <View className="farm-error">
            <Text className="farm-state text-base">{`农场没能打开：${errorText}`}</Text>
          </View>
        ) : null}
        {phase !== 'ready' ? (
          <View className="farm-bootlog">
            {prevLog.map((line, i) => (
              <Text key={`prev-${i}`} className="farm-perf-warn text-xs">{line}</Text>
            ))}
            {bootLog.map((line, i) => (
              <Text key={`log-${i}`} className="farm-perf-line text-xs">{line}</Text>
            ))}
          </View>
        ) : null}
        {phase === 'ready' ? (
          <View className="farm-controls">
            <View className="farm-btn is-on" onClick={cycleQuality}>
              <Text className="farm-btn-text text-sm">{`v6静止 画质 ${quality === 'auto' ? '自动' : LEVEL_TEXT[level]}`}</Text>
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
        ) : null}
      </View>
    </View>
  )
}
