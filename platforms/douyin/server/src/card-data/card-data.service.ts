import { Injectable } from '@nestjs/common';
import type { CardData } from './card-data.types';
import { CARD_PLOT_COUNT, CROPS } from '../farm/farm-config';
import { FARM_ASSETS } from '../farm/farm-assets';
import { FarmStoreService } from '../farm/farm-store.service';

@Injectable()
export class CardDataService {
  constructor(private readonly store: FarmStoreService) {}

  /** 组装卡面完整 CardData：作物配置、素材地址、文案与服务端记录的累计金币 */
  buildCardData(openId?: string): CardData {
    const progress = this.store.get(openId);
    return {
      contractVersion: '1.0.0',
      displayMode: 'farm',
      views: {
        farm: {
          plotCount: CARD_PLOT_COUNT,
          soil: FARM_ASSETS.soil,
          coinIcon: FARM_ASSETS.coin,
          seedIcon: FARM_ASSETS.seed,
          farmer: {
            hoe: FARM_ASSETS.farmerHoe,
            water: FARM_ASSETS.farmerWater,
            walk: FARM_ASSETS.farmerWalk,
            frames: 4,
          },
          crops: CROPS.map((crop) => ({
            id: crop.id,
            name: crop.name,
            growSeconds: crop.cardGrowSeconds,
            price: crop.cardPrice,
            icon: crop.stages.ripe,
            stages: crop.stages,
          })),
          defaultCropId: 'carrot',
          copy: {
            emptyHint: '点空地播种',
            growingHint: '还要{s}秒',
            ripeHint: '熟了，点我收获',
            harvestedLabel: '已收获',
          },
        },
        error: {
          message: '农场暂时打不开',
          retryLabel: '重试',
        },
      },
      userState: {
        coins: progress.coins,
        harvests: progress.harvests,
      },
      meta: { source: 'farm' },
    };
  }

  buildDyCardResponse(openId?: string): { success: boolean; data: string; message?: string } {
    try {
      return { success: true, data: JSON.stringify(this.buildCardData(openId)) };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '获取卡片数据失败';
      console.error('[CardData] build failed:', error);
      return { success: false, data: '', message };
    }
  }
}
