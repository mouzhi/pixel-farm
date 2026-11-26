// Builds src/game/farm-engine.js from the web game (pixel-farm main) for the Douyin landing page.
// All classic <script> files are joined into one function scope; every free (browser-global) identifier becomes a lookup on the
// injected environment object __G, so the game never touches a real document/window. Usage: node build.mjs <repoDir> <rev> <outFile>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { parse } from '@babel/parser';
import traverseMod from '@babel/traverse';
import generateMod from '@babel/generator';
import * as t from '@babel/types';
import { minify } from 'terser';
import { transformSync } from '@babel/core';
import { CACHE_PATCHES } from './patches-cache.mjs';
const traverse = traverseMod.default || traverseMod, generate = generateMod.default || generateMod;
const [repo, rev, out, flag] = process.argv.slice(2);
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });
const html = git('show', `${rev}:index.html`);
const SKIP = new Set(['ui.js', 'events-ui.js', 'plots-ui.js', 'diary-ui.js', 'album-ui.js', 'audio.js']); // DOM panels + WebAudio: later phases
const files = [...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]).filter(f => !SKIP.has(f));
const PATCHES = { // exact, asserted source patches (trial toggles only)
  'game.js': [['if (night > 0) lighting(night, T);', 'if (night > 0 && !window.__trialNoLight) lighting(night, T);'],
    ['const base = Math.max(1, Math.floor(Math.min(vw / BW, vh / BH))), s = base + zoom;', 'const base = Math.max(1, Math.floor(vh > vw ? Math.min(vw / BH, vh / BW) : Math.min(vw / BW, vh / BH))), s = base + zoom; // douyin: portrait uses the reference frame turned upright (same as the xhs build)'],
    ["post('chop', CHOP_ORDER_BASE + travel(F, t) / 8, t, () => chopTask(t), undefined, undefined, true);", "if (t) post('chop', CHOP_ORDER_BASE + travel(F, t) / 8, t, () => chopTask(t), undefined, undefined, true); /* rngNear can return null when all marked trees are claimed */"],
    ['if (night < 0.9) applyShadows();', 'if (night < 0.9 && !window.__trialNoShadow) { if (window.__gpuShadow) gpuShadows(); else applyShadows(); } // douyin: quality modes (visual only)'],
    // douyin: on GPU-backed mini-program canvases (Krypton) applyShadows' two full-frame getImageData read-backs + putImageData stall the
    // GPU every frame. gpuShadows darkens the same mask with draw calls only (multiply by a ramp-step-like tint), no read-back.
    ['function applyShadows() {', 'let SHG = null;\nfunction gpuShadows() {\n  if (!SHG || SHG.width !== W || SHG.height !== H) SHG = mk(W, H);\n  const g = SHG.getContext(\'2d\');\n  g.globalCompositeOperation = \'copy\'; g.drawImage(shC, 0, 0);\n  g.globalCompositeOperation = \'source-in\'; g.fillStyle = \'#c4c8d8\'; g.fillRect(0, 0, W, H);\n  g.globalCompositeOperation = \'source-over\';\n  ctx.globalCompositeOperation = \'multiply\'; ctx.drawImage(SHG, 0, 0); ctx.globalCompositeOperation = \'source-over\';\n}\nfunction applyShadows() {'],
    ['  try { advance(dt); } catch (e) { try { console.warn(\'[pixel-farm] advance\', e); } catch (x) {} }\n  try { render(); } catch (e) { try { console.warn(\'[pixel-farm] render\', e); } catch (x) {} }\n  try { albumTick(); hud(); } catch (e) { try { console.warn(\'[pixel-farm] hud\', e); } catch (x) {} }',
     '  const __t0 = performance.now();\n  try { advance(dt); } catch (e) { try { console.warn(\'[pixel-farm] advance\', e); } catch (x) {} }\n  const __t1 = performance.now();\n  try { render(); } catch (e) { try { console.warn(\'[pixel-farm] render\', e); } catch (x) {} }\n  const __t2 = performance.now();\n  try { albumTick(); hud(); } catch (e) { try { console.warn(\'[pixel-farm] hud\', e); } catch (x) {} }\n  if (window.__frameProf) window.__frameProf(__t1 - __t0, __t2 - __t1, performance.now() - __t2); // douyin: on-device perf split'],
    ['  if (!MANUAL) idle(work); }', '  if (!MANUAL && !window.__noWarm) idle(work); } // douyin: on GPU canvases (Krypton) every warmed angle is a new GL canvas; skip the idle warm-up'],
    ['if (MANUAL) { render(); hud(); } else requestAnimationFrame(frame);', 'window.__trialHooks = { FOG, cam, zoomBy: d => { zoom = clamp(zoom + d, 0, 3); fit(); }, fit };\nif (MANUAL) { render(); hud(); } else requestAnimationFrame(frame);']],
  // (each script is preceded by window.__bootMark(file) so a phone that hangs during boot can report where)
};
PATCHES['game.js'].push(...CACHE_PATCHES);
let src = '';
for (const f of files) {
  let s = git('show', `${rev}:${f}`);
  for (const [a, b] of PATCHES[f] || []) { if (!s.includes(a)) throw new Error('patch miss ' + f); s = s.replace(a, b); }
  src += `\n;// ---- ${f}\n;if (window.__bootMark) window.__bootMark(${JSON.stringify(f)});\n` + s + '\n';
}
const BUILTIN = new Set(('Math JSON Object Array Number String Boolean Symbol Map Set WeakMap WeakSet WeakRef Promise Date RegExp Error TypeError RangeError SyntaxError ReferenceError EvalError URIError AggregateError ' +
  'parseInt parseFloat isNaN isFinite Infinity NaN undefined ArrayBuffer SharedArrayBuffer DataView Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array Uint32Array Float32Array Float64Array BigInt64Array BigUint64Array ' +
  'Proxy Reflect BigInt encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape setTimeout clearTimeout setInterval clearInterval Intl arguments eval Function').split(' '));
const ast = parse(src, { sourceType: 'script', allowReturnOutsideFunction: true, errorRecovery: false });
const globals = new Set(), topFns = new Set();
traverse(ast, {
  Program(p) { for (const [name, b] of Object.entries(p.scope.bindings)) if (b.kind === 'hoisted' || b.kind === 'var') topFns.add(name); },
  Identifier(p) {
    const n = p.node.name;
    if (!(p.isReferencedIdentifier() || (p.parentPath.isAssignmentExpression() && p.parentPath.node.left === p.node) || (p.parentPath.isUpdateExpression()))) return;
    if (p.scope.hasBinding(n, true)) return;
    if (BUILTIN.has(n)) return;
    globals.add(n);
    const repl = (n === 'window' || n === 'self' || n === 'globalThis') ? t.identifier('__G') : t.memberExpression(t.identifier('__G'), t.identifier(n));
    p.replaceWith(repl); p.skip();
  },
});
const reg = [...topFns].map(n => `Object.defineProperty(__G, ${JSON.stringify(n)}, { configurable: true, get: () => ${n}, set: v => { ${n} = v; } });`).join('\n');
const body = generate(ast, { comments: false, compact: false }).code;
let code = `/* eslint-disable */\n// @ts-nocheck\n// Generated by platforms/douyin/scripts/build-game.mjs from pixel-farm ${rev}. Do not edit by hand.\nexport default function bootFarm(__G) {\n${reg}\n${body}\n}\n`;
if (flag !== '--no-min') {
  // Taro's own Babel pass uses loose transforms (e.g. spreading a Set), which silently break the game; hand it plain ES5 so it has nothing left to rewrite
  code = (await minify(code, { module: true, compress: { passes: 1 }, mangle: true })).code;
  code = transformSync(code, { babelrc: false, configFile: false, compact: true, sourceType: 'module',
    presets: [['@babel/preset-env', { targets: ['last 3 versions', 'Android >= 4.1', 'ios >= 8'], modules: false }]] }).code;
  code = (await minify(code, { module: true, ecma: 5, compress: { passes: 1 }, mangle: true, format: { comments: false, preamble: `/* eslint-disable */\n// @ts-nocheck\n// Generated from pixel-farm ${rev} (web game) by scripts/build-game.mjs (spec ES5). Do not edit by hand.` } })).code;
}
fs.writeFileSync(out, code);
fs.writeFileSync(out + '.globals.json', JSON.stringify([...globals].sort(), null, 1));
console.log('files', files.length, 'bytes', code.length, 'globals', [...globals].sort().join(' '));
