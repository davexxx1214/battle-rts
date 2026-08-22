import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  stepBattle,
  type BattleState,
} from "../../src/game/battle";
import { unitSpecFor } from "../../src/game/rules";
import {
  SANDBOX_NEUTRAL_KILL_REWARDS,
  sandboxNeutralKillReward,
} from "../../src/game/sandboxNeutralRewards";
import { axialToWorld } from "../../src/map/battlefield";
import {
  SANDBOX_LARGE_MINE_PITS,
  SANDBOX_LARGE_NEUTRAL_ENCOUNTERS,
  SANDBOX_LARGE_OASIS,
} from "../../src/map/sandboxLargeBattlefield";

describe("sandbox neutral encounters", () => {
  it("guards exactly the four unclaimed mines plus the central oasis", () => {
    const battle = createBattleState([], { modeId: "sandbox" });
    const neutralPits = SANDBOX_LARGE_MINE_PITS.filter((pit) => (
      pit.initialController === null
    ));
    const occupiedPitIds = new Set(SANDBOX_LARGE_MINE_PITS
      .filter((pit) => pit.initialController !== null)
      .map((pit) => pit.id));
    const mineEncounters = SANDBOX_LARGE_NEUTRAL_ENCOUNTERS.filter((encounter) => (
      encounter.id.startsWith("mine-")
    ));

    expect(neutralPits).toHaveLength(4);
    expect(mineEncounters).toHaveLength(4);
    expect(mineEncounters.map((encounter) => encounter.id.replace("mine-", "")).sort())
      .toEqual(neutralPits.map((pit) => pit.id).sort());
    expect(mineEncounters.every((encounter) => encounter.guards.length === 2)).toBe(true);
    expect(mineEncounters.every((encounter) => (
      !occupiedPitIds.has(encounter.id.replace("mine-", ""))
    ))).toBe(true);
    expect(SANDBOX_LARGE_NEUTRAL_ENCOUNTERS.at(-1)?.id).toBe("central-oasis");
    expect(battle.neutralMonsters).toHaveLength(22);
    for (const encounter of SANDBOX_LARGE_NEUTRAL_ENCOUNTERS) {
      for (const guard of encounter.guards) {
        expect(battle.neutralMonsters.filter((unit) => (
          unit.id.startsWith(`neutral-${guard.id}-`)
        ))).toHaveLength(2);
      }
    }
    expect(new Set(battle.neutralMonsters.map((unit) => unit.neutralKind)))
      .toEqual(new Set(["skeleton", "sharky", "mako"]));
  });

  it("lets neutral guards and nearby player units automatically fight", () => {
    const initial = createBattleState([], { modeId: "sandbox" });
    const guard = initial.neutralMonsters[0]!;
    const player = createBattleUnit({
      id: "guard-challenger",
      faction: "verdant",
      role: "knight",
      position: { x: guard.position.x + 0.45, z: guard.position.z },
    });
    let battle: BattleState = {
      ...initial,
      units: [player],
      squads: [],
    };
    battle = advanceSeconds(battle, 1.2);

    expect(battle.units[0]!.health).toBeLessThan(player.maxHealth);
    expect(battle.neutralMonsters[0]!.health).toBeLessThan(guard.maxHealth);
    expect(battle.events.some((event) => (
      event.type === "attack-started" && event.attackerId === guard.id
    ))).toBe(true);
  });

  it("returns an idle guard to its encounter anchor instead of roaming", () => {
    const initial = createBattleState([], { modeId: "sandbox" });
    const guard = initial.neutralMonsters[0]!;
    const anchor = guard.guardAnchor!;
    const displaced = {
      ...guard,
      position: { x: anchor.x + 1.4, z: anchor.z },
      formationSlot: { x: anchor.x + 1.4, z: anchor.z },
    };
    const before = distance(displaced.position, anchor);
    const after = stepBattle({
      ...initial,
      neutralMonsters: [displaced, ...initial.neutralMonsters.slice(1)],
    }, 0.1);

    expect(distance(after.neutralMonsters[0]!.position, anchor)).toBeLessThan(before);
    expect(after.neutralMonsters[0]!.currentTarget).toBeNull();
  });

  it("heals living units by four health per second within one oasis hex", () => {
    const center = axialToWorld(SANDBOX_LARGE_OASIS.coordinate);
    const unit = createBattleUnit({
      id: "oasis-patient",
      faction: "verdant",
      role: "knight",
      position: center,
    });
    const injured = { ...unit, health: unit.maxHealth - 20 };
    let battle = createBattleState([injured], { modeId: "sandbox" });
    battle = { ...battle, neutralMonsters: [] };
    battle = advanceSeconds(battle, 1);

    expect(battle.units[0]!.health).toBeCloseTo(unit.maxHealth - 16, 5);
    expect(SANDBOX_LARGE_OASIS.radiusCells).toBe(1);
    expect(SANDBOX_LARGE_OASIS.healingPerSecond).toBe(4);
  });

  it("does not heal dead units or units two hexes away", () => {
    const outside = axialToWorld({
      q: SANDBOX_LARGE_OASIS.coordinate.q + 2,
      r: SANDBOX_LARGE_OASIS.coordinate.r,
    });
    const living = createBattleUnit({
      id: "outside-patient",
      faction: "verdant",
      role: "knight",
      position: outside,
    });
    const dead = createBattleUnit({
      id: "dead-patient",
      faction: "crimson",
      role: "knight",
      position: axialToWorld(SANDBOX_LARGE_OASIS.coordinate),
    });
    let battle = createBattleState([
      { ...living, health: living.maxHealth - 20 },
      { ...dead, health: 0, status: "dead", diedAt: 0 },
    ], { modeId: "sandbox" });
    battle = { ...battle, neutralMonsters: [] };
    battle = advanceSeconds(battle, 1);

    expect(battle.units.find((unit) => unit.id === living.id)?.health)
      .toBe(living.maxHealth - 20);
    expect(battle.units.find((unit) => unit.id === dead.id)?.health).toBe(0);
  });

  it("uses distinct combat profiles for the three monster tiers", () => {
    expect(unitSpecFor("spearman", "neutral-skeleton").maxHealth).toBe(120);
    expect(unitSpecFor("knight", "neutral-sharky").maxHealth).toBe(260);
    expect(unitSpecFor("knight", "neutral-mako").maxHealth).toBe(650);
  });

  it("grants the killer faction a 60-100 gold tier reward exactly once", () => {
    expect(SANDBOX_NEUTRAL_KILL_REWARDS).toEqual({
      skeleton: 60,
      sharky: 80,
      mako: 100,
    });
    const initial = createBattleState([], { modeId: "sandbox" });
    const guard = initial.neutralMonsters.find((unit) => unit.neutralKind === "skeleton")!;
    const player = createBattleUnit({
      id: "reward-challenger",
      faction: "verdant",
      role: "knight",
      position: { x: guard.position.x + 0.35, z: guard.position.z },
    });
    const battle = stepBattle({
      ...initial,
      units: [player],
      squads: [],
      neutralMonsters: [{ ...guard, health: 1 }],
    }, 0.1);

    expect(battle.neutralMonsters[0]?.health).toBe(0);
    expect(battle.economy.accounts.verdant.gold).toBe(
      initial.economy.accounts.verdant.gold + sandboxNeutralKillReward("skeleton"),
    );
    expect(battle.events.filter((event) => event.type === "neutral-kill-rewarded"))
      .toEqual([expect.objectContaining({
        faction: "verdant",
        unitId: guard.id,
        killerId: player.id,
        monsterKind: "skeleton",
        gold: 60,
        position: guard.position,
      })]);

    const repeated = stepBattle(battle, 0.1);
    expect(repeated.economy.accounts.verdant.gold)
      .toBe(battle.economy.accounts.verdant.gold);
    expect(repeated.events.filter((event) => event.type === "neutral-kill-rewarded"))
      .toHaveLength(1);
  });
});

function advanceSeconds(battle: BattleState, seconds: number): BattleState {
  let next = battle;
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += 0.1) {
    next = stepBattle(next, Math.min(0.1, seconds - elapsed));
  }
  return next;
}

function distance(
  first: Readonly<{ x: number; z: number }>,
  second: Readonly<{ x: number; z: number }>,
): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}
