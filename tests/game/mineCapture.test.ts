import { describe, expect, it } from "vitest";

import type { HexCoordinate } from "../../src/map/battlefield";
import {
  SANDBOX_LARGE_MINE_PITS,
  type BattlefieldMinePitDefinition,
} from "../../src/map/sandboxLargeBattlefield";
import {
  MINE_CAPTURE_RADIUS_CELLS,
  updatePitCapture,
  type MineCaptureUnitSummary,
} from "../../src/game/mineCapture";
import {
  createMinePitState,
  createSandboxMiningState,
  type MinePitState,
} from "../../src/game/miningEconomy";
import type { Faction } from "../../src/game/types";

describe("sandbox mine capture", () => {
  it("initializes two safe pits per faction and four neutral pits", () => {
    const mining = createSandboxMiningState();
    const pits = Object.values(mining.pitsById);

    expect(pits.filter(({ controller }) => controller === "verdant").map(({ id }) => id))
      .toEqual(["P-W", "P-E"]);
    expect(pits.filter(({ controller }) => controller === "crimson").map(({ id }) => id))
      .toEqual(["E-W", "E-E"]);
    expect(pits.filter(({ controller }) => controller === null)).toHaveLength(4);
  });

  it("captures immediately within one surrounding cell but not two cells away", () => {
    expect(MINE_CAPTURE_RADIUS_CELLS).toBe(1);
    const state = pitState("N-NW");
    const captured = updatePitCapture({
      state,
      units: [unitAt(state, "verdant", 1, 0)],
      occupyingMine: null,
      deltaSeconds: 0.1,
    });
    const outside = updatePitCapture({
      state,
      units: [unitAt(state, "verdant", 2, 0)],
      occupyingMine: null,
      deltaSeconds: 30,
    });

    expect(captured.state).toMatchObject({
      controller: "verdant",
      capturingFaction: null,
      captureProgress: 0,
    });
    expect(captured.event).toEqual({
      type: "mine-pit-captured",
      pitId: "N-NW",
      previousController: null,
      faction: "verdant",
    });
    expect(outside.state).toBe(state);
  });

  it("keeps the first arrival in control while both sides remain present", () => {
    const neutral = pitState("N-NW");
    const first = updatePitCapture({
      state: neutral,
      units: [unitAt(neutral, "verdant", 1, 0)],
      occupyingMine: null,
      deltaSeconds: 0.1,
    });
    const contested = updatePitCapture({
      state: first.state,
      units: [
        unitAt(neutral, "crimson", -1, 0),
        unitAt(neutral, "verdant", 1, 0),
      ],
      occupyingMine: null,
      deltaSeconds: 20,
    });

    expect(contested.state.controller).toBe("verdant");
    expect(contested.event).toBeNull();
  });

  it("lets the remaining faction take over after the first arrival is eliminated", () => {
    const controlled = pitState("N-NW", { controller: "verdant" });
    const result = updatePitCapture({
      state: controlled,
      units: [
        unitAt(controlled, "verdant", 1, 0, false),
        unitAt(controlled, "crimson", -1, 0),
      ],
      occupyingMine: null,
      deltaSeconds: 0.1,
    });

    expect(result.state.controller).toBe("crimson");
    expect(result.event).toMatchObject({
      previousController: "verdant",
      faction: "crimson",
    });
  });

  it("resolves a same-tick neutral arrival by stable unit order", () => {
    const neutral = pitState("N-NW");
    const result = updatePitCapture({
      state: neutral,
      units: [
        unitAt(neutral, "crimson", -1, 0),
        unitAt(neutral, "verdant", 1, 0),
      ],
      occupyingMine: null,
      deltaSeconds: 0.1,
    });

    expect(result.state.controller).toBe("crimson");
  });

  it("captures mirrored neutral pits symmetrically for both factions", () => {
    const verdantPit = pitState("N-NW");
    const crimsonPit = pitState("N-SE");
    const verdant = updatePitCapture({
      state: verdantPit,
      units: [unitAt(verdantPit, "verdant", 1, 0)],
      occupyingMine: null,
      deltaSeconds: 0.1,
    });
    const crimson = updatePitCapture({
      state: crimsonPit,
      units: [unitAt(crimsonPit, "crimson", -1, 0)],
      occupyingMine: null,
      deltaSeconds: 0.1,
    });

    expect(verdant.state.controller).toBe("verdant");
    expect(crimson.state.controller).toBe("crimson");
    expect(crimsonPit.coordinate).toEqual({
      q: -verdantPit.coordinate.q,
      r: -verdantPit.coordinate.r,
    });
  });

  it("blocks takeover until the occupying enemy mine is destroyed", () => {
    const occupied = pitState("N-NW", {
      controller: "crimson",
      occupyingMineId: "crimson-mine",
    });
    const units = [unitAt(occupied, "verdant", 1, 0)];
    const blocked = updatePitCapture({
      state: occupied,
      units,
      occupyingMine: {
        id: "crimson-mine",
        faction: "crimson",
        active: true,
      },
      deltaSeconds: 30,
    });
    const destroyed = updatePitCapture({
      state: occupied,
      units,
      occupyingMine: {
        id: "crimson-mine",
        faction: "crimson",
        active: false,
      },
      deltaSeconds: 0.1,
    });

    expect(blocked.state.controller).toBe("crimson");
    expect(blocked.event).toBeNull();
    expect(destroyed.state.controller).toBe("verdant");
    expect(destroyed.event?.previousController).toBe("crimson");
  });

  it("treats missing or mismatched building summaries as occupied, not destroyed", () => {
    const state = pitState("N-NW", { occupyingMineId: "mine-authoritative" });
    const units = [unitAt(state, "verdant", 1, 0)];

    expect(updatePitCapture({
      state,
      units,
      occupyingMine: null,
      deltaSeconds: 0.1,
    }).state.controller).toBeNull();
    expect(updatePitCapture({
      state,
      units,
      occupyingMine: { id: "other-mine", faction: "crimson", active: false },
      deltaSeconds: 0.1,
    }).state.controller).toBeNull();
  });

  it("ignores invalid time steps and clears legacy capture progress on a valid step", () => {
    const legacy = pitState("N-NW", {
      captureProgress: 2.5,
      capturingFaction: "verdant",
    });
    expect(updatePitCapture({
      state: legacy,
      units: [],
      occupyingMine: null,
      deltaSeconds: 0,
    }).state).toBe(legacy);
    expect(updatePitCapture({
      state: legacy,
      units: [],
      occupyingMine: null,
      deltaSeconds: 0.1,
    }).state).toMatchObject({ captureProgress: 0, capturingFaction: null });
  });
});

function pitState(
  id: string,
  overrides: Partial<MinePitState> = {},
): MinePitState {
  return Object.freeze({
    ...createMinePitState(pitDefinition(id)),
    ...overrides,
  });
}

function pitDefinition(id: string): BattlefieldMinePitDefinition {
  const definition = SANDBOX_LARGE_MINE_PITS.find((pit) => pit.id === id);
  if (!definition) throw new Error(`Missing test pit: ${id}`);
  return definition;
}

function unitAt(
  pit: MinePitState,
  faction: Faction,
  qOffset: number,
  rOffset: number,
  alive = true,
): MineCaptureUnitSummary {
  return {
    faction,
    coordinate: offset(pit.coordinate, qOffset, rOffset),
    alive,
  };
}

function offset(
  coordinate: HexCoordinate,
  qOffset: number,
  rOffset: number,
): HexCoordinate {
  return { q: coordinate.q + qOffset, r: coordinate.r + rOffset };
}
