import type { BattleSessionState } from "../game/battleSession";
import {
  getDeployableAvailability,
  type DeploymentFailureReason,
} from "../game/deployTransaction";
import { getMatchClock } from "../game/economy";
import {
  DEPLOYABLE_CATEGORIES,
  GAME_RULES,
  type BuildingKind,
  type DeployableKind,
  type TroopKind,
} from "../game/rules";
import styles from "./DeploymentRail.module.css";

interface DeploymentRailProps {
  readonly session: BattleSessionState;
  readonly selectedKind: DeployableKind | null;
  readonly onSelect: (kind: DeployableKind) => void;
}

interface PresentationMetadata {
  readonly iconSrc: string;
  readonly name: string;
  readonly detail: string;
}

interface DeployableDefinition extends PresentationMetadata {
  readonly kind: DeployableKind;
}

const TROOP_PRESENTATION = {
  swordsman: {
    iconSrc: "/assets/ui/deployables/swordsman.png",
    name: "剑士",
    detail: "近战前锋",
  },
  archer: {
    iconSrc: "/assets/ui/deployables/archer.png",
    name: "弓箭手",
    detail: "远程单体",
  },
  mage: {
    iconSrc: "/assets/ui/deployables/mage.png",
    name: "法师",
    detail: "范围法术",
  },
  catapult: {
    iconSrc: "/assets/ui/deployables/catapult.png",
    name: "投石车",
    detail: "重型攻城",
  },
} as const satisfies Readonly<Record<TroopKind, PresentationMetadata>>;

const BUILDING_PRESENTATION = {
  "gold-mine": {
    iconSrc: "/assets/ui/deployables/gold-mine.png",
    name: "金矿",
    detail: `每 ${GAME_RULES.buildings.goldMine.productionIntervalSeconds} 秒产出 ${GAME_RULES.buildings.goldMine.goldPerProduction}`,
  },
  barracks: {
    iconSrc: "/assets/ui/deployables/barracks.png",
    name: "兵营",
    detail: `每 ${GAME_RULES.buildings.barracks.spawnIntervalSeconds} 秒生成 ${TROOP_PRESENTATION[GAME_RULES.buildings.barracks.spawnedUnit].name}`,
  },
} as const satisfies Readonly<Record<BuildingKind, PresentationMetadata>>;

const DEPLOYABLE_PRESENTATION = {
  ...BUILDING_PRESENTATION,
  ...TROOP_PRESENTATION,
} as const satisfies Readonly<Record<DeployableKind, PresentationMetadata>>;

const DEPLOYABLES: readonly DeployableDefinition[] = (
  Object.keys(DEPLOYABLE_PRESENTATION) as DeployableKind[]
).map((kind) => ({ kind, ...DEPLOYABLE_PRESENTATION[kind] }));

const BUILDINGS = DEPLOYABLES.filter(({ kind }) => (
  DEPLOYABLE_CATEGORIES[kind] === "building"
));
const TROOPS = DEPLOYABLES.filter(({ kind }) => (
  DEPLOYABLE_CATEGORIES[kind] === "troop"
));

export function DeploymentRail({
  session,
  selectedKind,
  onSelect,
}: DeploymentRailProps) {
  const battle = session.battle;
  const account = battle.economy.accounts.verdant;
  const clock = getMatchClock(battle.matchElapsed);
  const recoveryInterval = clock.phase === "double"
    ? GAME_RULES.economy.doubleRecoverySeconds
    : GAME_RULES.economy.normalRecoverySeconds;
  const secondsToGold = recoveryInterval * (1 - account.recoveryProgress);

  return (
    <aside
      className={styles.rail}
      data-full={account.isFull}
      aria-label="部署建筑和兵种"
    >
      <header className={styles.goldHeader}>
        <div className={styles.goldTitle}>
          <span aria-hidden="true">●</span>
          <div>
            <small>WAR CHEST</small>
            <strong>金币储备</strong>
          </div>
          <em>×{clock.phase === "double" ? 2 : 1}</em>
        </div>
        <div
          className={styles.goldReadout}
          aria-label={`当前金币 ${account.gold}，上限 ${GAME_RULES.economy.maximumGold}`}
        >
          <strong>{account.gold}</strong>
          <span>/ {GAME_RULES.economy.maximumGold}</span>
        </div>
        <div className={styles.goldTrack} aria-hidden="true">
          <i style={{ width: `${(account.gold / GAME_RULES.economy.maximumGold) * 100}%` }} />
          {!account.isFull && <b style={{ width: `${account.recoveryProgress * 100}%` }} />}
        </div>
        <p className={styles.recoveryStatus}>
          {account.isFull
            ? "储备已封顶"
            : `${secondsToGold.toFixed(1)} 秒后 +${GAME_RULES.economy.goldPerRecovery}`}
        </p>
        <p className={styles.fullPrompt} aria-live="assertive" aria-hidden={!account.isFull}>
          金币已满，立即部署！
        </p>
      </header>

      <div className={styles.deployablesDock}>
        <DeployableGroup
          title="作战单位"
          items={TROOPS}
          session={session}
          selectedKind={selectedKind}
          onSelect={onSelect}
        />
        <DeployableGroup
          title="建筑工事"
          items={BUILDINGS}
          session={session}
          selectedKind={selectedKind}
          onSelect={onSelect}
        />
        <footer className={styles.instructions}>
          <span>选择卡牌后点击己方势力范围</span>
          <kbd>ESC / 右键取消</kbd>
        </footer>
      </div>
    </aside>
  );
}

function DeployableGroup({
  title,
  items,
  session,
  selectedKind,
  onSelect,
}: {
  readonly title: string;
  readonly items: readonly DeployableDefinition[];
  readonly session: BattleSessionState;
  readonly selectedKind: DeployableKind | null;
  readonly onSelect: (kind: DeployableKind) => void;
}) {
  return (
    <section className={styles.group}>
      <h2>{title}</h2>
      <div className={styles.cardList}>
        {items.map((item) => {
          const availability = getDeployableAvailability(
            session,
            "verdant",
            item.kind,
          );
          const reason = availability.reason;
          const disabled = !availability.enabled;
          const status = reason === "deployment-closed"
            ? "等待交战"
            : reason ? deploymentReasonLabel(reason) : "可部署";
          return (
            <button
              className={styles.card}
              data-kind={item.kind}
              data-selected={selectedKind === item.kind}
              type="button"
              disabled={disabled}
              aria-pressed={selectedKind === item.kind}
              aria-describedby={`${item.kind}-deployment-status`}
              onClick={() => onSelect(item.kind)}
              key={item.kind}
            >
              <span className={styles.iconFrame} aria-hidden="true">
                <img
                  className={styles.deployableIcon}
                  src={item.iconSrc}
                  alt=""
                  draggable={false}
                />
                {DEPLOYABLE_CATEGORIES[item.kind] === "troop" && (
                  <b className={styles.squadSize}>
                    ×{GAME_RULES.deployment.troopCounts[item.kind as TroopKind]}
                  </b>
                )}
              </span>
              <span className={styles.identity}>
                <strong>{item.name}</strong>
                <small>{item.detail}</small>
              </span>
              <span className={styles.price}>
                <b>{GAME_RULES.deployment.costs[item.kind]}</b>
                <small id={`${item.kind}-deployment-status`}>{status}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function deploymentReasonLabel(reason: DeploymentFailureReason): string {
  switch (reason) {
    case "deployment-closed": return "尚未进入交战阶段";
    case "insufficient-gold": return "金币不足";
    case "building-limit": return "数量已达上限";
    case "no-buildable-hex": return "没有完整空格";
    case "outside-battlefield": return "超出战场";
    case "enemy-territory": return "仅限己方势力范围";
    case "unbuildable-hex": return "此格不可建造";
    case "unwalkable-hex": return "此处不可部署";
    case "occupied-hex": return "格子已被占用";
    case "duplicate-building-id": return "部署编号冲突";
    case "match-over": return "战斗已经结束";
  }
}
