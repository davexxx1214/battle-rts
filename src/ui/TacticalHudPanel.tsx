import { memo, useMemo, useSyncExternalStore } from "react";

import type { BattleState, WorldPoint } from "../game/battle";
import type { UnitRole } from "../game/types";
import { BATTLEFIELD_MAP, axialToWorld } from "../map/battlefield";
import type { CameraViewStore } from "../scene/camera/cameraViewStore";
import styles from "./TacticalHud.module.css";
import {
  createMinimapCameraFrame,
  createSquadMapMarkers,
  projectWorldToMinimap,
  summarizeSelectedSquads,
  type SquadOrderSummary,
  type SquadStatusSummary,
} from "./tacticalHud";

interface TacticalHudPanelProps {
  readonly battle: BattleState;
  readonly selectedIds: readonly string[];
  readonly cameraViewStore: CameraViewStore;
}

const ROLE_LABELS: Readonly<Record<UnitRole, string>> = {
  knight: "盾锋",
  ranger: "长弓",
  mage: "奥术",
  catapult: "攻城",
};

export function TacticalHudPanel({ battle, selectedIds, cameraViewStore }: TacticalHudPanelProps) {
  const selectedSquads = useMemo(
    () => summarizeSelectedSquads(battle, selectedIds),
    [battle, selectedIds],
  );
  const mapMarkers = useMemo(() => createSquadMapMarkers(battle), [battle]);

  return (
    <>
      <section className={styles.minimapPanel} aria-label="战术小地图">
        <header>
          <span>TACTICAL MAP</span>
          <strong>全域态势</strong>
        </header>
        <svg className={styles.minimap} viewBox="0 0 100 100" role="img" aria-label="岛屿地形、双方小队和当前镜头范围">
          <g className={styles.terrainCells}>
            <MinimapTerrainLayer />
          </g>
          <g className={styles.squadMarkers}>
            {mapMarkers.map((marker) => {
              const position = projectWorldToMinimap(marker.position);
              return (
                <g
                  className={styles.squadMarker}
                  data-faction={marker.faction}
                  transform={`translate(${position.x} ${position.y})`}
                  key={marker.id}
                >
                  <circle r={marker.role === "catapult" ? 2.7 : 2.15} />
                  <title>{`${marker.id} · ${marker.livingCount} 存活`}</title>
                </g>
              );
            })}
          </g>
          <MinimapCameraFrameLayer store={cameraViewStore} />
        </svg>
        <footer>
          <span><i data-faction="verdant" />苍蓝</span>
          <span><i data-faction="crimson" />猩红</span>
        </footer>
      </section>

      <section
        className={styles.selectionDock}
        data-empty={selectedSquads.length === 0}
        aria-label="当前选中小队"
      >
        <header>
          <div>
            <span>SELECTED FORMATION</span>
            <strong>{selectedSquads.length > 0
              ? `${selectedSquads.length} 支小队 · ${selectedIds.length} 个单位`
              : "等待军令"}</strong>
          </div>
          <small>{selectedSquads.length > 0 ? "点击战场推进，点击敌军集火" : "点选单位或拖框选择"}</small>
        </header>
        <div className={styles.squadList}>
          {selectedSquads.map((squad) => (
            <article className={styles.squadCard} data-role={squad.role} key={squad.squadId}>
              <span className={styles.roleGlyph}>{roleGlyph(squad.role)}</span>
              <div className={styles.squadIdentity}>
                <strong>{ROLE_LABELS[squad.role]}</strong>
                <small>{squad.selectedCount === squad.livingCount
                  ? "整队选中"
                  : `${squad.selectedCount} 名已选`}</small>
              </div>
              <div className={styles.squadStrength}>
                <span>{squad.livingCount}/{squad.initialSize}</span>
                <i><b style={{ width: `${squad.averageHealthRatio * 100}%` }} /></i>
              </div>
              <div className={styles.squadOrder}>
                <strong>{orderLabel(squad.order)}</strong>
                <small>{statusLabel(squad.status)}</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

const MinimapTerrainLayer = memo(function MinimapTerrainLayer() {
  return BATTLEFIELD_MAP.cells.map((cell) => (
    <polygon
      points={minimapHexPoints(axialToWorld(cell))}
      className={styles.terrainCell}
      data-surface={cell.surface}
      data-height={heightBand(cell.height)}
      key={`${cell.q}:${cell.r}`}
    />
  ));
});

const MinimapCameraFrameLayer = memo(function MinimapCameraFrameLayer({
  store,
}: {
  readonly store: CameraViewStore;
}) {
  const cameraView = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const cameraFrame = createMinimapCameraFrame(cameraView);
  return (
    <rect
      className={styles.cameraFrame}
      x={cameraFrame.center.x - cameraFrame.width / 2}
      y={cameraFrame.center.y - cameraFrame.height / 2}
      width={cameraFrame.width}
      height={cameraFrame.height}
      transform={`rotate(${cameraFrame.rotationDegrees} ${cameraFrame.center.x} ${cameraFrame.center.y})`}
    />
  );
});

function minimapHexPoints(center: WorldPoint): string {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index;
    const point = projectWorldToMinimap({
      x: center.x + Math.cos(angle) * 1.04,
      z: center.z + Math.sin(angle) * 1.04,
    });
    return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }).join(" ");
}

function heightBand(height: number): "low" | "middle" | "high" {
  if (height > 0.6) return "high";
  if (height > 0.1) return "middle";
  return "low";
}

function roleGlyph(role: UnitRole): string {
  if (role === "knight") return "◆";
  if (role === "ranger") return "➶";
  if (role === "mage") return "✦";
  return "◉";
}

function orderLabel(order: SquadOrderSummary): string {
  if (order === "move") return "移动";
  if (order === "attack") return "集火";
  if (order === "attack-move") return "攻移";
  if (order === "hold") return "坚守";
  if (order === "mixed") return "混合令";
  return "待命";
}

function statusLabel(status: SquadStatusSummary): string {
  if (status === "moving") return "行军中";
  if (status === "attacking") return "交战中";
  if (status === "holding") return "阵地固守";
  if (status === "mixed") return "状态混合";
  return "阵型稳定";
}
