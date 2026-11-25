const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = '/tmp/routes/closed-domain-server-routes.json';

try { fs.unlinkSync(OUTPUT_FILE); } catch {}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();

  const server = app.getHttpAdapter().getInstance();
  const routes = (server.router ?? server._router)?.stack
    ?.filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    })) ?? [];

  const outDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(routes, null, 2));

  await app.close();
}

main().catch(() => {});
