import type { BattleState } from "../../game/battle";
import type { CombatFaction, Faction, WorldPoint } from "../../game/types";
import { axialToWorld, coordinateKey } from "../../map/battlefield";
import type { BattlefieldDefinition } from "../../map/battlefieldDefinition";
import type { CameraViewSnapshot } from "../../scene/camera/cameraViewStore";
import type { MinimapPoint, MinimapProjection } from "./minimapProjection";

export interface MinimapRouteShape {
  readonly id: string;
  readonly points: readonly MinimapPoint[];
}

export interface MinimapBuildZoneShape {
  readonly id: string;
  readonly faction: Faction;
  readonly wing: string;
  readonly points: readonly MinimapPoint[];
}

export interface MinimapMineMarker {
  readonly id: string;
  readonly faction: Faction | null;
  readonly control: "neutral" | "player" | "enemy";
  readonly status: "neutral" | "controlled" | "capturing" | "occupied" | "depleted";
  readonly remainingOre: number;
  readonly occupyingMineId: string | null;
  readonly capturingFaction: Faction | null;
  readonly captureProgress: number;
  readonly point: MinimapPoint;
}

export interface MinimapCastleMarker {
  readonly id: string;
  readonly faction: Faction;
  readonly status: "active" | "destroyed" | "missing";
  readonly point: MinimapPoint;
}

export interface MinimapBuildingMarker {
  readonly id: string;
  readonly faction: Faction;
  readonly kind: string;
  readonly point: MinimapPoint;
}

export interface MinimapUnitMarker {
  readonly id: string;
  readonly faction: CombatFaction;
  readonly role: string;
  readonly point: MinimapPoint;
}

export interface MinimapHealingZoneMarker {
  readonly id: string;
  readonly radiusCells: number;
  readonly healingPerSecond: number;
  readonly point: MinimapPoint;
}

export interface SandboxMinimapModel {
  readonly boundary: readonly MinimapPoint[];
  readonly routes: readonly MinimapRouteShape[];
  readonly buildZones: readonly MinimapBuildZoneShape[];
  readonly minePits: readonly MinimapMineMarker[];
  readonly castles: readonly MinimapCastleMarker[];
  readonly buildings: readonly MinimapBuildingMarker[];
  readonly units: readonly MinimapUnitMarker[];
  readonly healingZones: readonly MinimapHealingZoneMarker[];
  readonly viewport: readonly MinimapPoint[];
}

export function isSandboxMinimapAvailable(
  battle: BattleState,
  battlefield: BattlefieldDefinition,
): boolean {
  return battle.modeId === "sandbox"
    && battle.mapId === battlefield.id
    && (battlefield.routes?.length ?? 0) > 0
    && (battlefield.minePits?.length ?? 0) > 0
    && battlefield.buildAnchors !== undefined;
}

export function createSandboxMinimapModel(
  battle: BattleState,
  battlefield: BattlefieldDefinition,
  cameraView: CameraViewSnapshot,
  projection: MinimapProjection,
): SandboxMinimapModel {
  if (!isSandboxMinimapAvailable(battle, battlefield)) {
    throw new Error(`Battlefield ${battlefield.id} is not available for the sandbox minimap.`);
  }
  const activeBuildingByCoordinate = new Map(
    battle.buildings
      .filter((building) => building.status === "active" && building.health > 0)
      .map((building) => [coordinateKey(building.coordinate), building] as const),
  );
  const routes = (battlefield.routes ?? []).map((route): MinimapRouteShape => Object.freeze({
    id: route.id,
    points: freezePoints(route.referencePath.map((coordinate) => (
      projection.project(axialToWorld(coordinate))
    ))),
  }));
  const buildZones = (["verdant", "crimson"] as const).flatMap((faction) => {
    const anchors = battlefield.buildAnchors?.[faction] ?? [];
    const byWing = new Map<string, MinimapPoint[]>();
    for (const anchor of anchors) {
      const points = byWing.get(anchor.wing) ?? [];
      points.push(projection.project(axialToWorld(anchor.coordinate)));
      byWing.set(anchor.wing, points);
    }
    return [...byWing].map(([wing, points]): MinimapBuildZoneShape => Object.freeze({
      id: `${faction}-${wing}`,
      faction,
      wing,
      points: freezePoints(convexHull(points)),
    }));
  });
  const minePits = (battlefield.minePits ?? []).map((pit): MinimapMineMarker => {
    const runtimePit = battle.mining?.pitsById[pit.id];
    if (runtimePit) {
      const status: MinimapMineMarker["status"] = runtimePit.depleted
        ? "depleted"
        : runtimePit.occupyingMineId !== null
          ? "occupied"
          : runtimePit.capturingFaction !== null && runtimePit.captureProgress > 0
            ? "capturing"
            : runtimePit.controller !== null ? "controlled" : "neutral";
      return Object.freeze({
        id: pit.id,
        faction: runtimePit.controller,
        control: mineControlFor(runtimePit.controller),
        status,
        remainingOre: runtimePit.remainingOre,
        occupyingMineId: runtimePit.occupyingMineId,
        capturingFaction: runtimePit.capturingFaction,
        captureProgress: runtimePit.captureProgress,
        point: freezePoint(projection.project(axialToWorld(pit.coordinate))),
      });
    }

    // Static fallback supports legacy sandbox snapshots created before mining state existed.
    const mine = activeBuildingByCoordinate.get(coordinateKey(pit.coordinate));
    const occupiedMine = mine?.kind === "gold-mine" ? mine : null;
    const faction = occupiedMine?.faction ?? pit.initialController;
    return Object.freeze({
      id: pit.id,
      faction,
      control: mineControlFor(faction),
      status: occupiedMine ? "occupied" : faction ? "controlled" : "neutral",
      remainingOre: pit.capacity,
      occupyingMineId: occupiedMine?.id ?? null,
      capturingFaction: null,
      captureProgress: 0,
      point: freezePoint(projection.project(axialToWorld(pit.coordinate))),
    });
  });
  const castles = (["verdant", "crimson"] as const).map((faction): MinimapCastleMarker => {
    const castle = battle.buildings.find((building) => (
      building.kind === "castle" && building.faction === faction
    ));
    return Object.freeze({
      id: `${faction}-castle`,
      faction,
      status: !castle ? "missing" : castle.status === "active" && castle.health > 0
        ? "active"
        : "destroyed",
      point: freezePoint(projection.project(axialToWorld(battlefield.map.castles[faction]))),
    });
  });
  const buildings = battle.buildings
    .filter((building) => (
      building.kind !== "castle" && building.status === "active" && building.health > 0
    ))
    .map((building): MinimapBuildingMarker => Object.freeze({
      id: building.id,
      faction: building.faction,
      kind: building.kind,
      point: freezePoint(projection.project(axialToWorld(building.coordinate))),
    }));
  const units = [...battle.units, ...(battle.neutralMonsters ?? [])]
    .filter((unit) => unit.health > 0 && unit.status !== "dead")
    .map((unit): MinimapUnitMarker => Object.freeze({
      id: unit.id,
      faction: unit.faction,
      role: unit.role,
      point: freezePoint(projection.project(unit.position)),
    }));
  const healingZones = (battlefield.healingZones ?? []).map((zone) => Object.freeze({
    id: zone.id,
    radiusCells: zone.radiusCells,
    healingPerSecond: zone.healingPerSecond,
    point: freezePoint(projection.project(axialToWorld(zone.coordinate))),
  }));

  return Object.freeze({
    boundary: freezePoints(convexHull(battlefield.map.cells.map((cell) => (
      projection.project(axialToWorld(cell))
    )))),
    routes: Object.freeze(routes),
    buildZones: Object.freeze(buildZones),
    minePits: Object.freeze(minePits),
    castles: Object.freeze(castles),
    buildings: Object.freeze(buildings),
    units: Object.freeze(units),
    healingZones: Object.freeze(healingZones),
    viewport: freezePoints(cameraViewportCorners(cameraView).map(projection.project)),
  });
}

function mineControlFor(controller: Faction | null): MinimapMineMarker["control"] {
  if (controller === null) return "neutral";
  return controller === "verdant" ? "player" : "enemy";
}

function cameraViewportCorners(view: CameraViewSnapshot): WorldPoint[] {
  const halfWidth = Math.max(0, view.width) / 2;
  const halfHeight = Math.max(0, view.height) / 2;
  const right = { x: Math.cos(view.yaw), z: -Math.sin(view.yaw) };
  const up = { x: -Math.sin(view.yaw), z: -Math.cos(view.yaw) };
  return [
    worldOffset(view.center, right, -halfWidth, up, -halfHeight),
    worldOffset(view.center, right, halfWidth, up, -halfHeight),
    worldOffset(view.center, right, halfWidth, up, halfHeight),
    worldOffset(view.center, right, -halfWidth, up, halfHeight),
  ];
}

function worldOffset(
  center: WorldPoint,
  firstAxis: WorldPoint,
  firstDistance: number,
  secondAxis: WorldPoint,
  secondDistance: number,
): WorldPoint {
  return {
    x: center.x + firstAxis.x * firstDistance + secondAxis.x * secondDistance,
    z: center.z + firstAxis.z * firstDistance + secondAxis.z * secondDistance,
  };
}

function convexHull(points: readonly MinimapPoint[]): MinimapPoint[] {
  if (points.length <= 1) return points.map((point) => ({ ...point }));
  const sorted = [...points].sort((first, second) => first.x - second.x || first.y - second.y);
  const lower: MinimapPoint[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: MinimapPoint[] = [];
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function cross(origin: MinimapPoint, first: MinimapPoint, second: MinimapPoint): number {
  return (first.x - origin.x) * (second.y - origin.y)
    - (first.y - origin.y) * (second.x - origin.x);
}

function freezePoint(point: MinimapPoint): MinimapPoint {
  return Object.freeze({ ...point });
}

function freezePoints(points: readonly MinimapPoint[]): readonly MinimapPoint[] {
  return Object.freeze(points.map(freezePoint));
}
