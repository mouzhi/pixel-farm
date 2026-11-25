# 像素小农场 · 抖音兴趣卡（轻量版）

`platform/douyin` 是抖音兴趣卡版本的长期分支，和 `platform/xhs` 一样单独维护，不合回 `main`。
这里放的是用 `interest-card-cli` 在抖音创作者中心「AI 应用」里做的兴趣卡工程源码（不含 `.dycard/`、`node_modules`、构建产物和 `.env*`）。

- 卡面（`opencard/`，Taro + Lynx）：点空地播种胡萝卜 / 卷心菜 / 南瓜，几秒成熟，点一下收金币；小农夫会走过去浇水、锄地，金币计数即时跳动。
- 落地页（`src/`，Taro + Tailwind）：一块小农场挂机，农夫自动收成；离线最多结算 8 小时；可扩建田地（4→9 块）、施肥加速、解锁新作物；存档保存在本机（`pixel-lite-farm-v1`）。卡面上收的金币可以「收进农场」。
- 服务端（`server/`，NestJS）：`/api/dy_card/data` 返回卡面数据，`/api/farm/*` 记录卡面收获（内存存储，服务重启会清零）。
- 素材：所有图片和音乐地址都来自抖音平台上传；像素风格与网页版「像素放置农场」一致。

同步方式：在本机工程里改好并 `interest-card-cli push` / `verify` 后，把源码复制到本目录再提交。依赖装在平台沙箱里，这里不需要 `pnpm install`。

## 落地页：完整游戏（Phase 1 测速版）

- 落地页 `src/pages/index` 直接跑网页版的模拟和渲染（main e2c8d83 / v5.12.5），画在一块 `<Canvas type="2d">` 上，没有 DOM。
- `src/game/farm-engine.js` 是生成文件：`node scripts/build-game.mjs <pixel-farm 仓库> e2c8d83 farm-engine.min.js` 把 57 个游戏脚本（不含网页 UI 和音频）拼成一个函数，全局变量改走适配层，最后预编译成 ES5（Taro 自带的宽松转译会把游戏弄坏）。需要 @babel/parser/traverse/generator/types、@babel/core、@babel/preset-env 和 terser。
- `src/game/farm-env.ts` 是适配层：离屏画布、图片、帧循环、存储（`mouzhi/pixel-farm:save`，v15）、ImageData 等。
- `src/game/demo-save.ts` 是游戏自己的脚本玩家跑 30 天生成的演示存档，不是任何真人存档。
- 页面上有 FPS / 帧耗时（均值、p95）和雾、光照开关，用来在真机上测速。
