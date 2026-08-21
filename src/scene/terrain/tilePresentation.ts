import { findHexPath } from "../../game/navigation";
import {
  coordinateKey,
  type BattlefieldCell,
  type BattlefieldMap,
  type HexCoordinate,
} from "../../map/battlefield";

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

export function createTerrainTilePlan(
  map: BattlefieldMap,
): readonly TerrainTilePresentation[] {
  const roadKeys = visualRoadKeys(map);
  return map.cells.map((cell) => {
    if (cell.surface === "water") {
      return tilePresentation(cell, "water", 0, "#d8f4ff", []);
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
    return tilePresentation(cell, "grass", 0, landTint(cell), []);
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

function landTint(cell: BattlefieldCell): string {
  if (cell.surface === "camp") return "#f0d89e";
  if (cell.surface === "forest") return "#c2dda0";
  if (cell.surface === "rock") return "#d5d1be";
  return "#edf6c8";
}

function roadAsset(name: string) {
  return { url: `${TILE_ROOT}/roads/hex_road_${name}.gltf` } as const;
}
