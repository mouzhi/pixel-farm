// v14：游戏里的音乐和音效（同网页版 / 小红书版：按农场时间换曲并交叉淡入淡出，干活、卖货、买东西、动物有声音）。
// 全部离线：音频数据随包（dy-audio-data.ts），玩家第一次点按之后才写进用户目录、建播放器，不拖慢首帧。
// 开关存在网页版同一个键 mouzhi/pixel-farm:audio（{music,sfx,mv,sv}），界面右侧的音乐 / 音效按钮改它。
import Taro from '@tarojs/taro'

import { AUDIO_VERSION, MUSIC_DATA, SFX_DATA } from './dy-audio-data'

const KEY = 'mouzhi/pixel-farm:audio'
const DEF = { music: true, sfx: true, mv: 0.45, sv: 0.7 }
const XF = 4 // 秒：换曲 / 循环接头的淡入淡出
const MUSIC_GAIN = 0.55 // 录音文件响度高，乘到音乐音量上
const SFX_GAIN = 0.85
const POOL_MAX = 8 // 同时留着的音效播放器个数（最近用过的）
const GAP: Record<string, number> = { tap: 90, coin: 160, harvest: 200, water: 220, till: 220 }
const PRIORITY: Record<string, number> = { buy: 1, unlock: 1, surprise: 1, coin: 1 }
const TASK: Record<string, string> = {
  till: 'till', clear: 'clear', weed: 'clear', tidy: 'clear', plant: 'plant', transplant: 'plant', water: 'water', trough: 'water', refill: 'refill',
  harvest: 'harvest', pick: 'pick', chop: 'chop', feed: 'hay', hay: 'hay', fish: 'fish',
}
const UNLOCKS = /^(forest|east|orchard|south|coast|north|pasture|coop|fold|shed|sty|house)/
const IDLE: Record<string, number> = { chicken: 4, pig: 7, sheep: 9, cow: 10, cat: 6 }

type Settings = typeof DEF
type Deck = { a: any; url: string; key: string; v: number; to: number; step: number; playing: boolean; err: boolean }
type Sfx = { a: any; name: string; at: number; src: string }

const warn = (what: string, err: unknown, src?: string) => console.warn('[farm-audio]', what, src || '', err)

function loadSettings(): Settings {
  try {
    const raw = Taro.getStorageSync(KEY)
    const v = typeof raw === 'string' && raw ? JSON.parse(raw) : null
    return Object.assign({}, DEF, v || {})
  } catch {
    return Object.assign({}, DEF)
  }
}

export function createFarmAudio(G: any) {
  const set = loadSettings()
  const persist = () => {
    try {
      Taro.setStorageSync(KEY, JSON.stringify(set))
    } catch (e) {
      warn('save settings', e)
    }
  }
  let unlocked = false
  let ready = false
  let preparing = false
  let hidden = false
  let files: Record<string, string> = {}
  const decks: Deck[] = []
  let cur = -1
  let slot = ''
  let timer: any = 0
  let ambT: any = 0
  let idleT: any = 0
  const pool: Sfx[] = []
  const last: Record<string, number> = {}
  const recent: number[] = []
  const now = () => Date.now()
  // 一般用用户目录里的文件；某个文件播不了（src 无效）就对它改用 data: 地址；再不行就不再播它（不反复重试）
  const viaData: Record<string, number> = {}
  const dead: Record<string, number> = {}
  let played = false
  const dataOf = (key: string) => {
    const b64 = key.indexOf('m-') === 0 ? MUSIC_DATA[key.slice(2)] : SFX_DATA[key.slice(2)]
    return b64 ? `data:audio/mpeg;base64,${b64}` : ''
  }
  const srcOf = (key: string) => (viaData[key] ? dataOf(key) : files[key] || '')
  const invalidSrc = (e: any) => /src is invalid|src protocol|invalid src/i.test(String((e && e.errMsg) || e))
  /** 播放出错：先换 data: 地址，再出错就停用这个声音；返回要不要重试 */
  const failed = (key: string, e: unknown) => {
    if (!key || dead[key]) return false
    if (!viaData[key] && invalidSrc(e)) {
      viaData[key] = 1
      return true
    }
    dead[key] = 1
    return false
  }
  const notePlay = (what: string) => {
    if (played) return
    played = true
    console.info('[farm-audio] playing', what, viaData[what] ? '(data)' : '(file)')
  }

  const slotNow = () => {
    const S = G.__farm && G.__farm.S
    const T = S ? S.t % 1440 : new Date().getHours() * 60 + new Date().getMinutes()
    return T >= 330 && T < 1020 ? 'day' : 'night' // 早晨+下午=白天曲；傍晚+夜里=夜曲
  }
  const isNight = () => {
    const S = G.__farm && G.__farm.S
    if (!S) return false
    const T = S.t % 1440
    return T >= 20 * 60 || T < 5 * 60 + 30
  }
  const musicVol = () => Math.max(0, Math.min(1, set.mv * MUSIC_GAIN))

  // ---------- 数据落盘（第一次点按后，异步，按版本号缓存在用户目录） ----------
  async function prepare() {
    if (ready || preparing) return
    preparing = true
    try {
      const fs = Taro.getFileSystemManager()
      const dir = `${(Taro as any).env.USER_DATA_PATH}/pf-audio-${AUDIO_VERSION}`
      try {
        fs.accessSync(dir)
      } catch {
        try {
          fs.mkdirSync(dir, true)
        } catch (e) {
          warn('mkdir', e, dir)
        }
      }
      const out: Record<string, string> = {}
      const write = (name: string, b64: string) =>
        new Promise<void>((resolve) => {
          const path = `${dir}/${name}.mp3`
          try {
            fs.accessSync(path)
            out[name] = path
            resolve()
            return
          } catch {
            // 还没写过
          }
          fs.writeFile({
            filePath: path,
            data: b64,
            encoding: 'base64',
            success: () => {
              out[name] = path
              resolve()
            },
            fail: (e: unknown) => {
              warn('write', e, path)
              resolve()
            },
          })
        })
      for (const k of Object.keys(SFX_DATA)) await write(`s-${k}`, SFX_DATA[k])
      for (const k of Object.keys(MUSIC_DATA)) await write(`m-${k}`, MUSIC_DATA[k])
      files = out
      ready = true
      if (set.music && !hidden) musicOn()
      scheduleAmbience()
    } catch (e) {
      warn('prepare', e)
    } finally {
      preparing = false
    }
  }

  // ---------- 音乐：两个播放器轮流，换曲和循环接头处交叉淡变 ----------
  function deck(i: number): Deck {
    if (decks[i]) return decks[i]
    const a = Taro.createInnerAudioContext()
    a.autoplay = false
    a.loop = false
    a.volume = 0
    const d: Deck = { a, url: '', key: '', v: 0, to: 0, step: 0, playing: false, err: false }
    a.onError((e: unknown) => {
      const key = d.key
      d.err = true
      d.playing = false
      if (dead[key]) return
      let size = ''
      try {
        if (d.url.indexOf('ttfile://') === 0) size = ` size=${(Taro.getFileSystemManager().statSync(d.url) as any).size}`
      } catch (err) {
        size = ` stat-failed`
      }
      warn('music error', e, d.url.slice(0, 48) + size)
      if (failed(key, e) && decks[cur] === d && set.music && !hidden) startOn(d, key, true)
    })
    a.onPlay(() => notePlay(d.key))
    a.onEnded(() => {
      const wasErr = d.err
      d.playing = false
      // 没赶上淡变（例如时长没读到）：直接从头再放（出错引起的结束不算）
      if (!wasErr && decks[cur] === d && set.music && !hidden) startOn(d, d.key, true)
    })
    decks[i] = d
    return d
  }
  function fade(d: Deck, to: number, sec: number) {
    d.to = to
    d.step = sec > 0 ? Math.abs(to - d.v) / (sec * 10) : 1
  }
  function startOn(d: Deck, key: string, keepVol?: boolean) {
    if (dead[key]) return
    const url = srcOf(key)
    d.key = key
    d.err = false
    if (d.url !== url) {
      // 新地址从头开始，不在加载前 seek（预览器会报 src 无效）
      d.url = url
      d.a.startTime = 0
      d.a.src = url
    } else {
      try {
        d.a.seek(0)
      } catch {
        // ignore
      }
    }
    if (!keepVol) {
      d.v = 0
      d.a.volume = 0
    }
    d.a.play()
    d.playing = true
  }
  function swapTo(key: string) {
    const ni = cur === 0 ? 1 : 0
    const d = deck(ni)
    const old = decks[cur]
    startOn(d, key)
    fade(d, 1, XF)
    if (old && old !== d) fade(old, 0, XF)
    cur = ni
  }
  function tick() {
    if (hidden) return
    const s = slotNow()
    const key = `m-${s}`
    const d = decks[cur]
    if (!set.music) {
      // 关掉音乐：只把淡出走完
    } else if (files[key] && !dead[key] && (!d || s !== slot)) {
      slot = s
      swapTo(key)
    } else if (d && d.playing) {
      const dur = Number(d.a.duration) || 0
      const t = Number(d.a.currentTime) || 0
      if (dur > XF * 2 && t > dur - XF - 0.3 && d.to > 0) swapTo(d.key) // 接头：另一个播放器从头淡入
    }
    for (const q of decks) {
      if (!q || q.v === q.to) continue
      q.v = q.v < q.to ? Math.min(q.to, q.v + q.step) : Math.max(q.to, q.v - q.step)
      q.a.volume = q.v * musicVol()
      if (q.v === 0 && q.to === 0 && q.playing) {
        q.a.pause()
        q.playing = false
      }
    }
  }
  function musicOn() {
    if (!ready || hidden || !set.music) return
    if (!timer) timer = setInterval(tick, 100)
    const d = decks[cur]
    if (d && d.url) {
      d.a.play()
      d.playing = true
      fade(d, 1, 1)
    } else tick()
  }
  function musicOff(pauseNow: boolean) {
    for (const q of decks) {
      if (!q) continue
      if (pauseNow) {
        if (q.playing) q.a.pause()
        q.playing = false
      } else fade(q, 0, 0.6)
    }
    if (pauseNow) {
      clearInterval(timer)
      timer = 0
    }
  }

  // ---------- 音效 ----------
  function sfx(name: string, vol = 1) {
    if (!set.sfx || !ready || hidden) return false
    const key = `s-${name}`
    if (!files[key] || dead[key]) return false
    const url = srcOf(key)
    const t = now()
    if (t - (last[name] || 0) < (GAP[name] || 260)) return false
    while (recent.length && t - recent[0] > 2000) recent.shift()
    if (!PRIORITY[name] && (recent.length >= 4 || (recent.length && t - recent[recent.length - 1] < 120))) return false // 2 秒最多 4 个
    last[name] = t
    if (name !== 'tap') recent.push(t)
    let e = pool.find((p) => p.name === name)
    if (!e) {
      if (pool.length < POOL_MAX) {
        const a = Taro.createInnerAudioContext()
        a.autoplay = false
        e = { a, name: '', at: 0, src: '' }
        const me = e
        a.onError((err: unknown) => {
          const k = `s-${me.name}`
          if (dead[k]) return
          warn('sfx error', err, me.name)
          failed(k, err)
        })
        a.onPlay(() => notePlay(`s-${me.name}`))
        pool.push(e)
      } else e = pool.reduce((x, y) => (x.at <= y.at ? x : y))
      e.name = name
      e.src = url
      e.a.src = url
    } else if (e.src !== url) {
      e.src = url
      e.a.src = url
    } else {
      try {
        e.a.stop()
      } catch {
        // ignore
      }
    }
    e.at = t
    e.a.volume = Math.max(0, Math.min(1, set.sv * SFX_GAIN * vol))
    e.a.play()
    return true
  }
  const later = (ms: number, name: string, vol: number) => setTimeout(() => sfx(name, vol), ms)

  // 白天偶尔鸟叫；动物很少自己叫（同网页版，夜里不叫）
  function scheduleAmbience() {
    clearTimeout(ambT)
    ambT = setTimeout(() => {
      scheduleAmbience()
      if (!isNight() && G.__farm) sfx('bird', 0.6)
    }, 15000 + Math.random() * 25000)
    clearTimeout(idleT)
    idleT = setTimeout(function idle() {
      idleT = setTimeout(idle, 20000)
      const g = G.__farm
      const S = g && g.S
      if (!S || isNight() || !set.sfx || hidden) return
      const have: Record<string, number> = {}
      ;(S.animals || []).forEach((a: any) => { have[a.kind] = 1 })
      ;(g.PETS_LIVE || []).forEach((p: any) => { have[p.kind] = 1 })
      for (const k of Object.keys(IDLE)) if (have[k] && Math.random() < 20 / (IDLE[k] * 60)) { sfx(k, 0.45); break }
    }, 20000)
  }

  // ---------- 游戏事件 ----------
  G.addEventListener('pf:farm', (ev: any) => {
    const d = (ev && ev.detail) || {}
    const far = d.who && d.who !== 'farmer' ? 0.55 : 1
    if (d.type === 'task') {
      if (d.kind === 'pet' || d.kind === 'petpet') return d.an ? sfx(d.an, d.an === 'dog' ? 0.5 : 0.8 * far) : undefined
      if (d.kind === 'collect') {
        const k = d.an || 'chicken'
        return Math.random() < 0.3 ? sfx(k, 0.7 * far) : sfx('pick', 0.6 * far)
      }
      const n = TASK[d.kind]
      if (n) sfx(n, far)
      if (d.kind === 'feed' && d.an && Math.random() < 0.4) later(700, d.an, 0.6 * far)
    } else if (d.type === 'task-start' && d.kind === 'fish') sfx('cast', 0.8 * far)
    else if (d.type === 'income') {
      if (d.source === 'market') sfx('coin')
      else if (d.gold) sfx('coin', 0.7)
    } else if (d.type === 'purchase' && d.who === 'player') sfx(UNLOCKS.test(String(d.item)) ? 'unlock' : 'buy')
    else if (d.type === 'surprise') sfx('surprise')
  })
  // 界面按钮的轻点声
  G.addEventListener('click', (ev: any) => {
    const t = ev && ev.target
    const b = t && t.closest && t.closest('button,.pbtn,[data-buy],.slot')
    if (b) sfx('tap', b.disabled ? 0.4 : 0.8)
  }, true)

  /** 玩家第一次点按（画面或界面）：才开始准备音频 */
  function unlock() {
    if (unlocked) return
    unlocked = true
    setTimeout(() => void prepare(), 0)
  }
  G.addEventListener('pointerdown', unlock, true)

  const api = {
    KEY,
    settings: () => Object.assign({}, set),
    state: () => ({ unlocked, ready, music: set.music, sfx: set.sfx, slot, cur, viaData: Object.keys(viaData), dead: Object.keys(dead), decks: decks.map((d) => ({ url: d.key, v: Math.round(d.v * 100) / 100, playing: d.playing })), pool: pool.length, files: Object.keys(files).length }),
    setMusic: (on: boolean) => {
      set.music = !!on
      persist()
      if (set.music) musicOn()
      else musicOff(false)
    },
    setSfx: (on: boolean) => {
      set.sfx = !!on
      persist()
    },
    setVolume: (mv?: number, sv?: number) => {
      if (mv != null) set.mv = Math.max(0, Math.min(1, mv))
      if (sv != null) set.sv = Math.max(0, Math.min(1, sv))
      persist()
    },
    play: sfx,
    unlock,
    rain: () => undefined, // 雨声不随包（网页版另有 141KB 的雨声文件）
    /** 切到后台 / 回到前台 */
    setHidden: (h: boolean) => {
      hidden = h
      if (h) musicOff(true)
      else if (set.music) musicOn()
    },
    destroy: () => {
      musicOff(true)
      clearTimeout(ambT)
      clearTimeout(idleT)
      for (const q of decks) if (q) q.a.destroy()
      for (const e of pool) e.a.destroy()
    },
  }
  G.PFAudio = api
  return api
}
export type FarmAudio = ReturnType<typeof createFarmAudio>
