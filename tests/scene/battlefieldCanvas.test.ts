import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const suspension = vi.hoisted(() => ({
  buildings: false,
  effects: false,
  grayboxBoundaryCells: null as number | null,
  pending: new Promise<never>(() => undefined),
  statuses: false,
  unit: false,
}));

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { readonly children: ReactNode }) => children,
  useFrame: () => undefined,
  useThree: () => ({ camera: {}, size: { height: 720, width: 1280 } }),
}));

vi.mock("../../src/scene/camera/BattleCamera", () => ({
  BattleCamera: () => null,
}));

vi.mock("../../src/scene/terrain/BattlefieldTerrain", () => ({
  BattlefieldTerrain: () => "terrain-stable",
}));

vi.mock("../../src/scene/terrain/SandboxGrayboxOverlay", () => ({
  SandboxGrayboxOverlay: ({ plan }: {
    readonly plan: { readonly boundary: { readonly waterCells: readonly unknown[] } };
  }) => {
    suspension.grayboxBoundaryCells = plan.boundary.waterCells.length;
    return "graybox-stable";
  },
}));

vi.mock("../../src/scene/buildings/BattleBuildingLayer", () => ({
  BattleBuildingLayer: () => {
    if (suspension.buildings) throw suspension.pending;
    return "buildings-stable";
  },
}));

vi.mock("../../src/scene/units/UnitModel", () => ({
  UnitModel: () => {
    if (suspension.unit) throw suspension.pending;
    return "unit-stable";
  },
}));

vi.mock("../../src/scene/effects/BattleEffects", () => ({
  BattleEffects: () => {
    if (suspension.effects) throw suspension.pending;
    return "effects-stable";
  },
}));

vi.mock("../../src/scene/effects/UnitStatusEffectLayer", () => ({
  UnitStatusEffectLayer: () => {
    if (suspension.statuses) throw suspension.pending;
    return "statuses-stable";
  },
}));

import {
  BattlefieldCanvas,
  createSceneInteractionBridge,
} from "../../src/scene/BattlefieldCanvas";
import { createBattleState, createBattleUnit } from "../../src/game/battle";
import { createCameraViewStore } from "../../src/scene/camera/cameraViewStore";

describe("battlefield asset loading boundaries", () => {
  beforeEach(() => {
    suspension.buildings = false;
    suspension.effects = false;
    suspension.grayboxBoundaryCells = null;
    suspension.statuses = false;
    suspension.unit = false;
  });

  it("keeps the terrain visible while the building layer loads a new asset", () => {
    suspension.buildings = true;

    expect(renderBattlefield()).toContain("terrain-stable");
  });

  it("keeps legacy terrain unchanged and mounts the graybox only for the sandbox map", () => {
    const legacy = renderBattlefield();
    expect(legacy).toContain("terrain-stable");
    expect(legacy).not.toContain("graybox-stable");
    expect(suspension.grayboxBoundaryCells).toBeNull();

    const sandbox = renderBattlefield(createBattleState([], { modeId: "sandbox" }));
    expect(suspension.grayboxBoundaryCells).toBeGreaterThan(0);
    expect(sandbox).toContain("graybox-stable");
    expect(sandbox).not.toContain("terrain-stable");
  });

  it("keeps the existing battlefield visible while a new unit asset loads", () => {
    suspension.unit = true;
    const rendered = renderBattlefield();

    expect(rendered).toContain("terrain-stable");
    expect(rendered).toContain("buildings-stable");
    expect(rendered).toContain("effects-stable");
    expect(rendered).toContain("statuses-stable");
    expect(rendered).not.toContain("unit-stable");
  });

  it("keeps the terrain and buildings visible while battle effects load", () => {
    suspension.effects = true;
    const rendered = renderBattlefield();

    expect(rendered).toContain("terrain-stable");
    expect(rendered).toContain("buildings-stable");
    expect(rendered).not.toContain("effects-stable");
  });

  it("keeps the terrain and units visible while status-effect textures load", () => {
    suspension.statuses = true;
    const rendered = renderBattlefield();

    expect(rendered).toContain("terrain-stable");
    expect(rendered).toContain("buildings-stable");
    expect(rendered).toContain("unit-stable");
    expect(rendered).toContain("effects-stable");
    expect(rendered).not.toContain("statuses-stable");
  });
});

function renderBattlefield(battle = createBattleState([
    createBattleUnit({
      faction: "verdant",
      id: "asset-loading-probe",
      position: { x: 0, z: 0 },
      role: "knight",
    }),
  ])): string {
  return renderToString(createElement(BattlefieldCanvas, {
    battle,
    bridgeRef: { current: createSceneInteractionBridge() },
    cameraResetToken: 0,
    cameraViewStore: createCameraViewStore(),
    deploymentPreview: null,
  }));
}
