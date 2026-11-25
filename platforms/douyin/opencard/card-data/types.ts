/**
 * CardData 类型定义（SSOT）。
 * 同步：server/src/card-data/card-data.types.ts 与 buildCardData() 返回值。
 */

/** 作物生长阶段图：种子 → 幼苗 → 成熟 */
export interface CropStageImages {
  seed: string;
  growing: string;
  ripe: string;
}

export interface CardCrop {
  id: string;
  name: string;
  /** 卡面成熟所需秒数 */
  growSeconds: number;
  /** 收获一次得到的金币 */
  price: number;
  /** 种子按钮上的小图标（成熟图） */
  icon: string;
  stages: CropStageImages;
}

export interface FarmerSheets {
  /** 4 帧横向帧条 */
  hoe: string;
  water: string;
  walk: string;
  frames: number;
}

export interface FarmViewPayload {
  plotCount: number;
  soil: string;
  coinIcon: string;
  seedIcon: string;
  farmer: FarmerSheets;
  crops: CardCrop[];
  defaultCropId: string;
  copy: {
    emptyHint: string;
    growingHint: string;
    ripeHint: string;
    harvestedLabel: string;
  };
}

export interface ErrorViewPayload {
  message: string;
  retryLabel: string;
}

export interface CardDataViews {
  farm: FarmViewPayload;
  error: ErrorViewPayload;
}

export interface CardData {
  contractVersion: string;
  displayMode: 'farm' | 'error';
  views: CardDataViews;
  userState?: {
    /** 服务端记录的卡面累计金币 */
    coins: number;
    /** 服务端记录的卡面累计收获次数 */
    harvests: number;
  };
  meta?: {
    source?: string;
  };
}

/** 平台 dy_card/data 外层响应壳（固定） */
export interface DyCardApiResponse {
  success: boolean;
  data: string;
  message?: string;
}
