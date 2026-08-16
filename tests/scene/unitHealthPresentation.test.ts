import { describe, expect, it } from "vitest";
import { Euler, Object3D, Quaternion } from "three";

import {
  faceHealthBarToCamera,
  shouldShowUnitHealthBar,
} from "../../src/scene/units/unitHealthPresentation";

describe("unit health presentation", () => {
  it("shows a health bar immediately after the first damage", () => {
    expect(shouldShowUnitHealthBar(229, 230)).toBe(true);
    expect(shouldShowUnitHealthBar(139, 140)).toBe(true);
    expect(shouldShowUnitHealthBar(230, 230)).toBe(false);
    expect(shouldShowUnitHealthBar(0, 230)).toBe(false);
  });

  it("cancels the unit parent rotation so the bar faces the camera", () => {
    const parent = new Object3D();
    parent.rotation.set(0, Math.PI * 0.72, 0);
    const healthBar = new Object3D();
    parent.add(healthBar);
    const camera = new Object3D();
    camera.quaternion.setFromEuler(new Euler(-0.62, 0.44, 0.08));

    faceHealthBarToCamera(
      healthBar,
      camera,
      new Quaternion(),
      new Quaternion(),
    );
    parent.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const actual = healthBar.getWorldQuaternion(new Quaternion());
    const expected = camera.getWorldQuaternion(new Quaternion());

    expect(actual.angleTo(expected)).toBeLessThan(1e-6);
  });
});
