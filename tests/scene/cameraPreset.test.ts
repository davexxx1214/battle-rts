import { describe, expect, it } from "vitest";

import { axialToWorld } from "../../src/map/battlefield";
import { SANDBOX_LARGE_BATTLEFIELD_DEFINITION } from "../../src/map/battlefieldDefinition";
import { mirrorBattlefieldCameraPreset } from "../../src/scene/camera/cameraPreset";

describe("battlefield camera presets", () => {
  it("mirrors an enemy-side preset through the map center without mutating the player preset", () => {
    const definition = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
    const player = definition.cameraPreset;
    const playerTarget = { ...player.initialTarget };
    const enemy = mirrorBattlefieldCameraPreset(
      player,
      axialToWorld(definition.map.center),
    );
    const expectedEnemyTarget = axialToWorld({ q: 7, r: -14 });

    expect(player.initialTarget).toEqual(playerTarget);
    expect(enemy).not.toBe(player);
    expect(enemy.initialTarget).toEqual(expectedEnemyTarget);
    expect(enemy.initialPosition).toEqual([-34, 38, -49]);
    expect(Math.abs(angleDelta(enemy.desktopYaw, player.desktopYaw))).toBeCloseTo(Math.PI, 10);
    expect(Math.abs(angleDelta(enemy.portraitYaw, player.portraitYaw))).toBeCloseTo(Math.PI, 10);
    expect(enemy.startZoom).toBe(32);
    expect(enemy.maximumZoom).toBe(56);
    expect(Object.isFrozen(enemy)).toBe(true);
    expect(Object.isFrozen(enemy.initialTarget)).toBe(true);
  });
});

function angleDelta(first: number, second: number): number {
  return Math.atan2(Math.sin(first - second), Math.cos(first - second));
}
