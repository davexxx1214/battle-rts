import { describe, expect, it } from "vitest";

import { createInitialBattle } from "../../src/game/battle";
import {
  deployBattleSessionEntity,
  validDeploymentCoordinates,
} from "../../src/game/deployTransaction";
import { createFactionRaces } from "../../src/game/factions";
import { axialToWorld } from "../../src/map/battlefield";

describe("independent faction races", () => {
  it("deploys an undead player army against a human enemy army", () => {
    const factionRaces = createFactionRaces({ verdant: "undead", crimson: "human" });
    const session = {
      phase: "engaged" as const,
      battle: createInitialBattle({ factionRaces }),
    };
    const verdantCoordinate = validDeploymentCoordinates(session, "verdant", "spearman")[0]!;
    const crimsonCoordinate = validDeploymentCoordinates(session, "crimson", "spearman")[0]!;

    const playerResult = deployBattleSessionEntity(session, {
      faction: "verdant",
      kind: "spearman",
      worldPosition: axialToWorld(verdantCoordinate),
    });
    const enemyResult = deployBattleSessionEntity(session, {
      faction: "crimson",
      kind: "spearman",
      worldPosition: axialToWorld(crimsonCoordinate),
    });

    expect(playerResult.ok).toBe(true);
    expect(enemyResult.ok).toBe(true);
    if (!playerResult.ok || !enemyResult.ok) return;
    if (playerResult.entityType !== "squad" || enemyResult.entityType !== "squad") {
      throw new Error("Spearman deployment must create squads.");
    }
    const playerSquad = playerResult.state.battle.units.filter((unit) => (
      unit.squadId === playerResult.squadId
    ));
    const enemySquad = enemyResult.state.battle.units.filter((unit) => (
      unit.squadId === enemyResult.squadId
    ));
    expect(playerSquad).toHaveLength(3);
    expect(playerSquad.every((unit) => unit.combatProfile === "undead")).toBe(true);
    expect(enemySquad).toHaveLength(2);
    expect(enemySquad.every((unit) => unit.combatProfile === "human")).toBe(true);
  });

  it("stores all four race pairings without the old red-side-only restriction", () => {
    for (const verdant of ["human", "undead"] as const) {
      for (const crimson of ["human", "undead"] as const) {
        const factionRaces = createFactionRaces({ verdant, crimson });
        const battle = createInitialBattle({ factionRaces });
        expect(battle.factionRaces).toEqual(factionRaces);
        expect(battle.undeadOpponent).toBe(crimson === "undead");
      }
    }
  });
});
