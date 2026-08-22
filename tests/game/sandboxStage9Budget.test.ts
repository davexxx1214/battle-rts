import { describe, expect, it } from "vitest";

import { populationIncomeMultiplier } from "../../src/game/battleMode";
import { findHexPath } from "../../src/game/navigation";
import {
  sandboxBuildingSpec,
  sandboxTroopSpec,
} from "../../src/game/sandboxCatalog";
import {
  coordinateKey,
  getMapCell,
  hexDistance,
} from "../../src/map/battlefield";
import {
  SANDBOX_LARGE_BATTLEFIELD_MAP,
  SANDBOX_LARGE_BUILD_ANCHORS,
  SANDBOX_LARGE_CASTLES,
  SANDBOX_LARGE_MINE_PITS,
  SANDBOX_LARGE_ROAD_RESERVE,
  SANDBOX_LARGE_ROUTES,
} from "../../src/map/sandboxLargeBattlefield";

describe("sandbox stage 9 balance budgets", () => {
  it("makes the 20→21 and 40→41 upkeep cliffs explicit", () => {
    expect([
      [20, populationIncomeMultiplier("sandbox", 20)],
      [21, populationIncomeMultiplier("sandbox", 21)],
      [40, populationIncomeMultiplier("sandbox", 40)],
      [41, populationIncomeMultiplier("sandbox", 41)],
    ]).toEqual([
      [20, 1],
      [21, 0.8],
      [40, 0.8],
      [41, 0.6],
    ]);

    // Each order reserves its unit's population immediately. There is no
    // hidden grace interval around either displayed threshold.
    for (const populationCost of [
      sandboxTroopSpec("spearman").populationCost,
      sandboxTroopSpec("swordsman").populationCost,
    ]) {
      expect(populationIncomeMultiplier("sandbox", 20 + populationCost)).toBe(0.8);
      expect(populationIncomeMultiplier("sandbox", 40 + populationCost)).toBe(0.6);
    }
  });

  it("paces safe, neutral, and wide-control mining across the three population bands", () => {
    const pitCapacity = SANDBOX_LARGE_MINE_PITS[0]!.capacity;
    const initialGold = 1_000;
    const mineCost = sandboxBuildingSpec("mine").cost;
    const barracksCost = sandboxBuildingSpec("barracks").cost;
    const cheapestGoldPerPopulation = sandboxTroopSpec("spearman").cost
      / sandboxTroopSpec("spearman").populationCost;

    const safeBandIncome = 2 * pitCapacity * populationIncomeMultiplier("sandbox", 20);
    const costToOpenAndField20 = 2 * mineCost
      + barracksCost
      + 20 * cheapestGoldPerPopulation;
    expect(initialGold + safeBandIncome).toBeGreaterThanOrEqual(costToOpenAndField20);

    const neutralPairIncome = 2 * pitCapacity * populationIncomeMultiplier("sandbox", 40);
    const costFrom20To40 = 20 * cheapestGoldPerPopulation;
    expect(neutralPairIncome).toBeGreaterThan(costFrom20To40);

    const oneLatePitIncome = pitCapacity * populationIncomeMultiplier("sandbox", 60);
    const costFrom40To60 = 20 * cheapestGoldPerPopulation;
    expect(oneLatePitIncome).toBeLessThan(costFrom40To60);
    expect(oneLatePitIncome * 2).toBeGreaterThan(costFrom40To60);
  });

  it("keeps the 30-step center route faster while placing neutral ore by the 38-step flanks", () => {
    const center = SANDBOX_LARGE_ROUTES.find((route) => route.id === "center")!;
    const flanks = SANDBOX_LARGE_ROUTES.filter((route) => route.id !== "center");
    const neutralPits = SANDBOX_LARGE_MINE_PITS.filter((pit) => pit.initialController === null);

    expect(center.referencePath).toHaveLength(31);
    expect(flanks.every((route) => route.referencePath.length === 39)).toBe(true);
    expect(38 / 30).toBeGreaterThanOrEqual(1.25);

    for (const pit of neutralPits) {
      const centerDistance = Math.min(...center.referencePath.map((cell) => (
        hexDistance(cell, pit.coordinate)
      )));
      const flankDistance = Math.min(...flanks.flatMap((route) => (
        route.referencePath.map((cell) => hexDistance(cell, pit.coordinate))
      )));
      expect(flankDistance).toBeLessThanOrEqual(3);
      expect(centerDistance).toBeGreaterThan(flankDistance);
    }
  });

  it("caps towers at two inside each core without sealing any route", () => {
    const tower = sandboxBuildingSpec("guard-tower");
    const reservedKeys = new Set(SANDBOX_LARGE_ROAD_RESERVE.map(coordinateKey));
    const anchorKeys = new Set(Object.values(SANDBOX_LARGE_BUILD_ANCHORS)
      .flat()
      .map((anchor) => coordinateKey(anchor.coordinate)));

    expect(tower.maximumActivePerFaction).toBe(2);
    for (const faction of ["verdant", "crimson"] as const) {
      for (const anchor of SANDBOX_LARGE_BUILD_ANCHORS[faction]) {
        const cell = getMapCell(SANDBOX_LARGE_BATTLEFIELD_MAP, anchor.coordinate);
        expect(cell).toMatchObject({
          territory: faction,
          buildPolicy: "ordinary",
          buildable: true,
        });
        expect(reservedKeys.has(coordinateKey(anchor.coordinate))).toBe(false);
        expect(hexDistance(anchor.coordinate, SANDBOX_LARGE_CASTLES[faction]))
          .toBeLessThanOrEqual(6);
      }
    }

    for (const route of SANDBOX_LARGE_ROUTES) {
      const path = findHexPath(
        SANDBOX_LARGE_BATTLEFIELD_MAP,
        route.referencePath[0]!,
        route.referencePath.at(-1)!,
        {
          revision: SANDBOX_LARGE_BATTLEFIELD_MAP.navigationRevision,
          blockedKeys: anchorKeys,
        },
      );
      expect(path.length).toBeGreaterThan(0);
    }
  });
});
