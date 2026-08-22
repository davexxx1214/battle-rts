import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const suspension = vi.hoisted(() => ({
  buildings: false,
  effects: false,
  grayboxBoundaryCells: null as number | null,
  grayboxMiningControllers: null as readonly (string | null)[] | null,
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
  SandboxGrayboxOverlay: ({ mining, plan }: {
    readonly mining: { readonly pitsById: Readonly<Record<string, { readonly controller: string | null }>> } | null;
    readonly plan: { readonly boundary: { readonly waterCells: readonly unknown[] } };
  }) => {
    suspension.grayboxBoundaryCells = plan.boundary.waterCells.length;
    suspension.grayboxMiningControllers = mining
      ? Object.values(mining.pitsById).map(({ controller }) => controller)
      : null;
    return "graybox-stable";
  },
}));

vi.mock("../../src/scene/terrain/OasisLayer", () => ({
  OasisLayer: () => "oasis-stable",
}));

vi.mock("../../src/scene/terrain/SandboxWildlifeLayer", () => ({
  SandboxWildlifeLayer: () => "wildlife-stable",
}));

vi.mock("../../src/scene/buildings/BattleBuildingLayer", () => ({
  BattleBuildingLayer: () => {
    if (suspension.buildings) throw suspension.pending;
    return "buildings-stable";
  },
  DeploymentBuildingGhost: () => "building-ghost-stable",
}));

vi.mock("../../src/scene/units/UnitModel", () => ({
  UnitModel: ({ selected }: { readonly selected: boolean }) => {
    if (suspension.unit) throw suspension.pending;
    return selected ? "unit-selected" : "unit-stable";
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
import type { SandboxBuildingConstructionPreview } from "../../src/game/sandboxBattleTransactions";
import { axialToWorld } from "../../src/map/battlefield";
import { SANDBOX_LARGE_BUILD_ANCHORS } from "../../src/map/sandboxLargeBattlefield";
import { createCameraViewStore } from "../../src/scene/camera/cameraViewStore";

describe("battlefield asset loading boundaries", () => {
  beforeEach(() => {
    suspension.buildings = false;
    suspension.effects = false;
    suspension.grayboxBoundaryCells = null;
    suspension.grayboxMiningControllers = null;
    suspension.statuses = false;
    suspension.unit = false;
  });

  it("keeps the terrain visible while the building layer loads a new asset", () => {
    suspension.buildings = true;

    expect(renderBattlefield()).toContain("terrain-stable");
  });

  it("keeps legacy terrain unchanged and adds sandbox markers over detailed terrain", () => {
    const legacy = renderBattlefield();
    expect(legacy).toContain("terrain-stable");
    expect(legacy).not.toContain("graybox-stable");
    expect(suspension.grayboxBoundaryCells).toBeNull();

    const sandbox = renderBattlefield(createBattleState([], { modeId: "sandbox" }));
    expect(suspension.grayboxBoundaryCells).toBeGreaterThan(0);
    expect(suspension.grayboxMiningControllers).toEqual([
      "verdant", "verdant", null, null, null, null, "crimson", "crimson",
    ]);
    expect(sandbox).toContain("graybox-stable");
    expect(sandbox).toContain("oasis-stable");
    expect(sandbox).toContain("wildlife-stable");
    expect(sandbox).toContain("terrain-stable");
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

  it("renders the snapped sandbox building ghost and its four production exits", () => {
    const battle = createBattleState([], { modeId: "sandbox" });
    const coordinate = SANDBOX_LARGE_BUILD_ANCHORS.verdant[0]!.coordinate;
    const position = axialToWorld(coordinate);
    const preview: SandboxBuildingConstructionPreview = {
      valid: true,
      reason: null,
      requestedPosition: position,
      position,
      coordinate,
      slot: "barracks",
    };

    const rendered = renderBattlefield(battle, preview);

    expect(rendered).toContain("sandbox-construction-preview");
    expect(rendered).toContain("building-ghost-stable");
    expect(rendered.match(/sandbox-production-exit-door/g)).toHaveLength(1);
    expect(rendered.match(/sandbox-production-exit-reserve/g)).toHaveLength(3);
  });

  it("renders independent-unit selection and the latest command marker", () => {
    const unit = createBattleUnit({
      id: "sandbox-selected-unit",
      squadId: "sandbox-selected-squad",
      faction: "verdant",
      role: "spearman",
      position: axialToWorld(SANDBOX_LARGE_BUILD_ANCHORS.verdant[0]!.coordinate),
    });
    const battle = createBattleState([unit], { modeId: "sandbox" });
    const rendered = renderToString(createElement(BattlefieldCanvas, {
      battle,
      bridgeRef: { current: createSceneInteractionBridge() },
      cameraResetToken: 0,
      cameraViewStore: createCameraViewStore(),
      deploymentPreview: null,
      selectedSquadIds: [battle.units[0]!.squadId],
      sandboxCommandMarker: {
        sequence: 1,
        kind: "move",
        position: unit.position,
      },
    }));

    expect(rendered).toContain("unit-selected");
    expect(rendered).toContain("sandbox-command-marker");
  });
});

function renderBattlefield(
  battle = createBattleState([
    createBattleUnit({
      faction: "verdant",
      id: "asset-loading-probe",
      position: { x: 0, z: 0 },
      role: "knight",
    }),
  ]),
  sandboxConstructionPreview: SandboxBuildingConstructionPreview | null = null,
): string {
  return renderToString(createElement(BattlefieldCanvas, {
    battle,
    bridgeRef: { current: createSceneInteractionBridge() },
    cameraResetToken: 0,
    cameraViewStore: createCameraViewStore(),
    deploymentPreview: null,
    sandboxConstructionPreview,
  }));
}
