import { Injectable } from '@nestjs/common';
import type { CardData } from './card-data.types';
import { FARM_ASSETS } from '../farm/farm-assets';
import { CARD_ART } from './card-art';

/** 卡面田地四行依次种的作物（顺序与作物图集的行一致） */
const CARD_CROPS = [
  { id: 'carrot', name: '胡萝卜', growSeconds: 20, price: 8 },
  { id: 'cabbage', name: '卷心菜', growSeconds: 30, price: 12 },
  { id: 'strawberry', name: '草莓', growSeconds: 40, price: 16 },
  { id: 'pumpkin', name: '南瓜', growSeconds: 55, price: 22 },
];

@Injectable()
export class CardDataService {
  /** 组装卡面完整 CardData：素材地址、作物节奏与文案。卡面进度只存在本机，不读写服务端。 */
  buildCardData(): CardData {
    return {
      contractVersion: '2.1.0',
      displayMode: 'farm',
      views: {
        farm: {
          scene: { day: CARD_ART.sceneDay, night: CARD_ART.sceneNight },
          cropAtlas: { day: CARD_ART.cropsDay, night: CARD_ART.cropsNight },
          familySheet: { day: CARD_ART.familyDay, night: CARD_ART.familyNight },
          propSheet: { day: CARD_ART.propsDay, night: CARD_ART.propsNight },
          coinIcon: FARM_ASSETS.coin,
          crops: CARD_CROPS,
          helperName: '阿禾',
          offlinePerMinute: 6,
          offlineCapHours: 8,
          copy: {
            ripeCta: '一键收菜',
            waitCta: '等它长大',
            collect: '收下',
            nightHint: '夜里菜也在长',
          },
        },
        error: {
          message: '农场暂时打不开',
          retryLabel: '重试',
        },
      },
      meta: { source: 'farm' },
    };
  }

  buildDyCardResponse(): { success: boolean; data: string; message?: string } {
    try {
      return { success: true, data: JSON.stringify(this.buildCardData()) };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '获取卡片数据失败';
      console.error('[CardData] build failed:', error);
      return { success: false, data: '', message };
    }
  }
}
