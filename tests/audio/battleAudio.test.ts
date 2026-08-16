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

  it("consumes death events once even when the event window is rendered again", () => {
    const router = new BattleAudioEventRouter();
    const events = [
      stampBattleEvent({ type: "unit-died", unitId: "v-1", killerId: "c-1" }, 4, 1),
    ];

    expect(router.consume(events).map(({ cue }) => cue)).toEqual(["unit.death"]);
    expect(router.consume(events)).toEqual([]);
    router.reset();
    expect(router.consume(events).map(({ cue }) => cue)).toEqual(["unit.death"]);
  });

  it("plays the full-gold prompt once per transition event", () => {
    const router = new BattleAudioEventRouter();
    const playerEvent = stampBattleEvent({
      type: "gold-full",
      faction: "verdant",
      promptSequence: 1,
    }, 5, 2.8);
    const enemyEvent = stampBattleEvent({
      type: "gold-full",
      faction: "crimson",
      promptSequence: 1,
    }, 6, 2.8);

    expect(router.consume([playerEvent]).map(({ cue }) => cue)).toEqual(["command.attack"]);
    expect(router.consume([playerEvent])).toEqual([]);
    expect(router.consume([enemyEvent])).toEqual([]);
  });

  it("routes damage audio from the event snapshot without reading mutable unit state", () => {
    const router = new BattleAudioEventRouter();
    const event = stampBattleEvent({
      type: "damage-applied",
      targetType: "unit",
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
        targetType: "unit",
        attackerId: "v-catapult",
        targetId: "c-target",
        role: "catapult",
        origin: { x: 0, z: 8 },
        targetPosition: { x: 0, z: 0 },
      }, 8, 1.5),
      stampBattleEvent({
        type: "projectile-hit",
        targetType: "unit",
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

  it("routes distinct building economy, spawn, destruction, and castle activation cues", () => {
    const router = new BattleAudioEventRouter();
    const events = [
      stampBattleEvent({
        type: "building-gold-produced",
        buildingId: "mine-1",
        faction: "verdant",
        scheduledAt: 4,
        productionSequence: 1,
        producedAmount: 100,
        creditedAmount: 100,
        wastedAmount: 0,
      }, 10, 4),
      stampBattleEvent({
        type: "building-gold-produced",
        buildingId: "mine-1",
        faction: "verdant",
        scheduledAt: 8,
        productionSequence: 2,
        producedAmount: 100,
        creditedAmount: 0,
        wastedAmount: 100,
      }, 11, 8),
      stampBattleEvent({
        type: "building-unit-spawned",
        buildingId: "barracks-1",
        faction: "verdant",
        unitId: "swordsman-1",
        role: "knight",
        position: { x: 0, z: 4 },
        scheduledAt: 5,
        spawnSequence: 1,
      }, 12, 5),
      stampBattleEvent({
        type: "building-destroyed",
        buildingId: "mine-1",
        faction: "verdant",
        kind: "gold-mine",
        scheduledAt: 9,
        coordinate: { q: 0, r: 3 },
        position: { x: 3, z: 4 },
        removeAt: 9.8,
        cause: "damage",
      }, 13, 9),
      stampBattleEvent({
        type: "castle-activated",
        castleId: "verdant-castle",
        faction: "verdant",
        position: { x: 0, z: 12 },
      }, 14, 10),
    ];

    expect(router.consume(events).map(({ cue }) => cue)).toEqual([
      "building.gold",
      "building.gold-wasted",
      "building.spawn",
      "building.destroy",
      "castle.activate",
    ]);
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
