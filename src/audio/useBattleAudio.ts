import { useCallback, useEffect, useRef } from "react";

import type { BattleState } from "../game/battle";
import {
  BattleMusicPlayer,
  COMBAT_AUDIO_BUS_CAPACITIES,
  COMBAT_AUDIO_CUES,
  CombatAudioEventRouter,
  DeploymentAudioEventRouter,
  ReusableAudioPool,
  SandboxAudioEventRouter,
  UI_AUDIO_CUES,
  resolveCombatAudioPlayback,
  scaleAudioGain,
  type AudioVoice,
  type BattleMusicScene,
  type CombatAudioBus,
  type CombatAudioCueRequest,
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
    system.current?.process(battle);
  }, [battle]);

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
  readonly #deploymentRouter = new DeploymentAudioEventRouter();
  readonly #combatRouter = new CombatAudioEventRouter();
  readonly #sandboxRouter = new SandboxAudioEventRouter();
  readonly #uiPool = new ReusableAudioPool(1, createHtmlAudioVoice);
  readonly #combatPools = createCombatAudioPools();
  readonly #music = new BattleMusicPlayer(createHtmlAudioVoice);
  readonly #preloads = [
    ...Object.values(UI_AUDIO_CUES).map(({ src }) => src),
    ...Object.values(COMBAT_AUDIO_CUES).flatMap(({ variants }) => (
      variants.map((variant) => `/audio/battle/${variant}`)
    )),
  ].map((src) => {
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
    if (!enabled) {
      this.#uiPool.stopAll();
      for (const pool of this.#combatPools.values()) pool.stopAll();
    }
    this.#syncMusic();
  }

  setScene(scene: BattleMusicScene | null, revision: number): void {
    this.#music.setScene(scene, revision);
  }

  process(battle: BattleState): void {
    for (const cue of this.#deploymentRouter.consume(battle.events)) this.playUiCue(cue);
    for (const cue of this.#sandboxRouter.consume(battle)) this.playUiCue(cue);
    for (const request of this.#combatRouter.consume(
      battle.events,
      [...battle.units, ...battle.neutralMonsters],
    )) this.#playCombatCue(request);
  }

  playUiCue(cue: UiAudioCue): void {
    if (!this.#enabled || !this.#unlocked || this.#disposed) return;
    const settings = UI_AUDIO_CUES[cue];
    this.#uiPool.play(settings.src, settings.gain, 1);
  }

  reset(): void {
    this.#deploymentRouter.reset();
    this.#combatRouter.reset();
    this.#sandboxRouter.reset();
    this.#uiPool.stopAll();
    for (const pool of this.#combatPools.values()) pool.stopAll();
  }

  dispose(): void {
    this.#disposed = true;
    this.#deploymentRouter.reset();
    this.#combatRouter.reset();
    this.#sandboxRouter.reset();
    this.#uiPool.stopAll();
    for (const pool of this.#combatPools.values()) pool.stopAll();
    for (const voice of this.#preloads) voice.pause();
    this.#music.dispose();
  }

  #playCombatCue(request: CombatAudioCueRequest): void {
    if (!this.#enabled || !this.#unlocked || this.#disposed) return;
    const playback = resolveCombatAudioPlayback(request);
    if (!playback) return;
    this.#combatPools.get(playback.bus)?.play(
      playback.src,
      playback.gain,
      playback.playbackRate,
    );
  }

  #syncMusic(): void {
    this.#music.setEnabled(this.#enabled && this.#unlocked && !this.#disposed);
  }
}

function createCombatAudioPools(): ReadonlyMap<CombatAudioBus, ReusableAudioPool> {
  const pools = new Map<CombatAudioBus, ReusableAudioPool>();
  for (const bus of Object.keys(COMBAT_AUDIO_BUS_CAPACITIES) as CombatAudioBus[]) {
    pools.set(bus, new ReusableAudioPool(
      COMBAT_AUDIO_BUS_CAPACITIES[bus],
      createHtmlAudioVoice,
      scaleAudioGain,
    ));
  }
  return pools;
}

export function musicSceneForWinner(
  winner: BattleState["winner"],
): BattleMusicScene | null {
  if (winner === null) return null;
  if (winner === "draw") return "draw";
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
