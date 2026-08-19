import type { BattleSessionState } from "../game/battleSession";
import {
  getDeployableAvailability,
  type DeploymentFailureReason,
} from "../game/deployTransaction";
import { getMatchClock } from "../game/economy";
import { resolveBattleRace } from "../game/factions";
import {
  barracksDesignForRace,
  barracksRulesForRace,
  DEPLOYABLE_CATEGORIES,
  deploymentCostForRace,
  GAME_RULES,
  TROOP_KINDS,
  troopCountForRace,
  troopDesignForRace,
  type BuildingKind,
  type DeployableKind,
  type TroopKind,
} from "../game/rules";
import type { BattleRace } from "../game/types";
import styles from "./DeploymentRail.module.css";

interface DeploymentRailProps {
  readonly session: BattleSessionState;
  readonly selectedKind: DeployableKind | null;
  readonly allowedKinds?: readonly DeployableKind[];
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

const DEPLOYABLE_ICON_SOURCES = {
  human: {
    spearman: "/assets/ui/deployables/spearman.png",
    swordsman: "/assets/ui/deployables/swordsman.png",
    archer: "/assets/ui/deployables/archer.png",
    mage: "/assets/ui/deployables/mage.png",
    catapult: "/assets/ui/deployables/catapult.png",
    "guard-tower": "/assets/ui/deployables/guard-tower.png",
    "gold-mine": "/assets/ui/deployables/gold-mine.png",
    barracks: "/assets/ui/deployables/barracks.png",
  },
  undead: {
    spearman: "/assets/ui/deployables/undead/spearman.png",
    swordsman: "/assets/ui/deployables/undead/swordsman.png",
    archer: "/assets/ui/deployables/undead/archer.png",
    mage: "/assets/ui/deployables/undead/mage.png",
    catapult: "/assets/ui/deployables/undead/catapult.png",
    "guard-tower": "/assets/ui/deployables/undead/guard-tower.png",
    "gold-mine": "/assets/ui/deployables/undead/gold-mine.png",
    barracks: "/assets/ui/deployables/undead/barracks.png",
  },
} as const satisfies Readonly<Record<
  BattleRace,
  Readonly<Record<DeployableKind, string>>
>>;

const HUMAN_BARRACKS = barracksDesignForRace("human");
const HUMAN_BARRACKS_UNIT = troopDesignForRace(HUMAN_BARRACKS.spawnedUnit, "human");
const HUMAN_BARRACKS_RULES = barracksRulesForRace("human");

const BUILDING_PRESENTATION = {
  "guard-tower": {
    iconSrc: DEPLOYABLE_ICON_SOURCES.human["guard-tower"],
    name: "箭塔",
    detail: `射程 ${GAME_RULES.buildings.guardTower.attackRange} · 持续 ${GAME_RULES.buildings.guardTower.lifetimeSeconds} 秒`,
  },
  "gold-mine": {
    iconSrc: DEPLOYABLE_ICON_SOURCES.human["gold-mine"],
    name: "金矿",
    detail: `每 ${GAME_RULES.buildings.goldMine.productionIntervalSeconds} 秒产出 ${GAME_RULES.buildings.goldMine.goldPerProduction}`,
  },
  barracks: {
    iconSrc: DEPLOYABLE_ICON_SOURCES.human.barracks,
    name: HUMAN_BARRACKS.name,
    detail: `每 ${HUMAN_BARRACKS_RULES.spawnIntervalSeconds} 秒${HUMAN_BARRACKS.productionVerb} ${HUMAN_BARRACKS_UNIT.name}`,
  },
} as const satisfies Readonly<Record<BuildingKind, PresentationMetadata>>;

const BUILDINGS: readonly DeployableDefinition[] = (
  Object.keys(BUILDING_PRESENTATION) as BuildingKind[]
).map((kind) => ({ kind, ...BUILDING_PRESENTATION[kind] }));
const TROOPS: readonly DeployableDefinition[] = TROOP_KINDS.map((kind) => ({
  kind,
  ...troopPresentationForRace(kind, "human"),
}));

export function DeploymentRail({
  session,
  selectedKind,
  allowedKinds,
  onSelect,
}: DeploymentRailProps) {
  const battle = session.battle;
  const account = battle.economy.accounts.verdant;
  const clock = getMatchClock(battle.matchElapsed);
  const recoveryInterval = clock.phase === "double"
    ? GAME_RULES.economy.doubleRecoverySeconds
    : GAME_RULES.economy.normalRecoverySeconds;
  const secondsToGold = recoveryInterval * (1 - account.recoveryProgress);
  const availableTroops = allowedKinds
    ? TROOPS.filter(({ kind }) => allowedKinds.includes(kind))
    : TROOPS;
  const availableBuildings = allowedKinds
    ? BUILDINGS.filter(({ kind }) => allowedKinds.includes(kind))
    : BUILDINGS;

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
        {availableTroops.length > 0 && (
          <DeployableGroup
            title="作战单位"
            items={availableTroops}
            session={session}
            selectedKind={selectedKind}
            onSelect={onSelect}
          />
        )}
        {availableBuildings.length > 0 && (
          <DeployableGroup
            title="建筑工事"
            items={availableBuildings}
            session={session}
            selectedKind={selectedKind}
            onSelect={onSelect}
          />
        )}
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
          const playerRace = resolveBattleRace(
            session.battle.factionRaces,
            "verdant",
            session.battle.undeadOpponent,
          );
          const troopKind = DEPLOYABLE_CATEGORIES[item.kind] === "troop"
            ? item.kind as TroopKind
            : null;
          const presentation = troopKind
            ? { ...item, ...troopPresentationForRace(troopKind, playerRace) }
            : {
                ...item,
                ...buildingPresentationForRace(item.kind as BuildingKind, playerRace),
              };
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
                  src={presentation.iconSrc}
                  alt=""
                  draggable={false}
                />
                {troopKind && (
                  <b className={styles.squadSize}>
                    ×{troopCountForRace(troopKind, playerRace)}
                  </b>
                )}
              </span>
              <span className={styles.identity}>
                <strong>{presentation.name}</strong>
                <small>{presentation.detail}</small>
              </span>
              <span className={styles.price}>
                <b>{deploymentCostForRace(item.kind, playerRace)}</b>
                <small id={`${item.kind}-deployment-status`}>{status}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function troopPresentationForRace(
  kind: TroopKind,
  race: BattleRace,
): PresentationMetadata {
  const design = troopDesignForRace(kind, race);
  return {
    iconSrc: DEPLOYABLE_ICON_SOURCES[race][kind],
    name: design.name,
    detail: design.identity,
  };
}

function buildingPresentationForRace(
  kind: BuildingKind,
  race: BattleRace,
): PresentationMetadata {
  if (kind !== "barracks") {
    return {
      ...BUILDING_PRESENTATION[kind],
      iconSrc: DEPLOYABLE_ICON_SOURCES[race][kind],
    };
  }
  const barracks = barracksDesignForRace(race);
  const rules = barracksRulesForRace(race);
  const spawnedUnit = troopDesignForRace(barracks.spawnedUnit, race);
  return {
    iconSrc: DEPLOYABLE_ICON_SOURCES[race].barracks,
    name: barracks.name,
    detail: `每 ${rules.spawnIntervalSeconds} 秒${barracks.productionVerb} ${spawnedUnit.name}`,
  };
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
