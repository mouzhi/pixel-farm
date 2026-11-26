import type { CardCrop } from '@/services/card-data';
import { PLOTS } from '@/services/farm-layout';

/** 卡面进度只存在本机（卡片自己的本地缓存），不联网、不读玩家游戏存档 */
export const STORE_KEY = 'pf-card-farm-v3';

export type ShopId = 'land' | 'helper' | 'seed' | 'well' | 'coop' | 'house';
export type Levels = Record<ShopId, number>;

export interface FarmSave {
  v: 3;
  coins: number;
  harvests: number;
  firstAt: number;
  lastAt: number;
  /** 每块地的播种时间（毫秒） */
  plantedAt: number[];
  /** 小商店各项等级 0..3 */
  lv: Levels;
}

export type Stage = 0 | 1 | 2 | 3;

/* ---------- 小商店：看它挂机 → 钱够了 → 买东西升级 ---------- */

export interface ShopItem {
  id: ShopId;
  name: string;
  /** 买第 1/2/3 级的价格（越来越贵） */
  costs: number[];
}

/** 商店顺序 = 价格从低到高，第一次收完菜就买得起第一样 */
export const SHOP: ShopItem[] = [
  { id: 'land', name: '扩地', costs: [60, 180, 450] },
  { id: 'helper', name: '雇家人', costs: [80, 250, 700] },
  { id: 'seed', name: '新作物', costs: [100, 300, 800] },
  { id: 'well', name: '水井', costs: [120, 360, 900] },
  { id: 'coop', name: '鸡舍', costs: [150, 400, 1000] },
  { id: 'house', name: '主屋', costs: [200, 600, 1500] },
];
export const MAX_LEVEL = 3;

/** 扩地：一开始种左边 3 列（12 块），每级多开一列，满级 24 块 */
export const openCols = (lv: Levels): number => 3 + lv.land;
/** 新作物：解锁到第几种（胡萝卜 → 卷心菜 → 草莓 → 南瓜） */
export const cropCount = (lv: Levels): number => 1 + lv.seed;
/** 水井：浇得勤，长得快 */
export const WELL_SPEED = [1, 1.25, 1.5, 2];
/** 鸡舍：每 10 秒小动物下的蛋 / 产出的金币 */
export const COOP_GOLD = [0, 3, 7, 14];
export const COOP_EVERY_MS = 10000;
/** 主屋：离线收益倍率和多存几小时 */
export const HOUSE_RATE = [1, 1.7, 2.5, 3.7];
export const HOUSE_EXTRA_HOURS = [0, 2, 4, 8];
/** 雇家人：阿禾多久去收一次菜、一次收几块（0 级她还没来） */
export const HELPER_EVERY_MS = [0, 5000, 3800, 2800];
export const HELPER_PICKS = [0, 1, 1, 2];

export function costOf(item: ShopItem, level: number): number | null {
  return level < item.costs.length ? item.costs[level] : null;
}

export function affordableCount(save: FarmSave): number {
  return SHOP.filter((item) => {
    const cost = costOf(item, save.lv[item.id]);
    return cost !== null && save.coins >= cost;
  }).length;
}

export function offlineRate(perMinute: number, capHours: number, lv: Levels): { perMinute: number; capHours: number } {
  return { perMinute: Math.round(perMinute * HOUSE_RATE[lv.house]), capHours: capHours + HOUSE_EXTRA_HOURS[lv.house] };
}

/** 下一级会带来什么（商店格子里的一行说明） */
export function nextEffect(id: ShopId, lv: Levels, crops: CardCrop[], helperName: string, basePerMinute: number): string {
  const n = lv[id];
  if (n >= MAX_LEVEL) return '已经满级';
  switch (id) {
    case 'land':
      return `田 ${openCols(lv) * 4} → ${(openCols(lv) + 1) * 4} 块`;
    case 'seed': {
      const crop = crops[cropCount(lv)];
      return crop ? `种${crop.name} 每块${crop.price}` : '已经满级';
    }
    case 'well':
      return `长得快 ×${WELL_SPEED[n + 1]}`;
    case 'coop':
      return n === 0 ? '养 2 只鸡下蛋' : n === 1 ? '再添 2 只鸡' : '来一头小猪';
    case 'house':
      return `离线 ${Math.round(basePerMinute * HOUSE_RATE[n + 1])}/分钟`;
    case 'helper':
      return n === 0 ? `${helperName}来帮你收菜` : n === 1 ? `${helperName}手脚更快` : `${helperName}一次收两块`;
    default:
      return '';
  }
}

export function zeroLevels(): Levels {
  return { land: 0, helper: 0, seed: 0, well: 0, coop: 0, house: 0 };
}

export function cropOfRow(crops: CardCrop[], row: number, lv?: Levels): CardCrop | undefined {
  const pool = lv ? crops.slice(0, Math.max(1, cropCount(lv))) : crops;
  return pool[row % Math.max(1, pool.length)];
}

/** 这块地开垦了没有 */
export function plotOpen(col: number, lv: Levels): boolean {
  return col < openCols(lv);
}

export function growMs(crop: CardCrop | undefined, lv: Levels): number {
  return ((crop?.growSeconds ?? 30) * 1000) / WELL_SPEED[lv.well];
}

export function stageOf(crop: CardCrop | undefined, plantedAt: number, now: number, lv: Levels): Stage {
  if (!crop) return 0;
  const p = (now - plantedAt) / growMs(crop, lv);
  if (p >= 1) return 3;
  if (p >= 0.5) return 2;
  if (p >= 0.06) return 1;
  return 0;
}

/** 第一次打开：12 块地里大半已经熟了，一眼就能收；收完正好够买第一样 */
export function freshSave(crops: CardCrop[], now: number): FarmSave {
  const lv = zeroLevels();
  return {
    v: 3,
    coins: 0,
    harvests: 0,
    firstAt: now,
    lastAt: now,
    lv,
    plantedAt: PLOTS.map((spot, i) => {
      const grow = growMs(cropOfRow(crops, spot.row, lv), lv);
      const ripe = (i * 7 + spot.row * 3) % 10 < 7;
      return ripe ? now - grow - 1000 : now - grow * (0.25 + ((i * 13) % 6) / 10);
    }),
  };
}

const clampLevel = (n: unknown): number => (typeof n === 'number' && n > 0 ? Math.min(MAX_LEVEL, Math.floor(n)) : 0);

export function parseSave(raw: unknown): FarmSave | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const s = value as Partial<FarmSave>;
  if (s.v !== 3 || !Array.isArray(s.plantedAt) || s.plantedAt.length !== PLOTS.length) return null;
  if (typeof s.coins !== 'number' || typeof s.firstAt !== 'number' || typeof s.lastAt !== 'number') return null;
  const src = (s.lv && typeof s.lv === 'object' ? s.lv : {}) as Partial<Levels>;
  const lv = zeroLevels();
  (Object.keys(lv) as ShopId[]).forEach((k) => {
    lv[k] = clampLevel(src[k]);
  });
  return {
    v: 3,
    coins: Math.max(0, Math.floor(s.coins)),
    harvests: Math.max(0, Math.floor(s.harvests ?? 0)),
    firstAt: s.firstAt,
    lastAt: s.lastAt,
    plantedAt: s.plantedAt.map((t) => (typeof t === 'number' ? t : 0)),
    lv,
  };
}

export interface OfflineGain {
  minutes: number;
  coins: number;
  baskets: number;
}

/** 离开超过 2 分钟才结算；最多算 capHours 小时 */
export function offlineGain(lastAt: number, now: number, perMinute: number, capHours: number): OfflineGain | null {
  const ms = Math.min(now - lastAt, capHours * 3600 * 1000);
  if (!(ms >= 120 * 1000)) return null;
  const minutes = Math.floor(ms / 60000);
  const coins = Math.max(1, Math.round(minutes * perMinute));
  return { minutes, coins, baskets: Math.max(1, Math.round(coins / 20)) };
}

export function formatAway(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}分钟`;
  return m > 0 ? `${h}小时${m}分` : `${h}小时`;
}

export function formatCoins(n: number): string {
  const s = String(Math.max(0, Math.floor(n)));
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return out;
}

export type Light = 'day' | 'dusk' | 'night';

export interface Clock {
  hhmm: string;
  phase: string;
  light: Light;
}

/** 卡面按手机本地时间走白天黑夜，时段叫法和游戏一致 */
export function clockOf(date: Date): Clock {
  const h = date.getHours();
  const m = date.getMinutes();
  const hhmm = `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
  const phase =
    h < 5 ? '深夜' : h < 8 ? '清晨' : h < 11 ? '上午' : h < 13 ? '中午' : h < 17 ? '下午' : h < 19 ? '傍晚' : h < 23 ? '夜晚' : '深夜';
  const light: Light = h >= 19 || h < 5 ? 'night' : h >= 17 ? 'dusk' : 'day';
  return { hhmm, phase, light };
}

export function dayNumber(firstAt: number, now: number): number {
  const a = new Date(firstAt);
  const b = new Date(now);
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}
