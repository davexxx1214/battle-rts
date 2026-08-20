import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  stepBattle,
} from "../../src/game/battle";
import {
  clearNavigationCaches,
  getNavigationCacheStats,
} from "../../src/game/navigation";
import {
  buildSquadNavigationPlan,
  squadNavigationWaypointsFor,
} from "../../src/game/squadNavigation";
import {
  BATTLEFIELD_MAP,
  axialToWorld,
  battlefieldMapIndexFor,
  getMapCell,
  type BattlefieldCell,
  type BattlefieldMap,
  type HexCoordinate,
} from "../../src/map/battlefield";

describe("squad navigation plans", () => {
  it("computes one canonical long route and gives members defensive route copies", () => {
    const memberCoordinates = nearbyWalkableCoordinates(3);
    const members = memberCoordinates.map((coordinate, index) => ({
      id: `member-${index + 1}`,
      position: axialToWorld(coordinate),
    }));
    clearNavigationCaches(BATTLEFIELD_MAP);

    const plan = buildSquadNavigationPlan({
      map: BATTLEFIELD_MAP,
      squadId: "verdant-shared-route",
      faction: "verdant",
      destination: BATTLEFIELD_MAP.castleApproaches.crimson,
      navigationKey: "charge:crimson-castle",
      members,
    });

    expect(plan).not.toBeNull();
    if (!plan) return;
    expect(getNavigationCacheStats(BATTLEFIELD_MAP)).toMatchObject({
      pathHits: 0,
      pathMisses: 1,
      cachedPaths: 1,
    });
    expect(plan.canonicalMemberId).toBe("member-1");
    expect(plan.memberRoutes).toHaveLength(3);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.canonicalRoute)).toBe(true);
    expect(new Set(plan.memberRoutes.map((route) => route.waypoints)).size).toBe(3);

    for (const route of plan.memberRoutes) {
      const canonicalTail = plan.canonicalRoute
        .slice(route.canonicalJoinIndex + 1)
        .map(axialToWorld);
      expect(route.waypoints.slice(-canonicalTail.length)).toEqual(canonicalTail);
    }

    const first = squadNavigationWaypointsFor(plan, "member-1")!;
    const second = squadNavigationWaypointsFor(plan, "member-2")!;
    const originalSecond = second.map((point) => ({ ...point }));
    (first[0] as { x: number }).x = 99_999;
    expect(squadNavigationWaypointsFor(plan, "member-1")?.[0]?.x).not.toBe(99_999);
    expect(second).toEqual(originalSecond);
  });

  it("builds only on the first charging step and reuses stored member waypoints next step", () => {
    const coordinates = nearbyWalkableCoordinates(3);
    const units = coordinates.map((coordinate, index) => createBattleUnit({
      id: `charging-member-${index + 1}`,
      squadId: "verdant-charging-squad",
      faction: "verdant",
      role: "spearman",
      position: axialToWorld(coordinate),
    }));
    clearNavigationCaches(BATTLEFIELD_MAP);

    const first = stepBattle(createBattleState(units), 0.05);
    const afterFirst = getNavigationCacheStats(BATTLEFIELD_MAP);
    expect(afterFirst).toMatchObject({ pathHits: 0, pathMisses: 1 });
    expect(first.units.every((unit) => (
      unit.navigationKey === "charge:crimson-castle" && unit.waypoints.length > 0
    ))).toBe(true);
    expect(new Set(first.units.map((unit) => unit.waypoints)).size).toBe(first.units.length);

    const second = stepBattle(first, 0.05);
    expect(getNavigationCacheStats(BATTLEFIELD_MAP)).toEqual(afterFirst);
    expect(second.units.every((unit) => unit.status === "moving")).toBe(true);
  });

  it("keeps local connectors off dynamic blockers without changing static cells", () => {
    const map = connectorMap();
    const blockedKeys = new Set(["0,1"]);
    clearNavigationCaches(map);

    const plan = buildSquadNavigationPlan({
      map,
      squadId: "connector-squad",
      faction: "verdant",
      destination: { q: 3, r: 0 },
      navigationKey: "charge:crimson-castle",
      members: [
        { id: "a-leader", position: axialToWorld({ q: 0, r: 0 }) },
        { id: "b-member", position: axialToWorld({ q: 0, r: 2 }) },
      ],
      navigationContext: { revision: 2, blockedKeys, movementMode: "ground" },
    });

    expect(plan).not.toBeNull();
    const memberRoute = plan && squadNavigationWaypointsFor(plan, "b-member");
    expect(memberRoute).toContainEqual(axialToWorld({ q: 1, r: 1 }));
    expect(memberRoute).not.toContainEqual(axialToWorld({ q: 0, r: 1 }));
    expect(getMapCell(map, { q: 0, r: 1 })?.walkable).toBe(true);
  });
});

function nearbyWalkableCoordinates(count: number): HexCoordinate[] {
  const index = battlefieldMapIndexFor(BATTLEFIELD_MAP);
  const campKey = `${BATTLEFIELD_MAP.verdantCamp.q},${BATTLEFIELD_MAP.verdantCamp.r}`;
  const neighbors = (index.neighborKeysByKey.get(campKey) ?? [])
    .map((key) => index.cellByKey.get(key)!)
    .filter((cell) => cell.walkable);
  return [
    { ...BATTLEFIELD_MAP.verdantCamp },
    ...neighbors.map((cell) => ({ q: cell.q, r: cell.r })),
  ].slice(0, count);
}

function connectorMap(): BattlefieldMap {
  const coordinates: readonly HexCoordinate[] = [
    { q: 0, r: 0 },
    { q: 1, r: 0 },
    { q: 2, r: 0 },
    { q: 3, r: 0 },
    { q: 0, r: 1 },
    { q: 0, r: 2 },
    { q: 1, r: 1 },
  ];
  const cells = coordinates.map((coordinate): BattlefieldCell => ({
    ...coordinate,
    height: 0,
    surface: "grass",
    walkable: true,
    territory: null,
    buildable: false,
    reservedForPath: false,
  }));
  return {
    id: "connector-test-map",
    navigationRevision: 1,
    cells,
    verdantCamp: { q: 0, r: 0 },
    crimsonCamp: { q: 3, r: 0 },
    center: { q: 1, r: 0 },
    bridges: [],
    castles: { verdant: { q: 0, r: 0 }, crimson: { q: 3, r: 0 } },
    castleApproaches: { verdant: { q: 0, r: 0 }, crimson: { q: 3, r: 0 } },
    radius: 3,
  };
}
