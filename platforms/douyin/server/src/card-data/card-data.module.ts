import { Module } from '@nestjs/common';
import { FarmModule } from '../farm/farm.module';
import { CardDataController } from './card-data.controller';
import { CardDataService } from './card-data.service';

@Module({
  imports: [FarmModule],
  controllers: [CardDataController],
  providers: [CardDataService],
  exports: [CardDataService],
})
export class CardDataModule {}
