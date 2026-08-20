import { describe, expect, it, vi } from "vitest";

import {
  advanceBuildings,
  battleBuildingConstructionPhaseAt,
  createBattleBuilding,
  isBattleBuildingOperationalAt,
  removeDestroyedBuildingsAt,
} from "../../src/game/buildings";
import { battleModeDefinitionFor } from "../../src/game/battleMode";
import { createEconomyState, type EconomyState } from "../../src/game/economy";
import {
  createSandboxMiningState,
  consumeEmergencyMinePermit,
  emergencyMinePermitEligibility,
  replaceMinePitState,
  vacateMinePit,
  type SandboxMiningState,
} from "../../src/game/miningEconomy";
import {
  SANDBOX_GOLD_MINE_CONSTRUCTION_RULES,
  canStartSandboxGoldMineConstruction,
  startSandboxGoldMineConstruction,
  validateSandboxBuildingZone,
  type CanStartSandboxGoldMineConstructionInput,
  type MinePitPlacementView,
} from "../../src/game/sandboxBuildingPlacement";
import { GAME_RULES } from "../../src/game/rules";
import { axialToWorld, coordinateKey } from "../../src/map/battlefield";
import { SANDBOX_LARGE_BATTLEFIELD_DEFINITION } from "../../src/map/battlefieldDefinition";

const SANDBOX_MODE = battleModeDefinitionFor("sandbox");
const DEFINITION = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
const PLAYER_PIT = requiredPit("P-W");
const NEUTRAL_PIT = requiredPit("N-NW");
const ORDINARY_ANCHOR = DEFINITION.buildAnchors!.verdant[0]!.coordinate;

describe("sandbox gold-mine construction", () => {
  it("charges 400 gold and creates a permanent six-second construction site", () => {
    const input = constructionInput({ createdAt: 10 });
    const result = startSandboxGoldMineConstruction(input);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(SANDBOX_GOLD_MINE_CONSTRUCTION_RULES).toEqual({
      cost: 400,
      constructionSeconds: 6,
    });
    expect(result.costCharged).toBe(400);
    expect(result.economy.accounts.verdant.gold).toBe(600);
    expect(result.building).toMatchObject({
      id: "verdant-sandbox-mine-1",
      kind: "gold-mine",
      coordinate: PLAYER_PIT.coordinate,
      createdAt: 10,
      constructionCompletedAt: 16,
      lifetimeSeconds: null,
      status: "active",
    });
    expect(result.building).not.toHaveProperty("remainingOre");
    expect(result.occupancy[coordinateKey(PLAYER_PIT.coordinate)])
      .toMatchObject({ buildingId: result.building.id, kind: "gold-mine" });
    expect(result.pitOccupation).toEqual({
      pitId: PLAYER_PIT.id,
      occupyingMineId: result.building.id,
    });
    expect(battleBuildingConstructionPhaseAt(result.building, 15.999))
      .toBe("constructing");
    expect(battleBuildingConstructionPhaseAt(result.building, 16)).toBe("operational");
    expect(isBattleBuildingOperationalAt(result.building, 16)).toBe(true);
    expect(result.mining.pitsById[PLAYER_PIT.id]).toMatchObject({
      occupyingMineId: result.building.id,
      remainingOre: PLAYER_PIT.capacity,
    });
    expect(input.mining.pitsById[PLAYER_PIT.id]?.remainingOre).toBe(PLAYER_PIT.capacity);
  });

  it("allows construction sites to take combat damage without natural decay", () => {
    const started = startSandboxGoldMineConstruction(constructionInput());
    if (!started.ok) throw new Error(started.reason);

    const destroyedDuringConstruction = advanceBuildings({
      buildings: started.buildings,
      economy: started.economy,
      occupancy: started.occupancy,
      map: DEFINITION.map,
      units: [],
      elapsedSeconds: 0,
      deltaSeconds: 1,
      damageIntents: [{
        sourceId: "crimson-attacker",
        sourceType: "unit",
        targetId: started.building.id,
        targetType: "building",
        amount: started.building.maxHealth,
      }],
      economyPolicy: SANDBOX_MODE.economyPolicy,
      productionPolicy: SANDBOX_MODE.productionPolicy,
    });

    expect(destroyedDuringConstruction.buildings[0]).toMatchObject({
      health: 0,
      status: "destroyed",
    });
    expect(destroyedDuringConstruction.events).toContainEqual(expect.objectContaining({
      type: "building-destroyed",
      cause: "damage",
    }));

    const undamaged = startSandboxGoldMineConstruction(constructionInput());
    if (!undamaged.ok) throw new Error(undamaged.reason);
    const longIdle = advanceBuildings({
      buildings: undamaged.buildings,
      economy: undamaged.economy,
      occupancy: undamaged.occupancy,
      map: DEFINITION.map,
      units: [],
      elapsedSeconds: 0,
      deltaSeconds: 30 * 60,
      damageIntents: [],
      economyPolicy: SANDBOX_MODE.economyPolicy,
      productionPolicy: SANDBOX_MODE.productionPolicy,
    });
    expect(longIdle.buildings[0]).toMatchObject({
      health: undamaged.building.maxHealth,
      lifetimeSeconds: null,
      status: "active",
    });
  });

  it("requires a controlled, unoccupied and non-depleted pit", () => {
    expect(canStartSandboxGoldMineConstruction(constructionInput({
      pitOverrides: { controller: null },
    }))).toEqual({ ok: false, reason: "pit-not-controlled" });
    expect(canStartSandboxGoldMineConstruction(constructionInput({
      pitOverrides: { remainingOre: 0 },
    }))).toEqual({ ok: false, reason: "pit-depleted" });
    expect(canStartSandboxGoldMineConstruction(constructionInput({
      pitOverrides: { occupyingMineId: "existing-mine" },
    }))).toEqual({ ok: false, reason: "pit-occupied" });

    const withoutPit = constructionInput();
    expect(canStartSandboxGoldMineConstruction({
      ...withoutPit,
      mining: { ...withoutPit.mining, pitsById: {} },
    })).toEqual({ ok: false, reason: "pit-state-unavailable" });
  });

  it("enforces one mine per pit independently of wallet state", () => {
    const first = startSandboxGoldMineConstruction(constructionInput());
    if (!first.ok) throw new Error(first.reason);
    const second = canStartSandboxGoldMineConstruction(constructionInput({
      economy: first.economy,
      mining: first.mining,
      buildings: first.buildings,
      occupancy: first.occupancy,
      buildingId: "verdant-sandbox-mine-2",
    }));

    expect(second).toEqual({ ok: false, reason: "pit-occupied" });
    expect(first.economy.accounts.verdant.gold).toBe(600);
  });

  it("preserves pit ore across mine destruction, release and reconstruction", () => {
    const first = startSandboxGoldMineConstruction(constructionInput());
    if (!first.ok) throw new Error(first.reason);
    const damaged = advanceBuildings({
      buildings: first.buildings,
      economy: first.economy,
      occupancy: first.occupancy,
      map: DEFINITION.map,
      units: [],
      elapsedSeconds: 0,
      deltaSeconds: 1,
      damageIntents: [{
        sourceId: "crimson-attacker",
        sourceType: "unit",
        targetId: first.building.id,
        targetType: "building",
        amount: first.building.maxHealth,
      }],
      economyPolicy: SANDBOX_MODE.economyPolicy,
      productionPolicy: SANDBOX_MODE.productionPolicy,
    });
    const vacated = vacateMinePit(
      first.mining,
      PLAYER_PIT.id,
      first.building.id,
    );
    const cleaned = removeDestroyedBuildingsAt(
      damaged.buildings,
      damaged.occupancy,
      1 + GAME_RULES.buildings.destructionSeconds,
    );

    expect(vacated.vacated).toBe(true);
    expect(vacated.state.pitsById[PLAYER_PIT.id]).toMatchObject({
      remainingOre: PLAYER_PIT.capacity,
      occupyingMineId: null,
    });
    const rebuilt = startSandboxGoldMineConstruction(constructionInput({
      mining: vacated.state,
      buildings: cleaned.buildings,
      occupancy: cleaned.occupancy,
      economy: first.economy,
      buildingId: "verdant-sandbox-mine-rebuilt",
      createdAt: 2,
    }));
    expect(rebuilt.ok).toBe(true);
    if (!rebuilt.ok) throw new Error(rebuilt.reason);
    expect(rebuilt.mining.pitsById[PLAYER_PIT.id]).toMatchObject({
      remainingOre: PLAYER_PIT.capacity,
      occupyingMineId: rebuilt.building.id,
    });
    expect(rebuilt.building).not.toHaveProperty("remainingOre");
  });

  it("reserves pits for mines and rejects mines on ordinary anchors", () => {
    expect(validateSandboxBuildingZone(
      DEFINITION.map,
      "verdant",
      "gold-mine",
      ORDINARY_ANCHOR,
    )).toBe("invalid-zone");
    expect(validateSandboxBuildingZone(
      DEFINITION.map,
      "verdant",
      "barracks",
      PLAYER_PIT.coordinate,
    )).toBe("invalid-zone");
    expect(validateSandboxBuildingZone(
      DEFINITION.map,
      "verdant",
      "barracks",
      ORDINARY_ANCHOR,
    )).toBeNull();

    expect(canStartSandboxGoldMineConstruction({
      ...constructionInput(),
      worldPosition: axialToWorld(ORDINARY_ANCHOR),
    })).toEqual({ ok: false, reason: "invalid-zone" });
  });

  it("does not allow living units or stale building occupancy on the pit", () => {
    expect(canStartSandboxGoldMineConstruction(constructionInput({
      units: [{ position: axialToWorld(PLAYER_PIT.coordinate), health: 1 }],
    }))).toEqual({ ok: false, reason: "occupied-hex" });
    expect(canStartSandboxGoldMineConstruction(constructionInput({
      occupancy: {
        [coordinateKey(PLAYER_PIT.coordinate)]: {
          buildingId: "stale-mine",
          kind: "gold-mine",
          faction: "verdant",
          coordinate: PLAYER_PIT.coordinate,
        },
      },
    }))).toEqual({ ok: false, reason: "pit-occupied" });
  });

  it("accepts an injected fee waiver without copying permit eligibility rules", () => {
    const economy = economyWithVerdantGold(200);
    expect(canStartSandboxGoldMineConstruction(constructionInput({ economy })))
      .toEqual({ ok: false, reason: "insufficient-gold" });

    const baseInput = constructionInput({ economy });
    const eligibility = emergencyMinePermitEligibility(baseInput.mining, {
      faction: "verdant",
      walletGold: economy.accounts.verdant.gold,
      mineBuildings: [],
    });
    const feeWaiver = vi.fn(({ pit }: { readonly pit: MinePitPlacementView }) => (
      eligibility.eligible && eligibility.eligiblePitIds.includes(pit.id)
    ));
    const waived = startSandboxGoldMineConstruction({
      ...baseInput,
      economy,
      feeWaiver,
    });
    expect(waived.ok).toBe(true);
    if (!waived.ok) throw new Error(waived.reason);
    expect(feeWaiver).toHaveBeenCalledWith(expect.objectContaining({
      faction: "verdant",
      kind: "gold-mine",
      pit: expect.objectContaining({ id: PLAYER_PIT.id }),
      cost: 400,
    }));
    expect(waived.feeWaived).toBe(true);
    expect(waived.costCharged).toBe(0);
    expect(waived.economy).toBe(economy);
    const consumed = consumeEmergencyMinePermit(waived.mining, "verdant");
    expect(consumed).toMatchObject({
      consumed: true,
      state: { emergencyPermits: { verdant: { used: true } } },
    });

    const invalidPitWaiver = vi.fn(() => true);
    const neutralInput = constructionInput({
      pit: NEUTRAL_PIT,
      economy,
      feeWaiver: invalidPitWaiver,
    });
    expect(canStartSandboxGoldMineConstruction(neutralInput))
      .toEqual({ ok: false, reason: "pit-not-controlled" });
    expect(invalidPitWaiver).not.toHaveBeenCalled();
  });

  it("keeps legacy mine price, instant construction and decay unchanged", () => {
    const legacyMine = createBattleBuilding({
      id: "legacy-mine",
      kind: "gold-mine",
      faction: "verdant",
      coordinate: { q: 0, r: 0 },
      createdAt: 3,
      constructionSeconds: 6,
    });

    expect(GAME_RULES.deployment.costs["gold-mine"]).toBe(700);
    expect(legacyMine).toMatchObject({
      createdAt: 3,
      constructionCompletedAt: 3,
      lifetimeSeconds: GAME_RULES.buildings.goldMine.lifetimeSeconds,
    });
    expect(isBattleBuildingOperationalAt(legacyMine, 3)).toBe(true);
  });
});

interface ConstructionInputOverrides {
  readonly pit?: typeof PLAYER_PIT;
  readonly pitOverrides?: Partial<MinePitPlacementView>;
  readonly economy?: EconomyState;
  readonly mining?: SandboxMiningState;
  readonly buildings?: CanStartSandboxGoldMineConstructionInput["buildings"];
  readonly occupancy?: CanStartSandboxGoldMineConstructionInput["occupancy"];
  readonly units?: CanStartSandboxGoldMineConstructionInput["units"];
  readonly buildingId?: string;
  readonly createdAt?: number;
  readonly feeWaiver?: CanStartSandboxGoldMineConstructionInput["feeWaiver"];
}

function constructionInput(
  overrides: ConstructionInputOverrides = {},
): CanStartSandboxGoldMineConstructionInput {
  const pit = overrides.pit ?? PLAYER_PIT;
  let mining = overrides.mining ?? createSandboxMiningState(DEFINITION.minePits);
  if (overrides.pitOverrides) {
    const pitState = mining.pitsById[pit.id]!;
    mining = replaceMinePitState(mining, {
      ...pitState,
      ...overrides.pitOverrides,
    });
  }
  return {
    map: DEFINITION.map,
    mining,
    buildings: overrides.buildings ?? [],
    occupancy: overrides.occupancy ?? {},
    units: overrides.units ?? [],
    economy: overrides.economy ?? createEconomyState(SANDBOX_MODE.economyPolicy),
    faction: "verdant",
    buildingId: overrides.buildingId ?? "verdant-sandbox-mine-1",
    worldPosition: axialToWorld(pit.coordinate),
    createdAt: overrides.createdAt ?? 0,
    feeWaiver: overrides.feeWaiver,
  };
}

function economyWithVerdantGold(gold: number): EconomyState {
  const economy = createEconomyState(SANDBOX_MODE.economyPolicy);
  return {
    ...economy,
    accounts: {
      ...economy.accounts,
      verdant: {
        ...economy.accounts.verdant,
        gold,
        isFull: false,
      },
    },
  };
}

function requiredPit(id: string) {
  const pit = DEFINITION.minePits?.find((candidate) => candidate.id === id);
  if (!pit) throw new Error(`Missing sandbox pit ${id}.`);
  return pit;
}
