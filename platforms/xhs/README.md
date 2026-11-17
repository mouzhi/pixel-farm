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
4. **【用户】** 在部署页上传 zip（≤10MB），填写版本号、权限（本包勾选「用户头像和昵称」`apiCloudStore`），需要时勾选 AI / 排行榜 / 关注创作者等高级能力。`redapp submit` 的 `authorizations` 只有相册、相机、麦克风、位置、`apiCloudStore`，**没有**关注创作者的权限编码；若网页表单把「关注创作者」「排行榜」「云存储」列为高级能力，须在创服页面勾选；CLI 草稿改不了这些项。
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
- 云存储（官方 §3.16，9.51+，内测）：`add/update/query/removeCloudStorage`，单条 `content` JSON UTF-8 ≤64KB（1003 超限），未授权 1005/1006 须降级。本包把它当作跨设备**主存档**：启动时同时读云和本地（Storage JS API §3.6/3.7，再降级 localStorage），按 `savedAt`（相同则比农场天数）取较新的一份，并回写到本地缓存；较新的本地会择机上传。云写入节流约 3 分钟，并在 `visibilitychange` / `pagehide` / `PFPlatform.flush` 时补写。查询失败不当作空档。后期存档约 39KB，低于 64KB 上限。CLI 的 `authorizations` 里 `apiCloudStore` 官方说明是「用户头像和昵称、用于排行榜」，**没有**单独的云存储权限编码；若创服网页把「云存储」列为高级能力或权限，须在表单上勾选，否则真机会 1006 降级到本地。
- 支付：禁用 `PaymentRequest`。买断走宿主支付墙，工具内无商品内购 API。赞赏用 `rewardAuthor`（成功回执不含金额）。排行榜 `submitScore/getRankList/getMyRank` 为 9.51+ 内测，须勾选头像昵称授权 `apiCloudStore`。一键发笔记用 `postNote`（官方 §3.3，以方法是否注入为准，无单独版本门槛）：`title`≤20 字、`content`≤1000 字、`pageType`、必填 `mediaInfo`（图片 1–18 张，`data:` 或 `writeTempFile` 路径）。文档没有话题字段也没有小工具卡片绑定字段，话题写在正文 `#标签` 里；默认文案在 `platforms/xhs/note-copy.js`，可改。大图先 `writeTempFile`；若能截到画布，优先带上玩家自己的农场，再附打包好的封面图。不给发笔记奖励（《小程序管理规范》§7.1 禁止分享立即获得利益、强制分享和暗示诱导分享）。用户取消或当前环境不支持时静默处理，入口藏在系统返回/关闭胶囊正下方。关注创作者用 `followAuthor` / `getFollowStatus`（官方能力清单 3.15，客户端 9.51+，版本门槛 9510），无业务参数，只能关注当前小工具作者；`follow_status` 为 -1 失败 / 0 未关注 / 1 已关注 / 2 作者本人。用户关闭确认（20002）或已有确认框（10003）保持静默；当日确认上限 10 次（15404）只轻提示一次。低版本或未注入 API 时隐藏入口，不打扰。CLI 草稿没有对应 authorization 字段。关注创作者入口已接 `followAuthor` / `getFollowStatus`（§3.15），放在底栏「关」和排行榜标题旁，不自动弹窗。未做「关注有礼」：小工具能力清单只把该 API 写成引导关注和刷新按钮状态；《小红书小程序管理规范》（2025-12-10）§7.6 明确禁止「关注立即获得利益」和用明示/暗示样式诱导关注，虚拟奖品（金币、优惠券、积分等）也在禁止之列；品牌号社区规范也将「关注就能领红包」列为诱导类作弊。因此只保留普通关注入口，不发放关注专属道具。
- 体积：zip 上限 10 MiB（建议 ≤2 MiB），解压 ≤30 MiB。

底栏和右上角按钮用变体 A 圆形木牌图标：主包放 `atlas_hud_128_q90.webp`（首屏：包/仓/店/随/关/榜/赞/速）和 `atlas_128_q90.webp`（全套，含预留的音乐/音效），不要进 `assets/`。图标下不再跟文字标签。游戏日志和台词不再用常驻半透明面板挡农场，改为 HUD 卡片下方一行（最多两行）约 3 秒后淡出的轻提示，没有底框。
已打包背景音乐和音效。官方预览/提审接口的文件类型白名单不含音频后缀（官方 zip 审计不拒 mp3，但 `preview` 会以「不支持的文件类型」驳回），且 CSP 禁止 `<audio>` 使用 `data:` / `blob:`，因此不能把 `.mp3` 放进 zip，也不能用 `<audio src="data:...">`。打包时把清晨曲和全部音效写成 `assets/audio-data.js` 的 base64，由 `audio.js` 用 Web Audio `decodeAudioData` 播放；午/晚/夜三首为控制首屏解析体积仍走程序生成音乐，文件缺失或解码失败时同样回退到生成器 / ZzFX。默认音乐和音效都关闭，须用户点右上角开关后才出声（规范 10.5.3 禁止自动播放）。右上角「更多」里是官方分享卡片（`share` type=card，9.53+）、保存农场图到相册（`saveImageToPhotosAlbum`，9.42+）和赞赏（`rewardAuthor`，9.53.3+）；缺 API 则隐藏，不和分享/关注/赞赏绑定任何游戏奖励。关闭挽留赞赏默认不开。


打包与官方审计：

```bash
cd /workspace/repos/pf-xhs
bash platforms/xhs/pack.sh
# 产物：platforms/xhs/pixel-farm-xhs-tool.zip
# 以及可给 redapp dev 用的 platforms/xhs/dist/
```

适配层 `platform.js` 会在小红书容器里把官方 Storage 预热成同步 `syncStore`，再加载游戏；网页仍走 `localStorage`。文件夹同步（File System Access）在容器里不可用，会自动隐藏。整包买断不用改游戏内逻辑；赞赏入口和装饰类内购要等官方 API 稳定后再接，且避免付费才能通关。

竖屏包（`mobile.css` / `mobile.js`，只打进小工具 zip，网页版不加载）：framebuffer 240×426，按设备像素取最大整数倍缩放（iPhone 14 / 常见 Android 上为 4×），舞台在顶栏和底栏之间，避免页面滚动和双指缩放整页。默认跟随农夫，拖动画布会暂时关掉跟随；底栏是商店 / 仓库 / 存档 / 倍速 / 菜单（菜单只开关小地图，默认关闭）。触控目标 ≥44px。顶部系统分享（左）和返回/关闭胶囊（右）完全留空：HUD 居中放在 `getWindowInfo().menuButtons`（9.49+，否则按 ≥96px 顶距保守避让）下方；跟随农夫和关注作者都在底栏，不进顶角。双指捏合用非被动 `touchmove` + `gesturestart` 拦截，缩放与旋转会先判别再各自生效；旋转有增益和每帧/每次手势角度上限，避免转太快。横屏会压低顶栏并允许小于 1× 的 CSS 缩放，以免画布溢出，但小工具按竖屏来设计。

存档测试：`node tools/xhs-save-test.js`（配额、损坏主档回退 `:bak`、后期存档体积）以及原有的 `node tools/save-test.js`。
