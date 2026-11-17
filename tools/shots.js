const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(String(e)));
  await p.goto((process.env.PF_URL || 'http://127.0.0.1:8765') + '/index.html?manual=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  const until = async (name, pred, maxSec = 400) => {
    const info = await p.evaluate(([pred, maxSec]) => { const f = window.__farm; const fn = new Function('S', 'F', 'tiles', 'return ' + pred);
      for (let i = 0; i < maxSec * 10; i++) { f.advance(0.1, 10); if (fn(f.S, f.S.farmer, f.tiles)) break; } f.render(); return f.S.label + ' ' + f.S.day + ' ' + Math.floor(f.S.t % 1440 / 60) + ':' + Math.floor(f.S.t % 60); }, [pred, maxSec]);
    await p.screenshot({ path: require('path').resolve(__dirname, '..', 'shots', name + '.png') }); const d = await p.evaluate(() => document.getElementById('game').toDataURL()); require('fs').writeFileSync(`/tmp/raw/${name}.png`, Buffer.from(d.split(',')[1], 'base64')); const pos = await p.evaluate(() => { const f = __farm; return { farmer: f.proj(f.F.x, f.F.y), house: f.proj(f.HOUSE.x, f.HOUSE.y), stall: f.proj(f.STALL.x, f.STALL.y), home: f.F.home }; }); POS[name] = pos; console.log(name, info);
  };
  const POS = {}; const phase = process.argv[2] || 'all';
  await until('00_morning', "S.t >= 360+3");
  await until('01_clearing', "S.label.includes('清理') && F.task && (F.task&&F.task.work) > 3");
  await until('02_weeding', "S.label.includes('拔草') && F.task && (F.task&&F.task.work) > 3");
  await until('03_storehouse', "S.label.includes('仓库') && F.task && (F.task&&F.task.work) > 2");
  await until('04_till_plant', "S.label.includes('播种') && tiles.filter(t=>t.crop).length > 6");
  await until('05_watering', "S.label.includes('浇水') && tiles.filter(t=>t.crop).length > 14 && (F.task&&F.task.work)>1");
  await until('06_growing', "tiles.filter(t=>t.crop&&t.crop.stage>=1).length > 8 && tiles.filter(t=>t.crop&&t.crop.stage>=2).length > 3");
  await until('07_harvest', "S.label.includes('收获') && F.crops.length >= 3 && (F.task&&F.task.work)>1");
  await until('08_selling', "S.label.includes('卖出') && F.task && (F.task&&F.task.work) > 1.5", 800);
  await until('09_dusk', "S.t % 1440 >= 19*60+20");
  await until('10_night_sleep', "F.sleeping && S.t % 1440 >= 22*60", 800);
  await until('11_day2_morning', "S.day === 2 && S.t % 1440 >= 6*60+40", 800);
  require('fs').writeFileSync('/tmp/raw/pos.json', JSON.stringify(POS)); console.log('ERR', errs); await b.close();
})();
