import { describe, expect, it } from "vitest";

import { FixedObjectPool } from "../../src/scene/effects/effectPool";

interface VisualState {
  position: [number, number, number];
  color: string;
  targetId: string | null;
}

describe("fixed visual object pool", () => {
  it("reuses a released slot after resetting all transient state", () => {
    const pool = new FixedObjectPool<VisualState>(
      2,
      () => ({ position: [0, 0, 0], color: "none", targetId: null }),
      (value) => {
        value.position = [0, 0, 0];
        value.color = "none";
        value.targetId = null;
      },
    );
    const first = pool.sync(["arrow-a"])[0]!;
    first.value.position = [9, 4, 2];
    first.value.color = "gold";
    first.value.targetId = "enemy-a";

    pool.sync([]);
    const reused = pool.sync(["arrow-b"])[0]!;

    expect(reused.index).toBe(first.index);
    expect(reused.value).toEqual({ position: [0, 0, 0], color: "none", targetId: null });
  });

  it("never allocates more values than its fixed capacity", () => {
    let created = 0;
    const pool = new FixedObjectPool(2, () => ({ serial: created++ }), () => undefined);

    const active = pool.sync(["one", "two", "three"]);

    expect(active).toHaveLength(2);
    expect(created).toBe(2);
  });
});
