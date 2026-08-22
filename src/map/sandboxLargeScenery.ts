import type { Faction } from "../game/types";
import type {
  BattlefieldScenery,
  BattlefieldSceneryKind,
  BattlefieldSceneryZone,
} from "./battlefieldScenery";
import {
  SANDBOX_LARGE_MINE_DISTRICTS,
  SANDBOX_LARGE_MINE_PITS,
} from "./sandboxLargeBattlefield";
import { SANDBOX_LARGE_DRESSING_SCENERY } from "./sandboxLargeDressing";

const MINE_RIDGE_KINDS = [
  "mine-mountain-a",
  "mine-rock-e",
  "mine-mountain-b",
  "mine-rock-c",
  "mine-mountain-c",
  "mine-rock-e",
  "mine-mountain-b",
  "mine-rock-c",
] as const satisfies readonly BattlefieldSceneryKind[];

const SANDBOX_LARGE_MINE_SCENERY: readonly BattlefieldScenery[] = Object.freeze(
  SANDBOX_LARGE_MINE_DISTRICTS.flatMap((district) => {
    const pit = SANDBOX_LARGE_MINE_PITS.find((candidate) => candidate.id === district.pitId);
    if (!pit) throw new Error(`Missing sandbox mine pit ${district.pitId}.`);
    const controller = pit.initialController;
    const zone: BattlefieldSceneryZone = district.wing === "west"
      ? "left-mine"
      : "right-mine";
    return district.cells.flatMap((coordinate, index) => {
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

export const SANDBOX_LARGE_SCENERY: readonly BattlefieldScenery[] = Object.freeze([
  ...SANDBOX_LARGE_MINE_SCENERY,
  ...SANDBOX_LARGE_DRESSING_SCENERY,
]);

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
