import { describe, expect, it } from "vitest";

import { createFactionRaces } from "../../src/game/factions";
import {
  BATTLEFIELD_MAP,
  BATTLEFIELD_STRUCTURES,
} from "../../src/map/battlefield";
import { BATTLEFIELD_SCENERY } from "../../src/map/battlefieldScenery";
import {
  FACTION_MAP_MODULES,
  assembleModularBattlefield,
  fromCrimsonModuleCoordinate,
  fromCrimsonModuleOffset,
  mapModuleForFaction,
} from "../../src/map/factionMapModules";
import { sceneryVisibleForMode } from "../../src/scene/terrain/BattlefieldTerrain";

describe("modular faction map slots", () => {
  it.each([
    ["human", "human"],
    ["human", "undead"],
    ["undead", "human"],
    ["undead", "undead"],
  ] as const)("mounts %s versus %s without changing the shared connector", (
    verdant,
    crimson,
  ) => {
    const races = createFactionRaces({ verdant, crimson });
    const assembly = assembleModularBattlefield(
      races,
      BATTLEFIELD_MAP.cells,
      BATTLEFIELD_STRUCTURES,
      BATTLEFIELD_SCENERY,
    );

    expect(assembly.sharedCells).toEqual(
      BATTLEFIELD_MAP.cells.filter((cell) => cell.territory === null),
    );
    expect(assembly.sharedCells.every((cell) => Math.abs(cell.r) <= 1)).toBe(true);
    expect(assembly.factions.verdant.definition).toBe(FACTION_MAP_MODULES[verdant]);
    expect(assembly.factions.crimson.definition).toBe(FACTION_MAP_MODULES[crimson]);
    expect(assembly.factions.verdant.cells.every((cell) => cell.territory === "verdant"))
      .toBe(true);
    expect(assembly.factions.crimson.cells.every((cell) => cell.territory === "crimson"))
      .toBe(true);
    expect(
      assembly.sharedCells.length
      + assembly.factions.verdant.cells.length
      + assembly.factions.crimson.cells.length,
    ).toBe(BATTLEFIELD_MAP.cells.length);
  });

  it("uses one crimson-authored module reference frame for either side", () => {
    expect(fromCrimsonModuleCoordinate({ q: -2, r: -5 }, "crimson"))
      .toEqual({ q: -2, r: -5 });
    expect(fromCrimsonModuleCoordinate({ q: -2, r: -5 }, "verdant"))
      .toEqual({ q: 2, r: 5 });
    expect(fromCrimsonModuleOffset([0.4, -0.2], "verdant"))
      .toEqual([-0.4, 0.2]);
  });

  it("lets either mounted undead module replace only its own human scenery", () => {
    const ships = BATTLEFIELD_SCENERY.filter((item) => item.kind === "bay-ship");
    const verdantShip = ships.find((item) => item.faction === "verdant")!;
    const crimsonShip = ships.find((item) => item.faction === "crimson")!;
    const verdantUndead = createFactionRaces({ verdant: "undead", crimson: "human" });
    const crimsonUndead = createFactionRaces({ verdant: "human", crimson: "undead" });

    expect(sceneryVisibleForMode(verdantShip, verdantUndead)).toBe(false);
    expect(sceneryVisibleForMode(crimsonShip, verdantUndead)).toBe(true);
    expect(sceneryVisibleForMode(verdantShip, crimsonUndead)).toBe(true);
    expect(sceneryVisibleForMode(crimsonShip, crimsonUndead)).toBe(false);
    expect(mapModuleForFaction(verdantUndead, "verdant").sceneryTreatment)
      .toBe("cemetery");
  });
});
