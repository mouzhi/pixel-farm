import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { CROPS, IDLE_RULES, findCrop } from './farm-config';
import { FARM_ASSETS } from './farm-assets';
import { FarmStoreService } from './farm-store.service';

interface CardHarvestBody {
  cropId?: string;
}

/** 挂机农场配置 + 卡面带来的金币（落地页使用） */
export interface FarmStateResponse {
  success: boolean;
  message?: string;
  data?: {
    assets: {
      soil: string;
      grass: string;
      house: string;
      hero: string;
      coin: string;
      seed: string;
      farmerHoe: string;
      farmerWater: string;
      farmerWalk: string;
    };
    crops: {
      id: string;
      name: string;
      growSeconds: number;
      price: number;
      unlockCost: number;
      stages: { seed: string; growing: string; ripe: string };
    }[];
    rules: typeof IDLE_RULES;
    card: { coins: number; harvests: number; claimable: number };
  };
}

@Controller('api')
export class FarmController {
  constructor(private readonly store: FarmStoreService) {}

  /** 落地页测速：真机把帧耗时分段发上来，只打日志，不存储（排查用，只含性能数字和机型） */
  @Post('farm/perf')
  @HttpCode(200)
  perf(@Body() body: Record<string, unknown>): { success: boolean } {
    console.log('[farm-perf]', JSON.stringify(body ?? {}).slice(0, 1500));
    return { success: true };
  }

  /** 卡面收获一次：只写记录，不返回渲染字段 */
  @Post('farm/card-harvest')
  @HttpCode(200)
  cardHarvest(
    @Body() body: CardHarvestBody,
    @Headers('x-tt-openid') openId?: string,
  ): { success: boolean; message?: string } {
    const crop = findCrop(body?.cropId);
    if (!crop) {
      return { success: false, message: '没有这种作物' };
    }
    const last = this.store.get(openId).lastHarvestAt;
    // 防止异常连点刷数据：两次收获至少间隔 150ms
    if (last && Date.now() - last < 150) {
      return { success: false, message: '收得太快啦' };
    }
    this.store.addHarvest(openId, crop.cardPrice);
    console.log('[farm] card harvest', crop.id, FarmStoreService.userKey(openId) === 'guest' ? 'guest' : 'user');
    return { success: true };
  }

  @Get('farm/state')
  @HttpCode(200)
  state(@Headers('x-tt-openid') openId?: string): FarmStateResponse {
    const progress = this.store.get(openId);
    return {
      success: true,
      data: {
        assets: {
          soil: FARM_ASSETS.soil,
          grass: FARM_ASSETS.grass,
          house: FARM_ASSETS.house,
          hero: FARM_ASSETS.landingHero,
          coin: FARM_ASSETS.coin,
          seed: FARM_ASSETS.seed,
          farmerHoe: FARM_ASSETS.farmerHoe,
          farmerWater: FARM_ASSETS.farmerWater,
          farmerWalk: FARM_ASSETS.farmerWalk,
        },
        crops: CROPS.map((crop) => ({
          id: crop.id,
          name: crop.name,
          growSeconds: crop.idleGrowSeconds,
          price: crop.idlePrice,
          unlockCost: crop.unlockCost,
          stages: crop.stages,
        })),
        rules: IDLE_RULES,
        card: {
          coins: progress.coins,
          harvests: progress.harvests,
          claimable: Math.max(0, progress.coins - progress.claimed),
        },
      },
    };
  }

  /** 把卡面金币收进落地页农场，返回本次收进的数量 */
  @Post('farm/claim')
  @HttpCode(200)
  claim(@Headers('x-tt-openid') openId?: string): { success: boolean; data: { claimed: number } } {
    const claimed = this.store.claim(openId);
    return { success: true, data: { claimed } };
  }
}
