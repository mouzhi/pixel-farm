/**
 * CardData 类型定义（SSOT）。
 * 同步：server/src/card-data/card-data.types.ts 与 buildCardData() 返回值。
 */

/** 同一张图的白天 / 夜晚两版（都由游戏引擎同一视角渲染） */
export interface DayNightArt {
  day: string;
  night: string;
}

export interface CardCrop {
  id: string;
  name: string;
  /** 卡面从播种到成熟的秒数 */
  growSeconds: number;
  /** 收获一块地得到的金币 */
  price: number;
}

export interface FarmViewPayload {
  /** 农场一角：农舍、水井、池塘和 6×4 空地（未开垦、不含小动物），704×680 */
  scene: DayNightArt;
  /** 作物图集（连同垦好的土）：列 = 阶段（种子/幼苗/长大/成熟），行 = crops 顺序，每格 68×68 */
  cropAtlas: DayNightArt;
  /** 家人帧条：主角 待机/走1/走2/挥锄1/挥锄2，阿禾 待机；每帧 80×84 */
  familySheet: DayNightArt;
  /** 小商店买到的东西：鸡、猪、花盆、长椅、石灯、稻草人；每格 72×112，脚底在 (36, 104) */
  propSheet: DayNightArt;
  coinIcon: string;
  /** 田地四行依次种的作物 */
  crops: CardCrop[];
  /** 帮你干活的家人 */
  helperName: string;
  /** 离开期间每分钟攒下的金币，以及最多算几小时（主屋 0 级；升级后卡面按倍率算） */
  offlinePerMinute: number;
  offlineCapHours: number;
  copy: {
    ripeCta: string;
    waitCta: string;
    collect: string;
    nightHint: string;
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
