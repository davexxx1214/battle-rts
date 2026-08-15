import { describe, expect, it } from "vitest";

import {
  MINING_CART_HALF_CYCLE_SECONDS,
  miningCartPose,
} from "../../src/scene/terrain/miningCartMotion";

describe("mining cart presentation", () => {
  it("travels to the mine, turns around, and returns to the ore pile", () => {
    const start = [6, 0.72, 10.4] as const;
    const mine = [5.45, 0.72, 11.35] as const;
    const outbound = miningCartPose(0, 0, start, mine);
    const arrived = miningCartPose(MINING_CART_HALF_CYCLE_SECONDS, 0, start, mine);
    const returned = miningCartPose(MINING_CART_HALF_CYCLE_SECONDS * 2, 0, start, mine);

    expect(outbound.position).toEqual(start);
    expect(arrived.position).toEqual(mine);
    expect(Math.abs(arrived.rotationY - outbound.rotationY)).toBeCloseTo(Math.PI);
    expect(returned.position).toEqual(start);
  });
});
