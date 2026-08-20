import {
  battlefieldDefinitionFor,
  type BattlefieldDefinition,
} from "../map/battlefieldDefinition";
import type { BattlefieldMap } from "../map/battlefield";
import {
  battleModeDefinitionFor,
  type BattleModeDefinition,
  type BattleModeId,
} from "./battleMode";

export interface BattleRuntimeSource {
  readonly modeId: BattleModeId;
  readonly mapId: string;
}

export interface BattleRuntimeContext {
  readonly mode: BattleModeDefinition;
  readonly battlefield: BattlefieldDefinition;
  readonly map: BattlefieldMap;
}

/**
 * Restores immutable runtime definitions from the serializable identifiers kept
 * in BattleState. Runtime objects and caches deliberately never enter saved state.
 */
export function resolveBattleRuntimeContext(
  source: BattleRuntimeSource,
): BattleRuntimeContext {
  const mode = battleModeDefinitionFor(source.modeId);
  const battlefield = battlefieldDefinitionFor(source.mapId);
  return { mode, battlefield, map: battlefield.map };
}
