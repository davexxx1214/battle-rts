import { describe, expect, it } from "vitest";
import {
  SANDBOX_MINIMAP_COMPACT_PLACEMENT,
  SANDBOX_MINIMAP_DESKTOP_PLACEMENT,
  sandboxMinimapScreenRect,
  type SandboxMinimapScreenRect,
} from "../../src/ui/minimap/minimapLayout";

describe("sandbox minimap responsive layout", () => {
  it("keeps the desktop minimap clear of deployment and field-caption controls", () => {
    const minimap = sandboxMinimapScreenRect(
      { width: 1280, height: 720 },
      SANDBOX_MINIMAP_DESKTOP_PLACEMENT,
    );

    expect(minimap).toMatchObject({ x: 1082, width: 180 });
    expect(intersects(minimap, { x: 12, y: 12, width: 218, height: 696 })).toBe(false);
    expect(intersects(minimap, { x: 912, y: 682, width: 350, height: 24 })).toBe(false);
  });

  it("keeps the 390 x 844 minimap clear of resource, objective and command inputs", () => {
    const battlefield = { width: 390, height: 844 - 48 };
    const minimap = sandboxMinimapScreenRect(
      battlefield,
      SANDBOX_MINIMAP_COMPACT_PLACEMENT,
    );
    const resourceInput = { x: 4, y: 4, width: 118, height: 39 };
    const objectiveInput = { x: 248, y: 6, width: 136, height: 39 };
    const commandInputs = { x: 8, y: battlefield.height - 62, width: 374, height: 58 };

    expect(minimap).toMatchObject({ x: 256, y: 54, width: 128 });
    expect(intersects(minimap, resourceInput)).toBe(false);
    expect(intersects(minimap, objectiveInput)).toBe(false);
    expect(intersects(minimap, commandInputs)).toBe(false);
    expect(minimap.y + minimap.height).toBeLessThan(commandInputs.y);
  });
});

function intersects(
  first: SandboxMinimapScreenRect,
  second: SandboxMinimapScreenRect,
): boolean {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}
