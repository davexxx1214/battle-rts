import { useState } from "react";
import type { BattleState } from "../game/battle";
import { populationIncomeMultiplier } from "../game/battleMode";
import { battleBuildingConstructionPhaseAt } from "../game/buildings";
import { sandboxBuildingMissingPrerequisites } from "../game/sandboxConstruction";
import {
  SANDBOX_BUILDING_SLOTS,
  SANDBOX_TROOP_SLOTS,
  sandboxBuildingSpec,
  sandboxTroopSpec,
  type SandboxBuildingSlot,
  type SandboxProductionBuildingSlot,
  type SandboxTroopSlot,
} from "../game/sandboxCatalog";
import {
  SANDBOX_PRODUCTION_MAX_QUEUE_LENGTH,
  SANDBOX_PRODUCTION_POPULATION_CAP,
  type SandboxProductionBuildingQueue,
} from "../game/sandboxProductionQueue";
import { createSandboxHudModel } from "./sandboxHudModel";
import styles from "./SandboxCommandPanel.module.css";

interface SandboxCommandPanelProps {
  readonly battle: BattleState;
  readonly selectedBuilding: SandboxBuildingSlot | null;
  readonly disabled?: boolean;
  readonly onSelectBuilding: (slot: SandboxBuildingSlot) => void;
  readonly onEnqueueProduction: (
    buildingId: string,
    troopKind: SandboxTroopSlot,
  ) => void;
}

const ENTRY_STATUS_LABEL = {
  queued: "等待",
  training: "训练中",
  "ready-blocked": "出口阻塞",
} as const;

const BUILDING_ICON: Record<SandboxBuildingSlot, string> = {
  mine: "⛏",
  barracks: "⚔",
  "archery-range": "➶",
  "mage-tower": "✦",
  "siege-workshop": "◉",
  "guard-tower": "♜",
};

export function SandboxCommandPanel({
  battle,
  selectedBuilding,
  disabled = false,
  onSelectBuilding,
  onEnqueueProduction,
}: SandboxCommandPanelProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const faction = "verdant" as const;
  const race = battle.factionRaces[faction];
  const production = battle.production;
  const hud = createSandboxHudModel(battle, faction);
  const queues = production
    ? Object.values(production.queuesByBuildingId)
        .filter((queue) => queue.faction === faction)
        .sort((left, right) => left.buildingId.localeCompare(right.buildingId))
    : [];

  return (
    <aside
      className={styles.panel}
      data-field-ui
      data-disabled={disabled}
      data-mobile-expanded={mobileExpanded}
      aria-label="沙盒指挥面板"
    >
      <header className={styles.mobileSummary} aria-label="沙盒资源速览">
        <span title={`金币 ${hud.gold} / ${hud.goldCap}`}>
          <i aria-hidden="true">●</i>
          <strong>{compactNumber(hud.gold)}</strong>
        </span>
        <span title={`人口 ${hud.usedPopulation} + ${hud.reservedPopulation} / ${hud.populationCap}`}>
          <i aria-hidden="true">♟</i>
          <strong>{hud.usedPopulation + hud.reservedPopulation}/{hud.populationCap}</strong>
        </span>
        <span title={`总剩余矿量 ${hud.totalRemainingOre}`}>
          <i aria-hidden="true">◆</i>
          <strong>{compactNumber(hud.totalRemainingOre)}</strong>
        </span>
        <button
          type="button"
          className={styles.mobilePanelToggle}
          aria-label={mobileExpanded ? "收起建造与生产面板" : "展开建造与生产面板"}
          aria-controls="sandbox-command-panel-content"
          aria-expanded={mobileExpanded}
          title={mobileExpanded ? "收起军务" : "建造与生产"}
          onClick={() => setMobileExpanded((expanded) => !expanded)}
        >
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="m5 19 5.2-5.2M8.7 5.2a4 4 0 0 0 5.1 5.1l5-5a4 4 0 0 1-5.1 5.1l-8.5 8.5-2.1-2.1 5.6-5.6a4 4 0 0 1 0-6Z" />
            <path d="m14.5 14.5 4.3 4.3M17 12l2-2 3 3-2 2" />
          </svg>
        </button>
      </header>

      <button
        type="button"
        className={styles.mobileDismissLayer}
        aria-label="关闭建造与生产面板"
        tabIndex={mobileExpanded ? 0 : -1}
        onClick={() => setMobileExpanded(false)}
      />

      <div id="sandbox-command-panel-content" className={styles.panelContent}>
        <header className={styles.resources}>
          <div>
            <span>金币</span>
            <strong>{hud.gold}<small> / {hud.goldCap}</small></strong>
          </div>
          <div>
            <span>总剩余矿量</span>
            <strong>{hud.totalRemainingOre.toLocaleString()}</strong>
          </div>
          <div>
            <span>人口 · 使用 + 预留</span>
            <strong>
              {hud.usedPopulation} + {hud.reservedPopulation}
              <small> / {hud.populationCap}</small>
            </strong>
          </div>
          <div>
            <span>时间限制</span>
            <strong>无限</strong>
          </div>
        </header>

        <section className={styles.economyStrip} aria-label="采矿维护费">
        <div>
          <span>维护费</span>
          <strong>{hud.upkeepPercent}%</strong>
        </div>
        <div>
          <span>净收入</span>
          <strong>{hud.incomePercent}%</strong>
        </div>
        <small>{hud.nextThresholdLabel}</small>
        </section>
        {(hud.walletFull || hud.emergencyMinePermitAvailable) && (
          <p className={styles.economyPrompt} data-tone={hud.walletFull ? "warning" : "permit"}>
            {hud.walletFull
              ? `金库已满（${hud.goldCap}），继续开采会浪费收入。`
              : "紧急采矿许可可用：无矿且金币不足时，可免费重建一次金矿。"}
          </p>
        )}

      <section className={styles.buildSection} aria-labelledby="sandbox-build-heading">
        <div className={styles.sectionHeading}>
          <h2 id="sandbox-build-heading">建造</h2>
          <span>{selectedBuilding ? "点击地图放置 · ESC / 右键取消" : "选择建筑"}</span>
        </div>
        <div className={styles.buildGrid}>
          {SANDBOX_BUILDING_SLOTS.map((slot) => {
            const spec = sandboxBuildingSpec(slot);
            const display = spec.displayByRace[race];
            const missingPrerequisites = sandboxBuildingMissingPrerequisites(
              battle.buildings,
              faction,
              slot,
              battle.matchElapsed,
            );
            const unlocked = missingPrerequisites.length === 0;
            const lacksGold = hud.gold < spec.cost;
            const prerequisiteNames = missingPrerequisites.map((prerequisite) => (
              sandboxBuildingSpec(prerequisite).displayByRace[race].name
            ));
            return (
              <button
                type="button"
                key={slot}
                data-selected={selectedBuilding === slot}
                data-unlocked={unlocked}
                data-affordable={!lacksGold}
                disabled={disabled || !unlocked}
                aria-pressed={selectedBuilding === slot}
                title={unlocked
                  ? display.description
                  : `未解锁：需要先建造完成${prerequisiteNames.join("、")}`}
                onClick={() => {
                  onSelectBuilding(slot);
                  setMobileExpanded(false);
                }}
              >
                <span>
                  <i className={styles.buildingIcon} aria-hidden="true">{BUILDING_ICON[slot]}</i>
                  {display.name}
                </span>
                <strong>{spec.cost} 金{lacksGold ? " · 不足" : ""}</strong>
                <small>{unlocked
                  ? `${spec.constructionSeconds} 秒`
                  : `未解锁 · 需 ${prerequisiteNames.join("、")}`}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.mineSection} aria-labelledby="sandbox-mine-heading">
        <div className={styles.sectionHeading}>
          <h2 id="sandbox-mine-heading">金矿</h2>
          <span>每 {hud.cycleSeconds} 秒结算</span>
        </div>
        <div className={styles.mineEconomy}>
          <span>毛收入 <b>{hud.grossPerCycle}</b></span>
          <span>维护费 <b>-{hud.upkeepPerCycle}</b></span>
          <span>净收入 <b>{hud.netPerCycle}</b></span>
        </div>
        {hud.mines.length === 0 ? (
          <p className={styles.emptyState}>尚未控制可开采矿坑。</p>
        ) : (
          <div className={styles.mineList}>
            {hud.mines.map((mine) => (
              <div key={mine.pitId} data-roi-warning={mine.roiWarning}>
                <span><strong>{mine.pitId}</strong><small>{mine.statusLabel}</small></span>
                <span><b>{mine.remainingOre}</b> 原矿<small>预计净值 {mine.projectedNetValue}</small></span>
                {mine.roiWarning && (
                  <em>回本警告：当前收入档至少需 {hud.roiOreThreshold} 原矿</em>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.productionSection} aria-labelledby="sandbox-production-heading">
        <div className={styles.sectionHeading}>
          <h2 id="sandbox-production-heading">生产队列</h2>
          <span>每栋独立训练 · 多栋并行 · 最多 {SANDBOX_PRODUCTION_MAX_QUEUE_LENGTH} 项</span>
        </div>
        {queues.length === 0 ? (
          <p className={styles.emptyState}>先建造兵营，再从对应建筑训练兵种。</p>
        ) : (
          <div className={styles.queueList}>
            {queues.map((queue) => (
              <ProductionBuildingCard
                key={queue.buildingId}
                battle={battle}
                queue={queue}
                disabled={disabled}
                usedPopulation={hud.usedPopulation}
                committedPopulation={hud.committedPopulation}
                onEnqueueProduction={onEnqueueProduction}
              />
            ))}
          </div>
        )}
      </section>
      </div>
    </aside>
  );
}

function ProductionBuildingCard({
  battle,
  queue,
  disabled,
  usedPopulation,
  committedPopulation,
  onEnqueueProduction,
}: {
  readonly battle: BattleState;
  readonly queue: SandboxProductionBuildingQueue;
  readonly disabled: boolean;
  readonly usedPopulation: number;
  readonly committedPopulation: number;
  readonly onEnqueueProduction: (
    buildingId: string,
    troopKind: SandboxTroopSlot,
  ) => void;
}) {
  const race = battle.factionRaces[queue.faction];
  const building = battle.buildings.find((candidate) => candidate.id === queue.buildingId);
  const operational = building !== undefined
    && battleBuildingConstructionPhaseAt(building, battle.matchElapsed) === "operational";
  const display = sandboxBuildingSpec(queue.producer).displayByRace[race];
  const troops = troopsForProducer(queue.producer);
  const queueFull = queue.entries.length >= SANDBOX_PRODUCTION_MAX_QUEUE_LENGTH;
  const rallyLabel = queue.rallyPoint
    ? `${queue.rallyPoint.q}, ${queue.rallyPoint.r}`
    : "未设置";

  return (
    <article className={styles.queueCard} data-operational={operational}>
      <div className={styles.queueTitle}>
        <div>
          <strong>{display.name}</strong>
          <small>{shortBuildingId(queue.buildingId)}</small>
        </div>
        <span>{operational ? `${queue.entries.length}/${SANDBOX_PRODUCTION_MAX_QUEUE_LENGTH}` : "建造中"}</span>
      </div>
      <small className={styles.rallyPoint}>集结点：{rallyLabel}</small>

      <ol className={styles.queueEntries} aria-label={`${display.name}生产队列`}>
        {queue.entries.length === 0 ? (
          <li data-empty>队列空闲</li>
        ) : queue.entries.map((entry) => {
          const spec = sandboxTroopSpec(entry.troopKind);
          const troopDisplay = spec.displayByRace[race];
          const progress = Math.min(100, Math.round(
            entry.trainingProgressSeconds / spec.trainingSeconds * 100,
          ));
          return (
            <li key={entry.id} data-status={entry.status}>
              <span>{troopDisplay.name}</span>
              <small>{ENTRY_STATUS_LABEL[entry.status]}</small>
              <i aria-label={`训练进度 ${progress}%`}>
                <b style={{ width: `${progress}%` }} />
              </i>
            </li>
          );
        })}
      </ol>

      <div className={styles.trainingButtons}>
        {troops.map((troopKind) => {
          const spec = sandboxTroopSpec(troopKind);
          const troopDisplay = spec.displayByRace[race];
          const lacksGold = battle.economy.accounts[queue.faction].gold < spec.cost;
          const populationFull = committedPopulation + spec.populationCost
            > SANDBOX_PRODUCTION_POPULATION_CAP;
          const projectedUsedPopulation = usedPopulation + spec.populationCost;
          const projectedCommittedPopulation = committedPopulation + spec.populationCost;
          const projectedIncome = Math.round(
            populationIncomeMultiplier("sandbox", projectedCommittedPopulation) * 100,
          );
          const currentIncome = Math.round(
            populationIncomeMultiplier("sandbox", usedPopulation) * 100,
          );
          return (
            <button
              type="button"
              key={troopKind}
              disabled={disabled || !operational || queueFull || lacksGold || populationFull}
              title={`${troopDisplay.description} 训练 ${spec.trainingSeconds} 秒，人口 ${spec.populationCost}`}
              onClick={() => onEnqueueProduction(queue.buildingId, troopKind)}
            >
              <span>{troopDisplay.name}</span>
              <strong>{spec.cost} 金</strong>
              <small>
                单次 1 个单位 · 人口 {spec.populationCost}
                {` · 完成后 used≥${projectedUsedPopulation}`}
                {` · committed ${projectedCommittedPopulation}/${SANDBOX_PRODUCTION_POPULATION_CAP}`}
                {projectedIncome < currentIncome ? ` · 收入降至 ${projectedIncome}%` : ""}
              </small>
            </button>
          );
        })}
      </div>
    </article>
  );
}

function troopsForProducer(
  producer: SandboxProductionBuildingSlot,
): readonly SandboxTroopSlot[] {
  return SANDBOX_TROOP_SLOTS.filter((slot) => (
    sandboxTroopSpec(slot).producer === producer
  ));
}

function shortBuildingId(buildingId: string): string {
  const suffix = buildingId.split("-").at(-1);
  return suffix ? `#${suffix}` : buildingId;
}

function compactNumber(value: number): string {
  if (value < 1_000) return value.toLocaleString();
  if (value < 10_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(value / 1_000)}k`;
}
