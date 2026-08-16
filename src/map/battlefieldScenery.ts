import {
  BATTLEFIELD_CASTLE_ROCK_COORDINATES,
  battlefieldCoordinates,
  battlefieldOuterFlankAt,
  battlefieldSurfaceAt,
} from "./battlefieldLayout";

export const BATTLEFIELD_SCENERY_KINDS = [
  "tree",
  "bush",
  "grove-a",
  "grove-b",
  "hill-grove",
  "castle-rock",
  "stone",
  "rock-hills",
  "iron",
  "tent",
  "wheelbarrow",
  "farm-dirt",
  "farm-grain",
  "village-house",
  "village-market",
  "village-farm",
] as const;

export type BattlefieldSceneryKind = typeof BATTLEFIELD_SCENERY_KINDS[number];

export type BattlefieldSceneryZone =
  | "wild"
  | "outskirts"
  | "verdant-camp"
  | "crimson-camp";

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
  "grove-a",
  "grove-b",
  "hill-grove",
  "castle-rock",
  "stone",
  "rock-hills",
  "iron",
  "tent",
  "wheelbarrow",
  "farm-dirt",
  "farm-grain",
  "village-house",
  "village-market",
  "village-farm",
]);

const FOREST_CLUSTER_CELLS = battlefieldCoordinates()
  .filter(([q, r]) => battlefieldSurfaceAt(q, r) === "forest");

const ROCK_CLUSTER_CELLS = battlefieldCoordinates()
  .filter(([q, r]) => battlefieldSurfaceAt(q, r) === "rock");

const CAMP_FARM_LAYOUT = {
  dirt: { id: "farm-dirt", kind: "farm-dirt", q: 1, r: 7 },
  grain: { id: "farm-grain", kind: "farm-grain", q: 2, r: 7 },
} as const;

const CAMP_FARM_KEYS = new Set(
  Object.values(CAMP_FARM_LAYOUT).flatMap(({ q, r }) => [
    `${q},${r}`,
    `${-q},${-r}`,
  ]),
);

const OUTER_FLANK_CELLS = battlefieldCoordinates()
  .filter(([q, r]) => (
    battlefieldOuterFlankAt(q, r)
    && battlefieldSurfaceAt(q, r) === "grass"
    && !CAMP_FARM_KEYS.has(`${q},${r}`)
  ));

const RIVERBANK_DETAILS = [
  { q: -3, r: 2, offset: { x: -0.58, z: -0.34 }, rotationY: 0.2 },
  { q: 3, r: -2, offset: { x: 0.58, z: 0.34 }, rotationY: Math.PI + 0.2 },
  { q: 3, r: 2, offset: { x: 0.55, z: -0.38 }, rotationY: -0.45 },
  { q: -3, r: -2, offset: { x: -0.55, z: 0.38 }, rotationY: Math.PI - 0.45 },
] as const;

export const BATTLEFIELD_SCENERY: readonly BattlefieldScenery[] = [
  ...FOREST_CLUSTER_CELLS.flatMap(([q, r], index) => createForestCluster(q, r, index)),
  ...ROCK_CLUSTER_CELLS.flatMap(([q, r], index) => createRockCluster(q, r, index)),
  ...OUTER_FLANK_CELLS.flatMap(([q, r], index) => createOuterFlankCluster(q, r, index)),
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
  ...BATTLEFIELD_CASTLE_ROCK_COORDINATES.map(({ q, r }, index) => scenery(
    `castle-rock-${q}-${r}`,
    "castle-rock",
    r > 0 ? "verdant-camp" : "crimson-camp",
    q,
    r,
    { x: 0, z: 0 },
    1,
    (index % 2 === 0 ? Math.PI / 3 : -Math.PI / 3) + (r < 0 ? Math.PI : 0),
  )),
];

export const BLOCKING_SCENERY_KEYS: ReadonlySet<string> = new Set(
  BATTLEFIELD_SCENERY
    .filter((item) => BLOCKING_SCENERY_KINDS.has(item.kind))
    .map((item) => `${item.coordinate.q},${item.coordinate.r}`),
);

function createForestCluster(q: number, r: number, index: number): BattlefieldScenery[] {
  const alternate = index % 2 === 0;
  const rotation = (index % 6) * Math.PI / 3;
  const kind = index % 4 === 0 ? "hill-grove" : alternate ? "grove-a" : "grove-b";
  const grove = scenery(
    `forest-${q}-${r}-${kind}`,
    kind,
    "wild",
    q,
    r,
    { x: 0, z: 0 },
    0.9 + (index % 3) * 0.05,
    rotation,
  );
  return alternate
    ? [grove, scenery(
        `forest-${q}-${r}-bush`,
        "bush",
        "wild",
        q,
        r,
        { x: 0.02, z: -0.52 },
        0.9 + (index % 3) * 0.08,
        rotation * 0.5,
      )]
    : [grove];
}

function createRockCluster(q: number, r: number, index: number): BattlefieldScenery[] {
  const rotation = (index % 6) * Math.PI / 3;
  return [
    scenery(
      `rock-${q}-${r}-hills`,
      "rock-hills",
      "wild",
      q,
      r,
      { x: -0.08, z: 0.04 },
      0.9 + (index % 3) * 0.05,
      rotation,
    ),
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

function createOuterFlankCluster(q: number, r: number, index: number): BattlefieldScenery[] {
  const primaryKinds = [
    "tree",
    "tree",
    "stone",
    "tree",
    "village-house",
    "tree",
    "village-market",
    "tree",
    "village-farm",
    "tree",
  ] as const;
  const kind = primaryKinds[index % primaryKinds.length]!;
  const rotation = (index % 6) * Math.PI / 3;
  const primary = scenery(
    `outskirts-${q}-${r}-${kind}`,
    kind,
    "outskirts",
    q,
    r,
    { x: 0, z: 0 },
    kind === "tree"
      ? 0.86 + (index % 4) * 0.07
      : kind === "stone"
        ? 0.72 + (index % 3) * 0.06
        : 0.76 + (index % 3) * 0.05,
    rotation,
  );
  const detail = index % 3 === 0
    ? scenery(
        `outskirts-${q}-${r}-bush`,
        "bush",
        "outskirts",
        q,
        r,
        { x: index % 2 === 0 ? 0.52 : -0.5, z: index % 2 === 0 ? -0.36 : 0.34 },
        0.68 + (index % 4) * 0.06,
        rotation + Math.PI / 5,
      )
    : index % 3 === 1
      ? scenery(
          `outskirts-${q}-${r}-iron`,
          "iron",
          "outskirts",
          q,
          r,
          { x: index % 2 === 0 ? -0.46 : 0.48, z: index % 2 === 0 ? 0.3 : -0.32 },
          0.52 + (index % 3) * 0.05,
          rotation - Math.PI / 6,
        )
      : null;
  return detail ? [primary, detail] : [primary];
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
  const dirtFarm = CAMP_FARM_LAYOUT.dirt;
  const grainFarm = CAMP_FARM_LAYOUT.grain;
  return [
    campItem(
      dirtFarm.id,
      dirtFarm.kind,
      dirtFarm.q,
      dirtFarm.r,
      { x: 0, z: 0 },
      0.94,
    ),
    campItem(
      grainFarm.id,
      grainFarm.kind,
      grainFarm.q,
      grainFarm.r,
      { x: 0, z: 0 },
      0.94,
    ),
    campItem(
      "field-bush",
      "bush",
      grainFarm.q,
      grainFarm.r,
      { x: 0.72, z: 0.5 },
      0.78,
      0.35,
    ),
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
