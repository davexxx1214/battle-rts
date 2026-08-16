import type { BattleEvent } from "../game/events";

export interface AudioVoice {
  src: string;
  currentTime: number;
  volume: number;
  playbackRate: number;
  loop: boolean;
  paused: boolean;
  pause: () => void;
  play: () => Promise<void> | void;
}

export type UiAudioCue = "select" | "place-unit" | "place-building";

export type CombatAudioCue =
  | "ranger.attack"
  | "catapult.attack"
  | "catapult.impact";

export type CombatAudioBus = "projectiles" | "siege";

export interface CombatAudioCueRequest {
  readonly cue: CombatAudioCue;
  readonly sequence: number;
}

interface CombatAudioCueSettings {
  readonly bus: CombatAudioBus;
  readonly variants: readonly string[];
  readonly gain: readonly [number, number];
  readonly pitch: readonly [number, number];
}

export interface CombatAudioPlayback {
  readonly bus: CombatAudioBus;
  readonly src: string;
  readonly gain: number;
  readonly playbackRate: number;
}

export type BattleMusicScene = "victory" | "defeat";

export const DEFAULT_AUDIO_ENABLED = true;

const MASTER_VOLUME_MULTIPLIER = 0.5;

const MUSIC_TRACKS: Readonly<Record<BattleMusicScene, readonly string[]>> = {
  victory: [
    "/audio/music/victory1.mp3",
    "/audio/music/victory2.mp3",
    "/audio/music/victory3.mp3",
  ],
  defeat: ["/audio/music/fail.mp3"],
};

export const UI_AUDIO_CUES: Readonly<
  Record<UiAudioCue, { readonly src: string; readonly gain: number }>
> = {
  select: { src: "/audio/ui/organic/hover.mp3", gain: 0.25 },
  "place-unit": { src: "/audio/ui/organic/drop.mp3", gain: 1 },
  "place-building": { src: "/audio/ui/organic/snap.mp3", gain: 0.35 },
};

export const COMBAT_AUDIO_BUS_CAPACITIES: Readonly<Record<CombatAudioBus, number>> = {
  projectiles: 4,
  siege: 3,
};

export const COMBAT_AUDIO_CUES: Readonly<Record<CombatAudioCue, CombatAudioCueSettings>> = {
  "ranger.attack": {
    bus: "projectiles",
    variants: ["draw-bow.wav"],
    gain: [0.7, 0.84],
    pitch: [0.97, 1.03],
  },
  "catapult.attack": {
    bus: "siege",
    variants: ["catapult_launch_01.wav", "catapult_launch_02.wav"],
    gain: [0.74, 0.88],
    pitch: [0.97, 1.03],
  },
  "catapult.impact": {
    bus: "siege",
    variants: ["catapult_impact_01.wav", "catapult_impact_02.wav"],
    gain: [0.82, 0.98],
    pitch: [0.96, 1.02],
  },
};

export function scaleAudioGain(gain: number): number {
  return clampAudioGain(gain) * MASTER_VOLUME_MULTIPLIER;
}

export class BattleMusicPlayer {
  readonly #voice: AudioVoice;
  readonly #random: () => number;
  #enabled = false;
  #scene: BattleMusicScene | null = null;
  #sceneRevision = -1;
  #track: string | null = null;

  constructor(createVoice: () => AudioVoice, random: () => number = Math.random) {
    this.#voice = createVoice();
    this.#random = random;
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.#enabled) return;
    this.#enabled = enabled;
    if (enabled) this.#playSelectedTrack(false);
    else this.#stop(false);
  }

  setScene(scene: BattleMusicScene | null, revision: number): void {
    if (scene === this.#scene && revision === this.#sceneRevision) return;
    this.#scene = scene;
    this.#sceneRevision = revision;
    this.#track = scene ? this.#selectTrack(scene) : null;
    this.#stop(true);
    if (this.#enabled) this.#playSelectedTrack(true);
  }

  dispose(): void {
    this.#enabled = false;
    this.#stop(true);
  }

  #selectTrack(scene: BattleMusicScene): string {
    const tracks = MUSIC_TRACKS[scene];
    const roll = Math.min(0.999999, Math.max(0, this.#random()));
    return tracks[Math.floor(roll * tracks.length)]!;
  }

  #playSelectedTrack(restart: boolean): void {
    if (!this.#track) return;
    this.#voice.src = this.#track;
    if (restart) this.#voice.currentTime = 0;
    this.#voice.volume = scaleAudioGain(1);
    this.#voice.playbackRate = 1;
    this.#voice.loop = false;
    const result = this.#voice.play();
    if (result instanceof Promise) void result.catch(() => undefined);
  }

  #stop(resetPosition: boolean): void {
    this.#voice.pause();
    if (resetPosition) this.#voice.currentTime = 0;
    this.#voice.loop = false;
  }
}

export class ReusableAudioPool {
  readonly #voices: AudioVoice[];
  readonly #scaleGain: (gain: number) => number;
  #nextVoice = 0;

  constructor(
    capacity: number,
    createVoice: () => AudioVoice,
    scaleGain: (gain: number) => number = clampAudioGain,
  ) {
    this.#voices = Array.from(
      { length: Math.max(1, Math.floor(capacity)) },
      createVoice,
    );
    this.#scaleGain = scaleGain;
  }

  play(src: string, volume: number, playbackRate: number, loop = false): void {
    const availableIndex = this.#voices.findIndex((voice) => voice.paused);
    const index = availableIndex >= 0 ? availableIndex : this.#nextVoice;
    const voice = this.#voices[index]!;
    this.#nextVoice = (index + 1) % this.#voices.length;
    if (!voice.paused) voice.pause();
    voice.src = src;
    voice.currentTime = 0;
    voice.volume = this.#scaleGain(volume);
    voice.playbackRate = playbackRate;
    voice.loop = loop;
    const result = voice.play();
    if (result instanceof Promise) void result.catch(() => undefined);
  }

  stopAll(): void {
    for (const voice of this.#voices) {
      voice.pause();
      voice.currentTime = 0;
      voice.loop = false;
    }
  }
}

export class CombatAudioEventRouter {
  #lastSequence = -1;

  consume(events: readonly BattleEvent[]): CombatAudioCueRequest[] {
    const requests: CombatAudioCueRequest[] = [];
    for (const event of [...events].sort((first, second) => first.sequence - second.sequence)) {
      if (event.sequence <= this.#lastSequence) continue;
      this.#lastSequence = event.sequence;
      for (const cue of combatEventCues(event)) {
        requests.push({ cue, sequence: event.sequence });
      }
    }
    return requests;
  }

  reset(): void {
    this.#lastSequence = -1;
  }
}

export function resolveCombatAudioPlayback(
  request: CombatAudioCueRequest,
): CombatAudioPlayback | null {
  const settings = COMBAT_AUDIO_CUES[request.cue];
  const variant = settings.variants[positiveModulo(
    request.sequence,
    settings.variants.length,
  )]!;
  const mix = deterministicUnitValue(request.sequence * 17 + request.cue.length * 31);
  return {
    bus: settings.bus,
    src: `/audio/battle/${variant}`,
    gain: lerp(settings.gain[0], settings.gain[1], mix),
    playbackRate: lerp(settings.pitch[0], settings.pitch[1], 1 - mix),
  };
}

function combatEventCues(event: BattleEvent): CombatAudioCue[] {
  if (event.type === "attack-started") {
    if (event.role === "ranger" || event.role === "castle" || event.role === "arrow-tower") {
      return ["ranger.attack"];
    }
    if (event.role === "catapult") return ["catapult.attack"];
    return [];
  }
  if (event.type === "projectile-hit") {
    if (event.role === "catapult") return ["catapult.impact"];
    return [];
  }
  return [];
}

function clampAudioGain(gain: number): number {
  return Math.min(1, Math.max(0, gain));
}

export class DeploymentAudioEventRouter {
  #lastSequence = -1;

  consume(events: readonly BattleEvent[]): UiAudioCue[] {
    const cues: UiAudioCue[] = [];
    for (const event of [...events].sort((first, second) => first.sequence - second.sequence)) {
      if (event.sequence <= this.#lastSequence) continue;
      this.#lastSequence = event.sequence;
      if (event.type !== "deployment-succeeded" || event.faction !== "verdant") continue;
      cues.push(event.entityType === "building" ? "place-building" : "place-unit");
    }
    return cues;
  }

  reset(): void {
    this.#lastSequence = -1;
  }
}

function deterministicUnitValue(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}
