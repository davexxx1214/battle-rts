import type { BattleState } from "../game/battle";
import { battleBuildingConstructionPhaseAt } from "../game/buildings";
import { miningIncomeMultiplier } from "../game/miningEconomy";
import { sandboxUsedPopulation } from "../game/population";
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
  sandboxProductionPopulation,
  type SandboxProductionBuildingQueue,
} from "../game/sandboxProductionQueue";
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

export function SandboxCommandPanel({
  battle,
  selectedBuilding,
  disabled = false,
  onSelectBuilding,
  onEnqueueProduction,
}: SandboxCommandPanelProps) {
  const faction = "verdant" as const;
  const race = battle.factionRaces[faction];
  const production = battle.production;
  const queuePopulation = production
    ? sandboxProductionPopulation(production, faction)
    : { reservedPopulation: 0, readyBlockedPopulation: 0, totalQueuePopulation: 0 };
  const usedPopulation = sandboxUsedPopulation(
    battle.units,
    faction,
    queuePopulation.readyBlockedPopulation,
  );
  const committedPopulation = usedPopulation + queuePopulation.reservedPopulation;
  const maintenanceMultiplier = miningIncomeMultiplier(usedPopulation);
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
      aria-label="沙盒指挥面板"
    >
      <header className={styles.resources}>
        <div>
          <span>金币</span>
          <strong>{battle.economy.accounts[faction].gold}</strong>
        </div>
        <div>
          <span>人口 · 使用 + 预留</span>
          <strong>
            {usedPopulation} + {queuePopulation.reservedPopulation}
            <small> / {SANDBOX_PRODUCTION_POPULATION_CAP}</small>
          </strong>
        </div>
        <div>
          <span>采矿收入</span>
          <strong>{Math.round(maintenanceMultiplier * 100)}%</strong>
        </div>
      </header>

      <section className={styles.buildSection} aria-labelledby="sandbox-build-heading">
        <div className={styles.sectionHeading}>
          <h2 id="sandbox-build-heading">建造</h2>
          <span>{selectedBuilding ? "点击地图放置 · ESC / 右键取消" : "选择建筑"}</span>
        </div>
        <div className={styles.buildGrid}>
          {SANDBOX_BUILDING_SLOTS.map((slot) => {
            const spec = sandboxBuildingSpec(slot);
            const display = spec.displayByRace[race];
            return (
              <button
                type="button"
                key={slot}
                data-selected={selectedBuilding === slot}
                disabled={disabled}
                aria-pressed={selectedBuilding === slot}
                title={display.description}
                onClick={() => onSelectBuilding(slot)}
              >
                <span>{display.name}</span>
                <strong>{spec.cost} 金</strong>
                <small>{spec.constructionSeconds} 秒</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.productionSection} aria-labelledby="sandbox-production-heading">
        <div className={styles.sectionHeading}>
          <h2 id="sandbox-production-heading">生产队列</h2>
          <span>每栋建筑 FIFO · 最多 {SANDBOX_PRODUCTION_MAX_QUEUE_LENGTH} 项</span>
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
                committedPopulation={committedPopulation}
                onEnqueueProduction={onEnqueueProduction}
              />
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}

function ProductionBuildingCard({
  battle,
  queue,
  disabled,
  committedPopulation,
  onEnqueueProduction,
}: {
  readonly battle: BattleState;
  readonly queue: SandboxProductionBuildingQueue;
  readonly disabled: boolean;
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

  return (
    <article className={styles.queueCard} data-operational={operational}>
      <div className={styles.queueTitle}>
        <div>
          <strong>{display.name}</strong>
          <small>{shortBuildingId(queue.buildingId)}</small>
        </div>
        <span>{operational ? `${queue.entries.length}/${SANDBOX_PRODUCTION_MAX_QUEUE_LENGTH}` : "建造中"}</span>
      </div>

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
              <small>{spec.entityCount} 人 · {spec.populationCost} 人口</small>
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
