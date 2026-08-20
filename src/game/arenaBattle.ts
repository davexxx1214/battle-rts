import {
  createBattleState,
  createBattleUnit,
  type BattleState,
  type BattleUnit,
} from "./battle";
import {
  deploymentCostForRace,
  MATCH_POLICIES,
  troopCountForRace,
  unitRoleForRace,
  type TroopKind,
} from "./rules";
import { createFactionRaces } from "./factions";
import type { Faction, FactionRaces } from "./types";
import { BATTLEFIELD_MAP, axialToWorld } from "../map/battlefield";

export const ARENA_STARTING_GOLD_PER_FACTION = 7800;

const ARENA_ROSTER = [
  "spearman",
  "swordsman",
  "archer",
  "mage",
  "catapult",
] as const satisfies readonly TroopKind[];
const FACTIONS = ["verdant", "crimson"] as const satisfies readonly Faction[];

export function createArenaBattle(factionRaces: FactionRaces = createFactionRaces()): BattleState {
  return createBattleState(
    FACTIONS.flatMap((faction) => createArenaFaction(faction, factionRaces)),
    { factionRaces, matchPolicy: MATCH_POLICIES.arena },
  );
}

function createArenaFaction(
  faction: Faction,
  factionRaces: FactionRaces,
): readonly BattleUnit[] {
  const center = axialToWorld(BATTLEFIELD_MAP.center);
  const frontCells = BATTLEFIELD_MAP.cells
    .filter((cell) => cell.territory === faction && cell.walkable)
    .sort((first, second) => (
      distanceSquared(axialToWorld(first), center)
      - distanceSquared(axialToWorld(second), center)
      || first.q - second.q
      || first.r - second.r
    ));
  if (frontCells.length === 0) {
    throw new Error(`Arena map has no walkable ${faction} cells.`);
  }

  const units: BattleUnit[] = [];
  let squadIndex = 0;
  let spentGold = 0;
  while (spentGold < ARENA_STARTING_GOLD_PER_FACTION) {
    const kind = ARENA_ROSTER[squadIndex % ARENA_ROSTER.length]!;
    const race = factionRaces[faction];
    const squadCost = deploymentCostForRace(kind, race);
    if (spentGold + squadCost > ARENA_STARTING_GOLD_PER_FACTION) break;
    const squadSize = troopCountForRace(kind, race);
    const cell = frontCells[squadIndex % frontCells.length]!;
    const squadCenter = axialToWorld(cell);
    const squadId = `arena-${faction}-${squadIndex + 1}-${kind}`;
    for (let memberIndex = 0; memberIndex < squadSize; memberIndex += 1) {
      const angle = memberIndex / squadSize * Math.PI * 2;
      const radius = squadSize === 1 ? 0 : 0.22;
      units.push(createBattleUnit({
        id: `arena-${faction}-${units.length + 1}`,
        squadId,
        faction,
        role: unitRoleForRace(kind, factionRaces[faction]),
        combatProfile: factionRaces[faction],
        position: {
          x: squadCenter.x + Math.cos(angle) * radius,
          z: squadCenter.z + Math.sin(angle) * radius,
        },
      }));
    }
    spentGold += squadCost;
    squadIndex += 1;
  }
  return units;
}

function distanceSquared(
  first: { readonly x: number; readonly z: number },
  second: { readonly x: number; readonly z: number },
): number {
  return (first.x - second.x) ** 2 + (first.z - second.z) ** 2;
}
