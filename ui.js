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
  Object.assign(ICONS, { coop: house(rf[2]), shed: house(st[2]),
    pasture: pixIcon(['', '', '', '', '  k   k   k   k', ' kwk kwk kwk kwk', ' kwkkkwkkkwkkkwk', ' kwwwwwwwwwwwwwk', ' kwkkkwkkkwkkkwk', ' kwwwwwwwwwwwwwk', ' kwkgkwkgkwkgkwk', 'gkwkgkwkgkwkgkwkg', 'ggggggggggggggggg'].map(r => r.padEnd(16)), { k: ink, w: wd[4], g: gr[3] }),
    hay: pixIcon(['', '', '', '', '   kkkkkkkkkk', '  kyyyyyyyyyyk', '  kyyyyyyyyyyk', '  kbbbbbbbbbbk', '  kyyyyyyyyyyk', '  kyyyyyyyyyyk', '  kbbbbbbbbbbk', '  kyyyyyyyyyyk', '   kkkkkkkkkk'].map(r => r.padEnd(16)), { k: ink, y: '#f2cf55', b: wd[3] }),
    egg: pixIcon(['', '', '', '', '      kkk', '     kcccк', '    kcccccк', '    kccccck', '    kcccccck', '    kcecccck', '     keccck', '      kkkk'].map(r => r.replace(/к/g, 'k').padEnd(16)), { k: ink, c: '#f6ecd0', e: st[3] }),
    wool: pixIcon(['', '', '', '    kk kk', '   kcckcck', '  kcceccccck', '  kcccccecck', ' kceccccccck', ' kccccceccck', '  kccecccck', '   kkcckkk', '     kk'].map(r => r.padEnd(16)), { k: ink, c: '#f6ecd0', e: st[3] }),
    milk: pixIcon(['', '', '      kkk', '      kak', '     kkkkk', '    kcccck', '    kcccck', '    kaaaak', '    kcccck', '    kcccck', '    kcccck', '    kkkkkk'].map(r => r.padEnd(16)), { k: ink, c: '#f6ecd0', a: wt[3] }) });
  const artIcon = k => { const a = G.animalArt(k), n = Math.max(16, a.width, a.height), c = document.createElement('canvas'); c.width = c.height = n;
    c.getContext('2d').drawImage(a, (n - a.width) >> 1, n - a.height - ((n - a.height) >> 2)); return c.toDataURL(); };
  for (const k of ['chicken', 'sheep', 'cow']) ICONS[k] = artIcon(k);
  const FRUIT_ICON = { apple: pixIcon(['', '', '', '      kk', '     kgk', '   kkkbkkk', '  krrrrrrrk', '  krwrrrrrk', '  krrrrrrrk', '  krrrrrrrk', '   krrrrrk', '    kkkkk'].map(r => r.padEnd(16)), { k: ink, g: gr[3], b: wd[2], r: rf[2], w: '#fff6dc' }),
    orange: pixIcon(['', '', '', '      kg', '     kgk', '   kkkkkkk', '  koooooook', '  koyoooook', '  koooooook', '  koooooook', '   koooook', '    kkkkk'].map(r => r.padEnd(16)), { k: ink, g: gr[3], o: '#e8862a', y: '#ffd76a' }),
    wood: pixIcon(['', '', '', '', '  kkkkkkkkkk', ' kbbbbbbbbbbk', ' ktbbbbbbbbtk', '  kkkkkkkkkk', '  kkkkkkkkkk', ' kbbbbbbbbbbk', ' ktbbbbbbbbtk', '  kkkkkkkkkk'].map(r => r.padEnd(16)), { k: ink, b: wd[2], t: wd[4] }) };
  // crop icons come from the game's ripe-crop atlas (SpriteCook sheet + hand-drawn strawberry / watermelon), shown at 2x
  let atlas = null;
  const cropIcon = k => { atlas = atlas || (G.cropAtlasURL && G.cropAtlasURL());
    return `<i style="background:url(${atlas || (window.PF_CROPS && window.PF_CROPS.src)}) no-repeat;background-size:${32 * SIM.IDS.length}px 32px;background-position:${-32 * SIM.IDS.indexOf(k)}px 0"></i>`; };
  const icon = id => (SIM.CROPS[id] ? cropIcon(id) : `<i style="background:url(${ICONS[id]});background-size:32px;image-rendering:pixelated"></i>`);
  // ---- inventory bar: water, the seeds he can grow, the basket ----
  let invKey = '';
  function inv() {
    const S = G.S, F = G.F, E = S.eff, ids = SIM.IDS.filter(k => E.crops.includes(k) || F.bag[k] > 0);
    const key = [F.water, S.waterMax, E.basket, ...ids.map(k => k + F.bag[k]), F.crops.length, F.gathered, !!atlas, F.wood, F.saplings.apple, F.saplings.orange, S.hay, S.animals.map(a => a.h).join('/'), S.eff.regions.length].join(',');
    if (key === invKey) return; invKey = key;
    const pips = Array.from({ length: Math.min(S.waterMax, 30) }, (_, i) => `<b class="${i < F.water ? 'on' : ''}"></b>`).join('');
    let h = `<div class="slot" title="水壶：每格土地每天浇一次，空了去井边装满"><i style="background:url(${CAN});background-size:32px"></i><div class="pips">${pips}</div><span class="k">水壶 ${F.water}/${S.waterMax}</span></div>`;
    for (const k of ids) { const n = F.bag[k] + (k === 'carrot' ? F.gathered : 0);
      h += `<div class="slot${n ? '' : ' dim'}" title="${SIM.CROPS[k].name}种子（随身）· ${SIM.CROPS[k].days} 天成熟">${cropIcon(k)}<span class="k">${SIM.CROPS[k].name}种</span><span class="n">${n}</span></div>`; }
    h += `<div class="slot${F.crops.length ? '' : ' dim'}" title="篮子：装满 ${E.basket} 个就去集市"><i style="background:url(${BASKET});background-size:32px"></i><span class="k">篮子</span><span class="n">${F.crops.length}/${E.basket}</span></div>`;
    if (F.wood) h += `<div class="slot" title="木材：去集市卖，每份 ${PFWorld.WOOD.price} 金"><i style="background:url(${FRUIT_ICON.wood});background-size:32px"></i><span class="k">木材</span><span class="n">${F.wood}</span></div>`;
    for (const k of PFWorld.FRUIT_IDS) if (F.saplings[k]) h += `<div class="slot" title="${PFWorld.FRUIT[k].name}树苗：用右下角的「种${PFWorld.FRUIT[k].name}」指定位置"><i style="background:url(${FRUIT_ICON[k]});background-size:32px"></i><span class="k">${PFWorld.FRUIT[k].name}苗</span><span class="n">${F.saplings[k]}</span></div>`;
    if (S.eff.regions.includes('pasture')) h += `<div class="slot${S.hay ? '' : ' dim'}" title="仓库里的干草：每只鸡每天 1 份，羊 2 份，牛 3 份。拔草会晒出干草，不够时去集市买（${PFAnimals.HAY.price} 金一捆）"><i style="background:url(${ICONS.hay});background-size:32px"></i><span class="k">干草</span><span class="n">${S.hay}</span></div>`;
    if (S.animals.length) { const avg = Math.round(S.animals.reduce((n, a) => n + a.h, 0) / S.animals.length), mood = PFAnimals.mood(avg);
      h += `<div class="slot" title="${S.animals.map(a => `${PFAnimals.KINDS[a.kind].name} ${a.h}（${PFAnimals.mood(a.h)}）`).join('，')}。喂饱、加水、摸一摸会更开心；开心（80 以上）多产一份，闷闷不乐（30 以下）不产。"><i style="background:url(${ICONS.chicken});background-size:32px;image-rendering:pixelated"></i><span class="k">${mood}</span><span class="n">${S.animals.length}</span></div>`; }
    $('inv').innerHTML = h;
  }
  // ---- shop: the player's job is to decide what to buy; the farmer does the rest ----
  const shop = $('shop'); let shopKey = '';
  function drawShop(force) {
    const S = G.S, key = [S.coins, ...SIM.SHOP_IDS.map(k => S.up[k]), !!atlas].join(',');
    if (!force && key === shopKey) return; shopKey = key;
    let h = `<div class="shead"><b>商店</b><span>金币 <b style="color:#ffd76a">${S.coins}</b></span><button class="pbtn x" data-a="close" title="关闭（B）">✕</button></div><div class="cards">`;
    let sec = '';
    for (const id of SIM.SHOP_IDS) {
      const o = SIM.offer(S.up, S.coins, id), it = o.item, n = it.levels.length, lv = o.have;
      const s2 = it.farm ? '牧场（先买北牧场，再盖棚、买动物）' : it.region ? '区域（大地图上用篱笆围着的地方）' : '工具和解锁'; if (s2 !== sec) { sec = s2; h += `<div class="sec">${sec}</div>`; }
      const look = it.region ? `<button class="pbtn look" data-look="${id}">看看</button>` : it.farm && id === 'coop' ? `<button class="pbtn look" data-look="pasture">看看</button>` : '';
      const now = lv ? it.levels[lv - 1].label : '未购买';
      h += `<div class="card${o.maxed ? ' max' : ''}">${icon(id)}<div class="ct"><div><b>${it.name}</b> <span class="lv">${n > 1 ? `${lv}/${n}` : ''} ${esc(now)}</span></div>` +
        (o.maxed ? `<div class="d">已满级</div></div><div class="cb"><span class="done">✓</span></div>` :
          `<div class="d">下一级：${esc(o.level.label)} · ${esc(o.level.desc)}</div>${look}</div><div class="cb"><button class="pbtn" data-buy="${id}"${o.ok ? '' : ' disabled'}>${o.cost} 金</button>${o.locked ? `<span class="short">先买${esc(SIM.shopItem(o.locked).name)}</span>` : o.ok ? '' : `<span class="short">还差 ${o.short}</span>`}</div>`) + '</div>';
    }
    shop.innerHTML = h + '</div>';
  }
  const toggleShop = v => { shop.hidden = v === undefined ? !shop.hidden : !v; if (!shop.hidden) { menu.hidden = true; drawShop(true); } };
  shop.addEventListener('click', e => { const d = e.target && e.target.dataset; if (!d) return;
    if (d.a === 'close') toggleShop(false);
    if (d.look) { const r = PFWorld.region(d.look); G.panTo(r.center.x, r.center.y); toggleShop(false); }
    if (d.buy) { const r = G.buy(d.buy); drawShop(true); speedBar(); if (!r.ok) e.target.classList.add('shake'); } });
  $('shopBtn').addEventListener('click', () => toggleShop());
  addEventListener('keydown', e => { if (e.target && /^(TEXTAREA|INPUT)$/.test(e.target.tagName)) return;
    if (e.key === 'b' || e.key === 'B') toggleShop(); if (e.key === 'Escape') toggleShop(false); });
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
    const S = G.S, F = G.F, m = G.input, chop = S.eff.axe && S.eff.regions.includes('forest');
    const key = [chop, F.saplings.apple, F.saplings.orange, m.mode, m.kind, S.orders.length].join(',');
    if (key === toolKey) return; toolKey = key;
    let h = '';
    if (chop) h += `<button class="pbtn${m.mode === 'chop' ? ' on' : ''}" data-m="chop" title="点林场里的树标记要砍，再点一次取消（Esc 退出）">砍树</button>`;
    for (const k of PFWorld.FRUIT_IDS) if (F.saplings[k]) h += `<button class="pbtn${m.mode === 'plant' && m.kind === k ? ' on' : ''}" data-m="plant" data-k="${k}" title="点一块空草地，农夫会去种（Esc 退出）">种${PFWorld.FRUIT[k].name} ${F.saplings[k]}</button>`;
    const n = S.orders.length; if (n) h += `<button class="pbtn" data-m="clear" title="取消全部砍树和种树指令">指令 ${n} ✕</button>`;
    $('tools').innerHTML = h; $('tools').hidden = !h;
  }
  $('tools').addEventListener('click', e => { const d = e.target.dataset; if (!d || !d.m) return;
    if (d.m === 'clear') { G.S.orders.length = 0; G.setMode(null); G.saveNow(); }
    else if (G.input.mode === d.m && (d.m !== 'plant' || G.input.kind === d.k)) G.setMode(null); else G.setMode(d.m, d.k); tools(); });
  let sayT = 0; addEventListener('pf:say', e => { const b = $('say'); b.textContent = e.detail; b.hidden = false; clearTimeout(sayT); sayT = setTimeout(() => { b.hidden = true; }, 2200); });
  addEventListener('pf:mode', () => tools());
  addEventListener('keydown', e => { if (e.target && /^(TEXTAREA|INPUT)$/.test(e.target.tagName)) return; if (e.key === 'm' || e.key === 'M') toggleMap(); });
  // locked regions get a crisp label over their sign: name, price, and a click opens the shop
  const labs = {}; for (const r of PFWorld.REGIONS) { const d = document.createElement('div'); d.className = 'rlab panel'; d.hidden = true;
    d.innerHTML = `未解锁 · ${esc(r.name)}<br><b>${SIM.shopItem(r.id).levels[0].cost} 金</b> · 商店购买`; d.title = r.desc; d.addEventListener('click', () => toggleShop(true)); $('rlabs').appendChild(d); labs[r.id] = d; }
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
  function drawMenu() {
    const st = G.SAVE;
    let h = `<div>${st.error ? `<span class="bad">保存失败：${esc(st.error)}</span>` : `已自动保存 · <span id="ago">${ago(st.at)}</span>`}</div>`;
    h += st.notes.map(n => `<div class="note bad">${NOTES[n] || esc(n)}</div>`).join('');
    h += `<div class="note">每天早上、每 15 秒、切走或关闭页面时自动保存在这个浏览器里。离开时按在线 50% 的速度结算金币，最多算 3 天。</div>`;
    h += `<div class="row"><button class="pbtn" data-a="export">导出存档</button><button class="pbtn" data-a="import">导入存档</button><button class="pbtn warn" data-a="reset">${resetArm > Date.now() ? '再点一次确认重置' : '重置'}</button></div>`;
    if (mode === 'export') h += `<textarea id="io" readonly>${esc(SAVE.encode(G.snapshot()))}</textarea><div class="row"><button class="pbtn" data-a="copy">复制</button><span class="note" id="msg">复制后可以在别的浏览器里导入</span></div>`;
    if (mode === 'import') h += `<textarea id="io" placeholder="把导出的存档文字粘贴到这里"></textarea><div class="row"><button class="pbtn" data-a="check">检查</button><span class="note" id="msg"></span></div>`;
    if (resetArm > Date.now()) h += `<div class="note bad">重置会从第 1 天重新开始；当前存档会另存一份留底。</div>`;
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
  });
  $('menuBtn').addEventListener('click', () => { menu.hidden = !menu.hidden; if (!menu.hidden) shop.hidden = true; mode = ''; resetArm = 0; if (!menu.hidden) drawMenu(); });
  // ---- offline summary ----
  const dur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h} 小时 ${m} 分` : m ? `${m} 分钟` : `${s} 秒`; };
  function showOffline(r) {
    if (!r) return; const box = $('offline');
    box.innerHTML = `<h3>欢迎回来</h3><div>离开了 ${dur(r.awaySec)}，按在线 50% 的速度折合 ${r.days} 天${r.capped ? '（已到 3 天上限）' : ''}</div>` +
      (r.avg > 0 ? `<div>最近日均 ${r.avg} 金 → 获得 <b style="color:#ffd76a">${r.gold} 金</b></div>` : `<div>还没有完整一天的收入记录，这次没有离线收益</div>`) +
      `<div class="row" style="justify-content:center;display:flex;margin-top:8px"><button class="pbtn" id="offOk">好的</button></div>`;
    box.hidden = false; $('offOk').onclick = () => { box.hidden = true; };
  }
  addEventListener('pf:offline', e => showOffline(e.detail));
  showOffline(G.SAVE.offline);
  setInterval(() => { inv(); speedBar(); tools(); if (!shop.hidden) drawShop(); const a = document.getElementById('ago'); if (a) a.textContent = ago(G.SAVE.at); }, 250); inv(); speedBar();
})();
