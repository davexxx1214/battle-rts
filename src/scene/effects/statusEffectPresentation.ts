import type { UnitRole } from "../../game/types";
import {
  isUnitStatusEffectActive,
  type UnitStatusEffect,
} from "../../game/unitStatusEffects";
import { unitBaseRingGeometry } from "../units/unitRingPresentation";

export const STATUS_EFFECT_FADE_IN_SECONDS = 0.08;
export const STATUS_EFFECT_FADE_OUT_SECONDS = 0.18;
export const BURNING_STATUS_FADE_IN_SECONDS = 0.04;
export const BURNING_STATUS_FADE_OUT_SECONDS = 0.08;

export const FROST_SLOW_STATUS_COLORS = {
  inner: "#e8fbff",
  outer: "#5bc9ff",
  crystal: "#a7ebff",
} as const;

export const BURNING_STATUS_COLORS = {
  core: "#ff7a1f",
  flame: "#df3f1f",
  ember: "#ffb52e",
  ring: "#ff9b2f",
} as const;

export const STATUS_EFFECT_MODEL_TINTS = {
  "frost-slow": {
    color: FROST_SLOW_STATUS_COLORS.outer,
    colorMix: 0.62,
    emissiveIntensity: 0.42,
  },
  burning: {
    color: BURNING_STATUS_COLORS.core,
    colorMix: 0.7,
    emissiveIntensity: 0.62,
  },
} as const;

export interface UnitStatusModelTint {
  readonly kind: UnitStatusEffect["kind"];
  readonly color: string;
  readonly colorMix: number;
  readonly emissiveIntensity: number;
}

export function visibleUnitStatusEffects(
  effects: readonly UnitStatusEffect[],
  elapsed: number,
): readonly UnitStatusEffect[] {
  return effects.filter((effect) => isUnitStatusEffectActive(effect, elapsed));
}

export function unitStatusEffectVisualRadius(role: UnitRole): number {
  return unitBaseRingGeometry(role).outerRadius * 1.08;
}

export function unitStatusModelTint(
  effects: readonly UnitStatusEffect[],
  elapsed: number,
): UnitStatusModelTint | null {
  const active = visibleUnitStatusEffects(effects, elapsed);
  const effect = active.reduce<UnitStatusEffect | null>((latest, candidate) => (
    !latest || candidate.lastAppliedAt >= latest.lastAppliedAt ? candidate : latest
  ), null);
  if (!effect) return null;
  const opacity = unitStatusEffectOpacity(effect, elapsed);
  if (opacity <= 0) return null;
  const presentation = STATUS_EFFECT_MODEL_TINTS[effect.kind];
  return {
    kind: effect.kind,
    color: presentation.color,
    colorMix: presentation.colorMix * opacity,
    emissiveIntensity: presentation.emissiveIntensity * opacity,
  };
}

export function unitStatusEffectPhase(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff * Math.PI * 2;
}

export function unitStatusEffectOpacity(
  effect: UnitStatusEffect,
  elapsed: number,
): number {
  const fadeInSeconds = effect.kind === "burning"
    ? BURNING_STATUS_FADE_IN_SECONDS
    : STATUS_EFFECT_FADE_IN_SECONDS;
  const fadeOutSeconds = effect.kind === "burning"
    ? BURNING_STATUS_FADE_OUT_SECONDS
    : STATUS_EFFECT_FADE_OUT_SECONDS;
  const fadeIn = Math.max(0, Math.min(
    1,
    (elapsed - effect.appliedAt) / fadeInSeconds,
  ));
  const fadeOut = Math.max(0, Math.min(
    1,
    (effect.expiresAt - elapsed) / fadeOutSeconds,
  ));
  return Math.min(fadeIn, fadeOut);
}
