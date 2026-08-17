import type { BattleState } from "../../../src/game/battle";
import {
  BattleMusicPlayer,
  COMBAT_AUDIO_BUS_CAPACITIES,
  CombatAudioEventRouter,
  DeploymentAudioEventRouter,
  ReusableAudioPool,
  UI_AUDIO_CUES,
  resolveCombatAudioPlayback,
  scaleAudioGain,
  type CombatAudioBus,
  type UiAudioCue,
} from "../../../src/audio/battleAudio";

export class PlayCanvasBattleAudio {
  private readonly combatRouter = new CombatAudioEventRouter();
  private readonly deploymentRouter = new DeploymentAudioEventRouter();
  private readonly combatPools: Readonly<Record<CombatAudioBus, ReusableAudioPool>>;
  private readonly uiPool = new ReusableAudioPool(4, createVoice, scaleAudioGain);
  private readonly music = new BattleMusicPlayer(createVoice);
  private enabled = true;
  private sceneRevision = 0;

  constructor() {
    this.combatPools = {
      projectiles: new ReusableAudioPool(
        COMBAT_AUDIO_BUS_CAPACITIES.projectiles,
        createVoice,
        scaleAudioGain,
      ),
      siege: new ReusableAudioPool(
        COMBAT_AUDIO_BUS_CAPACITIES.siege,
        createVoice,
        scaleAudioGain,
      ),
    };
    this.music.setEnabled(true);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.music.setEnabled(enabled);
    if (!enabled) {
      this.uiPool.stopAll();
      for (const pool of Object.values(this.combatPools)) pool.stopAll();
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  playUi(cue: UiAudioCue): void {
    if (!this.enabled) return;
    const settings = UI_AUDIO_CUES[cue];
    this.uiPool.play(settings.src, settings.gain, 1);
  }

  sync(battle: BattleState): void {
    const combat = this.combatRouter.consume(battle.events);
    const deployment = this.deploymentRouter.consume(battle.events);
    if (this.enabled) {
      for (const request of combat) {
        const playback = resolveCombatAudioPlayback(request);
        if (!playback) continue;
        this.combatPools[playback.bus].play(
          playback.src,
          playback.gain,
          playback.playbackRate,
        );
      }
      for (const cue of deployment) this.playUi(cue);
    }
    this.music.setScene(
      battle.winner === "verdant"
        ? "victory"
        : battle.winner === "crimson" || battle.winner === "draw"
          ? "defeat"
          : null,
      this.sceneRevision,
    );
  }

  reset(): void {
    this.sceneRevision += 1;
    this.combatRouter.reset();
    this.deploymentRouter.reset();
    this.uiPool.stopAll();
    for (const pool of Object.values(this.combatPools)) pool.stopAll();
    this.music.setScene(null, this.sceneRevision);
  }
}

function createVoice(): HTMLAudioElement {
  const voice = new Audio();
  voice.preload = "auto";
  return voice;
}
