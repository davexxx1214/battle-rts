import { describe, expect, it } from "vitest";

import {
  BATTLEFIELD_MAP,
  BATTLEFIELD_WORLD_BOUNDS,
  BATTLEFIELD_DECORATIONS,
  BATTLEFIELD_STRUCTURES,
  axialToWorld,
  getBattlefieldCell,
  hexDistance,
  worldToAxial,
} from "../../src/map/battlefield";
import { BATTLEFIELD_DEPLOYMENTS } from "../../src/scenarios/battlefieldScenario";
import { findHexPath } from "../../src/game/navigation";

describe("battlefield island", () => {
  it("contains unique cells, three land elevations, and two separated water basins", () => {
    const keys = BATTLEFIELD_MAP.cells.map((cell) => `${cell.q},${cell.r}`);
    const landHeights = new Set(
      BATTLEFIELD_MAP.cells.filter((cell) => cell.walkable).map((cell) => cell.height),
    );
    const waterSides = new Set(
      BATTLEFIELD_MAP.cells
        .filter((cell) => cell.surface === "water")
        .map((cell) => Math.sign(cell.q)),
    );

    expect(new Set(keys).size).toBe(keys.length);
    expect(landHeights.size).toBeGreaterThanOrEqual(3);
    expect(waterSides).toEqual(new Set([-1, 1]));
  });

  it("keeps both camps connected to the central bridge without crossing blocked cells", () => {
    for (const camp of [BATTLEFIELD_MAP.verdantCamp, BATTLEFIELD_MAP.crimsonCamp]) {
      const path = findHexPath(BATTLEFIELD_MAP, camp, BATTLEFIELD_MAP.center);
      expect(path.length).toBeGreaterThan(1);
      expect(path.every((coordinate) => getBattlefieldCell(coordinate)?.walkable)).toBe(true);
    }
  });

  it("keeps a complete attack route from each camp to the enemy castle approach", () => {
    const routes = [
      [BATTLEFIELD_MAP.verdantCamp, BATTLEFIELD_MAP.castleApproaches.crimson],
      [BATTLEFIELD_MAP.crimsonCamp, BATTLEFIELD_MAP.castleApproaches.verdant],
    ] as const;
    for (const [start, goal] of routes) {
      const path = findHexPath(BATTLEFIELD_MAP, start, goal);
      expect(path.length).toBeGreaterThan(1);
      expect(path.every((coordinate) => getBattlefieldCell(coordinate)?.walkable)).toBe(true);
    }
  });

  it("marks every battlefield structure footprint as blocked terrain", () => {
    const functionalKinds = ["castle", "blacksmith", "barracks", "arrow-tower", "mine"];

    expect(BATTLEFIELD_STRUCTURES).toHaveLength(22);
    expect(BATTLEFIELD_STRUCTURES.map((structure) => String(structure.kind)))
      .not.toContain("siege-workshop");
    for (const faction of ["verdant", "crimson"] as const) {
      const factionStructures = BATTLEFIELD_STRUCTURES.filter(
        (structure) => structure.faction === faction,
      );
      expect(factionStructures.filter((structure) => functionalKinds.includes(structure.kind)))
        .toHaveLength(6);
      expect(factionStructures.filter((structure) => structure.kind.startsWith("wall-")))
        .toHaveLength(5);
      const factionDecorations = BATTLEFIELD_DECORATIONS.filter(
        (decoration) => decoration.faction === faction,
      );
      expect(factionDecorations.filter((decoration) => decoration.kind === "mining-cart"))
        .toHaveLength(1);
      expect(factionDecorations.filter((decoration) => decoration.kind === "ore-pile"))
        .toHaveLength(1);
      expect(BATTLEFIELD_DEPLOYMENTS[faction]).toHaveLength(6);
    }
    for (const structure of BATTLEFIELD_STRUCTURES) {
      for (const coordinate of structure.footprint) {
        expect(getBattlefieldCell(coordinate)?.walkable).toBe(false);
      }
    }
    expect(new Set(BATTLEFIELD_STRUCTURES.map((structure) => structure.footprint.length)))
      .toEqual(new Set([0, 1]));
  });

  it("closes each edge castle with a continuous seven-position half-ring", () => {
    for (const faction of ["verdant", "crimson"] as const) {
      const structures = BATTLEFIELD_STRUCTURES.filter(
        (structure) => structure.faction === faction,
      );
      const castle = structures.find((structure) => structure.kind === "castle");
      if (!castle) throw new Error(`Missing ${faction} castle.`);
      expect(castle.coordinate).toEqual(BATTLEFIELD_MAP.castles[faction]);
      expect(hexDistance(castle.coordinate, BATTLEFIELD_MAP.castleApproaches[faction])).toBe(1);
      expect(hexDistance(castle.coordinate, BATTLEFIELD_MAP.center)).toBe(BATTLEFIELD_MAP.radius);
      expect(hexDistance(castle.coordinate, BATTLEFIELD_MAP[`${faction}Camp`])).toBe(3);
      expect(getBattlefieldCell(BATTLEFIELD_MAP[`${faction}Camp`])?.walkable).toBe(true);
      const fortifications = structures.filter((structure) => (
        structure.kind.startsWith("wall-") || structure.kind === "arrow-tower"
      ));
      expect(fortifications).toHaveLength(7);
      expect(new Set(fortifications.map(({ coordinate }) => `${coordinate.q},${coordinate.r}`)).size)
        .toBe(7);
      const neighborCounts = fortifications.map((fortification) => (
        fortifications.filter((candidate) => (
          hexDistance(fortification.coordinate, candidate.coordinate) === 1
        )).length
      ));
      expect([...neighborCounts].sort()).toEqual([1, 1, 2, 2, 2, 2, 2]);
      const endpoints = fortifications.filter((_, index) => neighborCounts[index] === 1);
      expect(endpoints).toHaveLength(2);
      expect(endpoints.every((endpoint) => (
        hexDistance(endpoint.coordinate, BATTLEFIELD_MAP.center) === BATTLEFIELD_MAP.radius
      ))).toBe(true);
      const gate = structures.find((structure) => structure.kind === "wall-gate");
      expect(gate).toBeDefined();
      expect(getBattlefieldCell(gate!.coordinate)?.walkable).toBe(true);
      const interior = BATTLEFIELD_MAP.cells.find((cell) => (
        cell.walkable
        && hexDistance(cell, castle.coordinate) === 1
        && hexDistance(cell, gate!.coordinate) === 1
      ));
      expect(interior).toBeDefined();
      expect(findHexPath(BATTLEFIELD_MAP, interior!, BATTLEFIELD_MAP[`${faction}Camp`]))
        .toContainEqual(gate!.coordinate);
      const blacksmith = structures.find((candidate) => candidate.kind === "blacksmith");
      expect(hexDistance(castle.coordinate, blacksmith!.coordinate)).toBe(1);
      for (const kind of ["barracks", "mine"] as const) {
        const outerBuilding = structures.find((candidate) => candidate.kind === kind);
        expect(hexDistance(castle.coordinate, outerBuilding!.coordinate)).toBeGreaterThan(2);
      }
    }
  });

  it("aims every KayKit wall connector at its paired neighboring segment", () => {
    const localConnectors = {
      "wall-straight": [{ x: -1, z: 0 }, { x: 1, z: 0 }],
      "wall-gate": [{ x: -1, z: 0 }, { x: 1, z: 0 }],
      "wall-corner": [
        { x: -1, z: 0 },
        { x: 0.5, z: -Math.sqrt(3) / 2 },
      ],
    } as const;

    for (const faction of ["verdant", "crimson"] as const) {
      const fortifications = BATTLEFIELD_STRUCTURES.filter((structure) => (
        structure.faction === faction
        && (structure.kind.startsWith("wall-") || structure.kind === "arrow-tower")
      ));
      const wallSegments = fortifications.filter((structure) => structure.kind !== "arrow-tower");

      for (const segment of wallSegments) {
        const connectors = localConnectors[segment.kind as keyof typeof localConnectors];
        const segmentWorld = axialToWorld(segment.coordinate);
        const neighboringDirections = fortifications
          .filter((candidate) => hexDistance(segment.coordinate, candidate.coordinate) === 1)
          .map((candidate) => {
            const candidateWorld = axialToWorld(candidate.coordinate);
            return {
              x: (candidateWorld.x - segmentWorld.x) / 2,
              z: (candidateWorld.z - segmentWorld.z) / 2,
            };
          });

        for (const connector of connectors) {
          const cosine = Math.cos(segment.rotationY);
          const sine = Math.sin(segment.rotationY);
          const direction = {
            x: connector.x * cosine + connector.z * sine,
            z: -connector.x * sine + connector.z * cosine,
          };
          expect(neighboringDirections.some((neighbor) => (
            Math.hypot(neighbor.x - direction.x, neighbor.z - direction.z) < 0.001
          )), `${segment.id} has a dangling model connector`).toBe(true);
        }
      }
    }
  });

  it("links every mining cart to an explicit same-faction mine", () => {
    for (const decoration of BATTLEFIELD_DECORATIONS) {
      if (decoration.kind !== "mining-cart") continue;
      const target = BATTLEFIELD_STRUCTURES.find(
        (structure) => structure.id === decoration.targetStructureId,
      );
      expect(target).toMatchObject({ kind: "mine", faction: decoration.faction });
    }
  });

  it("round-trips battlefield hex centers through world coordinates", () => {
    for (const coordinate of [
      BATTLEFIELD_MAP.verdantCamp,
      BATTLEFIELD_MAP.center,
      BATTLEFIELD_MAP.crimsonCamp,
    ]) {
      expect(worldToAxial(axialToWorld(coordinate))).toEqual(coordinate);
    }
  });

  it("assigns fixed territories while keeping the river and bridge neutral", () => {
    const verdantCells = BATTLEFIELD_MAP.cells.filter((cell) => cell.territory === "verdant");
    const crimsonCells = BATTLEFIELD_MAP.cells.filter((cell) => cell.territory === "crimson");

    expect(verdantCells.length).toBeGreaterThan(0);
    expect(crimsonCells.length).toBe(verdantCells.length);
    expect(verdantCells.every((cell) => cell.r >= 2)).toBe(true);
    expect(crimsonCells.every((cell) => cell.r <= -2)).toBe(true);
    expect(BATTLEFIELD_MAP.cells.filter((cell) => Math.abs(cell.r) <= 1)
      .every((cell) => cell.territory === null)).toBe(true);
  });

  it("marks reserved routes, obstacles, bridges, and castle cells as unbuildable", () => {
    const reserved = BATTLEFIELD_MAP.cells.filter((cell) => cell.reservedForPath);
    expect(reserved.length).toBeGreaterThan(0);
    expect(reserved.every((cell) => !cell.buildable)).toBe(true);
    expect(BATTLEFIELD_MAP.cells.filter((cell) => (
      cell.surface === "water"
      || cell.surface === "bridge"
      || cell.surface === "forest"
      || cell.surface === "rock"
    )).every((cell) => !cell.buildable)).toBe(true);
    expect(getBattlefieldCell(BATTLEFIELD_MAP.castles.verdant)?.buildable).toBe(false);
    expect(getBattlefieldCell(BATTLEFIELD_MAP.castles.crimson)?.buildable).toBe(false);
  });

  it("derives the minimap world bounds from the battlefield cells", () => {
    const points = BATTLEFIELD_MAP.cells.map(axialToWorld);
    expect(BATTLEFIELD_WORLD_BOUNDS).toEqual({
      minX: Math.min(...points.map((point) => point.x)),
      maxX: Math.max(...points.map((point) => point.x)),
      minZ: Math.min(...points.map((point) => point.z)),
      maxZ: Math.max(...points.map((point) => point.z)),
    });
  });
});
