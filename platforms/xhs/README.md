# 像素农场 · 小红书小工具移植

本目录是 `platform/xhs` 分支上的适配层和打包配置。网页版 GitHub Pages（`main`）不受影响。
**不要在未获用户授权时登录、上传、预览或送审。**

## 怎么上架（清单）

入口（创作服务平台 · Builder Hub · 小工具）：

https://creator.xiaohongshu.com/new/red-app

2026-08-18 官方账号「科技薯」宣布小工具已全量上线。媒体转述的公开门槛是：**个人实名账号即可**（不必公司主体），粉丝数大于 1000，注册满 6 个月。没有找到单独的公开申请表或官方社群入口；打不开上述页面时，用自己的小红书账号在 PC 登录创作服务平台，在左侧找 Builder Hub → 小工具。早期内测邀请页已过时。

资料（网页表单 / `redapp submit` 共用限制，来自官方 redapp-cli Skill `form-limits.md`）：

| 资料 | 限制 |
| --- | --- |
| 名称 `appName` | 必填，最多 14 个字符（按 JS `.length`） |
| 简介 `slogan` | 必填，最多 14 个字符。草稿：「看农夫忙来忙去」（7/14） |
| 图标 | JPG/PNG，≤5 MiB，1:1；网页会裁成 512×512 JPEG |
| 封面 | JPG/PNG，≤10 MiB，宽高比 3:4 |
| 代码包 | ZIP ≤10 MiB，解压合计 ≤30 MiB，**根目录必须是 index.html** |
| 版本 | `x.y.z`，每段除 0 外不以 0 开头，不许 beta 后缀 |
| 类目 | 只选 1 个，编码以 `redapp config --source thirdAgent --agent` 为准 |
| 权限 | 本游戏先选「不需要权限」（空数组）；相册/存储等按实际勾选 |

只有用户能做的步骤（标了「用户」）：

1. **【用户】** 用自己的小红书账号完成实名；确认粉丝和注册时长是否达到当前页面要求。
2. **【用户】** 打开 https://creator.xiaohongshu.com/new/red-app 确认能看到「小工具 / 部署小工具」。
3. 本地打包（见下方），得到 `platforms/xhs/pixel-farm-xhs-tool.zip`。
4. **【用户】** 在部署页上传 zip（≤10MB），填写版本号、权限，需要时勾选 AI / 排行榜等高级能力。本游戏首发不必勾选排行榜或 AI。
5. **【用户】** 手机扫码预览，确认 Android / iOS 都能玩、存档能留下。
6. **【用户】** 提交审核。记录从几分钟到 1–3 个工作日都有；周末可能更慢。`submitted` 只表示已送审。
7. **【用户】** 审核通过后，在 App 发笔记时通过「挂件 / 小工具」挂上，读者点开才能玩。未挂笔记的已发布工具，别人还是找不到。
8. **【用户 · 付费】** 付费/免费模式在创建时设定，**一经设定不可切换**（见《小工具服务协议》）。当前公开能力是整包**买断**（薯币支付墙，购买后永久解锁）和**赞赏**（`rewardAuthor`，客户端 9.53.3+，内测）。道具级内购没有出现在 2026-11-13 的官方能力清单里；帖子里说的「内购」请以创服页面当时是否开放为准。协议写收益为用户实付扣除渠道技术服务成本，具体费率和结算以平台公布为准，进入经营钱包。建议先免费或低价买断验证分发，不要把核心进度锁在付费后面。

开发者工具（本机已按官方口令装好 Skill 和 CLI，仅验证安装，未登录）：

```bash
# 版本门禁（默认正式环境；不要登录）
export NPM_CONFIG_PREFIX=/tmp/xhs-npm
export NPM_CONFIG_CACHE=/tmp/xhs-npm-cache
export PATH="/tmp/xhs-npm/bin:$PATH"
node /home/box/agent-data/workflows/redapp-cli/scripts/ensure-cli.mjs
# 成功回执示例：CLI_VERSION_JSON:{"status":"installed","version":"1.0.5","tag":"latest","env":"prod","command":"redapp"}

# 本地模拟器（不登录、不上传）
redapp dev --dir /workspace/repos/pf-xhs/platforms/xhs/dist --agent

# 需要登录时由用户扫码，Agent 不得擅自执行：
# redapp login --agent
# redapp whoami --agent
```

上传页「用 Agent 创作」也可勾选「让 Agent 帮我管理小工具」，复制当前改写口令（不要沿用旧口令）。口令会要求下载当时版本的 Skill。管理 Skill 与开发规范 Skill 的安装路径见文末。

## 代码规范要点

- 离线 H5 zip，页面不能 `fetch` / XHR / WebSocket，资源全部打进包。
- 兼容基线：Android 8.1 / Chrome 61，JS 交 ES2017；更新语法要转译。
- Canvas 2D 完整支持；本游戏只用 2D。
- 脚本必须外置经典 `<script src>`，禁止内联脚本、`onclick`、`type="module"`、`eval`、WASM。
- 存储：客户端 9.46+ 用 `window.xhs.miniTool.setStorage/getStorage`（单 key ≤1MB，整工具 ≤10MB）。`localStorage` 只作旧版降级。写入先写 `:bak` 再写主 key，加载时校验并回退备份；超配额会 toast，不会覆盖上一份好存档。游戏内每天早上、每 30 秒，以及 `visibilitychange` / `pagehide` / `freeze`（并探测是否有 `onHide`，官方 2026-11-13 清单里没有）会落盘。离线结算从 `savedAt` 起算，拒绝非有限/负间隔，未来时钟超过 60 秒不发离线金币，超长跨度封顶。手机端游玩记录收紧（30 天 / 200 事件 / 10 段会话），并关掉文件夹同步。
- 云存储（9.51+，内测）：`add/update/query/removeCloudStorage`，单条 `content` JSON UTF-8 ≤64KB，批量非事务，未授权 errCode 1006 须降级。启动时只做方法存在性探测（`PFPlatform.cloud`），**不要作为存档唯一来源，本包也不依赖它**。合成后期存档约 39KB，理论上能塞进单条，但仍须本地 `setStorage` 为源。
- 支付：禁用 `PaymentRequest`。买断走宿主支付墙，工具内无商品内购 API。赞赏用 `rewardAuthor`（成功回执不含金额）。排行榜 `submitScore/getRankList/getMyRank` 为 9.51+ 内测，上传时须勾选头像昵称授权。
- 体积：zip 上限 10 MiB（建议 ≤2 MiB），解压 ≤30 MiB。

打包与官方审计：

```bash
cd /workspace/repos/pf-xhs
bash platforms/xhs/pack.sh
# 产物：platforms/xhs/pixel-farm-xhs-tool.zip
# 以及可给 redapp dev 用的 platforms/xhs/dist/
```

适配层 `platform.js` 会在小红书容器里把官方 Storage 预热成同步 `syncStore`，再加载游戏；网页仍走 `localStorage`。文件夹同步（File System Access）在容器里不可用，会自动隐藏。整包买断不用改游戏内逻辑；赞赏入口和装饰类内购要等官方 API 稳定后再接，且避免付费才能通关。

竖屏包（`mobile.css` / `mobile.js`，只打进小工具 zip，网页版不加载）：framebuffer 240×426，按设备像素取最大整数倍缩放（iPhone 14 / 常见 Android 上为 4×），舞台在顶栏和底栏之间，避免页面滚动和双指缩放整页。默认跟随农夫，拖动画布会暂时关掉跟随；底栏是商店 / 仓库 / 存档 / 倍速 / 菜单（菜单只开关小地图，默认关闭）。触控目标 ≥44px。横屏会压低顶栏并允许小于 1× 的 CSS 缩放，以免画布溢出，但小工具按竖屏来设计。

存档测试：`node tools/xhs-save-test.js`（配额、损坏主档回退 `:bak`、后期存档体积）以及原有的 `node tools/save-test.js`。
