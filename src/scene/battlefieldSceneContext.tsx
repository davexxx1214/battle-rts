import { createContext, useContext, type ReactNode } from "react";

import {
  LEGACY_BATTLEFIELD_DEFINITION,
  type BattlefieldDefinition,
} from "../map/battlefieldDefinition";

const BattlefieldSceneContext = createContext<BattlefieldDefinition>(
  LEGACY_BATTLEFIELD_DEFINITION,
);

export function BattlefieldSceneProvider({
  definition,
  children,
}: {
  readonly definition: BattlefieldDefinition;
  readonly children: ReactNode;
}) {
  return (
    <BattlefieldSceneContext.Provider value={definition}>
      {children}
    </BattlefieldSceneContext.Provider>
  );
}

export function useBattlefieldDefinition(): BattlefieldDefinition {
  return useContext(BattlefieldSceneContext);
}
