import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ClosedDomainHealthController } from './health.controller';
import { LoggerMiddleware } from './logger.middleware';

@Module({
  controllers: [ClosedDomainHealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
