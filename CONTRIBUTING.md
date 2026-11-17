# 协作指南

这个仓库是像素农场的唯一源码仓库。美术和玩法可以并行开发：每条线开一个分支、一个 worktree，用 PR 合进 `main`。

## 分支命名

| 前缀 | 用途 | 例子 |
|---|---|---|
| `art/*` | 美术：精灵、调色板、树、水、光照 | `art/fruit-trees` |
| `feature/*` | 玩法：存档、背包、商店、解锁、动物 | `feature/save-load` |
| `fix/*` | 修 bug | `fix/night-blank` |
| `chore/*` | 工具、文档、CI、仓库整理 | `chore/ci-smoke` |

分支要短命：一个 PR 只做一件事，合并后就删掉分支。

## 一条并行线一个 worktree

主 worktree 在 `/workspace/repos/pixel-farm`，始终停在 `main`，不要直接在上面改代码。

```bash
cd /workspace/repos/pixel-farm
git fetch origin && git switch main && git pull --ff-only

# 新开一条线：在旁边建目录 ../pf-<分支名>，同时建分支
git worktree add ../pf-art-fruit-trees -b art/fruit-trees origin/main
cd ../pf-art-fruit-trees
# …改代码、测试…
git push -u origin art/fruit-trees
gh pr create --base main --fill

# 合并后清理
cd /workspace/repos/pixel-farm
git worktree remove ../pf-art-fruit-trees
git branch -d art/fruit-trees
git worktree list      # 查看所有并行线
```

`main` 往前走了以后，用 `git fetch && git rebase origin/main` 跟上，不要把 `main` merge 进功能分支。

## 本地运行和测试

```bash
python3 -m http.server 8765          # 在 worktree 根目录起静态服务
# 浏览器打开 http://127.0.0.1:8765/

npm --prefix tools ci                # 第一次：装 playwright-core（不下载浏览器，用系统 Chrome）
node tools/smoke.js                  # 冒烟测试：http 和 file:// 都要能加载，没有报错，画面不空白
node tools/soak.js                   # 长时间运行测试（需要上面的 8765 服务），看内存和缓存是否平稳
```

多个 worktree 同时跑服务时，换个端口，并用 `PF_URL=http://127.0.0.1:8770 node tools/…` 指定。`tools/README.md` 列出了每个脚本的用途。

## PR 检查清单

PR 模板会自动带上这份清单（`.github/pull_request_template.md`）：

- **截图**：画面有变化就附前后对比图；动画附 GIF（GIF 只放在 PR 里，不提交进仓库）。
- **冒烟测试**：`node tools/smoke.js` 通过。CI 也会跑一次。
- **长时间运行**：改到渲染、缓存或模拟时，跑 `tools/soak.js`，至少 10 分钟、`speed=12`。内存和缓存数量要平稳，画面不能变空白。
- **不变量**（下面三条不能破坏）：
  1. **不抖动**：镜头不转时，静止物体逐像素不动。相机偏移每帧取整，物体位置要落在整数像素上。
  2. **不闪烁**：旋转时按 `ASTEP`（2π/256）量化角度，每个角度的堆叠结果都要缓存。新物体也要走同一套缓存，不要每帧现画。
  3. **内存和缓存**：离屏画布一律用 `mkc()` 创建（CPU 存储，`willReadFrequently`）。缓存要进全局 LRU（`STK_BUDGET`），或者有固定上限，不能无限增长。不要每帧新建 canvas。上下文丢失后，看门狗能重建缓存。
- **存档兼容**：见下一节。
- **README**：如果玩法、URL 参数或操作有变化，同步更新 README。

## 存档兼容（占位，等存档功能上线后补全）

存档功能还没有做，下面是约定好的规则，第一个做存档的 PR 照此实现：

- 存档放在 `localStorage`，内容是一个 JSON 对象，必须带整数字段 `saveVersion`。
- 读档时，按顺序依次跑 `migrations[v]`，把存档从 v 升到 v+1，一直升到当前版本。缺字段就用默认值补上，不能报错。
- **任何 PR 改了存档结构**（加字段、改字段含义、删字段），都必须：
  1. 把 `SAVE_VERSION` 加 1；
  2. 加一个对应的 migration；
  3. 在 PR 里说明旧存档会被怎样迁移，并附一个旧版本存档样例的加载测试。
- 不允许出现「升级后旧存档读不出来」或「旧存档被清空」的情况。实在需要重置，也要先备份到另一个 key，并在界面上提示。

## 部署

- 线上地址：https://mouzhi.github.io/pixel-farm/
- 使用 GitHub Pages 的经典模式：直接发布 `main` 分支的仓库根目录（有 `.nojekyll`，不走 Jekyll）。游戏是纯静态文件，不需要构建。
- 也就是说，**合并进 `main` 就等于发布**，一两分钟后线上更新。所以 `main` 必须始终能玩，没准备好的东西不要合并。
- 仓库里的 `tools/`、`docs/` 也会被一起托管，这没有影响：游戏只加载 `index.html`、`game.js` 和 `assets/`。
- 合并后检查：打开线上地址，强制刷新，确认标题版本号正确、控制台没有报错。

## 提交信息

用中文或英文都可以。第一行写清楚改了什么，例如 `v3.3: 果树和树苗`、`fix: 夜间画面空白`。
