import { describe, expect, it, vi } from "vitest";

import {
  BattleMusicPlayer,
  DEFAULT_AUDIO_ENABLED,
  DeploymentAudioEventRouter,
  ReusableAudioPool,
  UI_AUDIO_CUES,
  scaleAudioGain,
  type AudioVoice,
} from "../../src/audio/battleAudio";
import { stampBattleEvent } from "../../src/game/events";

describe("battle audio", () => {
  it("enables audio by default and keeps the shared mix restrained", () => {
    expect(DEFAULT_AUDIO_ENABLED).toBe(true);
    expect(scaleAudioGain(1)).toBe(0.5);
    expect(scaleAudioGain(0.72)).toBe(0.36);
  });

  it("stays silent before an outcome and stops outcome music immediately when disabled", () => {
    const voice = createFakeVoice();
    const player = new BattleMusicPlayer(() => voice, () => 0);

    player.setEnabled(true);
    player.setScene(null, 0);
    expect(voice.play).not.toHaveBeenCalled();

    player.setScene("victory", 0);
    expect(voice.src).toBe("/audio/music/victory1.mp3");
    expect(voice.volume).toBe(0.5);
    expect(voice.loop).toBe(false);
    expect(voice.play).toHaveBeenCalledTimes(1);

    voice.currentTime = 12;
    player.setEnabled(false);
    expect(voice.pause).toHaveBeenCalled();
    expect(voice.currentTime).toBe(12);
  });

  it("randomly selects victory music while failure uses its single outcome track", () => {
    const voice = createFakeVoice();
    const player = new BattleMusicPlayer(() => voice, () => 0.99);
    player.setEnabled(true);

    player.setScene("victory", 1);
    expect(voice.src).toBe("/audio/music/victory3.mp3");
    expect(voice.loop).toBe(false);

    player.setScene("defeat", 1);
    expect(voice.src).toBe("/audio/music/fail.mp3");
    expect(voice.loop).toBe(false);
  });

  it("keeps the current outcome track for the same revision and rerolls after a reset", () => {
    const voice = createFakeVoice();
    const random = vi.fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99);
    const player = new BattleMusicPlayer(() => voice, random);
    player.setEnabled(true);

    player.setScene("victory", 4);
    player.setScene("victory", 4);
    expect(voice.src).toBe("/audio/music/victory1.mp3");
    expect(voice.play).toHaveBeenCalledTimes(1);

    player.setScene("victory", 5);
    expect(voice.src).toBe("/audio/music/victory3.mp3");
    expect(voice.play).toHaveBeenCalledTimes(2);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it("uses a quiet hover texture for selection and distinct placement cues", () => {
    expect(UI_AUDIO_CUES).toEqual({
      select: { src: "/audio/ui/organic/hover.mp3", gain: 0.25 },
      "place-unit": { src: "/audio/ui/organic/drop.mp3", gain: 1 },
      "place-building": { src: "/audio/ui/organic/snap.mp3", gain: 0.35 },
    });
    expect(UI_AUDIO_CUES["place-unit"].gain).toBe(1);
  });

  it("routes only successful player deployments to distinct placement sounds", () => {
    const router = new DeploymentAudioEventRouter();
    const playerUnit = stampBattleEvent({
      type: "deployment-succeeded",
      faction: "verdant",
      deploymentId: "verdant-swordsman-1",
      entityType: "squad",
      kind: "swordsman",
      squadId: "verdant-swordsman-1-squad",
      unitIds: ["verdant-swordsman-1-member-1"],
      quantity: 1,
      coordinate: { q: 0, r: 2 },
      position: { x: 0, z: 4 },
    }, 4, 1);
    const playerBuilding = stampBattleEvent({
      type: "deployment-succeeded",
      faction: "verdant",
      deploymentId: "verdant-barracks-2",
      entityType: "building",
      kind: "barracks",
      buildingId: "verdant-barracks-2",
      quantity: 1,
      coordinate: { q: 1, r: 3 },
      position: { x: 2, z: 5 },
    }, 5, 2);

    expect(router.consume([playerBuilding, playerUnit])).toEqual([
      "place-unit",
      "place-building",
    ]);
    expect(router.consume([playerUnit, playerBuilding])).toEqual([]);
    router.reset();
    expect(router.consume([playerUnit])).toEqual(["place-unit"]);
  });

  it("ignores enemy deployments and every combat event", () => {
    const router = new DeploymentAudioEventRouter();
    const enemyDeployment = stampBattleEvent({
      type: "deployment-succeeded",
      faction: "crimson",
      deploymentId: "crimson-gold-mine-1",
      entityType: "building",
      kind: "gold-mine",
      buildingId: "crimson-gold-mine-1",
      quantity: 1,
      coordinate: { q: 0, r: -3 },
      position: { x: 0, z: -5 },
    }, 8, 3);
    const combatEvent = stampBattleEvent({
      type: "unit-died",
      unitId: "v-1",
      killerId: "c-1",
    }, 9, 3.5);

    expect(router.consume([enemyDeployment, combatEvent])).toEqual([]);
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

    pool.play("/one.mp3", 0.5, 1);
    pool.play("/two.mp3", 0.6, 1);
    pool.play("/three.mp3", 0.7, 1);

    expect(voices).toHaveLength(2);
    expect(voices.filter((voice) => !voice.paused)).toHaveLength(2);
    const latestVoice = voices.find((voice) => voice.src === "/three.mp3");
    expect(latestVoice).toBeDefined();
    expect(latestVoice?.volume).toBeCloseTo(0.7);
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
