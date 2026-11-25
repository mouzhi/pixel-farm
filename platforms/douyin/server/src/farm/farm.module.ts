import { Module } from '@nestjs/common';
import { FarmController } from './farm.controller';
import { FarmStoreService } from './farm-store.service';

@Module({
  controllers: [FarmController],
  providers: [FarmStoreService],
  exports: [FarmStoreService],
})
export class FarmModule {}
