# 像素小农场 · 抖音兴趣卡（轻量版）

`platform/douyin` 是抖音兴趣卡版本的长期分支，和 `platform/xhs` 一样单独维护，不合回 `main`。
这里放的是用 `interest-card-cli` 在抖音创作者中心「AI 应用」里做的兴趣卡工程源码（不含 `.dycard/`、`node_modules`、构建产物和 `.env*`）。

- 卡面（`opencard/`，Taro + Lynx）：点空地播种胡萝卜 / 卷心菜 / 南瓜，几秒成熟，点一下收金币；小农夫会走过去浇水、锄地，金币计数即时跳动。
- 落地页（`src/`，Taro + Tailwind）：一块小农场挂机，农夫自动收成；离线最多结算 8 小时；可扩建田地（4→9 块）、施肥加速、解锁新作物；存档保存在本机（`pixel-lite-farm-v1`）。卡面上收的金币可以「收进农场」。
- 服务端（`server/`，NestJS）：`/api/dy_card/data` 返回卡面数据，`/api/farm/*` 记录卡面收获（内存存储，服务重启会清零）。
- 素材：所有图片和音乐地址都来自抖音平台上传；像素风格与网页版「像素放置农场」一致。

同步方式：在本机工程里改好并 `interest-card-cli push` / `verify` 后，把源码复制到本目录再提交。依赖装在平台沙箱里，这里不需要 `pnpm install`。
