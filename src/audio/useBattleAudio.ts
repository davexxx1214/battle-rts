import { useCallback, useEffect, useRef } from "react";

import type { BattleState } from "../game/battle";
import {
  BattleMusicPlayer,
  DeploymentAudioEventRouter,
  ReusableAudioPool,
  UI_AUDIO_CUES,
  type AudioVoice,
  type BattleMusicScene,
  type UiAudioCue,
} from "./battleAudio";

interface UseBattleAudioOptions {
  readonly battle: BattleState;
  readonly resetToken: number;
  readonly enabled: boolean;
}

export function useBattleAudio({
  battle,
  resetToken,
  enabled,
}: UseBattleAudioOptions): (cue: UiAudioCue) => void {
  const system = useRef<BrowserBattleAudioSystem | null>(null);

  useEffect(() => {
    const audio = new BrowserBattleAudioSystem();
    system.current = audio;
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
    system.current?.reset();
  }, [resetToken]);

  useEffect(() => {
    system.current?.process(battle.events);
  }, [battle.events]);

  useEffect(() => {
    system.current?.setScene(musicSceneForWinner(battle.winner), resetToken);
  }, [battle.winner, resetToken]);

  useEffect(() => {
    system.current?.setEnabled(enabled);
  }, [enabled]);

  return useCallback((cue: UiAudioCue) => {
    system.current?.playUiCue(cue);
  }, []);
}

class BrowserBattleAudioSystem {
  readonly #router = new DeploymentAudioEventRouter();
  readonly #uiPool = new ReusableAudioPool(1, createHtmlAudioVoice);
  readonly #music = new BattleMusicPlayer(createHtmlAudioVoice);
  readonly #preloads = Object.values(UI_AUDIO_CUES).map(({ src }) => {
    const voice = createHtmlAudioVoice();
    voice.src = src;
    return voice;
  });
  #enabled = false;
  #unlocked = false;
  #disposed = false;

  unlock(): void {
    this.#unlocked = true;
    this.#syncMusic();
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.#enabled) return;
    this.#enabled = enabled;
    if (!enabled) this.#uiPool.stopAll();
    this.#syncMusic();
  }

  setScene(scene: BattleMusicScene | null, revision: number): void {
    this.#music.setScene(scene, revision);
  }

  process(events: BattleState["events"]): void {
    for (const cue of this.#router.consume(events)) this.playUiCue(cue);
  }

  playUiCue(cue: UiAudioCue): void {
    if (!this.#enabled || !this.#unlocked || this.#disposed) return;
    const settings = UI_AUDIO_CUES[cue];
    this.#uiPool.play(settings.src, settings.gain, 1);
  }

  reset(): void {
    this.#router.reset();
    this.#uiPool.stopAll();
  }

  dispose(): void {
    this.#disposed = true;
    this.#router.reset();
    this.#uiPool.stopAll();
    for (const voice of this.#preloads) voice.pause();
    this.#music.dispose();
  }

  #syncMusic(): void {
    this.#music.setEnabled(this.#enabled && this.#unlocked && !this.#disposed);
  }
}

function musicSceneForWinner(winner: BattleState["winner"]): BattleMusicScene | null {
  if (winner === null) return null;
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
