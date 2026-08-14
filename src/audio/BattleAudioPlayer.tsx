import { useEffect, useRef } from "react";

import type { BattleState } from "../game/battle";
import {
  BattleAudioEventRouter,
  BattleMusicPlayer,
  ReusableAudioPool,
  type AudioVoice,
  type BattleAudioCueRequest,
  type BattleMusicScene,
} from "./battleAudio";

interface RuntimeCue {
  readonly bus: string;
  readonly variants: readonly string[];
  readonly gain: readonly [number, number];
  readonly pitch: readonly [number, number];
  readonly probability?: number;
  readonly loop?: boolean;
}

interface RuntimeCueCatalog {
  readonly version: number;
  readonly buses: Readonly<Record<string, { readonly maxConcurrent: number }>>;
  readonly cues: Readonly<Record<string, RuntimeCue>>;
}

interface AudioCommandMarker {
  readonly kind: "move" | "attack" | "attack-move";
  readonly revision: number;
}

export function BattleAudio({
  battle,
  resetToken,
  commandMarker,
  enabled,
}: {
  readonly battle: BattleState;
  readonly resetToken: number;
  readonly commandMarker: AudioCommandMarker | null;
  readonly enabled: boolean;
}) {
  const system = useRef<BrowserBattleAudioSystem | null>(null);
  const previousWinner = useRef<BattleState["winner"]>(null);

  useEffect(() => {
    const audio = new BrowserBattleAudioSystem();
    system.current = audio;
    void audio.load();
    const unlock = () => audio.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      audio.dispose();
      system.current = null;
    };
  }, []);

  useEffect(() => {
    system.current?.process(battle.events);
  }, [battle.events]);

  useEffect(() => {
    system.current?.reset();
    previousWinner.current = null;
  }, [resetToken]);

  useEffect(() => {
    system.current?.setScene(musicSceneForWinner(battle.winner), resetToken);
  }, [battle.winner, resetToken]);

  useEffect(() => {
    system.current?.setEnabled(enabled);
  }, [enabled]);

  useEffect(() => {
    if (battle.winner === previousWinner.current) return;
    if (battle.winner === "verdant") {
      system.current?.play({ cue: "battle.victory", sequence: battle.nextEventSequence });
    }
    previousWinner.current = battle.winner;
  }, [battle.nextEventSequence, battle.winner]);

  useEffect(() => {
    if (!commandMarker) return;
    system.current?.play({
      cue: commandMarker.kind === "move" ? "command.move" : "command.attack",
      sequence: commandMarker.revision,
    });
  }, [commandMarker]);

  return null;
}

class BrowserBattleAudioSystem {
  readonly #router = new BattleAudioEventRouter();
  readonly #pools = new Map<string, ReusableAudioPool>();
  readonly #music = new BattleMusicPlayer(createHtmlAudioVoice);
  #catalog: RuntimeCueCatalog | null = null;
  #enabled = false;
  #unlocked = false;
  #disposed = false;
  #ambienceStarted = false;

  async load(): Promise<void> {
    try {
      const response = await fetch("/audio/battle/cues.json");
      if (!response.ok) return;
      const catalog = await response.json() as RuntimeCueCatalog;
      if (this.#disposed || catalog.version !== 1) return;
      this.#catalog = catalog;
      for (const [bus, settings] of Object.entries(catalog.buses)) {
        this.#pools.set(bus, new ReusableAudioPool(
          settings.maxConcurrent,
          createHtmlAudioVoice,
        ));
      }
      this.#startAmbience();
    } catch {
      this.#catalog = null;
    }
  }

  unlock(): void {
    this.#unlocked = true;
    this.#syncPlayback();
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.#enabled) return;
    this.#enabled = enabled;
    if (!enabled) {
      for (const pool of this.#pools.values()) pool.stopAll();
      this.#ambienceStarted = false;
    }
    this.#syncPlayback();
  }

  setScene(scene: BattleMusicScene, revision: number): void {
    this.#music.setScene(scene, revision);
  }

  process(events: BattleState["events"]): void {
    for (const request of this.#router.consume(events)) this.play(request);
  }

  play(request: BattleAudioCueRequest): void {
    if (!this.#enabled || !this.#unlocked || !this.#catalog) return;
    const cue = this.#catalog.cues[request.cue];
    if (!cue || cue.variants.length === 0) return;
    if (cue.probability !== undefined) {
      const probabilityRoll = deterministicUnitValue(
        request.sequence * 47 + request.cue.length * 19,
      );
      if (probabilityRoll >= cue.probability) return;
    }
    const pool = this.#pools.get(cue.bus);
    if (!pool) return;
    const variant = cue.variants[positiveModulo(request.sequence, cue.variants.length)]!;
    const mix = deterministicUnitValue(request.sequence * 17 + request.cue.length * 31);
    const gain = lerp(cue.gain[0], cue.gain[1], mix);
    const pitch = lerp(cue.pitch[0], cue.pitch[1], 1 - mix);
    pool.play(`/audio/battle/${variant}`, gain, pitch, cue.loop ?? false);
  }

  reset(): void {
    this.#router.reset();
    for (const pool of this.#pools.values()) pool.stopAll();
    this.#ambienceStarted = false;
    this.#startAmbience();
  }

  dispose(): void {
    this.#disposed = true;
    this.#router.reset();
    for (const pool of this.#pools.values()) pool.stopAll();
    this.#pools.clear();
    this.#music.dispose();
  }

  #startAmbience(): void {
    if (
      this.#disposed
      || !this.#enabled
      || !this.#unlocked
      || !this.#catalog
      || this.#ambienceStarted
    ) return;
    this.#ambienceStarted = true;
    this.play({ cue: "ambience.wind", sequence: 0 });
  }

  #syncPlayback(): void {
    const canPlay = this.#enabled && this.#unlocked && !this.#disposed;
    this.#music.setEnabled(canPlay);
    if (canPlay) this.#startAmbience();
  }
}

function musicSceneForWinner(winner: BattleState["winner"]): BattleMusicScene {
  if (winner === null) return "battle";
  return winner === "verdant" ? "victory" : "defeat";
}

function createHtmlAudioVoice(): AudioVoice {
  const element = new Audio();
  element.preload = "auto";
  return {
    get src() { return element.src; },
    set src(value: string) {
      if (element.getAttribute("src") === value) return;
      element.src = value;
      element.load();
    },
    get currentTime() { return element.currentTime; },
    set currentTime(value: number) { element.currentTime = value; },
    get volume() { return element.volume; },
    set volume(value: number) { element.volume = value; },
    get playbackRate() { return element.playbackRate; },
    set playbackRate(value: number) { element.playbackRate = value; },
    get loop() { return element.loop; },
    set loop(value: boolean) { element.loop = value; },
    get paused() { return element.paused; },
    set paused(_value: boolean) { /* HTMLAudioElement owns this state. */ },
    pause: () => element.pause(),
    play: () => element.play(),
  };
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
