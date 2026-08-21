import { useMemo, useSyncExternalStore, type CSSProperties } from "react";
import type { BattleState } from "../../game/battle";
import type { WorldPoint } from "../../game/types";
import type { BattlefieldDefinition } from "../../map/battlefieldDefinition";
import type { CameraViewStore } from "../../scene/camera/cameraViewStore";
import {
  activateMinimapPointer,
  blockMinimapEvent,
  stopMinimapPropagation,
} from "./minimapInteraction";
import {
  createSandboxMinimapModel,
  isSandboxMinimapAvailable,
} from "./minimapModel";
import {
  createMinimapProjection,
  SANDBOX_MINIMAP_VIEWPORT,
  type MinimapPoint,
} from "./minimapProjection";
import {
  SANDBOX_MINIMAP_COMPACT_PLACEMENT,
  SANDBOX_MINIMAP_DESKTOP_PLACEMENT,
} from "./minimapLayout";
import styles from "./SandboxMinimap.module.css";

const RESPONSIVE_LAYOUT_STYLE = Object.freeze({
  "--sandbox-minimap-desktop-width": `${SANDBOX_MINIMAP_DESKTOP_PLACEMENT.width}px`,
  "--sandbox-minimap-desktop-right": `${SANDBOX_MINIMAP_DESKTOP_PLACEMENT.right}px`,
  "--sandbox-minimap-desktop-bottom": `${SANDBOX_MINIMAP_DESKTOP_PLACEMENT.bottom}px`,
  "--sandbox-minimap-compact-width": `${SANDBOX_MINIMAP_COMPACT_PLACEMENT.width}px`,
  "--sandbox-minimap-compact-right": `${SANDBOX_MINIMAP_COMPACT_PLACEMENT.right}px`,
  "--sandbox-minimap-compact-top": `${SANDBOX_MINIMAP_COMPACT_PLACEMENT.top}px`,
}) as CSSProperties;

export interface SandboxMinimapProps {
  readonly battle: BattleState;
  readonly battlefield: BattlefieldDefinition;
  readonly cameraViewStore: CameraViewStore;
  readonly onCameraTargetRequest: (target: WorldPoint) => void;
  readonly className?: string;
}

export function SandboxMinimap({
  battle,
  battlefield,
  cameraViewStore,
  onCameraTargetRequest,
  className,
}: SandboxMinimapProps) {
  const cameraView = useSyncExternalStore(
    cameraViewStore.subscribe,
    cameraViewStore.getSnapshot,
    cameraViewStore.getSnapshot,
  );
  const projection = useMemo(
    () => createMinimapProjection(battlefield.worldBounds),
    [battlefield],
  );
  const available = isSandboxMinimapAvailable(battle, battlefield);
  const model = useMemo(
    () => available
      ? createSandboxMinimapModel(battle, battlefield, cameraView, projection)
      : null,
    [available, battle, battlefield, cameraView, projection],
  );
  if (!model) return null;

  return (
    <svg
      aria-label="沙盒战场小地图"
      className={className ? `${styles.root} ${className}` : styles.root}
      data-battlefield-id={battlefield.id}
      data-sandbox-minimap="true"
      height={SANDBOX_MINIMAP_VIEWPORT.height}
      onClick={(event) => activateMinimapPointer(event, projection, onCameraTargetRequest)}
      onContextMenu={blockMinimapEvent}
      onDoubleClick={blockMinimapEvent}
      onPointerCancel={stopMinimapPropagation}
      onPointerDown={stopMinimapPropagation}
      onPointerMove={stopMinimapPropagation}
      onPointerUp={stopMinimapPropagation}
      role="button"
      style={RESPONSIVE_LAYOUT_STYLE}
      viewBox={`0 0 ${SANDBOX_MINIMAP_VIEWPORT.width} ${SANDBOX_MINIMAP_VIEWPORT.height}`}
      width={SANDBOX_MINIMAP_VIEWPORT.width}
    >
      <title>沙盒战场小地图</title>
      <polygon className={styles.boundary} points={pointsAttribute(model.boundary)} />
      <g aria-label="建造区">
        {model.buildZones.map((zone) => (
          <polygon
            className={styles.buildZone}
            data-faction={zone.faction}
            data-minimap-build-zone={zone.id}
            key={zone.id}
            points={pointsAttribute(zone.points)}
          />
        ))}
      </g>
      <g aria-label="三条路线">
        {model.routes.map((route) => (
          <polyline
            className={styles.route}
            data-minimap-route={route.id}
            key={route.id}
            points={pointsAttribute(route.points)}
          />
        ))}
      </g>
      <g aria-label="矿坑">
        {model.minePits.map((pit) => (
          <g
            aria-label={mineControlLabel(pit.id, pit.control)}
            className={styles.minePit}
            data-capture-progress={round(pit.captureProgress)}
            data-capturing-faction={pit.capturingFaction ?? undefined}
            data-control={pit.control}
            data-faction={pit.faction ?? "neutral"}
            data-minimap-mine={pit.id}
            data-occupying-mine={pit.occupyingMineId ?? undefined}
            data-remaining-ore={pit.remainingOre}
            data-status={pit.status}
            key={pit.id}
            role="img"
            transform={`translate(${round(pit.point.x)} ${round(pit.point.y)})`}
          >
            <title>{mineControlLabel(pit.id, pit.control)}</title>
            <circle className={styles.mineCaptureRing} cx={0} cy={0} r={4.1} />
            <circle className={styles.minePiece} cx={0} cy={-2.35} r={1.05} />
            <path
              className={styles.minePiece}
              d="M-0.72,-1.35 C-0.62,-0.6 -0.9,0.15 -1.42,0.85 L1.42,0.85 C0.9,0.15 0.62,-0.6 0.72,-1.35 Z"
            />
            <ellipse className={styles.minePiece} cx={0} cy={1.35} rx={1.72} ry={0.62} />
            <ellipse className={styles.minePiece} cx={0} cy={2.25} rx={2.25} ry={0.7} />
          </g>
        ))}
      </g>
      <g aria-label="城堡">
        {model.castles.map((castle) => (
          <rect
            className={styles.castle}
            data-faction={castle.faction}
            data-minimap-castle={castle.id}
            data-status={castle.status}
            height={6.2}
            key={castle.id}
            width={6.2}
            x={castle.point.x - 3.1}
            y={castle.point.y - 3.1}
          />
        ))}
      </g>
      <g aria-label="动态建筑">
        {model.buildings.map((building) => (
          <rect
            className={styles.building}
            data-building-kind={building.kind}
            data-faction={building.faction}
            data-minimap-building={building.id}
            height={4}
            key={building.id}
            width={4}
            x={building.point.x - 2}
            y={building.point.y - 2}
          />
        ))}
      </g>
      <g aria-label="兵团">
        {model.squads.map((squad) => (
          <circle
            className={styles.squad}
            cx={squad.point.x}
            cy={squad.point.y}
            data-faction={squad.faction}
            data-living-members={squad.livingMembers}
            data-minimap-squad={squad.id}
            data-role={squad.role}
            key={squad.id}
            r={2.4}
          />
        ))}
      </g>
      <polygon
        aria-label="当前视口"
        className={styles.viewport}
        data-minimap-viewport="true"
        points={pointsAttribute(model.viewport)}
      />
    </svg>
  );
}

function pointsAttribute(points: readonly MinimapPoint[]): string {
  return points.map((point) => `${round(point.x)},${round(point.y)}`).join(" ");
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function mineControlLabel(
  id: string,
  control: "neutral" | "player" | "enemy",
): string {
  const state = control === "neutral" ? "未占领" : control === "player" ? "我方占领" : "敌方占领";
  return `矿坑 ${id}：${state}`;
}
