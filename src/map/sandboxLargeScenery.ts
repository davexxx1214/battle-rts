import type { Faction } from "../game/types";
import {
  axialToWorld,
  coordinateKey,
  hexDistance,
  type BattlefieldCell,
  type HexCoordinate,
} from "./battlefield";
import type {
  BattlefieldScenery,
  BattlefieldSceneryKind,
  BattlefieldSceneryZone,
} from "./battlefieldScenery";
import {
  SANDBOX_LARGE_BATTLEFIELD_MAP,
  SANDBOX_LARGE_BATTLE_STRUCTURES,
  SANDBOX_LARGE_CASTLE_FORTIFICATIONS,
  SANDBOX_LARGE_BUILD_ANCHORS,
  SANDBOX_LARGE_MINE_DISTRICTS,
  SANDBOX_LARGE_MINE_PITS,
  SANDBOX_LARGE_NEUTRAL_ENCOUNTERS,
  SANDBOX_LARGE_OASIS,
  SANDBOX_LARGE_ROAD_RESERVE,
  SANDBOX_LARGE_VISUAL_ROAD_CELLS,
} from "./sandboxLargeBattlefield";
import {
  SANDBOX_LARGE_DRESSING_SCENERY,
  SANDBOX_LARGE_WILDLIFE,
} from "./sandboxLargeDressing";

export const SANDBOX_LARGE_ENVIRONMENT_COVERAGE_RATIO = 0.5;
export const SANDBOX_LARGE_ENVIRONMENT_COVERAGE_TARGET = Math.ceil(
  SANDBOX_LARGE_BATTLEFIELD_MAP.cells.length * SANDBOX_LARGE_ENVIRONMENT_COVERAGE_RATIO,
);

const ENVIRONMENT_COVERAGE_ZONES = [
  "verdant-base",
  "neutral",
  "crimson-base",
] as const;

const MINE_RIDGE_KINDS = [
  "mine-mountain-a",
  "mine-rock-e",
  "mine-mountain-b",
  "mine-rock-c",
  "mine-mountain-c",
  "mine-rock-e",
  "mine-rock-c",
  "mine-rock-e",
] as const satisfies readonly BattlefieldSceneryKind[];

const MINE_ROCK_ACCENTS = [
  { cellIndex: 1, kind: "mine-rock-e", offset: { x: 0.48, z: -0.3 }, scale: 0.36 },
  { cellIndex: 6, kind: "mine-rock-c", offset: { x: -0.42, z: 0.38 }, scale: 0.4 },
  { cellIndex: 7, kind: "mine-rock-e", offset: { x: 0.58, z: 0.34 }, scale: 0.32 },
] as const satisfies readonly {
  readonly cellIndex: number;
  readonly kind: BattlefieldSceneryKind;
  readonly offset: Readonly<{ x: number; z: number }>;
  readonly scale: number;
}[];

const MINE_SHAFT_EAST_STEP_PITS = new Set(["P-E", "N-NW", "N-SE", "E-E"]);

function mineShaftCoordinate(pit: {
  readonly id: string;
  readonly coordinate: HexCoordinate;
}): HexCoordinate {
  return {
    q: pit.coordinate.q + (MINE_SHAFT_EAST_STEP_PITS.has(pit.id) ? 1 : 0),
    r: pit.coordinate.r - 1,
  };
}

const SANDBOX_LARGE_MINE_SCENERY: readonly BattlefieldScenery[] = Object.freeze(
  SANDBOX_LARGE_MINE_DISTRICTS.flatMap((district) => {
    const pit = SANDBOX_LARGE_MINE_PITS.find((candidate) => candidate.id === district.pitId);
    if (!pit) throw new Error(`Missing sandbox mine pit ${district.pitId}.`);
    const controller = pit.initialController;
    const zone: BattlefieldSceneryZone = district.wing === "west"
      ? "left-mine"
      : "right-mine";
    const shaftKey = coordinateKey(mineShaftCoordinate(pit));
    return district.cells.flatMap((coordinate, index) => {
      if (coordinateKey(coordinate) === shaftKey) return [];
      const kind = MINE_RIDGE_KINDS[index]!;
      const ridge = createScenery({
        id: `sandbox-${district.pitId}-ridge-${index}-${kind}`,
        kind,
        zone,
        coordinate,
        offset: {
          x: ((index % 3) - 1) * 0.08,
          z: (index % 2 === 0 ? -1 : 1) * 0.07,
        },
        scale: kind.startsWith("mine-mountain-")
          ? 0.88 + (index % 3) * 0.06
          : 0.56 + (index % 2) * 0.08,
        rotationY: (index % 6) * Math.PI / 3
          + (controller === "crimson" ? Math.PI : 0),
        ...(controller ? { faction: controller } : {}),
      });
      return index % 2 === 0
        ? [
            ridge,
            createScenery({
              id: `sandbox-${district.pitId}-ore-${index}`,
              kind: "iron",
              zone,
              coordinate,
              offset: { x: 0.42, z: index % 4 === 0 ? 0.34 : -0.36 },
              scale: 0.62 + (index % 3) * 0.05,
              rotationY: ridge.rotationY - Math.PI / 5,
              ...(controller ? { faction: controller } : {}),
            }),
          ]
        : [ridge];
    });
  }),
);

/**
 * Each presentation-only mine entrance occupies one of the two screen-north
 * neighboring hexes. The selected side avoids logical entrances and reserved
 * roads, while the model's visible mouth faces screen-south toward the pit.
 */
export const SANDBOX_LARGE_MINE_SHAFT_SCENERY: readonly BattlefieldScenery[] =
  Object.freeze(SANDBOX_LARGE_MINE_PITS.map((pit) => {
    const coordinate = mineShaftCoordinate(pit);
    const zone: BattlefieldSceneryZone = pit.coordinate.q < 0
      ? "left-mine"
      : "right-mine";
    return createScenery({
      id: `sandbox-${pit.id}-mine-shaft`,
      kind: "mine-shaft",
      zone,
      coordinate,
      offset: offsetToward(coordinate, pit.coordinate, 0.14),
      scale: 1.08,
      rotationY: facingRotation(coordinate, pit.coordinate),
    });
  }));

const SANDBOX_LARGE_MINE_ROCK_SCENERY: readonly BattlefieldScenery[] = Object.freeze(
  SANDBOX_LARGE_MINE_DISTRICTS.flatMap((district) => {
    const zone: BattlefieldSceneryZone = district.wing === "west"
      ? "left-mine"
      : "right-mine";
    const mirrorX = district.wing === "west" ? 1 : -1;
    return MINE_ROCK_ACCENTS.map((accent, index) => createScenery({
      id: `sandbox-${district.pitId}-rock-accent-${index}`,
      kind: accent.kind,
      zone,
      coordinate: district.cells[accent.cellIndex]!,
      offset: {
        x: accent.offset.x * mirrorX,
        z: accent.offset.z,
      },
      scale: accent.scale + (index % 2) * 0.04,
      rotationY: (index * 2 + (district.wing === "west" ? 0 : 1)) * Math.PI / 3,
    }));
  }),
);

const SANDBOX_LARGE_BASE_SCENERY: readonly BattlefieldScenery[] = Object.freeze([
  ...SANDBOX_LARGE_MINE_SCENERY,
  ...SANDBOX_LARGE_MINE_ROCK_SCENERY,
  ...SANDBOX_LARGE_MINE_SHAFT_SCENERY,
  ...SANDBOX_LARGE_DRESSING_SCENERY,
]);
const SANDBOX_LARGE_BASE_COVERED_KEYS = environmentCoveredKeys(
  SANDBOX_LARGE_BASE_SCENERY,
);
const SANDBOX_LARGE_ENVIRONMENT_FORBIDDEN_KEYS = new Set([
  ...SANDBOX_LARGE_ROAD_RESERVE.map(coordinateKey),
  ...Object.values(SANDBOX_LARGE_BUILD_ANCHORS).flatMap((anchors) => (
    anchors.map(({ coordinate }) => coordinateKey(coordinate))
  )),
  ...SANDBOX_LARGE_MINE_DISTRICTS.flatMap(({ cells }) => cells.map(coordinateKey)),
  ...SANDBOX_LARGE_MINE_PITS.map(({ coordinate }) => coordinateKey(coordinate)),
  ...SANDBOX_LARGE_BATTLE_STRUCTURES.flatMap(({ footprint }) => footprint.map(coordinateKey)),
  ...SANDBOX_LARGE_CASTLE_FORTIFICATIONS.flatMap(({ footprint }) => footprint.map(coordinateKey)),
]);

/**
 * Stage 10 low-profile environmental fill. It deliberately stays art-only:
 * routes, construction anchors, mine entrances, and encounter arenas retain
 * their authoritative navigation and interaction space.
 */
export const SANDBOX_LARGE_ENVIRONMENT_FILL_SCENERY: readonly BattlefieldScenery[] =
  Object.freeze(ENVIRONMENT_COVERAGE_ZONES.flatMap((zoneId) => {
    const zoneCells = SANDBOX_LARGE_BATTLEFIELD_MAP.cells.filter((cell) => (
      cell.zoneId === zoneId
    ));
    const zoneTarget = Math.ceil(
      zoneCells.length * SANDBOX_LARGE_ENVIRONMENT_COVERAGE_RATIO,
    );
    const coveredCount = zoneCells.filter((cell) => (
      SANDBOX_LARGE_BASE_COVERED_KEYS.has(coordinateKey(cell))
    )).length;
    const requiredCount = Math.max(0, zoneTarget - coveredCount);
    const candidates = zoneCells
      .filter(environmentFillCandidate)
      .sort(compareEnvironmentFillCandidates);

    if (candidates.length < requiredCount) {
      throw new Error(
        `Sandbox ${zoneId} environment requires ${requiredCount} cells, but only ${candidates.length} are available.`,
      );
    }
    return candidates.slice(0, requiredCount).map(createEnvironmentFillScenery);
  }));

export const SANDBOX_LARGE_SCENERY: readonly BattlefieldScenery[] = Object.freeze([
  ...SANDBOX_LARGE_BASE_SCENERY,
  ...SANDBOX_LARGE_ENVIRONMENT_FILL_SCENERY,
]);

export const SANDBOX_LARGE_ENVIRONMENT_COVERED_CELL_COUNT = environmentCoveredKeys(
  SANDBOX_LARGE_SCENERY,
).size;

if (
  SANDBOX_LARGE_ENVIRONMENT_COVERED_CELL_COUNT
  < SANDBOX_LARGE_ENVIRONMENT_COVERAGE_TARGET
) {
  throw new Error(
    `Sandbox environment covers ${SANDBOX_LARGE_ENVIRONMENT_COVERED_CELL_COUNT}/${SANDBOX_LARGE_BATTLEFIELD_MAP.cells.length} cells; target is ${SANDBOX_LARGE_ENVIRONMENT_COVERAGE_TARGET}.`,
  );
}

function environmentFillCandidate(cell: BattlefieldCell): boolean {
  const key = coordinateKey(cell);
  return !SANDBOX_LARGE_BASE_COVERED_KEYS.has(key)
    && !SANDBOX_LARGE_ENVIRONMENT_FORBIDDEN_KEYS.has(key)
    && SANDBOX_LARGE_NEUTRAL_ENCOUNTERS.every((encounter) => (
      hexDistance(cell, encounter.anchor) > encounter.guardRadiusCells
    ));
}

function compareEnvironmentFillCandidates(
  first: BattlefieldCell,
  second: BattlefieldCell,
): number {
  const scoreDifference = environmentFillScore(second) - environmentFillScore(first);
  if (Math.abs(scoreDifference) > Number.EPSILON) return scoreDifference;
  return coordinateKey(first).localeCompare(coordinateKey(second));
}

function environmentFillScore(coordinate: HexCoordinate): number {
  const organicCluster = Math.sin(coordinate.q * 0.73 + coordinate.r * 0.31)
    + Math.cos(coordinate.q * 0.27 - coordinate.r * 0.61);
  const rimBias = hexDistance(coordinate, SANDBOX_LARGE_BATTLEFIELD_MAP.center)
    / SANDBOX_LARGE_BATTLEFIELD_MAP.radius;
  return organicCluster + rimBias * 0.55;
}

function createEnvironmentFillScenery(
  coordinate: BattlefieldCell,
  index: number,
): BattlefieldScenery {
  const variant = coordinateVariant(coordinate);
  const kind = environmentKindFor(coordinate, variant);
  const zone: BattlefieldSceneryZone = coordinate.zoneId === "neutral"
    ? "wild"
    : "outskirts";
  return createScenery({
    id: `sandbox-environment-${coordinate.zoneId}-${coordinate.q}-${coordinate.r}`,
    kind,
    zone,
    coordinate,
    offset: {
      x: ((variant % 7) - 3) * 0.065,
      z: (((Math.floor(variant / 7) % 7) - 3) * 0.06),
    },
    scale: environmentScaleFor(kind, variant),
    rotationY: ((variant + index) % 12) * Math.PI / 6,
  });
}

function environmentKindFor(
  coordinate: HexCoordinate,
  variant: number,
): BattlefieldSceneryKind {
  const distance = hexDistance(coordinate, SANDBOX_LARGE_BATTLEFIELD_MAP.center);
  if (distance >= 16) return variant % 2 === 0 ? "grove-a" : "rock-hills";
  return ([
    "bush",
    "bush",
    "tree",
    "grove-a",
    "bush",
    "grove-b",
    "rock-hills",
  ] as const)[variant % 7];
}

function environmentScaleFor(kind: BattlefieldSceneryKind, variant: number): number {
  const variation = (variant % 3) * 0.035;
  if (kind === "bush") return 0.52 + variation;
  if (kind === "tree") return 0.46 + variation;
  if (kind === "rock-hills") return 0.4 + variation;
  return 0.42 + variation;
}

function coordinateVariant({ q, r }: HexCoordinate): number {
  return (Math.imul(q + 37, 73_856_093) ^ Math.imul(r + 41, 19_349_663)) >>> 0;
}

function facingRotation(from: HexCoordinate, to: HexCoordinate): number {
  const origin = axialToWorld(from);
  const target = axialToWorld(to);
  return Math.atan2(target.x - origin.x, target.z - origin.z);
}

function offsetToward(
  from: HexCoordinate,
  to: HexCoordinate,
  distance: number,
): Readonly<{ x: number; z: number }> {
  const origin = axialToWorld(from);
  const target = axialToWorld(to);
  const deltaX = target.x - origin.x;
  const deltaZ = target.z - origin.z;
  const length = Math.hypot(deltaX, deltaZ);
  return {
    x: deltaX / length * distance,
    z: deltaZ / length * distance,
  };
}

function environmentCoveredKeys(
  scenery: readonly BattlefieldScenery[],
): ReadonlySet<string> {
  return new Set([
    ...SANDBOX_LARGE_VISUAL_ROAD_CELLS.map(coordinateKey),
    ...scenery.map(({ coordinate }) => coordinateKey(coordinate)),
    ...SANDBOX_LARGE_BATTLE_STRUCTURES.flatMap(({ footprint }) => footprint.map(coordinateKey)),
    ...SANDBOX_LARGE_CASTLE_FORTIFICATIONS.flatMap(({ footprint }) => footprint.map(coordinateKey)),
    ...SANDBOX_LARGE_MINE_PITS.map(({ coordinate }) => coordinateKey(coordinate)),
    coordinateKey(SANDBOX_LARGE_OASIS.coordinate),
    ...SANDBOX_LARGE_WILDLIFE.map(({ coordinate }) => coordinateKey(coordinate)),
  ]);
}

function createScenery(input: {
  readonly id: string;
  readonly kind: BattlefieldSceneryKind;
  readonly zone: BattlefieldSceneryZone;
  readonly coordinate: { readonly q: number; readonly r: number };
  readonly offset: { readonly x: number; readonly z: number };
  readonly scale: number;
  readonly rotationY: number;
  readonly faction?: Faction;
}): BattlefieldScenery {
  return Object.freeze({
    ...input,
    coordinate: Object.freeze({ ...input.coordinate }),
    offset: Object.freeze({ ...input.offset }),
  });
}
