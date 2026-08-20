import { describe, expect, it } from "vitest";

import { createSceneInteractionBridge } from "../../src/scene/sceneInteractionBridge";

describe("scene interaction bridge", () => {
  it("exposes a safe camera-center command before the scene mounts", () => {
    const bridge = createSceneInteractionBridge();

    expect(() => bridge.centerOn({ x: 4, z: -7 })).not.toThrow();
    expect(bridge.screenToWorld(0, 0)).toBeNull();
  });
});
