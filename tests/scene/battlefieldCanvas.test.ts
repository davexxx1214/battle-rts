import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const suspension = vi.hoisted(() => ({
  buildings: false,
  effects: false,
  pending: new Promise<never>(() => undefined),
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
    suspension.unit = false;
  });

  it("keeps the terrain visible while the building layer loads a new asset", () => {
    suspension.buildings = true;

    expect(renderBattlefield()).toContain("terrain-stable");
  });

  it("keeps the existing battlefield visible while a new unit asset loads", () => {
    suspension.unit = true;
    const rendered = renderBattlefield();

    expect(rendered).toContain("terrain-stable");
    expect(rendered).toContain("buildings-stable");
    expect(rendered).toContain("effects-stable");
    expect(rendered).not.toContain("unit-stable");
  });

  it("keeps the terrain and buildings visible while battle effects load", () => {
    suspension.effects = true;
    const rendered = renderBattlefield();

    expect(rendered).toContain("terrain-stable");
    expect(rendered).toContain("buildings-stable");
    expect(rendered).not.toContain("effects-stable");
  });
});

function renderBattlefield(): string {
  const battle = createBattleState([
    createBattleUnit({
      faction: "verdant",
      id: "asset-loading-probe",
      position: { x: 0, z: 0 },
      role: "knight",
    }),
  ]);
  return renderToString(createElement(BattlefieldCanvas, {
    battle,
    bridgeRef: { current: createSceneInteractionBridge() },
    cameraResetToken: 0,
    cameraViewStore: createCameraViewStore(),
    deploymentPreview: null,
  }));
}
