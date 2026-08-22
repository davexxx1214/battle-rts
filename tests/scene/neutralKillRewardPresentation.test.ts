import { describe, expect, it } from "vitest";

import { NEUTRAL_MONSTER_VISUAL_SCALE } from "../../src/scene/units/NeutralMonsterModel";
import {
  neutralKillRewardEffectsAt,
  NEUTRAL_KILL_REWARD_EFFECT_DURATION_SECONDS,
} from "../../src/scene/effects/neutralKillRewardPresentation";

describe("neutral monster reward presentation", () => {
  it("renders neutral creatures at half their previous visual scale", () => {
    expect(NEUTRAL_MONSTER_VISUAL_SCALE).toBe(0.5);
  });

  it("floats the credited gold amount from the dead monster position", () => {
    const position = { x: 4.5, z: -2.25 };
    const effects = neutralKillRewardEffectsAt({
      elapsed: 12.4,
      events: [{
        type: "neutral-kill-rewarded",
        sequence: 17,
        time: 12,
        faction: "verdant",
        unitId: "neutral-skeleton-a",
        killerId: "verdant-sword-1",
        monsterKind: "skeleton",
        gold: 60,
        position,
      }],
    });

    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      sequence: 17,
      unitId: "neutral-skeleton-a",
      amount: 60,
      position,
    });
    expect(effects[0]?.age).toBeCloseTo(0.4);
  });

  it("drops expired or zero-credit rewards", () => {
    const event = {
      type: "neutral-kill-rewarded" as const,
      sequence: 18,
      time: 10,
      faction: "verdant" as const,
      unitId: "neutral-skeleton-b",
      killerId: "verdant-sword-1",
      monsterKind: "skeleton" as const,
      gold: 60,
      position: { x: 0, z: 0 },
    };
    expect(neutralKillRewardEffectsAt({
      elapsed: 10 + NEUTRAL_KILL_REWARD_EFFECT_DURATION_SECONDS + 0.01,
      events: [event],
    })).toEqual([]);
    expect(neutralKillRewardEffectsAt({
      elapsed: 10,
      events: [{ ...event, gold: 0 }],
    })).toEqual([]);
  });
});
