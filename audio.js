// 像素农场 · 声音：程序生成的 Lo-Fi 背景音乐 + 程序生成的音效 + 昼夜环境声（鸟叫 / 虫鸣）。
// The generator and all SFX are synthesized with WebAudio at run time (0 bytes, works offline, nothing to license). SFX use ZzFX's sample builder
// (MIT, (c) 2019 Frank Force, https://github.com/KilledByAPixel/ZzFX; see CREDITS.md).
// v5.2: four recorded tracks (assets/audio/, ElevenLabs Eleven Music, see CREDITS.md) play by time of day with crossfades;
// the generator is the fallback when a file cannot load. Override with window.PF_MUSIC_TRACKS (before this file loads) or
// PFAudio.setTracks({ morning, afternoon, evening, night } | [urls]); setTracks([]) means generator only.
// Browsers only allow sound after a user gesture, so nothing starts until the first tap / click / key.
// Settings live in their own localStorage key (a per-device preference, not part of the farm save).
'use strict';
(() => {
  const KEY = 'mouzhi/pixel-farm:audio';
  const DEF = Object.assign({ music: true, sfx: true, mv: 0.45, sv: 0.7 }, window.PF_AUDIO_DEFAULTS || {});
  const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const load = () => { try { return Object.assign({}, DEF, JSON.parse((store && store.getItem(KEY)) || '{}')); } catch (e) { return Object.assign({}, DEF); } };
  const set = load();
  const persist = () => { try { store && store.setItem(KEY, JSON.stringify(set)); } catch (e) {} };
  const AC = window.AudioContext || window.webkitAudioContext;
  const A = { ctx: null, filePlays: 0, // tracks: null = use DEFAULT_TRACKS (set below)
    unlocked: false, tracks: window.PF_MUSIC_TRACKS !== undefined ? window.PF_MUSIC_TRACKS : null, plays: 0, lastSfx: '' };
  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- graph ----------
  function build() {
    if (A.ctx || !AC) return !!A.ctx;
    let c; try { c = new AC(); } catch (e) { return false; }
    A.ctx = c;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.connect(c.destination);
    A.master = c.createGain(); A.master.gain.value = 1.4; A.master.connect(comp);
    A.music = c.createGain(); A.music.gain.value = 0; A.music.connect(A.master); // faded in by applyVolumes(); files + generator
    A.genBus = c.createGain(); A.genBus.gain.value = 1; // the generator alone (faded out while a recorded track plays)
    A.tone = c.createBiquadFilter(); A.tone.type = 'lowpass'; A.tone.frequency.value = 2600; A.tone.Q.value = 0.4; // the "warm, slightly muffled" lo-fi tone
    A.genBus.connect(A.tone); A.tone.connect(A.music);
    A.sfx = c.createGain(); A.sfx.gain.value = 0; A.sfx.connect(A.master);
    A.amb = c.createGain(); A.amb.gain.value = 0.5; A.amb.connect(A.sfx);
    // tape wow: one slow LFO bends the pitch of every key note by a few cents
    A.wow = c.createOscillator(); A.wow.frequency.value = 0.33; A.wowAmt = c.createGain(); A.wowAmt.gain.value = 9; A.wow.connect(A.wowAmt); A.wow.start();
    // Rhodes-like tremolo on the keys bus
    A.keys = c.createGain(); A.keys.gain.value = 0.8; const trem = c.createOscillator(), tg = c.createGain(); trem.frequency.value = 4.2; tg.gain.value = 0.12; trem.connect(tg); tg.connect(A.keys.gain); trem.start();
    A.keys.connect(A.genBus);
    A.drums = c.createGain(); A.drums.gain.value = 0.55; A.drums.connect(A.genBus);
    // a short echo for the melody
    A.dly = c.createDelay(1); A.dly.delayTime.value = 0.42; const fb = c.createGain(); fb.gain.value = 0.28; const dl = c.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 1800;
    A.dly.connect(dl); dl.connect(fb); fb.connect(A.dly); dl.connect(A.genBus);
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
    o.type = 'triangle'; o.frequency.value = mtof(m); o.connect(lp); lp.connect(g); g.connect(A.genBus);
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
    o.connect(lp); lp.connect(g); g.connect(A.genBus); g.connect(A.dly);
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
    if (!G.crackle) { const s = A.ctx.createBufferSource(), hp = A.ctx.createBiquadFilter(), g = A.ctx.createGain(); s.buffer = crackleBuf(); s.loop = true; hp.type = 'highpass'; hp.frequency.value = 900; g.gain.value = 0.35; s.connect(hp); hp.connect(g); g.connect(A.genBus); s.start(); G.crackle = s; }
    G.timer = setInterval(tick, 60); tick();
  }
  function stopGen() { G.on = false; clearInterval(G.timer); if (G.crackle) { try { G.crackle.stop(); } catch (e) {} G.crackle = null; } }

  // ---------- recorded tracks: one per time of day, crossfaded ----------
  // PF_MUSIC_TRACKS may be an object { morning, afternoon, evening, night } (each a url or a list of urls) or a plain list
  // (played at any hour). Files load lazily (only the one playing), loop with a crossfade, and switch with a crossfade when
  // the farm clock moves into the next part of the day. If a file fails to load, the generator above takes over.
  // Only <audio> with packaged files is used (no fetch / blob:), which is what the Xiaohongshu container allows.
  const DEFAULT_TRACKS = { morning: 'audio/morning.mp3', afternoon: 'assets/audio/afternoon.mp3', evening: 'assets/audio/evening.mp3', night: 'assets/audio/night.mp3' };
  if (A.tracks === null) A.tracks = DEFAULT_TRACKS;
  const XF = 4, FILE_GAIN = 0.2; // seconds of crossfade; files are mastered near -16 LUFS, the generator sits much lower
  const D = { decks: [], cur: -1, slot: null, failed: {}, timer: 0, on: false, plays: 0 };
  function slotNow() {
    const g = window.__farm, S = g && g.S, T = S ? S.t % 1440 : (new Date().getHours() * 60 + new Date().getMinutes());
    return T >= 330 && T < 660 ? 'morning' : T >= 660 && T < 1020 ? 'afternoon' : T >= 1020 && T < 1200 ? 'evening' : 'night';
  }
  function listFor(slot) {
    const t = A.tracks; if (!t) return [];
    const raw = Array.isArray(t) ? t : [].concat(t[slot] || [], t[slot] ? [] : Object.keys(t).reduce((a, k) => a.concat(t[k]), [])); // a missing slot borrows the others
    return raw.filter(u => u && !D.failed[u]);
  }
  const E = { bufs: {}, src: null, g: null, slot: null, plays: 0, failed: {}, dec: {} };
  function audioData() { return window.PF_AUDIO_DATA || null; }
  function dataFor(slot) { const T = audioData() && audioData().tracks; return (T && T[slot] && !E.failed[slot]) ? T[slot] : null; }
  const hasDataTracks = () => { const T = audioData() && audioData().tracks; return !!(T && (T.morning || T.afternoon || T.evening || T.night)); };
  const hasTracks = () => ['morning', 'afternoon', 'evening', 'night'].some(k => listFor(k).length) || hasDataTracks();
  const NEXT_SLOT = { morning: 'afternoon', afternoon: 'evening', evening: 'night', night: 'morning' };
  const SLOT_START = { morning: 330, afternoon: 660, evening: 1020, night: 1200 };
  const NEAR_MIN = 90; // ~30s of real time at 1x; at 4x still enough to decode the next track
  function lazyMap() { return window.PF_AUDIO_LAZY || null; }
  function lazySrc(slot) { const m = lazyMap(); return (m && m[slot]) || ''; }
  const dataLoad = {}, dataLoadQ = {};
  function loadDataScript(key, src, cb) {
    if (!src) { if (cb) cb(false); return; }
    if (dataLoad[key] === 'ok') { if (cb) cb(true); return; }
    if (dataLoad[key] === 'fail') { if (cb) cb(false); return; }
    if (dataLoad[key] === 'loading') { (dataLoadQ[key] = dataLoadQ[key] || []).push(cb); return; }
    dataLoad[key] = 'loading';
    dataLoadQ[key] = cb ? [cb] : [];
    const s = document.createElement('script');
    s.src = src;
    s.onload = function () {
      dataLoad[key] = 'ok';
      const q = dataLoadQ[key] || []; dataLoadQ[key] = null;
      for (let i = 0; i < q.length; i++) if (q[i]) q[i](true);
      if (A.ctx && (set.music || set.sfx)) preloadData();
      if (D.on) monitor();
    };
    s.onerror = function () {
      dataLoad[key] = 'fail';
      if (key === 'afternoon' || key === 'evening' || key === 'night') E.failed[key] = true;
      const q = dataLoadQ[key] || []; dataLoadQ[key] = null;
      for (let i = 0; i < q.length; i++) if (q[i]) q[i](false);
      if (D.on) monitor();
    };
    document.head.appendChild(s);
  }
  function gameMinute() {
    const g = window.__farm, S = g && g.S;
    return S ? ((S.t % 1440) + 1440) % 1440 : (new Date().getHours() * 60 + new Date().getMinutes());
  }
  function minutesUntil(slot) {
    const start = SLOT_START[slot]; if (start == null) return 9999;
    if (slotNow() === slot) return 0;
    return (start - gameMinute() + 1440) % 1440;
  }
  function prefetchAudio() {
    const cur = slotNow(), nxt = NEXT_SLOT[cur];
    if (set.music && lazySrc(cur) && !dataFor(cur) && dataLoad[cur] !== 'fail') loadDataScript(cur, lazySrc(cur));
    if (set.music && (minutesUntil(nxt) <= NEAR_MIN) && lazySrc(nxt) && !dataFor(nxt) && dataLoad[nxt] !== 'fail') loadDataScript(nxt, lazySrc(nxt));
    const more = lazyMap() && lazyMap().sfxMore;
    if (more && set.sfx && dataLoad.sfxMore !== 'ok' && dataLoad.sfxMore !== 'fail') loadDataScript('sfxMore', more);
  }
  function coreSrc() {
    const m = lazyMap();
    return (m && (m.morning || m.core)) || '';
  }
  function ensureCoreData(cb) {
    if (audioData() && (audioData().tracks || audioData().sfx)) { if (cb) cb(true); return; }
    const src = coreSrc();
    if (!src) { if (cb) cb(!!audioData()); return; }
    loadDataScript('morning', src, cb);
  }
  function warmWhenIdle() {
    if (audioData()) return;
    const go = function () { if (!audioData()) ensureCoreData(); };
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 2500 });
    else setTimeout(go, 2000);
  }
  function dataReady(kind, cb) {
    const after = function (ok) {
      if (kind === 'music') {
        const cur = slotNow();
        if (set.music && lazySrc(cur) && !dataFor(cur) && cur !== 'morning') {
          loadDataScript(cur, lazySrc(cur), function () {
            if (A.ctx) preloadData();
            if (cb) cb(ok);
          });
          return;
        }
      }
      if (A.ctx && (set.music || set.sfx)) preloadData();
      if (cb) cb(ok);
    };
    ensureCoreData(after);
  }
  function lazyPending(slot) {
    if (dataFor(slot) || !lazySrc(slot) || dataLoad[slot] === 'fail') return false;
    return true;
  }
  function startPrefetchClock() {
    if (A.prefetchTimer) return;
    A.prefetchTimer = setInterval(prefetchAudio, 1000);
    prefetchAudio();
  }

  function b64ToAB(b64) {
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  function decodeB64(b64, ok, fail) {
    if (!A.ctx || !b64) { if (fail) fail(); return; }
    try { A.ctx.decodeAudioData(b64ToAB(b64), ok, fail || function () {}); } catch (e) { if (fail) fail(); }
  }
  function decodeTrack(slot, cb) {
    if (E.bufs[slot]) { cb(E.bufs[slot]); return; }
    const b64 = dataFor(slot); if (!b64) { cb(null); return; }
    if (E.dec[slot]) { E.dec[slot].push(cb); return; }
    E.dec[slot] = [cb];
    decodeB64(b64, function (buf) {
      E.bufs[slot] = buf;
      const q = E.dec[slot] || []; E.dec[slot] = null;
      for (let i = 0; i < q.length; i++) q[i](buf);
    }, function () {
      E.failed[slot] = true;
      const q = E.dec[slot] || []; E.dec[slot] = null;
      for (let i = 0; i < q.length; i++) q[i](null);
    });
  }
  function stopEmb(fade) {
    const g = E.g, s = E.src;
    E.src = null; E.g = null; E.slot = null;
    if (!g) return;
    const t = t0();
    try {
      if (fade) {
        g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + XF);
        if (s) setTimeout(function () { try { s.stop(); } catch (e) {} }, XF * 1000 + 200);
      } else if (s) { try { s.stop(); } catch (e) {} }
    } catch (e) {}
  }
  function startEmb(slot) {
    if (!dataFor(slot) || (E.slot === slot && E.src) || E.starting === slot) return;
    E.starting = slot;
    decodeTrack(slot, function (buf) {
      if (E.starting === slot) E.starting = null;
      if (!buf || !D.on || !set.music) return;
      if (slotNow() !== slot) return;
      stopEmb(!!E.src);
      const g = A.ctx.createGain();
      g.gain.value = 0;
      const src = A.ctx.createBufferSource();
      src.buffer = buf; src.loop = true; src.connect(g); g.connect(A.music);
      const t = t0();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(FILE_GAIN, t + XF);
      try { src.start(); } catch (e) { return; }
      E.src = src; E.g = g; E.slot = slot; E.plays++;
    });
  }
  function embAudible() { return !!(E.src && E.slot && !E.failed[E.slot]); }

  function deck(i) {
    if (D.decks[i]) return D.decks[i];
    const el = new Audio(), g = A.ctx.createGain(), d = { el, g, url: null, routed: false, v: 0, vt: 0 };
    el.preload = 'auto'; g.gain.value = 0;
    try { A.ctx.createMediaElementSource(el).connect(g); g.connect(A.music); d.routed = true; } catch (e) {}
    el.addEventListener('error', () => { if (d.url) { D.failed[d.url] = true; d.url = null; } });
    return (D.decks[i] = d);
  }
  function fadeTo(d, to, sec) {
    d.vt = to;
    if (d.routed) { const t = t0(), p = d.g.gain; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(to * FILE_GAIN, t + sec); }
  }
  // Ask for a track: it loads on the idle deck (lazily, only now) while whatever is playing keeps playing (the generator at
  // launch, or the previous track); once it can play through, monitor() crossfades to it.
  function request(url) {
    const ni = D.cur === 0 ? 1 : 0, d = deck(ni);
    if (d.url !== url) { d.url = url; d.el.src = url; d.el.load(); }
    D.pending = d; D.pendingAt = performance.now();
  }
  function swapIn(d) {
    const old = D.decks[D.cur];
    try { d.el.currentTime = 0; } catch (e) {}
    const pr = d.el.play(); if (pr && pr.catch) pr.catch(e => { if (e && e.name !== 'NotAllowedError' && e.name !== 'AbortError' && d.url) D.failed[d.url] = true; });
    fadeTo(d, 1, XF);
    if (old && old !== d) { fadeTo(old, 0, XF); const el = old.el; setTimeout(() => { if (D.decks[D.cur] !== old) el.pause(); }, XF * 1000 + 200); }
    D.cur = D.decks.indexOf(d); D.pending = null; D.plays++;
  }
  const audible = () => { const d = D.decks[D.cur]; return !!(d && d.url && !D.failed[d.url] && !d.el.paused && !d.el.ended); };
  function genLevel(on) { // the generator covers any moment without a playable file (launch, loading, a failed file)
    if (on) { if (!G.on && set.music) startGen(); if (G.on) A.genBus.gain.setTargetAtTime(1, t0(), 0.8); clearTimeout(D.genOff); D.genOff = 0; }
    else if (G.on && !D.genOff) { A.genBus.gain.setTargetAtTime(0, t0(), XF / 3); D.genOff = setTimeout(() => { D.genOff = 0; if (audible() || embAudible()) stopGen(); }, XF * 1000 + 300); }
  }
  function monitor() {
    if (!D.on) return;
    prefetchAudio();
    const slot = slotNow();
    if (dataFor(slot) || (E.slot === slot && E.src)) {
      if (!E.src || E.slot !== slot) startEmb(slot);
      genLevel(!embAudible());
      return;
    }
    if (lazyPending(slot)) {
      if (E.src) stopEmb(true);
      genLevel(true);
      return;
    }
    if (E.src) stopEmb(true);
    const list = listFor(slot), d = D.decks[D.cur], p = D.pending;
    if (p && (!p.url || D.failed[p.url])) D.pending = null; // that file failed: try another (or stay on the generator)
    if (D.pending && p.el.readyState >= 3) swapIn(p);
    else if (!D.pending) {
      const playing = d && d.url && !D.failed[d.url] ? d.url : null;
      if (slot !== D.slot || !playing) { if (list.length) { D.slot = slot; request(list.length > 1 && playing ? pick(list.filter(x => x !== playing)) || list[0] : pick(list)); } }
      else if (d.el.duration && isFinite(d.el.duration) && d.el.currentTime > d.el.duration - XF - 0.25) { const n = list.length > 1 ? pick(list.filter(x => x !== playing)) : playing; request(n); } // same file: the idle deck usually still holds it, so the swap is instant
    }
    genLevel(!audible());
    for (const q of D.decks) if (q && !q.routed) { q.v += Math.max(-0.07, Math.min(0.07, q.vt - q.v)); q.el.volume = Math.max(0, Math.min(1, q.v * (set.music ? set.mv * 1.4 : 0) * FILE_GAIN * 2)); }
  }
  function startFiles() { if (D.on) return; D.on = true; D.slot = null; clearInterval(D.timer); D.timer = setInterval(monitor, 250); monitor(); }
  function stopFiles() { D.on = false; D.pending = null; clearInterval(D.timer); stopEmb(false); for (const q of D.decks) if (q) { q.el.pause(); fadeTo(q, 0, 0.05); } D.cur = -1; }
  function musicOn() { if (!A.ctx) return; startFiles(); if (!audible() && !embAudible()) genLevel(true); }
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
      if (repeatTime && !(++repeat % repeatTime)) { frequency = startFrequency; slide = startSlide; jump = jump || 1; }
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
      const n = 3 + (Math.random() * 4 | 0); for (let i = 0; i < n; i++) { const s = t + i * 0.045; g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.015, s + 0.008); g.gain.linearRampToValueAtTime(0, s + 0.03); } o.start(t); o.stop(t + n * 0.045 + 0.05); },
  };
  // ---- recorded SFX (ElevenLabs, see CREDITS.md) with the ZzFX / procedural sounds above as the fallback ----
  // First-screen sounds sit in sfx/ (main package); the rest in assets/audio/sfx/ load the first time they are asked for
  // (that first time plays the synthesized fallback). Played through <audio> elements only (the mini tool container
  // allows packaged media files but no fetch / blob:), two elements per file so a sound can overlap itself.
  const CORE = 'sfx/', MORE = 'assets/audio/sfx/';
  const FILES = {
    tap: [CORE + 'tap.mp3'], till: [CORE + 'hoe1.mp3', CORE + 'hoe2.mp3'], water: [CORE + 'water1.mp3', CORE + 'water2.mp3'],
    harvest: [CORE + 'harvest1.mp3', CORE + 'harvest2.mp3'], coin: [CORE + 'coin.mp3'],
    plant: [MORE + 'plant.mp3'], refill: [MORE + 'refill.mp3'], pick: [MORE + 'pick.mp3'], chop: [MORE + 'chop1.mp3', MORE + 'chop2.mp3'],
    hay: [MORE + 'hay.mp3'], cast: [MORE + 'cast.mp3'], fish: [MORE + 'splash.mp3'], buy: [MORE + 'buy.mp3'], unlock: [MORE + 'unlock.mp3'],
    surprise: [MORE + 'sparkle.mp3'], giant: [MORE + 'sparkle.mp3'], clear: [MORE + 'clear.mp3'],
    chicken: [MORE + 'chicken.mp3'], sheep: [MORE + 'sheep.mp3'], cow: [MORE + 'cow.mp3'], pig: [MORE + 'pig.mp3'], cat: [MORE + 'cat.mp3'], dog: [MORE + 'dog.mp3'],
    bird: [MORE + 'bird1.mp3', MORE + 'bird2.mp3'],
  };
  const CORE_NAMES = ['tap', 'till', 'water', 'harvest', 'coin'];
  const RATE = { giant: 0.85 }; // a deeper sparkle for the giant crop
  const POOL = {}, fileBad = {};
  function pool(url) {
    if (POOL[url]) return POOL[url];
    const p = POOL[url] = { els: [], i: 0 };
    for (let k = 0; k < 2; k++) {
      const el = new Audio(); el.preload = 'auto'; el.src = url; el.preservesPitch = el.mozPreservesPitch = el.webkitPreservesPitch = false;
      const e = { el, g: null };
      try { e.g = A.ctx.createGain(); A.ctx.createMediaElementSource(el).connect(e.g); e.g.connect(A.sfx); } catch (err) { e.g = null; }
      el.addEventListener('error', () => { fileBad[url] = true; });
      p.els.push(e);
    }
    return p;
  }
  const preload = names => names.forEach(n => (FILES[n] || []).forEach(pool));
  const lastUrl = {};
  const dataBufs = {};
  function dataSfxKeys(name) {
    const pack = audioData() && audioData().sfx; if (!pack) return [];
    const fromFiles = (FILES[name] || []).map(u => u.replace(/^.*\//, '').replace(/\.mp3$/i, ''));
    const keys = fromFiles.filter(k => pack[k] && !fileBad['data:' + k]);
    if (!keys.length && pack[name] && !fileBad['data:' + name]) keys.push(name);
    return keys;
  }
  function preloadData() {
    const pack = audioData(); if (!pack || !A.ctx) return;
    if (set.sfx && pack.sfx) Object.keys(pack.sfx).forEach(k => {
      if (dataBufs[k]) return;
      decodeB64(pack.sfx[k], buf => { dataBufs[k] = buf; }, () => { fileBad['data:' + k] = true; });
    });
    if (set.music) { const slot = slotNow(); if (dataFor(slot)) decodeTrack(slot, () => {}); }
  }
  function playDataSfx(name, vol) {
    const keys = dataSfxKeys(name); if (!keys.length) return false;
    const opts = keys.length > 1 ? keys.filter(k => k !== lastUrl[name]) : keys, key = pick(opts);
    const buf = dataBufs[key]; if (!buf) return false;
    lastUrl[name] = key;
    const s = A.ctx.createBufferSource(), g = A.ctx.createGain();
    s.buffer = buf; s.playbackRate.value = (RATE[name] || 1) * rnd(0.95, 1.05);
    g.gain.value = Math.max(0, Math.min(1, vol * rnd(0.85, 1)));
    s.connect(g); g.connect(A.sfx);
    try { s.start(); } catch (e) { return false; }
    return true;
  }
  function playFile(name, vol) {
    const list = (FILES[name] || []).filter(u => !fileBad[u]); if (!list.length) return false;
    const opts = list.length > 1 ? list.filter(u => u !== lastUrl[name]) : list, url = pick(opts); // never the same variant twice in a row
    const p = pool(url), e = p.els[p.i = (p.i + 1) % p.els.length];
    if (e.el.readyState < 2) return false; // still loading: the caller plays the synthesized sound this once
    lastUrl[name] = url;
    try { e.el.currentTime = 0; } catch (err) {}
    e.el.playbackRate = (RATE[name] || 1) * rnd(0.95, 1.05);
    const v = Math.max(0, Math.min(1, vol * rnd(0.85, 1)));
    if (e.g) e.g.gain.value = v; else e.el.volume = Math.max(0, Math.min(1, v * set.sv));
    const pr = e.el.play(); if (pr && pr.catch) pr.catch(() => {});
    return true;
  }
  const bufs = {}, last = {}, recent = [];
  const GAP = { tap: 40, chicken: 1500, sheep: 2500, cow: 2500, pig: 2000, cat: 2500, dog: 4000, bird: 3000, surprise: 600, giant: 600 };
  const PRIORITY = { buy: 1, unlock: 1, surprise: 1, giant: 1, tap: 1, deny: 1 }; // the player's own actions always sound
  function sfx(name, vol = 1) {
    if (!set.sfx || !A.ctx || A.ctx.state !== 'running' || document.hidden) return false;
    const now = performance.now();
    if (now - (last[name] || 0) < (GAP[name] || 260)) return false;
    while (recent.length && now - recent[0] > 2000) recent.shift();
    if (!PRIORITY[name] && (recent.length >= 4 || (recent.length && now - recent[recent.length - 1] < 120))) return false; // density cap: <= 4 sounds / 2 s
    last[name] = now; if (name !== 'tap') recent.push(now);
    A.plays++; A.lastSfx = name;
    if (!(audioData() && audioData().sfx) && FILES[name] && playFile(name, vol)) { A.filePlays++; return true; }
    if (playDataSfx(name, vol)) { A.filePlays++; return true; }
    const more = lazyMap() && lazyMap().sfxMore;
    if (more && CORE_NAMES.indexOf(name) < 0 && dataLoad.sfxMore !== 'ok' && dataLoad.sfxMore !== 'fail') loadDataScript('sfxMore', more);
    const t = t0() + 0.01, alias = { bird: 'chirp', unlock: 'buy', cast: 'fish' }[name] || name;
    if (JINGLE[alias]) { JINGLE[alias](t); return true; }
    const p = Z[alias]; if (!p) return false;
    let b = bufs[alias]; if (!b) { const d = zzfxBuild(A.ctx.sampleRate, ...p); b = bufs[alias] = A.ctx.createBuffer(1, d.length || 1, A.ctx.sampleRate); b.getChannelData(0).set(d); }
    const s = A.ctx.createBufferSource(), g = A.ctx.createGain(); s.buffer = b; s.playbackRate.value = rnd(0.94, 1.06); g.gain.value = 0.5 * vol; s.connect(g); g.connect(A.sfx); s.start(t);
    return true;
  }
  const later = (ms, name, vol) => setTimeout(() => sfx(name, vol), ms);
  // ambience: an occasional bird by day, soft crickets at night (part of the SFX switch)
  let ambT = 0;
  function ambience() { clearTimeout(ambT); ambT = setTimeout(ambience, night() ? rnd(1500, 4000) : rnd(15000, 40000));
    if (!set.sfx || !A.ctx || A.ctx.state !== 'running' || document.hidden || !window.__farm) return;
    if (night()) JINGLE.cricket(t0() + 0.02); else sfx('bird', 0.6); }
  // animals call on their own only rarely (mean minutes between calls); the dog never does
  const IDLE = { chicken: 4, pig: 7, sheep: 9, cow: 10, cat: 6 };
  let idleT = 0;
  function idleCalls() { clearTimeout(idleT); idleT = setTimeout(idleCalls, 20000);
    const g = window.__farm, S = g && g.S; if (!S || night() || !set.sfx || document.hidden) return;
    const have = {}; (S.animals || []).forEach(a => { have[a.kind] = 1; }); (g.PETS_LIVE || []).forEach(p => { have[p.kind] = 1; });
    for (const k of Object.keys(IDLE)) if (have[k] && Math.random() < 20 / (IDLE[k] * 60)) { sfx(k, 0.45); break; }
  }

  // ---------- game events ----------
  const TASK = { till: 'till', clear: 'clear', weed: 'clear', tidy: 'clear', plant: 'plant', transplant: 'plant', water: 'water', trough: 'water', refill: 'refill',
    harvest: 'harvest', pick: 'pick', chop: 'chop', feed: 'hay', hay: 'hay', fish: 'fish' };
  const UNLOCKS = /^(forest|east|orchard|south|coast|north|pasture|coop|fold|shed|sty|house)/;
  addEventListener('pf:farm', e => {
    const d = e.detail || {}, far = d.who && d.who !== 'farmer' ? 0.55 : 1; // family members' work sits further back
    if (d.type === 'task') {
      if (d.kind === 'pet' || d.kind === 'petpet') return d.an ? sfx(d.an, d.an === 'dog' ? 0.5 : 0.8 * far) : undefined; // petting: the animal answers
      if (d.kind === 'collect') { const k = d.an || 'chicken'; return Math.random() < 0.3 ? sfx(k, 0.7 * far) : sfx('pick', 0.6 * far); } // eggs, milk, wool, truffles
      const n = TASK[d.kind]; if (n) sfx(n, far);
      if (d.kind === 'feed' && d.an && Math.random() < 0.4) later(700, d.an, 0.6 * far); // fed animals sometimes say thanks
    } else if (d.type === 'task-start' && d.kind === 'fish') sfx('cast', 0.8 * far);
    else if (d.type === 'income') { if (d.source === 'market') sfx('coin'); else if (d.gold) sfx('coin', 0.7); }
    else if (d.type === 'purchase' && d.who === 'player') sfx(UNLOCKS.test(String(d.item)) ? 'unlock' : 'buy');
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
    prefetchAudio();
  }
  function unlock() {
    if (!build()) return;
    const go = () => { A.unlocked = A.ctx.state === 'running'; if (A.unlocked) { applyVolumes(); ambience(); idleCalls(); if (set.sfx && !(audioData() && audioData().sfx)) preload(CORE_NAMES); if (set.music || set.sfx) { preloadData(); startPrefetchClock(); } ['pointerdown', 'keydown', 'touchend'].forEach(ev => removeEventListener(ev, unlock, true)); } };
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
  function paintXhsToggles() {
    const m = document.getElementById('xhs-btn-music'), s = document.getElementById('xhs-btn-sfx');
    if (m) { m.classList.toggle('off', !set.music); m.setAttribute('aria-pressed', String(!!set.music)); }
    if (s) { s.classList.toggle('off', !set.sfx); s.setAttribute('aria-pressed', String(!!set.sfx)); }
  }
  function hud() {
    paintXhsToggles();
    if (set.music || set.sfx) startPrefetchClock();
    if (window.PF_AUDIO_NO_HUD || document.documentElement.classList.contains('xhs-mobile')) return;
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
    KEY, settings: () => Object.assign({}, set), state: () => ({ ctx: A.ctx ? A.ctx.state : 'none', unlocked: A.unlocked, music: set.music, sfx: set.sfx, generating: G.on, song: G.song && { bpm: G.song.bpm, key: G.song.key, bars: G.song.bars }, plays: A.plays, filePlays: A.filePlays, lastSfx: A.lastSfx, sfxBad: Object.keys(fileBad), mode: (embAudible() ? 'files' : (D.on && audible() ? 'files' : G.on ? 'gen' : 'off')), slot: D.on ? (E.slot || D.slot) : null, track: E.slot ? ('embedded:' + E.slot) : (D.on && D.decks[D.cur] ? D.decks[D.cur].url : null), trackPlays: D.plays + E.plays, failed: Object.keys(D.failed).concat(Object.keys(E.failed)), embedded: !!(audioData()), lazy: Object.assign({}, dataLoad), dataTracks: audioData() && audioData().tracks ? Object.keys(audioData().tracks) : [] }),
    setMusic: on => { set.music = !!on; persist(); if (on) { startPrefetchClock(); dataReady('music', function () { applyVolumes(); }); } hud(); const b = document.getElementById('musicBtn'); if (b) b.style.backgroundImage = `url(${IC.music[set.music ? 0 : 1]})`, b.classList.toggle('off', !set.music); paintXhsToggles(); applyVolumes(); },
    setSfx: on => { set.sfx = !!on; persist(); if (on) { startPrefetchClock(); dataReady('sfx', function () { applyVolumes(); }); } const b = document.getElementById('sfxBtn'); if (b) b.style.backgroundImage = `url(${IC.sfx[set.sfx ? 0 : 1]})`, b.classList.toggle('off', !set.sfx); paintXhsToggles(); applyVolumes(); },
    setVolume: (mv, sv) => { if (mv != null) set.mv = Math.max(0, Math.min(1, mv)); if (sv != null) set.sv = Math.max(0, Math.min(1, sv)); persist(); applyVolumes(); },
    whenReady: dataReady, warmWhenIdle: warmWhenIdle, ensureCoreData: ensureCoreData,
    setTracks: t => { A.tracks = t || []; D.failed = {}; if (A.ctx && set.music) { stopFiles(); musicOn(); } },
    _seekEnd: () => { const d = D.decks[D.cur]; if (d && d.el.duration) d.el.currentTime = d.el.duration - XF - 1; }, // tests
    play: sfx, unlock, _out: () => A.ctx && { ctx: A.ctx, node: A.master }, // tests / recording a preview
 names: () => Object.keys(Z).concat(Object.keys(JINGLE)), fileNames: () => Object.keys(FILES), preload: () => preload(Object.keys(FILES)), _gapReset: () => { for (const k of Object.keys(last)) last[k] = 0; recent.length = 0; },
  };
})();
