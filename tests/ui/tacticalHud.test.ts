import { describe, expect, it, vi } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  issueAttackMoveCommand,
} from "../../src/game/battle";
import {
  createMinimapCameraFrame,
  createSquadMapMarkers,
  projectWorldToMinimap,
  summarizeSelectedSquads,
} from "../../src/ui/tacticalHud";
import {
  createCameraViewStore,
  DEFAULT_CAMERA_VIEW,
} from "../../src/scene/camera/cameraViewStore";

describe("tactical HUD view model", () => {
  it("summarizes a selection by squad with strength, order, and status", () => {
    const first = createBattleUnit({
      id: "v-1",
      squadId: "v-shield",
      faction: "verdant",
      role: "knight",
      position: { x: -1, z: 2 },
    });
    const second = createBattleUnit({
      id: "v-2",
      squadId: "v-shield",
      faction: "verdant",
      role: "knight",
      position: { x: 1, z: 2 },
    });
    const enemy = createBattleUnit({
      id: "c-1",
      squadId: "c-shield",
      faction: "crimson",
      role: "knight",
      position: { x: 0, z: -2 },
    });
    const commanded = issueAttackMoveCommand(
      createBattleState([
        { ...first, health: first.maxHealth / 2 },
        { ...second, health: 0, status: "dead" },
        enemy,
      ]),
      [first.id],
      { x: 4, z: 0 },
    );

    expect(summarizeSelectedSquads(commanded, [first.id, second.id])).toEqual([
      expect.objectContaining({
        squadId: "v-shield",
        role: "knight",
        selectedCount: 1,
        livingCount: 1,
        initialSize: 2,
        averageHealthRatio: 0.25,
        order: "attack-move",
        status: "moving",
      }),
    ]);
  });

  it("places one live marker per squad", () => {
    const first = createBattleUnit({
      id: "v-1",
      squadId: "v-bow",
      faction: "verdant",
      role: "ranger",
      position: { x: -2, z: 4 },
    });
    const second = createBattleUnit({
      id: "v-2",
      squadId: "v-bow",
      faction: "verdant",
      role: "ranger",
      position: { x: 2, z: 4 },
    });
    const deadEnemy = createBattleUnit({
      id: "c-1",
      squadId: "c-bow",
      faction: "crimson",
      role: "ranger",
      position: { x: 0, z: -4 },
    });
    const state = createBattleState([
      first,
      second,
      { ...deadEnemy, health: 0, status: "dead" },
    ]);
    expect(createSquadMapMarkers(state)).toEqual([
      {
        id: "v-bow",
        faction: "verdant",
        role: "ranger",
        position: { x: 0, z: 4 },
        livingCount: 2,
      },
    ]);
  });

  it("projects world positions and camera dimensions into minimap percentages", () => {
    expect(projectWorldToMinimap({ x: 0, z: 0 })).toEqual({ x: 50, y: 50 });

    const frame = createMinimapCameraFrame({
      center: { x: 0, z: 0 },
      width: 9,
      height: 6,
      yaw: Math.PI / 4,
    });
    expect(frame.center).toEqual({ x: 50, y: 50 });
    expect(frame.width).toBeCloseTo(25);
    expect(frame.height).toBeCloseTo(19.245, 2);
    expect(frame.rotationDegrees).toBeCloseTo(45);
  });

  it("notifies only local camera subscribers when a material view change is published", () => {
    const store = createCameraViewStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.publish({ ...DEFAULT_CAMERA_VIEW, center: { x: 2, z: 0 } });
    store.publish({ ...DEFAULT_CAMERA_VIEW, center: { x: 2.005, z: 0 } });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.publish({ ...DEFAULT_CAMERA_VIEW, center: { x: 4, z: 0 } });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().center.x).toBe(4);
  });
});
