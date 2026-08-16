import { describe, expect, it } from "vitest";

import { createBattleState, createBattleUnit } from "../../src/game/battle";
import type { BattleSessionState } from "../../src/game/battleSession";
import { advanceOpponentAi } from "../../src/game/opponentAi";
import { GAME_RULES } from "../../src/game/rules";
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

describe("deterministic opponent deployment AI", () => {
  it("buys its opening gold mine through the shared deployment transaction", () => {
    const initial = engagedSession(GAME_RULES.deployment.costs["gold-mine"]);

    const next = advanceOpponentAi(initial);
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
    const withMine = advanceOpponentAi(
      engagedSession(GAME_RULES.deployment.costs["gold-mine"]),
    );
    const funded = fundCrimson(withMine, GAME_RULES.deployment.costs.barracks);

    const next = advanceOpponentAi(funded);

    expect(next.battle.buildings).toContainEqual(expect.objectContaining({
      faction: "crimson",
      kind: "barracks",
    }));
    expect(next.battle.economy.accounts.crimson.gold).toBe(0);
    expect(next.battle.nextDeploymentSequence).toBe(2);
  });

  it("deploys direct troops in a stable cycle after its mine and barracks", () => {
    const withMine = advanceOpponentAi(
      engagedSession(GAME_RULES.deployment.costs["gold-mine"]),
    );
    const withBarracks = advanceOpponentAi(
      fundCrimson(withMine, GAME_RULES.deployment.costs.barracks),
    );

    const next = advanceOpponentAi(
      fundCrimson(withBarracks, GAME_RULES.deployment.costs.swordsman),
    );

    expect(next.battle.units).toContainEqual(expect.objectContaining({
      id: expect.stringMatching(/^crimson-swordsman-/),
      faction: "crimson",
      role: "knight",
    }));
    expect(next.battle.economy.accounts.crimson.gold).toBe(0);
    expect(next.battle.nextDeploymentSequence).toBe(3);
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

    const next = advanceOpponentAi(blocked);

    expect(next.battle.units).toContainEqual(expect.objectContaining({
      faction: "crimson",
      role: "knight",
    }));
    expect(next.battle.economy.accounts.crimson.gold).toBe(
      GAME_RULES.economy.maximumGold - GAME_RULES.deployment.costs.swordsman,
    );
  });

  it("keeps its state unchanged while saving for the current objective", () => {
    const initial = engagedSession(GAME_RULES.economy.initialGold);

    expect(advanceOpponentAi(initial)).toBe(initial);
  });

  it("produces the same deployment from the same public battle state", () => {
    const firstInitial = engagedSession(GAME_RULES.deployment.costs["gold-mine"]);
    const secondInitial = engagedSession(GAME_RULES.deployment.costs["gold-mine"]);

    const first = advanceOpponentAi(firstInitial);
    const second = advanceOpponentAi(secondInitial);

    expect(first).toEqual(second);
  });

  it("cycles through every configured direct troop in order", () => {
    let session = advanceOpponentAi(
      engagedSession(GAME_RULES.deployment.costs["gold-mine"]),
    );
    session = advanceOpponentAi(
      fundCrimson(session, GAME_RULES.deployment.costs.barracks),
    );

    for (const kind of GAME_RULES.opponentAi.troopCycle) {
      session = advanceOpponentAi(
        fundCrimson(session, GAME_RULES.deployment.costs[kind]),
      );
      expect(session.battle.units).toContainEqual(expect.objectContaining({
        id: expect.stringMatching(new RegExp(`^crimson-${kind}-`)),
      }));
    }
  });
});
