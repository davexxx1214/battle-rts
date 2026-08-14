import { describe, expect, it, vi } from "vitest";

import {
  BattleAudioEventRouter,
  BattleMusicPlayer,
  ReusableAudioPool,
  scaleAudioGain,
  type AudioVoice,
} from "../../src/audio/battleAudio";
import { stampBattleEvent } from "../../src/game/events";

describe("battle audio", () => {
  it("halves the final gain for every audio bus", () => {
    expect(scaleAudioGain(1)).toBe(0.5);
    expect(scaleAudioGain(0.72)).toBe(0.36);
  });

  it("keeps scene music silent until enabled and stops it immediately when disabled", () => {
    const voice = createFakeVoice();
    const player = new BattleMusicPlayer(() => voice, () => 0);

    player.setScene("battle", 0);
    expect(voice.play).not.toHaveBeenCalled();

    player.setEnabled(true);
    expect(voice.src).toBe("/audio/music/background1.mp3");
    expect(voice.volume).toBe(0.5);
    expect(voice.loop).toBe(true);
    expect(voice.play).toHaveBeenCalledTimes(1);

    voice.currentTime = 12;
    player.setEnabled(false);
    expect(voice.pause).toHaveBeenCalled();
    expect(voice.currentTime).toBe(12);

    player.setEnabled(true);
    expect(voice.src).toBe("/audio/music/background1.mp3");
    expect(voice.currentTime).toBe(12);
    expect(voice.play).toHaveBeenCalledTimes(2);
  });

  it("randomly selects music for battle and victory while failure uses its scene track", () => {
    const voice = createFakeVoice();
    const player = new BattleMusicPlayer(() => voice, () => 0.99);
    player.setEnabled(true);

    player.setScene("battle", 1);
    expect(voice.src).toBe("/audio/music/background3.mp3");
    expect(voice.loop).toBe(true);

    player.setScene("victory", 1);
    expect(voice.src).toBe("/audio/music/victory3.mp3");
    expect(voice.loop).toBe(false);

    player.setScene("defeat", 1);
    expect(voice.src).toBe("/audio/music/fail.mp3");
    expect(voice.loop).toBe(false);
  });

  it("keeps the current track for the same scene revision and rerolls after a reset", () => {
    const voice = createFakeVoice();
    const random = vi.fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99);
    const player = new BattleMusicPlayer(() => voice, random);
    player.setEnabled(true);

    player.setScene("battle", 4);
    player.setScene("battle", 4);
    expect(voice.src).toBe("/audio/music/background1.mp3");
    expect(voice.play).toHaveBeenCalledTimes(1);

    player.setScene("battle", 5);
    expect(voice.src).toBe("/audio/music/background3.mp3");
    expect(voice.play).toHaveBeenCalledTimes(2);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it("consumes death and retreat events once even when the event window is rendered again", () => {
    const router = new BattleAudioEventRouter();
    const events = [
      stampBattleEvent({ type: "unit-died", unitId: "v-1", killerId: "c-1" }, 4, 1),
      stampBattleEvent({ type: "squad-routed", squadId: "v-squad", faction: "verdant" }, 5, 1.1),
    ];

    expect(router.consume(events).map(({ cue }) => cue)).toEqual([
      "unit.death",
      "battle.retreat",
    ]);
    expect(router.consume(events)).toEqual([]);
  });

  it("routes damage audio from the event snapshot without reading mutable unit state", () => {
    const router = new BattleAudioEventRouter();
    const event = stampBattleEvent({
      type: "damage-applied",
      sourceId: "v-1",
      sourceRole: "knight",
      sourcePosition: { x: 1, z: 2 },
      targetId: "c-1",
      targetPosition: { x: 1.5, z: 2.5 },
      amount: 5,
    }, 7, 1.4);

    expect(router.consume([event]).map(({ cue }) => cue)).toEqual([
      "knight.impact",
      "unit.hurt",
    ]);
  });

  it("does not reuse magic or bow sounds for catapult attacks", () => {
    const router = new BattleAudioEventRouter();
    const events = [
      stampBattleEvent({
        type: "attack-started",
        attackerId: "v-catapult",
        targetId: "c-target",
        role: "catapult",
        origin: { x: 0, z: 8 },
        targetPosition: { x: 0, z: 0 },
      }, 8, 1.5),
      stampBattleEvent({
        type: "projectile-hit",
        projectileId: "stone-1",
        attackerId: "v-catapult",
        targetId: "c-target",
        role: "catapult",
        position: { x: 0, z: 0 },
        splashRadius: 2.8,
      }, 9, 2.2),
    ];

    expect(router.consume(events)).toEqual([]);
  });

  it("reuses bounded audio voices instead of growing audio nodes", () => {
    const voices: AudioVoice[] = [];
    const factory = () => {
      const voice: AudioVoice = {
        src: "",
        currentTime: 0,
        volume: 1,
        playbackRate: 1,
        loop: false,
        paused: true,
        pause: vi.fn(function pause(this: AudioVoice) { this.paused = true; }),
        play: vi.fn(function play(this: AudioVoice) {
          this.paused = false;
          return Promise.resolve();
        }),
      };
      voices.push(voice);
      return voice;
    };
    const pool = new ReusableAudioPool(2, factory);

    pool.play("/one.wav", 0.5, 1);
    pool.play("/two.wav", 0.6, 0.98);
    pool.play("/three.wav", 0.7, 1.02);

    expect(voices).toHaveLength(2);
    expect(voices.filter((voice) => !voice.paused)).toHaveLength(2);
    const latestVoice = voices.find((voice) => voice.src === "/three.wav");
    expect(latestVoice).toBeDefined();
    expect(latestVoice?.volume).toBeCloseTo(0.35);
  });
});

function createFakeVoice(): AudioVoice {
  return {
    src: "",
    currentTime: 0,
    volume: 1,
    playbackRate: 1,
    loop: false,
    paused: true,
    pause: vi.fn(function pause(this: AudioVoice) { this.paused = true; }),
    play: vi.fn(function play(this: AudioVoice) {
      this.paused = false;
      return Promise.resolve();
    }),
  };
}
