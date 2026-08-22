import { findHexPath } from "../../game/navigation";
import {
  coordinateKey,
  getMapCell,
  type BattlefieldCell,
  type BattlefieldMap,
  type HexCoordinate,
} from "../../map/battlefield";
import {
  SANDBOX_LARGE_BATTLEFIELD_ID,
  SANDBOX_LARGE_BUILD_ANCHORS,
  SANDBOX_LARGE_OASIS,
} from "../../map/sandboxLargeBattlefield";
import {
  SANDBOX_LARGE_FARM_FIELD_CELLS,
  SANDBOX_LARGE_FOREST_BANK_CELLS,
  SANDBOX_LARGE_RIVER_CELLS,
} from "../../map/sandboxLargeDressing";
import { SANDBOX_LARGE_ENVIRONMENT_FILL_SCENERY } from "../../map/sandboxLargeScenery";

const TILE_ROOT = "/assets/kaykit/medieval-hex/tiles";

export const TERRAIN_TILE_ASSETS = {
  grass: { url: `${TILE_ROOT}/base/hex_grass.gltf` },
  water: { url: `${TILE_ROOT}/base/hex_water.gltf` },
  "road-A": roadAsset("A"),
  "road-B": roadAsset("B"),
  "road-C": roadAsset("C"),
  "road-D": roadAsset("D"),
  "road-E": roadAsset("E"),
  "road-F": roadAsset("F"),
  "road-G": roadAsset("G"),
  "road-H": roadAsset("H"),
  "road-I": roadAsset("I"),
  "road-J": roadAsset("J"),
  "road-K": roadAsset("K"),
  "road-L": roadAsset("L"),
  "road-M": roadAsset("M"),
  "river-A": riverAsset("A"),
  "river-B": riverAsset("B"),
} as const;

export type TerrainTileAssetKey = keyof typeof TERRAIN_TILE_ASSETS;

export const TERRAIN_TILE_ASSET_KEYS = Object.keys(
  TERRAIN_TILE_ASSETS,
) as readonly TerrainTileAssetKey[];

export interface TerrainTilePresentation {
  readonly cell: BattlefieldCell;
  readonly assetKey: TerrainTileAssetKey;
  readonly renderHeight: number;
  readonly rotationY: number;
  readonly tint: string;
  readonly connections: readonly number[];
}

const MODEL_DIRECTION_OFFSETS: readonly HexCoordinate[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

const ROAD_VARIANT_CONNECTIONS = {
  A: [0, 3],
  B: [3, 5],
  C: [3, 4],
  D: [1, 3, 5],
  E: [0, 3, 5],
  F: [0, 1, 3],
  G: [2, 3, 4],
  H: [0, 2, 3, 4],
  I: [1, 2, 4, 5],
  J: [0, 1, 2, 3],
  K: [1, 2, 3, 4, 5],
  L: [0, 1, 2, 3, 4, 5],
  M: [3],
} as const;

const SANDBOX_RIVER_KEYS = new Set(SANDBOX_LARGE_RIVER_CELLS.map(coordinateKey));
const SANDBOX_FARM_KEYS = new Set(
  Object.values(SANDBOX_LARGE_FARM_FIELD_CELLS).flat().map(coordinateKey),
);
const SANDBOX_FOREST_KEYS = new Set(SANDBOX_LARGE_FOREST_BANK_CELLS.map(coordinateKey));
const SANDBOX_ENVIRONMENT_KIND_BY_KEY = new Map(
  SANDBOX_LARGE_ENVIRONMENT_FILL_SCENERY.map(({ coordinate, kind }) => (
    [coordinateKey(coordinate), kind] as const
  )),
);
const SANDBOX_BUILD_KEYS = new Set(
  Object.values(SANDBOX_LARGE_BUILD_ANCHORS).flatMap((anchors) => (
    anchors.map(({ coordinate }) => coordinateKey(coordinate))
  )),
);
const SANDBOX_RIVER_BANK_KEYS = neighboringKeys(SANDBOX_LARGE_RIVER_CELLS);
const SANDBOX_FARM_FRINGE_KEYS = neighboringKeys(
  Object.values(SANDBOX_LARGE_FARM_FIELD_CELLS).flat(),
);

export function createTerrainTilePlan(
  map: BattlefieldMap,
): readonly TerrainTilePresentation[] {
  const roadKeys = visualRoadKeys(map);
  return map.cells.map((cell) => {
    if (cell.surface === "water") {
      return tilePresentation(cell, "water", 0, "#d8f4ff", []);
    }
    if (
      map.id === SANDBOX_LARGE_BATTLEFIELD_ID
      && SANDBOX_RIVER_KEYS.has(coordinateKey(cell))
    ) {
      const connections = riverConnections(map, cell);
      const river = riverTileForConnections(connections);
      return tilePresentation(
        cell,
        river.assetKey,
        river.rotationY,
        "#f4fff6",
        connections,
      );
    }
    if (roadKeys.has(coordinateKey(cell))) {
      const connections = MODEL_DIRECTION_OFFSETS.flatMap((offset, index) => (
        roadKeys.has(coordinateKey({ q: cell.q + offset.q, r: cell.r + offset.r }))
          ? [index]
          : []
      ));
      const road = roadTileForConnections(connections);
      return tilePresentation(
        cell,
        road.assetKey,
        road.rotationY,
        cell.surface === "camp" ? "#f6dfad" : "#fff5dc",
        connections,
      );
    }
    return tilePresentation(cell, "grass", 0, landTint(cell, map), []);
  });
}

function visualRoadKeys(map: BattlefieldMap): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const cell of map.cells) {
    if (cell.visualRoad === true) keys.add(coordinateKey(cell));
  }
  for (const faction of ["verdant", "crimson"] as const) {
    const camp = map[`${faction}Camp`];
    for (const destination of [map.castleApproaches[faction], ...map.bridges.map(
      ({ landings }) => landings[faction],
    ).flat()]) {
      for (const coordinate of findHexPath(map, camp, destination)) {
        keys.add(coordinateKey(coordinate));
      }
    }
  }
  for (const bridge of map.bridges) {
    for (const coordinate of bridge.cells) keys.add(coordinateKey(coordinate));
    for (const landing of [...bridge.landings.verdant, ...bridge.landings.crimson]) {
      keys.add(coordinateKey(landing));
    }
  }
  return keys;
}

function roadTileForConnections(connections: readonly number[]): {
  readonly assetKey: TerrainTileAssetKey;
  readonly rotationY: number;
} {
  const target = [...connections].sort((first, second) => first - second);
  for (const [variant, baseConnections] of Object.entries(ROAD_VARIANT_CONNECTIONS)) {
    for (let shift = 0; shift < 6; shift += 1) {
      const rotated = baseConnections
        .map((direction) => (direction + shift) % 6)
        .sort((first, second) => first - second);
      if (rotated.length === target.length && rotated.every((value, index) => (
        value === target[index]
      ))) {
        return {
          assetKey: `road-${variant}` as TerrainTileAssetKey,
          rotationY: -shift * Math.PI / 3,
        };
      }
    }
  }
  throw new Error(`No KayKit road tile matches exits ${target.join(",")}.`);
}

function riverConnections(map: BattlefieldMap, cell: BattlefieldCell): readonly number[] {
  const connections = MODEL_DIRECTION_OFFSETS.flatMap((offset, index) => (
    SANDBOX_RIVER_KEYS.has(coordinateKey({ q: cell.q + offset.q, r: cell.r + offset.r }))
      ? [index]
      : []
  ));
  if (connections.length !== 1) return connections;

  // Each short river segment visually enters a mine ridge or the map edge.
  // Prefer an outlet under rock, then one beyond the playable border, so the
  // final KayKit tile never leaves a naked blue/green wedge on open grass.
  const inlet = connections[0]!;
  const opposite = (inlet + 3) % 6;
  const candidateDirections = MODEL_DIRECTION_OFFSETS.map((_, index) => index)
    .filter((index) => index !== inlet)
    .sort((first, second) => (
      directionDistance(first, opposite) - directionDistance(second, opposite)
    ));
  const rockOutlet = candidateDirections.find((index) => {
    const offset = MODEL_DIRECTION_OFFSETS[index]!;
    return getMapCell(map, { q: cell.q + offset.q, r: cell.r + offset.r })?.surface === "rock";
  });
  const borderOutlet = candidateDirections.find((index) => {
    const offset = MODEL_DIRECTION_OFFSETS[index]!;
    return !getMapCell(map, { q: cell.q + offset.q, r: cell.r + offset.r });
  });
  return [inlet, rockOutlet ?? borderOutlet ?? opposite].sort((first, second) => (
    first - second
  ));
}

function directionDistance(first: number, second: number): number {
  const difference = Math.abs(first - second);
  return Math.min(difference, 6 - difference);
}

function riverTileForConnections(connections: readonly number[]): {
  readonly assetKey: TerrainTileAssetKey;
  readonly rotationY: number;
} {
  const road = roadTileForConnections(connections);
  const variant = road.assetKey.slice("road-".length);
  if (variant !== "A" && variant !== "B") {
    throw new Error(`No KayKit river tile matches exits ${connections.join(",")}.`);
  }
  return {
    assetKey: `river-${variant}`,
    rotationY: road.rotationY,
  };
}

function tilePresentation(
  cell: BattlefieldCell,
  assetKey: TerrainTileAssetKey,
  rotationY: number,
  tint: string,
  connections: readonly number[],
  renderHeight = cell.height,
): TerrainTilePresentation {
  return { cell, assetKey, renderHeight, rotationY, tint, connections };
}

function landTint(cell: BattlefieldCell, map: BattlefieldMap): string {
  if (map.id === SANDBOX_LARGE_BATTLEFIELD_ID) return sandboxLandTint(cell);
  if (cell.surface === "camp") return "#f0d89e";
  if (cell.surface === "forest") return "#c2dda0";
  if (cell.surface === "rock") return "#d5d1be";
  return "#edf6c8";
}

function sandboxLandTint(cell: BattlefieldCell): string {
  const key = coordinateKey(cell);
  if (cell.surface === "rock") return "#cbc7ad";
  if (SANDBOX_BUILD_KEYS.has(key)) return "#d8e9a0";
  if (SANDBOX_FARM_KEYS.has(key)) return "#ead59a";
  if (SANDBOX_FOREST_KEYS.has(key)) return "#a9c987";
  if (SANDBOX_FARM_FRINGE_KEYS.has(key)) return "#e4e0a4";
  if (SANDBOX_RIVER_BANK_KEYS.has(key)) return "#c2dca0";
  const environmentKind = SANDBOX_ENVIRONMENT_KIND_BY_KEY.get(key);
  if (environmentKind === "rock-hills") return "#c9caa0";
  if (environmentKind === "bush") return "#d4e6a6";
  if (environmentKind) return "#b7d18e";
  if (
    Math.max(
      Math.abs(cell.q - SANDBOX_LARGE_OASIS.coordinate.q),
      Math.abs(cell.r - SANDBOX_LARGE_OASIS.coordinate.r),
      Math.abs(
        -cell.q - cell.r
        + SANDBOX_LARGE_OASIS.coordinate.q
        + SANDBOX_LARGE_OASIS.coordinate.r
      ),
    ) <= SANDBOX_LARGE_OASIS.radiusCells + 1
  ) return "#cfe6a2";
  if (cell.surface === "camp") return "#e2e5a4";
  const variation = Math.abs(cell.q * 17 + cell.r * 31) % 3;
  return ["#e8f1b5", "#edf4c1", "#e2edaa"][variation]!;
}

function neighboringKeys(coordinates: readonly HexCoordinate[]): ReadonlySet<string> {
  const sourceKeys = new Set(coordinates.map(coordinateKey));
  const neighbors = new Set<string>();
  for (const coordinate of coordinates) {
    for (const offset of MODEL_DIRECTION_OFFSETS) {
      const key = coordinateKey({
        q: coordinate.q + offset.q,
        r: coordinate.r + offset.r,
      });
      if (!sourceKeys.has(key)) neighbors.add(key);
    }
  }
  return neighbors;
}

function roadAsset(name: string) {
  return { url: `${TILE_ROOT}/roads/hex_road_${name}.gltf` } as const;
}

function riverAsset(name: string) {
  return { url: `${TILE_ROOT}/rivers/hex_river_${name}.gltf` } as const;
}
