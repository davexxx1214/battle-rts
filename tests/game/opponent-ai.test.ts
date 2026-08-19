import { describe, expect, it } from "vitest";

import { createBattleState, createBattleUnit } from "../../src/game/battle";
import type { BattleSessionState } from "../../src/game/battleSession";
import { advanceOpponentAi } from "../../src/game/opponentAi";
import { deploymentCostForRace, GAME_RULES } from "../../src/game/rules";
import {
  BATTLEFIELD_MAP,
  axialToWorld,
  coordinateKey,
  getMapCell,
} from "../../src/map/battlefield";

function engagedSession(crimsonGold: number): BattleSessionState {
  const battle = createBattleState([]);
  return {
    phase: "engaged",
    battle: {
      ...battle,
      economy: {
        ...battle.economy,
        accounts: {
          ...battle.economy.accounts,
          crimson: {
            ...battle.economy.accounts.crimson,
            gold: crimsonGold,
            isFull: crimsonGold === GAME_RULES.economy.maximumGold,
          },
        },
      },
    },
  };
}

function fundCrimson(session: BattleSessionState, gold: number): BattleSessionState {
  return {
    ...session,
    battle: {
      ...session.battle,
      economy: {
        ...session.battle.economy,
        accounts: {
          ...session.battle.economy.accounts,
          crimson: {
            ...session.battle.economy.accounts.crimson,
            gold,
            isFull: gold === GAME_RULES.economy.maximumGold,
          },
        },
      },
    },
  };
}

function advanceHard(session: BattleSessionState): BattleSessionState {
  return advanceOpponentAi(session, "hard");
}

describe("deterministic opponent deployment AI", () => {
  it("uses distinct economy plans for the three difficulty strategies", () => {
    const easy = advanceOpponentAi(
      engagedSession(GAME_RULES.economy.maximumGold),
      "easy",
    );
    const normal = advanceOpponentAi(
      engagedSession(GAME_RULES.economy.maximumGold),
      "normal",
    );
    const hard = advanceOpponentAi(
      engagedSession(GAME_RULES.economy.maximumGold),
      "hard",
    );

    expect(easy.battle.deploymentCounts.crimson).toMatchObject({
      spearman: 1,
      swordsman: 0,
      "gold-mine": 0,
      barracks: 0,
    });
    expect(normal.battle.deploymentCounts.crimson).toMatchObject({
      swordsman: 0,
      "gold-mine": 1,
      barracks: 0,
    });
    expect(hard.battle.deploymentCounts.crimson).toMatchObject({
      swordsman: 0,
      "gold-mine": 1,
      barracks: 0,
    });

    const normalAfterMine = advanceOpponentAi(
      fundCrimson(normal, GAME_RULES.economy.maximumGold),
      "normal",
    );
    const hardAfterMine = advanceOpponentAi(
      fundCrimson(hard, GAME_RULES.economy.maximumGold),
      "hard",
    );
    expect(normalAfterMine.battle.deploymentCounts.crimson.spearman).toBe(1);
    expect(normalAfterMine.battle.deploymentCounts.crimson.barracks).toBe(0);
    expect(hardAfterMine.battle.deploymentCounts.crimson.barracks).toBe(1);
  });

  it("buys its opening gold mine through the shared deployment transaction", () => {
    const initial = engagedSession(GAME_RULES.deployment.costs["gold-mine"]);

    const next = advanceHard(initial);
    const mine = next.battle.buildings.find((building) => (
      building.faction === "crimson" && building.kind === "gold-mine"
    ));

    expect(mine).toBeDefined();
    expect(next.battle.economy.accounts.crimson.gold).toBe(0);
    expect(next.battle.nextDeploymentSequence).toBe(1);
    expect(next.battle.events.at(-1)).toMatchObject({
      type: "deployment-succeeded",
      faction: "crimson",
      kind: "gold-mine",
    });
    expect(getMapCell(BATTLEFIELD_MAP, mine!.coordinate)).toMatchObject({
      territory: "crimson",
      buildable: true,
    });
    expect(next.battle.buildingOccupancy[coordinateKey(mine!.coordinate)])
      .toMatchObject({ buildingId: mine!.id });
  });

  it("saves for and deploys a barracks after establishing its economy", () => {
    const withMine = advanceHard(
      engagedSession(GAME_RULES.deployment.costs["gold-mine"]),
    );
    const funded = fundCrimson(withMine, GAME_RULES.deployment.costs.barracks);

    const next = advanceHard(funded);

    expect(next.battle.buildings).toContainEqual(expect.objectContaining({
      faction: "crimson",
      kind: "barracks",
    }));
    expect(next.battle.economy.accounts.crimson.gold).toBe(0);
    expect(next.battle.nextDeploymentSequence).toBe(2);
  });

  it("deploys direct troops in a stable cycle after its mine, barracks, and guard tower", () => {
    const withMine = advanceHard(
      engagedSession(GAME_RULES.deployment.costs["gold-mine"]),
    );
    const withBarracks = advanceHard(
      fundCrimson(withMine, GAME_RULES.deployment.costs.barracks),
    );
    const withGuardTower = advanceHard(
      fundCrimson(withBarracks, GAME_RULES.deployment.costs["guard-tower"]),
    );

    const next = advanceHard(
      fundCrimson(withGuardTower, GAME_RULES.deployment.costs.spearman),
    );

    expect(next.battle.units).toContainEqual(expect.objectContaining({
      id: expect.stringMatching(/^crimson-spearman-/),
      faction: "crimson",
      role: "spearman",
    }));
    expect(next.battle.economy.accounts.crimson.gold).toBe(0);
    expect(next.battle.nextDeploymentSequence).toBe(4);
  });

  it("opens the hard undead troop cycle with a grounded frost bone dragon", () => {
    const initial = engagedSession(GAME_RULES.deployment.costs["gold-mine"]);
    let session: BattleSessionState = {
      ...initial,
      battle: { ...initial.battle, undeadOpponent: true },
    };
    session = advanceHard(session);
    session = advanceHard(fundCrimson(
      session,
      deploymentCostForRace("barracks", "undead"),
    ));
    session = advanceHard(fundCrimson(
      session,
      GAME_RULES.deployment.costs["guard-tower"],
    ));
    session = advanceHard(fundCrimson(session, GAME_RULES.deployment.costs.catapult));

    expect(session.battle.units).toContainEqual(expect.objectContaining({
      id: expect.stringMatching(/^crimson-catapult-/),
      faction: "crimson",
      role: "bone-dragon",
      combatProfile: "undead",
      maxHealth: 280,
    }));
  });

  it("falls back to a troop when living units occupy every crimson building hex", () => {
    const initial = engagedSession(GAME_RULES.economy.maximumGold);
    const blockers = BATTLEFIELD_MAP.cells
      .filter((cell) => cell.territory === "crimson" && cell.buildable)
      .map((cell, index) => createBattleUnit({
        id: `crimson-building-blocker-${index}`,
        faction: "crimson",
        role: "knight",
        position: axialToWorld(cell),
      }));
    const blocked: BattleSessionState = {
      ...initial,
      battle: { ...initial.battle, units: blockers },
    };

    const next = advanceHard(blocked);

    expect(next.battle.units).toContainEqual(expect.objectContaining({
      faction: "crimson",
      role: "spearman",
    }));
    expect(next.battle.economy.accounts.crimson.gold).toBe(
      GAME_RULES.economy.maximumGold - GAME_RULES.deployment.costs.spearman,
    );
  });

  it("keeps its state unchanged while saving for the current objective", () => {
    const initial = engagedSession(GAME_RULES.economy.initialGold);

    expect(advanceHard(initial)).toBe(initial);
  });

  it("produces the same deployment from the same public battle state", () => {
    const firstInitial = engagedSession(GAME_RULES.deployment.costs["gold-mine"]);
    const secondInitial = engagedSession(GAME_RULES.deployment.costs["gold-mine"]);

    const first = advanceHard(firstInitial);
    const second = advanceHard(secondInitial);

    expect(first).toEqual(second);
  });

  it("cycles through every configured direct troop in order", () => {
    let session = advanceHard(
      engagedSession(GAME_RULES.deployment.costs["gold-mine"]),
    );
    session = advanceHard(
      fundCrimson(session, GAME_RULES.deployment.costs.barracks),
    );
    session = advanceHard(
      fundCrimson(session, GAME_RULES.deployment.costs["guard-tower"]),
    );
    expect(session.battle.buildings).toContainEqual(expect.objectContaining({
      faction: "crimson",
      kind: "guard-tower",
    }));

    for (const kind of GAME_RULES.opponentAi.strategies.hard.troopCycle) {
      session = advanceHard(
        fundCrimson(session, GAME_RULES.deployment.costs[kind]),
      );
      expect(session.battle.units).toContainEqual(expect.objectContaining({
        id: expect.stringMatching(new RegExp(`^crimson-${kind}-`)),
      }));
    }
  });
});
