// 像素农场 · 图鉴图标（v5.4.1）：鱼和珍品的像素图。24×16 的鱼、16×16 的蛋和松露，运行时自动加深色描边，没见过的显示同一形状的剪影。
'use strict';
(function (root) {
  const INK = '#2a1d16';
  const COLS = {
    A: '#ffd76a',
    a: '#e8c78a',
    B: '#3e3f4c',
    b: '#666a73',
    C: '#a84828',
    c: '#cf6a3c',
    d: '#9a9ea0',
    E: '#f6ecd0',
    e: '#fff6dc',
    F: '#e6d4a0',
    G: '#3f7a32',
    g: '#52af3a',
    h: '#cfd0c6',
    J: '#d4a84a',
    k: '#2a1d16',
    l: '#8fd35a',
    M: '#1c1626',
    m: '#1f3d68',
    n: '#2a1d16',
    o: '#e8a070',
    P: '#b8432f',
    p: '#e57fa0',
    Q: '#c8b890',
    q: '#f6ecd0',
    R: '#c04a1c',
    r: '#e06a2c',
    S: '#6a6e70',
    s: '#9a9ea0',
    T: '#5a3a28',
    t: '#8cc6dc',
    U: '#2f6ea0',
    u: '#4fa3cf',
    V: '#7a5230',
    W: '#a0703f',
    w: '#fff6dc',
    X: '#f6ecd0',
    Y: '#c87820',
    y: '#e8a02a',
    Z: '#e8e0c8',
    z: '#ffd76a'
  };
  const FISH = {
    crucian: [ // 鲫鱼
      '                        ',
      '                        ',
      '                        ',
      '           SSS          ',
      '     SS  SSsssSSS       ',
      '    S  SSssssssshS      ',
      '    S SsssssssshhhS     ',
      '     SsssssssshhhhS     ',
      '    S SssssshhhhhSe     ',
      '    S  SsshhhhhhhS      ',
      '     SS SShhhhhSS       ',
      '           SSSS         ',
      '                        ',
      '                        ',
      '                        ',
      '                        '
    ],
    carp: [ // 鲤鱼
      '                        ',
      '                        ',
      '          CCCC          ',
      '     CC  CCccccCC       ',
      '    C  CCcccccccoC      ',
      '    C CccccccccoooC     ',
      '     CcccccccccoooC     ',
      '    C CcccccccoooCe     ',
      '    C  CcccoooooooC     ',
      '     CC CCooooooCC      ',
      '          CCCCC         ',
      '                        ',
      '                        ',
      '                        ',
      '                        ',
      '                        '
    ],
    grassc: [ // 草鱼
      '                        ',
      '                        ',
      '                        ',
      '     GG  GGGGGGGG       ',
      '    G  GGgggggggllG     ',
      '    G GggggggggglllG    ',
      '     GgggggggggllllG    ',
      '    G GgggggglllllGe    ',
      '    G  GglllllllllG     ',
      '     GG GGlllllGGG      ',
      '          GGGG          ',
      '                        ',
      '                        ',
      '                        ',
      '                        ',
      '                        '
    ],
    bass: [ // 鲈鱼
      '                        ',
      '           B B          ',
      '          BBBBB         ',
      '     BB  BbbbbbbB       ',
      '    B  BBbbbbbbbdB      ',
      '    B BbbbbbbbbbddB     ',
      '     BbbbbbbbbbbddB     ',
      '    B BbbbbbbbbddBe     ',
      '    B  BbbbddddddB      ',
      '     BB BBdddddBB       ',
      '          BBBB          ',
      '                        ',
      '                        ',
      '                        ',
      '                        ',
      '                        '
    ],
    koi: [ // 锦鲤
      '                        ',
      '                        ',
      '          RRRR          ',
      '     RR  RRrwrrRR       ',
      '    R  RrrrrwrrrwR      ',
      '    R RrrwrrrrrrwwR     ',
      '     RrrrrnrrrrrwwR     ',
      '    R RrrrrrrnrrwRe     ',
      '    R  RrrrwwwwwwR      ',
      '     RR RRwwwwwRR       ',
      '          RRRR          ',
      '                        ',
      '                        ',
      '                        ',
      '                        ',
      '                        '
    ],
    goldfish: [ // 金鱼
      '                        ',
      '                        ',
      '     Y  Y   YYYY        ',
      '    YyyyyY YyyyyYY      ',
      '   YyyyyyyYyyyyyyyY     ',
      '    YyyyyyyyyyyyyyyY    ',
      '   YyyyyyyyyyyyzzYe     ',
      '    YyyyyyyyyyyzzzY     ',
      '   YyyyyY YyyyyyyY      ',
      '    YYY    YYYYYY       ',
      '                        ',
      '                        ',
      '                        ',
      '                        ',
      '                        ',
      '                        '
    ],
    sardine: [ // 沙丁鱼
      '                        ',
      '                        ',
      '                        ',
      '                        ',
      '      SSSSSSSSS         ',
      '    SSssssssssshS       ',
      '   S SssssssshhhhS      ',
      '    SsssssshhhhhSe      ',
      '   S SShhhhhhhhhS       ',
      '      SSSSSSSSS         ',
      '                        ',
      '                        ',
      '                        ',
      '                        ',
      '                        ',
      '                        '
    ],
    seabass: [ // 海鲈
      '                        ',
      '                        ',
      '         U  U           ',
      '     UU  UUUUUUUU       ',
      '    U  UUuuuuuuutU      ',
      '    U UuuuuuuuuuttU     ',
      '     UuuuuuuuuutttU     ',
      '    U UuuuuuuutttUe     ',
      '    U  UuutttttttU      ',
      '     UU UUtttttUU       ',
      '         UUUU           ',
      '                        ',
      '                        ',
      '                        ',
      '                        ',
      '                        '
    ],
    snapper: [ // 鲷鱼
      '                        ',
      '          PPP           ',
      '        PPpppPP         ',
      '      PPppppppqP        ',
      '     P PppppppqqP       ',
      '    P PpppppppqqqP      ',
      '     PppppppppqqqP      ',
      '    P PppppppqqqPe      ',
      '    P  PPpqqqqqqP       ',
      '      PP PPPPPP         ',
      '                        ',
      '                        ',
      '                        ',
      '                        ',
      '                        ',
      '                        '
    ],
    tuna: [ // 金枪鱼
      '                        ',
      '                        ',
      '    U              U    ',
      '     UUmmmmmmmmmUU      ',
      '    U mmmmmmmmmmmttU    ',
      '   UmmmmmmmmmmmmmttU    ',
      '  U mmmmmmmmmmmmtttU    ',
      '   UUmmmmmmmmmmttUe     ',
      '    U mmmmmtttttttU     ',
      '     UUUUttttttUU       ',
      '         UUUU           ',
      '                        ',
      '                        ',
      '                        ',
      '                        ',
      '                        '
    ],
    sword: [ // 旗鱼
      '         MM             ',
      '        MmmM            ',
      '       MmmmM            ',
      '       MmmMM            ',
      '      MmmmmmMMMMMMM     ',
      '     MmmmmmmmmmmmmmmmM  ',
      '  M MmmmmmmmmmmmmmmmttM ',
      '   M MmmmmmmmmmmmttteM  ',
      '     MmmmmmmmmttttttM   ',
      '      MMmmmtttttttMM    ',
      '        MMMMMMMMM       ',
      '                        ',
      '                        ',
      '                        ',
      '                        ',
      '                        '
    ],
  };
  const RARE = {
    gold: [ // 金蛋
      '                ',
      '                ',
      '                ',
      '      AAAA      ',
      '     AaaazA     ',
      '    AaaaaazA    ',
      '    AaaaaaaA    ',
      '    AaaaaaaA    ',
      '    AaaaaaAA    ',
      '     AaaaaA     ',
      '      AAAA      ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                '
    ],
    double: [ // 双黄蛋
      '                ',
      '                ',
      '                ',
      '      EEEE      ',
      '     EFFFFE     ',
      '    EFJJFJJFE   ',
      '    EFJJFJJFE   ',
      '    EFFFFFFFE   ',
      '    EFFFFFFFE   ',
      '     EFFFFE     ',
      '      EEEE      ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                '
    ],
    white: [ // 白松露
      '                ',
      '                ',
      '                ',
      '                ',
      '      XXXX      ',
      '     XZQXZX     ',
      '    XZZZZZZX    ',
      '    XZQZZZZX    ',
      '    XZZZZQZX    ',
      '     XZZZZX     ',
      '      XXXX      ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                '
    ],
    big: [ // 大松露
      '                ',
      '                ',
      '                ',
      '     TTTTTT     ',
      '    TVVWVVVT    ',
      '   TVWVWVWVVT   ',
      '   TVVWVWVVVT   ',
      '   TWVWVWVWVT   ',
      '   TVVWVWVVVT   ',
      '    TVVWVVVT    ',
      '     TTTTTT     ',
      '                ',
      '                ',
      '                ',
      '                ',
      '                '
    ],
  };

  function hex(h) {
    h = String(h || '').replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0, 255];
  }
  function raster(rows, cols, outline) {
    cols = cols || COLS;
    const h = rows.length, w = Math.max.apply(null, rows.map(r => r.length));
    const px = new Uint8ClampedArray(w * h * 4);
    const set = (x, y, c) => { if (x < 0 || y < 0 || x >= w || y >= h || !c) return; const i = (y * w + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3]; };
    const alpha = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : px[(y * w + x) * 4 + 3];
    for (let y = 0; y < h; y++) {
      const row = rows[y] || '';
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]; if (ch === ' ' || !cols[ch]) continue;
        set(x, y, hex(cols[ch]));
      }
    }
    if (outline !== false) {
      const ink = hex(cols.k || INK), add = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (alpha(x, y)) continue;
        let hit = 0;
        for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && alpha(x + dx, y + dy)) hit = 1;
        if (hit) add.push(x, y);
      }
      for (let i = 0; i < add.length; i += 2) set(add[i], add[i + 1], ink);
    }
    const white = hex('#fff6dc'), pupil = hex(cols.k || INK);
    for (let y = 0; y < h; y++) {
      const row = rows[y] || '';
      for (let x = 0; x < row.length; x++) if (row[x] === 'e') {
        set(x, y, white);
        if (x + 1 < w) set(x + 1, y, pupil);
      }
    }
    return { w, h, px };
  }
  function silhouette(img, fillHex, edgeHex) {
    const fill = hex(fillHex || '#6b4a32'), edge = hex(edgeHex || '#3a2418');
    const { w, h, px } = img, out = new Uint8ClampedArray(px.length);
    const alpha = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : px[(y * w + x) * 4 + 3];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (!px[i + 3]) continue;
      let isEdge = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (!alpha(x + dx, y + dy)) { isEdge = 1; break; }
      const c = isEdge ? edge : fill;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
    }
    return { w, h, px: out };
  }
  function canvasOf(img) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = img.w; c.height = img.h;
    c.getContext('2d').putImageData(new ImageData(img.px, img.w, img.h), 0, 0);
    return c;
  }
  const cache = {}, silCache = {};
  function paint(kind, id) {
    const rows = (kind === 'rare' ? RARE : FISH)[id]; if (!rows) return null;
    const key = kind + ':' + id;
    if (!cache[key]) cache[key] = raster(rows, COLS, true);
    return cache[key];
  }
  function urlOf(img) {
    const c = canvasOf(img); return c ? c.toDataURL() : '';
  }
  function fishURL(id) { const im = paint('fish', id); return im ? urlOf(im) : ''; }
  function rareURL(id) { const im = paint('rare', id); return im ? urlOf(im) : ''; }
  function silURL(kind, id) {
    const key = kind + ':' + id;
    if (!silCache[key]) { const im = paint(kind, id); silCache[key] = im ? silhouette(im) : null; }
    return silCache[key] ? urlOf(silCache[key]) : '';
  }
  // draw a sprite onto a 2D context, nearest-neighbour, optional flip / scale. x,y is the top-left of the scaled box.
  function blit(ctx, img, x, y, opt) {
    if (!ctx || !img) return;
    const c = canvasOf(img); if (!c) return;
    const s = (opt && opt.scale) || 1, flip = opt && opt.flip;
    ctx.imageSmoothingEnabled = false;
    const w = img.w * s, h = img.h * s;
    ctx.save();
    if (flip) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(c, 0, 0, img.w, img.h, 0, 0, w, h); }
    else ctx.drawImage(c, 0, 0, img.w, img.h, x, y, w, h);
    ctx.restore();
  }
  function ids() { return { fish: Object.keys(FISH), rare: Object.keys(RARE) }; }
  function has(kind, id) { return !!((kind === 'rare' ? RARE : FISH)[id]); }

  const api = { INK, COLS, FISH, RARE, raster, silhouette, canvasOf, paint, fishURL, rareURL, silURL, blit, ids, has, urlOf };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PFCodexIcons = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
