import { describe, expect, it } from "vitest";

import {
  axialToWorld,
  coordinateKey,
  getMapCell,
  hexDistance,
} from "../../src/map/battlefield";
import {
  SANDBOX_LARGE_BATTLEFIELD_MAP,
  SANDBOX_LARGE_BUILD_ANCHORS,
  SANDBOX_LARGE_ROAD_RESERVE,
} from "../../src/map/sandboxLargeBattlefield";
import { createBattleBuilding } from "../../src/game/buildings";
import {
  createSandboxProductionExitFan,
  resolveSandboxProductionExit,
  validateSandboxRallyPoint,
} from "../../src/game/sandboxProductionExit";
import { sandboxProductionExitForSpawn } from "../../src/game/sandboxProductionIntegration";
import type { SandboxProductionSpawn } from "../../src/game/sandboxProductionQueue";

describe("sandbox production exit fan", () => {
  it("creates a unique, walkable, road-reachable four-cell fan for all 104 anchors", () => {
    const anchorsByFaction = Object.entries(SANDBOX_LARGE_BUILD_ANCHORS);
    const allAnchors = anchorsByFaction.flatMap(([faction, anchors]) => (
      anchors.map((anchor) => ({ faction, anchor }))
    ));
    const roadReserveKeys = new Set(SANDBOX_LARGE_ROAD_RESERVE.map(coordinateKey));

    expect(SANDBOX_LARGE_BUILD_ANCHORS.verdant).toHaveLength(52);
    expect(SANDBOX_LARGE_BUILD_ANCHORS.crimson).toHaveLength(52);
    expect(allAnchors).toHaveLength(104);
    expect(new Set(allAnchors.map(({ anchor }) => (
      coordinateKey(anchor.coordinate)
    ))).size).toBe(104);

    for (const { anchor } of allAnchors) {
      const result = createSandboxProductionExitFan(
        SANDBOX_LARGE_BATTLEFIELD_MAP,
        SANDBOX_LARGE_ROAD_RESERVE,
        anchor.coordinate,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.fan.candidates).toHaveLength(4);
      expect(new Set(result.fan.candidates.map(coordinateKey)).size).toBe(4);
      expect(hexDistance(anchor.coordinate, result.fan.candidates[0])).toBe(1);
      expect(result.fan.candidates.slice(1).map((coordinate) => (
        hexDistance(anchor.coordinate, coordinate)
      ))).toEqual([2, 2, 2]);
      expect(result.fan.candidates.every((coordinate) => (
        getMapCell(SANDBOX_LARGE_BATTLEFIELD_MAP, coordinate)?.walkable === true
      ))).toBe(true);
      expect(roadReserveKeys.has(coordinateKey(result.fan.roadTarget))).toBe(true);

      const open = resolveSandboxProductionExit(
        SANDBOX_LARGE_BATTLEFIELD_MAP,
        SANDBOX_LARGE_ROAD_RESERVE,
        result.fan,
        new Set(),
        3,
      );
      expect(open.status).toBe("available");
      expect(open.coordinates).toHaveLength(3);
    }
  });

  it("blocks and deterministically releases every exit candidate on all 104 anchors", () => {
    const anchors = Object.values(SANDBOX_LARGE_BUILD_ANCHORS).flat();
    for (const anchor of anchors) {
      const result = createSandboxProductionExitFan(
        SANDBOX_LARGE_BATTLEFIELD_MAP,
        SANDBOX_LARGE_ROAD_RESERVE,
        anchor.coordinate,
      );
      if (!result.ok) throw new Error(result.reason);
      const candidateKeys = result.fan.candidates.map(coordinateKey);
      expect(resolveSandboxProductionExit(
        SANDBOX_LARGE_BATTLEFIELD_MAP,
        SANDBOX_LARGE_ROAD_RESERVE,
        result.fan,
        new Set(candidateKeys),
        3,
      ).status).toBe("ready-blocked");

      for (const releasedKey of candidateKeys) {
        const blockedKeys = candidateKeys.filter((key) => key !== releasedKey);
        const first = resolveSandboxProductionExit(
          SANDBOX_LARGE_BATTLEFIELD_MAP,
          SANDBOX_LARGE_ROAD_RESERVE,
          result.fan,
          new Set(blockedKeys),
          3,
        );
        const repeatedWithReverseInsertion = resolveSandboxProductionExit(
          SANDBOX_LARGE_BATTLEFIELD_MAP,
          SANDBOX_LARGE_ROAD_RESERVE,
          result.fan,
          new Set([...blockedKeys].reverse()),
          3,
        );
        expect(first).toEqual(repeatedWithReverseInsertion);
        expect(first.status).toBe("available");
        if (first.status !== "available") continue;
        expect(first.coordinates.map(coordinateKey)).toEqual([
          releasedKey,
          releasedKey,
          releasedKey,
        ]);
      }
    }
  });

  it("integrates live blockers and releases every candidate across all 104 anchors", () => {
    for (const faction of ["verdant", "crimson"] as const) {
      for (const [index, anchor] of SANDBOX_LARGE_BUILD_ANCHORS[faction].entries()) {
        const building = createBattleBuilding({
          id: `${faction}-producer-${index}`,
          kind: "barracks",
          faction,
          coordinate: anchor.coordinate,
          createdAt: 0,
        });
        const plan = createSandboxProductionExitFan(
          SANDBOX_LARGE_BATTLEFIELD_MAP,
          SANDBOX_LARGE_ROAD_RESERVE,
          building.coordinate,
        );
        if (!plan.ok) throw new Error(plan.reason);
        const spawn: SandboxProductionSpawn = {
          entryId: `${building.id}:production:1`,
          entrySequence: 1,
          buildingId: building.id,
          faction,
          producer: "barracks",
          troopKind: "spearman",
          entityCount: 2,
          populationCost: 2,
          scheduledAtSeconds: 6,
          squadId: `${building.id}:squad:1`,
          unitIds: [`${building.id}:unit:1`, `${building.id}:unit:2`],
          rallyPoint: null,
        };
        const blockers = plan.fan.candidates.map((coordinate) => ({
          position: axialToWorld(coordinate),
          health: 100,
          status: "idle",
        }));

        expect(sandboxProductionExitForSpawn(
          SANDBOX_LARGE_BATTLEFIELD_MAP,
          SANDBOX_LARGE_ROAD_RESERVE,
          [building],
          blockers,
          spawn,
        ).status).toBe("ready-blocked");

        for (const releasedIndex of blockers.keys()) {
          const released = sandboxProductionExitForSpawn(
            SANDBOX_LARGE_BATTLEFIELD_MAP,
            SANDBOX_LARGE_ROAD_RESERVE,
            [building],
            blockers.map((blocker, blockerIndex) => (
              blockerIndex === releasedIndex ? { ...blocker, health: 0 } : blocker
            )).reverse(),
            spawn,
          );
          expect(released.status).toBe("available");
          if (released.status !== "available") continue;
          expect(released.coordinates).toEqual([
            plan.fan.candidates[releasedIndex],
            plan.fan.candidates[releasedIndex],
          ]);
        }
      }
    }
  });

  it("keeps all 52 per-side anchor pairs exactly mirrored", () => {
    const crimsonByKey = new Map(SANDBOX_LARGE_BUILD_ANCHORS.crimson.map((anchor) => (
      [coordinateKey(anchor.coordinate), anchor] as const
    )));
    for (const verdant of SANDBOX_LARGE_BUILD_ANCHORS.verdant) {
      const crimson = crimsonByKey.get(coordinateKey({
        q: -verdant.coordinate.q,
        r: -verdant.coordinate.r,
      }));
      expect(crimson).toBeDefined();
      if (!crimson) continue;
      const verdantPlan = createSandboxProductionExitFan(
        SANDBOX_LARGE_BATTLEFIELD_MAP,
        SANDBOX_LARGE_ROAD_RESERVE,
        verdant.coordinate,
      );
      const crimsonPlan = createSandboxProductionExitFan(
        SANDBOX_LARGE_BATTLEFIELD_MAP,
        SANDBOX_LARGE_ROAD_RESERVE,
        crimson.coordinate,
      );
      expect(verdantPlan.ok).toBe(true);
      expect(crimsonPlan.ok).toBe(true);
      if (!verdantPlan.ok || !crimsonPlan.ok) continue;
      expect(crimsonPlan.fan.facingDirection).toBe(
        (verdantPlan.fan.facingDirection + 3) % 6,
      );
      expect(crimsonPlan.fan.roadTarget).toEqual({
        q: -verdantPlan.fan.roadTarget.q || 0,
        r: -verdantPlan.fan.roadTarget.r || 0,
      });
      expect(crimsonPlan.fan.candidates).toEqual(
        verdantPlan.fan.candidates.map((coordinate) => ({
          q: -coordinate.q || 0,
          r: -coordinate.r || 0,
        })),
      );
    }
  });

  it("rejects missing map metadata and validates walkable rally points", () => {
    expect(createSandboxProductionExitFan(
      SANDBOX_LARGE_BATTLEFIELD_MAP,
      [],
      SANDBOX_LARGE_BUILD_ANCHORS.verdant[0]!.coordinate,
    )).toEqual({ ok: false, reason: "missing-road-reserve" });
    expect(createSandboxProductionExitFan(
      SANDBOX_LARGE_BATTLEFIELD_MAP,
      SANDBOX_LARGE_ROAD_RESERVE,
      { q: 999, r: 999 },
    )).toEqual({ ok: false, reason: "outside-battlefield" });

    const rally = SANDBOX_LARGE_ROAD_RESERVE[0]!;
    expect(validateSandboxRallyPoint(
      SANDBOX_LARGE_BATTLEFIELD_MAP,
      axialToWorld(rally),
    )).toEqual({ valid: true, coordinate: rally });
    expect(validateSandboxRallyPoint(
      SANDBOX_LARGE_BATTLEFIELD_MAP,
      { x: Number.NaN, z: 0 },
    )).toEqual({ valid: false, coordinate: null });
  });
});
