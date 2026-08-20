import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  stepBattle,
  type BattleState,
} from "../../src/game/battle";
import {
  castleChargeNavigationKey,
  findHexPath,
} from "../../src/game/navigation";
import {
  TROOP_KINDS,
  TROOP_ROLE_BY_DEPLOYABLE,
  unitSpecFor,
} from "../../src/game/rules";
import type {
  UnitCombatProfile,
  UnitRole,
  WorldPoint,
} from "../../src/game/types";
import {
  axialToWorld,
  coordinateKey,
  hexDistance,
  type HexCoordinate,
} from "../../src/map/battlefield";
import {
  SANDBOX_LARGE_BATTLEFIELD_ID,
  SANDBOX_LARGE_BATTLEFIELD_MAP,
  SANDBOX_LARGE_GATES,
  SANDBOX_LARGE_MINE_PITS,
  SANDBOX_LARGE_ROAD_RESERVE,
  SANDBOX_LARGE_ROUTES,
} from "../../src/map/sandboxLargeBattlefield";

const FIXED_TICK_SECONDS = 1 / 60;
const ARRIVAL_TOLERANCE = 1e-6;
const MAXIMUM_RELATIVE_ERROR = 0.08;

interface TimedMarchPath {
  readonly id: string;
  readonly coordinates: readonly HexCoordinate[];
}

interface TimedMarchCase {
  readonly id: string;
  readonly steps: 6 | 9 | 13 | 20 | 25 | 30 | 38;
  readonly paths: readonly TimedMarchPath[];
}

const TIMED_MARCH_CASES: readonly TimedMarchCase[] = [
  mineMarchCase("safe-mine", 9, ["P-W", "P-E"]),
  mineMarchCase("near-mine", 13, ["N-NW", "N-NE"]),
  mineMarchCase("far-mine", 20, ["N-SW", "N-SE"]),
  mineMarchCase("enemy-mine", 25, ["E-W", "E-E"]),
  routeMarchCase("center-route", 30, ["center"]),
  routeMarchCase("side-routes", 38, ["west", "east"]),
  {
    id: "adjacent-lane-change",
    steps: 6,
    paths: [
      reservedRoadPath("west-to-center", [{ q: -8, r: 4 }], [{ q: -2, r: 4 }]),
      reservedRoadPath("center-to-east", [{ q: -2, r: 4 }], [{ q: 4, r: 4 }]),
    ],
  },
];

const TIMING_CASES = TIMED_MARCH_CASES.flatMap((march) => (
  TROOP_KINDS.map((troop) => ({ march, troop }))
));

describe("sandbox large-map march timing", () => {
  it("locks the seven measured path classes to adjacent two-unit hex steps", () => {
    expect(TIMED_MARCH_CASES.map(({ steps }) => steps)).toEqual([
      9, 13, 20, 25, 30, 38, 6,
    ]);
    for (const march of TIMED_MARCH_CASES) {
      for (const path of march.paths) {
        expect(path.coordinates).toHaveLength(march.steps + 1);
        expect(path.coordinates.slice(1).every((coordinate, index) => (
          hexDistance(path.coordinates[index]!, coordinate) === 1
        ))).toBe(true);
      }
    }
  });

  it.each(TIMING_CASES)(
    "$troop marches $march.id within 8% of distance / speed",
    ({ march, troop }) => {
      const role = TROOP_ROLE_BY_DEPLOYABLE[troop];
      const speed = unitSpecFor(role, "human").moveSpeed;
      const expectedSeconds = 2 * march.steps / speed;

      for (const path of march.paths) {
        const actualSeconds = simulatePath(
          path.coordinates,
          role,
          "human",
          expectedSeconds * 1.1,
        );
        const relativeError = Math.abs(actualSeconds - expectedSeconds) / expectedSeconds;
        expect(
          relativeError,
          `${troop} ${path.id}: expected ${expectedSeconds.toFixed(3)}s, got ${actualSeconds.toFixed(3)}s`,
        ).toBeLessThanOrEqual(MAXIMUM_RELATIVE_ERROR);
      }
    },
  );

  it("keeps the fastest undead spearman near 9.5 seconds over half the center route", () => {
    const center = SANDBOX_LARGE_ROUTES.find(({ id }) => id === "center")!;
    const halfRoute = center.referencePath.slice(0, 16);
    const speed = unitSpecFor("spearman", "undead").moveSpeed;
    const expectedSeconds = 30 / speed;
    const actualSeconds = simulatePath(
      halfRoute,
      "spearman",
      "undead",
      expectedSeconds * 1.1,
    );
    const relativeError = Math.abs(actualSeconds - expectedSeconds) / expectedSeconds;

    expect(actualSeconds).toBeGreaterThanOrEqual(9.4);
    expect(actualSeconds).toBeLessThanOrEqual(9.7);
    expect(relativeError).toBeLessThanOrEqual(MAXIMUM_RELATIVE_ERROR);
  });
});

function mineMarchCase(
  id: string,
  steps: 9 | 13 | 20 | 25,
  mineIds: readonly string[],
): TimedMarchCase {
  return {
    id,
    steps,
    paths: mineIds.map((mineId) => {
      const pit = SANDBOX_LARGE_MINE_PITS.find((candidate) => candidate.id === mineId);
      if (!pit) throw new Error(`Missing timing mine ${mineId}`);
      return reservedRoadPath(
        mineId,
        SANDBOX_LARGE_GATES.verdant.cells,
        pit.entrances,
      );
    }),
  };
}

function routeMarchCase(
  id: string,
  steps: 30 | 38,
  routeIds: readonly ("center" | "west" | "east")[],
): TimedMarchCase {
  return {
    id,
    steps,
    paths: routeIds.map((routeId) => {
      const route = SANDBOX_LARGE_ROUTES.find((candidate) => candidate.id === routeId);
      if (!route) throw new Error(`Missing timing route ${routeId}`);
      return { id: routeId, coordinates: route.referencePath };
    }),
  };
}

function reservedRoadPath(
  id: string,
  starts: readonly HexCoordinate[],
  goals: readonly HexCoordinate[],
): TimedMarchPath {
  const reserveKeys = new Set(SANDBOX_LARGE_ROAD_RESERVE.map(coordinateKey));
  const blockedKeys = new Set(SANDBOX_LARGE_BATTLEFIELD_MAP.cells
    .filter((cell) => !reserveKeys.has(coordinateKey(cell)))
    .map(coordinateKey));
  const candidates = starts.flatMap((start) => goals.flatMap((goal) => {
    const path = findHexPath(
      SANDBOX_LARGE_BATTLEFIELD_MAP,
      start,
      goal,
      { revision: SANDBOX_LARGE_BATTLEFIELD_MAP.navigationRevision, blockedKeys },
    );
    return path.length > 0 ? [path] : [];
  })).sort((first, second) => (
    first.length - second.length
    || first.map(coordinateKey).join(";").localeCompare(second.map(coordinateKey).join(";"))
  ));
  const coordinates = candidates[0];
  if (!coordinates) throw new Error(`Missing reserved-road timing path ${id}`);
  return { id, coordinates };
}

function simulatePath(
  coordinates: readonly HexCoordinate[],
  role: UnitRole,
  combatProfile: UnitCombatProfile,
  timeoutSeconds: number,
): number {
  const positions = coordinates.map(axialToWorld);
  const destination = positions.at(-1)!;
  const unit = {
    ...createBattleUnit({
      id: `${role}-${combatProfile}-timing-probe`,
      faction: "verdant",
      role,
      combatProfile,
      position: positions[0]!,
    }),
    waypoints: positions.slice(1),
    navigationKey: castleChargeNavigationKey("crimson"),
  };
  let state: BattleState = {
    ...createBattleState([unit], {
      modeId: "normal",
      mapId: SANDBOX_LARGE_BATTLEFIELD_ID,
    }),
    buildings: [],
  };
  const maximumTicks = Math.ceil(timeoutSeconds / FIXED_TICK_SECONDS);
  for (let tick = 1; tick <= maximumTicks; tick += 1) {
    state = stepBattle(state, FIXED_TICK_SECONDS);
    const position = state.units[0]?.position;
    if (position && distance(position, destination) <= ARRIVAL_TOLERANCE) {
      return tick * FIXED_TICK_SECONDS;
    }
  }
  throw new Error(`${role} did not complete ${coordinates.length - 1} steps in time`);
}

function distance(first: WorldPoint, second: WorldPoint): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}
