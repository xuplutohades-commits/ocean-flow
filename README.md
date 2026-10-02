# OCEAN FLOW · 洋流互动实验室

面向高中地理课堂的《洋流》互动教学网站。不是洋流百科全书，而是一套“互动式地理实验室”：
用地图、粒子动画、物理简化模拟和真实世界案例，帮助学生理解 **洋流是什么、为什么形成、如何变化、会产生什么影响**。

在线体验：`npm run dev` 后访问 http://localhost:3000

---

## 快速开始

```bash
npm install
npm run dev        # 开发服务器 http://localhost:3000
npm run build      # 生产构建
npm start          # 运行生产版本
npm run smoke      # 无头浏览器冒烟测试（需要本机 Playwright Chromium 缓存，可选）
```

- 环境要求：Node ≥ 20，建议 22+。
- 除浏览器的 WebGL / Canvas 外，网站**不需要任何外部服务**：世界陆地矢量、NASA 蓝大理石贴图、影像元数据全部打包在 `public/` 本地资源中；案例大图按需从 NASA 官方图像库的长期稳定地址加载（挂载失败时自动降级显示，不会白屏）。

## 技术栈

- **Next.js 16（App Router）+ React 19 + TypeScript**
- **Three.js / React Three Fiber**：首页 3D 地球（蓝大理石贴图 + 沿洋流路径的发光粒子带 + Fresnel 大气层）
- **Canvas 2D 自研地图引擎**（`src/components/map/OceanMap.tsx`）：等距圆柱投影、粒子流与拖尾、悬停/点击拾取、缩放平移、风带与季风箭头图层、漂流瓶监测点、污染扩散点系统——全站地图统一复用
- **Framer Motion** 未重度使用（滚动揭示用原生 IntersectionObserver，动画以 Canvas rAF 为主，保证课堂低配机器流畅）
- **Zustand**：全局状态（探索/教学/实验三种模式、季节、形成实验四因素、ENSO 参考状态）
- Tailwind CSS v4 + 自定义深海主题设计系统（`src/app/globals.css`）

## 六个模块

| 路由 | 模块 | 核心交互 |
| --- | --- | --- |
| `/` | 沉浸式首页 | 3D 地球 + 三个核心入口 |
| `/currents` | 全球洋流 | 粒子流地图；悬停/点击洋流联动信息面板与地图定位；风带/名称/季节开关；教学模式四步走 |
| `/formation` | 为什么会有洋流 | **真实粒子动力学模拟**：风带→盛行风→地转偏向力→海陆分布四个因素开关，粒子受风场+科氏力+沿岸反弹驱动，自动“生长”出北顺南逆的环流 |
| `/atmosphere` | 洋流 × 大气 | 三圈环流剖面；季风与北印度洋（冬夏切换）；沃克环流 + 厄尔尼诺/拉尼娜联动模拟（海温距平、信风、上升流、降水指标） |
| `/impacts` | 洋流会带来什么 | 气候/渔场/航海/污染四条因果链 + 哥伦布两程对比、四大渔场、污染扩散地图 |
| `/cases` | 真实世界·洋流档案馆 | 7 个教材核心案例（日本暖流、千岛寒流、秘鲁寒流、本格拉寒流、湾流、拉布拉多寒流、北印度洋季风洋流）：区域地图、SST 剖面、成因、影响动画、NASA 真实影像（带来源）与教材知识点 |
| `/lab` | 地理实验室 | 漂流瓶、上升流、寒暖流交汇、季风切换、航海路线、厄尔尼诺模拟六个可操作实验 |

三种使用模式（右上角切换）：**探索**（自由浏览）、**教学**（分步讲解、自动配置模拟）、**实验**（开放参数）。模式只改变讲解节奏与可调参数，不改变内容。

## 数据驱动：如何新增洋流或案例

洋流是纯数据（`src/data/currents.ts`），每条记录：

```ts
interface OceanCurrent {
  id: string;            // 唯一标识（也用于地图聚焦/链接）
  nameZh: string;        // 中文名
  nameEn: string;        // 英文名
  type: 'warm' | 'cold'; // 决定粒子颜色与图例
  ocean: string;         // 所属海域
  seasonal?: boolean;    // 是否季节变化洋流
  path: [lng, lat][];    // 主路径，按水流方向排列
  summerPath? / winterPath?: [lng, lat][]; // 季节路径
  continuation?: string; // 流到尽头后接入的洋流 id（漂流瓶/污染扩散模拟用）
  formation: string; effects: string[]; cases: string[];
  textbook: string;      // 教材关联表述
  stats?: { … };         // 展示用数据
}
```

新增一条洋流 = 往数组里加一个对象，地图、面板、图例、漂流瓶路线自动生效。
案例同理（`src/data/cases.ts`）：`region` 控制局部地图视口，`imageKeys` 引用 `public/data/case-images.json` 中的影像元数据（标题/图注/来源/许可/原始页面链接）。

**关于影像来源**：所有真实影像来自 [NASA Image and Video Library](https://images.nasa.gov) 公开 API 检索并逐张人工校对（避免搜到无关或错误对象），网页中每张图都保留来源、图注与原始页面链接。水温、流速等数字为教学量级估计（基于 NOAA/NASA 科普资料与教材表述），不替代官方数据集。

## 项目结构

```
src/
  app/                     # 页面（每个模块一个目录）
  components/
    map/OceanMap.tsx       # 核心地图引擎（粒子流/交互/图层/覆盖层）
    globe/GlobeCanvas.tsx  # 首页 3D 地球
    formation/             # 形成实验粒子动力学画布
    atmosphere/            # 三圈环流 SVG、Walker 剖面画布
    impacts/               # 渔场成因小动画
    cases/                 # 案例可视化（SST 图、海雾、同纬度对比）
    lab/                   # 六个实验组件
    shell/                 # 导航 / 页脚
    ui/kit.tsx             # 面板、滑杆、开关、分段控件等
  data/currents.ts         # 洋流数据库（23 条，含冬夏路径）
  data/cases.ts            # 案例数据库（7 个）
  lib/                     # 投影/采样/路径几何、噪声、风场（含季风）
  store/app.ts             # Zustand 全局状态
  types.ts                 # 共享类型
public/
  data/land.json           # 自然地球 110m 陆地矢量（离线）
  data/case-images.json    # NASA 影像元数据
  textures/earth.jpg       # NASA 蓝大理石 4096×2048（离线）
scripts/
  fetch-images.mjs         # 检索 NASA 影像并生成 case-images.json
  smoke.mjs / domcheck.mjs # 无头浏览器验证脚本
```

## 设计说明

- 视觉参考 NOAA/NASA 海洋数据可视化与 Apple 教育产品的语言：深海墨蓝底色、玻璃质感面板、暖橙(暖流)/冰蓝(寒流)双色语义、粒子即数据。
- 所有动画都服务于概念：粒子代表表层海水，颜色编码水温与速度，路径方向即洋流方向；不做与知识无关的装饰动画。
- 性能：Canvas 粒子使用单 ctx、轨迹环形缓冲、`prefers-reduced-motion` 降级；首页地球在低配设备可通过移除 `OrbitControls` 交互保底。
- 教学简化说明：形成实验和沃克环流是“概念级”模型（粒子受简化风场 + 科氏力 + 海岸反射），演示因果骨架而非预报真实海洋。

## 继续开发建议

- 全局洋流地图目前未实现“3D 地球内嵌地图视图”联动，如需可在 `/currents` 增加视图切换（2D 流线图 ⇄ 3D 地球）。
- 污染扩散目前按洋流路径搬运粒子；可进一步叠加随机扩散 (2D 湍流噪声) 和衰减。
- 题库与随堂测验可作为下一模块接入（数据模型已预留 `textbook` 字段）。
