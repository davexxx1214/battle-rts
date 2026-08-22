import type { Faction } from "../game/types";
import type { HexCoordinate } from "./battlefield";
import type {
  BattlefieldScenery,
  BattlefieldSceneryKind,
  BattlefieldSceneryZone,
} from "./battlefieldScenery";

export type SandboxWildlifeKind = "cow" | "deer" | "fox";

export interface SandboxWildlifePlacement {
  readonly id: string;
  readonly kind: SandboxWildlifeKind;
  readonly coordinate: HexCoordinate;
  readonly offset: Readonly<{ x: number; z: number }>;
  readonly scale: number;
  readonly rotationY: number;
  readonly animation: "Idle" | "Eating";
}

/**
 * Stage 10 art-only water. These cells remain shallow and walkable in the
 * authoritative map; the river stays outside the east-lane road reserve and
 * therefore cannot become a hidden single-cell navigation gate.
 */
export const SANDBOX_LARGE_RIVER_CELLS: readonly HexCoordinate[] = freezeCoordinates([
  { q: 15, r: -9 },
  { q: 15, r: -8 },
  { q: 14, r: -7 },
  { q: 14, r: -6 },
  { q: 14, r: -5 },
  { q: 14, r: -4 },
  { q: 11, r: -1 },
  { q: 11, r: 0 },
  { q: 10, r: 1 },
  { q: 10, r: 4 },
  { q: 9, r: 5 },
  { q: 8, r: 6 },
  { q: 7, r: 7 },
  { q: 7, r: 8 },
  { q: 6, r: 9 },
]);

export const SANDBOX_LARGE_FARM_FIELD_CELLS: Readonly<
  Record<Faction, readonly HexCoordinate[]>
> = Object.freeze({
  verdant: freezeCoordinates([
    { q: -18, r: 12 },
    { q: -17, r: 12 },
    { q: -16, r: 12 },
    { q: -17, r: 13 },
    { q: -16, r: 13 },
    { q: -15, r: 13 },
    { q: 4, r: 12 },
    { q: 5, r: 12 },
    { q: 6, r: 12 },
    { q: 3, r: 13 },
    { q: 4, r: 13 },
    { q: 5, r: 13 },
  ]),
  crimson: freezeCoordinates([
    { q: 18, r: -12 },
    { q: 17, r: -12 },
    { q: 16, r: -12 },
    { q: 17, r: -13 },
    { q: 16, r: -13 },
    { q: 15, r: -13 },
    { q: -4, r: -12 },
    { q: -5, r: -12 },
    { q: -6, r: -12 },
    { q: -3, r: -13 },
    { q: -4, r: -13 },
    { q: -5, r: -13 },
  ]),
});

export const SANDBOX_LARGE_FOREST_BANK_CELLS: readonly HexCoordinate[] =
  freezeCoordinates([
    { q: 4, r: 9 },
    { q: 5, r: 8 },
    { q: 6, r: 7 },
    { q: 8, r: 0 },
    { q: 8, r: 1 },
    { q: 13, r: -7 },
    { q: 13, r: -8 },
    { q: 13, r: -9 },
  ]);

const FARM_SCENERY = (Object.entries(SANDBOX_LARGE_FARM_FIELD_CELLS) as readonly [
  Faction,
  readonly HexCoordinate[],
][]).flatMap(([faction, coordinates]) => coordinates.map((coordinate, index) => scenery({
  id: `sandbox-${faction}-farm-field-${index}`,
  kind: index % 4 === 0 ? "farm-dirt" : "farm-grain",
  zone: "sandbox-farm",
  coordinate,
  offset: { x: 0, z: 0 },
  scale: index % 4 === 0 ? 0.9 : 0.92,
  rotationY: (index % 3) * Math.PI / 3 + (faction === "crimson" ? Math.PI : 0),
  faction,
})));

const FARM_LANDMARKS: readonly BattlefieldScenery[] = [
  ...mirrorFactionScenery(
    scenery({
      id: "sandbox-verdant-farm-west-windmill",
      kind: "farm-windmill",
      zone: "sandbox-farm",
      coordinate: { q: -17, r: 11 },
      offset: { x: 0.04, z: -0.08 },
      scale: 0.92,
      rotationY: Math.PI / 6,
      faction: "verdant",
    }),
  ),
  ...mirrorFactionScenery(
    scenery({
      id: "sandbox-verdant-farm-east-watermill",
      kind: "farm-watermill",
      zone: "sandbox-farm",
      coordinate: { q: 6, r: 11 },
      offset: { x: -0.08, z: -0.16 },
      scale: 0.88,
      rotationY: 0,
      faction: "verdant",
    }),
  ),
  ...mirrorFactionScenery(
    scenery({
      id: "sandbox-verdant-farm-east-wagon",
      kind: "farm-cargo-wagon",
      zone: "sandbox-farm",
      coordinate: { q: 5, r: 11 },
      offset: { x: 0.08, z: 0.04 },
      scale: 0.76,
      rotationY: Math.PI / 3,
      faction: "verdant",
    }),
  ),
];

export const SANDBOX_LARGE_CASTLE_SETTLEMENT_SCENERY: readonly BattlefieldScenery[] =
  Object.freeze([
    ...mirrorFactionScenery(scenery({
      id: "sandbox-verdant-castle-church",
      kind: "camp-church",
      zone: "verdant-camp",
      coordinate: { q: -10, r: 17 },
      offset: { x: 0.08, z: 0.02 },
      scale: 1,
      rotationY: Math.PI / 3,
      faction: "verdant",
    })),
    ...mirrorFactionScenery(scenery({
      id: "sandbox-verdant-castle-well",
      kind: "camp-well",
      zone: "verdant-camp",
      coordinate: { q: -9, r: 17 },
      offset: { x: 0.12, z: 0.04 },
      scale: 0.78,
      rotationY: Math.PI / 6,
      faction: "verdant",
    })),
    ...mirrorFactionScenery(scenery({
      id: "sandbox-verdant-castle-market",
      kind: "camp-market",
      zone: "verdant-camp",
      coordinate: { q: -8, r: 18 },
      offset: { x: 0, z: -0.08 },
      scale: 0.96,
      rotationY: 0,
      faction: "verdant",
    })),
    ...mirrorFactionScenery(scenery({
      id: "sandbox-verdant-castle-tavern",
      kind: "camp-tavern",
      zone: "verdant-camp",
      coordinate: { q: -6, r: 18 },
      offset: { x: -0.06, z: -0.04 },
      scale: 0.92,
      rotationY: -Math.PI / 3,
      faction: "verdant",
    })),
    ...mirrorFactionScenery(scenery({
      id: "sandbox-verdant-castle-home-a",
      kind: "farm-home-a",
      zone: "verdant-camp",
      coordinate: { q: -10, r: 16 },
      offset: { x: 0.04, z: 0.02 },
      scale: 0.94,
      rotationY: Math.PI / 3,
      faction: "verdant",
    })),
    ...mirrorFactionScenery(scenery({
      id: "sandbox-verdant-castle-home-b",
      kind: "farm-home-b",
      zone: "verdant-camp",
      coordinate: { q: -6, r: 16 },
      offset: { x: -0.04, z: 0.02 },
      scale: 0.98,
      rotationY: -Math.PI / 3,
      faction: "verdant",
    })),
  ]);

const RIVER_SCENERY = SANDBOX_LARGE_RIVER_CELLS.flatMap((coordinate, index) => {
  const detailKind = index % 3 === 0
    ? "water-lily-a"
    : index % 3 === 1 ? "water-plant-a" : "water-lily-b";
  return scenery({
    id: `sandbox-river-detail-${index}`,
    kind: detailKind,
    zone: "sandbox-river",
    coordinate,
    offset: index % 2 === 0 ? { x: 0.42, z: -0.32 } : { x: -0.38, z: 0.28 },
    scale: 0.72 + (index % 3) * 0.08,
    rotationY: (index % 6) * Math.PI / 3,
  });
});

const RIVER_LANDMARKS: readonly BattlefieldScenery[] = [
  scenery({
    id: "sandbox-east-river-stone-bridge",
    kind: "river-bridge",
    zone: "sandbox-river",
    coordinate: { q: 11, r: 0 },
    offset: { x: 0, z: 0 },
    scale: 0.9,
    rotationY: Math.PI / 3,
  }),
  scenery({
    id: "sandbox-east-river-water-plant",
    kind: "water-plant-c",
    zone: "sandbox-river",
    coordinate: { q: 10, r: 1 },
    offset: { x: 0.12, z: -0.12 },
    scale: 0.84,
    rotationY: -Math.PI / 6,
  }),
];

const FOREST_SCENERY = SANDBOX_LARGE_FOREST_BANK_CELLS.flatMap((coordinate, index) => [
  scenery({
    id: `sandbox-east-forest-${index}`,
    kind: index % 2 === 0 ? "grove-a" : "grove-b",
    zone: "sandbox-forest",
    coordinate,
    offset: { x: 0.14, z: index % 2 === 0 ? -0.08 : 0.1 },
    scale: 0.72 + (index % 3) * 0.05,
    rotationY: (index % 6) * Math.PI / 3,
  }),
  scenery({
    id: `sandbox-east-forest-bush-${index}`,
    kind: "bush",
    zone: "sandbox-forest",
    coordinate,
    offset: index % 2 === 0 ? { x: -0.52, z: 0.36 } : { x: 0.48, z: -0.4 },
    scale: 0.62 + (index % 3) * 0.06,
    rotationY: ((index + 2) % 6) * Math.PI / 3,
  }),
]);

export const SANDBOX_LARGE_DRESSING_SCENERY: readonly BattlefieldScenery[] =
  Object.freeze([
    ...FARM_SCENERY,
    ...FARM_LANDMARKS,
    ...SANDBOX_LARGE_CASTLE_SETTLEMENT_SCENERY,
    ...RIVER_SCENERY,
    ...RIVER_LANDMARKS,
    ...FOREST_SCENERY,
  ]);

export const SANDBOX_LARGE_WILDLIFE: readonly SandboxWildlifePlacement[] = Object.freeze([
  wildlife("sandbox-farm-cow-north", "cow", { q: -17, r: 12 }, { x: 0.34, z: -0.2 }, 0.92, 0.4, "Eating"),
  wildlife("sandbox-farm-cow-south", "cow", { q: 17, r: -12 }, { x: -0.34, z: 0.2 }, 0.92, Math.PI + 0.4, "Eating"),
  wildlife("sandbox-river-deer-north", "deer", { q: 5, r: 8 }, { x: -0.2, z: 0.12 }, 0.86, -0.7, "Idle"),
  wildlife("sandbox-river-deer-south", "deer", { q: 13, r: -8 }, { x: 0.18, z: -0.1 }, 0.86, Math.PI - 0.7, "Idle"),
  wildlife("sandbox-river-fox", "fox", { q: 8, r: 0 }, { x: -0.42, z: 0.34 }, 0.82, Math.PI / 2, "Idle"),
]);

function scenery(input: {
  readonly id: string;
  readonly kind: BattlefieldSceneryKind;
  readonly zone: BattlefieldSceneryZone;
  readonly coordinate: HexCoordinate;
  readonly offset: Readonly<{ x: number; z: number }>;
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

function mirrorFactionScenery(source: BattlefieldScenery): readonly BattlefieldScenery[] {
  if (source.faction !== "verdant") {
    throw new Error(`Sandbox mirrored scenery ${source.id} must start in verdant territory.`);
  }
  return Object.freeze([
    source,
    scenery({
      ...source,
      id: source.id.replace("verdant", "crimson"),
      zone: source.zone === "verdant-camp" ? "crimson-camp" : source.zone,
      coordinate: { q: -source.coordinate.q, r: -source.coordinate.r },
      offset: { x: -source.offset.x, z: -source.offset.z },
      rotationY: source.rotationY + Math.PI,
      faction: "crimson",
    }),
  ]);
}

function wildlife(
  id: string,
  kind: SandboxWildlifeKind,
  coordinate: HexCoordinate,
  offset: Readonly<{ x: number; z: number }>,
  scale: number,
  rotationY: number,
  animation: SandboxWildlifePlacement["animation"],
): SandboxWildlifePlacement {
  return Object.freeze({
    id,
    kind,
    coordinate: Object.freeze({ ...coordinate }),
    offset: Object.freeze({ ...offset }),
    scale,
    rotationY,
    animation,
  });
}

function freezeCoordinates(coordinates: readonly HexCoordinate[]): readonly HexCoordinate[] {
  return Object.freeze(coordinates.map((coordinate) => Object.freeze({ ...coordinate })));
}
