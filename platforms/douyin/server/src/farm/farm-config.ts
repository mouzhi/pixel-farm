import { FARM_ASSETS as A } from './farm-assets';

export type CropId = 'carrot' | 'cabbage' | 'pumpkin';

interface CropDef {
  id: CropId;
  name: string;
  /** 卡面：几秒就熟 */
  cardGrowSeconds: number;
  cardPrice: number;
  /** 落地页挂机：慢一些、值钱一些 */
  idleGrowSeconds: number;
  idlePrice: number;
  /** 落地页解锁价格，0 表示默认拥有 */
  unlockCost: number;
  stages: { seed: string; growing: string; ripe: string };
}

export const CROPS: CropDef[] = [
  {
    id: 'carrot',
    name: '胡萝卜',
    cardGrowSeconds: 4,
    cardPrice: 8,
    idleGrowSeconds: 20,
    idlePrice: 10,
    unlockCost: 0,
    stages: { seed: A.cropSprout, growing: A.carrot2, ripe: A.carrot3 },
  },
  {
    id: 'cabbage',
    name: '卷心菜',
    cardGrowSeconds: 6,
    cardPrice: 15,
    idleGrowSeconds: 45,
    idlePrice: 28,
    unlockCost: 150,
    stages: { seed: A.cropSprout, growing: A.cabbage2, ripe: A.cabbage3 },
  },
  {
    id: 'pumpkin',
    name: '南瓜',
    cardGrowSeconds: 9,
    cardPrice: 28,
    idleGrowSeconds: 90,
    idlePrice: 70,
    unlockCost: 600,
    stages: { seed: A.cropSprout, growing: A.pumpkin2, ripe: A.pumpkin3 },
  },
];

export function findCrop(id: unknown): CropDef | undefined {
  return CROPS.find((crop) => crop.id === id);
}

export const CARD_PLOT_COUNT = 6;

/** 落地页挂机农场规则 */
export const IDLE_RULES = {
  startPlots: 4,
  maxPlots: 9,
  plotBaseCost: 60,
  plotCostGrowth: 1.7,
  fertilizerMaxLevel: 5,
  fertilizerBaseCost: 120,
  fertilizerCostGrowth: 2,
  /** 每级生长速度 +15% */
  fertilizerSpeedPerLevel: 0.15,
  /** 离线收益最多计算 8 小时 */
  offlineCapSeconds: 8 * 3600,
  /** 农夫自动收获一块地的间隔 */
  farmerStepSeconds: 1.2,
};
