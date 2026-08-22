import type { BattleState } from "../game/battle";
import {
  TROOP_KINDS,
  troopDesignForRace,
  unitRoleForRace,
  type TroopKind,
} from "../game/rules";
import { sandboxSquadOrderFor } from "../game/sandboxOrders";
import type { BattleRace } from "../game/types";
import styles from "./SandboxSquadCommandBar.module.css";

interface SandboxSquadCommandBarProps {
  readonly battle?: BattleState;
  readonly selectedSquadIds?: readonly string[];
  /** Legacy render-only fallback used by isolated consumers. */
  readonly selectedCount?: number;
  readonly disabled?: boolean;
  readonly playerRace?: BattleRace;
  readonly onSelectSquads?: (squadIds: readonly string[]) => void;
}

const ORDER_LABEL = {
  move: "移动",
  attack: "攻击",
  "attack-move": "索敌前进",
  stop: "停止",
  hold: "坚守",
} as const;

const TROOP_ICON: Record<TroopKind, string> = {
  spearman: "⌁",
  archer: "➶",
  swordsman: "⚔",
  mage: "✦",
  catapult: "◉",
};

export function SandboxSquadCommandBar({
  battle,
  selectedSquadIds = [],
  selectedCount,
  disabled = false,
  playerRace = "human",
  onSelectSquads,
}: SandboxSquadCommandBarProps) {
  const friendlySquadIds = battle
    ? livingFriendlySquadIds(battle)
    : [];
  const troopGroups = battle && friendlySquadIds.length > 1
    ? TROOP_KINDS.flatMap((kind) => {
        const role = unitRoleForRace(kind, playerRace);
        const squadIds = uniqueSortedSquadIds(battle.units.filter((unit) => (
          unit.faction === "verdant"
          && unit.health > 0
          && unit.status !== "dead"
          && unit.role === role
        )).map(({ squadId }) => squadId));
        return squadIds.length > 0
          ? [{ kind, label: troopDesignForRace(kind, playerRace).name, squadIds }]
          : [];
      })
    : [];
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
      data-has-army={battle ? friendlySquadIds.length > 0 : resolvedSelectedCount > 0}
      aria-label="沙盒单位控制"
    >
      <div className={styles.selectionSummary}>
        <span><i aria-hidden="true">◎</i><b>已选单位</b></span>
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
      {battle && (
        <div className={styles.quickSelect} aria-label="快速选择部队">
          <button
            type="button"
            aria-label={`选中所有我方部队，共 ${friendlySquadIds.length} 个`}
            aria-pressed={sameSquadSelection(selectedSquadIds, friendlySquadIds)}
            disabled={disabled || friendlySquadIds.length === 0 || !onSelectSquads}
            title={`全选我方部队（${friendlySquadIds.length}）`}
            onClick={() => onSelectSquads?.(friendlySquadIds)}
          >
            <i className={styles.quickIcon} aria-hidden="true">◉</i>
            <span className={styles.quickLabel}>全选部队</span>
            <em>×{friendlySquadIds.length}</em>
          </button>
          {troopGroups.map((group) => (
            <button
              key={group.kind}
              type="button"
              aria-label={`选中所有我方${group.label}，共 ${group.squadIds.length} 个`}
              aria-pressed={sameSquadSelection(selectedSquadIds, group.squadIds)}
              disabled={disabled || !onSelectSquads}
              title={`全选${group.label}（${group.squadIds.length}）`}
              onClick={() => onSelectSquads?.(group.squadIds)}
            >
              <i className={styles.quickIcon} aria-hidden="true">{TROOP_ICON[group.kind]}</i>
              <span className={styles.quickLabel}>全选{group.label}</span>
              <em>×{group.squadIds.length}</em>
            </button>
          ))}
        </div>
      )}
      <div className={styles.guidance} data-enabled={!unavailable}>
        <strong>{unavailable ? "选择单位" : "点击战场任意地点"}</strong>
        <small>{unavailable
          ? "点击己方单位；Shift + 左键拖框可多选"
          : "自动索敌前进 · 遇敌先战斗，消灭后继续行军"}</small>
      </div>
    </aside>
  );
}

function livingFriendlySquadIds(battle: BattleState): readonly string[] {
  return uniqueSortedSquadIds(battle.units.filter((unit) => (
    unit.faction === "verdant" && unit.health > 0 && unit.status !== "dead"
  )).map(({ squadId }) => squadId));
}

function uniqueSortedSquadIds(squadIds: readonly string[]): readonly string[] {
  return [...new Set(squadIds)].sort();
}

function sameSquadSelection(
  selectedSquadIds: readonly string[],
  targetSquadIds: readonly string[],
): boolean {
  if (targetSquadIds.length === 0) return false;
  if (selectedSquadIds.length !== targetSquadIds.length) return false;
  const selected = new Set(selectedSquadIds);
  return targetSquadIds.every((squadId) => selected.has(squadId));
}

function shortUnitId(unitId: string): string {
  const parts = unitId.split(":");
  return parts.length > 1 ? `#${parts.at(-1)}` : unitId;
}
