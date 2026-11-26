/**
 * 卡面农场几何：和素材一起由游戏引擎渲染时算出（scripts 见 DESIGN.md）。
 * 坐标都是相对 704×680 农场图的百分比；x/y 是地块中心（作物落脚点）。
 */
export interface PlotSpot {
  col: number;
  row: number;
  x: number;
  y: number;
}

export const SCENE_W = 704;
export const SCENE_H = 680;

export const PLOTS: PlotSpot[] = [
  { col: 0, row: 0, x: 48.68, y: 76.3 },
  { col: 1, row: 0, x: 55.33, y: 77.46 },
  { col: 2, row: 0, x: 61.98, y: 78.61 },
  { col: 3, row: 0, x: 68.64, y: 79.77 },
  { col: 4, row: 0, x: 75.29, y: 80.92 },
  { col: 5, row: 0, x: 81.94, y: 82.08 },
  { col: 0, row: 1, x: 47.19, y: 81.45 },
  { col: 1, row: 1, x: 53.84, y: 82.6 },
  { col: 2, row: 1, x: 60.49, y: 83.76 },
  { col: 3, row: 1, x: 67.14, y: 84.91 },
  { col: 4, row: 1, x: 73.8, y: 86.07 },
  { col: 5, row: 1, x: 80.45, y: 87.22 },
  { col: 0, row: 2, x: 45.69, y: 86.59 },
  { col: 1, row: 2, x: 52.34, y: 87.75 },
  { col: 2, row: 2, x: 59.0, y: 88.9 },
  { col: 3, row: 2, x: 65.65, y: 90.06 },
  { col: 4, row: 2, x: 72.3, y: 91.21 },
  { col: 5, row: 2, x: 78.95, y: 92.37 },
  { col: 0, row: 3, x: 44.2, y: 91.73 },
  { col: 1, row: 3, x: 50.85, y: 92.89 },
  { col: 2, row: 3, x: 57.5, y: 94.05 },
  { col: 3, row: 3, x: 64.16, y: 95.2 },
  { col: 4, row: 3, x: 70.81, y: 96.36 },
  { col: 5, row: 3, x: 77.46, y: 97.51 },
];

/** 作物图集一格 68×68（连同垦好的土），落脚点在格内 (35, 51) */
export const CROP_CELL = { w: 68, h: 68, ax: 35, ay: 51, stages: 4 };

/** 家人帧条一帧 80×84，脚底在帧内 (40, 80)；帧序：主角待机、走1、走2、挥锄1、挥锄2、阿禾待机 */
export const FAMILY_CELL = { w: 80, h: 84, ax: 40, ay: 80, frames: 6 };

/** 人物站位（百分比，脚底） */
export const SPOTS = {
  farmerIdle: { x: 45, y: 67.4 },
  farmerWork: { x: 41, y: 83.2 },
  farmerNight: { x: 21, y: 54.1 },
  helperIdle: { x: 22, y: 73.5 },
  /** 「熟了」气泡挂在田地上方（位置同 index.css .ripe-bubble） */
  ripeBubble: { x: 64, y: 70 },
};

/** 小商店道具帧条一格 72×112，脚底在格内 (36, 104)；帧序同 PROP_FRAME */
export const PROP_CELL = { w: 72, h: 112, ax: 36, ay: 104, frames: 6 };
export const PROP_FRAME = { chicken: 0, pig: 1, flowerpot: 2, bench: 3, stonelamp: 4, scarecrow: 5 } as const;
export type PropKind = keyof typeof PROP_FRAME;

export interface PropSpot {
  kind: PropKind;
  x: number;
  y: number;
  /** 朝左（镜像） */
  flip?: boolean;
}

/** 鸡舍各级出现的小动物（脚底百分比，位置取自引擎演示存档里鸡和猪站的地方） */
export const COOP_PROPS: PropSpot[][] = [
  [],
  [
    { kind: 'chicken', x: 11.8, y: 72.8 },
    { kind: 'chicken', x: 16.1, y: 76.8, flip: true },
  ],
  [
    { kind: 'chicken', x: 10.1, y: 77.2, flip: true },
    { kind: 'chicken', x: 6.2, y: 73.6 },
  ],
  [{ kind: 'pig', x: 57.1, y: 31.2 }],
];

/** 主屋各级多出来的装饰：门口花盆 → 屋旁长椅 → 去田里那条路边的石灯 */
export const HOUSE_PROPS: PropSpot[][] = [
  [],
  [
    { kind: 'flowerpot', x: 11.6, y: 54.6 },
    { kind: 'flowerpot', x: 44.2, y: 54.2 },
  ],
  [{ kind: 'bench', x: 50.5, y: 45.5 }],
  [
    { kind: 'stonelamp', x: 66.2, y: 63.5 },
    { kind: 'stonelamp', x: 80.4, y: 63.5 },
  ],
];

/** 田扩满时立起的稻草人 */
export const SCARECROW: PropSpot = { kind: 'scarecrow', x: 90.6, y: 84.5 };

/** 鸡舍收益 / 买东西提示飘字的位置 */
export const SHOP_SPOTS = {
  land: { x: 66, y: 72 },
  seed: { x: 62, y: 72 },
  well: { x: 75, y: 40 },
  coop: { x: 22, y: 64 },
  house: { x: 30, y: 30 },
  helper: { x: 28, y: 62 },
};

/* 田地点击区、「熟了」气泡、夜里 Zz 的固定位置写在 index.css（.field-hit / .ripe-bubble / .sleep-bubble） */

/** 换算成 left/top 百分比（相对农场图） */
export function cropBox(spot: PlotSpot): { left: string; top: string } {
  return {
    left: `${(spot.x - (CROP_CELL.ax / SCENE_W) * 100).toFixed(2)}%`,
    top: `${(spot.y - (CROP_CELL.ay / SCENE_H) * 100).toFixed(2)}%`,
  };
}

export function propBox(p: PropSpot): { left: string; top: string } {
  return {
    left: `${(p.x - (PROP_CELL.ax / SCENE_W) * 100).toFixed(2)}%`,
    top: `${(p.y - (PROP_CELL.ay / SCENE_H) * 100).toFixed(2)}%`,
  };
}

export function actorBox(x: number, y: number): { left: string; top: string } {
  return {
    left: `${(x - (FAMILY_CELL.ax / SCENE_W) * 100).toFixed(2)}%`,
    top: `${(y - (FAMILY_CELL.ay / SCENE_H) * 100).toFixed(2)}%`,
  };
}
