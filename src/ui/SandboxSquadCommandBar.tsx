import type { BattleState } from "../game/battle";
import { sandboxSquadOrderFor } from "../game/sandboxOrders";
import styles from "./SandboxSquadCommandBar.module.css";

interface SandboxSquadCommandBarProps {
  readonly battle?: BattleState;
  readonly selectedSquadIds?: readonly string[];
  /** Legacy render-only fallback used by isolated consumers. */
  readonly selectedCount?: number;
  readonly disabled?: boolean;
}

const ORDER_LABEL = {
  move: "移动",
  attack: "攻击",
  "attack-move": "索敌前进",
  stop: "停止",
  hold: "坚守",
} as const;

export function SandboxSquadCommandBar({
  battle,
  selectedSquadIds = [],
  selectedCount,
  disabled = false,
}: SandboxSquadCommandBarProps) {
  const unitSummaries = battle
    ? selectedSquadIds.map((squadId) => ({
        squadId,
        unit: battle.units.find((unit) => (
          unit.squadId === squadId && unit.health > 0 && unit.status !== "dead"
        )) ?? null,
        order: battle.squadOrders
          ? sandboxSquadOrderFor(battle.squadOrders, squadId)?.kind ?? null
          : null,
      })).filter((summary) => summary.unit !== null)
    : [];
  const resolvedSelectedCount = battle ? unitSummaries.length : selectedCount ?? 0;
  const unavailable = disabled || resolvedSelectedCount === 0;
  return (
    <aside
      className={styles.bar}
      data-field-ui
      data-active={resolvedSelectedCount > 0}
      aria-label="沙盒单位控制"
    >
      <div className={styles.selectionSummary}>
        <span>已选单位</span>
        <strong>{resolvedSelectedCount}</strong>
        {unitSummaries.length > 0 && unitSummaries.length <= 6 && (
          <div className={styles.squadDetails} aria-label="所选单位状态">
            {unitSummaries.map((summary) => (
              <small key={summary.squadId}>
                {shortUnitId(summary.unit!.id)} · {summary.order
                  ? ORDER_LABEL[summary.order]
                  : "待命"}
              </small>
            ))}
          </div>
        )}
      </div>
      <div className={styles.guidance} data-enabled={!unavailable}>
        <strong>{unavailable ? "选择单位" : "点击战场任意地点"}</strong>
        <small>{unavailable
          ? "点击己方单位；Shift + 左键拖框可多选"
          : "自动索敌前进 · 遇敌先战斗，消灭后继续行军"}</small>
      </div>
    </aside>
  );
}

function shortUnitId(unitId: string): string {
  const parts = unitId.split(":");
  return parts.length > 1 ? `#${parts.at(-1)}` : unitId;
}
