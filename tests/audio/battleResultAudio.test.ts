import { describe, expect, it } from "vitest";

import { musicSceneForWinner } from "../../src/audio/useBattleAudio";

describe("battle result music", () => {
  it("keeps draws neutral instead of playing the defeat track", () => {
    expect(musicSceneForWinner("draw")).toBe("draw");
    expect(musicSceneForWinner("verdant")).toBe("victory");
    expect(musicSceneForWinner("crimson")).toBe("defeat");
  });
});
