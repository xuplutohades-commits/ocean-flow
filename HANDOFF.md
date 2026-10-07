# HANDOFF · OCEAN FLOW 洋流互动教学网站

> 这份文档写给**接手这个工程的 AI 模型 / 工程师**。
> 请先完整读一遍本文档，再读 `README.md`（模块与数据说明）和 `DEPLOY.md`（部署）。
> 文档描述的是与代码同一个提交的工作状态（`git log -1` 即为当前快照）。

---

## 0. 这是什么

面向**高中地理课堂**的《洋流》互动教学网站（中文）。不是科普长文，而是一套"互动式地理实验室"：
用地图、粒子动画、简化物理模拟和真实案例，让学生理解 **洋流是什么、为什么形成、如何变化、有什么影响**。

- 线上地址：https://xuplutohades-commits.github.io/ocean-flow/
- 源码仓库：https://github.com/xuplutohades-commits/ocean-flow （main 分支）
- 部署方式：静态导出（`out/`）推到 `gh-pages` 分支，见 `DEPLOY.md`

## 1. 这个交接包里有什么

包含：`src/`（全部源码）、`public/`（陆地矢量、贴图、影像元数据、案例图）、`scripts/`、
配置文件（`package.json` / `package-lock.json` / `tsconfig.json` / `next.config.ts` / `postcss.config.mjs` / `eslint.config.mjs`）、
文档（`README.md` / `DEPLOY.md` / `HANDOFF.md` / `AGENTS.md`）。

**不包含**（都可重新生成，无需担心）：
- `node_modules/` —— 先执行 `npm install`（`package-lock.json` 已锁定依赖版本）
- `.next/`、`out/` —— 构建缓存与静态产物，`npm run build` 重新生成
- `.git/` —— 版本历史；需要时直接 `git clone` 上面那个仓库地址
- `next-env.d.ts`、`tsconfig.tsbuildinfo` —— Next/TS 自动生成

## 2. 快速开始（必读）

```bash
npm install          # Node ≥ 20，建议 22+
npm run dev          # 开发服务器 http://localhost:3000
npm run typecheck    # TypeScript 类型检查（改完代码先跑这个）
npm run verify       # typecheck + production build（提交前跑）
npm run build && npm start   # 生产模式本地预览
```

**改完任何代码，最低验证要求：`npm run verify` 通过。**

可选：`npm run smoke` 无头浏览器冒烟测试（12 个页面 × 桌面/平板 + 3 项交互断言，全过会打印 `ALL SMOKE TESTS PASSED`）。
注意 `scripts/smoke.mjs` 顶部把 Chromium 可执行文件路径**硬编码**成了原作者机器的 macOS 路径：

```js
const EXE = '/Users/qianxu/Library/Caches/ms-playwright/chromium_headless_shell-1223/...';
```

换机器要改：要么 `npx playwright install chromium` 后改成新路径，
要么直接指向本机 Chrome（macOS：`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，
`chromium.launch({ executablePath: EXE, args: ['--headless=new'] })`）。
`npm run smoke` 需要先在 3000 端口跑 `npm start`。

## 3. 技术栈与目录结构

- **Next.js 16（App Router，Turbopack）+ React 19 + TypeScript + Tailwind v4**
- **Three.js / React Three Fiber**：首页 3D 地球
- **Canvas 2D 自研引擎**：所有地图与动画（无第三方动画库依赖）
- **Zustand**：全局状态（模式 / 季节 / 实验参数），见 `src/store/app.ts`

```
src/
  app/                    路由（Next App Router）
    page.tsx              首页（3D 地球）
    currents/             全球洋流（粒子地图 + 洋流目录 + 教学模式）
    formation/            洋流形成（粒子动力学模拟，四个因素开关）
    atmosphere/           洋流 × 大气：① 三圈环流 ② 季风与北印度洋 ③ 沃克环流/ENSO
    impacts/              洋流影响（气候/渔场/航海/污染）
    cases/[id]/           案例档案馆（9 个预渲染案例页）
    lab/                  地理实验室（6 个可操作实验）
    globals.css           深海主题设计系统（颜色、badge、glass、slider 等）
  components/
    map/OceanMap.tsx      全站通用地图引擎（投影/粒子/拾取/缩放/风带/污染）
    map/MonsoonMap.tsx    北印度洋"平面地图"视角（季风→洋流→上升流，粒子实现）
    monsoon/UpwellingProfile.tsx
                          北印度洋"垂直剖面"视角（**当前默认视觉**，分步演示）
    atmosphere/WalkerCanvas.tsx   沃克环流剖面（粒子环流 + 上升流）
    atmosphere/ThreeCellDiagram.tsx
    ui/kit.tsx            Panel / Seg / Slider / Toggle / Reveal 等基础组件
    ui/reactbits/*        少量装饰组件
  lib/                    clamp/lerp/proj 等工具（geo.ts）、asset 前缀（asset.ts）、噪声
  data/currents.ts        洋流数据（纯数据驱动）
  data/cases.ts           案例数据
public/
  data/land.json          世界陆地矢量（**低精度**，约 110m 级简化版）
  data/case-images.json   案例影像元数据
  textures/, images/      贴图与图片
  .nojekyll               **必须保留**，否则 GitHub Pages 会跳过 _next 目录
scripts/                  截图检查、几何检查、smoke、deploy 等工具脚本
```

## 4. 代码约定（改动前请先看）

1. **资源路径必须走 `asset()`**（`src/lib/asset.ts`）。线上是子路径部署（`/ocean-flow/`），
   直接写 `/data/xxx.json` 会在线上 404。形如 `fetch(asset('/data/land.json'))`。
2. **Canvas 组件的标准写法**（照抄 `UpwellingProfile.tsx` / `MonsoonMap.tsx`）：
   React 只负责挂载一个 `<canvas>`，引擎在 `useEffect` 里用
   `ResizeObserver + requestAnimationFrame + devicePixelRatio(≤2)` 驱动；
   对外参数（如 `season`）通过 ref 传入，避免重建引擎；
   组件卸载时 `cancelAnimationFrame` + `disconnect`。
3. **不要在 render 里存动画状态**。所有逐帧状态放引擎闭包里。
4. **验证动画类改动的方法**：`npm run build && npm start`，用无头浏览器截图 +
   像素统计（见 `scripts/` 里 `brightness.mjs`、`mapdiag.mjs` 等脚本的思路），
   不要只靠"看起来对"。
5. 提交信息用 `feat(scope): ... / fix(scope): ... / redesign(scope): ...` 风格（看 `git log`）。
6. `.gitignore` 已排除 `node_modules/.next/out/*.tsbuildinfo`，不要把它们提交进仓库。

## 5. 当前功能状态（各模块）

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| `/` 首页 | 完成 | 3D 地球 + 三入口 |
| `/currents` | 完成 | 粒子地图、目录联动、风带/名称/季节开关、教学模式四步 |
| `/formation` | 完成 | 四因素粒子模拟（风带→盛行风→地转偏向力→海陆分布） |
| `/atmosphere` ① 三圈环流 | 完成 | 教材式剖面图 |
| `/atmosphere` ② 季风与北印度洋 | **近期重做，重点看** | 默认垂直剖面分步演示；可切换"平面地图"视角；右侧两张示意图可点击切换季节 |
| `/atmosphere` ③ 沃克环流/ENSO | 完成 | 海温距平 + 信风滑杆；粒子环流高度与上升流箭头联动 |
| `/impacts` | 完成 | 四条因果链 + 哥伦布两程 + 四大渔场 + 污染扩散 |
| `/cases` | 完成 | 9 个预渲染案例页（新增案例需同步 `src/data/cases.ts`） |
| `/lab` | 完成 | 6 个实验（漂流瓶/上升流/交汇/季风/航线/厄尔尼诺） |

## 6. 最近几轮改动的来龙去脉（**重要，别改回去**）

`/atmosphere` 的"季风改变北印度洋"模块经历了 5 轮迭代，用户明确否掉了中间方案：

1. ~~斜线雨丝式粒子风场~~ → 用户嫌像下雨，否掉
2. ~~大箭头 / 发光流线 / 发光电缆~~ → 用户嫌像射线和霓虹灯，否掉
3. ~~满屏 Ventusky 式风粒子~~ → 用户嫌太吵，否掉
4. ~~平面地图叠加"淡箭头风 + 海水粒子 + 上升流"~~ → 用户仍嫌**太抽象**：
   风、水、上升流同时出现，因果关系看不出来
5. **当前方案（默认）**：`src/components/monsoon/UpwellingProfile.tsx`
   —— 垂直剖面模型，**严格分步**演示：
   - ① 风：少量轻柔箭头扫过（夏：西南季风；冬：东北季风反向），步骤末尾风消失
   - ② 表层海水：稀疏蓝色粒子被带动（夏：离岸；冬：向岸）
   - ③ 沿岸上升流：深层冷水垂直上泛（夏强、冬停）
   自动模式 3 步循环（每步 3.6s）；右下角步骤 chips 可手动跳到某一步（手动=立即满强度）；
   右上角可切回"平面地图"（`MonsoonMap`）。

**给接手模型的建议**：如果用户再提"看不懂/太抽象"，优先强化**分步的先后顺序与因果标注**，
不要回退成"所有元素同时铺在平面地图上"的方案。

同一模块另外两处已修好的问题，不要引入回归：
- 平面地图 `MonsoonMap` 的索马里洋流带 / 上升流坐标是**按 `land.json` 实际渲染的海岸线**
  重新采样拟合的（手工填的经纬度会画到陆地上）；粒子平流时有陆地防护（漂到陆地即重生）。
- 右侧两张"季风为什么会反转"示意图是**可点击按钮**，点击会切换全局季节（`setSeason`）。
- `WalkerCanvas` 的环流顶高 `yLoopTop` 与信风强度/ENSO 状态联动（信风 0% 贴海面，100% 满高；
  厄尔尼诺反向并塌陷）。

## 7. 已知问题 / 可继续完善的方向

按优先级（都是我了解到的真实限制，不是猜测）：

1. **移动端未专门适配**：所有 Canvas 组件按容器自适应，但小屏上文字/控件偏小，
   课程主要在电脑与投影仪使用。若要上手机端，需要一轮响应式打磨。
2. **`public/data/land.json` 是低精度简化矢量**（全球约 5000 个点）：
   索马里、红海等处的海岸线比较粗糙，任何"贴海岸"的可视化都必须按它的实际形状校准
   （方法：用 `scripts/` 里的检查脚本，按经纬度→屏幕坐标采样该文件的多边形，标出陆地边界）。
   若要更精细的海岸，可换更高精度的 GeoJSON，但要重新校准所有贴岸元素。
3. **`scripts/smoke.mjs` 硬编码了 Chromium 路径**（见 §2），换机器需要改。
4. **`scripts/deploy-pages.sh` 依赖本机 git 凭据**（推送到 GitHub）。
   部署是"构建 `out/` → 强推 gh-pages 分支"，CDN 约 1–2 分钟生效。
5. **没有单元测试**：目前的质量保障是 `npm run verify` + `npm run smoke` + 人工/无头截图。
   若要长期维护，建议给 `src/lib/`（投影、采样、clamp/lerp）补 Vitest 单测。
6. **可扩展的功能**：课堂用的随堂练习/小测、全屏演示模式、投影仪高对比主题、
   更多季风区剖面（如秘鲁/本格拉上升流的垂直剖面可复用 `UpwellingProfile` 的引擎骨架）。
7. **性能**：Canvas 引擎在低配教室电脑上已按 dpr≤2、粒子数按面积缩放控制；
   若继续加粒子，请沿用同一套缩放策略（见 `initParticles` 类的写法）。

## 8. 交付前自检清单

```bash
npm install
npm run verify          # 必须通过
npm start               # 手动过一遍 6 个页面 + 首页
npm run smoke           # 可选，需先解决 Chromium 路径
```

改完后如果用户需要线上更新：`bash scripts/deploy-pages.sh`，
然后确认 https://xuplutohades-commits.github.io/ocean-flow/ 的对应页面（CDN 有缓存，等 1–2 分钟或强刷）。

## 9. 请避免的做法

- ❌ 不要破坏 `asset()` 前缀或删除 `public/.nojekyll`（会导致线上样式/交互全丢）
- ❌ 不要把 `node_modules/`、`.next/`、`out/` 提交进 git
- ❌ 不要在没有像素级验证的情况下宣称 Canvas 动画"已完成"
  （这个工程里出现过"逻辑正确但像素根本没画出来"的问题：半透明 + 亮度阈值会骗过肉眼判断）
- ❌ 不要回退"季风模块"到所有元素同时出现的平面叠加方案（见 §6）
