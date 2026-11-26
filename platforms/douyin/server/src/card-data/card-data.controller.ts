import { All, Controller, HttpCode } from '@nestjs/common';
import { CardDataService } from './card-data.service';

/**
 * 平台 Feed 卡 / OpenCard 唯一渲染读接口。
 * 返回体 data 为 JSON.stringify(CardData)，须符合 opencard/card-data/types.ts。
 */
@Controller('api')
export class CardDataController {
  constructor(private readonly cardDataService: CardDataService) {}

  @All('dy_card/data')
  @HttpCode(200)
  getDyCardData(): { success: boolean; data: string; message?: string } {
    return this.cardDataService.buildDyCardResponse();
  }
}
