import type { BattleSessionState } from "./battleSessionState";
import {
  deployBattleSessionEntity,
  getDeployableAvailability,
  previewDeployment,
} from "./deployTransaction";
import {
  GAME_RULES,
  isBuildingDeployable,
  type DeployableKind,
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
): BattleSessionState {
  if (session.phase !== "engaged" || session.battle.winner !== null) return session;
  const preferredKind = selectOpponentKind(session);
  const deployment = chooseDeployment(session, preferredKind);
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
): { readonly kind: DeployableKind; readonly worldPosition: WorldPoint } | null {
  const availability = getDeployableAvailability(
    session,
    OPPONENT_FACTION,
    preferredKind,
  );
  if (availability.enabled) {
    const worldPosition = chooseDeploymentPosition(session, preferredKind);
    if (worldPosition) return { kind: preferredKind, worldPosition };
  } else if (
    !isBuildingDeployable(preferredKind)
    || availability.reason !== "no-buildable-hex"
  ) {
    return null;
  }
  const troopKind = selectTroopKind(session);
  const worldPosition = chooseDeploymentPosition(session, troopKind);
  return worldPosition ? { kind: troopKind, worldPosition } : null;
}

function chooseDeploymentPosition(
  session: BattleSessionState,
  kind: DeployableKind,
): WorldPoint | null {
  const cell = [...BATTLEFIELD_MAP.cells]
    .sort(kind === "gold-mine" ? compareSafeBuildingCells : compareForwardCells)
    .find((candidate) => previewDeployment(session, {
      faction: OPPONENT_FACTION,
      kind,
      worldPosition: axialToWorld(candidate),
    }).valid);
  return cell ? axialToWorld(cell) : null;
}

function selectOpponentKind(session: BattleSessionState): DeployableKind {
  const activeBuildings = session.battle.buildings.filter((building) => (
    building.faction === OPPONENT_FACTION
    && building.status === "active"
    && building.health > 0
  ));
  for (const goal of GAME_RULES.opponentAi.buildingGoals) {
    const activeCount = activeBuildings.filter((building) => (
      building.kind === goal.kind
    )).length;
    if (activeCount < goal.desiredActive) return goal.kind;
  }
  return selectTroopKind(session);
}

function selectTroopKind(session: BattleSessionState): TroopKind {
  const troopCycle = GAME_RULES.opponentAi.troopCycle;
  const deployedTroops = troopCycle.reduce((total, kind) => (
    total + session.battle.deploymentCounts[OPPONENT_FACTION][kind]
  ), 0);
  return troopCycle[deployedTroops % troopCycle.length]!;
}

function compareSafeBuildingCells(first: BattlefieldCell, second: BattlefieldCell): number {
  const castle = BATTLEFIELD_MAP.castles[OPPONENT_FACTION];
  return hexDistance(first, castle) - hexDistance(second, castle)
    || first.q - second.q
    || first.r - second.r;
}

function compareForwardCells(first: BattlefieldCell, second: BattlefieldCell): number {
  const target = BATTLEFIELD_MAP.castles.verdant;
  return hexDistance(first, target) - hexDistance(second, target)
    || first.q - second.q
    || first.r - second.r;
}
