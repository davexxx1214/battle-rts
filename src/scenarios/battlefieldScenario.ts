import type { Faction, UnitRole, WorldPoint } from "../game/types";

export interface BattlefieldDeployment {
  readonly name: string;
  readonly role: UnitRole;
  readonly count: number;
  readonly center: WorldPoint;
}

export const BATTLEFIELD_DEPLOYMENTS: Readonly<
  Record<Faction, readonly BattlefieldDeployment[]>
> = {
  verdant: createDeployment("verdant"),
  crimson: createDeployment("crimson"),
};

function createDeployment(faction: Faction): BattlefieldDeployment[] {
  const side = faction === "verdant" ? 1 : -1;
  return [
    { name: "shield-left", role: "knight", count: 10, center: { x: -2.4, z: side * 3.1 } },
    { name: "shield-right", role: "knight", count: 10, center: { x: 2.4, z: side * 3.1 } },
    { name: "bow-left", role: "ranger", count: 8, center: { x: -2.4, z: side * 4.9 } },
    { name: "bow-right", role: "ranger", count: 8, center: { x: 2.4, z: side * 4.9 } },
    { name: "arcane", role: "mage", count: 4, center: { x: 0, z: side * 6.5 } },
    { name: "siege", role: "catapult", count: 1, center: { x: 0, z: side * 7.5 } },
  ];
}
