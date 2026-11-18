// 像素农场 · 家人规则（v5.0，第 5 阶段第一部分）：纯函数，浏览器里是 window.PFFamily，Node 里可以直接 require 做单元测试。
// No hired hands: 阿禾 keeps the market stall. The farmer chats with her, sells to her and brings small gifts; once they are
// close and the house has a spare room she moves in and farms with him, and her father takes over the stall. Bigger houses make room for children, who grow from a baby (stays at home)
// to a child (light chores) to a teen (almost everything). Nobody is paid; everyone shares the one task board.
'use strict';
(function (root) {
  const PARTNER = { id: 'partner', name: '阿禾' };
  const KID_NAMES = ['小豆', '小米'];
  const LOVE_MAX = 100;
  const CHAT = 3;                                  // a chat at the stall, once a day
  const GIFTS = { flower: 12, apple: 5, orange: 5, egg: 4 }; // small, homely gifts (wool, milk and truffles go to market); fish: GIFT_FISH
  const GIFT_FISH = 7;
  const MEET_DAY = 1;                              // she is the shopkeeper: they meet on his first trip to the stall
  const SALE = 1, SALES_DAY = 2;                   // selling to her: +1 for each of the day's first two sale trips
  const KID_AFTER = 7, KID_GAP = 10;               // days she has lived here before the first child; days between children
  const BABY_DAYS = 5, CHILD_DAYS = 14;            // age (days) when a baby becomes a child, and a child a teen
  // light chores a child can do; a teen does everything an adult does except buying at the market
  const CHILD_KINDS = ['collect', 'pet', 'petpet', 'pick', 'feed', 'tidy', 'weed', 'store'];
  const emptyToday = () => ({ day: 0, chat: 0, gift: 0, giftName: '', sales: 0 });
  const empty = () => ({ love: 0, met: 0, chatDay: 0, gifts: 0, sales: 0, moved: 0, kids: [], today: emptyToday() });
  const itemType = it => (it && typeof it === 'object') ? it.type : it; // v5.1: a basket slot may be a surprise object
  const giftValue = item => { const ty = itemType(item); return GIFTS[ty] || (/^(crucian|carp|grassc|bass|koi|sardine|seabass|snapper|tuna|sword)$/.test(ty) ? GIFT_FISH : 0); };
  // pick the gift worth the most love from a basket (null: nothing she would like)
  function bestGift(basket) { let best = null, bv = 0; for (const it of basket) { const v = giftValue(it); if (v > bv) { bv = v; best = it; } } return best; }
  // a visit to the stall: the first one each day is a chat and maybe one gift; a trip that sells something adds a little
  // (the first two a day). Returns how much love it added.
  function visit(fam, day, gift, sold = 0) {
    if (day < MEET_DAY || fam.moved) return 0;
    if (!fam.met) fam.met = day;
    let add = 0, chat = 0, giftAdd = 0, saleAdd = 0;
    if (fam.chatDay !== day) { fam.chatDay = day; fam.sales = 0; chat = CHAT; add += CHAT; if (gift) { giftAdd = giftValue(gift); add += giftAdd; fam.gifts++; } } // one chat and at most one gift a day
    if (sold > 0 && fam.sales < SALES_DAY) { fam.sales++; saleAdd = SALE; add += SALE; }
    if (!fam.today || fam.today.day !== day) fam.today = emptyToday();
    fam.today.day = day; fam.today.chat += chat; fam.today.gift += giftAdd; fam.today.sales += saleAdd;
    fam.love = Math.min(LOVE_MAX, fam.love + add); return add;
  }
  const kidCap = pop => Math.max(0, pop - 2);      // pop 3 → 1 child, pop 4 → 2 children
  // the morning check: she moves in when love is full and the house has a room for two; a child arrives when there is room
  function morning(fam, day, pop) {
    const ev = [];
    if (!fam.moved && fam.love >= LOVE_MAX) { if (pop >= 2) { fam.moved = day; ev.push('moved'); } else ev.push('waiting'); }
    if (fam.moved && fam.kids.length < Math.min(KID_NAMES.length, kidCap(pop))) {
      const last = fam.kids.length ? fam.kids[fam.kids.length - 1].born : fam.moved + KID_AFTER - KID_GAP;
      if (day - fam.moved >= KID_AFTER && day - last >= KID_GAP) { const i = fam.kids.length; fam.kids.push({ id: 'kid' + i, name: KID_NAMES[i], born: day }); ev.push('born'); }
    }
    return ev;
  }
  const kidStage = (kid, day) => { const age = day - kid.born; return age < BABY_DAYS ? 'baby' : age < CHILD_DAYS ? 'child' : 'teen'; };
  // the people who work: the farmer is always there; she once she lives here; children once they are past babyhood
  function workers(fam, day) {
    const out = []; if (fam.moved) out.push({ id: PARTNER.id, name: PARTNER.name, role: 'partner' });
    for (const k of fam.kids) { const st = kidStage(k, day); if (st !== 'baby') out.push({ id: k.id, name: k.name, role: st }); }
    return out;
  }
  // v5.3 division of labour. Each person owns a few areas of the farm: the farmer the fields and the wood, 阿禾 the animals,
  // the coop and the orchard; a child has a corner of their own (小豆 the yard and the pets, 小米 the coop and the pets) and
  // a teen takes over part of a parent's areas. Only while someone else is out working: a job in my own area scores +OWN,
  // one in an area somebody else owns -HELP (still well above fishing or resting, so nobody idles while there is work),
  // anything else 0. On his own the farmer is unaffected.
  const AREA_OF = { harvest: 'field', water: 'field', plant: 'field', fetch: 'field', buy: 'field', weed: 'field', clear: 'field', till: 'field',
    chop: 'wood', transplant: 'wood', feed: 'animal', trough: 'animal', collect: 'animal', pet: 'animal', hay: 'animal', petpet: 'pets', pick: 'orchard', tidy: 'yard' };
  const AREAS = { farmer: ['field', 'wood'], partner: ['animal', 'coop', 'orchard'],
    kid0: { child: ['yard', 'pets'], teen: ['field', 'yard', 'pets'] }, kid1: { child: ['coop', 'pets'], teen: ['animal', 'coop', 'orchard'] } };
  const OWN = 15, HELP = 18;
  const areasOf = (id, role) => { const a = AREAS[id]; return !a ? [] : Array.isArray(a) ? a : (a[role] || []); };
  // others: [{ id, role }] of the other people out working right now
  function affinity(id, role, area, others) {
    if (!area || !others || !others.length) return 0;
    if (areasOf(id, role).includes(area)) return OWN;
    return others.some(o => areasOf(o.id, o.role).includes(area)) ? -HELP : 0;
  }
  // the next child: { name, days } (days until the morning they arrive; 1 = tomorrow), { name, room: true } when the house
  // has no room yet, or null (not living together yet, or every child is here)
  function nextKid(fam, day, pop) {
    if (!fam.moved || fam.kids.length >= KID_NAMES.length) return null;
    const name = KID_NAMES[fam.kids.length];
    if (fam.kids.length >= kidCap(pop)) return { name, room: true };
    const last = fam.kids.length ? fam.kids[fam.kids.length - 1].born : fam.moved + KID_AFTER - KID_GAP;
    return { name, days: Math.max(1, Math.max(fam.moved + KID_AFTER, last + KID_GAP) - day) };
  }
  const kidText = n => !n ? '' : n.room ? `扩建房子后${n.name}才会来` : n.days === 1 ? `${n.name}明天就来了` : `${n.name}还有 ${n.days} 天到来`;
  const canDo = (role, kind) => role === 'child' ? CHILD_KINDS.includes(kind) : role === 'teen' ? kind !== 'buy' && kind !== 'fish' : kind !== 'fish';
  const api = { PARTNER, KID_NAMES, LOVE_MAX, CHAT, SALE, SALES_DAY, GIFTS, GIFT_FISH, MEET_DAY, KID_AFTER, KID_GAP, BABY_DAYS, CHILD_DAYS, CHILD_KINDS, empty, giftValue, bestGift, visit, kidCap, morning, kidStage, workers, canDo, AREA_OF, AREAS, OWN, HELP, areasOf, affinity, nextKid, kidText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFFamily = api;
})(typeof window !== 'undefined' ? window : globalThis);
