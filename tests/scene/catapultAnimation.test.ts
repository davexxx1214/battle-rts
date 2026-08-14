import { describe, expect, it } from "vitest";

import {
  CATAPULT_LOADED_ARM_ROTATION,
  catapultMotionPose,
  operatorAnimationForStatus,
  wheelRotationForTravel,
} from "../../src/scene/units/catapultAnimation";

describe("catapult presentation animation", () => {
  it("throws rapidly after firing, recoils, and returns to its loaded pose", () => {
    const loaded = catapultMotionPose();
    const released = catapultMotionPose(0.18);
    const reloaded = catapultMotionPose(3.6);

    expect(loaded.armRotation).toBeCloseTo(CATAPULT_LOADED_ARM_ROTATION);
    expect(released.armRotation).toBeGreaterThan(0.5);
    expect(Math.abs(released.carriageRock)).toBeGreaterThan(0.01);
    expect(reloaded.armRotation).toBeCloseTo(CATAPULT_LOADED_ARM_ROTATION);
  });

  it("turns wheels from measured travel instead of a nominal movement status", () => {
    expect(wheelRotationForTravel(0.62)).toBeCloseTo(2);
    expect(wheelRotationForTravel(0)).toBe(0);
    expect(wheelRotationForTravel(Number.NaN)).toBe(0);
  });

  it("selects operator clips that match movement, loading, and idle states", () => {
    expect(operatorAnimationForStatus("moving")).toBe("Walking_A");
    expect(operatorAnimationForStatus("attacking")).toBe("Working_B");
    expect(operatorAnimationForStatus("idle")).toBe("Idle_A");
    expect(operatorAnimationForStatus("dead")).toBe("Death_A");
  });
});
