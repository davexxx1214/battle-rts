import type { BattleUnit } from "./battle";
import type { WorldPoint } from "./types";

export interface MeleeEngagementSlot {
  readonly attackerId: string;
  readonly targetId: string;
  readonly index: number;
  readonly position: WorldPoint;
}

interface MeleeEngagementRequest {
  readonly attacker: BattleUnit;
  readonly target: BattleUnit;
  readonly previousSlotIndex?: number;
}

const SLOT_COUNT = 8;
const SLOT_RADIUS = 1.02;

export function assignMeleeEngagementSlots(
  requests: readonly MeleeEngagementRequest[],
  isPositionAvailable: (
    position: WorldPoint,
    request: MeleeEngagementRequest,
  ) => boolean = () => true,
): MeleeEngagementSlot[] {
  const occupiedByTarget = new Map<string, Set<number>>();
  const assignments: MeleeEngagementSlot[] = [];
  const sorted = [...requests].sort((first, second) => (
    first.target.id.localeCompare(second.target.id)
    || first.attacker.id.localeCompare(second.attacker.id)
  ));

  for (const request of sorted) {
    const occupied = occupiedByTarget.get(request.target.id) ?? new Set<number>();
    occupiedByTarget.set(request.target.id, occupied);
    const available = Array.from({ length: SLOT_COUNT }, (_, index) => index)
      .filter((index) => (
        !occupied.has(index)
        && isPositionAvailable(slotPosition(request.target.position, index), request)
      ));
    if (available.length === 0) continue;
    const index = request.previousSlotIndex !== undefined
      && available.includes(request.previousSlotIndex)
      ? request.previousSlotIndex
      : available.sort((first, second) => (
          distance(request.attacker.position, slotPosition(request.target.position, first))
          - distance(request.attacker.position, slotPosition(request.target.position, second))
          || first - second
        ))[0]!;
    occupied.add(index);
    assignments.push({
      attackerId: request.attacker.id,
      targetId: request.target.id,
      index,
      position: slotPosition(request.target.position, index),
    });
  }
  return assignments;
}

function slotPosition(target: WorldPoint, index: number): WorldPoint {
  const angle = (index / SLOT_COUNT) * Math.PI * 2;
  return {
    x: target.x + Math.cos(angle) * SLOT_RADIUS,
    z: target.z + Math.sin(angle) * SLOT_RADIUS,
  };
}

function distance(first: WorldPoint, second: WorldPoint): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}
