import type { BattleUnit } from "./battle";
import type { Faction, UnitRole } from "./types";

export interface BattleSquad {
  readonly id: string;
  readonly faction: Faction;
  readonly role: UnitRole;
  readonly memberIds: readonly string[];
  readonly initialSize: number;
  readonly routed: boolean;
  readonly routedAt: number | null;
}

export function buildSquads(units: readonly BattleUnit[]): BattleSquad[] {
  const squads = new Map<string, BattleSquad>();

  for (const unit of units) {
    const existing = squads.get(unit.squadId);
    if (existing) {
      squads.set(unit.squadId, {
        ...existing,
        memberIds: [...existing.memberIds, unit.id],
        initialSize: existing.initialSize + 1,
      });
      continue;
    }
    squads.set(unit.squadId, {
      id: unit.squadId,
      faction: unit.faction,
      role: unit.role,
      memberIds: [unit.id],
      initialSize: 1,
      routed: false,
      routedAt: null,
    });
  }

  return [...squads.values()];
}
