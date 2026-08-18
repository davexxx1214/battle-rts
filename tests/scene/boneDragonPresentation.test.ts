import { describe, expect, it } from "vitest";

import {
  BATTLEFIELD_MAP,
  axialToWorld,
  terrainHeightAt,
} from "../../src/map/battlefield";
import { boneDragonTerrainSupportHeight } from "../../src/scene/boneDragonPresentation";

describe("bone dragon terrain presentation", () => {
  it("supports the full dragon footprint on the highest nearby tile", () => {
    const samples = BATTLEFIELD_MAP.cells.map((cell) => {
      const position = axialToWorld(cell);
      return {
        center: terrainHeightAt(position),
        support: boneDragonTerrainSupportHeight(position, 0),
      };
    });

    expect(samples.every(({ center, support }) => support >= center)).toBe(true);
    expect(samples.some(({ center, support }) => support > center)).toBe(true);
  });
});
