// 像素农场 · v5.12.2：东门大道、停车场和度假沙滩的体素（规则在 east.js）。v5.12.6：旅游大巴和站牌灯（规则在 bus.js）。
// game.js 在模型就绪后调用 mount(X)，买下或钟点变化时 sync()（按 key 决定，不必每帧重建）。
'use strict';
(function (root) {
  const EA = root.PFEast || (typeof require === 'function' ? require('./east.js') : null);
  const BUS = root.PFBus || null; // v5.12.6 旅游大巴 (bus.js)
  const PAL = root.PF_PALETTE, R = PAL ? PAL.ramps : null;
  const Wd = R && R.wood, St = R && R.stone, Wt = R && R.water, Rf = R && R.roof, Ac = R && R.accent, G = R && R.green, ink = R && R.ink && R.ink[0];
  let X = null, S = null, MD = null, lastKey = '', mounted = false;
  const own = [];
  const CAR_OWN = []; // moving cars: stripped and re-added when traffic changes

  function makeModels(x) {
    const B = x.buildModel;
    const parasol = (c1, c2) => B(14, 14, 18, (px, py, z) => {
      const cx = 6.5, cy = 6.5, d = Math.hypot(px - cx, py - cy);
      if (d < 0.8 && z >= 1 && z <= 14) return Wd[2];
      if (z >= 11 && z <= 16 && d < 6.4) {
        const top = 16 - d * 0.55;
        if (z <= top && z >= top - 1.4) return ((Math.atan2(py - cy, px - cx) + Math.PI) / (Math.PI / 4) | 0) % 2 ? c1 : c2;
      }
      if (z <= 1 && d < 1.1) return Wd[1];
      return null;
    });
    const chair = (c) => B(10, 12, 8, (px, py, z) => {
      if (z <= 1 && px >= 1 && px <= 8 && py >= 1 && py <= 10) return Wd[3]; // board
      if (z >= 1 && z <= 5 && py >= 1 && py <= 3 && px >= 1 && px <= 8) return c || Rf[2]; // back
      if ((px <= 2 || px >= 7) && (py <= 2 || py >= 9) && z <= 3) return Wd[2]; // legs
      if (z === 2 && px >= 2 && px <= 7 && py >= 3 && py <= 9) return c || Rf[2];
      return null;
    });
    const tower = B(12, 12, 28, (px, py, z) => {
      const post = (px <= 2 || px >= 9) && (py <= 2 || py >= 9);
      if (post && z <= 20) return z % 4 === 0 ? Wd[1] : Wd[2];
      if (z >= 18 && z <= 21 && px >= 1 && px <= 10 && py >= 1 && py <= 10) return Wd[3]; // deck
      if (z >= 21 && z <= 26 && px >= 2 && px <= 9 && py >= 2 && py <= 9) {
        const edge = px <= 2 || px >= 9 || py <= 2 || py >= 9;
        if (edge) return Ac[0];
        if (py >= 8 && px >= 4 && px <= 7 && z <= 24) return null; // opening south
        return '#3a5a8c';
      }
      if (z >= 26 && z <= 27 && px >= 1 && px <= 10 && py >= 1 && py <= 10) return Rf[2]; // roof
      if (z === 0 && px >= 3 && px <= 8 && py >= 3 && py <= 8) return St[2];
      return null;
    });
    const plank = B(10, 6, 3, (px, py, z) => {
      if (z === 0 && px >= 0 && px <= 9 && py >= 0 && py <= 5) return (px % 3 === 0) ? Wd[1] : Wd[3];
      if (z === 1 && (py === 0 || py === 5) && px >= 0 && px <= 9) return Wd[2];
      return null;
    });
    const deck = B(20, 14, 8, (px, py, z) => {
      if (z <= 1 && px >= 1 && px <= 18 && py >= 1 && py <= 12) return (px + py) % 3 ? Wd[3] : Wd[4];
      if (z >= 1 && z <= 5 && py <= 2 && px >= 1 && px <= 18) return Wd[2]; // rail at the back (north)
      if ((px <= 2 || px >= 17) && z >= 1 && z <= 5 && py >= 1 && py <= 3) return Wd[1];
      if (z === 2 && py >= 8 && py <= 11 && ((px >= 3 && px <= 7) || (px >= 12 && px <= 16))) return Wd[4]; // benches facing the sea
      return null;
    });
    const body = ['#3a5a8c', '#a8432e', '#c9a85a', '#4a7a4a'];
    const car = (col) => B(18, 10, 9, (px, py, z) => {
      // a compact private car, nose along +x. Windows, wheels, a pale roof.
      if ((px <= 2 || px >= 15) && (py <= 1 || py >= 8) && z <= 3) { // wheels
        if (z >= 1 && z <= 3 && (py <= 1 || py >= 8)) return z === 2 ? ink : '#2a2a32';
      }
      if (z === 0 && px >= 2 && px <= 15 && py >= 2 && py <= 7) return '#2a2a32';
      if (z >= 1 && z <= 4 && px >= 1 && px <= 16 && py >= 1 && py <= 8) {
        if (z === 4) return '#e8e0d0';
        if ((px >= 5 && px <= 8 || px >= 10 && px <= 13) && z >= 2 && z <= 3 && py >= 2 && py <= 7) return Wt[3];
        return col;
      }
      if (z === 1 && px >= 16 && px <= 17 && py >= 3 && py <= 6) return '#f2cf55'; // headlight
      return null;
    });
    const sign = B(8, 4, 16, (px, py, z) => {
      if (px >= 3 && px <= 4 && py >= 1 && py <= 2 && z <= 10) return Wd[2];
      if (z >= 10 && z <= 15 && px >= 0 && px <= 7 && py >= 0 && py <= 3) return (z === 10 || z === 15 || px === 0 || px === 7) ? Wd[1] : Ac[0];
      return null;
    });
    const nameplate = B(28, 6, 12, (px, py, z) => {
      if (z <= 1 && px >= 0 && px <= 27 && py >= 0 && py <= 5) return St[2];
      if (z >= 2 && z <= 10 && px >= 1 && px <= 26 && py >= 1 && py <= 4) {
        if (z === 2 || z === 10 || px === 1 || px === 26) return Wd[1];
        return Wd[4];
      }
      return null;
    });
    // v5.12.6 旅游大巴: a coach (voxels are half a world unit: 52 x 20 = 26 x 10 in its 32 x 20 bay), nose along +x: two-tone body,
    // a long window band, a door on the flank that faces the lot, a luggage box on the roof
    const coach = (c1, c2, dy) => B(52, 20, 24, (px, py, z) => {
      const L = 51, Wd2 = 19;
      if ((px >= 6 && px <= 11 || px >= 39 && px <= 44) && (py <= 1 || py >= Wd2 - 1) && z <= 5) { const c = Math.hypot((px - (px < 20 ? 8.5 : 41.5)), z - 2.5); return c < 1.4 ? St[2] : c < 3.2 ? '#2a2a32' : null; } // wheels
      if (py < 2 || py > Wd2 - 2) { if (!(py === 1 || py === Wd2 - 1)) return null; }
      if (px < 0 || px > L) return null;
      if (z === 0) return px >= 3 && px <= L - 3 && py >= 3 && py <= Wd2 - 3 ? '#2a2a32' : null;
      if (z <= 1) return null;
      if (z >= 22) return z === 23 ? (px >= 14 && px <= 36 && py >= 5 && py <= Wd2 - 5 ? '#d8d2c4' : null) : '#f2ede0'; // roof + luggage box
      const shell = px === 0 || px === L || py === 1 || py === Wd2 - 1;
      if (!shell) return null;
      if (px === L && z >= 11 && z <= 19 && py >= 3 && py <= Wd2 - 3) return Wt[3];                 // windscreen
      if (px === L && z >= 4 && z <= 5 && (py <= 5 || py >= Wd2 - 5)) return '#f2cf55';             // headlights
      if (px === 0 && z >= 4 && z <= 5 && (py <= 5 || py >= Wd2 - 5)) return '#c8402e';             // tail lights
      if (px === 0 && z >= 13 && z <= 19 && py >= 4 && py <= Wd2 - 4) return Wt[2];                 // rear window
      if (py === dy && px >= 44 && px <= 49 && z >= 2 && z <= 19) return z >= 10 ? Wt[2] : St[2];  // the door, front
      if ((py === 1 || py === Wd2 - 1) && z >= 13 && z <= 19 && px >= 3 && px <= 42) return px % 7 === 3 ? c1 : Wt[3]; // window band, pillars
      if (z >= 8 && z <= 10) return c2;                                                             // the stripe
      if (z <= 3) return St[1];                                                                     // skirt
      return c1;
    });
    // a bus-stop pole with a lamp head (lit at dusk by east.js / bus.js lights)
    const busstop = B(6, 4, 22, (px, py, z) => {
      if (px >= 2 && px <= 3 && py >= 1 && py <= 2 && z <= 17) return St[1];
      if (z >= 12 && z <= 16 && px >= 0 && px <= 5 && py >= 1 && py <= 2) return z === 12 || z === 16 ? St[1] : '#3a7a5a';
      if (z >= 18 && z <= 20 && px >= 1 && px <= 4 && py >= 0 && py <= 3) return z === 18 ? '#fff2a8' : St[1];
      return null;
    });
    return {
      coach0: coach('#f2ede0', '#3a7a5a', 1), coach1: coach('#f2ede0', '#3a5a8c', 18) /* bay 1 parks nose west: its door is on the other flank so it still faces the lot */, busstop,
      parasolA: parasol(Rf[2], Ac[0]), parasolB: parasol(Wt[3], Ac[0]),
      parasolC: parasol(G[2], Ac[0]), parasolD: parasol('#3a5a8c', Ac[0]),
      chairA: chair(Rf[2]), chairB: chair('#3a5a8c'), chairC: chair(G[2]), chairD: chair('#c9a85a'),
      tower, plank, deck, sign, nameplate,
      car0: car(body[0]), car1: car(body[1]), car2: car(body[2]), car3: car(body[3])
    };
  }

  const carsOf = () => [MD.car0, MD.car1, MD.car2, MD.car3];
  const umbOf = () => [MD.parasolA, MD.parasolB, MD.parasolC, MD.parasolD];
  const chairOf = () => [MD.chairA, MD.chairB, MD.chairC, MD.chairD];

  function flags() {
    const e = S && S.eff || {};
    return { eastave: !!e.eastave, vacbeach: !!e.vacbeach, town: !!e.town };
  }

  function clear(list) {
    if (!X || !X.props) { list.length = 0; return; }
    for (const p of list) {
      const i = X.props.indexOf(p);
      if (i >= 0) X.props.splice(i, 1);
    }
    list.length = 0;
  }
  function add(model, x, y, rot, extra, into) {
    const p = X.addProp(model, x, y, rot || 0, extra || {});
    (into || own).push(p);
    return p;
  }

  function placeStatic(o) {
    clear(own);
    if (o.eastave) {
      add(MD.nameplate, EA.AVENUE.x0 + 18, EA.AVENUE.y - 10, 0, { eastSign: 1, big: 0 });
      add(MD.sign, EA.PARK.x0 + 10, EA.PARK.y0 + 8, 0, { parkSign: 1, big: 0 });
      // reserved bus bays: a nameplate on the south row, no bus body
      for (const s of EA.BUS_SLOTS) add(MD.sign, s.x, s.y - 10, 0, { busBay: 1, big: 0 });
      if (BUS) for (const q of BUS.LAMPS) add(MD.busstop, q.x, q.y, 0, { busStop: 1, big: 0 }); // v5.12.6
    }
    if (o.vacbeach) {
      const umb = umbOf(), ch = chairOf();
      EA.UMBRELLAS.forEach((u, i) => add(umb[i % umb.length], u.x, u.y, 0, { vacUmb: i, big: 0 }));
      EA.CHAIRS.forEach((c, i) => add(ch[i % ch.length], c.x, c.y, 0, { vacChair: i, big: 0 }));
      add(MD.tower, EA.TOWER.x, EA.TOWER.y, 0, { vacTower: 1, big: 1 });
      for (const s of EA.SUNSETS) add(MD.deck, s.x, s.y, 0, { vacSunset: 1, big: 1 });
      const bw = EA.boardwalk(!!o.eastave);
      for (let x = bw.x0; x < bw.x1; x += 8) add(MD.plank, x, bw.y, 0, { vacWalk: 1, big: 0 });
      for (const s of EA.BOARD_SPURS) if (s.x < bw.x1) add(MD.plank, s.x, s.y + 6, Math.PI / 2, { vacWalk: 1, big: 0 });
    }
  }

  function placeCars(tr) {
    clear(CAR_OWN);
    if (!tr || !MD) return;
    const body = carsOf();
    for (const c of (tr.parked || [])) add(body[c.color % 4], c.x, c.y, c.rot || 0, { eastCar: c.id, parked: 1, big: 1 }, CAR_OWN);
    for (const c of (tr.moving || [])) add(body[c.color % 4], c.x, c.y, c.rot || 0, { eastCar: c.id, moving: 1, big: 1 }, CAR_OWN);
    for (const b of (tr.buses || [])) add(b.color ? MD.coach1 : MD.coach0, b.x, b.y, b.rot || 0, { eastBus: b.id, busState: b.state, big: 1 }, CAR_OWN); // v5.12.6
  }

  function sync(force) {
    if (!mounted || !EA) return;
    const o = flags();
    const k = [o.eastave | 0, o.vacbeach | 0].join('|');
    if (force || k !== lastKey) { lastKey = k; placeStatic(o); }
  }

  function syncTraffic(tr) { if (!mounted) return; placeCars(tr); }

  function lights(hz, T) {
    if (!mounted || !EA) return;
    const o = flags();
    for (const l of EA.lightsAt(T, { beach: o.vacbeach, avenue: o.eastave })) hz(l.x, l.y, l.r, l.z, l.a);
    if (BUS) for (const l of BUS.lightsAt(T, o.eastave)) hz(l.x, l.y, l.r, l.z, l.a); // v5.12.6: the two bus-stop lamps
  }

  function mount(x) { X = x; S = x.S; MD = makeModels(x); mounted = true; lastKey = ''; sync(true); return api; }

  const api = { mount, sync, syncTraffic, lights, models: () => MD, flags };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PFEastArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
