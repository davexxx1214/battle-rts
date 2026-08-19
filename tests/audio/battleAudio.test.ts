import { describe, expect, it, vi } from "vitest";

import {
  BattleMusicPlayer,
  COMBAT_AUDIO_CUES,
  CombatAudioEventRouter,
  DEFAULT_AUDIO_ENABLED,
  DeploymentAudioEventRouter,
  ReusableAudioPool,
  UI_AUDIO_CUES,
  scaleAudioGain,
  type AudioVoice,
} from "../../src/audio/battleAudio";
import { stampBattleEvent } from "../../src/game/events";

describe("battle audio", () => {
  it("keeps audio off by default and keeps the shared mix restrained", () => {
    expect(DEFAULT_AUDIO_ENABLED).toBe(false);
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

  it("keeps human ranged cues and two variants for every undead attack", () => {
    expect(Object.keys(COMBAT_AUDIO_CUES)).toEqual([
      "ranger.attack",
      "catapult.attack",
      "catapult.impact",
      "undead.spearman.attack",
      "undead.knight.attack",
      "undead.ranger.attack",
      "undead.mage.lightning",
      "undead.bone-dragon.breath",
    ]);
    expect(COMBAT_AUDIO_CUES["ranger.attack"].variants).toEqual(["draw-bow.wav"]);
    for (const cue of Object.keys(COMBAT_AUDIO_CUES).filter((cue) => (
      cue.startsWith("undead.")
    )) as (keyof typeof COMBAT_AUDIO_CUES)[]) {
      expect(COMBAT_AUDIO_CUES[cue].variants).toHaveLength(2);
      expect(COMBAT_AUDIO_CUES[cue].variants.every((variant) => (
        variant.startsWith("undead_") && variant.endsWith(".wav")
      ))).toBe(true);
    }
    const variants = Object.values(COMBAT_AUDIO_CUES).flatMap((cue) => cue.variants);
    expect(variants.every((variant) => !/ambient|command|horn/.test(variant))).toBe(true);
  });

  it("routes only bow releases and catapult launches or impacts", () => {
    const router = new CombatAudioEventRouter();
    const point = { x: 0, z: 0 };
    const events = [
      stampBattleEvent({
        type: "attack-started",
        attackerId: "knight",
        targetId: "target",
        targetType: "unit",
        role: "knight",
        origin: point,
        targetPosition: point,
      }, 10, 1),
      stampBattleEvent({
        type: "attack-started",
        attackerId: "tower",
        targetId: "target",
        targetType: "unit",
        role: "arrow-tower",
        origin: point,
        targetPosition: point,
      }, 11, 1),
      stampBattleEvent({
        type: "attack-started",
        attackerId: "castle",
        targetId: "target",
        targetType: "unit",
        role: "castle",
        origin: point,
        targetPosition: point,
      }, 12, 1),
      stampBattleEvent({
        type: "projectile-hit",
        projectileId: "mage-shot",
        attackerId: "mage",
        targetId: "target",
        targetType: "unit",
        role: "mage",
        position: point,
        splashRadius: 1,
      }, 13, 1),
      stampBattleEvent({
        type: "projectile-hit",
        projectileId: "arrow",
        attackerId: "ranger",
        targetId: "target",
        targetType: "unit",
        role: "ranger",
        position: point,
        splashRadius: 0,
      }, 14, 1),
      stampBattleEvent({
        type: "damage-applied",
        sourceId: "knight",
        sourceRole: "knight",
        sourcePosition: point,
        targetId: "target",
        targetType: "unit",
        targetPosition: point,
        amount: 10,
      }, 15, 1),
      stampBattleEvent({
        type: "unit-died",
        unitId: "target",
        killerId: "knight",
      }, 16, 1),
      stampBattleEvent({
        type: "attack-started",
        attackerId: "catapult",
        targetId: "target",
        targetType: "unit",
        role: "catapult",
        origin: point,
        targetPosition: point,
      }, 17, 1),
      stampBattleEvent({
        type: "projectile-hit",
        projectileId: "stone",
        attackerId: "catapult",
        targetId: "target",
        targetType: "unit",
        role: "catapult",
        position: point,
        splashRadius: 2,
      }, 18, 1),
      stampBattleEvent({
        type: "damage-applied",
        sourceId: "knight",
        sourceRole: "knight",
        sourcePosition: point,
        targetId: "barracks",
        targetType: "building",
        targetPosition: point,
        amount: 10,
      }, 19, 1),
      stampBattleEvent({
        type: "building-destroyed",
        buildingId: "barracks",
        faction: "crimson",
        kind: "barracks",
        scheduledAt: 1,
        coordinate: { q: 0, r: 0 },
        position: point,
        removeAt: 2,
        cause: "damage",
      }, 20, 1),
      stampBattleEvent({
        type: "building-destroyed",
        buildingId: "expired-mine",
        faction: "verdant",
        kind: "gold-mine",
        scheduledAt: 1,
        coordinate: { q: 0, r: 0 },
        position: point,
        removeAt: 2,
        cause: "expired",
      }, 21, 1),
      stampBattleEvent({
        type: "castle-activated",
        castleId: "verdant-castle",
        faction: "verdant",
        position: point,
      }, 22, 1),
      stampBattleEvent({
        type: "attack-started",
        attackerId: "ranger",
        targetId: "target",
        targetType: "unit",
        role: "ranger",
        origin: point,
        targetPosition: point,
      }, 23, 1),
    ];

    expect(router.consume(events)).toEqual([
      { cue: "ranger.attack", sequence: 11 },
      { cue: "ranger.attack", sequence: 12 },
      { cue: "catapult.attack", sequence: 17 },
      { cue: "catapult.impact", sequence: 18 },
      { cue: "ranger.attack", sequence: 23 },
    ]);
    expect(router.consume(events)).toEqual([]);
    router.reset();
    expect(router.consume([events[0]!])).toEqual([]);
  });

  it("routes every undead attack and synchronizes lightning to projectile impact", () => {
    const router = new CombatAudioEventRouter();
    const point = { x: 0, z: 0 };
    const attacks = [
      stampBattleEvent({
        type: "attack-started",
        attackerId: "undead-spearman",
        targetId: "target",
        targetType: "unit",
        role: "spearman",
        origin: point,
        targetPosition: point,
      }, 30, 1),
      stampBattleEvent({
        type: "attack-started",
        attackerId: "undead-knight",
        targetId: "target",
        targetType: "unit",
        role: "knight",
        origin: point,
        targetPosition: point,
      }, 31, 1),
      stampBattleEvent({
        type: "attack-started",
        attackerId: "undead-ranger",
        targetId: "target",
        targetType: "unit",
        role: "ranger",
        origin: point,
        targetPosition: point,
      }, 32, 1),
      stampBattleEvent({
        type: "attack-started",
        attackerId: "undead-mage",
        targetId: "target",
        targetType: "unit",
        role: "mage",
        origin: point,
        targetPosition: point,
      }, 33, 1),
      stampBattleEvent({
        type: "projectile-hit",
        projectileId: "undead-lightning",
        attackerId: "undead-mage",
        targetId: "target",
        targetType: "unit",
        role: "mage",
        position: point,
        splashRadius: 3,
      }, 34, 1),
      stampBattleEvent({
        type: "attack-started",
        attackerId: "undead-bone-dragon",
        targetId: "target",
        targetType: "unit",
        role: "bone-dragon",
        origin: point,
        targetPosition: point,
      }, 35, 1),
    ];
    const sources = [
      "undead-spearman",
      "undead-knight",
      "undead-ranger",
      "undead-mage",
      "undead-bone-dragon",
    ].map((id) => ({ id, combatProfile: "undead" as const }));

    expect(router.consume(attacks, sources)).toEqual([
      { cue: "undead.spearman.attack", sequence: 30 },
      { cue: "undead.knight.attack", sequence: 31 },
      { cue: "undead.ranger.attack", sequence: 32 },
      { cue: "undead.mage.lightning", sequence: 34 },
      { cue: "undead.bone-dragon.breath", sequence: 35 },
    ]);
  });

  it("keeps delayed undead projectile audio after its attacker leaves the battlefield", () => {
    const router = new CombatAudioEventRouter();
    const point = { x: 0, z: 0 };
    router.consume([], [{ id: "departed-mage", combatProfile: "undead" }]);

    const requests = router.consume([stampBattleEvent({
      type: "projectile-hit",
      projectileId: "delayed-lightning",
      attackerId: "departed-mage",
      targetId: "target",
      targetType: "unit",
      role: "mage",
      position: point,
      splashRadius: 3.1,
    }, 40, 2)], []);

    expect(requests).toEqual([{ cue: "undead.mage.lightning", sequence: 40 }]);
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
