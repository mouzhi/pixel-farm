# 未纳入仓库的大文件

为了让仓库保持轻量（< 10MB），下面这些文件只保存在 box 上的旧目录
`/workspace/pixel-farm/`，不进 git。`.gitignore` 已经把它们挡在外面：`shots/`、`*.mp4`、`*.gif`、`*.zip`、`node_modules/`。

需要时可以用 `tools/` 里的脚本重新生成（见 `tools/README.md`）。

| 文件 | 大小 | 说明 | 重新生成 |
|---|---|---|---|
| `preview.mp4` | 11.4 MB | 清晨到夜里的录屏 | `tools/rec2.js` + ffmpeg |
| `preview.gif` | 5.1 MB | 同上，GIF 版 | ffmpeg palettegen |
| `shots/rotation_before_vs_after.gif` | 8.3 MB | v2 → v3 旋转对比 | `tools/rotgif.js` |
| `shots/rotation_style_A.gif` | 6.3 MB | 风格 A 镜头转一圈 | `tools/rotgif.js` |
| `shots/trees_water_wind.gif` | 0.7 MB | v3.2 林缘风动和池塘 | `tools/tw_cap.js` + `tools/tw_gif.js` |
| `shots/wind_demo.gif` | 0.3 MB | 风动演示 | `tools/tw_gif.js` |
| `shots/*.png`（33 张） | 约 3.2 MB | 各阶段截图、特写和版本对比 | `tools/shots.js`、`tools/closeups.py` |
| `shots/soak_v3.2.txt` | 2 KB | v3.2 长时间运行日志 | `tools/soak.js` |
| `tools/node_modules/` | 约 14 MB | playwright-core | `npm --prefix tools ci` |
| `/workspace/pixel-farm.zip`、`/workspace/pixel-farm-game.zip` | 36.9 MB / 63 KB | 之前打包给用户的压缩包 | — |

两张最常用的对比图（`style_A_vs_mock.png`、`trees_water_before_after.png`，合计约 420 KB）放在 `docs/img/`，作为 README 配图保留在仓库里。
