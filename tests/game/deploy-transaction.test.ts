import { describe, expect, it } from "vitest";

import { createBattleState, createBattleUnit } from "../../src/game/battle";
import {
  deployBattleSessionEntity,
  getDeployableAvailability,
  previewDeployment,
} from "../../src/game/deployTransaction";
import { requestBuildingPlacement } from "../../src/game/deployment";
import type { DeployableKind } from "../../src/game/rules";
import {
  BATTLEFIELD_MAP,
  axialToWorld,
  coordinateKey,
  getMapCell,
  worldToAxial,
} from "../../src/map/battlefield";

const VERDANT_BUILDING_CELL = requiredCell(BATTLEFIELD_MAP.cells.find((cell) => {
  if (cell.territory !== "verdant" || !cell.buildable) return false;
  return requestBuildingPlacement(BATTLEFIELD_MAP, {}, {
    buildingId: "probe",
    kind: "gold-mine",
    faction: "verdant",
    worldPosition: axialToWorld(cell),
  }).ok;
}), "verdant buildable");
const VERDANT_TROOP_CELL = requiredCell(BATTLEFIELD_MAP.cells.find((cell) => (
  cell.territory === "verdant" && cell.walkable
)), "verdant troop");
const CRIMSON_TROOP_CELL = requiredCell(BATTLEFIELD_MAP.cells.find((cell) => (
  cell.territory === "crimson" && cell.walkable
)), "crimson troop");

function requiredCell<T>(cell: T | undefined, label: string): T {
  if (!cell) throw new Error(`Deployment tests require a ${label} cell.`);
  return cell;
}

function unresolvedBattle(gold = 1000) {
  const state = createBattleState([
    createBattleUnit({
      id: "verdant-anchor",
      faction: "verdant",
      role: "knight",
      position: axialToWorld(VERDANT_TROOP_CELL),
    }),
    createBattleUnit({
      id: "crimson-anchor",
      faction: "crimson",
      role: "knight",
      position: axialToWorld(CRIMSON_TROOP_CELL),
    }),
  ]);
  return {
    ...state,
    economy: {
      ...state.economy,
      accounts: {
        ...state.economy.accounts,
        verdant: {
          ...state.economy.accounts.verdant,
          gold,
          isFull: gold === 1000,
        },
      },
    },
  };
}

function unresolvedSession(gold = 1000, phase: "briefing" | "engaged" = "engaged") {
  return {
    battle: unresolvedBattle(gold),
    phase,
  } as const;
}

describe("atomic battle deployment", () => {
  it("spends gold and commits a building, occupancy, event, and sequence together", () => {
    const session = unresolvedSession();
    const result = deployBattleSessionEntity(session, {
      faction: "verdant",
      kind: "gold-mine",
      worldPosition: axialToWorld(VERDANT_BUILDING_CELL),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result).toMatchObject({
      deploymentId: "verdant-gold-mine-1",
      entityType: "building",
      buildingId: "verdant-gold-mine-1",
    });
    if (result.entityType !== "building") throw new Error("Expected building deployment.");
    expect(result.state.battle.economy.accounts.verdant.gold).toBe(300);
    expect(result.state.battle.buildings).toContainEqual(expect.objectContaining({
      id: result.buildingId,
      kind: "gold-mine",
      faction: "verdant",
      coordinate: { q: VERDANT_BUILDING_CELL.q, r: VERDANT_BUILDING_CELL.r },
    }));
    expect(result.state.battle.buildingOccupancy[coordinateKey(VERDANT_BUILDING_CELL)])
      .toMatchObject({ buildingId: result.buildingId });
    expect(result.state.battle.nextDeploymentSequence).toBe(1);
    expect(result.state.battle.deploymentCounts.verdant["gold-mine"]).toBe(1);
    expect(result.state.battle.events.at(-1)).toMatchObject({
      type: "deployment-succeeded",
      deploymentId: result.deploymentId,
      entityType: "building",
      buildingId: result.buildingId,
      kind: "gold-mine",
      quantity: 1,
    });
  });

  it("deploys a purchased troop squad atomically and deducts exactly once", () => {
    const session = unresolvedSession();
    const result = deployBattleSessionEntity(session, {
      faction: "verdant",
      kind: "mage",
      worldPosition: axialToWorld(VERDANT_TROOP_CELL),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    if (result.entityType !== "squad") throw new Error("Expected squad deployment.");
    expect(result).toMatchObject({
      deploymentId: "verdant-mage-1",
      squadId: "verdant-mage-1-squad",
      unitIds: [
        "verdant-mage-1-member-1",
        "verdant-mage-1-member-2",
      ],
    });
    expect(result.state.battle.deploymentCounts.verdant.mage).toBe(1);
    expect(result.state.battle.economy.accounts.verdant.gold).toBe(400);
    const deployed = result.state.battle.units.filter((unit) => (
      unit.squadId === "verdant-mage-1-squad"
    ));
    expect(deployed).toHaveLength(2);
    expect(deployed.map((unit) => unit.id)).toEqual([
      "verdant-mage-1-member-1",
      "verdant-mage-1-member-2",
    ]);
    expect(deployed.every((unit) => (
      unit.faction === "verdant" && unit.role === "mage"
    ))).toBe(true);
    expect(deployed.every((unit) => {
      const cell = getMapCell(BATTLEFIELD_MAP, worldToAxial(unit.position));
      return cell?.walkable && cell.territory === "verdant";
    })).toBe(true);
    expect(result.state.battle.squads).toContainEqual(expect.objectContaining({
      id: "verdant-mage-1-squad",
      memberIds: [
        "verdant-mage-1-member-1",
        "verdant-mage-1-member-2",
      ],
      initialSize: 2,
    }));
    expect(result.state.battle.events.at(-1)).toMatchObject({
      type: "deployment-succeeded",
      entityType: "squad",
      squadId: result.squadId,
      unitIds: result.unitIds,
      kind: "mage",
      quantity: 2,
    });
  });

  it("keeps catapult deployment as a one-unit squad", () => {
    const result = deployBattleSessionEntity(unresolvedSession(), {
      faction: "verdant",
      kind: "catapult",
      worldPosition: axialToWorld(VERDANT_TROOP_CELL),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.battle.units.filter((unit) => (
      unit.squadId === "verdant-catapult-1-squad"
    ))).toHaveLength(1);
  });

  it("rejects a troop deployment on a walkable hex disconnected from the battle route", () => {
    const isolatedCell = { q: -1, r: 7 };

    expect(getMapCell(BATTLEFIELD_MAP, isolatedCell)?.walkable).toBe(true);
    expect(previewDeployment(unresolvedSession(), {
      faction: "verdant",
      kind: "swordsman",
      worldPosition: axialToWorld(isolatedCell),
    })).toMatchObject({ valid: false, reason: "unwalkable-hex" });
  });

  it.each([
    ["insufficient gold", 200, "gold-mine" as DeployableKind,
      axialToWorld(VERDANT_BUILDING_CELL), "insufficient-gold"],
    ["enemy territory", 1000, "swordsman" as DeployableKind,
      axialToWorld(CRIMSON_TROOP_CELL), "enemy-territory"],
    ["outside battlefield", 1000, "archer" as DeployableKind,
      { x: 999, z: 999 }, "outside-battlefield"],
  ])("keeps the original state untouched after %s rejection", (
    _label,
    gold,
    kind,
    worldPosition,
    reason,
  ) => {
    const session = unresolvedSession(gold);
    const result = deployBattleSessionEntity(session, {
      faction: "verdant",
      kind,
      worldPosition,
    });

    expect(result).toMatchObject({ ok: false, reason });
    expect(result.state).toBe(session);
  });

  it("rejects deployment before engagement at the authoritative transaction boundary", () => {
    const session = unresolvedSession(1000, "briefing");
    const result = deployBattleSessionEntity(session, {
      faction: "verdant",
      kind: "swordsman",
      worldPosition: axialToWorld(VERDANT_TROOP_CELL),
    });

    expect(result).toMatchObject({ ok: false, reason: "deployment-closed" });
    expect(result.state).toBe(session);
  });

  it("enforces the building limit until the prior entity is actually removed", () => {
    const first = deployBattleSessionEntity(unresolvedSession(), {
      faction: "verdant",
      kind: "gold-mine",
      worldPosition: axialToWorld(VERDANT_BUILDING_CELL),
    });
    if (!first.ok) throw new Error(first.reason);
    const session = {
      ...first.state,
      battle: {
        ...first.state.battle,
        economy: unresolvedBattle().economy,
        buildings: first.state.battle.buildings.map((building) => ({
          ...building,
          status: "destroyed" as const,
          health: 0,
        })),
      },
    };

    expect(getDeployableAvailability(
      session,
      "verdant",
      "gold-mine",
    )).toEqual({ enabled: false, reason: "building-limit" });
  });

  it("uses the same position validation for previews and commits", () => {
    const session = unresolvedSession();
    const preview = previewDeployment(session, {
      faction: "verdant",
      kind: "barracks",
      worldPosition: axialToWorld(VERDANT_BUILDING_CELL),
    });
    const invalid = previewDeployment(session, {
      faction: "verdant",
      kind: "barracks",
      worldPosition: axialToWorld(CRIMSON_TROOP_CELL),
    });

    expect(preview).toMatchObject({
      valid: true,
      coordinate: { q: VERDANT_BUILDING_CELL.q, r: VERDANT_BUILDING_CELL.r },
      position: axialToWorld(VERDANT_BUILDING_CELL),
    });
    expect(invalid).toMatchObject({ valid: false, reason: "enemy-territory" });
  });
});
