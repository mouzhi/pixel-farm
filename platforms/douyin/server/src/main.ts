import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { FastifyAdapter } from '@nestjs/platform-fastify';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new FastifyAdapter({
    bodyLimit: 50 * 1024 * 1024,
  }));
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.enableShutdownHooks();
  const port = process.env.NJS_SERVER_PORT || '3000';
  await app.listen(port, '0.0.0.0');
  console.log(`Server running on port ${port}`);
}
void bootstrap();
