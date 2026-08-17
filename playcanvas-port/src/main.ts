import "./styles.css";

import {
  createInitialBattle,
  type BattleState,
  type WorldPoint,
} from "../../src/game/battle";
import {
  advanceBattleSession,
  beginBattleSession,
  type BattleSessionState,
} from "../../src/game/battleSession";
import {
  deployBattleSessionEntity,
  getDeployableAvailability,
  previewDeployment,
  type DeploymentFailureReason,
} from "../../src/game/deployTransaction";
import { createArenaBattle } from "../../src/game/arenaBattle";
import { getMatchClock } from "../../src/game/economy";
import {
  DEPLOYABLE_CATEGORIES,
  GAME_RULES,
  type AiDifficulty,
  type DeployableKind,
} from "../../src/game/rules";
import type { GameMode } from "../../src/app/gameMode";
import { PlayCanvasBattlefield } from "./render/PlayCanvasBattlefield";
import { PlayCanvasBattleAudio } from "./audio/PlayCanvasBattleAudio";

interface DeployablePresentation {
  readonly kind: DeployableKind;
  readonly name: string;
  readonly detail: string;
  readonly image: string;
}

const SIMULATION_STEP_SECONDS = 0.05;
const DEPLOYABLES: readonly DeployablePresentation[] = [
  { kind: "spearman", name: "长枪兵", detail: "×2 · 低费近战", image: "/assets/ui/deployables/spearman.png" },
  { kind: "swordsman", name: "剑士", detail: "×3 · 近战前锋", image: "/assets/ui/deployables/swordsman.png" },
  { kind: "archer", name: "弓箭手", detail: "×2 · 远程单体", image: "/assets/ui/deployables/archer.png" },
  { kind: "mage", name: "法师", detail: "×2 · 范围法术", image: "/assets/ui/deployables/mage.png" },
  { kind: "catapult", name: "投石车", detail: "×1 · 重型攻城", image: "/assets/ui/deployables/catapult.png" },
  { kind: "guard-tower", name: "箭塔", detail: "限时远程防御", image: "/assets/ui/deployables/guard-tower.png" },
  { kind: "gold-mine", name: "金矿", detail: "周期产出金币", image: "/assets/ui/deployables/gold-mine.png" },
  { kind: "barracks", name: "兵营", detail: "周期生成剑士", image: "/assets/ui/deployables/barracks.png" },
] as const;

class PlayCanvasPortGame {
  private session: BattleSessionState = createSession("normal");
  private mode: GameMode = "normal";
  private difficulty: AiDifficulty = "normal";
  private selected: DeployableKind | null = null;
  private hoverWorld: WorldPoint | null = null;
  private accumulator = 0;
  private feedbackTimer = 0;
  private readonly audio = new PlayCanvasBattleAudio();
  private readonly renderer: PlayCanvasBattlefield;
  private readonly deployButtons = new Map<DeployableKind, HTMLButtonElement>();

  constructor() {
    const canvas = element<HTMLCanvasElement>("application");
    this.renderer = new PlayCanvasBattlefield(canvas, {
      onHoverWorld: (point) => this.onHoverWorld(point),
      onClickWorld: (point) => this.onClickWorld(point),
      onAssetProgress: (progress) => this.updateAssetProgress(progress),
    });
    this.buildDeploymentCards();
    this.bindUi();
    this.renderer.syncBattle(this.session.battle);
    this.audio.sync(this.session.battle);
    this.refreshUi();
    this.renderer.app.on("update", (delta: number) => this.update(delta));
  }

  private update(delta: number): void {
    if (this.feedbackTimer > 0) {
      this.feedbackTimer -= delta;
      if (this.feedbackTimer <= 0) element("feedback").classList.remove("open");
    }
    if (this.session.phase !== "engaged" || this.session.battle.winner) return;
    this.accumulator += Math.min(0.2, delta);
    const steps = Math.min(4, Math.floor(this.accumulator / SIMULATION_STEP_SECONDS));
    if (steps <= 0) return;
    this.accumulator -= steps * SIMULATION_STEP_SECONDS;
    const next = advanceBattleSession(
      this.session.battle,
      this.session.phase,
      steps,
      SIMULATION_STEP_SECONDS,
      this.difficulty,
    );
    if (next === this.session.battle) return;
    this.session = { ...this.session, battle: next };
    this.renderer.syncBattle(next);
    this.audio.sync(next);
    this.refreshUi();
  }

  private buildDeploymentCards(): void {
    const troops = element("troop-cards");
    const buildings = element("building-cards");
    for (const presentation of DEPLOYABLES) {
      const button = document.createElement("button");
      button.className = "deploy-card";
      button.type = "button";
      button.dataset.kind = presentation.kind;
      button.setAttribute("aria-pressed", "false");
      button.innerHTML = `
        <img src="${presentation.image}" alt="" draggable="false" />
        <span><strong>${presentation.name}</strong><small>${presentation.detail}</small></span>
        <b>${GAME_RULES.deployment.costs[presentation.kind]}</b>
      `;
      button.addEventListener("click", () => this.selectDeployable(presentation.kind));
      (DEPLOYABLE_CATEGORIES[presentation.kind] === "troop" ? troops : buildings).append(button);
      this.deployButtons.set(presentation.kind, button);
    }
  }

  private updateAssetProgress(progress: {
    readonly loaded: number;
    readonly total: number;
    readonly failed: number;
  }): void {
    const root = element("asset-progress");
    const percentage = progress.total === 0
      ? 0
      : Math.round(progress.loaded / progress.total * 100);
    const label = root.querySelector("strong");
    if (label) label.textContent = `${percentage}%`;
    root.classList.toggle("complete", progress.total > 0 && progress.loaded >= progress.total);
    root.classList.toggle("failed", progress.failed > 0);
    root.setAttribute("aria-label", progress.failed > 0
      ? `美术资源载入 ${percentage}%，${progress.failed} 个失败`
      : `美术资源载入 ${percentage}%`);
  }

  private bindUi(): void {
    element<HTMLButtonElement>("engage").addEventListener("click", () => this.engage());
    element<HTMLButtonElement>("reset").addEventListener("click", () => this.reset());
    element<HTMLButtonElement>("play-again").addEventListener("click", () => this.reset());
    element<HTMLButtonElement>("audio-toggle").addEventListener("click", () => {
      this.audio.setEnabled(!this.audio.isEnabled);
      const button = element<HTMLButtonElement>("audio-toggle");
      button.textContent = `音频：${this.audio.isEnabled ? "开" : "关"}`;
      button.setAttribute("aria-pressed", String(this.audio.isEnabled));
      if (this.audio.isEnabled) this.audio.playUi("select");
    });
    element<HTMLSelectElement>("difficulty").addEventListener("change", (event) => {
      this.difficulty = (event.currentTarget as HTMLSelectElement).value as AiDifficulty;
      this.showFeedback(`AI 难度已设为${difficultyLabel(this.difficulty)}`, "info");
    });
    document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => this.changeMode(button.dataset.mode as GameMode));
    });
    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      this.selected = null;
      this.hoverWorld = null;
      this.renderer.setDeploymentPreview(null);
      this.refreshCards();
      this.showFeedback("已取消部署", "info");
    });
  }

  private engage(): void {
    this.audio.playUi("select");
    this.session = beginBattleSession(this.session);
    element("briefing").classList.remove("open");
    this.renderer.syncBattle(this.session.battle);
    this.audio.sync(this.session.battle);
    this.refreshUi();
    this.showFeedback(
      this.mode === "arena"
        ? "双方军团开始自动推进，你仍可部署援军"
        : "选择左侧卡牌，然后点击苍蓝势力范围部署",
      "info",
      3.2,
    );
  }

  private reset(): void {
    this.session = createSession(this.mode);
    this.selected = null;
    this.hoverWorld = null;
    this.accumulator = 0;
    this.feedbackTimer = 0;
    this.audio.reset();
    this.renderer.resetPresentation();
    this.renderer.resetCamera();
    this.renderer.syncBattle(this.session.battle);
    this.audio.sync(this.session.battle);
    this.renderer.setDeploymentPreview(null);
    element("briefing").classList.add("open");
    element("result").classList.remove("open");
    element("feedback").classList.remove("open");
    this.refreshUi();
  }

  private changeMode(mode: GameMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
      const active = button.dataset.mode === mode;
      button.dataset.active = String(active);
      button.setAttribute("aria-pressed", String(active));
    });
    this.reset();
  }

  private selectDeployable(kind: DeployableKind): void {
    this.audio.playUi("select");
    const availability = getDeployableAvailability(this.session, "verdant", kind);
    if (!availability.enabled) {
      this.showFeedback(deploymentReasonLabel(availability.reason), "error");
      return;
    }
    this.selected = this.selected === kind ? null : kind;
    this.refreshCards();
    if (!this.selected) {
      this.renderer.setDeploymentPreview(null);
      this.showFeedback("已取消部署", "info");
      return;
    }
    this.showFeedback("点击苍蓝势力范围内的可用六边格", "info");
    this.updateDeploymentPreview();
  }

  private onHoverWorld(point: WorldPoint | null): void {
    this.hoverWorld = point;
    this.updateDeploymentPreview();
  }

  private updateDeploymentPreview(): void {
    if (!this.selected || !this.hoverWorld || this.session.phase !== "engaged") {
      this.renderer.setDeploymentPreview(null);
      return;
    }
    const preview = previewDeployment(this.session, {
      faction: "verdant",
      kind: this.selected,
      worldPosition: this.hoverWorld,
    });
    this.renderer.setDeploymentPreview(preview);
  }

  private onClickWorld(point: WorldPoint): void {
    if (!this.selected || this.session.phase !== "engaged") return;
    const kind = this.selected;
    const result = deployBattleSessionEntity(this.session, {
      faction: "verdant",
      kind,
      worldPosition: point,
    });
    if (!result.ok) {
      this.showFeedback(deploymentReasonLabel(result.reason), "error");
      this.hoverWorld = point;
      this.updateDeploymentPreview();
      return;
    }
    this.session = result.state;
    this.selected = null;
    this.hoverWorld = null;
    this.renderer.setDeploymentPreview(null);
    this.renderer.syncBattle(this.session.battle);
    this.audio.sync(this.session.battle);
    this.refreshUi();
    this.showFeedback(
      result.entityType === "squad"
        ? `部署成功：${result.quantity} 个单位已入场`
        : "建筑部署成功",
      "success",
    );
  }

  private refreshUi(): void {
    const battle = this.session.battle;
    const clock = getMatchClock(battle.matchElapsed);
    const account = battle.economy.accounts.verdant;
    const armies = countArmies(battle);
    text("clock", formatTime(clock.remainingSeconds));
    text("gold", account.gold);
    text("enemy-count", armies.crimson);
    const goldFill = element<HTMLElement>("gold-fill");
    goldFill.style.width = `${account.gold / GAME_RULES.economy.maximumGold * 100}%`;
    text("gold-status", account.isFull
      ? "储备已封顶，立即部署"
      : `${clock.phase === "double" ? "双倍恢复" : "恢复中"} · 进度 ${Math.round(account.recoveryProgress * 100)}%`);
    const label = this.session.phase === "briefing"
      ? "等待交战"
      : battle.winner
        ? "战斗结束"
        : clock.phase === "double" ? "双倍金币" : "战线交锋中";
    text("battle-label", label);
    this.refreshCastleUi(battle);
    this.refreshCards();
    if (battle.winner) this.showResult(battle.winner);
  }

  private refreshCastleUi(battle: BattleState): void {
    for (const faction of ["verdant", "crimson"] as const) {
      const castle = battle.buildings.find((building) => (
        building.faction === faction && building.kind === "castle"
      ));
      const health = castle?.health ?? 0;
      const maximum = castle?.maxHealth ?? 1;
      const key = `${faction}-castle`;
      element<HTMLElement>(key).style.width = `${pcClamp(health / maximum) * 100}%`;
      text(`${key}-label`, Math.ceil(health));
    }
  }

  private refreshCards(): void {
    for (const [kind, button] of this.deployButtons) {
      const availability = getDeployableAvailability(this.session, "verdant", kind);
      const selected = kind === this.selected;
      button.disabled = !availability.enabled;
      button.dataset.selected = String(selected);
      button.setAttribute("aria-pressed", String(selected));
      button.title = availability.enabled ? "" : deploymentReasonLabel(availability.reason);
    }
  }

  private showResult(winner: BattleState["winner"]): void {
    if (!winner) return;
    text("winner", winner === "verdant" ? "苍蓝军团获胜" : winner === "crimson" ? "猩红军团获胜" : "双方平局");
    element("result").classList.add("open");
  }

  private showFeedback(
    message: string,
    tone: "info" | "success" | "error",
    lifetime = 2.2,
  ): void {
    const feedback = element("feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
    feedback.classList.add("open");
    this.feedbackTimer = lifetime;
  }
}

function createSession(mode: GameMode): BattleSessionState {
  return {
    phase: "briefing",
    battle: mode === "arena" ? createArenaBattle() : createInitialBattle(),
  };
}

function countArmies(battle: BattleState): { verdant: number; crimson: number } {
  return {
    verdant: battle.units.filter((unit) => unit.faction === "verdant" && unit.health > 0).length,
    crimson: battle.units.filter((unit) => unit.faction === "crimson" && unit.health > 0).length,
  };
}

function deploymentReasonLabel(reason: DeploymentFailureReason): string {
  const labels: Readonly<Record<DeploymentFailureReason, string>> = {
    "insufficient-gold": "金币不足",
    "building-limit": "同类建筑已达上限",
    "deployment-closed": "请先开始交战",
    "match-over": "本局已经结束",
    "unwalkable-hex": "这个六边格不可通行",
    "outside-battlefield": "超出战场范围",
    "enemy-territory": "不能在敌方势力范围部署",
    "unbuildable-hex": "这个六边格不能建造建筑",
    "occupied-hex": "这个六边格已被占用",
    "duplicate-building-id": "建筑编号冲突，请重试",
    "no-buildable-hex": "当前没有可用建筑位置",
  };
  return labels[reason];
}

function difficultyLabel(difficulty: AiDifficulty): string {
  if (difficulty === "easy") return "简单";
  if (difficulty === "hard") return "困难";
  return "普通";
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function pcClamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing required element #${id}.`);
  return found as T;
}

function text(id: string, value: string | number): void {
  element(id).textContent = String(value);
}

new PlayCanvasPortGame();
