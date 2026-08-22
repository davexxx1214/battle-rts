import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { BattleState } from "../game/battle";
import { battleBuildingConstructionPhaseAt } from "../game/buildings";
import { sandboxBuildingMissingPrerequisites } from "../game/sandboxConstruction";
import {
  SANDBOX_BUILDING_SLOTS,
  SANDBOX_TROOP_SLOTS,
  sandboxBuildingSlotForKind,
  sandboxBuildingSpec,
  sandboxTroopSpec,
  type SandboxBuildingSlot,
  type SandboxTroopSlot,
} from "../game/sandboxCatalog";
import {
  SANDBOX_PRODUCTION_MAX_QUEUE_LENGTH,
  SANDBOX_PRODUCTION_POPULATION_CAP,
} from "../game/sandboxProductionQueue";
import { deployableIconForRace } from "./deployablePresentation";
import { deploymentGestureIntent } from "./deploymentDrag";
import type { FieldPoint } from "./fieldInput";
import { createSandboxHudModel } from "./sandboxHudModel";
import styles from "./SandboxActionDock.module.css";

export type SandboxActionDockItem =
  | { readonly category: "building"; readonly slot: SandboxBuildingSlot }
  | { readonly category: "troop"; readonly slot: SandboxTroopSlot };

export type SandboxActionDockDragEvent =
  | {
      readonly phase: "start";
      readonly item: SandboxActionDockItem;
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

interface SandboxActionDockProps {
  readonly battle: BattleState;
  readonly selectedBuilding: SandboxBuildingSlot | null;
  readonly disabled?: boolean;
  readonly onSelectBuilding: (slot: SandboxBuildingSlot) => void;
  readonly onEnqueueTroop: (slot: SandboxTroopSlot) => void;
  readonly onDragAction: (event: SandboxActionDockDragEvent) => void;
}

interface DockGesture {
  readonly pointerId: number;
  readonly item: SandboxActionDockItem;
  readonly element: HTMLButtonElement;
  readonly start: FieldPoint;
  mode: "pending" | "dragging" | "scrolling";
}

const BUILDING_ICON_KIND = {
  mine: "gold-mine",
  barracks: "barracks",
  "archery-range": "archer",
  "mage-tower": "mage",
  "siege-workshop": "catapult",
  "guard-tower": "guard-tower",
} as const;

export function SandboxActionDock({
  battle,
  selectedBuilding,
  disabled = false,
  onSelectBuilding,
  onEnqueueTroop,
  onDragAction,
}: SandboxActionDockProps) {
  const faction = "verdant" as const;
  const race = battle.factionRaces[faction];
  const account = battle.economy.accounts[faction];
  const hud = createSandboxHudModel(battle, faction);
  const gestureRef = useRef<DockGesture | null>(null);
  const dragCallbackRef = useRef(onDragAction);
  const suppressClickUntilRef = useRef(0);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  useEffect(() => {
    dragCallbackRef.current = onDragAction;
  }, [onDragAction]);

  useEffect(() => {
    const finishGesture = (event: PointerEvent, cancelled: boolean) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (gesture.mode === "dragging" || gesture.mode === "scrolling") {
        suppressClickUntilRef.current = performance.now() + 700;
        if (event.cancelable) event.preventDefault();
      }
      if (gesture.mode === "dragging") {
        dragCallbackRef.current(cancelled
          ? { phase: "cancel", pointerId: gesture.pointerId }
          : {
              phase: "end",
              pointerId: gesture.pointerId,
              client: { x: event.clientX, y: event.clientY },
            });
      }
      gestureRef.current = null;
      setDraggingKey(null);
      if (gesture.element.hasPointerCapture(gesture.pointerId)) {
        gesture.element.releasePointerCapture(gesture.pointerId);
      }
    };
    const onPointerUp = (event: PointerEvent) => finishGesture(event, false);
    const onPointerCancel = (event: PointerEvent) => finishGesture(event, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerCancel, true);
    return () => {
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
      const gesture = gestureRef.current;
      if (gesture?.mode === "dragging") {
        dragCallbackRef.current({ phase: "cancel", pointerId: gesture.pointerId });
      }
      gestureRef.current = null;
    };
  }, []);

  const beginGesture = (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: SandboxActionDockItem,
  ) => {
    if (event.button !== 0 || gestureRef.current) return;
    const start = { x: event.clientX, y: event.clientY };
    suppressClickUntilRef.current = 0;
    gestureRef.current = {
      pointerId: event.pointerId,
      item,
      element: event.currentTarget,
      start,
      mode: "pending",
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
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
      gesture.mode = "dragging";
      suppressClickUntilRef.current = performance.now() + 700;
      setDraggingKey(itemKey(gesture.item));
      dragCallbackRef.current({
        phase: "start",
        item: gesture.item,
        pointerId: gesture.pointerId,
        client,
      });
    }
    if (gesture.mode !== "dragging") return;
    event.preventDefault();
    dragCallbackRef.current({
      phase: "move",
      pointerId: gesture.pointerId,
      client,
    });
  };

  const finishLocalGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.mode === "dragging" || gesture.mode === "scrolling") {
      suppressClickUntilRef.current = performance.now() + 700;
      event.preventDefault();
    }
    if (gesture.mode === "dragging") {
      dragCallbackRef.current({
        phase: "end",
        pointerId: gesture.pointerId,
        client: { x: event.clientX, y: event.clientY },
      });
    }
    gestureRef.current = null;
    setDraggingKey(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cancelLocalGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    suppressClickUntilRef.current = performance.now() + 700;
    if (gesture.mode === "dragging") {
      dragCallbackRef.current({ phase: "cancel", pointerId: gesture.pointerId });
    }
    gestureRef.current = null;
    setDraggingKey(null);
  };

  const runClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    if (performance.now() < suppressClickUntilRef.current) {
      suppressClickUntilRef.current = 0;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    action();
  };

  return (
    <aside className={styles.dock} data-field-ui aria-label="沙盒快捷建造与生产栏">
      <div className={styles.scroller}>
        <span className={styles.groupLabel} title="建筑">⌂</span>
        {SANDBOX_BUILDING_SLOTS.map((slot) => {
          const spec = sandboxBuildingSpec(slot);
          const display = spec.displayByRace[race];
          const missing = sandboxBuildingMissingPrerequisites(
            battle.buildings,
            faction,
            slot,
            battle.matchElapsed,
          );
          const unlocked = missing.length === 0;
          const lacksGold = account.gold < spec.cost;
          const emergencyPermit = slot === "mine"
            && hud.emergencyMinePermitAvailable;
          const unavailable = disabled || !unlocked || (lacksGold && !emergencyPermit);
          const count = battle.buildings.filter((building) => (
            building.faction === faction
            && building.status === "active"
            && building.health > 0
            && sandboxBuildingSlotForKind(building.kind) === slot
          )).length;
          const item = { category: "building", slot } as const;
          const title = !unlocked
            ? `${display.name}未解锁：需先完成${missing.map((required) => (
                sandboxBuildingSpec(required).displayByRace[race].name
              )).join("、")}`
            : lacksGold && !emergencyPermit
              ? `${display.name}：金币不足，需要 ${spec.cost}`
              : `${display.name}：点击选择，或拖到地图直接建造`;
          return (
            <button
              type="button"
              className={styles.action}
              key={slot}
              data-category="building"
              data-selected={selectedBuilding === slot}
              data-dragging={draggingKey === itemKey(item)}
              data-unlocked={unlocked}
              disabled={unavailable}
              aria-label={`${display.name}，${spec.cost} 金币，已有 ${count} 座`}
              aria-pressed={selectedBuilding === slot}
              title={title}
              onClick={(event) => runClick(event, () => onSelectBuilding(slot))}
              onPointerDown={(event) => beginGesture(event, item)}
              onPointerMove={moveGesture}
              onPointerUp={finishLocalGesture}
              onPointerCancel={cancelLocalGesture}
              onLostPointerCapture={cancelLocalGesture}
              onContextMenu={(event) => event.preventDefault()}
            >
              <span className={styles.iconFrame} aria-hidden="true">
                <img
                  src={deployableIconForRace(BUILDING_ICON_KIND[slot], race)}
                  alt=""
                  draggable={false}
                />
                <b>×{count}</b>
              </span>
              <span className={styles.name}>{display.name}</span>
              <small><i aria-hidden="true">●</i>{spec.cost}</small>
            </button>
          );
        })}

        <span className={styles.divider} aria-hidden="true" />
        <span className={styles.groupLabel} title="兵种">⚔</span>
        {SANDBOX_TROOP_SLOTS.map((slot) => {
          const spec = sandboxTroopSpec(slot);
          const display = spec.displayByRace[race];
          const producerQueues = battle.production
            ? Object.values(battle.production.queuesByBuildingId).filter((queue) => {
                if (queue.faction !== faction || queue.producer !== spec.producer) return false;
                const building = battle.buildings.find(({ id }) => id === queue.buildingId);
                return building !== undefined
                  && building.health > 0
                  && building.status === "active"
                  && battleBuildingConstructionPhaseAt(building, battle.matchElapsed) === "operational";
              })
            : [];
          const hasProducer = producerQueues.length > 0;
          const queueAvailable = producerQueues.some((queue) => (
            queue.entries.length < SANDBOX_PRODUCTION_MAX_QUEUE_LENGTH
          ));
          const lacksGold = account.gold < spec.cost;
          const populationFull = hud.committedPopulation + spec.populationCost
            > SANDBOX_PRODUCTION_POPULATION_CAP;
          const unavailable = disabled
            || !hasProducer
            || !queueAvailable
            || lacksGold
            || populationFull;
          const count = battle.units.filter((unit) => (
            unit.faction === faction
            && unit.health > 0
            && unit.status !== "dead"
            && unit.role === spec.roleByRace[race]
          )).length;
          const item = { category: "troop", slot } as const;
          const title = !hasProducer
            ? `${display.name}未解锁：需要已完工的${sandboxBuildingSpec(spec.producer).displayByRace[race].name}`
            : !queueAvailable
              ? `${display.name}：对应建筑队列已满`
              : lacksGold
                ? `${display.name}：金币不足，需要 ${spec.cost}`
                : populationFull
                  ? `${display.name}：将超过 ${SANDBOX_PRODUCTION_POPULATION_CAP} 人口上限`
                  : `${display.name}：点击训练，或拖到战场训练并设置集结点`;
          return (
            <button
              type="button"
              className={styles.action}
              key={slot}
              data-category="troop"
              data-dragging={draggingKey === itemKey(item)}
              disabled={unavailable}
              aria-label={`${display.name}，${spec.cost} 金币，现有 ${count} 个`}
              title={title}
              onClick={(event) => runClick(event, () => onEnqueueTroop(slot))}
              onPointerDown={(event) => beginGesture(event, item)}
              onPointerMove={moveGesture}
              onPointerUp={finishLocalGesture}
              onPointerCancel={cancelLocalGesture}
              onLostPointerCapture={cancelLocalGesture}
              onContextMenu={(event) => event.preventDefault()}
            >
              <span className={styles.iconFrame} aria-hidden="true">
                <img src={deployableIconForRace(slot, race)} alt="" draggable={false} />
                <b>×{count}</b>
              </span>
              <span className={styles.name}>{display.name}</span>
              <small><i aria-hidden="true">●</i>{spec.cost}</small>
            </button>
          );
        })}
      </div>
      <small className={styles.hint}>点击选择 · 向上拖到战场</small>
    </aside>
  );
}

function itemKey(item: SandboxActionDockItem): string {
  return `${item.category}:${item.slot}`;
}
