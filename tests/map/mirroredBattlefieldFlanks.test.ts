import { describe, expect, it } from "vitest";

import {
  BATTLEFIELD_DECORATIONS,
  BATTLEFIELD_STRUCTURES,
  getBattlefieldCell,
} from "../../src/map/battlefield";
import { BATTLEFIELD_SCENERY } from "../../src/map/battlefieldScenery";
import { battlefieldCoordinates } from "../../src/map/battlefieldLayout";
import {
  SCENERY_SCENE_ASSETS,
  scenerySceneAssetFor,
} from "../../src/scene/assets";

const mirror = ({ q, r }: { readonly q: number; readonly r: number }) => ({
  q: -q,
  r: -r,
});

const coordinateKey = ({ q, r }: { readonly q: number; readonly r: number }) => `${q},${r}`;

function normalizedRotation(rotation: number): number {
  const fullTurn = Math.PI * 2;
  return ((rotation % fullTurn) + fullTurn) % fullTurn;
}

describe("mirrored battlefield flanks", () => {
  it("keeps the trimmed battlefield footprint centrally symmetric", () => {
    const coordinateKeys = new Set(
      battlefieldCoordinates().map(([q, r]) => `${q},${r}`),
    );

    for (const key of coordinateKeys) {
      const [q, r] = key.split(",").map(Number) as [number, number];
      expect(coordinateKeys.has(`${-q},${-r}`), `missing mirror of ${key}`).toBe(true);
    }
  });

  it("mirrors the blocked mine and farm terrain into crimson territory", () => {
    const sourceZones = new Set(["left-mine", "right-farm"]);
    const sourceCoordinates = new Map(
      BATTLEFIELD_SCENERY
        .filter(({ zone }) => sourceZones.has(zone))
        .map(({ coordinate }) => [coordinateKey(coordinate), coordinate]),
    );

    for (const coordinate of sourceCoordinates.values()) {
      const source = getBattlefieldCell(coordinate);
      const target = getBattlefieldCell(mirror(coordinate));
      expect(target, `missing terrain mirror of ${coordinateKey(coordinate)}`).toMatchObject({
        surface: source?.surface,
        territory: "crimson",
        walkable: source?.walkable,
        buildable: source?.buildable,
      });
    }

    expect(getBattlefieldCell({ q: -2, r: -3 })).toMatchObject({
      surface: "grass",
      territory: "crimson",
      walkable: true,
      buildable: true,
    });
  });

  it("derives enemy mine and farm scenery from the player-side placements", () => {
    const zonePairs = [
      ["left-mine", "right-mine"],
      ["right-farm", "left-farm"],
    ] as const;

    for (const [sourceZone, targetZone] of zonePairs) {
      const sourceItems = BATTLEFIELD_SCENERY.filter(({ zone }) => zone === sourceZone);
      const targetItems = BATTLEFIELD_SCENERY.filter(({ zone }) => String(zone) === targetZone);
      expect(targetItems).toHaveLength(sourceItems.length);

      for (const source of sourceItems) {
        const targetCoordinate = mirror(source.coordinate);
        const target = targetItems.find((item) => (
          item.kind === source.kind
          && item.coordinate.q === targetCoordinate.q
          && item.coordinate.r === targetCoordinate.r
          && item.scale === source.scale
        ));
        expect(target, `missing ${targetZone} mirror for ${source.id}`).toBeDefined();
        expect(target?.offset).toEqual({ x: -source.offset.x, z: -source.offset.z });
        expect(normalizedRotation((target?.rotationY ?? 0) - source.rotationY))
          .toBeCloseTo(Math.PI);
        if (sourceZone === "right-farm") {
          expect(source.faction).toBe("verdant");
          expect(target?.faction).toBe("crimson");
        }
      }
    }
  });

  it("mirrors the bay ship and uses the opposing faction color", () => {
    const ships = BATTLEFIELD_SCENERY.filter(({ kind }) => kind === "bay-ship");
    const playerShip = ships.find(({ coordinate }) => coordinate.q === 5 && coordinate.r === 0);
    const enemyShip = ships.find(({ coordinate }) => coordinate.q === -5 && coordinate.r === 0);

    expect(ships).toHaveLength(2);
    expect(playerShip).toMatchObject({ faction: "verdant" });
    expect(enemyShip).toMatchObject({ faction: "crimson" });
    expect(enemyShip?.offset).toEqual({
      x: -(playerShip?.offset.x ?? 0),
      z: -(playerShip?.offset.z ?? 0),
    });
  });

  it("mirrors every permanent camp structure and removes asymmetric mine props", () => {
    const normalizedStructures = (faction: "verdant" | "crimson") => (
      BATTLEFIELD_STRUCTURES
        .filter((structure) => structure.faction === faction)
        .map(({ kind, coordinate, footprint }) => ({
          kind,
          coordinate,
          footprint: [...footprint].sort((left, right) => (
            coordinateKey(left).localeCompare(coordinateKey(right))
          )),
        }))
        .sort((left, right) => (
          `${left.kind}:${coordinateKey(left.coordinate)}`
            .localeCompare(`${right.kind}:${coordinateKey(right.coordinate)}`)
        ))
    );
    const expectedEnemy = normalizedStructures("verdant")
      .map(({ kind, coordinate, footprint }) => ({
        kind,
        coordinate: mirror(coordinate),
        footprint: footprint.map(mirror).sort((left, right) => (
          coordinateKey(left).localeCompare(coordinateKey(right))
        )),
      }))
      .sort((left, right) => (
        `${left.kind}:${coordinateKey(left.coordinate)}`
          .localeCompare(`${right.kind}:${coordinateKey(right.coordinate)}`)
      ));

    expect(normalizedStructures("crimson")).toEqual(expectedEnemy);
    expect(BATTLEFIELD_DECORATIONS).toEqual([]);
  });

  it("provides red KayKit variants for every faction-colored mirrored prop", () => {
    const factionKinds = [
      "bay-ship",
      "farm-cargo-wagon",
      "farm-windmill",
      "farm-home-a",
      "farm-home-b",
      "farm-watermill",
    ] as const;
    const assets = SCENERY_SCENE_ASSETS as Readonly<Record<
      string,
      { readonly factionUrls?: Readonly<Record<"verdant" | "crimson", string>> }
    >>;

    for (const kind of factionKinds) {
      expect(assets[kind]?.factionUrls?.verdant).toContain("blue");
      expect(assets[kind]?.factionUrls?.crimson).toContain("red");
      expect(scenerySceneAssetFor(kind, "verdant").url).toContain("blue");
      expect(scenerySceneAssetFor(kind, "crimson").url).toContain("red");
    }
  });
});
