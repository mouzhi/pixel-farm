// v14：把网页版的两首背景乐（早晨=白天，夜晚=傍晚和夜里）和常用音效压成单声道小文件，写成 base64 模块。
// 抖音的 InnerAudioContext 不能直接播包内文件，落地页第一次点按后把它们写进用户目录再播（全程不联网）。
// 用法：node scripts/audio/gen-audio.mjs <pixel-farm 仓库> [提交]   需要 ffmpeg（libmp3lame）
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const [repo, rev = 'e2c8d83'] = process.argv.slice(2)
if (!repo) throw new Error('usage: gen-audio.mjs <repo> [rev]')
const tmp = mkdtempSync(join(tmpdir(), 'pf-audio-'))
const show = (p) => execFileSync('git', ['-C', repo, 'show', `${rev}:${p}`], { maxBuffer: 1 << 26 })
// 背景乐：单声道 22.05kHz 32kbps（每首约 0.47MB）
const MUSIC = { day: 'assets/audio/morning.mp3', night: 'assets/audio/night.mp3' }
// 音效：网页版原文件（已是单声道 64kbps，每个 2-13KB）；名字同网页版 audio.js 的 FILES
const SFX = {
  tap: 'sfx/tap.mp3', till: 'sfx/hoe1.mp3', water: 'sfx/water1.mp3', harvest: 'sfx/harvest1.mp3', coin: 'sfx/coin.mp3',
  plant: 'assets/audio/sfx/plant.mp3', refill: 'assets/audio/sfx/refill.mp3', pick: 'assets/audio/sfx/pick.mp3', chop: 'assets/audio/sfx/chop1.mp3',
  hay: 'assets/audio/sfx/hay.mp3', cast: 'assets/audio/sfx/cast.mp3', fish: 'assets/audio/sfx/splash.mp3', buy: 'assets/audio/sfx/buy.mp3',
  unlock: 'assets/audio/sfx/unlock.mp3', surprise: 'assets/audio/sfx/sparkle.mp3', clear: 'assets/audio/sfx/clear.mp3',
  chicken: 'assets/audio/sfx/chicken.mp3', sheep: 'assets/audio/sfx/sheep.mp3', cow: 'assets/audio/sfx/cow.mp3', pig: 'assets/audio/sfx/pig.mp3',
  cat: 'assets/audio/sfx/cat.mp3', dog: 'assets/audio/sfx/dog.mp3', bird: 'assets/audio/sfx/bird1.mp3',
}
const enc = (name, path) => {
  const src = join(tmp, `${name}-src.mp3`), out = join(tmp, `${name}.mp3`)
  writeFileSync(src, show(path))
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', '22050', '-c:a', 'libmp3lame', '-b:a', '32k', '-compression_level', '0', out])
  return readFileSync(out)
}
const lines = []
let raw = 0
const put = (obj, buf, k) => { raw += buf.length; obj.push(`  ${k}: '${buf.toString('base64')}',`) }
const m = [], s = []
for (const k of Object.keys(MUSIC)) put(m, enc(k, MUSIC[k]), k)
for (const k of Object.keys(SFX)) put(s, show(SFX[k]), k)
lines.push('/* eslint-disable */', `// 生成文件（scripts/audio/gen-audio.mjs，pixel-farm ${rev}）：mp3 的 base64。音乐 ${Object.keys(MUSIC).join('/')}，音效 ${Object.keys(SFX).length} 个`)
lines.push('export const AUDIO_VERSION = ' + JSON.stringify(`${rev}-a1`))
lines.push('export const MUSIC_DATA: Record<string, string> = {', ...m, '}')
lines.push('export const SFX_DATA: Record<string, string> = {', ...s, '}', '')
const outFile = join(dirname(fileURLToPath(import.meta.url)), '../../src/game/dy-audio-data.ts')
writeFileSync(outFile, lines.join('\n'))
console.log(`raw ${raw} B, module ${readFileSync(outFile).length} B -> ${outFile}`)
