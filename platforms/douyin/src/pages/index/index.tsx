import Taro, { useDidHide, useDidShow, useReady, useUnload } from '@tarojs/taro'
import { Canvas, Text, View } from '@tarojs/components'
import { useCallback, useEffect, useRef, useState } from 'react'

import { CustomNavSpace } from '@/components/custom-nav-space'
import bootFarm from '@/game/farm-engine'
import { createFarmEnv, type FrameStats } from '@/game/farm-env'
import { DEMO_SAVE, DEMO_SAVE_KEY } from '@/game/demo-save'

import './index.css'

const CANVAS_ID = 'farm-canvas'
const DEMO_MARK_KEY = 'pf-douyin-trial-demo'
const DEMO_VERSION = 'e2c8d83-day31-r2'
type Phase = 'loading' | 'ready' | 'error'
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
  const [stats, setStats] = useState<FrameStats>({ fps: 0, avgMs: 0, p95Ms: 0, frames: 0 })
  const [hud, setHud] = useState<Hud>({ day: '', clock: '', coins: '' })
  const [fogOn, setFogOn] = useState(true)
  const [lightOn, setLightOn] = useState(true)
  const [fastForward, setFastForward] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [diag, setDiag] = useState('')

  const boot = useCallback((attempt = 0) => {
    if (bootedRef.current) return
    const query = Taro.createSelectorQuery()
    query.select(`#${CANVAS_ID}`).fields({ node: true, size: true })
    query.select(`#${CANVAS_ID}`).boundingClientRect()
    setStep(`查找画布 ${attempt + 1}`)
    query.exec((res: any[]) => {
      try {
        bootWith(res, attempt)
      } catch (err) {
        console.error('[farm] boot failed', err)
        setErrorText(String((err as Error)?.message || err))
        setPhase('error')
      }
    })
  }, [])

  const bootWith = (res: any[], attempt: number) => {
    {
      const node = res?.[0]?.node
      const rect = res?.[1]
      if (!node) {
        if (attempt < 10) setTimeout(() => boot(attempt + 1), 150)
        else {
          setErrorText('画布没有准备好')
          setPhase('error')
        }
        return
      }
      bootedRef.current = true
      setStep('启动游戏')
      rectRef.current = { left: rect?.left || 0, top: rect?.top || 0, width: rect?.width || 375, height: rect?.height || 760 }
      const info = Taro.getSystemInfoSync()
      const runtime = Taro as unknown as { createOffscreenCanvas: (opts: Record<string, unknown>) => any }
      // 测速版：演示存档版本变了（或还没有存档）就换成这份演示存档
      if (!readStorage(DEMO_SAVE_KEY) || readStorage(DEMO_MARK_KEY) !== DEMO_VERSION) {
        Taro.setStorageSync(DEMO_SAVE_KEY, DEMO_SAVE)
        Taro.setStorageSync(DEMO_MARK_KEY, DEMO_VERSION)
      }
      // 屏幕画布只在这里定一次尺寸（约 2 倍 CSS 像素），之后每帧把游戏画面缩放上屏
      node.width = Math.round(rectRef.current.width * 2)
      node.height = Math.round(rectRef.current.height * 2)
      const env = createFarmEnv({
        mainCanvas: node,
        createOffscreenCanvas: (width, height) => {
          // 有原生 OffscreenCanvas 的环境直接用；抖音端走 tt.createOffscreenCanvas
          const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : runtime.createOffscreenCanvas({ type: '2d', width, height })
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
      setDiag([
        `离屏 ${typeof OffscreenCanvas === 'function' ? '原生' : 'tt'}`,
        `ImageData ${typeof ImageData === 'function' ? '有' : '无'}`,
        `画布 ${node?.constructor?.name || typeof node}`,
        `图片 ${canDecodeLocally() ? '本地解码' : '画布图片'}`,
      ].join(' · '))
      const t0 = nowMs()
      try {
        bootFarm(env.G)
        setBootMs(Math.round(nowMs() - t0))
        setPhase('ready')
      } catch (err) {
        console.error('[farm] boot failed', err)
        setErrorText(String((err as Error)?.message || err))
        setPhase('error')
      }
    }
  }

  useReady(() => boot())
  useDidShow(() => envRef.current?.setHidden(false))
  useDidHide(() => envRef.current?.setHidden(true))
  useUnload(() => envRef.current?.setHidden(true))

  useEffect(() => {
    if (phase !== 'ready') return undefined
    const timer = setInterval(() => {
      const env = envRef.current
      if (!env) return
      setStats(env.stats())
      setProblems(env.problems())
      setHud({
        day: env.element('day')?.textContent || '',
        clock: env.element('clock')?.textContent || '',
        coins: env.element('coins')?.textContent || '',
      })
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

  const toggleFog = () => {
    const hooks = envRef.current?.G.__trialHooks
    if (!hooks) return
    hooks.FOG.on = !fogOn
    setFogOn(!fogOn)
    envRef.current?.resetStats()
  }
  const toggleLight = () => {
    const env = envRef.current
    if (!env) return
    env.G.__trialNoLight = lightOn
    setLightOn(!lightOn)
    env.resetStats()
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
        {phase === 'ready' ? (
          <View className="farm-perf">
            <Text className="farm-perf-line text-xs">{`FPS ${stats.fps.toFixed(1)}`}</Text>
            <Text className="farm-perf-line text-xs">{`帧耗时 均 ${stats.avgMs.toFixed(1)} / p95 ${stats.p95Ms.toFixed(1)} ms`}</Text>
            <Text className="farm-perf-line text-xs">{`启动 ${bootMs} ms · 雾${fogOn ? '开' : '关'} · 光照${lightOn ? '开' : '关'}`}</Text>
            {diag ? <Text className="farm-perf-line text-xs">{diag}</Text> : null}
            {problems.slice(-3).map((line, i) => (
              <Text key={`p-${i}`} className="farm-perf-warn text-xs">{line}</Text>
            ))}
          </View>
        ) : null}
        {phase === 'loading' ? <Text className="farm-state text-base">{`农场加载中…（${step}）`}</Text> : null}
        {phase === 'error' ? (
          <View className="farm-error">
            <Text className="farm-state text-base">{`农场没能打开：${errorText}`}</Text>
          </View>
        ) : null}
        {phase === 'ready' ? (
          <View className="farm-controls">
            <View className={fogOn ? 'farm-btn is-on' : 'farm-btn'} onClick={toggleFog}>
              <Text className="farm-btn-text text-sm">{fogOn ? '雾 开' : '雾 关'}</Text>
            </View>
            <View className={lightOn ? 'farm-btn is-on' : 'farm-btn'} onClick={toggleLight}>
              <Text className="farm-btn-text text-sm">{lightOn ? '光照 开' : '光照 关'}</Text>
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
