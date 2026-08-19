import { describe, expect, it } from "vitest";

import {
  BATTLEFIELD_CLOUDS,
} from "../../src/map/battlefieldAtmosphere";
import { axialToWorld, getBattlefieldCell } from "../../src/map/battlefield";
import {
  BATTLEFIELD_SCENERY_KINDS,
  BLOCKING_SCENERY_KINDS,
} from "../../src/map/battlefieldScenery";
import { BATTLEFIELD_CLOUD_SCENE_ASSETS } from "../../src/scene/assets";

const DEFAULT_CAMERA_YAW = 0.68;
const DEFAULT_CAMERA_HEIGHT = 18;
const DEFAULT_CAMERA_DISTANCE = 25;

function defaultViewPosition(position: readonly [number, number, number]) {
  const length = Math.hypot(DEFAULT_CAMERA_HEIGHT, DEFAULT_CAMERA_DISTANCE);
  const rightX = Math.cos(DEFAULT_CAMERA_YAW);
  const rightZ = -Math.sin(DEFAULT_CAMERA_YAW);
  const upX = -Math.sin(DEFAULT_CAMERA_YAW) * DEFAULT_CAMERA_HEIGHT / length;
  const upY = DEFAULT_CAMERA_DISTANCE / length;
  const upZ = -Math.cos(DEFAULT_CAMERA_YAW) * DEFAULT_CAMERA_HEIGHT / length;
  const [x, y, z] = position;
  return {
    horizontal: x * rightX + z * rightZ,
    vertical: x * upX + y * upY + z * upZ,
  };
}

describe("battlefield atmosphere", () => {
  it("keeps a small cloud bank inside the default camera's upper safe band", () => {
    expect(BATTLEFIELD_CLOUDS).toHaveLength(4);
    expect(new Set(BATTLEFIELD_CLOUDS.map(({ id }) => id)).size).toBe(4);
    expect(new Set(BATTLEFIELD_CLOUDS.map(({ kind }) => kind))).toEqual(
      new Set(["big", "small"]),
    );

    const upperClouds = BATTLEFIELD_CLOUDS.filter(({ safeAnchor }) => !safeAnchor);
    expect(upperClouds).toHaveLength(3);
    for (const cloud of upperClouds) {
      expect(cloud.position[1]).toBeGreaterThanOrEqual(4);
      expect(defaultViewPosition(cloud.position).vertical).toBeGreaterThan(9);
      expect(defaultViewPosition(cloud.position).vertical).toBeLessThan(10);
      expect(cloud.opacity).toBeLessThanOrEqual(0.86);
    }
  });

  it("moves the formerly obstructive cloud over the impassable east mountain", () => {
    const cloud = BATTLEFIELD_CLOUDS.find(({ id }) => id === "upper-mideast-big");
    const anchor = { q: 6, r: -4 } as const;
    const anchorWorld = axialToWorld(anchor);

    expect(cloud?.safeAnchor).toEqual(anchor);
    expect(getBattlefieldCell(anchor)).toMatchObject({
      surface: "rock",
      walkable: false,
      buildable: false,
    });
    const cloudView = defaultViewPosition(cloud!.position);
    const anchorView = defaultViewPosition([anchorWorld.x, 0, anchorWorld.z]);
    expect(cloudView.horizontal).toBeCloseTo(anchorView.horizontal, 1);
    expect(cloudView.vertical).toBeCloseTo(anchorView.vertical, 1);
  });

  it("moves the upper-right cloud farther right without dropping it into the battlefield", () => {
    const cloud = BATTLEFIELD_CLOUDS.find(({ id }) => id === "upper-east-small");

    expect(cloud?.position).toEqual([8.8, 7, -14.65]);
    expect(defaultViewPosition(cloud!.position).horizontal).toBeGreaterThan(15);
    expect(defaultViewPosition(cloud!.position).vertical).toBeGreaterThan(9);
    expect(defaultViewPosition(cloud!.position).vertical).toBeLessThan(10);
  });

  it("loads clouds from local KayKit assets without entering gameplay collision data", () => {
    expect(BATTLEFIELD_CLOUD_SCENE_ASSETS).toEqual({
      big: {
        url: "/assets/kaykit/medieval-hex/decoration/nature/cloud_big.gltf",
        scale: 1,
      },
      small: {
        url: "/assets/kaykit/medieval-hex/decoration/nature/cloud_small.gltf",
        scale: 1,
      },
    });
    expect(BATTLEFIELD_SCENERY_KINDS).not.toContain("cloud-big");
    expect(BATTLEFIELD_SCENERY_KINDS).not.toContain("cloud-small");
    expect(BLOCKING_SCENERY_KINDS.has("cloud-big" as never)).toBe(false);
    expect(BLOCKING_SCENERY_KINDS.has("cloud-small" as never)).toBe(false);
  });
});
