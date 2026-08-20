import { describe, expect, it, vi } from "vitest";

import type { WorldPoint } from "../../src/game/types";
import { axialToWorld } from "../../src/map/battlefield";
import { SANDBOX_LARGE_BATTLEFIELD_DEFINITION } from "../../src/map/battlefieldDefinition";
import {
  activateMinimapPointer,
  stopMinimapPropagation,
} from "../../src/ui/minimap/minimapInteraction";
import { createMinimapProjection } from "../../src/ui/minimap/minimapProjection";

const HALF_HEX_CENTER_SPACING = Math.sqrt(3) / 2;

describe("sandbox minimap projection", () => {
  const definition = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
  const projection = createMinimapProjection(definition.worldBounds);

  it("round-trips the four bounds corners, castles, and all eight mine pits within half a cell", () => {
    const { minX, maxX, minZ, maxZ } = definition.worldBounds;
    const corners: readonly WorldPoint[] = [
      { x: minX, z: minZ },
      { x: maxX, z: minZ },
      { x: maxX, z: maxZ },
      { x: minX, z: maxZ },
    ];
    const castles = (["verdant", "crimson"] as const).map((faction) => (
      axialToWorld(definition.map.castles[faction])
    ));
    const mines = (definition.minePits ?? []).map((pit) => axialToWorld(pit.coordinate));

    expect(mines).toHaveLength(8);
    for (const source of [...corners, ...castles, ...mines]) {
      const result = projection.unproject(projection.project(source));
      expect(Math.hypot(result.x - source.x, result.z - source.z)).toBeLessThan(
        HALF_HEX_CENTER_SPACING,
      );
    }
  });

  it("keeps the player castle below the enemy castle", () => {
    const player = projection.project(axialToWorld(definition.map.castles.verdant));
    const enemy = projection.project(axialToWorld(definition.map.castles.crimson));

    expect(player.y).toBeGreaterThan(enemy.y);
  });

  it("clicks all four corners, both castles, and eight mines through the explicit camera callback", () => {
    const rect = { left: 14, top: 27, width: 360, height: 468 };
    const { minX, maxX, minZ, maxZ } = definition.worldBounds;
    const cornerClicks = [
      { clientX: rect.left, clientY: rect.top, expected: { x: minX, z: minZ } },
      { clientX: rect.left + rect.width, clientY: rect.top, expected: { x: maxX, z: minZ } },
      {
        clientX: rect.left + rect.width,
        clientY: rect.top + rect.height,
        expected: { x: maxX, z: maxZ },
      },
      { clientX: rect.left, clientY: rect.top + rect.height, expected: { x: minX, z: maxZ } },
    ];
    const markerTargets = [
      ...(["verdant", "crimson"] as const).map((faction) => (
        axialToWorld(definition.map.castles[faction])
      )),
      ...(definition.minePits ?? []).map((pit) => axialToWorld(pit.coordinate)),
    ];
    const projectedClicks = markerTargets.map((expected) => {
      const point = projection.project(expected);
      return {
        clientX: rect.left + point.x / projection.viewport.width * rect.width,
        clientY: rect.top + point.y / projection.viewport.height * rect.height,
        expected,
      };
    });
    const requests: WorldPoint[] = [];

    for (const click of [...cornerClicks, ...projectedClicks]) {
      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();
      const target = activateMinimapPointer({
        clientX: click.clientX,
        clientY: click.clientY,
        currentTarget: { getBoundingClientRect: () => rect },
        preventDefault,
        stopPropagation,
      }, projection, (request) => requests.push(request));

      expect(preventDefault).toHaveBeenCalledOnce();
      expect(stopPropagation).toHaveBeenCalledOnce();
      expect(Math.hypot(target.x - click.expected.x, target.z - click.expected.z)).toBeLessThan(
        HALF_HEX_CENTER_SPACING,
      );
    }
    expect(requests).toHaveLength(14);
  });

  it("stops the pointer gesture chain without preventing the click-producing defaults", () => {
    for (const phase of ["down", "move", "up", "cancel"]) {
      const stopPropagation = vi.fn();
      stopMinimapPropagation({ stopPropagation });
      expect(stopPropagation, phase).toHaveBeenCalledOnce();
    }
  });
});
