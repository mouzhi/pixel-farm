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

## 存档兼容

存档从 v4.0 开始上线（`saveVersion` 1）；v4.1 升到 2（加了 `upgrades` 商店等级和 `settings.speed`，作物多了 `n` 已采摘次数）；v4.2 升到 3（加了 `yard` 院子杂物列表，缺这个字段的旧档在加载时补种，已清空的空列表保持为空）；v4.3 升到 4（加了区域和斧头的 `upgrades`、`trees` 树列表（`null` 表示用默认森林）、`orders` 砍树种树指令、`inventory.wood` 和 `inventory.saplings`，每格田多了 `f` 所属的地）；v4.3.1 升到 5（家门口田改成三次各 +4 格，旧的 18 格档升到 20 格，已开放的格子不会变少）；v4.5 升到 6（加了牧场、建筑和动物的 `upgrades`、`animals` 动物列表、`trough` 饲料槽和水槽、`inventory.hay` 干草，`prices` 多了 egg / wool / milk）；v4.6 升到 7（加了 `rod` / `searod` / `coast` 的 `upgrades` 和 `catches` 渔获记录，旧档自动拥有竹竿）；v4.7 升到 8（`trough` 改成每个棚子一个的 `troughs`，加了猪圈 / 羊圈 / 猪 / 猫 / 狗的 `upgrades` 和 `prices.truffle`；v6 / v7 的鸡、羊、牛和建筑都保留，有羊的旧档送羊圈和果园坡）。代码在 `save.js`，测试在 `tools/save-test.js`（Node）和 `tools/save-smoke.js`（浏览器），两者 CI 都会跑。

- 存档放在 `localStorage` 的 `mouzhi/pixel-farm:save`，上一份能读的存档在 `:bak`。键名都带 `mouzhi/pixel-farm:` 前缀，因为同一个 GitHub Pages 域名下的其他项目共用 localStorage。
- 存档是一个 JSON 对象，带整数 `saveVersion`。读档时按顺序跑 `MIGRATIONS[v]`，把 v-1 升到 v，一直升到 `CURRENT`；然后 `validate()` 补齐所有缺失字段的默认值、限制范围，所以缺字段不会报错。
- 只存数据，不存对象引用：杂物存种类和变体编号（`{ type, v, rot }`），作物存种类和已长天数，加载时再查模型。体素缓存、粒子、任务、镜头都是派生状态，不进存档。
- **任何 PR 改了存档结构**（加字段、改字段含义、删字段），都必须：
  1. 把 `save.js` 里的 `CURRENT` 加 1；
  2. 在 `MIGRATIONS` 里追加一个函数，已经发布的迁移函数不能再改；
  3. 用 `node tools/save-smoke.js --write-fixture` 生成新版本样例前，先把旧样例改名留在 `tools/fixtures/`（每个版本至少留一个 `save-v<N>*.json`），测试会逐个加载；
  4. 在 PR 里说明旧存档会被怎样迁移。
- 不允许出现「升级后旧存档读不出来」或「旧存档被清空」的情况。坏档会另存到 `:corrupt:<时间>`，重置前的存档会另存到 `:reset:<时间>`；浏览器里有更新版本的存档时，旧页面只读不写。

## 部署

- 线上地址：https://mouzhi.github.io/pixel-farm/
- 使用 GitHub Pages 的经典模式：直接发布 `main` 分支的仓库根目录（有 `.nojekyll`，不走 Jekyll）。游戏是纯静态文件，不需要构建。
- 也就是说，**合并进 `main` 就等于发布**，一两分钟后线上更新。所以 `main` 必须始终能玩，没准备好的东西不要合并。
- 仓库里的 `tools/`、`docs/` 也会被一起托管，这没有影响：游戏只加载 `index.html`、`game.js` 和 `assets/`。
- 合并后检查：打开线上地址，强制刷新，确认标题版本号正确、控制台没有报错。

## 提交信息

用中文或英文都可以。第一行写清楚改了什么，例如 `v3.3: 果树和树苗`、`fix: 夜间画面空白`。
