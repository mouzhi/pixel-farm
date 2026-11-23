// Screenshots for v5.11.0.37 (guest pier gap + sunset standing spots):
//   PF_SHOTS=/workspace/pier-sunset-shots node tools/pier-sunset-shots.js
// Local preview only; not a CI group. Exits 1 on a page error, console error or failed check.
"use strict";
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright-core");
const ROOT = path.join(__dirname, ".."), OUT = process.env.PF_SHOTS || "/workspace/pier-sunset-shots";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const errs = [], fails = [];
  async function page() {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push(String(e)));
    p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
    await p.goto(base + "/index.html?manual");
    await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById("offline"); if (o) o.hidden = true; });
    return p;
  }
  const setup = `const f = __farm, S = f.S, F0 = f.FARMER || f.F;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const dry = () => { if (S.weather) S.weather.rained = false; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { for (const id of ["leftBottom", "title", "goal"]) { const el = document.getElementById(id); if (el) el.style.visibility = "hidden"; } };
    const as = (a, fn) => { f.setF(a); try { return fn(); } finally { f.setF(F0); } };
    f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 800000; f.FARMER.wood = 5000;
    for (const id of ["house","house","axe","forest","east","orchard","south","pasture","coast","coop","chicken","fold","sheep","can","can","searod"]) f.buy(id);
    day(80); Object.assign(S.family, { kids: [{ id: "kid0", name: "小豆", born: 15 }, { id: "kid1", name: "小米", born: 40 }] }); f.syncFamily(); dry();
    f.buyPlot("eroad", "road");
    let land = f.buyPlot("eshore", "resort");
    if (!land.ok && !S.plots.eshore) land = f.buyPlot("eshore", "meadow");
    if (S.plots.eshore && S.plots.eshore.mod !== "resort") { const z = f.rezonePlot("eshore", "resort"); if (!z.ok) throw new Error("rezone resort: " + (z.why || z.reason)); }
    if (!(S.eff.regions || []).includes("coast")) throw new Error("coast not bought");
    S.inn = S.inn || f.IN.empty();
    S.inn.resort = { huts: 4, parasols: 8, stall: 1, pier: 1, deck: 1, villas: 0, camp: 0 }; S.inn.job = null;
    if (f.IA && f.IA.sync) f.IA.sync(true);
    if (f.innRepaint) f.innRepaint();
    if (f.syncRegionProps) f.syncRegionProps();
    if (f.markNavDirty) f.markNavDirty();
    f.ensureNav && f.ensureNav();`;

  const shot = async (name, fn, check) => {
    const p = await page();
    let r;
    try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 500) }; }
    await p.waitForTimeout(350);
    await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null;
    console.log(bad ? "FAIL" : "ok  ", name, JSON.stringify(r).slice(0, 1400));
    if (bad) fails.push(name + ": " + bad);
    await p.context().close();
  };

  await shot("pier_gaps_open.png", "(() => { " + setup + `
    at(15 * 60); dry();
    const L = f.innResortLayout(), mouth = L.pier.mouth, fish = L.coast.pier;
    const south = (f.props || []).filter(q => q.region === "coast" && q.y === 256);
    const across = south.filter(q => Math.abs(q.x - mouth.x) < 16);
    const g = f.ensureNav();
    const walk = (x, y) => { const c = f.NAV.cellOf(g, x, y); return f.NAV.walkable(g, c[0], c[1]); };
    for (const a of f.actors()) { a.x = 40; a.y = 40; a.task = null; a.moving = false; }
    look((fish.x + mouth.x) / 2, fish.y + 6, 0.12); hide();
    return { ver: f.version, pier: S.inn.resort.pier, across: across.map(q => q.x), mouthWalk: walk(mouth.x, mouth.y),
      fishWalk: walk(fish.x, fish.y), standWalk: walk(L.pier.stand.x, L.pier.stand.y), fromWalk: walk(L.pier.from.x, L.pier.from.y),
      spots: (f.sunsetSpots() || []).length }; })()`,
    r => r.ver !== "5.12.1" ? "ver " + r.ver
      : !r.pier ? "no pier"
      : r.across.length ? "fence still across the guest pier " + r.across
      : !r.mouthWalk || !r.standWalk || !r.fromWalk ? "guest pier not walkable"
      : !r.fishWalk ? "fishing pier mouth not walkable"
      : r.spots < 16 ? "spots " + r.spots
      : null);

  await shot("pier_guest_mouth.png", "(() => { " + setup + `
    at(15 * 60); dry();
    const L = f.innResortLayout();
    for (const a of f.actors()) { a.x = 40; a.y = 40; a.task = null; a.moving = false; }
    look(L.pier.mouth.x, L.pier.mouth.y + 2, 0.18); hide();
    const across = (f.props || []).filter(q => q.region === "coast" && q.y === 256 && Math.abs(q.x - L.pier.mouth.x) < 16);
    return { ver: f.version, x: L.pier.mouth.x, y: L.pier.mouth.y, across: across.map(q => q.x) }; })()`,
    r => r.ver !== "5.12.1" ? "ver " + r.ver : r.across.length ? "fence still across mouth " + r.across : null);

  await shot("sunset_family_spread.png", "(() => { " + setup + `
    at(17 * 60 + 15); dry();
    const people = f.actors();
    const kinds = [], seats = [], reached = [];
    const g = f.ensureNav(), gate = f.IN.COAST.gate;
    for (const a of people) {
      a.home = false; a.sleeping = false; a.away = null; a._helpWin = null; a._rest = null; a.task = null;
      const k = as(a, () => f.chooseTask());
      a.task = k; if (k) k.work = 0;
      kinds.push(k && k.kind);
      seats.push(k && k.seat);
      if (k && k.to) {
        const r = f.NAV.route(g, gate, k.to);
        reached.push(!!r.reached);
        a.x = k.to.x; a.y = k.to.y; a.moving = false; a.fx = 0; a.fy = 1; if (k) k.via = [];
      }
    }
    const minD = (() => { let d = 1e9; for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) d = Math.min(d, Math.hypot(people[i].x - people[j].x, people[i].y - people[j].y)); return d; })();
    const L = f.innResortLayout();
    look(L.coast.center.x, L.coast.center.y + 8, 0.16); hide();
    return { ver: f.version, n: people.length, kinds, seats, reached, minD: +minD.toFixed(2),
      at: people.map(a => ({ id: a.id || "farmer", x: +a.x.toFixed(1), y: +a.y.toFixed(1), seat: a.task && a.task.seat })),
      sunset: f.IN.isSunset(S.t), fade: f.sunsetFade(S.t) }; })()`,
    r => r.ver !== "5.12.1" ? "ver " + r.ver
      : !r.sunset ? "not sunset"
      : r.kinds.some(k => k !== "sunset") ? "tasks " + r.kinds.join(",")
      : r.reached.some(v => !v) ? "unreachable seat"
      : (new Set(r.seats).size < 2) ? "not spread, seats " + r.seats.join(",")
      : r.minD < 3.2 ? "too close minD=" + r.minD
      : r.n < 3 ? "family " + r.n
      : null);

  await shot("sunset_guest_pier.png", "(() => { " + setup + `
    at(17 * 60 + 20); dry();
    const people = f.actors();
    const kinds = [];
    for (const a of people) {
      a.home = false; a.sleeping = false; a.away = null; a._helpWin = null; a._rest = null;
      const k = as(a, () => f.chooseTask());
      a.task = k; if (k) { k.work = 5; k.via = []; a.x = k.to.x; a.y = k.to.y; }
      a.moving = false; a.fx = 0; a.fy = 1;
      kinds.push(k && k.seat);
    }
    const L = f.innResortLayout();
    look(L.pier.x, L.pier.mouth.y + 4, 0.2); hide();
    return { ver: f.version, n: people.length, seats: kinds,
      at: people.map(a => ({ id: a.id || "farmer", x: +a.x.toFixed(1), y: +a.y.toFixed(1), seat: a.task && a.task.seat })) }; })()`,
    r => r.ver !== "5.12.1" ? "ver " + r.ver
      : r.n < 3 ? "family"
      : !r.seats.includes("guest-pier") && !r.seats.includes("fish-pier") ? "nobody on a pier " + r.seats.join(",")
      : null);

  server.close();
  await b.close();
  if (errs.length) { console.error("page/console errors:\\n" + errs.join("\\n")); process.exit(1); }
  if (fails.length) { console.error("FAIL\\n" + fails.join("\\n")); process.exit(1); }
  console.log("ok — pier-sunset shots in " + OUT);
})().catch(e => { console.error(e); process.exit(1); });
