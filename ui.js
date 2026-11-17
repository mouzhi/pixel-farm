// 像素农场 · 界面：背包栏、存档菜单、离线收益小结（HTML 叠在画布上，不进画布，不影响逐像素稳定）
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
  const cropIcon = k => `<i style="background:url(${window.PF_CROPS ? window.PF_CROPS.src : 'assets/crops.png'}) no-repeat;background-size:96px 32px;background-position:${-32 * SIM.IDS.indexOf(k)}px 0"></i>`;
  // ---- inventory bar ----
  let invKey = '';
  function inv() {
    const S = G.S, F = G.F;
    const key = [F.water, S.waterMax, ...SIM.IDS.map(k => F.bag[k]), F.crops.length, F.gathered].join(',');
    if (key === invKey) return; invKey = key;
    const pips = Array.from({ length: Math.min(S.waterMax, 30) }, (_, i) => `<b class="${i < F.water ? 'on' : ''}"></b>`).join('');
    let h = `<div class="slot" title="水壶：每格土地每天浇一次，空了去井边装满"><i style="background:url(${CAN});background-size:32px"></i><div class="pips">${pips}</div><span class="k">水壶 ${F.water}/${S.waterMax}</span></div>`;
    for (const k of SIM.IDS) { const n = F.bag[k] + (k === 'carrot' ? F.gathered : 0);
      h += `<div class="slot${n ? '' : ' dim'}" title="${SIM.CROPS[k].name}种子（随身）· ${SIM.CROPS[k].days} 天成熟">${cropIcon(k)}<span class="k">${SIM.CROPS[k].name}种</span><span class="n">${n}</span></div>`; }
    h += `<div class="slot${F.crops.length ? '' : ' dim'}" title="篮子：装满 ${SIM.BASKET} 个就去集市"><i style="background:url(${BASKET});background-size:32px"></i><span class="k">篮子</span><span class="n">${F.crops.length}/${SIM.BASKET}</span></div>`;
    $('inv').innerHTML = h;
  }
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
  $('menuBtn').addEventListener('click', () => { menu.hidden = !menu.hidden; mode = ''; resetArm = 0; if (!menu.hidden) drawMenu(); });
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
  setInterval(() => { inv(); const a = document.getElementById('ago'); if (a) a.textContent = ago(G.SAVE.at); }, 250); inv();
})();
