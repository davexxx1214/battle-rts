import type { NeutralMonsterKind } from "../map/battlefieldDefinition";

export const SANDBOX_NEUTRAL_KILL_REWARDS = Object.freeze({
  skeleton: 60,
  sharky: 80,
  mako: 100,
} as const satisfies Readonly<Record<NeutralMonsterKind, number>>);

export function sandboxNeutralKillReward(kind: NeutralMonsterKind): number {
  return SANDBOX_NEUTRAL_KILL_REWARDS[kind];
}
