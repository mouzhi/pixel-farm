// 像素农场 · 声音：程序生成的 Lo-Fi 背景音乐 + 程序生成的音效 + 昼夜环境声（鸟叫 / 虫鸣）。
// No audio files are needed: everything is synthesized with WebAudio at run time, so it costs 0 bytes of assets, works offline
// (the Xiaohongshu mini tool container has no network) and has no license to track. SFX use ZzFX's sample builder
// (MIT, (c) 2019 Frank Force, https://github.com/KilledByAPixel/ZzFX; see CREDITS.md).
// Later, real tracks (CC0 or AI-made) can replace the generator: set window.PF_MUSIC_TRACKS = ['assets/audio/a.mp3', ...]
// before this file loads, or call PFAudio.setTracks([...]); the generator then steps aside and the files play as a playlist.
// Browsers only allow sound after a user gesture, so nothing starts until the first tap / click / key.
// Settings live in their own localStorage key (a per-device preference, not part of the farm save).
'use strict';
(() => {
  const KEY = 'mouzhi/pixel-farm:audio';
  const DEF = { music: true, sfx: true, mv: 0.45, sv: 0.7 };
  const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const load = () => { try { return Object.assign({}, DEF, JSON.parse((store && store.getItem(KEY)) || '{}')); } catch (e) { return Object.assign({}, DEF); } };
  const set = load();
  const persist = () => { try { store && store.setItem(KEY, JSON.stringify(set)); } catch (e) {} };
  const AC = window.AudioContext || window.webkitAudioContext;
  const A = { ctx: null, unlocked: false, tracks: (window.PF_MUSIC_TRACKS || []).slice(), plays: 0, lastSfx: '' };
  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- graph ----------
  function build() {
    if (A.ctx || !AC) return !!A.ctx;
    let c; try { c = new AC(); } catch (e) { return false; }
    A.ctx = c;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.connect(c.destination);
    A.master = c.createGain(); A.master.gain.value = 0.9; A.master.connect(comp);
    A.music = c.createGain(); A.music.gain.value = 0; // faded in by applyVolumes()
    A.tone = c.createBiquadFilter(); A.tone.type = 'lowpass'; A.tone.frequency.value = 2600; A.tone.Q.value = 0.4; // the "warm, slightly muffled" lo-fi tone
    A.music.connect(A.tone); A.tone.connect(A.master);
    A.sfx = c.createGain(); A.sfx.gain.value = 0; A.sfx.connect(A.master);
    A.amb = c.createGain(); A.amb.gain.value = 0.5; A.amb.connect(A.sfx);
    // tape wow: one slow LFO bends the pitch of every key note by a few cents
    A.wow = c.createOscillator(); A.wow.frequency.value = 0.33; A.wowAmt = c.createGain(); A.wowAmt.gain.value = 9; A.wow.connect(A.wowAmt); A.wow.start();
    // Rhodes-like tremolo on the keys bus
    A.keys = c.createGain(); A.keys.gain.value = 0.8; const trem = c.createOscillator(), tg = c.createGain(); trem.frequency.value = 4.2; tg.gain.value = 0.12; trem.connect(tg); tg.connect(A.keys.gain); trem.start();
    A.keys.connect(A.music);
    A.drums = c.createGain(); A.drums.gain.value = 0.55; A.drums.connect(A.music);
    // a short echo for the melody
    A.dly = c.createDelay(1); A.dly.delayTime.value = 0.42; const fb = c.createGain(); fb.gain.value = 0.28; const dl = c.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 1800;
    A.dly.connect(dl); dl.connect(fb); fb.connect(A.dly); dl.connect(A.music);
    A.noise = noiseBuf(2);
    return true;
  }
  function noiseBuf(sec) { const c = A.ctx, b = c.createBuffer(1, c.sampleRate * sec | 0, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  function crackleBuf() { // vinyl: soft hiss plus sparse clicks, looped under the music
    const c = A.ctx, n = c.sampleRate * 3 | 0, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.06;
    for (let k = 0; k < 40; k++) { const at = Math.random() * (n - 200) | 0, a = rnd(0.2, 0.9) * (Math.random() < 0.15 ? 1 : 0.4); for (let j = 0; j < 30; j++) d[at + j] += a * (Math.random() * 2 - 1) * (1 - j / 30); }
    return b;
  }
  const t0 = () => A.ctx.currentTime;
  function env(g, t, a, peak, dec, sus = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + dec); }

  // ---------- generative lo-fi ----------
  // A "song" = a jazzy 4-chord loop in a random key and tempo, ~2 minutes, with sections (intro keys only, groove, breakdown).
  const PROGS = [ // MIDI voicings relative to C, root separate for the bass
    [[0, [4, 7, 11, 14]], [9, [12, 16, 19, 23]], [2, [5, 9, 12, 16]], [7, [5, 9, 11, 16]]],      // Cmaj9 Am9 Dm9 G13
    [[5, [4, 9, 12, 16]], [4, [2, 7, 11, 14]], [2, [0, 5, 9, 12]], [0, [-1, 4, 7, 11]]],         // Fmaj7 Em7 Dm7 Cmaj7
    [[2, [5, 9, 12, 16]], [7, [5, 9, 11, 16]], [0, [4, 7, 11, 14]], [9, [7, 12, 16, 19]]],       // ii V I vi
    [[9, [7, 12, 16, 19]], [5, [4, 9, 12, 16]], [0, [4, 7, 11, 14]], [7, [5, 9, 11, 14]]],       // vi IV I V
    [[5, [4, 9, 12, 16]], [7, [5, 9, 11, 14]], [4, [2, 7, 11, 14]], [9, [7, 12, 16, 19]]],       // IV V iii vi
  ];
  const PENTA = [0, 2, 4, 7, 9];
  const G = { on: false, step: 0, next: 0, timer: 0, song: null, mel: 72, crackle: null };
  function newSong() {
    const s = G.song = { prog: pick(PROGS), key: pick([-3, -2, 0, 2, 3, 5]), bpm: Math.round(rnd(66, 82)), swing: rnd(0.54, 0.62), bars: 0, len: pick([40, 48, 56]), seed: Math.random() };
    s.spb = 60 / s.bpm / 4; // seconds per 16th
    return s;
  }
  function night() { const g = window.__farm, S = g && g.S; if (!S) return false; const T = S.t % 1440; return T >= 20 * 60 || T < 5 * 60 + 30; }
  function section(s) { const b = s.bars; if (b < 4) return 'intro'; if (b >= s.len - 4) return 'outro'; if (b % 16 >= 12 && b % 16 < 14) return 'break'; return 'groove'; }
  function keyNote(m, t, len, vel) {
    const c = A.ctx, f = mtof(m), o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), g2 = c.createGain();
    o.type = 'sine'; o.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f * 2; o2.detune.value = 4;
    A.wowAmt.connect(o.detune); A.wowAmt.connect(o2.detune); o.onended = () => { try { A.wowAmt.disconnect(o.detune); A.wowAmt.disconnect(o2.detune); } catch (e) {} };
    g2.gain.value = 0.18; o2.connect(g2); g2.connect(g); o.connect(g); g.connect(A.keys);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.012); g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.start(t); o2.start(t); o.stop(t + len + 0.05); o2.stop(t + len + 0.05);
  }
  function bass(m, t, len) {
    const c = A.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    o.type = 'triangle'; o.frequency.value = mtof(m); o.connect(lp); lp.connect(g); g.connect(A.music);
    env(g, t, 0.02, 0.34, len); o.start(t); o.stop(t + len + 0.05);
  }
  function kick(t, v = 1) {
    const c = A.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    o.connect(g); g.connect(A.drums); env(g, t, 0.004, 0.9 * v, 0.28); o.start(t); o.stop(t + 0.35);
  }
  function noiseHit(t, type, freq, q, peak, dec, bus = A.drums) {
    const c = A.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = A.noise; f.type = type; f.frequency.value = freq; f.Q.value = q; s.connect(f); f.connect(g); g.connect(bus);
    env(g, t, 0.003, peak, dec); s.start(t, Math.random() * 1.5); s.stop(t + dec + 0.05);
  }
  const snare = (t, v = 1) => { noiseHit(t, 'bandpass', 1700, 0.8, 0.38 * v, 0.16); };
  const hat = (t, v = 1) => noiseHit(t, 'highpass', 7000, 0.7, 0.09 * v, 0.045);
  function lead(m, t, len) {
    const c = A.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
    o.type = 'triangle'; o.frequency.value = mtof(m); A.wowAmt.connect(o.detune); o.onended = () => { try { A.wowAmt.disconnect(o.detune); } catch (e) {} };
    o.connect(lp); lp.connect(g); g.connect(A.music); g.connect(A.dly);
    env(g, t, 0.03, 0.13, len); o.start(t); o.stop(t + len + 0.1);
  }
  function scheduleStep(st, t) {
    const s = G.song, sec = section(s), n = night(), bar = Math.floor(st / 16), i = st % 16;
    const [root, voic] = s.prog[bar % 4], k = 48 + s.key;
    if (i === 0) { voic.forEach((v, j) => keyNote(k + 12 + v, t + j * 0.025, s.spb * 15, 0.11)); if (sec !== 'intro') bass(k - 12 + root, t, s.spb * 6); }
    if (i === 10 && Math.random() < 0.4) voic.slice(1).forEach((v, j) => keyNote(k + 12 + v, t + j * 0.02, s.spb * 5, 0.06));
    if (i === 11 && sec !== 'intro' && Math.random() < 0.6) bass(k - 12 + root + pick([0, 7, 12]), t, s.spb * 3);
    const drums = (sec === 'groove' || sec === 'outro') && !(n && bar % 2);
    if (drums) {
      if (i === 0 || i === 10 || (i === 7 && Math.random() < 0.3)) kick(t, i ? 0.75 : 1);
      if (i === 4 || i === 12) snare(t);
      if (i % 2 === 0) hat(t, i % 4 ? 0.6 : 1); else if (Math.random() < 0.15) hat(t, 0.35);
    }
    if (sec !== 'intro' && i % 2 === 0 && Math.random() < (sec === 'break' ? 0.35 : n ? 0.12 : 0.2)) { // sparse pentatonic melody over the chord root
      const scale = []; for (let o = 0; o < 2; o++) for (const p of PENTA) scale.push(k + 24 + o * 12 + p);
      let j = scale.findIndex(x => x >= G.mel); if (j < 0) j = scale.length - 1;
      j = Math.max(0, Math.min(scale.length - 1, j + pick([-2, -1, -1, 1, 1, 2, 0]))); G.mel = scale[j];
      lead(G.mel, t, s.spb * pick([2, 3, 4, 6]));
    }
  }
  function tick() {
    if (!G.on || !A.ctx) return;
    const ahead = t0() + 0.25;
    while (G.next < ahead) {
      const s = G.song, st = G.step % 16, sw = st % 2 ? (s.swing - 0.5) * 2 * s.spb : 0;
      scheduleStep(G.step, G.next + sw);
      G.next += s.spb; G.step++;
      if (G.step % 16 === 0) { s.bars++; if (s.bars >= s.len) { newSong(); G.step = 0; G.next += 1.5; } } // a breath between songs
    }
    A.tone.frequency.setTargetAtTime(night() ? 1500 : 2600, t0(), 2);
  }
  function startGen() {
    if (G.on) return; G.on = true; if (!G.song) newSong(); G.step = 0; G.next = t0() + 0.15;
    if (!G.crackle) { const s = A.ctx.createBufferSource(), hp = A.ctx.createBiquadFilter(), g = A.ctx.createGain(); s.buffer = crackleBuf(); s.loop = true; hp.type = 'highpass'; hp.frequency.value = 900; g.gain.value = 0.35; s.connect(hp); hp.connect(g); g.connect(A.music); s.start(); G.crackle = s; }
    G.timer = setInterval(tick, 60); tick();
  }
  function stopGen() { G.on = false; clearInterval(G.timer); if (G.crackle) { try { G.crackle.stop(); } catch (e) {} G.crackle = null; } }

  // ---------- file playlist (for real tracks later) ----------
  const P = { el: null, i: 0 };
  function startFiles() {
    if (!P.el) { P.el = new Audio(); P.el.preload = 'auto'; P.el.addEventListener('ended', () => { P.i = (P.i + 1) % A.tracks.length; P.el.src = A.tracks[P.i]; P.el.play().catch(() => {}); });
      try { A.ctx.createMediaElementSource(P.el).connect(A.music); } catch (e) {} }
    if (!P.el.src) { P.i = Math.floor(Math.random() * A.tracks.length); P.el.src = A.tracks[P.i]; }
    P.el.play().catch(() => {});
  }
  const stopFiles = () => { if (P.el) P.el.pause(); };
  function musicOn() { if (!A.ctx) return; if (A.tracks.length) { stopGen(); startFiles(); } else { stopFiles(); startGen(); } }
  function musicOff() { stopGen(); stopFiles(); }

  // ---------- SFX ----------
  // ZzFX sample builder (MIT, Frank Force). Parameters: volume, randomness, frequency, attack, sustain, release, shape,
  // shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter
  function zzfxBuild(sr, volume = 1, randomness = .05, frequency = 220, attack = 0, sustain = 0, release = .1, shape = 0, shapeCurve = 1, slide = 0, deltaSlide = 0, pitchJump = 0, pitchJumpTime = 0, repeatTime = 0, noise = 0, modulation = 0, bitCrush = 0, delay = 0, sustainVolume = 1, decay = 0, tremolo = 0, filter = 0) {
    const PI2 = Math.PI * 2, abs = Math.abs, sign = v => v < 0 ? -1 : 1;
    let startSlide = slide *= 500 * PI2 / sr / sr, startFrequency = frequency *= (1 + randomness * 2 * Math.random() - randomness) * PI2 / sr,
      modOffset = 0, repeat = 0, crush = 0, jump = 1, length, b, t = 0, i = 0, s = 0, f;
    const quality = 2, w = PI2 * abs(filter) * 2 / sr, cos = Math.cos(w), alpha = Math.sin(w) / 2 / quality, a0 = 1 + alpha, a1 = -2 * cos / a0, a2 = (1 - alpha) / a0,
      b0 = (1 + sign(filter) * cos) / 2 / a0, b1 = -(sign(filter) + cos) / a0, b2 = b0;
    let x2 = 0, x1 = 0, y2 = 0, y1 = 0;
    attack = attack * sr || 9; decay *= sr; sustain *= sr; release *= sr; delay *= sr; deltaSlide *= 500 * PI2 / sr ** 3;
    modulation *= PI2 / sr; pitchJump *= PI2 / sr; pitchJumpTime *= sr; repeatTime = repeatTime * sr | 0;
    length = attack + decay + sustain + release + delay | 0; b = new Float32Array(length > 0 ? length : 0);
    for (; i < length; b[i++] = s * volume) {
      if (!(++crush % (bitCrush * 100 | 0))) {
        s = shape ? shape > 1 ? shape > 2 ? shape > 3 ? shape > 4 ? (t / PI2 % 1 < shapeCurve / 2 ? 1 : -1) : Math.sin(t ** 3) : Math.max(Math.min(Math.tan(t), 1), -1) : 1 - (2 * t / PI2 % 2 + 2) % 2 : 1 - 4 * abs(Math.round(t / PI2) - t / PI2) : Math.sin(t);
        s = (repeatTime ? 1 - tremolo + tremolo * Math.sin(PI2 * i / repeatTime) : 1) * (shape > 4 ? s : sign(s) * abs(s) ** shapeCurve) *
          (i < attack ? i / attack : i < attack + decay ? 1 - ((i - attack) / decay) * (1 - sustainVolume) : i < attack + decay + sustain ? sustainVolume : i < length - delay ? (length - i - delay) / release * sustainVolume : 0);
        s = delay ? s / 2 + (delay > i ? 0 : (i < length - delay ? 1 : (length - i) / delay) * b[i - delay | 0] / 2 / volume) : s;
        if (filter) s = y1 = b2 * x2 + b1 * (x2 = x1) + b0 * (x1 = s) - a2 * y2 - a1 * (y2 = y1);
      }
      f = (frequency += slide += deltaSlide) * Math.cos(modulation * modOffset++);
      t += f + f * noise * (i * i * PI2 % 2 - 1);
      if (jump && ++jump > pitchJumpTime) { frequency += pitchJump; startFrequency += pitchJump; jump = 0; }
      if (repeatTime && !(++repeat % repeatTime)) { frequency = startFrequency; slide = startSlide; jump ||= 1; }
    }
    return b;
  }
  // Each sound: [ZzFX params] or a function(t) that plays notes. Tuned soft and short so an idle farm never gets noisy.
  const Z = {
    tap: [.5, 0, 900, 0, 0, .02, 1, 1, 0, 0, 300, .01],
    till: [.9, .1, 90, 0, .02, .12, 4, 1.4, -3, 0, 0, 0, 0, 1.2, 0, 0, 0, .6, .02, 0, 900],          // thud of a hoe in soil
    clear: [.7, .1, 140, 0, .03, .1, 4, 1, 0, 0, 0, 0, .05, .8, 0, 0, 0, .5, 0, 0, 1500],             // rustle
    plant: [.6, .05, 340, 0, 0, .07, 0, 1.5, 0, 0, 200, .03, 0, 0, 0, 0, 0, .6],                     // soft "plip"
    water: [.5, .1, 600, .02, .15, .25, 4, 1, 0, 0, 0, 0, 0, .9, 0, 0, 0, .4, .05, 0, 2400],          // pour / splash
    refill: [.5, .1, 300, .02, .2, .3, 4, 1, 3, 0, 0, 0, 0, .6, 0, 0, 0, .4, 0, 0, 1800],
    harvest: [.7, .05, 520, 0, .02, .12, 0, 1.8, 4, 0, 300, .04, 0, 0, 0, 0, 0, .7],                  // pop
    chop: [1, .1, 110, 0, .01, .12, 1, .5, -6, 0, 0, 0, 0, .3, 0, 0, .03, .5, .02],                   // wood knock + echo
    pick: [.6, .05, 700, 0, 0, .06, 0, 1.4, 0, 0, 400, .03],
    hay: [.5, .1, 200, .02, .08, .15, 4, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, .5, 0, 0, 1200],
    chicken: [.5, .2, 700, 0, .02, .05, 2, 2, 0, 0, 0, 0, .06, .2, 0, 0, 0, .7, 0, 0, 2000],          // cluck cluck
    sheep: [.5, .1, 330, .03, .25, .2, 2, 1.5, 0, 0, 0, 0, .04, .1, 0, 0, 0, .6, 0, .6, 1400],          // baa (tremolo)
    cow: [.6, .05, 115, .08, .45, .3, 2, 1.5, -.4, 0, 0, 0, 0, .05, 0, 0, 0, .7, 0, 0, 700],           // moo
    pig: [.5, .1, 220, 0, .1, .08, 2, 1, 0, 0, 0, 0, .05, .5, 0, 0, 0, .6, 0, 0, 900],
    cat: [.5, .05, 620, .05, .12, .18, 1, 1.5, 3, -.3, 0, 0, 0, 0, 0, 0, 0, .7, 0, 0, 2400],            // meow
    dog: [.6, .05, 300, 0, .03, .06, 2, 1, -4, 0, 0, 0, .12, .3, 0, 0, 0, .7, 0, 0, 1200],             // woof woof
    fish: [.5, .1, 400, 0, .05, .2, 4, 1, 0, 0, 0, 0, 0, .7, 0, 0, 0, .4, 0, 0, 2000],
    deny: [.4, 0, 180, 0, .04, .08, 2, 1, -2, 0, 0, 0, 0, 0, 0, 0, 0, .6, 0, 0, 900],
  };
  function bell(f, t, len, v = 0.18, type = 'sine') { const c = A.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), g2 = c.createGain();
    o.type = type; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 3.01; g2.gain.value = 0.15; o2.connect(g2); g2.connect(g); o.connect(g); g.connect(A.sfx);
    env(g, t, 0.005, v, len); o.start(t); o2.start(t); o.stop(t + len + 0.05); o2.stop(t + len + 0.05); }
  const JINGLE = {
    coin: t => { bell(mtof(88), t, 0.12, 0.12, 'square'); bell(mtof(93), t + 0.07, 0.3, 0.1, 'square'); },
    buy: t => [72, 76, 79, 84].forEach((m, i) => bell(mtof(m), t + i * 0.07, 0.35, 0.14, 'triangle')),
    surprise: t => [79, 83, 86, 91, 95].forEach((m, i) => bell(mtof(m), t + i * 0.06, 0.6, 0.11)),
    giant: t => { [60, 64, 67, 72].forEach((m, i) => bell(mtof(m), t + i * 0.09, 0.5, 0.16, 'triangle')); bell(mtof(84), t + 0.4, 0.9, 0.12); },
    chirp: t => { const n = 2 + (Math.random() * 3 | 0), f0 = rnd(2600, 4200); for (let i = 0; i < n; i++) { const c = A.ctx, o = c.createOscillator(), g = c.createGain(), s = t + i * rnd(0.09, 0.16);
      o.frequency.setValueAtTime(f0, s); o.frequency.exponentialRampToValueAtTime(f0 * rnd(1.15, 1.5), s + 0.06); o.connect(g); g.connect(A.amb); env(g, s, 0.01, 0.05, 0.07); o.start(s); o.stop(s + 0.1); } },
    cricket: t => { const c = A.ctx, o = c.createOscillator(), g = c.createGain(), f = rnd(4300, 4900); o.frequency.value = f; o.connect(g); g.connect(A.amb); g.gain.setValueAtTime(0, t);
      const n = 3 + (Math.random() * 4 | 0); for (let i = 0; i < n; i++) { const s = t + i * 0.045; g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.025, s + 0.008); g.gain.linearRampToValueAtTime(0, s + 0.03); } o.start(t); o.stop(t + n * 0.045 + 0.05); },
  };
  const bufs = {}, last = {};
  let lastAny = 0;
  function sfx(name, vol = 1) {
    if (!set.sfx || !A.ctx || A.ctx.state !== 'running' || document.hidden) return false;
    const now = performance.now(), gap = name === 'tap' ? 40 : 260;
    if (now - (last[name] || 0) < gap || (name !== 'tap' && now - lastAny < 90)) return false; // an idle farm at 4x must not rattle
    last[name] = now; if (name !== 'tap') lastAny = now;
    A.plays++; A.lastSfx = name;
    const t = t0() + 0.01;
    if (JINGLE[name]) { JINGLE[name](t); return true; }
    const p = Z[name]; if (!p) return false;
    let b = bufs[name]; if (!b) { const d = zzfxBuild(A.ctx.sampleRate, ...p); b = bufs[name] = A.ctx.createBuffer(1, d.length || 1, A.ctx.sampleRate); b.getChannelData(0).set(d); }
    const s = A.ctx.createBufferSource(), g = A.ctx.createGain(); s.buffer = b; s.playbackRate.value = rnd(0.94, 1.06); g.gain.value = 0.5 * vol; s.connect(g); g.connect(A.sfx); s.start(t);
    return true;
  }
  // ambience: birds by day, crickets at night (part of the SFX switch)
  let ambT = 0;
  function ambience() { clearTimeout(ambT); ambT = setTimeout(ambience, night() ? rnd(700, 1600) : rnd(2500, 7000));
    if (!set.sfx || !A.ctx || A.ctx.state !== 'running' || document.hidden || !window.__farm) return;
    (night() ? JINGLE.cricket : JINGLE.chirp)(t0() + 0.02); }

  // ---------- game events ----------
  const TASK = { till: 'till', clear: 'clear', weed: 'clear', tidy: 'clear', plant: 'plant', transplant: 'plant', water: 'water', trough: 'water', refill: 'refill',
    harvest: 'harvest', pick: 'pick', chop: 'chop', feed: 'hay', hay: 'hay', fish: 'fish', collect: 'chicken' };
  addEventListener('pf:farm', e => {
    const d = e.detail || {}, far = d.who && d.who !== 'farmer' ? 0.55 : 1;
    if (d.type === 'task') {
      if ((d.kind === 'pet' || d.kind === 'petpet') && d.an) return sfx(Z[d.an] ? d.an : 'chicken', far);
      if (d.kind === 'pet' && !d.an) return;
      if (d.an && Z[d.an] && Math.random() < 0.5) return sfx(d.an, far); // milking / shearing: the animal answers
      const n = TASK[d.kind]; if (n) sfx(n, far);
    } else if (d.type === 'income') { if (d.source === 'market') sfx('coin'); else if (d.gold) sfx('coin', 0.7); }
    else if (d.type === 'purchase' && d.who === 'player') sfx('buy');
    else if (d.type === 'surprise') sfx(d.kind === 'giant' ? 'giant' : 'surprise');
  });
  // UI taps: any button or clickable icon outside the canvas
  addEventListener('click', e => { const b = e.target && e.target.closest && e.target.closest('button,.pbtn,[data-buy],.slot'); if (b) sfx(b.disabled ? 'deny' : 'tap', 0.8); }, true);

  // ---------- volumes, unlock, visibility ----------
  function applyVolumes() {
    if (!A.ctx) return; const t = t0();
    A.music.gain.setTargetAtTime(set.music ? set.mv * 1.4 : 0, t, 0.4);
    A.sfx.gain.setTargetAtTime(set.sfx ? set.sv : 0, t, 0.05);
    if (set.music) musicOn(); else setTimeout(() => { if (!set.music) musicOff(); }, 1500);
  }
  function unlock() {
    if (!build()) return;
    const go = () => { A.unlocked = A.ctx.state === 'running'; if (A.unlocked) { applyVolumes(); ambience(); ['pointerdown', 'keydown', 'touchend'].forEach(ev => removeEventListener(ev, unlock, true)); } };
    if (A.ctx.state !== 'running') A.ctx.resume().then(go, () => {}); else go();
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(ev => addEventListener(ev, unlock, true));
  document.addEventListener('visibilitychange', () => { if (!A.ctx || !A.unlocked) return; if (document.hidden) A.ctx.suspend(); else A.ctx.resume(); });

  // ---------- toggle icons (16x16 pixel art, shown at 2x like the other HUD icons) ----------
  const PAL = window.PF_PALETTE && window.PF_PALETTE.ramps, ink = PAL ? PAL.ink[0] : '#1c1626';
  function pix(rows, cols, off) {
    const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d');
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (cols[ch]) { g.fillStyle = off ? '#8a7a66' : cols[ch]; g.fillRect(x, y, 1, 1); } }));
    if (off) { g.fillStyle = ink; for (let i = 1; i < 15; i++) g.fillRect(i, i, 2, 1); g.fillStyle = '#d9583f'; for (let i = 1; i < 15; i++) g.fillRect(i, i - 1, 2, 1); }
    return c.toDataURL();
  }
  const NOTE = ['', '      kkkkkkk', '      kyyyyyk', '      kykkkyk', '      kyk  kyk', '      kyk  kyk', '      kyk  kyk', '      kyk  kyk', '   kkkkyk kkkyk', '  kyyyyyk kyyyyk', '  kyyyyyk kyyyyk', '  kyyyyk  kyyyk', '   kkkk    kkk'].map(r => r.padEnd(16));
  const SPK = ['', '', '      kk', '     kwk    k', '    kwwk  k  k', ' kkkwwwk   k  k', ' kwwwwwk k  k k', ' kwwwwwk k  k k', ' kwwwwwk k  k k', ' kkkwwwk   k  k', '    kwwk  k  k', '     kwk    k', '      kk'].map(r => r.padEnd(16));
  const IC = { music: [pix(NOTE, { k: ink, y: '#ffd76a' }), pix(NOTE, { k: ink, y: '#ffd76a' }, true)], sfx: [pix(SPK, { k: ink, w: '#fff6dc' }), pix(SPK, { k: ink, w: '#fff6dc' }, true)] };
  function hud() {
    const wrap = document.getElementById('wrap'); if (!wrap || document.getElementById('audioBar')) return;
    const st = document.createElement('style');
    st.textContent = '#audioBar{position:absolute;right:12px;bottom:52px;display:flex;gap:4px;z-index:2}' +
      '#audioBar button{width:34px;height:30px;padding:0;background-color:#e8c78a;background-repeat:no-repeat;background-position:center;background-size:24px 24px;image-rendering:pixelated}' +
      '#audioBar button.off{background-color:#b8a07a}';
    document.head.appendChild(st);
    const bar = document.createElement('div'); bar.id = 'audioBar';
    bar.innerHTML = '<button class="pbtn" id="musicBtn" title="音乐" aria-label="音乐"></button><button class="pbtn" id="sfxBtn" title="音效" aria-label="音效"></button>';
    wrap.appendChild(bar);
    const paint = () => { for (const k of ['music', 'sfx']) { const b = document.getElementById(k + 'Btn'); b.style.backgroundImage = `url(${IC[k][set[k] ? 0 : 1]})`; b.classList.toggle('off', !set[k]); b.setAttribute('aria-pressed', String(!!set[k])); } };
    bar.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const k = b.id === 'musicBtn' ? 'music' : 'sfx'; set[k] = !set[k]; persist(); paint(); unlock(); applyVolumes(); });
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hud); else hud();

  window.PFAudio = {
    KEY, settings: () => Object.assign({}, set), state: () => ({ ctx: A.ctx ? A.ctx.state : 'none', unlocked: A.unlocked, music: set.music, sfx: set.sfx, generating: G.on, song: G.song && { bpm: G.song.bpm, key: G.song.key, bars: G.song.bars }, plays: A.plays, lastSfx: A.lastSfx, tracks: A.tracks.length }),
    setMusic: on => { set.music = !!on; persist(); hud(); const b = document.getElementById('musicBtn'); if (b) b.style.backgroundImage = `url(${IC.music[set.music ? 0 : 1]})`, b.classList.toggle('off', !set.music); applyVolumes(); },
    setSfx: on => { set.sfx = !!on; persist(); const b = document.getElementById('sfxBtn'); if (b) b.style.backgroundImage = `url(${IC.sfx[set.sfx ? 0 : 1]})`, b.classList.toggle('off', !set.sfx); applyVolumes(); },
    setVolume: (mv, sv) => { if (mv != null) set.mv = Math.max(0, Math.min(1, mv)); if (sv != null) set.sv = Math.max(0, Math.min(1, sv)); persist(); applyVolumes(); },
    setTracks: list => { A.tracks = (list || []).slice(); if (A.ctx && set.music) { stopFiles(); if (P.el) P.el.removeAttribute('src'); musicOn(); } },
    play: sfx, unlock, _out: () => A.ctx && { ctx: A.ctx, node: A.master }, // tests / recording a preview
 names: () => Object.keys(Z).concat(Object.keys(JINGLE)),
  };
})();
