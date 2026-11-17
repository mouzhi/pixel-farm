# tools/ · 构建和测试脚本

所有脚本都按仓库根目录定位，不依赖 box 上的绝对路径。浏览器类脚本使用 `playwright-core` 和系统里的 Chrome（`/usr/bin/google-chrome`，带 `--no-sandbox`）。

```bash
npm --prefix tools ci                 # 安装依赖（只装 playwright-core，不下载浏览器）
python3 -m http.server 8765           # 在仓库根目录起服务；大多数脚本默认用 http://127.0.0.1:8765
PF_URL=http://127.0.0.1:8770 node tools/fps.js   # 换端口（多个 worktree 并行时）
```

| 脚本 | 用途 |
|---|---|
| `smoke.js` | **冒烟测试（CI 用）**。自己起服务，用 http 和 `file://` 加载，跑一天，转 4 个角度。出现报错或画面空白时返回非 0。 |
| `save-test.js` | **存档和数值单元测试（CI 用）**，不开浏览器：迁移链、坏档回退、新版存档不覆盖、导出导入、节奏和离线结算规则、区域价格和地图布局、果树结果周期、砍树产出；v4.5 起还测动物照顾和产量、牧场的商店前置条件、v5→v6 迁移。`fixtures/` 里每个存档版本至少留一个样例。 |
| `save-smoke.js [--write-fixture]` | **存档浏览器测试（CI 用）**：保存后刷新状态一致、每个样例存档能加载并跑一天、坏档用备份、离线收益、导出导入和重置、耕地不退化。`--write-fixture` 会生成 `fixtures/save-v<当前版本>-day4.json`（只在升存档版本时用）。还测商店：面板购买、升级刷新后保留、倍速按钮、旧存档升级、宽锄头 3×3、收获留种、草莓重复采摘。；v4.3 起还测区域购买、砍树和移植指令、果园摘果卖钱、平移和小地图；v4.5 起还测牧场一栏和「先买」提示、买齐动物后任务板喂食加水捡蛋挤奶、产品卖钱、挨饿掉心情、刷新后动物还在。 |
| `econ.js [天数=20] [seed]` | 用真实游戏无头跑 N 天，脚本玩家按固定顺序买商店物品，打印每天收入、每次购买的游戏日和真实分钟数、种子来源（拔草 / 收获 / 购买 / 卖出）。v4.3 起脚本玩家买了斧头和林场后每天标 2 棵树砍，树苗按固定位置移植，另外打印木材和水果收入、结果的果树数。v4.5 起买完原来的清单后再买北牧场、鸡舍、牛羊棚和 11 只动物，另外打印动物数、产品收入、买干草花的钱和平均心情。粒子特效改用自己的随机数后，同一个 seed 每次跑出的结果完全一样。设计稿的收入数字来自这里。 |
| `soak.js [url] [秒数] [截图]` | 长时间运行测试，记录堆内存、缓存数量和画面是否空白。`PF_ANIMALS=1` 时先买齐牧场和全部动物，镜头对着牧场。 |
| `file.js` | 用 `file://` 打开 `index.html`，检查离线运行。 |
| `fps.js`、`bench.js`、`prof.js` | 帧率、加载耗时、性能剖析。 |
| `jitter.js`、`gid.js`、`pixeq.js` | 抖动和闪烁检查：静止时逐像素比较，旋转时比较缓存。`pixeq.js` 对比 8767（旧版）和 8765（新版）两个服务。 |
| `snap.js [query] [_] [out.png]` | 单张截图。 |
| `shots.js` + `closeups.py` | 生成 `shots/` 里的阶段截图和特写（`shots/` 不进 git）。 |
| `rec2.js`、`rotgif.js`、`tw_cap.js`、`tw_gif.js` | 录制帧序列，再用 ffmpeg 生成 mp4 和 GIF（产物不进 git）。 |
| `build_sprites_A.py` | 把 `assets/src/` 里的 SpriteCook 原图量化到调色板，生成 `assets/sprites.js`、`chars.png`、`crops.png`。 |
| `dl.py prefix url…` | 把 SpriteCook 的输出下载到 `assets/src/`。 |
| `views_to_voxels.py`、`viewer.html` | 早期体素模型工具和查看器。 |
