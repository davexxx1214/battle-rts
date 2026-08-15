import {
  issueAttackCommand,
  issueAttackMoveCommand,
  type BattleState,
  type WorldPoint,
} from "./battle";
import type { Faction } from "./types";

export type PlannedCommand =
  | {
      readonly kind: "attack";
      readonly unitIds: readonly string[];
      readonly targetId: string;
    }
  | {
      readonly kind: "attack-move";
      readonly unitIds: readonly string[];
      readonly destination: WorldPoint;
    };

export function queuePlannedCommand(
  current: readonly PlannedCommand[],
  incoming: PlannedCommand,
): PlannedCommand[] {
  const unitIds = [...new Set(incoming.unitIds)];
  if (unitIds.length === 0) return [...current];
  const reassigned = new Set(unitIds);
  const retained = current.flatMap((command) => {
    const remainingIds = command.unitIds.filter((unitId) => !reassigned.has(unitId));
    return remainingIds.length > 0
      ? [{ ...command, unitIds: remainingIds }]
      : [];
  });
  const normalized = incoming.kind === "attack"
    ? { ...incoming, unitIds }
    : { ...incoming, unitIds, destination: { ...incoming.destination } };
  return [...retained, normalized];
}

export function applyPlannedCommands(
  state: BattleState,
  commands: readonly PlannedCommand[],
  issuerFaction: Faction,
): BattleState {
  return commands.reduce((current, command) => {
    const authorizedIds = command.unitIds.filter((unitId) => {
      const unit = current.units.find((candidate) => candidate.id === unitId);
      return unit?.faction === issuerFaction && unit.health > 0;
    });
    if (authorizedIds.length === 0) return current;
    return command.kind === "attack"
      ? issueAttackCommand(current, authorizedIds, command.targetId)
      : issueAttackMoveCommand(current, authorizedIds, command.destination);
  }, state);
}
