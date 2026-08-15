import { battlefieldCoordinates, battlefieldSurfaceAt } from "./battlefieldLayout";

export const BATTLEFIELD_SCENERY_KINDS = [
  "tree",
  "bush",
  "stone",
  "iron",
  "tent",
  "wheelbarrow",
  "farm-dirt",
  "farm-grain",
] as const;

export type BattlefieldSceneryKind = typeof BATTLEFIELD_SCENERY_KINDS[number];

export type BattlefieldSceneryZone = "wild" | "verdant-camp" | "crimson-camp";

export interface BattlefieldScenery {
  readonly id: string;
  readonly kind: BattlefieldSceneryKind;
  readonly zone: BattlefieldSceneryZone;
  readonly coordinate: { readonly q: number; readonly r: number };
  readonly offset: { readonly x: number; readonly z: number };
  readonly scale: number;
  readonly rotationY: number;
}

export const BLOCKING_SCENERY_KINDS: ReadonlySet<BattlefieldSceneryKind> = new Set([
  "tree",
  "stone",
  "iron",
  "tent",
  "wheelbarrow",
]);

const FOREST_CLUSTER_CELLS = battlefieldCoordinates()
  .filter(([q, r]) => battlefieldSurfaceAt(q, r) === "forest");

const ROCK_CLUSTER_CELLS = battlefieldCoordinates()
  .filter(([q, r]) => battlefieldSurfaceAt(q, r) === "rock");

const RIVERBANK_DETAILS = [
  { q: -3, r: 2, offset: { x: -0.58, z: -0.34 }, rotationY: 0.2 },
  { q: 3, r: -2, offset: { x: 0.58, z: 0.34 }, rotationY: Math.PI + 0.2 },
  { q: 3, r: 2, offset: { x: 0.55, z: -0.38 }, rotationY: -0.45 },
  { q: -3, r: -2, offset: { x: -0.55, z: 0.38 }, rotationY: Math.PI - 0.45 },
] as const;

export const BATTLEFIELD_SCENERY: readonly BattlefieldScenery[] = [
  ...FOREST_CLUSTER_CELLS.flatMap(([q, r], index) => createForestCluster(q, r, index)),
  ...ROCK_CLUSTER_CELLS.flatMap(([q, r], index) => createRockCluster(q, r, index)),
  ...RIVERBANK_DETAILS.map((detail, index) => scenery(
    `riverbank-bush-${index}`,
    "bush",
    "wild",
    detail.q,
    detail.r,
    detail.offset,
    0.72 + (index % 2) * 0.08,
    detail.rotationY,
  )),
  ...createCampScenery("verdant"),
  ...createCampScenery("crimson"),
];

export const BLOCKING_SCENERY_KEYS: ReadonlySet<string> = new Set(
  BATTLEFIELD_SCENERY
    .filter((item) => BLOCKING_SCENERY_KINDS.has(item.kind))
    .map((item) => `${item.coordinate.q},${item.coordinate.r}`),
);

function createForestCluster(q: number, r: number, index: number): BattlefieldScenery[] {
  const alternate = index % 2 === 0;
  const rotation = (index % 6) * Math.PI / 3;
  const trees: BattlefieldScenery[] = [
    scenery(`forest-${q}-${r}-tree-a`, "tree", "wild", q, r, {
      x: alternate ? -0.42 : -0.28,
      z: alternate ? -0.12 : 0.24,
    }, 0.92 + (index % 4) * 0.06, rotation),
    scenery(`forest-${q}-${r}-tree-b`, "tree", "wild", q, r, {
      x: alternate ? 0.38 : 0.46,
      z: alternate ? 0.34 : -0.26,
    }, 0.78 + ((index + 2) % 4) * 0.06, rotation + Math.PI * 0.72),
  ];
  return alternate
    ? [...trees, scenery(
        `forest-${q}-${r}-bush`,
        "bush",
        "wild",
        q,
        r,
        { x: 0.02, z: -0.52 },
        0.9 + (index % 3) * 0.08,
        rotation * 0.5,
      )]
    : trees;
}

function createRockCluster(q: number, r: number, index: number): BattlefieldScenery[] {
  const rotation = (index % 6) * Math.PI / 3;
  return [
    scenery(
      `rock-${q}-${r}-stone`,
      "stone",
      "wild",
      q,
      r,
      { x: -0.24, z: 0.08 },
      0.92 + (index % 3) * 0.08,
      rotation,
    ),
    scenery(
      `rock-${q}-${r}-iron`,
      "iron",
      "wild",
      q,
      r,
      { x: 0.42, z: -0.3 },
      0.62 + (index % 2) * 0.08,
      rotation + Math.PI / 3,
    ),
    ...(index % 2 === 0
      ? [scenery(
          `rock-${q}-${r}-stone-small`,
          "stone",
          "wild",
          q,
          r,
          { x: 0.28, z: 0.48 },
          0.58,
          rotation - Math.PI / 4,
        )]
      : []),
  ];
}

function createCampScenery(faction: "verdant" | "crimson"): BattlefieldScenery[] {
  const mirror = faction === "verdant" ? 1 : -1;
  const zone = `${faction}-camp` as const;
  const rotation = faction === "verdant" ? 0 : Math.PI;
  const campItem = (
    id: string,
    kind: BattlefieldSceneryKind,
    q: number,
    r: number,
    offset: { readonly x: number; readonly z: number },
    scale: number,
    localRotation = 0,
  ) => scenery(
    `${faction}-${id}`,
    kind,
    zone,
    q * mirror,
    r * mirror,
    { x: offset.x * mirror, z: offset.z * mirror },
    scale,
    rotation + localRotation,
  );
  return [
    campItem("farm-dirt", "farm-dirt", -2, 6, { x: 0, z: 0 }, 0.94),
    campItem("farm-grain", "farm-grain", -1, 6, { x: 0, z: 0 }, 0.94),
    campItem("field-bush", "bush", -1, 6, { x: 0.72, z: 0.5 }, 0.78, 0.35),
    campItem("camp-tent", "tent", 0, 6, { x: -0.18, z: 0.08 }, 1.04, -0.16),
    campItem("camp-wheelbarrow", "wheelbarrow", 0, 6, { x: 0.66, z: -0.32 }, 0.86, 0.54),
    campItem("camp-bush", "bush", 0, 6, { x: -0.72, z: -0.46 }, 0.84, -0.25),
  ];
}

function scenery(
  id: string,
  kind: BattlefieldSceneryKind,
  zone: BattlefieldSceneryZone,
  q: number,
  r: number,
  offset: { readonly x: number; readonly z: number },
  scale: number,
  rotationY: number,
): BattlefieldScenery {
  return { id, kind, zone, coordinate: { q, r }, offset, scale, rotationY };
}
