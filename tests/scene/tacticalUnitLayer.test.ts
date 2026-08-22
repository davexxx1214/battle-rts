import { describe, expect, it } from "vitest";

import {
  TACTICAL_UNIT_LOD_MAXIMUM_ZOOM,
  TACTICAL_UNIT_LOD_MINIMUM_ENTITIES,
  shouldUseTacticalUnitLod,
} from "../../src/scene/units/TacticalUnitLayer";

describe("tactical unit LOD", () => {
  it("batches large sandbox armies only at overview zoom", () => {
    expect(TACTICAL_UNIT_LOD_MINIMUM_ENTITIES).toBe(100);
    expect(TACTICAL_UNIT_LOD_MAXIMUM_ZOOM).toBe(40);
    expect(shouldUseTacticalUnitLod("sandbox", 100, 32)).toBe(true);
    expect(shouldUseTacticalUnitLod("sandbox", 200, 40)).toBe(true);
    expect(shouldUseTacticalUnitLod("sandbox", 99, 32)).toBe(false);
    expect(shouldUseTacticalUnitLod("sandbox", 200, 41)).toBe(false);
  });

  it("never changes the established legacy presentation", () => {
    expect(shouldUseTacticalUnitLod("normal", 200, 32)).toBe(false);
    expect(shouldUseTacticalUnitLod("campaign", 200, 32)).toBe(false);
    expect(shouldUseTacticalUnitLod("arena", 200, 32)).toBe(false);
    expect(shouldUseTacticalUnitLod("infinite", 200, 32)).toBe(false);
  });
});
