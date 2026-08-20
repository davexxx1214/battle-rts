import { describe, expect, it } from "vitest";

import type { HexCoordinate } from "../../src/map/battlefield";
import {
  SANDBOX_LARGE_MINE_PITS,
  type BattlefieldMinePitDefinition,
} from "../../src/map/sandboxLargeBattlefield";
import {
  MINE_CAPTURE_DURATION_SECONDS,
  MINE_CAPTURE_INTERFERENCE_RADIUS_CELLS,
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

  it("uses inclusive two-cell capture and exclusive three-cell friendly boundaries", () => {
    expect(MINE_CAPTURE_RADIUS_CELLS).toBe(2);
    const state = pitState("N-NW");
    const qualifying = updatePitCapture({
      state,
      units: [unitAt(state, "verdant", 2, 0)],
      occupyingMine: null,
      deltaSeconds: 1,
    });
    const outside = updatePitCapture({
      state,
      units: [unitAt(state, "verdant", 3, 0)],
      occupyingMine: null,
      deltaSeconds: 1,
    });

    expect(qualifying.state.captureProgress).toBe(1);
    expect(qualifying.state.capturingFaction).toBe("verdant");
    expect(qualifying.state).not.toBe(state);
    expect(state.captureProgress).toBe(0);
    expect(Object.isFrozen(qualifying.state)).toBe(true);
    expect(outside.state).toBe(state);
  });

  it("lets an enemy exactly three cells away interrupt, but not four cells away", () => {
    expect(MINE_CAPTURE_INTERFERENCE_RADIUS_CELLS).toBe(3);
    const state = pitState("N-NW", {
      captureProgress: 1,
      capturingFaction: "verdant",
    });
    const friendly = unitAt(state, "verdant", 2, 0);
    const interrupted = updatePitCapture({
      state,
      units: [friendly, unitAt(state, "crimson", -3, 0)],
      occupyingMine: null,
      deltaSeconds: 1,
    });
    const uninterrupted = updatePitCapture({
      state,
      units: [friendly, unitAt(state, "crimson", -4, 0)],
      occupyingMine: null,
      deltaSeconds: 1,
    });

    expect(interrupted.state.captureProgress).toBe(0);
    expect(interrupted.state.capturingFaction).toBeNull();
    expect(uninterrupted.state.captureProgress).toBe(2);
    expect(uninterrupted.state.capturingFaction).toBe("verdant");
  });

  it("clears all progress as soon as the only capturing unit dies", () => {
    const state = pitState("N-NW", {
      captureProgress: 2.5,
      capturingFaction: "verdant",
    });
    const result = updatePitCapture({
      state,
      units: [unitAt(state, "verdant", 0, 0, false)],
      occupyingMine: null,
      deltaSeconds: 0.1,
    });

    expect(result.state.captureProgress).toBe(0);
    expect(result.state.capturingFaction).toBeNull();
    expect(result.event).toBeNull();
  });

  it("requires three uninterrupted seconds and captures when delta crosses the boundary", () => {
    expect(MINE_CAPTURE_DURATION_SECONDS).toBe(3);
    const initial = pitState("N-NW");
    const units = [unitAt(initial, "verdant", 1, 0)];
    const first = updatePitCapture({
      state: initial,
      units,
      occupyingMine: null,
      deltaSeconds: 1.25,
    });
    const interrupted = updatePitCapture({
      state: first.state,
      units: [],
      occupyingMine: null,
      deltaSeconds: 0.1,
    });
    const restarted = updatePitCapture({
      state: interrupted.state,
      units,
      occupyingMine: null,
      deltaSeconds: 2.8,
    });
    const captured = updatePitCapture({
      state: restarted.state,
      units,
      occupyingMine: null,
      deltaSeconds: 0.3,
    });

    expect(first.state.captureProgress).toBe(1.25);
    expect(interrupted.state.captureProgress).toBe(0);
    expect(restarted.state.controller).toBeNull();
    expect(restarted.state.captureProgress).toBe(2.8);
    expect(captured.state.controller).toBe("verdant");
    expect(captured.state.captureProgress).toBe(0);
    expect(captured.state.capturingFaction).toBeNull();
    expect(captured.event).toEqual({
      type: "mine-pit-captured",
      pitId: "N-NW",
      previousController: null,
      faction: "verdant",
    });
  });

  it("captures mirrored neutral pits symmetrically for both factions", () => {
    const verdantPit = pitState("N-NW");
    const crimsonPit = pitState("N-SE");
    const verdant = updatePitCapture({
      state: verdantPit,
      units: [unitAt(verdantPit, "verdant", 2, 0)],
      occupyingMine: null,
      deltaSeconds: 3,
    });
    const crimson = updatePitCapture({
      state: crimsonPit,
      units: [unitAt(crimsonPit, "crimson", -2, 0)],
      occupyingMine: null,
      deltaSeconds: 3,
    });

    expect(verdant.state.controller).toBe("verdant");
    expect(crimson.state.controller).toBe("crimson");
    expect(verdant.event?.faction).toBe("verdant");
    expect(crimson.event?.faction).toBe("crimson");
    expect(crimsonPit.coordinate).toEqual({
      q: -verdantPit.coordinate.q,
      r: -verdantPit.coordinate.r,
    });
  });

  it("blocks passive takeover until the occupying enemy mine is destroyed", () => {
    const occupied = pitState("N-NW", {
      controller: "crimson",
      captureProgress: 2.9,
      capturingFaction: "verdant",
      occupyingMineId: "crimson-mine",
    });
    const units = [unitAt(occupied, "verdant", 0, 0)];
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
      deltaSeconds: 3,
    });

    expect(blocked.state.controller).toBe("crimson");
    expect(blocked.state.captureProgress).toBe(0);
    expect(blocked.event).toBeNull();
    expect(destroyed.state.controller).toBe("verdant");
    expect(destroyed.state.occupyingMineId).toBe("crimson-mine");
    expect(destroyed.event?.previousController).toBe("crimson");
  });

  it("treats missing or mismatched building summaries as occupied, not destroyed", () => {
    const state = pitState("N-NW", { occupyingMineId: "mine-authoritative" });
    const units = [unitAt(state, "verdant", 0, 0)];

    expect(updatePitCapture({
      state,
      units,
      occupyingMine: null,
      deltaSeconds: 3,
    }).state.controller).toBeNull();
    expect(updatePitCapture({
      state,
      units,
      occupyingMine: { id: "other-mine", faction: "crimson", active: false },
      deltaSeconds: 3,
    }).state.controller).toBeNull();
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
