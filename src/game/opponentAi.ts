import type { BattleSessionState } from "./battleSessionState";
import {
  deployBattleSessionEntity,
  getDeployableAvailability,
  previewDeployment,
} from "./deployTransaction";
import {
  GAME_RULES,
  UNDEAD_AI_TROOP_CYCLES,
  isBuildingDeployable,
  type AiDeploymentPosture,
  type AiDifficulty,
  type DeployableKind,
  type OpponentAiStrategy,
  type TroopKind,
} from "./rules";
import type { WorldPoint } from "./types";
import {
  BATTLEFIELD_MAP,
  axialToWorld,
  hexDistance,
  type BattlefieldCell,
} from "../map/battlefield";

const OPPONENT_FACTION = "crimson" as const;

export function advanceOpponentAi(
  session: BattleSessionState,
  difficulty: AiDifficulty,
): BattleSessionState {
  if (session.phase !== "engaged" || session.battle.winner !== null) return session;
  const strategy = GAME_RULES.opponentAi.strategies[difficulty];
  const preferredKind = selectOpponentKind(session, strategy, difficulty);
  const deployment = chooseDeployment(session, preferredKind, strategy, difficulty);
  const kind = deployment?.kind;
  const worldPosition = deployment?.worldPosition;
  if (!kind || !worldPosition) return session;
  const result = deployBattleSessionEntity(session, {
    faction: OPPONENT_FACTION,
    kind,
    worldPosition,
  });
  return result.ok ? result.state : session;
}

function chooseDeployment(
  session: BattleSessionState,
  preferredKind: DeployableKind,
  strategy: OpponentAiStrategy,
  difficulty: AiDifficulty,
): { readonly kind: DeployableKind; readonly worldPosition: WorldPoint } | null {
  const availability = getDeployableAvailability(
    session,
    OPPONENT_FACTION,
    preferredKind,
  );
  if (availability.enabled) {
    const worldPosition = chooseDeploymentPosition(
      session,
      preferredKind,
      strategy.deploymentPosture,
    );
    if (worldPosition) return { kind: preferredKind, worldPosition };
  } else if (
    !isBuildingDeployable(preferredKind)
    || availability.reason !== "no-buildable-hex"
  ) {
    return null;
  }
  const troopKind = selectTroopKind(session, strategy, difficulty);
  const worldPosition = chooseDeploymentPosition(
    session,
    troopKind,
    strategy.deploymentPosture,
  );
  return worldPosition ? { kind: troopKind, worldPosition } : null;
}

function chooseDeploymentPosition(
  session: BattleSessionState,
  kind: DeployableKind,
  posture: AiDeploymentPosture,
): WorldPoint | null {
  const comparator = kind === "gold-mine"
    ? compareDefensiveCells
    : deploymentComparator(posture);
  const cell = [...BATTLEFIELD_MAP.cells]
    .sort(comparator)
    .find((candidate) => previewDeployment(session, {
      faction: OPPONENT_FACTION,
      kind,
      worldPosition: axialToWorld(candidate),
    }).valid);
  return cell ? axialToWorld(cell) : null;
}

function selectOpponentKind(
  session: BattleSessionState,
  strategy: OpponentAiStrategy,
  difficulty: AiDifficulty,
): DeployableKind {
  const activeBuildings = session.battle.buildings.filter((building) => (
    building.faction === OPPONENT_FACTION
    && building.status === "active"
    && building.health > 0
  ));
  for (const goal of strategy.buildingGoals) {
    const activeCount = activeBuildings.filter((building) => (
      building.kind === goal.kind
    )).length;
    if (activeCount < goal.desiredActive) return goal.kind;
  }
  return selectTroopKind(session, strategy, difficulty);
}

function selectTroopKind(
  session: BattleSessionState,
  strategy: OpponentAiStrategy,
  difficulty: AiDifficulty,
): TroopKind {
  const troopCycle = session.battle.undeadOpponent
    ? UNDEAD_AI_TROOP_CYCLES[difficulty]
    : strategy.troopCycle;
  const deployedTroops = troopCycle.reduce((total, kind) => (
    total + session.battle.deploymentCounts[OPPONENT_FACTION][kind]
  ), 0);
  return troopCycle[deployedTroops % troopCycle.length]!;
}

function deploymentComparator(
  posture: AiDeploymentPosture,
): (first: BattlefieldCell, second: BattlefieldCell) => number {
  if (posture === "defensive") return compareDefensiveCells;
  if (posture === "balanced") return compareBalancedCells;
  return compareAggressiveCells;
}

function compareDefensiveCells(first: BattlefieldCell, second: BattlefieldCell): number {
  const castle = BATTLEFIELD_MAP.castles[OPPONENT_FACTION];
  return hexDistance(first, castle) - hexDistance(second, castle)
    || first.q - second.q
    || first.r - second.r;
}

function compareBalancedCells(first: BattlefieldCell, second: BattlefieldCell): number {
  const ownCastle = BATTLEFIELD_MAP.castles[OPPONENT_FACTION];
  const enemyCastle = BATTLEFIELD_MAP.castles.verdant;
  const firstBalance = Math.abs(
    hexDistance(first, ownCastle) - hexDistance(first, enemyCastle),
  );
  const secondBalance = Math.abs(
    hexDistance(second, ownCastle) - hexDistance(second, enemyCastle),
  );
  return firstBalance - secondBalance
    || hexDistance(first, enemyCastle) - hexDistance(second, enemyCastle)
    || first.q - second.q
    || first.r - second.r;
}

function compareAggressiveCells(first: BattlefieldCell, second: BattlefieldCell): number {
  const enemyCastle = BATTLEFIELD_MAP.castles.verdant;
  return hexDistance(first, enemyCastle) - hexDistance(second, enemyCastle)
    || first.q - second.q
    || first.r - second.r;
}
