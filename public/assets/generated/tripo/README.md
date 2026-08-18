# Tripo 生成资源

## 运行时资源

- `mobile-catapult/textured-simple-semantic-532eb940-fe41d875.glb`：移动式投石车最终候选，H3.1 主体、v2 语义分件、v3 贴图；6 个独立 mesh/node，9,519 triangles，6 套内嵌材质贴图。
- `mobile-catapult/segmented-simple-semantic-532eb940.glb`：同一投石车的无贴图六分件版本，适合在 DCC 工具里检查、重命名和调整 pivot。
- `runtime/undead-shipwreck.glb`：当前亡灵地图使用的沉船。
- `runtime/undead-frost-bone-dragon.glb`：为后续亡灵飞行兵种保留的冰霜骨龙。
- `/assets/kaykit/adventurers/characters/Knight.glb`：投石车操作兵暂时复用现有 Knight，不新增专属模型或动作。

`manifest.json` 保留生成参数、任务状态、文件哈希、credits 和历史尝试。已清理模型的生成记录仍可用于审计，但不会进入运行时资源目录或重新生成清单。

## 接入前还要做的处理

Tripo 返回的六个节点名仍是 `tripo_part_0` 至 `tripo_part_5`。接入战斗系统前，应在 Blender 或引擎导入工具中逐件确认含义，必要时归组，再重命名为车架、轮组、投掷臂、弹袋、配重和石弹，并把轮轴、投掷臂的 pivot 调到实际旋转中心。当前资源没有动画。

生成过程共记录 220 credits：两个主体 80、三次分件 120、两次贴图 20。前两次分件分别因 82 个和 77 个碎片而保留为历史记录；最终关闭 connectivity 拆分后得到 6 个语义部件。
