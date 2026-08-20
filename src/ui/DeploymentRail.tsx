import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { BattleSessionState } from "../game/battleSession";
import { getBattleMatchClock } from "../game/battle";
import {
  getDeployableAvailability,
  type DeploymentFailureReason,
} from "../game/deployTransaction";
import { getMatchResourceMultiplier } from "../game/matchClock";
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
import {
  deployableIconForRace,
  deployableLabelForRace,
} from "./deployablePresentation";
import { deploymentGestureIntent } from "./deploymentDrag";
import type { FieldPoint } from "./fieldInput";
import styles from "./DeploymentRail.module.css";

export type DeploymentDragEvent =
  | {
      readonly phase: "start";
      readonly kind: DeployableKind;
      readonly pointerId: number;
      readonly client: FieldPoint;
    }
  | {
      readonly phase: "move" | "end";
      readonly pointerId: number;
      readonly client: FieldPoint;
    }
  | {
      readonly phase: "cancel";
      readonly pointerId: number;
    };

interface DeploymentRailProps {
  readonly session: BattleSessionState;
  readonly selectedKind: DeployableKind | null;
  readonly allowedKinds?: readonly DeployableKind[];
  readonly onSelect: (kind: DeployableKind) => void;
  readonly onDragDeploy?: (event: DeploymentDragEvent) => void;
}

interface PresentationMetadata {
  readonly iconSrc: string;
  readonly name: string;
  readonly detail: string;
}

interface DeployableDefinition extends PresentationMetadata {
  readonly kind: DeployableKind;
}

interface CardPointerGesture {
  readonly pointerId: number;
  readonly kind: DeployableKind;
  readonly element: HTMLButtonElement;
  readonly start: FieldPoint;
  mode: "pending" | "dragging" | "scrolling";
}

const HUMAN_BARRACKS = barracksDesignForRace("human");
const HUMAN_BARRACKS_UNIT = troopDesignForRace(HUMAN_BARRACKS.spawnedUnit, "human");
const HUMAN_BARRACKS_RULES = barracksRulesForRace("human");

const BUILDING_PRESENTATION = {
  "guard-tower": {
    iconSrc: deployableIconForRace("guard-tower", "human"),
    name: "箭塔",
    detail: `射程 ${GAME_RULES.buildings.guardTower.attackRange} · 持续 ${GAME_RULES.buildings.guardTower.lifetimeSeconds} 秒`,
  },
  "gold-mine": {
    iconSrc: deployableIconForRace("gold-mine", "human"),
    name: "金矿",
    detail: `每 ${GAME_RULES.buildings.goldMine.productionIntervalSeconds} 秒产出 ${GAME_RULES.buildings.goldMine.goldPerProduction}`,
  },
  barracks: {
    iconSrc: deployableIconForRace("barracks", "human"),
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
  onDragDeploy,
}: DeploymentRailProps) {
  const battle = session.battle;
  const account = battle.economy.accounts.verdant;
  const clock = getBattleMatchClock(battle);
  const goldMultiplier = getMatchResourceMultiplier(clock, "gold");
  const recoveryInterval = GAME_RULES.economy.normalRecoverySeconds / goldMultiplier;
  const secondsToGold = recoveryInterval * (1 - account.recoveryProgress);
  const availableTroops = allowedKinds
    ? TROOPS.filter(({ kind }) => allowedKinds.includes(kind))
    : TROOPS;
  const availableBuildings = allowedKinds
    ? BUILDINGS.filter(({ kind }) => allowedKinds.includes(kind))
    : BUILDINGS;
  const gestureOwnerRef = useRef<number | null>(null);

  return (
    <aside
      className={styles.rail}
      data-full={account.isFull}
      data-field-ui
      aria-label="部署建筑和兵种"
    >
      <header className={styles.goldHeader}>
        <div className={styles.goldTitle}>
          <span aria-hidden="true">●</span>
          <div>
            <small>WAR CHEST</small>
            <strong>金币储备</strong>
          </div>
          <em>×{goldMultiplier}</em>
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
            onDragDeploy={onDragDeploy}
            gestureOwnerRef={gestureOwnerRef}
          />
        )}
        {availableBuildings.length > 0 && (
          <DeployableGroup
            title="建筑工事"
            items={availableBuildings}
            session={session}
            selectedKind={selectedKind}
            onSelect={onSelect}
            onDragDeploy={onDragDeploy}
            gestureOwnerRef={gestureOwnerRef}
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
  onDragDeploy,
  gestureOwnerRef,
}: {
  readonly title: string;
  readonly items: readonly DeployableDefinition[];
  readonly session: BattleSessionState;
  readonly selectedKind: DeployableKind | null;
  readonly onSelect: (kind: DeployableKind) => void;
  readonly onDragDeploy?: (event: DeploymentDragEvent) => void;
  readonly gestureOwnerRef: MutableRefObject<number | null>;
}) {
  const gestureRef = useRef<CardPointerGesture | null>(null);
  const onDragDeployRef = useRef(onDragDeploy);
  const suppressClickUntilRef = useRef(0);
  const [draggingKind, setDraggingKind] = useState<DeployableKind | null>(null);

  useEffect(() => {
    onDragDeployRef.current = onDragDeploy;
  }, [onDragDeploy]);

  const startDeploymentDrag = (gesture: CardPointerGesture, client: FieldPoint) => {
    if (gesture.mode !== "pending") return;
    gesture.mode = "dragging";
    suppressClickUntilRef.current = performance.now() + 700;
    setDraggingKind(gesture.kind);
    onDragDeployRef.current?.({
      phase: "start",
      kind: gesture.kind,
      pointerId: gesture.pointerId,
      client,
    });
  };

  const resetGesture = (gesture: CardPointerGesture, cancelDrag: boolean) => {
    if (cancelDrag && gesture.mode === "dragging") {
      onDragDeployRef.current?.({ phase: "cancel", pointerId: gesture.pointerId });
    }
    if (gestureRef.current === gesture) gestureRef.current = null;
    if (gestureOwnerRef.current === gesture.pointerId) gestureOwnerRef.current = null;
    setDraggingKind(null);
  };

  useEffect(() => {
    const finishWindowGesture = (event: PointerEvent, cancelled: boolean) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (
        gesture.mode === "dragging"
        || gesture.mode === "scrolling"
      ) {
        if (event.cancelable) event.preventDefault();
        suppressClickUntilRef.current = performance.now() + 700;
      }
      if (gesture.mode === "dragging") {
        onDragDeployRef.current?.(cancelled
          ? { phase: "cancel", pointerId: gesture.pointerId }
          : {
              phase: "end",
              pointerId: gesture.pointerId,
              client: { x: event.clientX, y: event.clientY },
            });
      }
      gestureRef.current = null;
      if (gestureOwnerRef.current === gesture.pointerId) gestureOwnerRef.current = null;
      setDraggingKind(null);
      if (gesture.element.hasPointerCapture(gesture.pointerId)) {
        gesture.element.releasePointerCapture(gesture.pointerId);
      }
    };
    const handleWindowPointerUp = (event: PointerEvent) => {
      finishWindowGesture(event, false);
    };
    const handleWindowPointerCancel = (event: PointerEvent) => {
      finishWindowGesture(event, true);
    };
    window.addEventListener("pointerup", handleWindowPointerUp, true);
    window.addEventListener("pointercancel", handleWindowPointerCancel, true);
    return () => {
      window.removeEventListener("pointerup", handleWindowPointerUp, true);
      window.removeEventListener("pointercancel", handleWindowPointerCancel, true);
      const gesture = gestureRef.current;
      if (!gesture) return;
      if (gesture.mode === "dragging") {
        onDragDeployRef.current?.({ phase: "cancel", pointerId: gesture.pointerId });
      }
      gestureRef.current = null;
      if (gestureOwnerRef.current === gesture.pointerId) gestureOwnerRef.current = null;
    };
  }, [gestureOwnerRef]);

  const handleCardPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: DeployableKind,
  ) => {
    if (
      !onDragDeploy
      || event.button !== 0
      || gestureRef.current
      || gestureOwnerRef.current !== null
    ) return;
    suppressClickUntilRef.current = 0;
    const client = { x: event.clientX, y: event.clientY };
    const gesture: CardPointerGesture = {
      pointerId: event.pointerId,
      kind,
      element: event.currentTarget,
      start: client,
      mode: "pending",
    };
    gestureRef.current = gesture;
    gestureOwnerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCardPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const client = { x: event.clientX, y: event.clientY };
    if (gesture.mode === "pending") {
      const intent = deploymentGestureIntent(gesture.start, client);
      if (intent === "pending") return;
      if (intent === "scroll") {
        gesture.mode = "scrolling";
        suppressClickUntilRef.current = performance.now() + 700;
        return;
      }
      startDeploymentDrag(gesture, client);
    }
    if (gesture.mode !== "dragging") return;
    event.preventDefault();
  };

  const handleCardPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.mode === "dragging" || gesture.mode === "scrolling") {
      event.preventDefault();
      suppressClickUntilRef.current = performance.now() + 700;
    }
    if (gesture.mode === "dragging") {
      onDragDeployRef.current?.({
        phase: "end",
        pointerId: gesture.pointerId,
        client: { x: event.clientX, y: event.clientY },
      });
    }
    gestureRef.current = null;
    if (gestureOwnerRef.current === gesture.pointerId) gestureOwnerRef.current = null;
    setDraggingKind(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleCardPointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    suppressClickUntilRef.current = performance.now() + 700;
    resetGesture(gesture, true);
  };

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
              data-dragging={draggingKind === item.kind}
              type="button"
              disabled={disabled}
              aria-pressed={selectedKind === item.kind}
              aria-describedby={`${item.kind}-deployment-status`}
              onClick={(event) => {
                if (performance.now() < suppressClickUntilRef.current) {
                  suppressClickUntilRef.current = 0;
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }
                onSelect(item.kind);
              }}
              onPointerDown={(event) => handleCardPointerDown(event, item.kind)}
              onPointerMove={handleCardPointerMove}
              onPointerUp={handleCardPointerUp}
              onPointerCancel={handleCardPointerCancel}
              onLostPointerCapture={handleCardPointerCancel}
              onContextMenu={(event) => event.preventDefault()}
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
    iconSrc: deployableIconForRace(kind, race),
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
      iconSrc: deployableIconForRace(kind, race),
      name: deployableLabelForRace(kind, race),
    };
  }
  const barracks = barracksDesignForRace(race);
  const rules = barracksRulesForRace(race);
  const spawnedUnit = troopDesignForRace(barracks.spawnedUnit, race);
  return {
    iconSrc: deployableIconForRace("barracks", race),
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
