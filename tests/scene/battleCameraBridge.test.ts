import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { OrthographicCamera } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cameraHarness = vi.hoisted(() => ({
  camera: null as unknown,
  definition: null as unknown,
  frame: null as null | ((state: unknown, delta: number) => void),
}));

vi.mock("@react-three/fiber", () => ({
  useFrame: (callback: (state: unknown, delta: number) => void) => {
    cameraHarness.frame = callback;
  },
  useThree: () => ({
    camera: cameraHarness.camera,
    size: { width: 1280, height: 720 },
  }),
}));

vi.mock("../../src/scene/battlefieldSceneContext", () => ({
  useBattlefieldDefinition: () => cameraHarness.definition,
}));

import { SANDBOX_LARGE_BATTLEFIELD_DEFINITION } from "../../src/map/battlefieldDefinition";
import { BattleCamera } from "../../src/scene/camera/BattleCamera";
import { createSceneInteractionBridge } from "../../src/scene/sceneInteractionBridge";

describe("BattleCamera scene bridge", () => {
  beforeEach(() => {
    cameraHarness.camera = new OrthographicCamera(-640, 640, 360, -360, 0.1, 220);
    cameraHarness.definition = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
    cameraHarness.frame = null;
  });

  it("owns bridge zoom commands and clamps them to the active map overview", () => {
    const bridge = createSceneInteractionBridge();
    const camera = cameraHarness.camera as OrthographicCamera;
    camera.zoom = 32;
    renderBattleCamera(bridge);
    runFrame(0);

    bridge.zoomByFactor(0.01);

    expect(camera.zoom).toBeCloseTo(14.61860365, 7);
  });

  it("accepts centerOn commands and keeps the resulting view inside active bounds", () => {
    const bridge = createSceneInteractionBridge();
    const views: Array<{ readonly center: { readonly x: number; readonly z: number } }> = [];
    const camera = cameraHarness.camera as OrthographicCamera;
    camera.zoom = 56;
    renderBattleCamera(bridge, (view) => views.push(view));
    runFrame(0);

    bridge.centerOn({ x: 1_000, z: -1_000 });
    runFrame(0.1);

    const center = views.at(-1)?.center;
    const bounds = SANDBOX_LARGE_BATTLEFIELD_DEFINITION.worldBounds;
    expect(center).toBeDefined();
    expect(center!.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(center!.x).toBeLessThanOrEqual(bounds.maxX);
    expect(center!.z).toBeGreaterThanOrEqual(bounds.minZ);
    expect(center!.z).toBeLessThanOrEqual(bounds.maxZ);
  });
});

function renderBattleCamera(
  bridge: ReturnType<typeof createSceneInteractionBridge>,
  onViewChange?: (view: {
    readonly center: { readonly x: number; readonly z: number };
    readonly width: number;
    readonly height: number;
    readonly yaw: number;
  }) => void,
): void {
  renderToString(createElement(BattleCamera, {
    bridgeRef: { current: bridge },
    onViewChange,
    resetToken: 0,
    shake: null,
  }));
}

function runFrame(delta: number): void {
  expect(cameraHarness.frame).not.toBeNull();
  cameraHarness.frame!({}, delta);
}
