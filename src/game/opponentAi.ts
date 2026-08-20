import type { BattleSessionState } from "./battleSessionState";
import { resolveBattleRuntimeContext } from "./battleRuntime";
import {
  deployBattleSessionEntity,
  getDeployableAvailability,
  previewDeployment,
} from "./deployTransaction";
import {
  aiTroopCycleForRace,
  GAME_RULES,
  isBuildingDeployable,
  type AiDeploymentPosture,
  type AiDifficulty,
  type DeployableKind,
  type OpponentAiStrategy,
  type TroopKind,
} from "./rules";
import { resolveBattleRace } from "./factions";
import type { WorldPoint } from "./types";
import {
  axialToWorld,
  hexDistance,
  type BattlefieldCell,
  type BattlefieldMap,
} from "../map/battlefield";

const OPPONENT_FACTION = "crimson" as const;

export function advanceOpponentAi(
  session: BattleSessionState,
  difficulty: AiDifficulty,
): BattleSessionState {
  if (session.phase !== "engaged" || session.battle.winner !== null) return session;
  const runtime = resolveBattleRuntimeContext(session.battle);
  if (runtime.mode.opponentPolicy.kind !== "legacy-deployment-ai") return session;
  const strategy = GAME_RULES.opponentAi.strategies[difficulty];
  const preferredKind = selectOpponentKind(session, strategy, difficulty);
  const deployment = chooseDeployment(
    session,
    preferredKind,
    strategy,
    difficulty,
    runtime.map,
  );
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
  map: BattlefieldMap,
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
      map,
    );
    if (worldPosition) return { kind: preferredKind, worldPosition };
  } else if (
    !isBuildingDeployable(preferredKind)
    || availability.reason !== "no-buildable-hex"
  ) {
    return null;
  }
  const troopKind = selectTroopKind(session, difficulty);
  const worldPosition = chooseDeploymentPosition(
    session,
    troopKind,
    strategy.deploymentPosture,
    map,
  );
  return worldPosition ? { kind: troopKind, worldPosition } : null;
}

function chooseDeploymentPosition(
  session: BattleSessionState,
  kind: DeployableKind,
  posture: AiDeploymentPosture,
  map: BattlefieldMap,
): WorldPoint | null {
  const comparator = kind === "gold-mine"
    ? compareDefensiveCells(map)
    : deploymentComparator(posture, map);
  const cell = [...map.cells]
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
  return selectTroopKind(session, difficulty);
}

function selectTroopKind(
  session: BattleSessionState,
  difficulty: AiDifficulty,
): TroopKind {
  const race = resolveBattleRace(
    session.battle.factionRaces,
    OPPONENT_FACTION,
    session.battle.undeadOpponent,
  );
  const troopCycle = aiTroopCycleForRace(race, difficulty);
  const deployedTroops = troopCycle.reduce((total, kind) => (
    total + session.battle.deploymentCounts[OPPONENT_FACTION][kind]
  ), 0);
  return troopCycle[deployedTroops % troopCycle.length]!;
}

function deploymentComparator(
  posture: AiDeploymentPosture,
  map: BattlefieldMap,
): (first: BattlefieldCell, second: BattlefieldCell) => number {
  if (posture === "defensive") return compareDefensiveCells(map);
  if (posture === "balanced") return compareBalancedCells(map);
  return compareAggressiveCells(map);
}

function compareDefensiveCells(
  map: BattlefieldMap,
): (first: BattlefieldCell, second: BattlefieldCell) => number {
  return (first, second) => {
    const castle = map.castles[OPPONENT_FACTION];
    return hexDistance(first, castle) - hexDistance(second, castle)
      || first.q - second.q
      || first.r - second.r;
  };
}

function compareBalancedCells(
  map: BattlefieldMap,
): (first: BattlefieldCell, second: BattlefieldCell) => number {
  return (first, second) => {
    const ownCastle = map.castles[OPPONENT_FACTION];
    const enemyCastle = map.castles.verdant;
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
  };
}

function compareAggressiveCells(
  map: BattlefieldMap,
): (first: BattlefieldCell, second: BattlefieldCell) => number {
  return (first, second) => {
    const enemyCastle = map.castles.verdant;
    return hexDistance(first, enemyCastle) - hexDistance(second, enemyCastle)
      || first.q - second.q
      || first.r - second.r;
  };
}
