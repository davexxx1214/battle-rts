export type BattlefieldCloudKind = "big" | "small";

export interface BattlefieldCloud {
  readonly id: string;
  readonly kind: BattlefieldCloudKind;
  readonly position: readonly [x: number, y: number, z: number];
  readonly scale: number;
  readonly rotationY: number;
  readonly opacity: number;
  readonly safeAnchor?: { readonly q: number; readonly r: number };
}

export const BATTLEFIELD_CLOUDS: readonly BattlefieldCloud[] = [
  {
    id: "upper-west-big",
    kind: "big",
    position: [-12, 7, 2],
    scale: 0.88,
    rotationY: -Math.PI / 8,
    opacity: 0.82,
  },
  {
    id: "upper-midwest-small",
    kind: "small",
    position: [-11.5, 4.5, -4],
    scale: 0.92,
    rotationY: Math.PI / 5,
    opacity: 0.8,
  },
  {
    id: "upper-mideast-big",
    kind: "small",
    position: [13.85, 6.7, 0.31],
    scale: 0.9,
    rotationY: Math.PI / 10,
    opacity: 0.84,
    safeAnchor: { q: 6, r: -4 },
  },
  {
    id: "upper-east-small",
    kind: "big",
    position: [5.5, 7, -12],
    scale: 0.78,
    rotationY: -Math.PI / 4,
    opacity: 0.8,
  },
];
