import { describe, expect, it } from "vitest";

import {
  createInitialBattle,
  stepBattle,
  type BattleState,
} from "../../src/game/battle";
import {
  battleModeDefinitionFor,
  type BattleModeId,
} from "../../src/game/battleMode";
import { resolveBattleRuntimeContext } from "../../src/game/battleRuntime";
import {
  battlefieldDefinitionFor,
  LEGACY_BATTLEFIELD_DEFINITION,
} from "../../src/map/battlefieldDefinition";

describe("battle definition integration", () => {
  it("defaults battle state to normal mode on the legacy battlefield", () => {
    const state = createInitialBattle();
    const runtime = resolveBattleRuntimeContext(state);

    expect(state).toMatchObject({ modeId: "normal", mapId: "legacy-v1" });
    expect(runtime.mode).toBe(battleModeDefinitionFor("normal"));
    expect(runtime.battlefield).toBe(LEGACY_BATTLEFIELD_DEFINITION);
    expect(runtime.map).toBe(LEGACY_BATTLEFIELD_DEFINITION.map);
  });

  it("preserves identifiers through simulation and JSON without serializing runtime definitions", () => {
    const stepped = stepBattle(createInitialBattle({ modeId: "sandbox" }), 0.1);
    const restored = JSON.parse(JSON.stringify(stepped)) as BattleState;

    expect(stepped).toMatchObject({ modeId: "sandbox", mapId: "legacy-v1" });
    expect(restored).toMatchObject({ modeId: "sandbox", mapId: "legacy-v1" });
    expect(Object.keys(restored)).not.toContain("mode");
    expect(Object.keys(restored)).not.toContain("map");
    expect(Object.keys(restored)).not.toContain("runtime");
    expect(Object.keys(restored)).not.toContain("battlefield");
    expect(Object.keys(restored)).not.toContain("definition");

    const runtime = resolveBattleRuntimeContext(restored);
    expect(runtime.mode).toBe(battleModeDefinitionFor("sandbox"));
    expect(runtime.battlefield).toBe(battlefieldDefinitionFor("legacy-v1"));
  });

  it("fails fast when creation or runtime restoration receives an unknown id", () => {
    expect(() => createInitialBattle({
      modeId: "missing-mode" as BattleModeId,
    })).toThrow("Unknown battle mode: missing-mode");
    expect(() => createInitialBattle({
      mapId: "missing-map",
    })).toThrow("Unknown battlefield definition: missing-map");
    expect(() => resolveBattleRuntimeContext({
      modeId: "missing-mode" as BattleModeId,
      mapId: "legacy-v1",
    })).toThrow("Unknown battle mode: missing-mode");
    expect(() => resolveBattleRuntimeContext({
      modeId: "normal",
      mapId: "missing-map",
    })).toThrow("Unknown battlefield definition: missing-map");
  });
});
