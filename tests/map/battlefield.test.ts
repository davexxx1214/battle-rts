import { describe, expect, it } from "vitest";

import {
  BATTLEFIELD_BATTLE_STRUCTURES,
  BATTLEFIELD_STATIC_STRUCTURES,
  BATTLEFIELD_MAP,
  BATTLEFIELD_WORLD_BOUNDS,
  BATTLEFIELD_DECORATIONS,
  BATTLEFIELD_STRUCTURES,
  axialToWorld,
  getBattlefieldCell,
  hexDistance,
  worldToAxial,
} from "../../src/map/battlefield";
import { findHexPath } from "../../src/game/navigation";

describe("battlefield island", () => {
  it("contains unique cells, three land elevations, and a continuous river with two bridges", () => {
    const keys = BATTLEFIELD_MAP.cells.map((cell) => `${cell.q},${cell.r}`);
    const landHeights = new Set(
      BATTLEFIELD_MAP.cells.filter((cell) => cell.walkable).map((cell) => cell.height),
    );
    const river = BATTLEFIELD_MAP.cells.filter((cell) => Math.abs(cell.r) <= 1);
    const bridgeKeys = new Set(BATTLEFIELD_MAP.bridges.flatMap((bridge) => (
      bridge.cells.map((cell) => `${cell.q},${cell.r}`)
    )));

    expect(new Set(keys).size).toBe(keys.length);
    expect(landHeights.size).toBeGreaterThanOrEqual(3);
    expect(BATTLEFIELD_MAP.bridges).toHaveLength(2);
    expect(BATTLEFIELD_MAP.bridges.map((bridge) => bridge.center)).toEqual([
      { q: -2, r: 0 },
      { q: 2, r: 0 },
    ]);
    expect(BATTLEFIELD_MAP.bridges.map((bridge) => bridge.cells)).toEqual([
      [
        { q: -2, r: -1 },
        { q: -2, r: 0 },
        { q: -2, r: 1 },
        { q: -1, r: -1 },
        { q: -1, r: 0 },
        { q: -1, r: 1 },
      ],
      [
        { q: 2, r: 1 },
        { q: 2, r: 0 },
        { q: 2, r: -1 },
        { q: 1, r: 1 },
        { q: 1, r: 0 },
        { q: 1, r: -1 },
      ],
    ]);
    expect(BATTLEFIELD_MAP.bridges.map((bridge) => bridge.landings)).toEqual([
      {
        verdant: [{ q: -2, r: 2 }, { q: -1, r: 2 }],
        crimson: [{ q: -2, r: -2 }, { q: -1, r: -2 }],
      },
      {
        verdant: [{ q: 2, r: 2 }, { q: 1, r: 2 }],
        crimson: [{ q: 2, r: -2 }, { q: 1, r: -2 }],
      },
    ]);
    expect(bridgeKeys.size).toBe(12);
    expect(river.every((cell) => (
      bridgeKeys.has(`${cell.q},${cell.r}`)
        ? cell.surface === "bridge" && cell.height === 0.36 && cell.walkable
        : cell.surface === "water" && !cell.walkable
    ))).toBe(true);
    expect(BATTLEFIELD_MAP.cells.filter((cell) => (
      Math.abs(cell.r) <= 1 && cell.q >= -1 && cell.q <= 1
    )).filter((cell) => cell.surface === "water").map((cell) => `${cell.q},${cell.r}`))
      .toEqual(["0,-1", "0,0", "0,1"]);
  });

  it("keeps both camps connected through each bridge without crossing blocked cells", () => {
    for (const bridge of BATTLEFIELD_MAP.bridges) {
      const crossing = findHexPath(
        BATTLEFIELD_MAP,
        bridge.landings.verdant[0],
        bridge.landings.crimson[0],
      );
      const bridgeKeys = new Set(bridge.cells.map((cell) => `${cell.q},${cell.r}`));
      expect(crossing[0]).toEqual(bridge.landings.verdant[0]);
      expect(crossing.at(-1)).toEqual(bridge.landings.crimson[0]);
      expect(crossing.slice(1, -1).every((cell) => bridgeKeys.has(`${cell.q},${cell.r}`)))
        .toBe(true);
      for (const camp of [BATTLEFIELD_MAP.verdantCamp, BATTLEFIELD_MAP.crimsonCamp]) {
        const path = findHexPath(BATTLEFIELD_MAP, camp, bridge.center);
        expect(path.length).toBeGreaterThan(1);
        expect(path.every((coordinate) => getBattlefieldCell(coordinate)?.walkable)).toBe(true);
      }
    }
  });

  it("forces every complete attack route to cross one of the two bridges", () => {
    const bridgeKeys = new Set(BATTLEFIELD_MAP.bridges.flatMap((bridge) => (
      bridge.cells.map((cell) => `${cell.q},${cell.r}`)
    )));
    for (const [start, goal] of [
      [BATTLEFIELD_MAP.verdantCamp, BATTLEFIELD_MAP.castleApproaches.crimson],
      [BATTLEFIELD_MAP.crimsonCamp, BATTLEFIELD_MAP.castleApproaches.verdant],
    ] as const) {
      const path = findHexPath(BATTLEFIELD_MAP, start, goal);
      expect(path.length).toBeGreaterThan(1);
      expect(path.every((coordinate) => getBattlefieldCell(coordinate)?.walkable)).toBe(true);
      expect(path.some((coordinate) => bridgeKeys.has(`${coordinate.q},${coordinate.r}`)))
        .toBe(true);
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

  it("blocks permanent structures while keeping destructible tower ruins traversable", () => {
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
      expect(factionStructures.some((structure) => structure.kind === "blacksmith"))
        .toBe(true);
      expect(factionStructures.filter((structure) => structure.kind.startsWith("wall-")))
        .toHaveLength(5);
      const factionDecorations = BATTLEFIELD_DECORATIONS.filter(
        (decoration) => decoration.faction === faction,
      );
      expect(factionDecorations.filter((decoration) => decoration.kind === "mining-cart"))
        .toHaveLength(0);
      expect(factionDecorations.filter((decoration) => decoration.kind === "ore-pile"))
        .toHaveLength(0);
    }
    for (const structure of BATTLEFIELD_STATIC_STRUCTURES.concat(
      BATTLEFIELD_BATTLE_STRUCTURES.filter((candidate) => candidate.kind === "castle"),
    )) {
      for (const coordinate of structure.footprint) {
        expect(getBattlefieldCell(coordinate)?.walkable).toBe(false);
      }
    }
    for (const tower of BATTLEFIELD_BATTLE_STRUCTURES.filter(
      (structure) => structure.kind === "arrow-tower",
    )) {
      expect(getBattlefieldCell(tower.coordinate)).toMatchObject({
        walkable: true,
        buildable: false,
      });
    }
    expect(new Set(BATTLEFIELD_STRUCTURES.map((structure) => structure.footprint.length)))
      .toEqual(new Set([0, 1]));
  });

  it("separates battle-managed castles and arrow towers from static map props", () => {
    expect(BATTLEFIELD_BATTLE_STRUCTURES.map((structure) => structure.kind).sort())
      .toEqual([
        "arrow-tower",
        "arrow-tower",
        "arrow-tower",
        "arrow-tower",
        "castle",
        "castle",
      ]);
    expect(BATTLEFIELD_STATIC_STRUCTURES.every((structure) => (
      structure.kind !== "castle" && structure.kind !== "arrow-tower"
    ))).toBe(true);
    expect(BATTLEFIELD_BATTLE_STRUCTURES.length + BATTLEFIELD_STATIC_STRUCTURES.length)
      .toBe(BATTLEFIELD_STRUCTURES.length);
  });

  it("frames each castle with a five-piece wall and two symmetric front towers", () => {
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
      const walls = structures.filter((structure) => structure.kind.startsWith("wall-"));
      const towers = structures.filter((structure) => structure.kind === "arrow-tower");
      expect(walls).toHaveLength(5);
      expect(towers).toHaveLength(2);
      expect([...walls.map((wall) => (
        walls.filter((candidate) => hexDistance(wall.coordinate, candidate.coordinate) === 1)
          .length
      ))].sort()).toEqual([1, 1, 2, 2, 2]);

      const mirror = faction === "verdant" ? 1 : -1;
      expect(towers.map(({ coordinate }) => coordinate)).toEqual([
        { q: -4 * mirror, r: 6 * mirror },
        { q: -1 * mirror, r: 6 * mirror },
      ]);
      expect(hexDistance(towers[0]!.coordinate, towers[1]!.coordinate)).toBe(3);
      const castleWorld = axialToWorld(castle.coordinate);
      const towerWorld = towers.map(({ coordinate }) => axialToWorld(coordinate));
      expect((towerWorld[0]!.x + towerWorld[1]!.x) / 2).toBe(castleWorld.x);
      expect(towerWorld[0]!.z).toBe(towerWorld[1]!.z);
      expect(towers.every((tower) => (
        hexDistance(tower.coordinate, BATTLEFIELD_MAP.center)
          < hexDistance(castle.coordinate, BATTLEFIELD_MAP.center)
      ))).toBe(true);

      const gate = structures.find((structure) => structure.kind === "wall-gate");
      expect(gate).toBeDefined();
      expect(getBattlefieldCell(gate!.coordinate)?.walkable).toBe(true);
      for (const coordinate of [
        castle.coordinate,
        BATTLEFIELD_MAP.castleApproaches[faction],
        ...walls.map(({ coordinate }) => coordinate),
        ...towers.map(({ coordinate }) => coordinate),
      ]) {
        expect(getBattlefieldCell(coordinate)).toMatchObject({
          height: 0.72,
          surface: "camp",
        });
      }
      const interior = BATTLEFIELD_MAP.cells.find((cell) => (
        cell.walkable
        && hexDistance(cell, castle.coordinate) === 1
        && hexDistance(cell, gate!.coordinate) === 1
      ));
      expect(interior).toBeDefined();
      expect(findHexPath(BATTLEFIELD_MAP, interior!, BATTLEFIELD_MAP[`${faction}Camp`]))
        .toContainEqual(gate!.coordinate);
      const mines = structures.filter((candidate) => candidate.kind === "mine");
      expect(mines).toHaveLength(2);
      expect(mines.every((mine) => (
        hexDistance(castle.coordinate, mine.coordinate) > 2
      ))).toBe(true);
    }
  });

  it("aims a KayKit wall connector at every neighboring wall segment", () => {
    const localConnectors = {
      "wall-straight": [{ x: -1, z: 0 }, { x: 1, z: 0 }],
      "wall-gate": [{ x: -1, z: 0 }, { x: 1, z: 0 }],
      "wall-corner": [
        { x: -1, z: 0 },
        { x: 0.5, z: -Math.sqrt(3) / 2 },
      ],
    } as const;

    for (const faction of ["verdant", "crimson"] as const) {
      const wallSegments = BATTLEFIELD_STRUCTURES.filter((structure) => (
        structure.faction === faction && structure.kind.startsWith("wall-")
      ));

      for (const segment of wallSegments) {
        const connectors = localConnectors[segment.kind as keyof typeof localConnectors];
        const segmentWorld = axialToWorld(segment.coordinate);
        const neighboringDirections = wallSegments
          .filter((candidate) => hexDistance(segment.coordinate, candidate.coordinate) === 1)
          .map((candidate) => {
            const candidateWorld = axialToWorld(candidate.coordinate);
            return {
              x: (candidateWorld.x - segmentWorld.x) / 2,
              z: (candidateWorld.z - segmentWorld.z) / 2,
            };
          });

        const cosine = Math.cos(segment.rotationY);
        const sine = Math.sin(segment.rotationY);
        const connectorDirections = connectors.map((connector) => ({
          x: connector.x * cosine + connector.z * sine,
          z: -connector.x * sine + connector.z * cosine,
        }));
        for (const neighbor of neighboringDirections) {
          expect(connectorDirections.some((direction) => (
            Math.hypot(neighbor.x - direction.x, neighbor.z - direction.z) < 0.001
          )), `${segment.id} misses a neighboring wall connector`).toBe(true);
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

  it("assigns mirrored territories while keeping the trimmed edges and river neutral", () => {
    const verdantCells = BATTLEFIELD_MAP.cells.filter((cell) => cell.territory === "verdant");
    const crimsonCells = BATTLEFIELD_MAP.cells.filter((cell) => cell.territory === "crimson");

    expect(verdantCells.length).toBeGreaterThan(0);
    expect(verdantCells).toHaveLength(84);
    expect(crimsonCells).toHaveLength(84);
    expect(verdantCells.every((cell) => cell.r >= 2)).toBe(true);
    expect(crimsonCells.every((cell) => cell.r <= -2)).toBe(true);
    expect(BATTLEFIELD_MAP.cells.filter((cell) => Math.abs(cell.r) <= 1)
      .every((cell) => cell.territory === null)).toBe(true);
  });

  it("keeps the human and undead movement topology exactly mirrored", () => {
    for (const cell of BATTLEFIELD_MAP.cells.filter(({ r }) => r < 0)) {
      const mirrored = getBattlefieldCell({ q: -cell.q, r: -cell.r });
      expect(mirrored, `missing mirror for ${cell.q},${cell.r}`).toBeDefined();
      expect(mirrored).toMatchObject({
        buildable: cell.buildable,
        reservedForPath: cell.reservedForPath,
        surface: cell.surface,
        walkable: cell.walkable,
      });
    }
  });

  it("keeps friendly reserved routes buildable while obstacles remain unbuildable", () => {
    const reserved = BATTLEFIELD_MAP.cells.filter((cell) => cell.reservedForPath);
    const structureReservedKeys = new Set(BATTLEFIELD_STRUCTURES.flatMap((structure) => [
      ...structure.footprint.map((coordinate) => `${coordinate.q},${coordinate.r}`),
      ...(structure.kind === "wall-gate"
        ? [`${structure.coordinate.q},${structure.coordinate.r}`]
        : []),
    ]));
    expect(reserved.length).toBeGreaterThan(0);
    const friendlyReservedLand = reserved.filter((cell) => (
      cell.territory !== null && cell.walkable && cell.surface !== "bridge"
      && !structureReservedKeys.has(`${cell.q},${cell.r}`)
    ));
    expect(friendlyReservedLand.length).toBeGreaterThan(0);
    expect(friendlyReservedLand.every((cell) => cell.buildable)).toBe(true);
    expect(BATTLEFIELD_MAP.cells.filter((cell) => (
      cell.surface === "water"
      || cell.surface === "bridge"
      || cell.surface === "forest"
      || cell.surface === "rock"
    )).every((cell) => !cell.buildable)).toBe(true);
    expect(getBattlefieldCell(BATTLEFIELD_MAP.castles.verdant)?.buildable).toBe(false);
    expect(getBattlefieldCell(BATTLEFIELD_MAP.castles.crimson)?.buildable).toBe(false);
  });

  it("keeps both castle gate openings walkable but unbuildable", () => {
    const gates = BATTLEFIELD_STRUCTURES.filter((structure) => structure.kind === "wall-gate");

    expect(gates).toHaveLength(2);
    for (const gate of gates) {
      expect(getBattlefieldCell(gate.coordinate)).toMatchObject({
        territory: gate.faction,
        walkable: true,
        buildable: false,
      });
    }
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
