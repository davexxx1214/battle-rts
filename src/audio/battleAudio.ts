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

export interface BattleAudioCueRequest {
  readonly cue: string;
  readonly sequence: number;
}

export type BattleMusicScene = "battle" | "victory" | "defeat";

const MASTER_VOLUME_MULTIPLIER = 0.5;

const MUSIC_TRACKS: Readonly<Record<BattleMusicScene, readonly string[]>> = {
  battle: [
    "/audio/music/background1.mp3",
    "/audio/music/background2.mp3",
    "/audio/music/background3.mp3",
  ],
  victory: [
    "/audio/music/victory1.mp3",
    "/audio/music/victory2.mp3",
    "/audio/music/victory3.mp3",
  ],
  defeat: ["/audio/music/fail.mp3"],
};

export function scaleAudioGain(gain: number): number {
  return Math.min(1, Math.max(0, gain)) * MASTER_VOLUME_MULTIPLIER;
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

  setScene(scene: BattleMusicScene, revision: number): void {
    if (scene === this.#scene && revision === this.#sceneRevision) return;
    this.#scene = scene;
    this.#sceneRevision = revision;
    const tracks = MUSIC_TRACKS[scene];
    const roll = Math.min(0.999999, Math.max(0, this.#random()));
    this.#track = tracks[Math.floor(roll * tracks.length)]!;
    this.#stop(true);
    if (this.#enabled) this.#playSelectedTrack(true);
  }

  dispose(): void {
    this.#enabled = false;
    this.#stop(true);
  }

  #playSelectedTrack(restart: boolean): void {
    if (!this.#scene || !this.#track) return;
    this.#voice.src = this.#track;
    if (restart) this.#voice.currentTime = 0;
    this.#voice.volume = scaleAudioGain(1);
    this.#voice.playbackRate = 1;
    this.#voice.loop = this.#scene === "battle";
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
  #nextVoice = 0;

  constructor(capacity: number, createVoice: () => AudioVoice) {
    this.#voices = Array.from(
      { length: Math.max(1, Math.floor(capacity)) },
      createVoice,
    );
  }

  play(src: string, volume: number, playbackRate: number, loop = false): void {
    const availableIndex = this.#voices.findIndex((voice) => voice.paused);
    const index = availableIndex >= 0 ? availableIndex : this.#nextVoice;
    const voice = this.#voices[index]!;
    this.#nextVoice = (index + 1) % this.#voices.length;
    if (!voice.paused) voice.pause();
    voice.src = src;
    voice.currentTime = 0;
    voice.volume = scaleAudioGain(volume);
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

export class BattleAudioEventRouter {
  #lastSequence = -1;

  consume(
    events: readonly BattleEvent[],
  ): BattleAudioCueRequest[] {
    const requests: BattleAudioCueRequest[] = [];
    for (const event of [...events].sort((first, second) => first.sequence - second.sequence)) {
      if (event.sequence <= this.#lastSequence) continue;
      this.#lastSequence = event.sequence;
      const cues = eventCues(event);
      requests.push(...cues.map((cue) => ({ cue, sequence: event.sequence })));
    }
    return requests;
  }

  reset(): void {
    this.#lastSequence = -1;
  }
}

function eventCues(event: BattleEvent): string[] {
  if (event.type === "gold-full") {
    return event.faction === "verdant" ? ["command.attack"] : [];
  }
  if (event.type === "deployment-succeeded") return ["command.move"];
  if (event.type === "attack-started") {
    if (event.role === "knight") return ["knight.attack"];
    if (event.role === "ranger") return ["ranger.attack"];
    if (event.role === "catapult") return [];
    return ["mage.attack"];
  }
  if (event.type === "projectile-hit") {
    if (event.role === "catapult") return [];
    return [event.role === "mage" ? "mage.impact" : "ranger.impact"];
  }
  if (event.type === "unit-died") return ["unit.death"];
  if (event.type === "damage-applied") {
    const cues = event.sourceRole === "knight" ? ["knight.impact"] : [];
    cues.push("unit.hurt");
    return cues;
  }
  return [];
}
