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
| `soak.js [url] [秒数] [截图]` | 长时间运行测试，记录堆内存、缓存数量和画面是否空白。 |
| `file.js` | 用 `file://` 打开 `index.html`，检查离线运行。 |
| `fps.js`、`bench.js`、`prof.js` | 帧率、加载耗时、性能剖析。 |
| `jitter.js`、`gid.js`、`pixeq.js` | 抖动和闪烁检查：静止时逐像素比较，旋转时比较缓存。`pixeq.js` 对比 8767（旧版）和 8765（新版）两个服务。 |
| `snap.js [query] [_] [out.png]` | 单张截图。 |
| `shots.js` + `closeups.py` | 生成 `shots/` 里的阶段截图和特写（`shots/` 不进 git）。 |
| `rec2.js`、`rotgif.js`、`tw_cap.js`、`tw_gif.js` | 录制帧序列，再用 ffmpeg 生成 mp4 和 GIF（产物不进 git）。 |
| `build_sprites_A.py` | 把 `assets/src/` 里的 SpriteCook 原图量化到调色板，生成 `assets/sprites.js`、`chars.png`、`crops.png`。 |
| `dl.py prefix url…` | 把 SpriteCook 的输出下载到 `assets/src/`。 |
| `views_to_voxels.py`、`viewer.html` | 早期体素模型工具和查看器。 |
