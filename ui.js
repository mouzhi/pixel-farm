// 像素农场 · 界面：背包栏、商店、倍速、小地图开关、砍树种树工具条、存档菜单、离线收益小结（HTML 叠在画布上，不进画布，不影响逐像素稳定）
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
    speed: pixIcon(['', '', '   kkkkkkkk', '  kyyyyyyyyk', ' kyyykkkkyyyk', ' kyykwwwwkyyk', ' kyykwwkwkyyk', ' kyykwwkkkyyk', ' kyykwwwwkyyk', ' kyyykkkkyyyk', '  kyyyyyyyyk', '   kkkkkkkk', '      kk', '     kkkk'].map(r => r.padEnd(16)),
      { k: ink, y: '#e8c78a', w: '#fff6dc' }),
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
  const iconURL = id => ICONS[id] || (DART() && DART().iconURL(id)) || BLANK;
  const hasIcon = id => !!(ICONS[id] || (DART() && DART().iconURL(id)));
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
  // v5.1.1: a fixed 48px bar (8 tick marks) that stays inside the 62px slot at every can size
  const METER_W = 48;
  function meterBar(cur, max) {
    const fill = max > 0 ? Math.max(0, Math.min(METER_W, Math.round(METER_W * cur / max))) : 0;
    return `<div class="meter" aria-valuenow="${cur}" aria-valuemax="${max}"><i class="fill" style="width:${fill}px"></i><span class="ticks"></span></div>`;
  }
  // ---- inventory bar: water, the seeds he can grow, the basket ----
  let invKey = '';
  function inv() {
    const S = G.S, F = G.F, E = S.eff, ids = SIM.IDS.filter(k => E.crops.includes(k) || F.bag[k] > 0);
    const fishN = F.crops.filter(k => window.PFFish && PFFish.isFish(typ(k))).length;
    const specials = (F.crops || []).map(it => { const o = window.PFSurprise ? PFSurprise.itemOf(it) : { type: typ(it) }; return [o.type, o.glow || 0, o.giant || 0, o.rare || ''].join(':'); }).join('|');
    const key = [F.water, S.waterMax, E.basket, ...ids.map(k => k + F.bag[k]), F.crops.length, fishN, specials, F.gathered, !!atlas, F.wood, E.house, F.saplings.apple, F.saplings.orange, S.hay, S.family.love, S.family.moved, S.family.kids.length, S.day, S.members.map(m => m.role + (m.task ? m.task.label : '')).join('/'), S.animals.map(a => a.h).join('/'), S.eff.regions.length, E.rod, E.searod, (S.catches[0] && S.catches[0].id) || ''].join(',');
    if (key === invKey) return; invKey = key;
    let h = `<div class="slot" title="水壶：每格土地每天浇一次，空了去井边装满"><i style="background:url(${CAN});background-size:32px"></i>${meterBar(F.water, S.waterMax)}<span class="k">水壶</span><span class="n">${F.water}/${S.waterMax}</span></div>`;
    for (const k of ids) { const n = F.bag[k] + (k === 'carrot' ? F.gathered : 0); if (!n && k !== 'carrot') continue; // v5.9.1: seeds he has none of stay out of the one-row bar
      h += `<div class="slot${n ? '' : ' dim'}" title="${SIM.CROPS[k].name}种子（随身）· ${SIM.CROPS[k].days} 天成熟">${cropIcon(k)}<span class="k">${SIM.CROPS[k].name}种</span><span class="n">${n}</span></div>`; }
    h += `<div class="slot${F.crops.length ? '' : ' dim'}" title="篮子：装满 ${E.basket} 个就去集市"><i style="background:url(${BASKET});background-size:32px"></i><span class="k">篮子</span><span class="n">${F.crops.length}/${E.basket}</span></div>`;
    if (F.wood || E.axe) { const cap = PFWorld.HOUSE_TIERS[E.house || 0].woodCap; // v5.0: wood is a material kept in the storehouse
      h += `<div class="slot${F.wood ? '' : ' dim'}" title="仓库里的木材：扩建房子、给动物棚子围篱笆要用。仓库最多放 ${cap} 份（房子越大越多），放不下的才拿去集市卖（${PFWorld.WOOD.price} 金一份）"><i style="background:url(${FRUIT_ICON.wood});background-size:32px"></i><span class="k">木材</span><span class="n">${F.wood}/${cap}</span></div>`; }
    { const fam = S.family, FA = window.PFFamily, tier = PFWorld.HOUSE_TIERS[E.house || 0]; // v5.0: 阿禾 and the children
      if (!fam.moved && fam.met) h += `<div class="slot" title="阿禾是集市的店主（7:00–19:00 开门）。农夫每天第一次去集市会和她聊几句（+${FA.CHAT}），篮子里有野花、鱼、果子或鸡蛋就送她一样；每天头两趟卖东西各 +${FA.SALE}。好感满 ${FA.LOVE_MAX}、房子扩建成大木屋后，她就搬来一起经营农场，摊子交给她爸爸。"><i style="background:url(${ICONS.heart});background-size:32px;image-rendering:pixelated"></i><span class="k">阿禾</span><span class="n">${fam.love}/${FA.LOVE_MAX}</span></div>`;
      if (fam.moved) { const kids = fam.kids.map(k => FA.kidLine(k, S.day));
        const jobs = S.members.map(m => `${m.name}：${m.home ? '在家' : m.task ? m.task.label : '歇着'}`);
        h += `<div class="slot" title="${tier.name}：最多住 ${tier.pop} 人。家人：阿禾${kids.length ? '、' + kids.join('、') : ''}。${jobs.join('；')}"><i style="background:url(${ICONS.house});background-size:32px;image-rendering:pixelated"></i><span class="k">家人</span><span class="n">${1 + S.members.length + fam.kids.filter(k => FA.kidStage(k, S.day) === 'baby').length}/${tier.pop}</span></div>`;
        const NK = window.PFKids;
        for (const k of fam.kids) {
          const short = NK ? NK.panelShort(k, S.day) : FA.kidStage(k, S.day);
          const m = S.members.find(q => q.id === k.id);
          const job = !m || m.home ? '在家' : m.away ? '在学校上课' : (m.task ? m.task.label : '歇着');
          const HS = G.homeStatus ? G.homeStatus().kids.find(q => q.id === k.id) : null, note = HS && HS.note ? HS.note + '。' : ''; // v5.9.0
          const short2 = HS && HS.married ? '成家' : short;
          h += `<div class="slot" title="${FA.kidLine(k, S.day)}。${note}${job}"><i style="background:url(${ICONS.heart});background-size:32px;image-rendering:pixelated"></i><span class="k">${k.name}</span><span class="n">${short2}</span></div>`;
        }
        const nk = FA.nextKid(fam, S.day, tier.pop); // v5.3: the wait for a child is visible, so it does not look stuck
        if (nk) h += `<div class="slot${nk.room ? ' dim' : ''}" title="${FA.kidText(nk)}。阿禾搬来 ${FA.KID_AFTER} 天后第一个孩子出生，之后每个孩子相隔 ${FA.KID_GAP} 天；房子要有空房间（二层农舍住 3 人，庄园住 4 人）"><i style="background:url(${ICONS.heart});background-size:32px;image-rendering:pixelated"></i><span class="k">${nk.name}</span><span class="n">${nk.room ? '要扩建' : nk.days === 1 ? '明天' : nk.days + ' 天'}</span></div>`; } }
    for (const k of PFWorld.FRUIT_IDS) if (F.saplings[k]) h += `<div class="slot" title="${PFWorld.FRUIT[k].name}树苗：用右下角的「种${PFWorld.FRUIT[k].name}」指定位置"><i style="background:url(${FRUIT_ICON[k]});background-size:32px"></i><span class="k">${PFWorld.FRUIT[k].name}苗</span><span class="n">${F.saplings[k]}</span></div>`;
    if (['coop', 'sty', 'fold', 'shed'].some(k => S.eff[k])) h += `<div class="slot${S.hay ? '' : ' dim'}" title="仓库里的干草：每只鸡每天 1 份，猪和羊 2 份，牛 3 份。拔草会晒出干草，不够时去集市买（${PFAnimals.HAY.price} 金一捆）"><i style="background:url(${ICONS.hay});background-size:32px"></i><span class="k">干草</span><span class="n">${S.hay}</span></div>`;
    if (S.animals.length) { const avg = Math.round(S.animals.reduce((n, a) => n + a.h, 0) / S.animals.length), mood = PFAnimals.mood(avg);
      h += `<div class="slot" title="${S.animals.map(a => `${PFAnimals.KINDS[a.kind].name} ${a.h}（${PFAnimals.mood(a.h)}）`).join('，')}。喂饱、加水、摸一摸会更开心；开心（80 以上）多产一份，闷闷不乐（30 以下）不产。"><i style="background:url(${ICONS.chicken});background-size:32px;image-rendering:pixelated"></i><span class="k">${mood}</span><span class="n">${S.animals.length}</span></div>`; }
    // v4.6: the starter bamboo rod is always owned (shop level 0); fish in the basket are listed by kind
    const FS = window.PFFish, rod = FS.rodOf(E.rod || 0);
    const rodTip = E.searod ? `${rod.name}，另有海竿，可在码头海钓` : `${rod.name}（开局就有）。商店可升级钢竿、碳素竿；买下海边和海竿后能海钓`;
    h += `<div class="slot" title="${rodTip}"><i style="background:url(${E.searod ? ICONS.searod : ICONS.rod});background-size:32px;image-rendering:pixelated"></i><span class="k">${E.searod ? '海竿' : rod.name}</span></div>`;
    if (FS && fishN) {
      const counts = {}; for (const k of F.crops) { const id = typ(k); if (FS.isFish(id)) counts[id] = (counts[id] || 0) + 1; }
      for (const id of FS.FISH_IDS) if (counts[id]) { const f = FS.fishOf(id), rc = rarityClass({ group: 'fish', id });
        h += `<div class="slot ${rc}" title="${f.name}：篮子里待售，集市收购 ${f.price} 金一条">${itemArt({ group: 'fish', id }, { fit: 32 })}<span class="k ${rc}">${esc(f.name)}</span><span class="n">${counts[id]}</span></div>`; }
    }
    // same sprites for basket rares / glowing / giant crops, grouped like the fish slots
    if (window.PFSurprise) {
      const groups = new Map();
      for (const it of F.crops) {
        const o = PFSurprise.itemOf(it);
        if ((FS && FS.isFish(o.type)) || !(o.rare || o.glow || o.giant)) continue;
        const key = [o.type, o.glow || 0, o.giant || 0, o.rare || ''].join(':');
        const e = groups.get(key) || { spec: o, n: 0 }; e.n++; groups.set(key, e);
      }
      for (const e of groups.values()) {
        const name = PFSurprise.itemName(e.spec, Object.fromEntries((SIM.IDS || []).map(k => [k, SIM.CROPS[k].name])));
        const rc = rarityClass(e.spec), unit = G.priceOfAny ? G.priceOfAny(e.spec) : '';
        h += `<div class="slot ${rc}" title="${esc(name)}${unit ? '：篮子里待售，集市收购 ' + unit + ' 金' : ''}">${itemArt(e.spec, { fit: 32 })}<span class="k ${rc}">${esc(name)}</span><span class="n">${e.n}</span></div>`;
      }
    }
    $('inv').innerHTML = h;
  }
  // ---- shop: the player's job is to decide what to buy; the farmer does the rest ----
  const shop = $('shop'); let shopKey = '', shopFocus = '', plotView = ''; // plotView: v5.5.0 one plot's page (plots-ui.js)
  const SHOP_TAB_KEY = 'mouzhi/pixel-farm:shop-tab';
  const HALL_TAB = { id: 'hall', name: '镇公所', title: '镇公所的告示板：建设项目、繁荣度、送给镇上的装饰', ids: [] }; // v5.10.0
  const shopTabs = () => (SIM.SHOP_TABS || [{ id: 'all', name: '全部', ids: SIM.SHOP_IDS }]).concat(G.hallView ? [HALL_TAB] : []);
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
    if (tabId === 'works' && ['mill', 'jam', 'cheese'].includes(it.id)) return '加工坊（盖在选成「工坊院」的地块里，家人送原料、取成品）';
    if (tabId === 'works' && it.id === 'wheel') return '水车和路灯（动力坝上的水车点亮附近的路灯）';
    if (tabId === 'works' && it.id === 'hive') return '养蜂（花甸或果园坡）';
    if (tabId === 'decor' && PFDecor.CATALOG[it.id] && PFDecor.CATALOG[it.id].light && it.id !== 'party') return '夜灯（接上水车的电，天一黑自己亮；没电时也能先摆着）';
    if (tabId === 'decor' && it.id === 'party') return '派对区（不定期的晚上一家人聚在这里，有时镇上的人来做客）';
    if (tabId === 'decor') return '装饰（买了放进仓库，家人会找空地摆上；用「挪东西」可以换地方）';
    if (tabId === 'animals' && it.pet) return '小伙伴（猫猫狗狗，不吃干草）';
    if (tabId === 'animals' && it.farm) return '养殖（鸡在家门口，猪在林场边，羊在果园坡，牛在北牧场）';
    return '';
  }
  // v5.9.1: progressive shop: only what is buyable now and up to two unlock steps ahead; a tab with nothing to show yet is left out
  const AUTO_TIP = '打开后，钱多的时候家人每天最多替你买一样基础的东西（扩田、工具、鸡）。装饰、地块、建筑和镇公所的项目都不会碰。'; // v5.10.1
  const shown = id => !G.shopDepth || G.shopDepth(id) <= G.REVEAL_MAX;
  const tabShown = t => t.id === 'hall' ? !!(G.hallView && G.hallView() && G.hallView().open) : t.id === 'tools' || t.id === 'land' || t.ids.some(shown);
  function drawShop(force) {
    const S = G.S, tabs = shopTabs().filter(tabShown);
    if (!tabs.some(t => t.id === shopTab)) shopTab = tabs[0].id;
    const PU = window.PFPlotsUI, PH = { costChip, priceChips };
    const key = [shopTab, !!S.autoBuy, tabs.map(t => t.id).join(''), S.coins, G.F.wood, S.family && S.family.kids ? S.family.kids.length : 0, S.fishFood, S.bugNet || 0, (S.ornament && S.ornament.goldfish) || 0, ...SIM.SHOP_IDS.map(k => S.up[k]), !!atlas, plotView, JSON.stringify(S.plots || {}), (S.family || {}).moved, S.members.length, S.animals.length, S.works ? JSON.stringify([S.works.works, S.works.hives.length, S.works.penHost]) : '', shopTab === 'hall' && S.town ? JSON.stringify([S.town.hall, S.decor.inv, S.decor.placed.length]) : ''].join(','); // v5.6.0: what the phase-8 gates read
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
      const short = o.lockText ? `<span class="short lock">${esc(o.lockText)}</span>` : o.locked ? `<span class="short lock">先买${esc(SIM.shopItem(o.locked).name)}</span>` : o.ok ? '' : `<span class="short"><span class="lab">还差</span><span class="price">${o.short ? costChip(o.short, 'coin') : ''}${o.shortWood ? costChip(o.shortWood, 'wood') : ''}</span></span>`;
      h += `<div class="card${o.maxed ? ' max' : ''}" data-item="${id}">${icon(id)}<div class="ct"><div><b>${it.name}</b> <span class="lv">${n > 1 ? `${lv}/${n}` : ''} ${esc(now)}</span></div>` +
        (o.maxed ? `<div class="d">已满级</div></div><div class="cb"><span class="done">✓</span></div>` :
          `<div class="d">下一级：${esc(o.level.label)} · ${esc(o.level.desc)}</div>${look}</div><div class="cb"><button class="pbtn" data-buy="${id}"${o.ok ? '' : ' disabled'}>${priceChips(o.cost, o.wood)}</button>${short}</div>`) + '</div>';
    }
    if (hidden) h += `<div class="more" title="还有 ${hidden} 项，等前面的东西买了、家里有了新变化就会出现">更多内容随进度解锁</div>`;
    if (tab.id === 'hall') h += hallHtml();
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
        const maxed = held >= (FS.POND_CAP || 8), ok = !maxed && S.coins >= gf.price, short = ok || maxed ? '' : `<span class="short"><span class="lab">还差</span><span class="price">${costChip(gf.price - S.coins, 'coin')}</span></span>`;
        h += `<div class="card${maxed ? ' max' : ''}" data-item="goldfish">${itemArt({ group: 'fish', id: 'goldfish' }, { fit: 32 })}<div class="ct"><div><b>金鱼</b> <span class="lv">已有 ${held}/${FS.POND_CAP}</span></div>` +
          (maxed ? `<div class="d">池塘已经养满了</div></div><div class="cb"><span class="done">✓</span></div>` :
            `<div class="d">买来放到家门口池塘里养着，只是在水里游给人看，不再卖掉。海鱼不能放进淡水池塘</div></div><div class="cb"><button class="pbtn" data-buy="goldfish"${ok ? '' : ' disabled'}>${priceChips(gf.price, 0)}</button>${short}</div>`) + '</div>';
      }
    }
    shop.innerHTML = h + '</div>';
    if (shopFocus) { const el = shop.querySelector('[data-item="' + shopFocus + '"]'); if (el) el.scrollIntoView({ block: 'nearest' }); shopFocus = ''; }
  }
  // v5.10.0 镇公所的告示板: prosperity, the building projects (one at a time, done the next morning), gifts to the town
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
    h += `<div class="sec">送给镇上（装饰摆到主街边，灯天黑就亮，不用接电；主街还能摆 ${v.room} 件）</div>`;
    const rows = v.inv.map(o => ({ o, from: 'inv', label: `仓库里 ${o.n} 件` })).concat(v.placed.map(o => ({ o, from: 'yard', label: `院子里摆着 ${o.n} 件` })));
    if (!rows.length) h += `<div class="more">仓库和院子里还没有能送的装饰（派对区留在家里）</div>`;
    for (const { o, from, label } of rows) h += `<div class="card" data-item="gift:${from}:${o.id}">${icon(o.id)}<div class="ct"><div><b>${esc(o.name)}</b> <span class="lv">${label}</span></div><div class="d">${from === 'yard' ? '从院子里收一件送过去（院子里摆得太挤时正好）' : '从仓库拿一件送过去'}</div></div><div class="cb"><button class="pbtn" data-hall="give:${o.id}:${from === 'yard' ? o.u : ''}"${v.room > 0 ? '' : ' disabled'}>送给镇上</button></div></div>`;
    if (v.gifts.length) h += `<div class="more">主街上已经有 ${v.gifts.length} 件农场送的装饰</div>`;
    return h;
  }
  const toggleShop = (v, opt) => { shop.hidden = v === undefined ? !shop.hidden : !v; if (!shop.hidden) { menu.hidden = true; store.hidden = true; if ($('codex')) $('codex').hidden = true; if (opt && opt.tab) setShopTab(opt.tab); shopFocus = (opt && opt.focus) || ''; plotView = (opt && opt.plot) || ''; drawShop(true); if (G.noteShopOpened) G.noteShopOpened(); } };
  shop.addEventListener('click', e => {
    const el = e.target.closest('[data-buy],[data-a],[data-tab],[data-look],[data-plot],[data-plotlook],[data-pbuy],[data-pzone],[data-hall]'); if (!el || !shop.contains(el)) return;
    const d = el.dataset;
    if (d.a === 'close') toggleShop(false);
    if (d.a === 'autobuy') { G.setAutoBuy(!G.S.autoBuy); drawShop(true); return; } // v5.10.1
    if (d.tab) { setShopTab(d.tab); plotView = ''; drawShop(true); }
    if (d.a === 'back') { const was = plotView; plotView = ''; shopFocus = 'plot:' + was; drawShop(true); }
    if (d.plot) { plotView = d.plot; drawShop(true); shop.scrollTop = 0; }
    if (d.plotlook) { const p = PFPlots.plot(d.plotlook); G.panTo((p.rect[0] + p.rect[2]) / 2, (p.rect[1] + p.rect[3]) / 2); toggleShop(false); }
    if (d.pbuy || d.pzone) { const [pid, mod] = (d.pbuy || d.pzone).split(':'), r = d.pbuy ? G.buyPlot(pid, mod) : G.rezonePlot(pid, mod); drawShop(true); if (!r.ok) el.classList.add('shake'); }
    if (d.look) { const P = d.look.startsWith('pen:') && PFWorld.PENS[d.look.slice(4)], r = P ? { center: { x: P.bld.x + 12, y: P.bld.y + 14 } } : PFWorld.region(d.look); G.panTo(r.center.x, r.center.y); toggleShop(false); }
    if (d.buy) { const r = G.buy(d.buy); drawShop(true); speedBar(); if (!r.ok) el.classList.add('shake'); }
    if (d.hall) { const [a, id, u] = d.hall.split(':'), r = a === 'start' ? G.hallStart(id) : G.hallGive(id, u === '' || u === undefined ? undefined : +u); drawShop(true); if (!r.ok) el.classList.add('shake'); } // v5.10.0
  });
  $('shopBtn').addEventListener('click', () => toggleShop());
  G.openPlot = id => toggleShop(true, { tab: 'land', plot: id }); // v5.5.0: the plot labels on the map
  G.openHall = () => toggleShop(true, { tab: 'hall' }); // v5.10.0: the notice board in the town

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
    if (e.key === 'Escape') { toggleShop(false); toggleStore(false); toggleCodex(false); if (!menu.hidden) menu.hidden = true; if (loveTip) loveTip.hidden = true; } });

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

  // ---- speed buttons (bought in the shop) ----
  let spKey = '';
  function speedBar() {
    const S = G.S, key = S.eff.speedMax + ',' + S.speed; if (key === spKey) return; spKey = key;
    const bar = $('speed'); bar.hidden = S.eff.speedMax <= 1;
    bar.innerHTML = [1, 2, 4].filter(v => v <= S.eff.speedMax).map(v => `<button class="pbtn${S.speed === v ? ' on' : ''}" data-v="${v}">${v}×</button>`).join('');
  }
  $('speed').addEventListener('click', e => { const v = +(e.target.dataset && e.target.dataset.v); if (v) { G.setGameSpeed(v); speedBar(); } });
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
    if (koiN) h += `<button class="pbtn${m.mode === 'release' && m.kind === 'koi' ? ' on' : ''}" data-m="release" data-k="koi" title="点家门口的池塘，把篮子里的锦鲤放进去养着（Esc 退出）。放进去就不再卖掉。海鱼不能放进淡水池塘">放养锦鲤 ${koiN}</button>`;
    if (gfN) h += `<button class="pbtn${m.mode === 'release' && m.kind === 'goldfish' ? ' on' : ''}" data-m="release" data-k="goldfish" title="点家门口的池塘，把买来的金鱼放进去养着（Esc 退出）">放养金鱼 ${gfN}</button>`;
    for (const id of deco) h += `<button class="pbtn${m.mode === 'decor' && m.kind === id ? ' on' : ''}" data-m="decor" data-k="${id}" title="点一块草地（亮绿色就能放），家人会从仓库搬过去（Esc 退出）。不放也没关系，家人会自己找地方摆上">摆${DCm.CATALOG[id].name} ${free(id)}</button>`;
    if (movN) h += `<button class="pbtn${m.mode === 'move' ? ' on' : ''}" data-m="move" title="先点要挪的东西（装饰、派对区、加工坊、蜂箱、浇水器；老房子不能挪），再点新位置，家人会搬过去（Esc 退出）">挪东西</button>`;
    if (ordN) h += `<button class="pbtn" data-m="clearmove" title="取消还没搬完的摆放和挪动">要搬的 ${ordN} ✕</button>`;
    const n = S.orders.length; if (n) h += `<button class="pbtn" data-m="clear" title="取消全部砍树、种树和放养指令">指令 ${n} ✕</button>`;
    $('tools').innerHTML = h; $('tools').hidden = !h;
  }
  $('tools').addEventListener('click', e => { const d = e.target.dataset; if (!d || !d.m) return;
    if (d.m === 'clear') { G.S.orders.length = 0; G.setMode(null); G.saveNow(); }
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
  function relHtml(H) {
    if (!H || (!H.kids.length && !H.nb.length)) return '';
    let h = '<div class="rel">';
    for (const k of H.kids) { const top = k.rel.filter(r => r.v > 0).slice(0, k.married ? 0 : 3);
      if (k.married && k.wed) { h += `<div class="rk"><b>${esc(k.name)}</b> 和${esc(k.rel.find(r => r.id === k.wed.mate) ? k.rel.find(r => r.id === k.wed.mate).name : '')}成家了，住在新房子</div>`; continue; }
      if (k.wed && k.wed.mate) { h += `<div class="rk"><b>${esc(k.name)}</b> 今晚办婚礼</div>`; continue; }
      if (!top.length) continue;
      h += `<div class="rk"><b>${esc(k.name)}</b>的同学</div>` + top.map(r => `<div class="rr"><span>${esc(r.name)}</span>${hearts5(r.v)}<span class="rl">${esc(r.level)}</span></div>`).join(''); }
    if (H.nb.length) h += '<div class="rk"><b>镇上的人</b></div>' + H.nb.map(r => `<div class="rr"><span>${esc(r.name)}</span>${hearts5(r.v)}<span class="rl">${esc(r.level)}</span></div>`).join('');
    return h + '</div>';
  }
  function drawLoveTip() {
    if (!loveTip || loveTip.hidden || !G.loveStatus) return;
    const love = G.loveStatus();
    loveTip.innerHTML = (love.todayText ? '<div>' + love.todayText + '</div>' : '') + '<div class="hint">' + love.hint + '</div>' + relHtml(love.home);
    placeLoveTip();
  }
  const toggleLoveTip = v => { if (!loveTip) return; loveTip.hidden = v === undefined ? !loveTip.hidden : !v; if (!loveTip.hidden) drawLoveTip(); };
  if (loveHud) loveHud.addEventListener('click', e => { e.stopPropagation(); toggleLoveTip(); });
  addEventListener('pointerdown', e => { if (!loveTip || loveTip.hidden) return; if (loveTip.contains(e.target) || (loveHud && loveHud.contains(e.target))) return; toggleLoveTip(false); });
  setInterval(() => { inv(); speedBar(); tools(); if (!shop.hidden) drawShop(); if (!store.hidden) drawStore(); if (codexEl && !codexEl.hidden) drawCodex(); if (loveTip && !loveTip.hidden) drawLoveTip(); const a = document.getElementById('ago'); if (a) a.textContent = ago(G.SAVE.at); const sa = document.getElementById('syncAgo'); if (sa && L) sa.textContent = agoSync(L.status().lastSyncAt); hintSync(); }, 250); inv(); speedBar();
  G.refreshUI = () => { invKey = ''; storeKey = ''; shopKey = ''; codexKey = ''; inv(); if (!shop.hidden) drawShop(true); if (!store.hidden) drawStore(true); if (codexEl && !codexEl.hidden) drawCodex(true); if (G.hud) G.hud(); };
})();
