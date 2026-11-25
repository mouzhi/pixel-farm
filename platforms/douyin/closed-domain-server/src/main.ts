import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.enableShutdownHooks();
  const port = process.env.NJS_SERVER_PORT || '3001';
  await app.listen(port);
  console.log(`Closed-domain server running on port ${port}`);
}
void bootstrap();
