import { describe, expect, it } from "vitest";

import {
  createBuildingOccupancy,
  requestBuildingPlacement,
} from "../../src/game/deployment";
import {
  BATTLEFIELD_MAP,
  axialToWorld,
  getBattlefieldCell,
} from "../../src/map/battlefield";
import {
  BATTLEFIELD_SCENERY,
  BLOCKING_SCENERY_KINDS,
} from "../../src/map/battlefieldScenery";
import { battlefieldCoordinates } from "../../src/map/battlefieldLayout";
import { SCENERY_SCENE_ASSETS } from "../../src/scene/assets";

const REMOVED_RIGHT_EDGE_COORDINATES = [
  { q: 0, r: 9 },
  { q: 1, r: 8 },
  { q: 2, r: 7 },
  { q: 3, r: 6 },
  { q: 4, r: 5 },
  { q: 5, r: 4 },
  { q: 6, r: 3 },
  { q: 7, r: 2 },
] as const;

const RIGHT_FARM_COORDINATES = [
  { q: -1, r: 7 },
  { q: -1, r: 8 },
  { q: -1, r: 9 },
  { q: 0, r: 7 },
  { q: 0, r: 8 },
  { q: 1, r: 6 },
  { q: 1, r: 7 },
  { q: 2, r: 5 },
  { q: 2, r: 6 },
  { q: 3, r: 2 },
  { q: 3, r: 4 },
  { q: 3, r: 5 },
  { q: 4, r: 4 },
  { q: 4, r: 3 },
  { q: 5, r: 2 },
  { q: 5, r: 3 },
  { q: 6, r: 2 },
] as const;

const RIGHT_FARM_PASSAGE_COORDINATE = { q: 2, r: 3 } as const;

describe("right farm terrain", () => {
  it("removes only the outermost row of the southeast battlefield peninsula", () => {
    const keys = new Set(battlefieldCoordinates().map(([q, r]) => `${q},${r}`));

    expect(keys.size).toBe(242);
    for (const { q, r } of REMOVED_RIGHT_EDGE_COORDINATES) {
      expect(keys.has(`${q},${r}`)).toBe(false);
      expect(getBattlefieldCell({ q, r })).toBeUndefined();
    }
    expect(keys.has("8,1")).toBe(true);
    expect(keys.has("-7,9")).toBe(true);
  });

  it("turns every dressed farm cell into blocked grassland", () => {
    for (const coordinate of RIGHT_FARM_COORDINATES) {
      expect(getBattlefieldCell(coordinate)).toMatchObject({
        surface: "grass",
        territory: "verdant",
        walkable: false,
        buildable: false,
      });
    }
  });

  it("dresses every farm cell without stray stone fences", () => {
    const farmScenery = BATTLEFIELD_SCENERY.filter(({ zone }) => zone === "right-farm");
    const farmKeys = new Set(RIGHT_FARM_COORDINATES.map(({ q, r }) => `${q},${r}`));
    const farmKinds = farmScenery.map(({ kind }) => kind);

    expect(new Set(farmScenery.map(({ coordinate }) => (
      `${coordinate.q},${coordinate.r}`
    )))).toEqual(farmKeys);
    expect(farmScenery.every(({ coordinate }) => (
      farmKeys.has(`${coordinate.q},${coordinate.r}`)
    ))).toBe(true);
    expect(farmScenery.every(({ kind }) => BLOCKING_SCENERY_KINDS.has(kind))).toBe(true);
    expect(farmKinds.filter((kind) => kind === "farm-grain")).toHaveLength(11);
    expect(farmKinds.filter((kind) => kind === "farm-dirt")).toHaveLength(1);
    expect(farmKinds.filter((kind) => kind === "farm-windmill")).toHaveLength(1);
    expect(farmKinds.filter((kind) => kind === "farm-cargo-wagon")).toHaveLength(1);
    expect(farmKinds.filter((kind) => kind === "farm-home-a")).toHaveLength(1);
    expect(farmKinds.filter((kind) => kind === "farm-home-b")).toHaveLength(1);
    expect(farmKinds.filter((kind) => kind === "farm-watermill")).toHaveLength(1);
    expect(farmKinds).not.toContain("farm-fence-stone");
  });

  it("anchors a full blue sailing ship in the open right-side bay", () => {
    const ship = BATTLEFIELD_SCENERY.find(({ id }) => id === "right-bay-ship");
    const waterCoordinates = [
      { q: 5, r: 0 },
      { q: 4, r: 0 },
      { q: 5, r: -1 },
      { q: 6, r: -1 },
      { q: 6, r: 0 },
      { q: 4, r: 1 },
      { q: 5, r: 1 },
    ] as const;

    expect(ship).toMatchObject({
      kind: "bay-ship",
      zone: "wild",
      coordinate: { q: 5, r: 0 },
      rotationY: Math.PI / 2,
    });
    expect(waterCoordinates.every((coordinate) => (
      getBattlefieldCell(coordinate)?.surface === "water"
    ))).toBe(true);
  });

  it("replaces the inner-edge small home with a blue cargo wagon and points the watermill wheel toward water", () => {
    const cargoWagon = BATTLEFIELD_SCENERY.find(({ id }) => id === "right-farm-cargo-wagon");
    const watermill = BATTLEFIELD_SCENERY.find(({ id }) => id === "right-farm-watermill");

    expect(cargoWagon).toMatchObject({
      kind: "farm-cargo-wagon",
      zone: "right-farm",
      coordinate: { q: -1, r: 7 },
    });
    expect(BLOCKING_SCENERY_KINDS.has("farm-cargo-wagon")).toBe(true);
    expect(BATTLEFIELD_SCENERY.some(({ id }) => id === "right-farm-small-home")).toBe(false);
    expect(watermill).toMatchObject({
      kind: "farm-watermill",
      coordinate: { q: 3, r: 2 },
      rotationY: 0,
    });
    expect(watermill?.offset.z).toBeLessThan(0);
    expect(getBattlefieldCell({ q: 3, r: 1 })?.surface).toBe("water");
    expect(getBattlefieldCell({ q: 4, r: 1 })?.surface).toBe("water");
    expect(BATTLEFIELD_SCENERY.filter(({ coordinate }) => (
      coordinate.q === 3 && coordinate.r === 2
    )).map(({ kind }) => kind)).toEqual(["farm-watermill"]);
  });

  it("clears the gray outskirts props into a walkable, buildable passage", () => {
    expect(getBattlefieldCell(RIGHT_FARM_PASSAGE_COORDINATE)).toMatchObject({
      surface: "grass",
      territory: "verdant",
      walkable: true,
      buildable: true,
    });
    expect(BATTLEFIELD_SCENERY.filter(({ coordinate }) => (
      coordinate.q === RIGHT_FARM_PASSAGE_COORDINATE.q
      && coordinate.r === RIGHT_FARM_PASSAGE_COORDINATE.r
    ))).toEqual([]);
    expect(getBattlefieldCell({ q: 1, r: 3 })?.walkable).toBe(true);
    expect(getBattlefieldCell({ q: 2, r: 2 })?.walkable).toBe(true);
    expect(requestBuildingPlacement(BATTLEFIELD_MAP, createBuildingOccupancy(), {
      buildingId: "right-farm-passage-barracks",
      kind: "barracks",
      faction: "verdant",
      worldPosition: axialToWorld(RIGHT_FARM_PASSAGE_COORDINATE),
    }, [])).toMatchObject({
      ok: true,
      coordinate: RIGHT_FARM_PASSAGE_COORDINATE,
    });
  });

  it("maps the farm landmarks to the supplied KayKit Medieval Hexagon assets", () => {
    const assets = SCENERY_SCENE_ASSETS as Readonly<Record<
      string,
      {
        readonly url: string;
        readonly scale: number;
        readonly renderMode?: "full-scene" | "instanced";
      }
    >>;

    expect(assets["farm-windmill"]?.url)
      .toBe("/assets/kaykit/medieval-hex/buildings/blue/building_windmill_blue.gltf");
    expect(assets["farm-cargo-wagon"]?.url)
      .toBe("/assets/kaykit/medieval-hex/units/blue/cart_merchant_blue_accent.gltf");
    expect(assets["farm-cargo-wagon"]?.renderMode).toBe("full-scene");
    expect(assets["farm-home-a"]?.url)
      .toBe("/assets/kaykit/medieval-hex/buildings/blue/building_home_A_blue.gltf");
    expect(assets["farm-home-b"]?.url)
      .toBe("/assets/kaykit/medieval-hex/buildings/blue/building_home_B_blue.gltf");
    expect(assets["farm-watermill"]?.url)
      .toBe("/assets/kaykit/medieval-hex/buildings/blue/building_watermill_blue.gltf");
    expect(assets["bay-ship"]?.url)
      .toBe("/assets/kaykit/medieval-hex/units/blue/ship_blue_accent.gltf");
  });
});
