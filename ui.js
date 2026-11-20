// 像素农场 · 界面：背包栏、商店、小地图开关、砍树种树工具条、存档菜单、离线收益小结（HTML 叠在画布上，不进画布，不影响逐像素稳定）
'use strict';
(() => {
  const G = window.__farm, SIM = window.PFSim, SAVE = window.PFSave;
  if (!G || !G.SAVE) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // ---- pixel icons: a watering can and a basket, drawn from the palette (16x16, shown at 2x like the crops) ----
  const P = window.PF_PALETTE && window.PF_PALETTE.ramps;
  function pixIcon(rows, cols) {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16; const g = c.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (cols[ch]) { g.fillStyle = cols[ch]; g.fillRect(x, y, 1, 1); } }));
    return c.toDataURL();
  }
  const ink = P ? P.ink[0] : '#2a1d16', st = P ? P.stone : ['#555', '#666', '#888', '#aaa', '#ccc'], wd = P ? P.wood : ['#3a2a20', '#5a3a28', '#7a5230', '#a0703f', '#c8955a', '#e0b880'];
  const wt = P ? P.water : ['#16294a', '#24456e', '#3a6f9a', '#5b9cc4', '#8cc6dc', '#c8e8f0'];
  const CAN = pixIcon([
    '                ', '                ', '    kkkkkk      ', '   k      k     ', '   k      k    k', '  kkkkkkkkkk  kk',
    ' kllllllllldkkdk', ' kllllllllldddk ', ' klhhlllllldkk  ', ' kmmmmmmmmmdk   ', ' kmmmmmmmmmdk   ', ' kdddddddddddk  ',
    '  kkkkkkkkkkk   ', '                ', '                ', '                '],
  { k: ink, l: wt[3], h: wt[5], m: wt[2], d: wt[1] });
  const BASKET = pixIcon([
    '                ', '                ', '     kkkkkk     ', '    k      k    ', '   k        k   ', '  kkkkkkkkkkkk  ', '  kbtbtbtbtbtk  ', '  kttttttttttk  ',
    '  kbtbtbtbtbtk  ', '   kttttttttk   ', '   kbtbtbtbtk   ', '    kkkkkkkk    ', '                ', '                ', '                ', '                '],
  { k: ink, b: wd[2], t: wd[4] });
  const gr = P ? P.green : ['#1f3a22', '#2e5a2c', '#3f7a32', '#5a9a3a', '#8fd35a', '#c8f08a'], rf = P ? P.roof : ['#4a1c1c', '#7a2a24', '#b8432f', '#d9826a'];
  const ICONS = {
    can: CAN, basket: BASKET,
    cottage: pixIcon(['', '', '      kk', '     kggk  kk', '    kggggk ks', '   kggggggkks', '  kggggggggk', ' kkkkkkkkkkkk', '  kwwwwwwwwk', '  kwbbwwbbwk', '  kwbbwwbbwk', '  kwwwddwwwk', '  kkkkddkkkk', ' yyyy    yyyy'],
      { k: ink, g: gr[2], s: '#9a9a92', w: wd[4], b: '#4fa3cf', d: gr[1], y: gr[3] }), // v5.9.0 the new house
    town: pixIcon(['', '      kk', '     krrk', '    krrrrk   kk', '   krrrrrrk krrk', '  kkkkkkkkkkrrrrk', '   kwwwwwwkkkkkkk', '   kwbwwbwk kwwk', '   kwwwwwwk kwdk', '   kwwddwwk kwdk', '   kkkddkkkkkkkk', '  gggg  gggg'],
      { k: ink, r: rf[2], w: wd[5] || wd[4], b: '#4fa3cf', d: wd[1], g: gr[3] }), // v5.8.0 the town
    shoe: pixIcon(['', '', '', '    kkkk', '   kbbbbk', '   kbttbk', '   kbbbbk', '   kbbbbkk', '   kbbbbbbkkk', '  kbbbbbbbbbbk', '  kbtttbbbbbbbk', '  kkkkkkkkkkkkk', '  kdddddddddddk', '   kkkkkkkkkkk'].map(r => r.padEnd(16)),
      { k: ink, b: wd[2], t: wd[4], d: wd[1] }),
    hoe: pixIcon(['', '            kk', '           kbk', '          kbk', '         kbk', '        kbk', '       kbk', '      kbk', '     kbk', '  kkkbk', ' kssskk', ' kseeek', ' kseek', '  kkk'].map(r => r.padEnd(16)),
      { k: ink, b: wd[3], s: st[3], e: st[4] }),
    field: pixIcon(['', '', '', '   kkkkkkkkkk', '  kbtbbtbbtbbk', '  kbbbbbbbbbbk', '  kkkkkkkkkkkk', '  kbtbgbbtbgbk', '  kbbglbbbglbk', '  kkkkkkkkkkkk', '  kbtbbtbbtbbk', '  kbbbbbbbbbbk', '   kkkkkkkkkk'].map(r => r.padEnd(16)),
      { k: ink, b: wd[1], t: wd[2], g: gr[3], l: gr[4] }),
    axe: pixIcon(['', '', '    kkkkk', '   kssssk', '  ksseeek', '  ksseekk', '   kssk b', '    kk kb', '      kb', '     kb', '    kb', '   kb', '  kb', '  k'].map(r => r.padEnd(16)),
      { k: ink, s: st[3], e: st[4], b: wd[3] }),
    forest: pixIcon(['', '      kk', '     kggk', '    kgllgk', '   kgglggk', '    kggggk', '   kgglgggk', '  kggggglgk', '   kkkbbkkk', '      bb', '      bb', '     kbbk', '     kkkk'].map(r => r.padEnd(16)),
      { k: ink, g: gr[2], l: gr[4], b: wd[2] }),
    orchard: pixIcon(['', '     kkkkk', '   kkgggggkk', '  kggrgggrggk', '  kgggglgggk', '  kgrggggrggk', '   kggrgggkk', '    kkkbkk', '       bb', '       bb', '      kbbk', '      kkkk'].map(r => r.padEnd(16)),
      { k: ink, g: gr[3], l: gr[4], r: rf[2], b: wd[2] }),
  };
  ICONS.east = ICONS.field; ICONS.south = ICONS.field;
  // v4.5 pasture: buildings and products drawn here; the animals reuse the game's own sprites
  const house = (roof) => pixIcon(['', '', '       kk', '      krrk', '     krrrrk', '    krrrrrrk', '   krrrrrrrrk', '  kkkkkkkkkkkk', '   kwwwwwwwwk', '   kwwkkkwwwk', '   kwwkikwwwk', '   kwwkikwwwk', '   kkkkkkkkkk'].map(r => r.padEnd(16)), { k: ink, r: roof, w: wd[3], i: ink });
  Object.assign(ICONS, { house: house(rf[3]), fence: null, coop: house(rf[2]), shed: house(st[2]), sty: house(wd[2]), fold: house('#f2cf55'),
    truffle: pixIcon(['', '', '', '', '', '     kkkk', '    kbbtbk', '   kbtbbbbk', '   kbbbbtbk', '   kbtbbbbk', '    kbbbbk', '     kkkk'].map(r => r.padEnd(16)), { k: ink, b: wd[1], t: wd[3] }),
    pasture: pixIcon(['', '', '', '', '  k   k   k   k', ' kwk kwk kwk kwk', ' kwkkkwkkkwkkkwk', ' kwwwwwwwwwwwwwk', ' kwkkkwkkkwkkkwk', ' kwwwwwwwwwwwwwk', ' kwkgkwkgkwkgkwk', 'gkwkgkwkgkwkgkwkg', 'ggggggggggggggggg'].map(r => r.padEnd(16)), { k: ink, w: wd[4], g: gr[3] }),
    hay: pixIcon(['', '', '', '', '   kkkkkkkkkk', '  kyyyyyyyyyyk', '  kyyyyyyyyyyk', '  kbbbbbbbbbbk', '  kyyyyyyyyyyk', '  kyyyyyyyyyyk', '  kbbbbbbbbbbk', '  kyyyyyyyyyyk', '   kkkkkkkkkk'].map(r => r.padEnd(16)), { k: ink, y: '#f2cf55', b: wd[3] }),
    fishfood: pixIcon(['', '', '', '    kkkkkk', '   kyyyyyyk', '  kyykkkkkk', '  kykwwwwwk', '  kykwwwwwk', '  kyyyyyyyyk', '   kyyyyyyk', '    kkkkkk'].map(r => r.padEnd(16)), { k: ink, y: '#e8c78a', w: wt[4] }),
    goldfish: pixIcon(['', '', '', '', '     kkkk', '    kooooook', '   kooooyoook', '  koooooooookk', '   kooooook wk', '    kkkkkk  k', '         kkk'].map(r => r.padEnd(16)), { k: ink, o: '#e8a02a', y: '#fff6dc', w: wt[4] }),
    koi: pixIcon(['', '', '', '', '     kkkk', '    kororork', '   kororyrork', '  kororororokk', '   kororork wk', '    kkkkkk  k', '         kkk'].map(r => r.padEnd(16)), { k: ink, o: '#e06a2c', r: '#fff6dc', y: '#2a1d16', w: wt[4] }),
    book: pixIcon(['', '', '   kkkkkkkk', '  kyyyyyyyyk', '  kykkkkkkyk', '  kyyyyyyyyk', '  kykkkkkkyk', '  kyyyyyyyyk', '  kykkkkkkyk', '  kyyyyyyyyk', '   kkkkkkkk'].map(r => r.padEnd(16)), { k: ink, y: '#e8c78a' }),
    egg: pixIcon(['', '', '', '', '     kkkk', '    kwwwwk', '   kwwwwwwk', '   kwwwwwwk', '    kwwwwk', '     kkkk'].map(r => r.padEnd(16)), { k: ink, w: '#fff6dc' }),
    egg: pixIcon(['', '', '', '', '      kkk', '     kcccк', '    kcccccк', '    kccccck', '    kcccccck', '    kcecccck', '     keccck', '      kkkk'].map(r => r.replace(/к/g, 'k').padEnd(16)), { k: ink, c: '#f6ecd0', e: st[3] }),
    wool: pixIcon(['', '', '', '    kk kk', '   kcckcck', '  kcceccccck', '  kcccccecck', ' kceccccccck', ' kccccceccck', '  kccecccck', '   kkcckkk', '     kk'].map(r => r.padEnd(16)), { k: ink, c: '#f6ecd0', e: st[3] }),
    milk: pixIcon(['', '', '      kkk', '      kak', '     kkkkk', '    kcccck', '    kcccck', '    kaaaak', '    kcccck', '    kcccck', '    kcccck', '    kkkkkk'].map(r => r.padEnd(16)), { k: ink, c: '#f6ecd0', a: wt[3] }),
    rod: pixIcon(['', '', '             k', '            kb', '           kb', '          kb', '         kb', '        kb', '       kb', '      kb', '   kkkb', '  kwwwk', '  kwkwk', '   kkk'].map(r => r.padEnd(16)), { k: ink, b: wd[3], w: '#fff6dc' }),
    searod: pixIcon(['', '              k', '             ks', '            ks', '           ks', '          ks', '         ks', '        ks', '       ks', '      ks', '   kkks', '  kwwwk', '  kwrwk', '   kkk'].map(r => r.padEnd(16)), { k: ink, s: st[3], w: '#fff6dc', r: (P && P.roof) ? P.roof[2] : '#b8432f' }),
    coast: pixIcon(['', '', '', '                ', '     www  ww', '   wwkwkwwkwk', '  wkkkkkkkkkk', '  kssysysyssk', '  ksssssssssk', ' kssysysysssk', 'kkkkkkkkkkkkkk', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb'].map(r => r.padEnd(16)), { k: ink, w: wt[4], b: wt[2], s: wd[4], y: '#fff6dc' }) });
  ICONS.fence = ICONS.pasture; // v5.0
  ICONS.graze = ICONS.pasture; // v5.5.0 the fold's grazing meadow
  ICONS.lumber = house(gr[2]); // v5.3.1 the lumber hut: a cabin with a moss-green roof
  ICONS.heart = pixIcon(['', '', '', '   kkk   kkk', '  kpppk kpppk', ' kpphppkpppppk', ' kphhpppppppk', ' kpppppppppppk', '  kpppppppppk', '   kpppppppk', '    kpppppk', '     kpppk', '      kpk', '       k'].map(r => r.padEnd(16)), { k: ink, p: '#e57fa0', h: '#f6ecd0' });
  ICONS.flower = pixIcon(['', '', '', '      y', '     kyk', '    ykyky', '     kyk', '      b', '      b', '     kbk', '      k'].map(r => r.padEnd(16)), { k: ink, y: '#ffd76a', b: gr[3] });
  // v5.6.0 phase 8: sprinkler, workshops, water wheel, hive and their goods
  Object.assign(ICONS, {
    sprinkler: pixIcon(['', '  a   a   a', '   a  a  a', '    a a a', '     kkk', '    keeek', '     kek', '      e', '      e', '      e', '      e', '     kek', '    kssssk', '    kkkkkk'].map(r => r.padEnd(16)), { k: ink, a: wt[4], e: st[3], s: st[2] }),
    mill: pixIcon(['', '      kk', '     kbbk', '    kbbbbk', '   kbbbbbbk', '  kkkkkkkkkk', '   kssssssk', '   kseesssk', '   kssskksk', '  kkkssskwkk', ' kwwwkskwwwk', ' kwkwkskwkwk', ' kwwwkkkwwwk', '  kkk   kkk'].map(r => r.padEnd(16)), { k: ink, b: wd[1], s: st[3], e: st[2], w: st[2] }),
    jam: pixIcon(['', '', '     kkkkk', '     kbbbk', '    kkkkkkk', '    kcccccck', '   krrrrrrrk', '   krwrrrrrk', '   krrrrrrrk', '   krrrrrrrk', '   krrrrrrrk', '    kkkkkkk'].map(r => r.padEnd(16)), { k: ink, b: wd[3], c: '#fff6dc', r: rf[2], w: '#f6b0a0' }),
    cheese: pixIcon(['', '', '', '', '        kkk', '     kkkyyyk', '   kkyyyyyyk', '  kyyyoyyyyyk', '  kkkkkkkkkkk', '  kyyyyyoyyyk', '  kyoyyyyyyyk', '  kyyyyyyoyyk', '  kkkkkkkkkkk'].map(r => r.padEnd(16)), { k: ink, y: '#f2cf55', o: '#e8a02a' }),
    wheel: pixIcon(['', '     kkkkk', '   kkbkbkbkk', '  kbkk b kkbk', '  kk  kbk  kk', ' kbb  kbk  bbk', ' kkkkkkkkkkkkk', ' kbb  kbk  bbk', '  kk  kbk  kk', '  kbkk b kkbk', '   kkbkbkbkk', '  aakkkkkkaa', ' aaaaaaaaaaaaa', ''].map(r => r.padEnd(16)), { k: ink, b: wd[3], a: wt[3] }),
    hive: pixIcon(['', '', '    kkkkkkkk', '   krrrrrrrrk', '  kkkkkkkkkkkk', '   kccccccck', '   kyyyyyyyk', '   kccccccck', '   kyyyyyyyk', '   kcccikccck', '   kkkkkkkkk', '    k     k', '    k     k'].map(r => r.padEnd(16)), { k: ink, r: rf[2], c: '#fff6dc', y: '#f2cf55', i: ink }),
    honey: pixIcon(['', '', '     kkkkk', '     kbbbk', '    kkkkkkk', '    kcccccck', '   kyyyyyyyk', '   kywyyyyyk', '   kyyyyyyyk', '   kyyyyyyyk', '   kyyyyyyyk', '    kkkkkkk'].map(r => r.padEnd(16)), { k: ink, b: wd[3], c: '#fff6dc', y: '#e8a02a', w: '#ffd76a' }),
    flour: pixIcon(['', '', '', '     kk  kk', '    kcckkcck', '    kcccccck', '   kccccccck', '   kcbccbccck', '   kccbbcccck', '   kcccccccck', '   kccccccck', '    kkkkkkk'].map(r => r.padEnd(16)), { k: ink, c: '#f6ecd0', b: wd[3] }),
  });
  Object.assign(ICONS, { coop2: ICONS.coop, sty2: ICONS.sty, fold2: ICONS.fold, shed2: ICONS.shed });
  ICONS.bugnet = pixIcon(['', '', '     kk', '    kwwk', '    kwwk', '     kk', '     kb', '    kb', '   kb', '  kb', ' kb', 'kb', 'k'].map(r => r.padEnd(16)), { k: ink, w: '#fff6dc', b: wd[3] });
  const artIcon = k => { const a = G.animalArt(k), n = Math.max(16, a.width, a.height), c = document.createElement('canvas'); c.width = c.height = n;
    c.getContext('2d').drawImage(a, (n - a.width) >> 1, n - a.height - ((n - a.height) >> 2)); return c.toDataURL(); };
  for (const k of PFAnimals.KIND_IDS) ICONS[k] = artIcon(k);
  const petIcon = (k, coat) => { const a = G.petArt(k, coat), n = 16, c = document.createElement('canvas'); c.width = c.height = n; c.getContext('2d').drawImage(a, (n - a.width) >> 1, n - a.height - 3); return c.toDataURL(); };
  ICONS.cat = petIcon('cat', 'ginger'); ICONS.dog = petIcon('dog', 'shiba');
  const FRUIT_ICON = { apple: pixIcon(['', '', '', '      kk', '     kgk', '   kkkbkkk', '  krrrrrrrk', '  krwrrrrrk', '  krrrrrrrk', '  krrrrrrrk', '   krrrrrk', '    kkkkk'].map(r => r.padEnd(16)), { k: ink, g: gr[3], b: wd[2], r: rf[2], w: '#fff6dc' }),
    orange: pixIcon(['', '', '', '      kg', '     kgk', '   kkkkkkk', '  koooooook', '  koyoooook', '  koooooook', '  koooooook', '   koooook', '    kkkkk'].map(r => r.padEnd(16)), { k: ink, g: gr[3], o: '#e8862a', y: '#ffd76a' }),
    wood: pixIcon(['', '', '', '', '  kkkkkkkkkk', ' kbbbbbbbbbbk', ' ktbbbbbbbbtk', '  kkkkkkkkkk', '  kkkkkkkkkk', ' kbbbbbbbbbbk', ' ktbbbbbbbbtk', '  kkkkkkkkkk'].map(r => r.padEnd(16)), { k: ink, b: wd[2], t: wd[4] }) };
  // crop icons come from the game's ripe-crop atlas (SpriteCook sheet + hand-drawn strawberry / watermelon), shown at 2x
  let atlas = null;
  const cropIcon = k => { atlas = atlas || (G.cropAtlasURL && G.cropAtlasURL());
    return `<i style="background:url(${atlas || (window.PF_CROPS && window.PF_CROPS.src)}) no-repeat;background-size:${32 * SIM.IDS.length}px 32px;background-position:${-32 * SIM.IDS.indexOf(k)}px 0"></i>`; };
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const DART = () => window.PFDecorArt; // v5.7.0: decorations draw their own icons from their models
  const YART = id => window.PFYardArt && PFYardArt.iconURL(id); // v5.10.3: the yard things
  const iconURL = id => ICONS[id] || (DART() && DART().iconURL(id)) || YART(id) || BLANK;
  const hasIcon = id => !!(ICONS[id] || (DART() && DART().iconURL(id)) || YART(id));
  const icon = id => (SIM.CROPS[id] ? cropIcon(id) : `<i style="background:url(${iconURL(id)});background-size:32px;image-rendering:pixelated"></i>`);
  const typ = it => (window.PFSurprise ? PFSurprise.itemType(it) : it);
  const ICN = window.PFCodexIcons, BOOK = window.PFCodex;
  if (ICN) {
    if (ICN.fishURL('goldfish')) ICONS.goldfish = ICN.fishURL('goldfish');
    if (ICN.fishURL('koi')) ICONS.koi = ICN.fishURL('koi');
  }
  function icoTag(url, cls, w, h) {
    if (!url) return '';
    return `<i class="ico ${cls || ''}" style="width:${w}px;height:${h}px;background-image:url(${url});background-size:${w}px ${h}px"></i>`;
  }
  function canvasImg(c) {
    const g = c.getContext('2d');
    return { w: c.width, h: c.height, px: new Uint8ClampedArray(g.getImageData(0, 0, c.width, c.height).data) };
  }
  function decorateCrop(type, mode, seen, fit) {
    const src = G.cropFrame && G.cropFrame(type);
    if (!src) return cropIcon(type);
    const glow = mode === 'glow' || mode === 'glow-giant', giant = mode === 'giant' || mode === 'glow-giant';
    const pad = glow ? 3 : 2, scale = giant ? 2 : 1;
    const c = document.createElement('canvas');
    c.width = src.width * scale + pad * 2; c.height = src.height * scale + pad * 2;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(src, pad, pad, src.width * scale, src.height * scale);
    if (glow) {
      const im = g.getImageData(0, 0, c.width, c.height), d = im.data, w = c.width, h = c.height;
      const aat = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d[(y * w + x) * 4 + 3];
      const gold = [255, 215, 106, 255], cream = [255, 246, 220, 255], extra = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (aat(x, y)) continue;
        if (aat(x - 1, y) || aat(x + 1, y) || aat(x, y - 1) || aat(x, y + 1)) extra.push(x, y);
      }
      for (let i = 0; i < extra.length; i += 2) {
        const x = extra[i], y = extra[i + 1], j = (y * w + x) * 4, col = (x + y) % 2 ? gold : cream;
        d[j] = col[0]; d[j + 1] = col[1]; d[j + 2] = col[2]; d[j + 3] = 255;
      }
      g.putImageData(im, 0, 0);
      g.drawImage(src, pad, pad, src.width * scale, src.height * scale);
    }
    let img = canvasImg(c);
    if (!seen && ICN) img = ICN.silhouette(img);
    const url = ICN ? ICN.urlOf(img) : c.toDataURL();
    let show = giant ? 1.5 : 2, dw = Math.round(c.width * show), dh = Math.round(c.height * show);
    if (fit && Math.max(dw, dh) > fit) { const s = fit / Math.max(dw, dh); dw = Math.max(1, Math.round(dw * s)); dh = Math.max(1, Math.round(dh * s)); }
    return icoTag(url, 'crop', dw, dh);
  }
  // Shared pixel art for fish, rares, glowing and giant crops (same sprites as the 图鉴).
  function itemKind(spec) {
    if (!spec) return null;
    const id = spec.id || spec.type;
    const FS = window.PFFish;
    if (spec.group === 'fish' || (FS && FS.isFish(id))) return { kind: 'fish', id };
    if (spec.group === 'rare' || (spec.rare && ICN && ICN.has('rare', spec.rare))) return { kind: 'rare', id: spec.rare };
    if (id && ICN && ICN.has('rare', id) && (spec.kind === 'rare' || !spec.type || spec.type === id)) return { kind: 'rare', id };
    if (spec.group === 'glow-giant' || (spec.glow && spec.giant)) return { kind: 'glow-giant', id };
    if (spec.group === 'glow' || spec.glow) return { kind: 'glow', id };
    if (spec.group === 'giant' || spec.giant) return { kind: 'giant', id };
    return { kind: 'other', id };
  }
  function itemArt(spec, opt) {
    opt = opt || {};
    const seen = opt.seen !== false, fit = opt.fit || 0, k = itemKind(spec);
    if (!k) return '<i></i>';
    if (k.kind === 'fish' && ICN && ICN.has('fish', k.id)) {
      const url = seen ? ICN.fishURL(k.id) : ICN.silURL('fish', k.id);
      const w = opt.w || (fit ? Math.min(fit, 48) : 72), h = Math.round(w * 16 / 24);
      return icoTag(url, 'fish', w, h);
    }
    if (k.kind === 'rare' && ICN && ICN.has('rare', k.id)) {
      const url = seen ? ICN.rareURL(k.id) : ICN.silURL('rare', k.id);
      const s = opt.w || opt.fit || 32;
      return icoTag(url, 'rare', s, s);
    }
    if (k.kind === 'glow' || k.kind === 'giant' || k.kind === 'glow-giant') return decorateCrop(k.id, k.kind, seen, fit || opt.w);
    if (k.id && (hasIcon(k.id) || (SIM.CROPS && SIM.CROPS[k.id]))) return icon(k.id);
    return '<i></i>';
  }
  function rarityClass(spec) {
    if (!BOOK || !BOOK.rarityOf) return '';
    const k = itemKind(spec); if (!k || k.kind === 'other') return '';
    const it = (k.kind === 'glow' || k.kind === 'giant' || k.kind === 'glow-giant') ? { group: k.kind === 'glow-giant' ? 'giant' : k.kind, type: k.id } : { group: k.kind, id: k.id };
    const tier = BOOK.rarityOf(it);
    return tier ? 'r-' + tier : '';
  }
  // v5.1.1: 8 tick marks; v5.11.0.7 the fill is a share of the bar so the same meter fits the full slot, the compact slot and the slim strip
  function meterBar(cur, max) {
    const pct = max > 0 ? Math.max(0, Math.min(100, Math.round(100 * cur / max))) : 0;
    return `<div class="meter" aria-valuenow="${cur}" aria-valuemax="${max}"><i class="fill" style="width:${pct}%"></i><span class="ticks"></span></div>`;
  }
  // ---- v5.11.0.7 seed packets: one 16x16 picture per crop (paper packet, crop-coloured bands, a small drawing of the crop) ----
  // The bar used to show seeds by sliding the whole ripe-crop sheet behind a 32px box, and a v5.9.1 rule (#inv .slot i{background-size:28px!important})
  // squashed that sheet into 28px: carrot (frame 0) showed every crop as a row of dots, the others slid out of the box and showed nothing.
  const SEED_ART = {
    carrot: { band: '#e8862a', rows: ['     g g', '    ggg ', '   OoG  ', '  Ohoo  ', '  ooO   ', ' Ooo    ', ' oO     ', 'O       '], cols: { o: '#e8862a', O: '#b85a1a', h: '#ffb060', g: gr[4], G: gr[2] } },
    cabbage: { band: gr[3], rows: ['        ', '  GggG  ', ' GglggG ', ' glGGlg ', ' gGllGg ', ' GglggG ', '  GggG  ', '        '], cols: { g: gr[3], l: gr[4], G: gr[2] } },
    pumpkin: { band: '#b85a1a', rows: ['    t   ', '   tt   ', ' OooooO ', 'OohoOooO', 'OohoOooO', 'OoooOooO', ' OooooO ', '        '], cols: { o: '#e8862a', O: '#b85a1a', h: '#ffb060', t: gr[2] } },
    strawberry: { band: '#d83a3a', rows: ['  g  g  ', ' gGggGg ', ' rrrrrr ', ' rxrrxr ', ' rrrrRr ', '  rxRr  ', '   rr   ', '        '], cols: { r: '#d83a3a', R: '#9a2a2a', x: '#ffd76a', g: gr[4], G: gr[2] } },
    watermelon: { band: gr[2], rows: ['        ', '        ', 'rrrrrrrr', 'rxrrrxrr', ' rrxrrr ', ' cccccc ', '  GGGG  ', '        '], cols: { r: '#e8505a', x: ink, c: '#c8f08a', G: gr[2] } },
    wheat: { band: '#c8952a', rows: ['    y   ', '   yYy  ', '   yYy y', '   yYyyY', '   yYy y', '    t   ', '   tt   ', '    t   '], cols: { y: '#f2cf55', Y: '#c8952a', t: gr[3] } },
  };
  const SEED_DOTS = { band: wd[3], rows: ['        ', '        ', '  bb    ', '  bbb bb', '   b bbb', '  bb  b ', '  bbb   ', '        '], cols: { b: wd[1] } };
  function seedPacket(art) {
    const rows = ['', '  kkkkkkkkkkkk', '  kwdwdwdwdwdk', '  kBBBBBBBBBBk'];
    for (let y = 0; y < 9; y++) { const e = y ? art.rows[y - 1] : '        '; rows.push('  kp' + [...e].map(ch => ch === ' ' ? 'p' : ch).join('') + 'sk'); }
    rows.push('  kBBBBBBBBBBk', '  kkkkkkkkkkkk');
    return pixIcon(rows.map(r => r.padEnd(16)), Object.assign({ k: ink, w: '#fff6dc', d: '#e0d0a8', p: '#f6ecd0', s: '#e0d0a8', B: art.band }, art.cols));
  }
  const SEED_ICON = {};
  const seedIconURL = k => SEED_ICON[k] || (SEED_ICON[k] = seedPacket(SEED_ART[k] || SEED_DOTS));
  // saplings: a sprout in a burlap bag with the fruit's colour, so they do not read as the fruit itself
  const saplingIcon = fruit => pixIcon(['', '', '', '     kkkk', '    kgggglk', '   kglggfgk', '   kgfgglk', '    kkkbkk', '      b', '      b', '    kkkbkk', '   kddddddk', '   kdtddtdk', '    kkkkkk'].map(r => r.padEnd(16)), { k: ink, g: gr[3], l: gr[4], f: fruit, b: wd[2], d: wd[3], t: wd[4] });
  const SAPLING_ICON = { apple: saplingIcon(rf[2]), orange: saplingIcon('#e8862a') };
  ICONS.crate = pixIcon(['', '', '  kkkkkkkkkkkk', '  kttttttttttk', '  kbkbbbbbbkbk', '  kbbkbbbbkbbk', '  kbbbkbbkbbbk', '  kbbbbkkbbbbk', '  kbbbkbbkbbbk', '  kbbkbbbbkbbk', '  kbkbbbbbbkbk', '  kttttttttttk', '  kkkkkkkkkkkk'].map(r => r.padEnd(16)), { k: ink, b: wd[2], t: wd[4] });
  const pic = url => `<i style="background-image:url(${url})"></i>`; // one 16x16 picture; the bar's CSS sizes it at 2x
  // ---- inventory bar: water, the seeds he can grow, the basket ----
  // v5.11.0.7 three looks, desktop web only (a platform shell such as xhs docks #inv itself and always gets the full look):
  //   full    — early game (阿禾 has not moved in): 54px slots with the name under the icon, so a new player can read the bar
  //   compact — once the family runs the farm: 40px icon + count slots, name and details in a hover tooltip, kids folded into 家人, a 仓库 highlight
  //   slim    — one thin strip (water, basket, family, storehouse), the default once the family has moved in; ▴ / ▾ switch, kept in localStorage
  const INV_KEY = 'mouzhi/pixel-farm:ui:inv';
  const hosted = () => !!window.PFPlatform;
  const readInvPref = () => { try { return localStorage.getItem(INV_KEY) || ''; } catch (e) { return ''; } };
  let invPref = hosted() ? '' : readInvPref();
  const setInvPref = v => { invPref = v; try { localStorage.setItem(INV_KEY, v); } catch (e) {} invKey = ''; inv(); hideTip(); };
  const invMode = () => { if (hosted()) return 'full'; const late = !!(G.S.family && G.S.family.moved); if (invPref === 'slim') return 'slim'; if (invPref === 'open') return late ? 'compact' : 'full'; return late ? 'slim' : 'full'; };
  const short = n => n >= 10000 ? (Math.round(n / 1000) / 10) + '万' : String(n);
  let storeCache = null, storeAt = 0; // G.storehouse() walks every basket; the bar re-reads it at most every 2 s
  const storeSum = () => { const now = Date.now(); if (!storeCache || now - storeAt > 2000) { storeAt = now; try { storeCache = G.storehouse ? G.storehouse() : null; } catch (e) { storeCache = null; } } return storeCache; };
  let invKey = '';
  function invEntries(mode) {
    const S = G.S, F = G.F, E = S.eff, ids = SIM.IDS.filter(k => E.crops.includes(k) || F.bag[k] > 0), out = [];
    const add = o => out.push(Object.assign({ n: '', tip: '', cls: '', kcls: '' }, o));
    add({ id: 'can', ico: pic(CAN), name: '水壶', n: `${F.water}/${S.waterMax}`, tip: '每格土地每天浇一次，空了去井边装满', meter: meterBar(F.water, S.waterMax), mini: 1 });
    for (const k of ids) { const n = F.bag[k] + (k === 'carrot' ? F.gathered : 0); if (!n && k !== 'carrot') continue; // v5.9.1: seeds he has none of stay out of the one-row bar
      add({ id: 'seed-' + k, ico: pic(seedIconURL(k)), name: `${SIM.CROPS[k].name}种`, n, dim: !n, tip: `${SIM.CROPS[k].name}种子（随身）· ${SIM.CROPS[k].days} 天成熟` }); }
    add({ id: 'basket', ico: pic(BASKET), name: '篮子', n: `${F.crops.length}/${E.basket}`, dim: !F.crops.length, tip: `装满 ${E.basket} 个就去集市`, mini: 1 });
    if (F.wood || E.axe) { const cap = (G.woodCap && G.woodCap()) || PFWorld.HOUSE_TIERS[E.house || 0].woodCap; // v5.0: wood is a material kept in the storehouse; v5.10.5 cap +400 with the woodshop
      add({ id: 'wood', ico: pic(FRUIT_ICON.wood), name: '木材', n: `${F.wood}/${cap}`, cn: short(F.wood), dim: !F.wood, tip: `仓库里的木材：扩建房子、给动物棚子围篱笆要用。仓库最多放 ${cap} 份（房子越大越多），放不下的才拿去集市卖（${PFWorld.WOOD.price} 金一份）` }); }
    { const fam = S.family, FA = window.PFFamily, tier = PFWorld.HOUSE_TIERS[E.house || 0]; // v5.0: 阿禾 and the children
      if (!fam.moved && fam.met) add({ id: 'ahe', ico: pic(ICONS.heart), name: '阿禾', n: `${fam.love}/${FA.LOVE_MAX}`, tip: `阿禾是集市的店主（7:00–19:00 开门）。农夫每天第一次去集市会和她聊几句（+${FA.CHAT}），篮子里有野花、鱼、果子或鸡蛋就送她一样；每天头两趟卖东西各 +${FA.SALE}。好感满 ${FA.LOVE_MAX}、房子扩建成大木屋后，她就搬来一起经营农场，摊子交给她爸爸。` });
      if (fam.moved) {
        // v5.11.0.7: one 家人 slot; each child's age, school or job is a line of its tooltip instead of a slot of its own
        const NK = window.PFKids, HSK = G.homeStatus ? G.homeStatus().kids : [];
        const jobOf = m => !m || m.home ? '在家' : m.away ? '在学校上课' : (m.task ? m.task.label : '歇着');
        const stageOf = k => { const HS = HSK.find(q => q.id === k.id); return HS && HS.married ? '成家' : NK ? NK.panelShort(k, S.day) : FA.kidStage(k, S.day); };
        const noteOf = k => { const HS = HSK.find(q => q.id === k.id); return HS && HS.note ? '，' + HS.note : ''; };
        const lines = S.members.filter(m => !fam.kids.some(k => k.id === m.id)).map(m => `${m.name}：${jobOf(m)}`);
        for (const k of fam.kids) lines.push(`${k.name}（${stageOf(k)}）：${jobOf(S.members.find(q => q.id === k.id))}${noteOf(k)}`);
        const busy = S.members.filter(m => !m.home && !m.away && m.task).length;
        const pop = 1 + S.members.length + fam.kids.filter(k => FA.kidStage(k, S.day) === 'baby').length;
        add({ id: 'family', ico: pic(ICONS.house), name: '家人', n: `${pop}/${tier.pop}`, tip: `${tier.name}：最多住 ${tier.pop} 人，现在 ${busy} 人在干活。\n` + lines.join('\n'), mini: 1, miniN: busy ? `${busy} 人在干活` : `${pop} 口人` });
        const nk = FA.nextKid(fam, S.day, tier.pop); // v5.3: the wait for a child is visible, so it does not look stuck
        if (nk) add({ id: 'nextkid', ico: pic(ICONS.heart), name: nk.name, n: nk.room ? '要扩建' : nk.days === 1 ? '明天' : nk.days + ' 天', dim: nk.room, tip: `${FA.kidText(nk)}。阿禾搬来 ${FA.KID_AFTER} 天后第一个孩子出生，之后每个孩子相隔 ${FA.KID_GAP} 天；房子要有空房间（二层农舍住 3 人，庄园住 4 人）` });
      } }
    for (const k of PFWorld.FRUIT_IDS) if (F.saplings[k]) add({ id: 'sap-' + k, ico: pic(SAPLING_ICON[k] || FRUIT_ICON[k]), name: `${PFWorld.FRUIT[k].name}苗`, n: F.saplings[k], tip: `${PFWorld.FRUIT[k].name}树苗：用右下角的「种${PFWorld.FRUIT[k].name}」指定位置` });
    if (['coop', 'sty', 'fold', 'shed'].some(k => S.eff[k])) add({ id: 'hay', ico: pic(ICONS.hay), name: '干草', n: S.hay, dim: !S.hay, tip: `仓库里的干草：每只鸡每天 1 份，猪和羊 2 份，牛 3 份。拔草会晒出干草，不够时去集市买（${PFAnimals.HAY.price} 金一捆）` });
    if (S.animals.length) { const avg = Math.round(S.animals.reduce((n, a) => n + a.h, 0) / S.animals.length), mood = PFAnimals.mood(avg);
      add({ id: 'animals', ico: pic(ICONS.chicken), name: mood, n: S.animals.length, tip: `${S.animals.map(a => `${PFAnimals.KINDS[a.kind].name} ${a.h}（${PFAnimals.mood(a.h)}）`).join('，')}。喂饱、加水、摸一摸会更开心；开心（80 以上）多产一份，闷闷不乐（30 以下）不产。` }); }
    // v4.6: the starter bamboo rod is always owned (shop level 0); fish in the basket are listed by kind
    const FS = window.PFFish, rod = FS.rodOf(E.rod || 0);
    add({ id: 'rod', ico: pic(E.searod ? ICONS.searod : ICONS.rod), name: E.searod ? '海竿' : rod.name, tip: E.searod ? `${rod.name}，另有海竿，可在码头海钓` : `${rod.name}（开局就有）。商店可升级钢竿、碳素竿；买下海边和海竿后能海钓` });
    if (FS) { const counts = {}; for (const k of F.crops) { const id = typ(k); if (FS.isFish(id)) counts[id] = (counts[id] || 0) + 1; }
      for (const id of FS.FISH_IDS) if (counts[id]) { const f = FS.fishOf(id), rc = rarityClass({ group: 'fish', id });
        add({ id: 'fish-' + id, ico: itemArt({ group: 'fish', id }, { fit: 32 }), name: f.name, n: counts[id], cls: rc, kcls: rc, tip: `篮子里待售，集市收购 ${f.price} 金一条` }); } }
    // same sprites for basket rares / glowing / giant crops, grouped like the fish slots
    if (window.PFSurprise) {
      const groups = new Map();
      for (const it of F.crops) { const o = PFSurprise.itemOf(it); if ((FS && FS.isFish(o.type)) || !(o.rare || o.glow || o.giant)) continue;
        const key = [o.type, o.glow || 0, o.giant || 0, o.rare || ''].join(':'); const e = groups.get(key) || { spec: o, n: 0 }; e.n++; groups.set(key, e); }
      for (const e of groups.values()) {
        const name = PFSurprise.itemName(e.spec, Object.fromEntries((SIM.IDS || []).map(k => [k, SIM.CROPS[k].name])));
        const rc = rarityClass(e.spec), unit = G.priceOfAny ? G.priceOfAny(e.spec) : '';
        add({ id: 'sp-' + name, ico: itemArt(e.spec, { fit: 32 }), name, n: e.n, cls: rc, kcls: rc, tip: unit ? `篮子里待售，集市收购 ${unit} 金` : '' });
      }
    }
    // v5.11.0.7 late game: what the storehouse would fetch today, the thing a player who no longer farms by hand looks for
    if (mode !== 'full') { const d = storeSum();
      if (d) { const rows = (d.store || []).filter(r => r.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);
        const seeds = (d.store || []).reduce((n, r) => n + r.n, 0);
        add({ id: 'store', ico: pic(ICONS.crate), name: '仓库', n: short(d.sellGold || 0), act: 'store', mini: 1, miniN: `可卖 ${short(d.sellGold || 0)}`,
          tip: `今天可卖 ${d.sellGold || 0} 金（按今日行情）。仓库种子 ${seeds} 颗，木材 ${d.wood ? d.wood.n : 0}/${d.wood ? d.wood.cap : 0}。` + (rows.length ? `\n存得最多：${rows.map(r => `${r.name} ×${r.n}`).join('、')}` : '') + '\n点一下打开仓库（I）' }); } }
    return out;
  }
  function inv() {
    const S = G.S, F = G.F, E = S.eff, mode = invMode(), sd = mode === 'full' ? null : storeSum();
    const specials = (F.crops || []).map(it => { const o = window.PFSurprise ? PFSurprise.itemOf(it) : { type: typ(it) }; return [o.type, o.glow || 0, o.giant || 0, o.rare || ''].join(':'); }).join('|');
    const key = [mode, F.water, S.waterMax, E.basket, ...SIM.IDS.map(k => k + F.bag[k]), specials, F.gathered, F.wood, E.house, E.axe, E.crops.join('/'), F.saplings.apple, F.saplings.orange, S.hay, S.family.love, S.family.met, S.family.moved, S.family.kids.length, S.day, S.members.map(m => m.role + (m.home ? 'h' : '') + (m.away ? 'a' : '') + (m.task ? m.task.label : '')).join('/'), S.animals.map(a => a.h).join('/'), E.rod, E.searod, sd ? sd.sellGold : ''].join(',');
    if (key === invKey) return; invKey = key;
    const list = invEntries(mode), el = $('inv');
    const data = e => `data-id="${e.id}" data-name="${esc(e.name)}" data-tip="${esc(e.tip)}"${e.act ? ` data-act="${e.act}"` : ''}`;
    let h = '';
    if (mode === 'slim') {
      h += `<button type="button" class="invtog" data-a="open" title="展开物品栏">▴ 物品栏</button>`;
      for (const e of list) if (e.mini) h += `<div class="slot mini${e.dim ? ' dim' : ''}" ${data(e)}>${e.ico}${e.meter || ''}<span class="k">${esc(e.name)}</span><span class="n">${esc(e.miniN || e.n)}</span></div>`;
    } else {
      if (!hosted()) h += `<button type="button" class="invtog" data-a="slim" title="收起物品栏（家人会照看农场）">▾</button>`; // first, so it never scrolls out of a long bar
      for (const e of list) h += `<div class="slot ${e.cls}${e.dim ? ' dim' : ''}" ${data(e)}>${e.ico}${e.meter || ''}<span class="k ${e.kcls}">${esc(e.name)}</span>${e.n !== '' ? `<span class="n">${esc(mode === 'compact' && e.cn !== undefined ? e.cn : e.n)}</span>` : ''}</div>`;
    }
    el.className = 'panel ' + mode; el.innerHTML = h;
    if (tipFor && !el.contains(tipFor)) hideTip();
  }
  // ---- v5.11.0.7 hover tooltip for the bar: name, count and the long text, in the same pixel panel as the rest ----
  let tipEl = null, tipFor = null;
  function hideTip() { if (tipEl) tipEl.hidden = true; tipFor = null; }
  function showTip(slot) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.id = 'invTip'; tipEl.className = 'panel'; tipEl.hidden = true; document.body.appendChild(tipEl); }
    const name = slot.dataset.name || '', tip = slot.dataset.tip || '', n = (slot.querySelector('.n') || {}).textContent || '';
    tipEl.innerHTML = `<b>${esc(name)}</b>${n ? `<span class="tn">${esc(n)}</span>` : ''}${tip ? `<div class="td">${esc(tip).replace(/\n/g, '<br>')}</div>` : ''}`;
    tipEl.hidden = false; tipFor = slot;
    const r = slot.getBoundingClientRect(), bar = $('inv').getBoundingClientRect(), w = tipEl.offsetWidth, hgt = tipEl.offsetHeight;
    const x = Math.max(6, Math.min(innerWidth - w - 6, Math.round(r.left + r.width / 2 - w / 2)));
    tipEl.style.left = x + 'px'; tipEl.style.top = Math.max(6, Math.round(bar.top - hgt - 8)) + 'px';
  }
  {
    const el = $('inv');
    el.addEventListener('mouseover', e => { const s = e.target.closest && e.target.closest('.slot'); if (s && el.contains(s)) { if (s !== tipFor) showTip(s); } });
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('.invtog,.slot'); if (!b || !el.contains(b)) return;
      if (b.dataset.a === 'open') return setInvPref('open');
      if (b.dataset.a === 'slim') return setInvPref('slim');
      if (b.dataset.act === 'store') { hideTip(); return toggleStore(true); }
      if (el.classList.contains('slim')) setInvPref('open'); // anywhere on the slim strip opens the bar
    });
  }
  // ---- shop: the player's job is to decide what to buy; the farmer does the rest ----
  const shop = $('shop'); let shopKey = '', shopFocus = '', plotView = ''; // plotView: v5.5.0 one plot's page (plots-ui.js)
  const SHOP_TAB_KEY = 'mouzhi/pixel-farm:shop-tab';
  const HALL_TAB = { id: 'hall', name: '镇公所', title: '镇公所的告示板：建设项目、繁荣度、送给镇上的装饰', ids: [] }; // v5.10.0
  const INN_TAB = { id: 'inn', name: '农家乐', title: '镇门口农家乐区的民宿、二层客栈、菜馆，还有海边度假村。家人帮忙添置不会买这些。', ids: [] }; // v5.10.7; v5.10.8 resort
  const shopTabs = () => (SIM.SHOP_TABS || [{ id: 'all', name: '全部', ids: SIM.SHOP_IDS }]).concat(G.hallView ? [HALL_TAB] : []).concat(G.innView ? [INN_TAB] : []);
  const readShopTab = () => { try { const v = localStorage.getItem(SHOP_TAB_KEY); if (shopTabs().some(t => t.id === v)) return v; } catch (e) {} return shopTabs()[0].id; };
  let shopTab = readShopTab();
  const setShopTab = id => { if (!shopTabs().some(t => t.id === id)) return; shopTab = id; try { localStorage.setItem(SHOP_TAB_KEY, id); } catch (e) {} };
  const costChip = (n, kind) => `<span class="cost"><i class="ico ${kind}"></i><span class="amt">${n}</span></span>`;
  const priceChips = (gold, wood) => `<span class="price">${costChip(gold, 'coin')}${wood ? costChip(wood, 'wood') : ''}</span>`;
  function sectionFor(it, tabId) {
    if (tabId === 'tools' && it.fish) return '钓鱼（开局就有竹竿；海边要先买海边，再买海竿）';
    if (tabId === 'build' && it.p11) return '新房子（盖在花甸或农田里；孩子成家后搬进去，自己种旁边的小田）';
    if (tabId === 'build' && it.home) return '房子（木材 + 金币；房子越大，能住的家人越多）';
    if (tabId === 'build' && it.lumber) return '伐木（木材不够时，农夫会自己去林场砍树）';
    if (tabId === 'land' && it.p10) return '隔壁镇子（东大道尽头：买下大道、孩子上过一天学之后才能开镇门）';
    if (tabId === 'build' && it.p8) return '第二套棚舍（盖在选成「牧场」的地块里，满员后的新动物住进去）';
    if (tabId === 'build' && it.farm) return '棚子';
    if (tabId === 'works' && it.id === 'sprinkler') return '浇水（装在田边，每台管一排 8 格）';
    if (tabId === 'works' && ['mill', 'jam', 'cheese', 'pie'].includes(it.id)) return '加工坊（盖在选成「工坊院」的地块里，家人送原料、取成品）';
    if (tabId === 'works' && it.id === 'wheel') return '水车和路灯（动力坝上的水车点亮附近的路灯）';
    if (tabId === 'works' && it.id === 'hive') return '养蜂（花甸或果园坡）';
    if (tabId === 'decor' && PFDecor.CATALOG[it.id] && PFDecor.CATALOG[it.id].light && it.id !== 'party') return '夜灯（接上水车的电，天一黑自己亮；没电时也能先摆着）';
    if (tabId === 'decor' && it.id === 'party') return '派对区（不定期的晚上一家人聚在这里，有时镇上的人来做客）';
    if (tabId === 'yard' && it.yard) { const k = window.PFYard && PFYard.ITEM[it.id] && PFYard.ITEM[it.id].kind; // v5.10.3
      return k === 'stall' ? '阿禾的小摊（摊子上的小改动，卖东西多一点、阿禾更开心）' : k === 'care' ? '动物照护（窝、刷子和盐砖，动物每晚更开心）' : '院子（家人自己铺路、装好，每样都有固定的地方）'; }
    if (tabId === 'decor') return '装饰（买了放进仓库，家人会找空地摆上；用「挪东西」可以换地方）';
    if (tabId === 'animals' && it.pet) return '小伙伴（猫猫狗狗，不吃干草）';
    if (tabId === 'animals' && it.farm) return '养殖（鸡在家门口，猪在林场边，羊在果园坡，牛在北牧场）';
    return '';
  }
  // v5.9.1: progressive shop: only what is buyable now and up to two unlock steps ahead; a tab with nothing to show yet is left out
  const AUTO_TIP = '打开后，钱多的时候家人每天最多替你买一样基础的东西（扩田、工具、鸡）。装饰、地块、建筑、镇公所的项目、学校、书屋、诊所、翻盖、铺路和农家乐、度假村、节日都不会碰。'; // v5.10.1; v5.10.7–v5.10.11
  const shown = id => !G.shopDepth || G.shopDepth(id) <= G.REVEAL_MAX;
  const tabShown = t => t.id === 'hall' ? !!(G.hallView && G.hallView() && G.hallView().open) : t.id === 'inn' ? !!(G.innView && G.innView() && G.innView().open) : t.id === 'tools' || t.id === 'land' || t.ids.some(shown);
  function drawShop(force) {
    const S = G.S, tabs = shopTabs().filter(tabShown);
    if (!tabs.some(t => t.id === shopTab)) shopTab = tabs[0].id;
    const PU = window.PFPlotsUI, PH = { costChip, priceChips };
    const key = [shopTab, !!S.autoBuy, JSON.stringify((S.homeyard && S.homeyard.put) || {}), tabs.map(t => t.id).join(''), S.coins, G.F.wood, S.family && S.family.kids ? S.family.kids.length : 0, S.fishFood, S.bugNet || 0, (S.pondFish || []).length, (S.ornament && S.ornament.goldfish) || 0, ...SIM.SHOP_IDS.map(k => S.up[k]), !!atlas, plotView, JSON.stringify(S.plots || {}), (S.family || {}).moved, S.members.length, S.animals.length, S.works ? JSON.stringify([S.works.works, S.works.hives.length, S.works.penHost]) : '', shopTab === 'hall' && S.town ? JSON.stringify([S.town.hall, S.decor.inv, S.decor.placed.length, S.coins, G.F && G.F.wood]) : '', shopTab === 'inn' && S.inn ? JSON.stringify([S.inn, S.coins, G.F && G.F.wood, S.town && S.town.hall]) : ''].join(','); // v5.6.0: what the phase-8 gates read; v5.10.7 inn
    if (!force && key === shopKey) return; shopKey = key;
    const tabBtns = tabs.map(t => `<button type="button" class="pbtn${t.id === shopTab ? ' on' : ''}" data-tab="${t.id}" title="${esc(t.title || t.name)}">${esc(t.name)}</button>`).join('');
    let h = `<div class="shead"><b>商店</b><span class="wallet">${costChip(S.coins, 'coin')}${costChip(G.F.wood, 'wood')}</span><button type="button" class="pbtn auto${S.autoBuy ? ' on' : ''}" data-a="autobuy" aria-pressed="${S.autoBuy ? 'true' : 'false'}" title="${AUTO_TIP}">家人帮忙添置 · ${S.autoBuy ? '开' : '关'}</button><button class="pbtn x" data-a="close" title="关闭（B）">✕</button></div><div class="tabs">${tabBtns}</div><div class="cards">`;
    const tab = tabs.find(t => t.id === shopTab) || tabs[0];
    let sec = '';
    if (plotView && PU) { shop.innerHTML = h + PU.detailHtml(plotView, PH) + '</div>'; return; } // v5.5.0
    let hidden = 0;
    for (const id of tab.ids) {
      if (!shown(id)) { hidden++; continue; }
      const o = SIM.offer(S.up, S.coins, id, G.F.wood), it = o.item, n = it.levels.length, lv = o.have;
      const s2 = sectionFor(it, tab.id); if (s2 && s2 !== sec) { sec = s2; h += `<div class="sec">${sec}</div>`; }
      const look = it.region ? `<button class="pbtn look" data-look="${id}">看看</button>` : PFWorld.PENS[id] ? `<button class="pbtn look" data-look="pen:${id}">看看</button>` : '';
      const now = id === 'rod' && lv === 0 ? '竹竿' : lv ? it.levels[lv - 1].label : '未购买';
      const yp = it.yard && S.homeyard && S.homeyard.put ? (S.homeyard.put[id] | 0) : lv, wait = it.yard && yp < lv ? ` · 家人还没弄好 ${lv - yp} 个（已好 ${yp}）` : ''; // v5.10.11.1
      const short = o.lockText ? `<span class="short lock">${esc(o.lockText)}</span>` : o.locked ? `<span class="short lock">先买${esc(SIM.shopItem(o.locked).name)}</span>` : o.ok ? '' : `<span class="short"><span class="lab">还差</span><span class="price">${o.short ? costChip(o.short, 'coin') : ''}${o.shortWood ? costChip(o.shortWood, 'wood') : ''}</span></span>`;
      h += `<div class="card${o.maxed ? ' max' : ''}" data-item="${id}">${icon(it.yard ? it.icon : id)}<div class="ct"><div><b>${it.name}</b> <span class="lv">${n > 1 ? `${lv}/${n}` : ''} ${esc(now)}${esc(wait)}</span></div>` +
        (o.maxed ? `<div class="d">已满级</div></div><div class="cb"><span class="done">✓</span></div>` :
          `<div class="d">下一级：${esc(o.level.label)} · ${esc(o.level.desc)}</div>${look}</div><div class="cb"><button class="pbtn" data-buy="${id}"${o.ok ? '' : ' disabled'}>${priceChips(o.cost, o.wood)}</button>${short}</div>`) + '</div>';
    }
    if (hidden) h += `<div class="more" title="还有 ${hidden} 项，等前面的东西买了、家里有了新变化就会出现">更多内容随进度解锁</div>`;
    if (tab.id === 'hall') h += hallHtml();
    if (tab.id === 'inn') h += innHtml();
    if (tab.id === 'land' && PU) h += PU.listHtml(PH); // v5.5.0: the outer ring
    if (tab.id === 'tools') {
      const FS = window.PFFish, food = FS && FS.FOOD, gf = FS && FS.ORN_BY && FS.ORN_BY.goldfish;
      const netPrice = (window.PFInsects && PFInsects.NET_PRICE) || 150;
      const netOwned = !!S.bugNet, netOk = !netOwned && S.coins >= netPrice, netShort = netOk || netOwned ? '' : `<span class="short"><span class="lab">还差</span><span class="price">${costChip(netPrice - S.coins, 'coin')}</span></span>`;
      h += `<div class="sec">院子</div>`;
      h += `<div class="card${netOwned ? ' max' : ''}" data-item="bugnet">${icon('bugnet')}<div class="ct"><div><b>捕虫网</b> <span class="lv">${netOwned ? '已有' : '未购买'}</span></div>` +
        (netOwned ? `<div class="d">买一次就留在家里。玩耍的孩子会自己带网去捉昆虫，看一眼再放走，记进图鉴</div></div><div class="cb"><span class="done">✓</span></div>` :
          `<div class="d">${netPrice} 金，买一次就留在家里。有网之后，孩子偶尔会自己去捉一只昆虫，记进图鉴的「昆虫」页，看完就放走，不能卖</div></div><div class="cb"><button class="pbtn" data-buy="bugnet"${netOk ? '' : ' disabled'}>${priceChips(netPrice, 0)}</button>${netShort}</div>`) + '</div>';
      h += `<div class="sec">池塘（鱼食买了以后家人会自己去撒；观赏鱼放进池塘只是看着玩）</div>`;
      if (food) {
        const maxed = S.fishFood >= food.stock, ok = !maxed && S.coins >= food.price, short = ok || maxed ? '' : `<span class="short"><span class="lab">还差</span><span class="price">${costChip(food.price - S.coins, 'coin')}</span></span>`;
        h += `<div class="card${maxed ? ' max' : ''}" data-item="fishfood">${icon('fishfood')}<div class="ct"><div><b>鱼食</b> <span class="lv">仓库 ${S.fishFood}/${food.stock}</span></div>` +
          (maxed ? `<div class="d">已经满了</div></div><div class="cb"><span class="done">✓</span></div>` :
            `<div class="d">${food.price} 金一包。家里有鱼食时，空闲的家人会自己去池塘撒一把，那天鲈鱼和锦鲤更容易上钩，常见鱼还在</div></div><div class="cb"><button class="pbtn" data-buy="fishfood"${ok ? '' : ' disabled'}>${priceChips(food.price, 0)}</button>${short}</div>`) + '</div>';
      }
      if (gf) {
        const held = ((S.ornament && S.ornament.goldfish) || 0) + (S.pondFish || []).filter(f => f.kind === 'goldfish').length;
        const pondN = (S.pondFish || []).length, maxed = (G.pondRoom ? G.pondRoom() <= 0 : pondN >= (FS.POND_CAP || 8)), ok = !maxed && S.coins >= gf.price, short = ok || maxed ? '' : `<span class="short"><span class="lab">还差</span><span class="price">${costChip(gf.price - S.coins, 'coin')}</span></span>`;
        h += `<div class="card${maxed ? ' max' : ''}" data-item="goldfish">${itemArt({ group: 'fish', id: 'goldfish' }, { fit: 32 })}<div class="ct"><div><b>金鱼</b> <span class="lv">池塘 ${pondN}/${FS.POND_CAP}</span></div>` +
          (maxed ? `<div class="d">池塘已经养满了（观赏鱼合计最多 ${FS.POND_CAP} 条），不会再扣金币</div></div><div class="cb"><span class="done">✓</span></div>` :
            `<div class="d">买好就会直接游进家门口的池塘，不用再点放养。观赏鱼只是看着玩，不再卖掉。海鱼不能放进淡水池塘</div></div><div class="cb"><button class="pbtn" data-buy="goldfish"${ok ? '' : ' disabled'}>${priceChips(gf.price, 0)}</button>${short}</div>`) + '</div>';
      }
    }
    shop.innerHTML = h + '</div>';
    if (shopFocus) { const el = shop.querySelector('[data-item="' + shopFocus + '"]'); if (el) el.scrollIntoView({ block: 'nearest' }); shopFocus = ''; }
  }
  // v5.10.0 镇公所的告示板: prosperity, the building projects (one at a time, done the next morning), gifts to the town
  function innHtml() { // v5.10.7 农家乐 shop tab; v5.10.8 adds the two-storey inn and the beach resort
    const v = G.innView && G.innView(); if (!v) return '';
    const stars = Math.max(1, Math.min(5, Math.round(v.stars || 3)));
    const starTxt = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    let h = '';
    h += `<div class="sec">农家乐区 · 民宿${v.inn2 ? ' · 二层客栈' : ''}</div>`; // v5.11.0.5: its own district by the town gate, no plot is rezoned
    if (!v.plot) h += `<div class="more">农家乐区在镇门口东大道两边，是一块专门的空地，不占家里的地块。先修好东大道、开了镇门，就能在这里盖小木屋和菜馆。</div>`;
    else h += `<div class="more">小木屋、二层客栈、农家菜馆和厨房都盖在镇门口的农家乐区（东大道北边是民宿，南边是菜馆和菜园），不用改建任何地块。小地图下面点「农家乐」就能过去看。</div>`;
    if (v.freed && v.freed.length) h += `<div class="more">民宿已经从「${esc(v.freed.join('、'))}」搬到农家乐区，原来那块地空出来了，可以在「地块」里免费改建一次。</div>`;
    h += `<div class="more">现在 ${v.cabins} / 4 间小木屋${v.inn2 ? '（每间可住两组）' : ''}，星级 ${starTxt}（${(v.stars || 3).toFixed ? (Math.round(v.stars * 10) / 10) : v.stars}）` +
      (v.staffed ? '，孩子在帮忙经营' : '') + (v.furnish ? '，木工家具让屋子更舒服' : '') +
      (v.guests && v.guests.length ? `，今天住着 ${v.guests.length} 组共 ${v.people} 人` : '，今天还没有客人') +
      `。房费和菜钱一共 ${v.earn.rooms + v.earn.meals} 金。</div>`;
    const jobName = { cabin: '小木屋', diner: '农家菜馆', kitchen: '厨房', inn2: '二层客栈', hut: '沙滩小屋', stall: '海鲜摊', pier: '游客栈桥', deck: '日落观景台' };
    if (v.job) h += `<div class="more">家人正在盖${jobName[v.job.id] || '这个项目'}，明天一早搭好。</div>`;
    const label = o => o.name || jobName[o.id] || '农家乐项目'; // v5.11.0.5: never a raw id (the kitchen card showed "kitchen")
    const desc = o => ({
      cabin: v.cabins ? '再加一间，16 点前从东大道来的客人可以多住一组。家人一天盖好。' : '第一间小木屋。客人晚上住在亮着灯的屋子里，走时按星级付房费。家人一天盖好。',
      diner: '农家乐区南边的农家菜馆。用家里种的菜做饭，按摊位价的 1.6 倍收。先摆 4 个座位、2 道菜，旁边还有一块菜园。',
      kitchen: '厨房升一级，多 2 道菜、多 4 个座位。一共可以升两级。',
      inn2: '把农家乐区的小木屋都加盖成二层客栈，每间多住一组客人。家人一天改好。',
      hut: '海边的沙滩小屋。度假村的客人只住这里，白天在沙滩上走、在伞下躺。家人一天盖好。',
      parasol: '一把遮阳伞。家人马上摆到沙滩上固定的位置，最多 8 把。',
      stall: '用家里钓的海鱼做海鱼烤和海鲜汤，收入算进菜馆。家人一天盖好。',
      pier: '游客在海上钓鱼，钓到的会放回去，不占家里的鱼。家人一天铺好。',
      deck: '傍晚 17 点到 19 点，海面和天空会暖起来，游客和家人会来坐着看落日。家人一天修好。',
    })[o.id] || '';
    const lvOf = o => o.id === 'cabin' ? v.cabins + '/4' : o.id === 'kitchen' ? v.diner + '/3' : o.id === 'inn2' ? (v.inn2 ? '已有' : '未盖')
      : o.id === 'diner' ? (v.diner ? '已有' : '未盖') : o.id === 'hut' ? (v.huts || 0) + '/4' : o.id === 'parasol' ? (v.parasols || 0) + '/8'
      : o.id === 'stall' ? (v.stall ? '已有' : '未盖') : o.id === 'pier' ? (v.pier ? '已有' : '未盖') : o.id === 'deck' ? (v.deck ? '已有' : '未盖') : '';
    const innIds = ['cabin', 'diner', 'kitchen', 'inn2'], resortIds = ['hut', 'parasol', 'stall', 'pier', 'deck'];
    const cards = (ids) => {
      let out = '';
      for (const o of v.offers.filter(x => ids.includes(x.id))) {
        const maxed = o.reason === 'full' || o.reason === 'done';
        const why = o.why && !maxed ? `<span class="short lock">${esc(o.why)}</span>` : '';
        const short = !o.ok && (o.shortGold || o.shortWood) && (o.reason !== 'locked' && o.why && (o.shortGold || o.shortWood))
          ? `<span class="short"><span class="lab">还差</span><span class="price">${o.shortGold ? costChip(o.shortGold, 'coin') : ''}${o.shortWood ? costChip(o.shortWood, 'wood') : ''}</span></span>` : why;
        out += `<div class="card${maxed ? ' max' : ''}" data-item="inn:${o.id}"><div class="ct"><div><b>${esc(label(o))}</b> <span class="lv">${lvOf(o)}</span></div>` +
          (maxed ? `<div class="d">${esc(o.why || '已满')}</div></div><div class="cb"><span class="done">✓</span></div>` :
            `<div class="d">${esc(desc(o))}</div></div><div class="cb"><button class="pbtn" data-inn="start:${o.id}"${o.ok ? '' : ' disabled'}>${priceChips(o.cost || 0, o.wood || 0)}</button>${short}</div>`) + '</div>';
      }
      return out;
    };
    h += cards(innIds);
    h += `<div class="sec">海边度假村${v.resortName ? ' · ' + esc(v.resortName) : ''}</div>`;
    if (!v.coast) h += `<div class="more">先在商店「地块」里买下海边。</div>`;
    if (!v.resort) h += `<div class="more">再把东南滩改建成度假村，才能在沙滩上盖小屋、摆伞。</div>`;
    h += `<div class="more">现在沙滩小屋 ${v.huts || 0} / 4，遮阳伞 ${v.parasols || 0} / 8` +
      (v.stall ? '，海鲜摊已开' : '') + (v.pier ? '，栈桥已铺' : '') + (v.deck ? '，观景台已修好' : '') + '。</div>';
    h += cards(resortIds);
    if (v.diner) {
      h += `<div class="sec">菜馆菜单（「我来挑」只上架仓库里做得出的菜；不够的会自动撤掉）</div>`;
      h += `<div class="card"><div class="ct"><div><b>点菜方式</b> <span class="lv">${v.auto ? '全自动' : '我来挑'}</span></div><div class="d">自动时家人用库存最多的原料做。一天两顿，住客每人两份，集市那天会多来几个散客。</div></div>` +
        `<div class="cb"><button type="button" class="pbtn" data-inn="mode">${v.auto ? '我来挑' : '改回自动'}</button></div></div>`;
      if (!v.auto) {
        for (const d of v.listed) {
          const on = Array.isArray(v.menu) && v.menu.includes(d.id);
          h += `<div class="card${d.can ? '' : ' max'}"><div class="ct"><div><b>${esc(d.name)}</b> <span class="lv">${d.pay} 金${d.special ? ' · 拿手菜' : ''}</span></div><div class="d">${d.can ? '仓库里的料够做' : '原料不够，会上架也做不了'}</div></div>` +
            `<div class="cb"><button type="button" class="pbtn${on ? ' on' : ''}" data-inn="dish:${d.id}"${v.auto ? ' disabled' : ''}>${on ? '已上架' : '上架'}</button></div></div>`;
        }
      } else {
        h += `<div class="more">今天会做：${v.listed.filter(d => v.today.includes(d.id)).map(d => d.name).join('、') || '仓库里暂时做不了菜'}</div>`;
      }
    }
    if (v.book && v.book.length) {
      h += `<div class="sec">留言本（最近 ${v.book.length} 条）</div>`;
      for (const b of v.book) h += `<div class="more">第 ${b.day} 天 · ${'★'.repeat(b.s || 3)}${b.note ? ' · ' + esc(b.note) : ''}</div>`;
    }
    return h;
  }
  function hallHtml() {
    const v = G.hallView(); if (!v) return '';
    const stars = '★'.repeat(v.lv) + '☆'.repeat(Math.max(0, 5 - v.lv));
    let h = `<div class="sec">繁荣度 <span class="stars" title="繁荣度 ${v.lv}">${stars}</span> ${esc(v.lvName)} · 镇上住着 ${v.people} 位邻居${v.next ? ` · 再盖 ${v.next.need} 座升到 ${v.lv + 1}` : ''}</div>`;
    h += `<div class="sec">建设项目（一次盖一座：付钱后木匠阿松搭脚手架，第二天一早盖好，新邻居搬进来）</div>`;
    for (const p of v.projects) {
      const st = p.built ? '已盖好' : p.building ? '正在盖' : '未开工', can = !p.why;
      const short = p.built || p.building ? '' : p.why === '金币不够' || p.why === '木材不够' ? `<span class="short"><span class="lab">还差</span><span class="price">${G.S.coins < p.cost ? costChip(p.cost - G.S.coins, 'coin') : ''}${G.F.wood < p.wood ? costChip(p.wood - G.F.wood, 'wood') : ''}</span></span>` : p.why ? `<span class="short lock">${esc(p.why)}</span>` : '';
      h += `<div class="card${p.built ? ' max' : ''}" data-item="hall:${p.id}">${icon('town')}<div class="ct"><div><b>${esc(p.name)}</b> <span class="lv">${st}</span></div><div class="d">${esc(p.desc)}</div></div><div class="cb">` +
        (p.built ? '<span class="done">✓</span>' : p.building ? '<span class="short">明天一早盖好</span>' : `<button class="pbtn" data-hall="start:${p.id}"${can ? '' : ' disabled'}>${priceChips(p.cost, p.wood)}</button>${short}`) + '</div></div>';
    }
    const m = G.marketView && G.marketView(); // v5.10.3 集市
    if (m) {
      h += `<div class="sec">集市（每 7 天一次：大人推车去广场摆摊，比自家摊子多卖一成半，抢手货多卖三成；离线的日子不算集市日）</div>`;
      h += `<div class="card" data-item="market">${icon('town')}<div class="ct"><div><b>${m.today ? '今天是集市日' : `下一次集市：第 ${m.next} 天`}</b> <span class="lv">抢手货：${esc(m.hot)}</span></div><div class="d">已经赶了 ${m.days} 次集，卖了 ${m.gold} 金，比自家摊子多赚 ${m.extra} 金</div></div><div class="cb">` +
        `<button class="pbtn" data-mk="mode">${m.pick ? '我来挑' : '全自动'}</button></div></div>`;
      if (m.pick) h += `<div class="mkpick">带去集市：` + m.kinds.map(k => `<button class="pbtn${m.take[k.id] ? ' on' : ' off'}" data-mk="take:${k.id}">${m.take[k.id] ? '✓ ' : ''}${esc(k.name)}${k.id === m.hotId ? '（抢手）' : ''}</button>`).join('') + `<div class="more">没勾的东西留在家里的摊子卖</div></div>`;
      else h += `<div class="more">全自动：篮子里能卖的都带去（加工坊要用的除外）。点「全自动」换成「我来挑」，自己选带哪几样。</div>`;
    }
    const b = G.bakeryView && G.bakeryView(); // v5.10.4 订单板
    if (b) {
      const st = b.done ? '今天的订单已经送到' : b.take ? `已接：${esc(b.text)}` : '还没接单';
      h += `<div class="sec">面包房订单（每天 2 单，接更划算的一单送到小桃店里，按单多付五成；不接也没有惩罚）</div>`;
      h += `<div class="card" data-item="bakery">${icon('town')}<div class="ct"><div><b>${st}</b> <span class="lv">已完成 ${b.days} 单，收了 ${b.gold} 金，多赚 ${b.extra} 金</span></div><div class="d">${b.open ? '面包房开门中（8:00–16:00）' : '面包房还没开门 / 已经打烊'}</div></div><div class="cb">` +
        `<button class="pbtn" data-bk="mode">${b.pick ? '我来挑' : '全自动'}</button></div></div>`;
      if (b.pick) h += `<div class="mkpick">今天的订单：` + b.offer.map(o => `<button class="pbtn${o.take ? ' on' : ' off'}" data-bk="take:${o.id}"${b.done ? ' disabled' : ''}>${o.take ? '✓ ' : ''}${esc(o.text)}（${o.pay} 金${o.have ? '' : ' · 原料不够'}）</button>`).join('') + `<div class="more">点一单接它。今天不点的话，家人仍会自动接更划算的一单。</div></div>`;
      else h += `<div class="more">全自动：家人接更能赚钱、而且家里有原料的那一单，跑腿送到面包房。点「全自动」换成「我来挑」。${b.offer.length ? '今天：' + b.offer.map(o => esc(o.text) + '（' + o.pay + ' 金）').join('；') : ''}</div>`;
    }
    const w = G.woodshopView && G.woodshopView(); // v5.10.5 木工坊
    if (w) {
      h += `<div class="sec">木工坊（仓库上限 +${w.bonus}，现在 ${w.cap}；木头多过 ${w.keep} 时阿松每天用 ${w.cost} 份做一张长椅）</div>`;
      h += `<div class="card" data-item="woodshop">${icon('town')}<div class="ct"><div><b>${w.auto ? '自动做家具' : '先留着木材'}</b> <span class="lv">已经做了 ${w.days} 张，用掉 ${w.used} 份木材</span></div><div class="d">${w.auto ? '木头够用的时候，阿松会做成街上的长椅（街上满了就放进仓库）' : '先把木头留着，镇上要盖东西时用得上'}</div></div><div class="cb">` +
        `<button class="pbtn" data-ws="mode">${w.auto ? '自动做家具' : '先留着木材'}</button></div></div>`;
    }
    const sm = G.smithyView && G.smithyView(); // v5.10.5 铁匠铺
    if (sm) {
      h += `<div class="sec">铁匠铺升级（一次性，每项 8,000–25,000 金；家人帮忙添置不会买）</div>`;
      for (const u of sm.items) {
        const st = u.maxed ? '已满级' : (u.max > 1 ? `${u.have}/${u.max}` : '未升级'), can = !u.why;
        const short = u.maxed ? '' : u.why === '金币不够' ? `<span class="short"><span class="lab">还差</span><span class="price">${costChip(u.cost - G.S.coins, 'coin')}</span></span>` : u.why ? `<span class="short lock">${esc(u.why)}</span>` : '';
        h += `<div class="card${u.maxed ? ' max' : ''}" data-item="smithy:${u.id}">${icon('town')}<div class="ct"><div><b>${esc(u.label)}</b> <span class="lv">${st}</span></div><div class="d">${esc(u.desc)}</div></div><div class="cb">` +
          (u.maxed ? '<span class="done">✓</span>' : `<button class="pbtn" data-sm="buy:${u.id}"${can ? '' : ' disabled'}>${priceChips(u.cost, 0)}</button>${short}`) + '</div></div>';
      }
    }
    const sc = v.school; // v5.10.9 学校扩建
    if (sc) h += `<div class="sec">学校操场（扩建以后，每 14 天一次运动会，孩子们赛跑，家人去看；上学日和好感翻倍）</div>` +
      `<div class="card" data-item="school">${icon('town')}<div class="ct"><div><b>${sc.sports ? '今天是运动会' : `下一次运动会：第 ${sc.next} 天`}</b></div><div class="d">9:00–15:00 在操场举行。林老师当裁判，书屋阿宁也会来看。</div></div></div>`;
    const lb = v.library; // v5.10.9 书屋
    if (lb) {
      const tips = (lb.hints || []).map(q => esc(q.name) + (q.hint ? '：' + esc(q.hint) : '')).join('；');
      h += `<div class="sec">书屋（孩子放学顺路看书，和阿宁的好感 +1；图鉴里还没收齐的条目，这里会给一点提示）</div>`;
      h += `<div class="card" data-item="library">${icon('town')}<div class="ct"><div><b>书屋阿宁的提示</b></div><div class="d">${tips || '图鉴里能提示的条目都看过了'}</div></div></div>`;
    }
    const cl = v.clinic; // v5.10.10 诊所
    if (cl) h += `<div class="sec">诊所（动物和猫狗心情下限 ${cl.floor}；每月一次体检，开心值 +。不做生病）${cl.paved ? ' · 路面已铺石板' : ''}</div>` +
      `<div class="card" data-item="clinic">${icon('town')}<div class="ct"><div><b>${cl.next ? `下一次体检：第 ${cl.next} 天` : '诊所已经开张'}</b></div><div class="d">苏大夫 8:00–17:00 在诊所。铺上石板要先把五座老房子都翻成二层。</div></div></div>`;
    const fs = v.festival; // v5.10.11 丰收节 + 灯会
    if (fs) {
      const title = fs.today ? '今天是丰收节' : `下一次丰收节：第 ${fs.next} 天`;
      const d = fs.lantern ? '晚上 18:00–22:00 广场摆长桌宴，19:00–22:00 石板路和广场挂灯笼办灯会。' : '晚上 18:00–22:00 广场摆长桌宴。灯会要等铁匠铺和木工坊都建好。';
      h += `<div class="sec">丰收节（繁荣度 5 以后每 28 天一次：一家人去广场吃长桌宴，当天按集市日结算。没有新的家务）</div>` +
        `<div class="card" data-item="festival">${icon('town')}<div class="ct"><div><b>${title}</b></div><div class="d">${d}镇上会自动送来一份薄礼 ${fs.gift} 金。</div></div></div>`;
    }
    h += `<div class="sec">送给镇上（装饰摆到主街边，灯天黑就亮，不用接电；主街还能摆 ${v.room} 件）</div>`;
    const rows = v.inv.map(o => ({ o, from: 'inv', label: `仓库里 ${o.n} 件` })).concat(v.placed.map(o => ({ o, from: 'yard', label: `院子里摆着 ${o.n} 件` })));
    if (!rows.length) h += `<div class="more">仓库和院子里还没有能送的装饰（派对区留在家里）</div>`;
    for (const { o, from, label } of rows) h += `<div class="card" data-item="gift:${from}:${o.id}">${icon(o.id)}<div class="ct"><div><b>${esc(o.name)}</b> <span class="lv">${label}</span></div><div class="d">${from === 'yard' ? '从院子里收一件送过去（院子里摆得太挤时正好）' : '从仓库拿一件送过去'}</div></div><div class="cb"><button class="pbtn" data-hall="give:${o.id}:${from === 'yard' ? o.u : ''}"${v.room > 0 ? '' : ' disabled'}>送给镇上</button></div></div>`;
    if (v.gifts.length) h += `<div class="more">主街上已经有 ${v.gifts.length} 件农场送的装饰</div>`;
    return h;
  }
  const toggleShop = (v, opt) => { shop.hidden = v === undefined ? !shop.hidden : !v; if (!shop.hidden) { menu.hidden = true; store.hidden = true; if ($('codex')) $('codex').hidden = true; if (opt && opt.tab) setShopTab(opt.tab); shopFocus = (opt && opt.focus) || ''; plotView = (opt && opt.plot) || ''; drawShop(true); if (G.noteShopOpened) G.noteShopOpened(); } };
  shop.addEventListener('click', e => {
    const el = e.target.closest('[data-buy],[data-a],[data-tab],[data-look],[data-plot],[data-plotlook],[data-pbuy],[data-pzone],[data-hall],[data-mk],[data-bk],[data-ws],[data-sm],[data-inn]'); if (!el || !shop.contains(el)) return;
    const d = el.dataset;
    if (d.a === 'close') toggleShop(false);
    if (d.a === 'autobuy') { G.setAutoBuy(!G.S.autoBuy); drawShop(true); return; } // v5.10.1
    if (d.tab) { setShopTab(d.tab); plotView = ''; drawShop(true); }
    if (d.a === 'back') { const was = plotView; plotView = ''; shopFocus = 'plot:' + was; drawShop(true); }
    if (d.plot) { plotView = d.plot; drawShop(true); shop.scrollTop = 0; }
    if (d.plotlook) { const p = PFPlots.plot(d.plotlook); G.panTo((p.rect[0] + p.rect[2]) / 2, (p.rect[1] + p.rect[3]) / 2); toggleShop(false); }
    if (d.pbuy || d.pzone) { const [pid, mod] = (d.pbuy || d.pzone).split(':'), r = d.pbuy ? G.buyPlot(pid, mod) : G.rezonePlot(pid, mod); drawShop(true); if (!r.ok) el.classList.add('shake'); }
    if (d.look) { const P = d.look.startsWith('pen:') && PFWorld.PENS[d.look.slice(4)], r = P ? { center: { x: P.bld.x + 12, y: P.bld.y + 14 } } : PFWorld.region(d.look); G.panTo(r.center.x, r.center.y); toggleShop(false); }
    if (d.buy) { const r = G.buy(d.buy); drawShop(true); if (!r.ok) { el.classList.add('shake'); if (r.why) dispatchEvent(new CustomEvent('pf:say', { detail: r.why })); } }
    if (d.mk) { const [a, k] = d.mk.split(':'); if (a === 'mode') G.setMarketPick(!G.marketView().pick); else G.setMarketPick(null, k); drawShop(true); return; } // v5.10.3
    if (d.bk) { const [a, k] = d.bk.split(':'); if (a === 'mode') G.setBakeryPick(!G.bakeryView().pick); else G.setBakeryPick(null, k); drawShop(true); return; } // v5.10.4
    if (d.ws) { if (d.ws === 'mode') G.setWoodshopAuto(!G.woodshopView().auto); drawShop(true); return; } // v5.10.5
    if (d.sm) { const [a, id] = d.sm.split(':'); if (a === 'buy') { const r = G.smithyBuy(id); drawShop(true); if (!r.ok) el.classList.add('shake'); } return; } // v5.10.5
    if (d.hall) { const [a, id, u] = d.hall.split(':'), r = a === 'start' ? G.hallStart(id) : G.hallGive(id, u === '' || u === undefined ? undefined : +u); drawShop(true); if (!r.ok) el.classList.add('shake'); } // v5.10.0
    if (d.inn) { const [a, id] = d.inn.split(':'); if (a === 'start') { const r = G.innStart(id); drawShop(true); if (!r.ok) el.classList.add('shake'); } else if (a === 'mode') { const v = G.innView(); G.setInnMenu(v && v.auto ? [] : 'auto'); drawShop(true); } else if (a === 'dish') { const v = G.innView(); const cur = Array.isArray(v.menu) ? v.menu.slice() : v.listed.filter(d => d.can).map(d => d.id); const i = cur.indexOf(id); if (i >= 0) cur.splice(i, 1); else if (cur.length < v.dishes) cur.push(id); G.setInnMenu(cur.length ? cur : 'auto'); drawShop(true); } } // v5.10.7
  });
  $('shopBtn').addEventListener('click', () => toggleShop());
  G.openPlot = id => toggleShop(true, { tab: 'land', plot: id }); // v5.5.0: the plot labels on the map
  G.openHall = () => toggleShop(true, { tab: 'hall' }); // v5.10.0: the notice board in the town
  G.openInn = () => toggleShop(true, { tab: 'inn' }); // v5.10.7

  const store = $('store'); let storeKey = '';
  function rowIcon(row) {
    const id = row.id || row.type;
    const art = itemArt(row, { fit: 32 });
    if (art && art !== '<i></i>') return art;
    if (row.kind === 'seed' || (id && SIM.CROPS[id])) return cropIcon(id);
    if (id && FRUIT_ICON[id]) return `<i style="background:url(${FRUIT_ICON[id]});background-size:32px;image-rendering:pixelated"></i>`;
    if (id === 'wood') return `<i style="background:url(${FRUIT_ICON.wood});background-size:32px;image-rendering:pixelated"></i>`;
    if (id === 'hay') return icon('hay');
    if (id === 'fishfood' || id === 'fishFood') return icon('fishfood');
    if (id === 'bugnet' || id === 'net') return icon('bugnet');
    if (id === 'goldfish' || id === 'koi') return icon(id);
    if (id === 'flower') return icon('flower');
    if (hasIcon(id)) return icon(id);
    return '<i></i>';
  }
  // v5.3.1: with an axe and 林场, the family keeps the storehouse topped up to what the next build needs
  const autoWood = () => { const a = G.woodAuto && G.woodAuto(); return a && a.on ? `；木材少于 ${a.target} 份时，农夫会自己去林场砍树` : ''; };
  function storeCard(row, extra) {
    const gold = row.gold ? costChip(row.gold, 'coin') : (row.unit != null && row.kind === 'seed' ? `收购 ${costChip(row.unit, 'coin')}` : '');
    const unit = row.n && row.unit && row.gold ? `×${row.unit}` : '';
    const rc = rarityClass(row);
    return `<div class="card ${rc}">${rowIcon(row)}<div class="ct"><div><b class="${rc}">${esc(row.name)}</b>${row.surprise ? ' <span class="lv">惊喜</span>' : ''}</div>${extra || ''}</div><div class="cb"><span>${row.n != null ? row.n : ''}</span>${gold ? `<span class="u">${unit ? unit + ' · ' + gold : gold}</span>` : ''}</div></div>`;
  }
  function drawStore(force) {
    const S = G.S, data = G.storehouse(), key = JSON.stringify(data) + !!atlas;
    if (!force && key === storeKey) return; storeKey = key;
    const cards = rows => rows.map(r => storeCard(r)).join('') || '<div class="empty">空空的</div>';
    let h = `<div class="shead"><b>仓库</b><span class="wallet">今日可卖 ${costChip(data.sellGold, 'coin')}</span><button class="pbtn x" data-a="close" title="关闭（I / Esc）">✕</button></div>`;
    h += `<div class="sec">仓库种子</div><div class="cards">${cards(data.store)}</div>`;
    h += `<div class="sec">随身种子</div><div class="cards">${cards(data.bag)}</div>`;
    if (data.familyBag.length) h += `<div class="sec">家人身上的种子</div><div class="cards">${cards(data.familyBag)}</div>`;
    h += `<div class="sec">篮子（按今日行情）</div>`;
    if (!data.baskets.length) h += '<div class="empty">篮子是空的</div>';
    else for (const b of data.baskets) { h += (data.baskets.length > 1 || b.who !== '农夫' ? `<div class="who">${esc(b.who)}</div>` : '') + `<div class="cards">${b.rows.map(r => storeCard(r)).join('')}</div>`; }
    h += `<div class="sec">材料</div><div class="cards">`;
    h += storeCard({ id: 'wood', kind: 'item', name: `木材（${data.wood.n}/${data.wood.cap}）`, n: data.wood.n, unit: data.wood.unit, gold: data.wood.gold }, data.wood.spare ? `<div class="d">仓库放得下 ${data.wood.cap} 份，多出 ${data.wood.spare} 份可卖</div>` : `<div class="d">扩建房子和围篱笆要用，满了才拿去卖（${data.wood.unit} 金一份）${autoWood()}</div>`);
    h += storeCard({ id: 'hay', kind: 'item', name: '干草', n: data.hay.n }, `<div class="d">喂动物用，集市 ${data.hay.unit} 金一捆</div>`);
    h += storeCard({ id: 'fishfood', kind: 'item', name: '鱼食', n: data.fishFood.n }, `<div class="d">家里有鱼食时，空闲的家人会自己去池塘撒一把，那天稀有鱼更容易上钩（${data.fishFood.unit} 金一包）</div>`);
    for (const r of (data.ornament || [])) h += storeCard(r, '<div class="d">用右下角的放养按钮，放到家门口池塘里看着玩，不再卖掉</div>');
    if (data.pondFish) h += storeCard({ id: 'koi', kind: 'item', name: '池塘里的观赏鱼', n: data.pondFish }, '<div class="d">在家门口的池塘里游，只是给人看</div>');
    for (const r of data.saplings) h += storeCard(r, '<div class="d">用右下角的种树按钮指定位置</div>');
    h += '</div>';
    store.innerHTML = h;
  }
  const toggleStore = v => { store.hidden = v === undefined ? !store.hidden : !v; if (!store.hidden) { menu.hidden = true; shop.hidden = true; if ($('codex')) $('codex').hidden = true; drawStore(true); } };
  store.addEventListener('click', e => { const d = e.target && e.target.dataset; if (d && d.a === 'close') toggleStore(false); });
  $('storeBtn').addEventListener('click', () => toggleStore());
  $('storeHud').addEventListener('click', () => toggleStore(true));
  if ($('woodHud')) $('woodHud').addEventListener('click', () => toggleStore(true));
  addEventListener('pointerdown', e => {
    if (store.hidden) return;
    if (store.contains(e.target) || $('storeBtn').contains(e.target) || $('storeHud').contains(e.target) || ($('woodHud') && $('woodHud').contains(e.target))) return;
    toggleStore(false);
  });
  addEventListener('keydown', e => { if (e.target && /^(TEXTAREA|INPUT)$/.test(e.target.tagName)) return;
    if (e.key === 'b' || e.key === 'B') toggleShop();
    if (e.key === 'i' || e.key === 'I') toggleStore();
    if (e.key === 'j' || e.key === 'J') toggleCodex();
    if (e.key === 'Escape') { toggleShop(false); toggleStore(false); toggleCodex(false); if (!menu.hidden) menu.hidden = true; if (loveTip) loveTip.hidden = true; const cb = $('career'); if (cb && !cb.hidden) closeCareer(true); } });

  // ---- v5.4.0 collection book: 图鉴 / 成就 / 里程碑, next to the storehouse button ----
  const codexEl = $('codex');
  let codexTab = 'book', codexKey = '', codexFocus = '';
  function cellArt(it, seen) {
    if (it.group === 'fish') return itemArt(it, { seen, w: 72 });
    if (it.group === 'rare') return itemArt(it, { seen, w: 48 });
    const INS = window.PFInsects;
    if (it.group === 'bug' && INS && INS.bugURL) {
      const url = seen ? INS.bugURL(it.id, true) : INS.silURL(it.id);
      return url ? icoTag(url, 'bug', 72, 72) : '<i class="ico"></i>';
    }
    if (it.group === 'glow' || it.group === 'giant') return decorateCrop(it.type, it.group, seen);
    if (it.group === 'decor' && DART()) { const url = DART().bookURL(it.id, seen); return url ? icoTag(url, 'decor', 72, 72) : '<i class="ico"></i>'; } // v5.7.0: 36px art at 2x, like fish and bugs
    return itemArt(it, { seen, fit: 32 }) || '<i class="ico"></i>';
  }
  function drawCodex(force) {
    if (!codexEl || !BOOK) return;
    const S = G.S, key = [codexTab, S.day, JSON.stringify(S.codex), (S.achievements || []).length, (S.milestones || []).length, codexFocus].join('|');
    if (!force && key === codexKey) return; codexKey = key;
    const tabs = [{ id: 'book', name: '图鉴' }, { id: 'ach', name: '成就' }, { id: 'ms', name: '里程碑' }];
    let h = `<div class="shead"><b>图鉴</b><button class="pbtn x" data-a="close" title="关闭（J / Esc）">✕</button></div>`;
    h += `<div class="tabs">${tabs.map(t => `<button type="button" class="pbtn${t.id === codexTab ? ' on' : ''}" data-tab="${t.id}">${esc(t.name)}</button>`).join('')}</div>`;
    if (codexTab === 'book') {
      const groups = BOOK.groups();
      let detail = '';
      if (codexFocus && BOOK.entryOf(S.codex, codexFocus)) {
        const e = BOOK.entryOf(S.codex, codexFocus);
        const item = groups.flatMap(g => g.items).find(it => it.key === codexFocus);
        detail = `<div class="detail">${esc((item && item.name) || '图鉴')}：${BOOK.dayLabel(e.firstDay)}第一次遇到，一共遇到 ${e.count} 次</div>`;
      } else detail = '<div class="detail">点开见到过的格子，能看到第一次是第几天、一共遇到几次。没见过的只显示剪影。</div>';
      h += detail;
      for (const g of groups) {
        h += `<div class="sec">${esc(g.name)}${g.later ? '（以后）' : ''}</div>`;
        if (!g.items.length) { h += '<div class="empty">以后会在这里记下捡到的装饰。</div>'; continue; }
        h += '<div class="grid">';
        for (const it of g.items) {
          const e = BOOK.entryOf(S.codex, it.key);
          const tier = BOOK.rarityOf ? BOOK.rarityOf(it) : (it.rarity || 'common');
          if (e) h += `<button type="button" class="cell r-${esc(tier)}${codexFocus === it.key ? ' on' : ''}" data-key="${it.key}">${cellArt(it, true)}<span class="nm">${esc(it.name)}</span></button>`;
          else h += `<div class="cell locked" data-lock="${it.key}">${cellArt(it, false)}<span class="nm">？</span></div>`;
        }
        h += '</div>';
      }
    } else if (codexTab === 'ach') {
      const have = Object.fromEntries((S.achievements || []).map(u => [u.id, u]));
      h += '<div class="cards">';
      for (const a of BOOK.ACHIEVEMENTS) {
        const u = have[a.id];
        if (u) h += `<div class="card"><span class="badge">★</span><div class="ct"><div class="nm">${esc(a.name)}</div><div class="hint">${esc(a.hint)}</div></div><span class="when">${esc(BOOK.dayLabel(u.day))}</span></div>`;
        else h += `<div class="card locked"><span class="badge">☆</span><div class="ct"><div class="nm">${esc(a.name)}</div><div class="hint">${esc(a.hint)}${a.later ? ' · 以后才能达成' : ''}</div></div></div>`;
      }
      h += '</div>';
    } else {
      const have = Object.fromEntries((S.milestones || []).map(u => [u.id, u]));
      h += '<div class="cards">';
      for (const m of BOOK.MILESTONES) {
        const u = have[m.id];
        if (u) h += `<div class="card"><span class="badge">●</span><div class="ct"><div class="nm">${esc(m.name)}</div></div><span class="when">${esc(BOOK.dayLabel(u.day))}</span></div>`;
        else h += `<div class="card locked"><span class="badge">○</span><div class="ct"><div class="nm">？</div><div class="hint">${esc(m.hint)}</div></div></div>`;
      }
      h += '</div>';
    }
    codexEl.innerHTML = h;
  }
  const toggleCodex = v => { if (!codexEl) return; codexEl.hidden = v === undefined ? !codexEl.hidden : !v; if (!codexEl.hidden) { menu.hidden = true; shop.hidden = true; store.hidden = true; drawCodex(true); } };
  if (codexEl) {
    codexEl.addEventListener('click', e => {
      const el = e.target.closest('[data-a],[data-tab],[data-key]'); if (!el || !codexEl.contains(el)) return;
      const d = el.dataset;
      if (d.a === 'close') toggleCodex(false);
      if (d.tab) { codexTab = d.tab; drawCodex(true); }
      if (d.key) { codexFocus = d.key; drawCodex(true); }
    });
    if ($('codexBtn')) $('codexBtn').addEventListener('click', () => toggleCodex());
    addEventListener('pointerdown', e => {
      if (!codexEl || codexEl.hidden) return;
      if (codexEl.contains(e.target) || ($('codexBtn') && $('codexBtn').contains(e.target))) return;
      toggleCodex(false);
    });
  }

  // ---- big map: minimap toggle, chop / transplant tools, short messages ----
  const mm = $('minimap'); if (localStorage.getItem('mouzhi/pixel-farm:ui:map') === '0') mm.hidden = true;
  const toggleMap = () => { mm.hidden = !mm.hidden; try { localStorage.setItem('mouzhi/pixel-farm:ui:map', mm.hidden ? '0' : '1'); } catch (e) {} G.minimapDraw(); };
  $('mapBtn').addEventListener('click', toggleMap);
  let toolKey = '';
  function tools() {
    const S = G.S, F = G.F, m = G.input, chop = S.eff.axe; // v5.0: any wild tree at home or in a bought region
    const koiN = G.ornamentHeld ? G.ornamentHeld('koi') : 0, gfN = G.ornamentHeld ? G.ornamentHeld('goldfish') : 0;
    const sprN = S.works ? S.works.sprinklers.length : 0; // v5.6.0
    const DCm = window.PFDecor, D = S.decor, free = id => (D.inv[id] | 0) - D.orders.filter(q => q.op === 'place' && q.id === id).length; // v5.7.0
    const deco = DCm && D ? DCm.IDS.filter(id => free(id) > 0) : [], movN = G.movables ? G.movables().length : 0, ordN = D ? D.orders.filter(q => q.mine).length : 0;
    const key = [chop, F.saplings.apple, F.saplings.orange, (F.saplings.apple || F.saplings.orange) && G.plantRoom ? G.plantRoom() : 1, koiN, gfN, m.mode, m.kind, S.orders.length, sprN, deco.map(id => id + free(id)).join(';'), movN, ordN].join(',');
    if (key === toolKey) return; toolKey = key;
    let h = '';
    if (chop) h += `<button class="pbtn${m.mode === 'chop' ? ' on' : ''}" data-m="chop" title="点家门口或已买区域里的野树标记要砍，再点一次取消（Esc 退出）。只有林场的树会长回来，别处砍掉就没了（会得到树苗）">砍树</button>`;
    const room = !(F.saplings.apple || F.saplings.orange) || !G.plantRoom || G.plantRoom(); // v5.9.1: say so when there is no grass left for a sapling
    for (const k of PFWorld.FRUIT_IDS) if (F.saplings[k]) h += `<button class="pbtn${m.mode === 'plant' && m.kind === k ? ' on' : ''}${room ? '' : ' full'}" data-m="plant" data-k="${k}" title="${room ? '点一块空草地，农夫会去种（Esc 退出）' : G.PLANT_FULL}">种${PFWorld.FRUIT[k].name} ${F.saplings[k]}${room ? '' : '（没地方了）'}</button>`;
    if (koiN) h += `<button class="pbtn${m.mode === 'release' && m.kind === 'koi' ? ' on' : ''}" data-m="release" data-k="koi" title="把篮子里的一条锦鲤直接放进家门口的池塘。放进去就不再卖掉。海鱼不能放进淡水池塘">放养锦鲤 ${koiN}</button>`;
    if (gfN) h += `<button class="pbtn${m.mode === 'release' && m.kind === 'goldfish' ? ' on' : ''}" data-m="release" data-k="goldfish" title="池塘有空位时，把仓库里的金鱼放进去">放养金鱼 ${gfN}</button>`;
    for (const id of deco) h += `<button class="pbtn${m.mode === 'decor' && m.kind === id ? ' on' : ''}" data-m="decor" data-k="${id}" title="点一块草地（亮绿色就能放），家人会从仓库搬过去（Esc 退出）。不放也没关系，家人会自己找地方摆上">摆${DCm.CATALOG[id].name} ${free(id)}</button>`;
    if (movN) h += `<button class="pbtn${m.mode === 'move' ? ' on' : ''}" data-m="move" title="先点要挪的东西（装饰、派对区、加工坊、蜂箱、浇水器；老房子不能挪），再点新位置，家人会搬过去（Esc 退出）">挪东西</button>`;
    if (ordN) h += `<button class="pbtn" data-m="clearmove" title="取消还没搬完的摆放和挪动">要搬的 ${ordN} ✕</button>`;
    const n = S.orders.length; if (n) h += `<button class="pbtn" data-m="clear" title="取消全部砍树、种树和放养指令">指令 ${n} ✕</button>`;
    $('tools').innerHTML = h; $('tools').hidden = !h;
  }
  $('tools').addEventListener('click', e => { const d = e.target.dataset; if (!d || !d.m) return;
    if (d.m === 'clear') { G.S.orders.length = 0; G.setMode(null); G.saveNow(); }
    else if (d.m === 'release') { const r = G.orderRelease(d.k); G.setMode(null); dispatchEvent(new CustomEvent('pf:say', { detail: r.ok ? '游进了家门口的池塘' : r.why })); G.saveNow(); }
    else if (d.m === 'clearmove') { G.clearMoves(); G.setMode(null); G.saveNow(); } // v5.7.0
    else if (d.m === 'plant' && G.plantRoom && !G.plantRoom()) { G.setMode(null); dispatchEvent(new CustomEvent('pf:say', { detail: G.PLANT_FULL })); } // v5.9.1
    else if (G.input.mode === d.m && (!d.k || G.input.kind === d.k)) G.setMode(null); else G.setMode(d.m, d.k); tools(); });
  let sayT = 0; addEventListener('pf:say', e => { const b = $('say'); b.textContent = e.detail; b.hidden = false; clearTimeout(sayT); sayT = setTimeout(() => { b.hidden = true; }, 2200); });
  addEventListener('pf:mode', () => tools());
  addEventListener('keydown', e => { if (e.target && /^(TEXTAREA|INPUT)$/.test(e.target.tagName)) return; if (e.key === 'm' || e.key === 'M') toggleMap(); });
  // locked regions get a crisp label over their sign: name, price, and a click opens the shop
  const labs = {}; for (const r of PFWorld.REGIONS) { const d = document.createElement('div'); d.className = 'rlab panel'; d.hidden = true;
    d.innerHTML = `未解锁 · ${esc(r.name)}<br>${costChip(SIM.shopItem(r.id).levels[0].cost, 'coin')} · 商店购买`; d.title = r.desc; d.addEventListener('click', () => toggleShop(true, { tab: 'land', focus: r.id })); $('rlabs').appendChild(d); labs[r.id] = d; }
  (function place() { const S = G.S, vw = innerWidth, vh = innerHeight;
    for (const r of PFWorld.REGIONS) { const d = labs[r.id]; if (S.eff.regions.includes(r.id)) { d.hidden = true; continue; }
      const c = G.toClient(r.sign.x, r.sign.y), on = c.x > 90 && c.x < vw - 90 && c.y - 52 > 64 && c.y < vh - 64; // keep clear of the HUD panels at the top and bottom
      d.hidden = !on; if (on) { d.style.left = Math.round(c.x) + 'px'; d.style.top = Math.round(c.y - 52) + 'px'; } }
    requestAnimationFrame(place); })();
  // ---- save menu ----
  const menu = $('menu');
  let resetArm = 0, mode = '';
  const ago = t => { if (!t) return '还没保存'; const s = Math.round((Date.now() - t) / 1000); return s < 5 ? '刚刚' : s < 60 ? `${s} 秒前` : `${Math.round(s / 60)} 分钟前`; };
  const NOTES = { 'restored-from-backup': '主存档读不出来，已从备份恢复。', 'main-corrupt': '主存档损坏，已另存一份留档。', 'backup-corrupt': '备份存档损坏，已另存一份留档。',
    'newer-save': '这台浏览器里有更新版本的存档，本页面不会覆盖它，请强制刷新（Ctrl+Shift+R）。', 'storage-unavailable': '浏览器不允许本地存储（比如无痕模式），进度不会保存。' };
  const L = window.PFPlaylog;
  const agoSync = t => { if (!t) return '还没同步'; const s = Math.round((Date.now() - t) / 1000); return s < 5 ? '刚刚' : s < 60 ? `${s} 秒前` : `${Math.round(s / 60)} 分钟前`; };
  function hintSync() {
    const b = $('syncHint'); if (!b || !L) return;
    const st = L.status();
    b.hidden = !st.needGesture;
  }
  function syncLine() {
    if (!L) return '';
    const st = L.status();
    if (!st.supported) return `<div class="note">当前浏览器不能把文件写到本机文件夹（Chrome 可以）。可以用「导出游玩记录」下载 JSON。</div>`;
    if (st.granted) return `<div class="note">已同步到本机「${esc(st.dirName || '文件夹')}」· <span id="syncAgo">${agoSync(st.lastSyncAt)}</span>${st.lastError ? ` <span class="bad">上次出错：${esc(st.lastError)}</span>` : ''}</div>`;
    if (st.needGesture) return `<div class="note">本地同步需要点一下重新授权。</div>`;
    return `<div class="note">选一个本机文件夹后，存档和游玩记录会自动写进去（建议放在「文稿 / pixel-farm-sync」）。</div>`;
  }
  function syncButtons() {
    if (!L) return '';
    const st = L.status();
    let h = `<div class="row">`;
    if (st.supported && !st.granted && !st.needGesture) h += `<button class="pbtn" data-a="syncpick">同步到本地文件夹…</button>`;
    if (st.supported && st.granted) h += `<button class="pbtn" data-a="syncpick">更换本地文件夹…</button>`;
    if (st.needGesture) h += `<button class="pbtn" data-a="syncresume">点此恢复本地同步</button>`;
    if (st.granted) h += `<button class="pbtn" data-a="syncnow">立即同步</button><button class="pbtn" data-a="syncstop">停止本地同步</button>`;
    h += `<button class="pbtn" data-a="exportlog">导出游玩记录</button></div>`;
    return h;
  }
  function drawMenu() {
    const st = G.SAVE;
    let h = `<div>${st.error ? `<span class="bad">保存失败：${esc(st.error)}</span>` : `已自动保存 · <span id="ago">${ago(st.at)}</span>`}</div>`;
    h += st.notes.map(n => `<div class="note bad">${NOTES[n] || esc(n)}</div>`).join('');
    h += `<div class="note">每天早上、每 15 秒、切走或关闭页面时自动保存在这个浏览器里。离开时按在线 50% 的速度结算金币，最多算 3 天。</div>`;
    h += `<div class="row"><button class="pbtn" data-a="export">导出存档</button><button class="pbtn" data-a="import">导入存档</button><button class="pbtn warn" data-a="reset">${resetArm > Date.now() ? '再点一次确认重置' : '重置'}</button></div>`;
    h += syncLine() + syncButtons();
    if (mode === 'export') h += `<textarea id="io" readonly>${esc(SAVE.encode(G.snapshot()))}</textarea><div class="row"><button class="pbtn" data-a="copy">复制</button><span class="note" id="msg">复制后可以在别的浏览器里导入</span></div>`;
    if (mode === 'import') h += `<textarea id="io" placeholder="把导出的存档文字粘贴到这里"></textarea><div class="row"><button class="pbtn" data-a="check">检查</button><span class="note" id="msg"></span></div>`;
    if (resetArm > Date.now()) h += `<div class="note bad">重置会从第 1 天重新开始；当前存档会另存一份留底。游玩记录会留着，另起一个农场时间线。</div>`;
    menu.innerHTML = h;
  }
  let pending = null;
  menu.addEventListener('click', e => {
    const a = e.target && e.target.dataset && e.target.dataset.a; if (!a) return;
    if (a === 'export') { mode = mode === 'export' ? '' : 'export'; G.saveNow(); drawMenu(); }
    else if (a === 'import') { mode = mode === 'import' ? '' : 'import'; pending = null; drawMenu(); }
    else if (a === 'copy') { const io = $('io'); io.select(); (navigator.clipboard ? navigator.clipboard.writeText(io.value) : Promise.reject()).then(() => $('msg').textContent = '已复制', () => { document.execCommand && document.execCommand('copy'); $('msg').textContent = '已选中，按 Ctrl+C 复制'; }); }
    else if (a === 'check') {
      try { pending = SAVE.decode($('io').value); $('msg').innerHTML = `第 ${pending.clock.day} 天 · ${pending.coins} 金 · 保存于 ${new Date(pending.savedAt).toLocaleString()} <button class="pbtn warn" data-a="doimport">确认导入（覆盖当前进度）</button>`; }
      catch (err) { pending = null; $('msg').innerHTML = `<span class="bad">${esc(err.message)}</span>`; }
    }
    else if (a === 'doimport' && pending) { pending.savedAt = Date.now(); const r = G.importState(pending); if (!r.ok) $('msg').innerHTML = `<span class="bad">导入失败：${esc(r.error)}</span>`; }
    else if (a === 'reset') { if (resetArm > Date.now()) G.reset(); else { resetArm = Date.now() + 4000; drawMenu(); setTimeout(() => { if (!menu.hidden) drawMenu(); }, 4100); } }
    else if (a === 'syncpick' && L) { L.pickDir().then(() => { drawMenu(); hintSync(); }).catch(err => { if (err && err.name === 'AbortError') return; drawMenu(); }); }
    else if (a === 'syncresume' && L) { L.resumeDir().then(() => { drawMenu(); hintSync(); }); }
    else if (a === 'syncnow' && L) { G.saveNow(); L.syncNow('manual').then(() => drawMenu()); }
    else if (a === 'syncstop' && L) { L.forgetDir().then(() => { drawMenu(); hintSync(); }); }
    else if (a === 'exportlog' && L) { L.downloadLog(G.version); }
  });
  $('menuBtn').addEventListener('click', () => { menu.hidden = !menu.hidden; if (!menu.hidden) { shop.hidden = true; store.hidden = true; } mode = ''; resetArm = 0; if (!menu.hidden) drawMenu(); });
  if ($('syncHint') && L) $('syncHint').addEventListener('click', () => { L.resumeDir().then(() => { hintSync(); if (!menu.hidden) drawMenu(); }); });
  hintSync();
  // ---- offline summary ----
  const dur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h} 小时 ${m} 分` : m ? `${m} 分钟` : `${s} 秒`; };
  const OFFLINE_POP_SEC = 600; // v5.9.1: the welcome-back box only after 10 minutes away
  function showOffline(r) {
    if (!r || !(r.awaySec >= OFFLINE_POP_SEC) || !(r.days > 0)) return; const box = $('offline'); // v5.9.1: a short break only gets the log line (离线期间赚了…); v5.10.1: so does a used-up 24-hour window
    const first = r.limited ? `离开了 ${dur(r.awaySec)}，折合 ${r.asked} 天；过去 24 小时已经结算过 ${r.used} 天，这次按 ${r.days} 天算`
      : `离开了 ${dur(r.awaySec)}，按在线 50% 的速度折合 ${r.days} 天${r.capped ? '（已到 3 天上限）' : ''}`;
    box.innerHTML = `<h3>欢迎回来</h3><div>${first}</div>` +
      (r.avg > 0 ? `<div>最近日均 ${r.avg} 金 → 获得 <b style="color:#ffd76a">${r.gold} 金</b></div>` : `<div>还没有完整一天的收入记录，这次没有离线收益</div>`) +
      (r.wood > 0 ? `<div>家人在林场砍了 <b style="color:#e0b880">${r.wood} 份木材</b></div>` : '') +
      (r.rain ? `<div>这天下过小雨，田都湿了</div>` : '') +
      (r.limited && r.nextText ? `<div class="offnote" style="font-size:11px;opacity:.75">每 24 小时最多结算 3 天离线收益，${r.nextText} 以后再满</div>` : '') +
      `<div class="row" style="justify-content:center;display:flex;margin-top:8px"><button class="pbtn" id="offOk">好的</button></div>`;
    box.hidden = false; $('offOk').onclick = () => { box.hidden = true; };
  }
  addEventListener('pf:offline', e => showOffline(e.detail));
  showOffline(G.SAVE.offline);
  const loveHud = $('loveHud'), loveTip = $('loveTip'), loveIco = $('loveIco');
  if (loveIco) { loveIco.style.backgroundImage = 'url(' + ICONS.heart + ')'; loveIco.style.backgroundRepeat = 'no-repeat'; }
  function placeLoveTip() { if (loveTip) loveTip.style.top = ''; } // v5.1.2: tip sits in the left dock under the HUD, no floating offset
  // v5.9.0: who the children are close to and the neighbours the family knows (it only grows: school, visits, parties)
  const hearts5 = v => { const n = Math.max(0, Math.min(5, Math.round((v | 0) / 20))); return '<span class="rh">' + '♥'.repeat(n) + '<i>' + '♥'.repeat(5 - n) + '</i></span>'; };
  function innBookHtml() { // v5.10.7: stars + guestbook in the family panel
    const v = G.innView && G.innView(); if (!v || !v.plot) return '';
    const s = Math.max(1, Math.min(5, Math.round(v.stars || 3)));
    const star = '★'.repeat(s) + '☆'.repeat(5 - s);
    let h = '<div class="rel innbook"><div class="rk"><b>民宿留言本</b> <span class="lv">' + star + '</span></div>';
    h += `<div class="rr"><span>今天 ${v.guests && v.guests.length ? v.guests.length + ' 组 / ' + v.people + ' 人' : '还没有客人'}</span><span class="rl">${v.earn.today ? '今日 ' + v.earn.today + ' 金' : '星级 ' + (Math.round(v.stars * 10) / 10)}</span></div>`;
    if (v.book && v.book.length) for (const b of v.book.slice(0, 5)) h += `<div class="rr"><span>第 ${b.day} 天 ${'★'.repeat(b.s || 3)}</span><span class="rl">${esc(b.note || '')}</span></div>`;
    else h += '<div class="rr"><span>还没有留言，客人走时会写几句</span></div>';
    return h + '</div>';
  }
  function relHtml(H) {
    if (!H || (!H.kids.length && !H.nb.length)) return '';
    let h = '<div class="rel">';
    for (const k of H.kids) { const top = k.rel.filter(r => r.v > 0).slice(0, k.married ? 0 : 3);
      if (k.married) { const mate = k.wed && k.rel.find(r => r.id === k.wed.mate) ? k.rel.find(r => r.id === k.wed.mate).name : '';
      const p = k.path, way = p && p.way, pending = p && p.pending;
      const pathLine = way === 'work' ? '在镇上上班' : way === 'shop' ? '在镇上开店' : way === 'inn' ? '经营民宿 / 菜馆' : '留家种地';
      h += `<div class="rk"><b>${esc(k.name)}</b> 和${esc(mate)}成家了，${pathLine}${pending ? '（明天换）' : ''}，住在新房子</div>`;
      h += `<div class="cchg"><button type="button" class="pbtn" data-cr="${esc(k.id)}">换个活法</button></div>`; continue; }
      if (k.wed && k.wed.mate) { h += `<div class="rk"><b>${esc(k.name)}</b> 今晚办婚礼</div>`; continue; }
      if (!top.length) continue;
      h += `<div class="rk"><b>${esc(k.name)}</b>的同学</div>` + top.map(r => `<div class="rr"><span>${esc(r.name)}</span>${hearts5(r.v)}<span class="rl">${esc(r.level)}</span></div>`).join(''); }
    if (H.nb.length) h += '<div class="rk"><b>镇上的人</b></div>' + H.nb.map(r => `<div class="rr"><span>${esc(r.name)}</span>${hearts5(r.v)}<span class="rl">${esc(r.level)}</span></div>`).join('');
    return h + '</div>';
  }
  function drawLoveTip() {
    if (!loveTip || loveTip.hidden || !G.loveStatus) return;
    const love = G.loveStatus();
    loveTip.innerHTML = (love.todayText ? '<div>' + love.todayText + '</div>' : '') + '<div class="hint">' + love.hint + '</div>' + relHtml(love.home) + innBookHtml();
    placeLoveTip();
  }
  const toggleLoveTip = v => { if (!loveTip) return; loveTip.hidden = v === undefined ? !loveTip.hidden : !v; if (!loveTip.hidden) drawLoveTip(); };
  if (loveHud) loveHud.addEventListener('click', e => { e.stopPropagation(); toggleLoveTip(); });
  addEventListener('pointerdown', e => { if (!loveTip || loveTip.hidden) return; if (loveTip.contains(e.target) || (loveHud && loveHud.contains(e.target))) return; toggleLoveTip(false); });
  setInterval(() => { inv(); tools(); if (!shop.hidden) drawShop(); if (!store.hidden) drawStore(); if (codexEl && !codexEl.hidden) drawCodex(); if (loveTip && !loveTip.hidden) drawLoveTip(); const a = document.getElementById('ago'); if (a) a.textContent = ago(G.SAVE.at); const sa = document.getElementById('syncAgo'); if (sa && L) sa.textContent = agoSync(L.status().lastSyncAt); hintSync(); }, 250); inv();
  if (loveTip) loveTip.addEventListener('click', e => { const b = e.target.closest('[data-cr]'); if (!b) return; e.stopPropagation(); const v = G.careerView && G.careerView(b.getAttribute('data-cr'), 'change'); if (v) showCareer(v); });

  // v5.10.6: wedding-morning path, or later 「换个活法」 from the family panel
  const careerBox = $('career');
  let careerSel = null, careerData = null;
  function optLabel(o) {
    const cost = (o.cost ? o.cost + ' 金' : '') + (o.wood ? (o.cost ? ' + ' : '') + o.wood + ' 木材' : '');
    return `<b>${esc(o.title)}</b>${cost ? ' · ' + cost : ''}<span class="cd">${esc(o.desc)}</span>` + (o.ok ? '' : `<span class="cwhy">${esc(o.why || '现在还不行')}</span>`);
  }
  function paintCareer() {
    if (!careerBox || !careerData) return;
    const v = careerData, wedding = v.mode === 'wedding';
    const fee = v.fee | 0;
    const sub = wedding ? `${esc(v.name)}今天成家。选一个去向，之后就不用再管；关了窗口按推荐的来。` : (fee ? `换条路要 2,000 金，明天早上生效。关店会退一半装修费。` : `第一次换不用花钱，明天早上生效。`);
    careerBox.innerHTML = `<h3>${wedding ? '成家以后做什么' : '换个活法'}</h3><div class="csub">${sub}</div>` +
      v.options.map(o => `<button type="button" class="pbtn copt${careerSel && careerSel.way === o.way ? ' on' : ''}${o.ok ? '' : ' off'}" data-way="${o.way}" ${o.ok ? '' : 'disabled'}>${optLabel(o)}</button>`).join('') +
      `<div class="crow"><button type="button" class="pbtn" id="careerOk">${wedding ? '就按这个' : '明天换过去'}</button>` + (wedding ? '' : `<button type="button" class="pbtn" id="careerNo">先不换</button>`) + `</div>`;
    careerBox.hidden = false;
    careerBox.querySelectorAll('[data-way]').forEach(b => b.onclick = () => { const o = v.options.find(q => q.way === b.getAttribute('data-way')); if (o && o.ok) { careerSel = o; paintCareer(); } });
    const ok = $('careerOk'); if (ok) ok.onclick = () => confirmCareer();
    const no = $('careerNo'); if (no) no.onclick = () => closeCareer(false);
  }
  function showCareer(v) {
    if (!careerBox || !v) return;
    careerData = v; careerSel = v.options.find(o => o.selected && o.ok) || v.options.find(o => o.ok) || v.options[0];
    if (loveTip) loveTip.hidden = true;
    paintCareer();
  }
  function closeCareer(useDefault) {
    if (!careerBox) return;
    const v = careerData, wedding = v && v.mode === 'wedding';
    careerBox.hidden = true;
    if (useDefault && wedding && G.careerPick && v) {
      const o = v.options.find(q => q.selected) || careerSel || v.options[0];
      if (o) G.careerPick(v.kid, o.way, o.at, o.kind);
    }
    careerData = null; careerSel = null;
  }
  function confirmCareer() {
    if (!careerData || !careerSel) return closeCareer(true);
    const v = careerData, o = careerSel;
    const r = v.mode === 'wedding' ? (G.careerPick && G.careerPick(v.kid, o.way, o.at, o.kind)) : (G.careerChange && G.careerChange(v.kid, o.way, o.at, o.kind));
    if (r && !r.ok && r.why) { const s = careerBox.querySelector('.csub'); if (s) s.innerHTML = '<span class="cwhy">' + esc(r.why) + '</span>'; return; }
    careerBox.hidden = true; careerData = null; careerSel = null; if (G.refreshUI) G.refreshUI();
  }
  addEventListener('pf:career', e => showCareer(e.detail));
  addEventListener('pf:career-done', () => { if (careerBox) careerBox.hidden = true; careerData = null; careerSel = null; });
  addEventListener('pointerdown', e => { if (!careerBox || careerBox.hidden) return; if (careerBox.contains(e.target)) return; closeCareer(true); });

  G.refreshUI = () => { invKey = ''; storeKey = ''; shopKey = ''; codexKey = ''; inv(); if (!shop.hidden) drawShop(true); if (!store.hidden) drawStore(true); if (codexEl && !codexEl.hidden) drawCodex(true); if (G.hud) G.hud(); };
})();
