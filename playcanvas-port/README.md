# Ironfield RTS · PlayCanvas Port

这是原项目的独立 PlayCanvas Engine 移植目录。当前版本是可玩的第一阶段移植：保留原项目的战斗模拟、经济、部署交易、寻路和敌方 AI，用 PlayCanvas 重写渲染、镜头、鼠标拾取和战场表现。

## 启动

```bash
cd playcanvas-port
pnpm install
pnpm dev
```

开发地址：`http://127.0.0.1:5175/`

生产构建：

```bash
pnpm build
pnpm preview
```

预览地址：`http://127.0.0.1:4175/`

## 已移植

- PlayCanvas `Application`、正交相机、灯光、线性雾和六边形战场
- KayKit 六边形地形、道路、城堡、城墙、矿区、农场、森林、村庄、船只与云层
- 普通模式与 40v40 竞技场模式
- 原版固定时间步战斗模拟、自动交战、投射物、范围伤害和胜负结算
- 金币恢复、双倍金币阶段、部署费用和建筑/兵种合法性校验
- 简单/普通/困难敌方 AI
- KayKit 骑士、长枪兵、游侠、法师模型，阵营材质染色与长枪骨骼挂接
- KayKit 独立动作包驱动的待机、移动、攻击、受击和死亡动画
- Tripo 投石车、KayKit 操作手、车轮滚动与抛臂动作
- 城堡、箭塔、金矿、兵营及其旗帜、矿石、货箱、武器架等细节模型
- 投射物、原版贴图序列命中特效、血条和建筑生产表现
- 原版 UI 音效、弓箭/投石车战斗音效与胜负音乐
- 鼠标/触控拖动平移、滚轮缩放、`Q`/`E` 旋转、方向键/WASD 平移
- 部署预览、部署反馈、战斗 HUD、重开与模式切换

## 代码边界

- `src/main.ts`：PlayCanvas 端的游戏循环、DOM HUD 和部署交互
- `src/render/PlayCanvasBattlefield.ts`：PlayCanvas 场景、相机、输入拾取和状态同步
- `../src/game`、`../src/map`：继续作为权威模拟与地图数据源，不复制规则
- `../public`：通过 Vite `publicDir` 复用现有 UI 和运行时资源；生产构建会把它们复制到本目录的 `dist`

## 当前限制

- 几何体降级模型仍保留：单个 GLTF/GLB 加载失败时会自动显示，不会让整局白屏。
- 当前直接实例化 GLTF 层级；后续可进一步做静态批处理、LOD、动画距离降频和资源分包，以优化低端设备上的 40v40 性能。
- Three.js 版的部分材质闪白、复杂销毁碎片和相机震动仍使用 PlayCanvas 近似表现，视觉参数还可继续校准。
- 这是独立 Engine/Vite 工程，不是上传到 PlayCanvas 在线 Editor 的项目包。

## 验证

```bash
pnpm typecheck
pnpm build
```

验证覆盖：普通模式启动、玩家部署、金币扣除、AI 部署、竞技场 40v40 开局、重置、模式切换、场景资源完整性、音频资源完整性和生产构建。
