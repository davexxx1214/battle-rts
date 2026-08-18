import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  getBattleMatchClock,
  stepBattle,
} from "../../src/game/battle";
import { GAME_RULES } from "../../src/game/rules";

function createUnresolvedBattle() {
  return createBattleState([
    createBattleUnit({
      id: "verdant-clock",
      faction: "verdant",
      role: "knight",
      position: { x: -10, z: 12 },
    }),
    createBattleUnit({
      id: "crimson-clock",
      faction: "crimson",
      role: "knight",
      position: { x: 10, z: -12 },
    }),
  ]);
}

describe("battle economy integration", () => {
  it("stores the match clock and both faction accounts in battle state", () => {
    const initial = createUnresolvedBattle();

    expect(getBattleMatchClock(initial)).toMatchObject({
      elapsedSeconds: 0,
      remainingSeconds: GAME_RULES.match.durationSeconds,
      phase: "normal",
    });
    expect(initial.economy.accounts.verdant.gold).toBe(500);
    expect(initial.economy.accounts.crimson.gold).toBe(500);
    expect(initial.buildingOccupancy).toEqual({});
  });

  it("advances passive gold with the fixed-step battle simulation", () => {
    let state = createUnresolvedBattle();
    for (let index = 0; index < 28; index += 1) state = stepBattle(state, 0.1);

    expect(getBattleMatchClock(state).remainingSeconds).toBeCloseTo(
      GAME_RULES.match.durationSeconds - 2.8,
    );
    expect(state.economy.accounts.verdant.gold).toBe(600);
    expect(state.economy.accounts.crimson.gold).toBe(600);
  });

  it("emits one stable full-gold event per faction without repeating it", () => {
    let state = createUnresolvedBattle();
    for (let index = 0; index < 140; index += 1) state = stepBattle(state, 0.1);

    expect(state.events.filter((event) => event.type === "gold-full")).toHaveLength(2);
    expect(state.economy.accounts.verdant.fullPromptSequence).toBe(1);
    for (let index = 0; index < 28; index += 1) state = stepBattle(state, 0.1);
    expect(state.economy.accounts.verdant.fullPromptSequence).toBe(1);

  });

  it("freezes the match clock and economy after a result is already known", () => {
    const active = createBattleState([
      createBattleUnit({
        id: "only-survivor",
        faction: "verdant",
        role: "knight",
        position: { x: 0, z: 0 },
      }),
    ]);
    const resolved = stepBattle({
      ...active,
      matchElapsed: GAME_RULES.match.durationSeconds - 0.05,
    }, 0.1);
    let advanced = resolved;
    for (let index = 0; index < 28; index += 1) advanced = stepBattle(advanced, 0.1);

    expect(resolved.winner).toBe("draw");
    expect(advanced.matchElapsed).toBe(resolved.matchElapsed);
    expect(getBattleMatchClock(advanced)).toEqual(getBattleMatchClock(resolved));
    expect(advanced.economy).toEqual(resolved.economy);
  });
});
