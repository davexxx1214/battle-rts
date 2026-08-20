import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  type BattleState,
} from "../../src/game/battle";
import { createBattleBuilding } from "../../src/game/buildings";
import {
  occupyMinePit,
  replaceMinePitState,
  type MinePitState,
  type SandboxMiningState,
} from "../../src/game/miningEconomy";
import { axialToWorld } from "../../src/map/battlefield";
import {
  LEGACY_BATTLEFIELD_DEFINITION,
  SANDBOX_LARGE_BATTLEFIELD_DEFINITION,
} from "../../src/map/battlefieldDefinition";
import { createCameraViewStore } from "../../src/scene/camera/cameraViewStore";
import { SandboxMinimap } from "../../src/ui/minimap/SandboxMinimap";

describe("sandbox minimap", () => {
  it("renders all graybox and dynamic layers from the three explicit data sources", () => {
    const definition = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
    const firstMine = definition.minePits?.[0];
    if (!firstMine) throw new Error("Sandbox fixture requires a mine pit.");
    const battle = sandboxBattleWithDynamicMarkers(firstMine);
    const cameraViewStore = createCameraViewStore();
    cameraViewStore.publish({
      center: axialToWorld(definition.map.castles.verdant),
      width: 24,
      height: 18,
      yaw: 0.42,
    });

    const markup = renderToStaticMarkup(createElement(SandboxMinimap, {
      battle,
      battlefield: definition,
      cameraViewStore,
      onCameraTargetRequest: () => undefined,
    }));

    expect(markup).toContain('aria-label="沙盒战场小地图"');
    expect(markup).toContain('data-battlefield-id="sandbox-large-v1"');
    expect(markup).toContain('data-sandbox-minimap="true"');
    expect(markup.match(/data-minimap-route=/g)).toHaveLength(3);
    expect(markup.match(/data-minimap-build-zone=/g)).toHaveLength(4);
    expect(markup.match(/data-minimap-mine=/g)).toHaveLength(8);
    expect(markup.match(/data-minimap-castle=/g)).toHaveLength(2);
    expect(markup.match(/data-minimap-building=/g)).toHaveLength(2);
    expect(markup.match(/data-minimap-squad=/g)).toHaveLength(2);
    const mineMarker = minimapMineTag(markup, firstMine.id);
    expect(mineMarker).toContain('data-faction="verdant"');
    expect(mineMarker).toContain('data-occupying-mine="verdant-pit-mine"');
    expect(mineMarker).toContain('data-status="occupied"');
    expect(markup).toContain('data-minimap-viewport="true"');
  });

  it("uses runtime mining state for controller, occupancy, depletion and capture", () => {
    const definition = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
    const [occupiedDefinition, depletedDefinition, capturingDefinition] = definition.minePits ?? [];
    if (!occupiedDefinition || !depletedDefinition || !capturingDefinition) {
      throw new Error("Sandbox fixture requires three mine pits.");
    }
    const initial = createBattleState([], { modeId: "sandbox" });
    if (!initial.mining) throw new Error("Sandbox fixture requires mining state.");
    let mining = replacePit(initial.mining, occupiedDefinition.id, {
      controller: "crimson",
      occupyingMineId: "runtime-crimson-mine",
    });
    mining = replacePit(mining, depletedDefinition.id, {
      remainingOre: 0,
      occupyingMineId: null,
    });
    mining = replacePit(mining, capturingDefinition.id, {
      controller: null,
      captureProgress: 1.5,
      capturingFaction: "verdant",
    });
    const battle: BattleState = {
      ...initial,
      mining,
      // Conflicting scene building data must not override authoritative pit state.
      buildings: [
        ...initial.buildings,
        createBattleBuilding({
          id: "stale-verdant-mine",
          kind: "gold-mine",
          faction: "verdant",
          coordinate: occupiedDefinition.coordinate,
          createdAt: 0,
        }),
      ],
    };
    const markup = renderMinimap(battle);

    const occupied = minimapMineTag(markup, occupiedDefinition.id);
    expect(occupied).toContain('data-faction="crimson"');
    expect(occupied).toContain('data-occupying-mine="runtime-crimson-mine"');
    expect(occupied).toContain('data-status="occupied"');
    const depleted = minimapMineTag(markup, depletedDefinition.id);
    expect(depleted).toContain('data-remaining-ore="0"');
    expect(depleted).toContain('data-status="depleted"');
    const capturing = minimapMineTag(markup, capturingDefinition.id);
    expect(capturing).toContain('data-faction="neutral"');
    expect(capturing).toContain('data-capturing-faction="verdant"');
    expect(capturing).toContain('data-capture-progress="1.5"');
    expect(capturing).toContain('data-status="capturing"');
  });

  it("falls back safely to static definitions for an older sandbox snapshot", () => {
    const definition = SANDBOX_LARGE_BATTLEFIELD_DEFINITION;
    const safePit = definition.minePits?.[0];
    const neutralPit = definition.minePits?.find((pit) => pit.initialController === null);
    if (!safePit || !neutralPit) throw new Error("Sandbox fixture requires safe and neutral pits.");
    const initial = createBattleState([], { modeId: "sandbox" });
    const battle: BattleState = {
      ...initial,
      mining: null,
      buildings: [
        ...initial.buildings,
        createBattleBuilding({
          id: "legacy-crimson-mine",
          kind: "gold-mine",
          faction: "crimson",
          coordinate: neutralPit.coordinate,
          createdAt: 0,
        }),
      ],
    };
    const markup = renderMinimap(battle);

    expect(markup.match(/data-minimap-mine=/g)).toHaveLength(8);
    const safe = minimapMineTag(markup, safePit.id);
    expect(safe).toContain('data-faction="verdant"');
    expect(safe).toContain(`data-remaining-ore="${safePit.capacity}"`);
    expect(safe).toContain('data-status="controlled"');
    const occupied = minimapMineTag(markup, neutralPit.id);
    expect(occupied).toContain('data-faction="crimson"');
    expect(occupied).toContain('data-occupying-mine="legacy-crimson-mine"');
    expect(occupied).toContain('data-status="occupied"');
  });

  it("does not render for the legacy battlefield", () => {
    const markup = renderToStaticMarkup(createElement(SandboxMinimap, {
      battle: createBattleState([]),
      battlefield: LEGACY_BATTLEFIELD_DEFINITION,
      cameraViewStore: createCameraViewStore(),
      onCameraTargetRequest: () => undefined,
    }));

    expect(markup).toBe("");
  });
});

function sandboxBattleWithDynamicMarkers(
  minePit: Readonly<{
    id: string;
    coordinate: Readonly<{ q: number; r: number }>;
  }>,
): BattleState {
  const map = SANDBOX_LARGE_BATTLEFIELD_DEFINITION.map;
  const units = [
    createBattleUnit({
      faction: "verdant",
      id: "verdant-a",
      position: axialToWorld(map.castleApproaches.verdant),
      role: "spearman",
      squadId: "verdant-squad",
    }),
    createBattleUnit({
      faction: "verdant",
      id: "verdant-b",
      position: axialToWorld({ q: -6, r: 14 }),
      role: "spearman",
      squadId: "verdant-squad",
    }),
    createBattleUnit({
      faction: "crimson",
      id: "crimson-a",
      position: axialToWorld(map.castleApproaches.crimson),
      role: "ranger",
      squadId: "crimson-squad",
    }),
  ];
  const battle = createBattleState(units, { modeId: "sandbox" });
  if (!battle.mining) throw new Error("Sandbox fixture requires mining state.");
  const mining = occupyMinePit(
    battle.mining,
    minePit.id,
    "verdant-pit-mine",
  );
  if (!mining.occupied) throw new Error("Sandbox fixture must occupy the first mine pit.");
  return {
    ...battle,
    mining: mining.state,
    buildings: [
      ...battle.buildings,
      createBattleBuilding({
        id: "verdant-pit-mine",
        kind: "gold-mine",
        faction: "verdant",
        coordinate: minePit.coordinate,
        createdAt: 0,
      }),
      createBattleBuilding({
        id: "verdant-barracks",
        kind: "barracks",
        faction: "verdant",
        coordinate: { q: -10, r: 12 },
        createdAt: 0,
      }),
    ],
  };
}

function replacePit(
  mining: SandboxMiningState,
  pitId: string,
  patch: Partial<MinePitState>,
): SandboxMiningState {
  const pit = mining.pitsById[pitId];
  if (!pit) throw new Error(`Missing sandbox pit: ${pitId}`);
  return replaceMinePitState(mining, { ...pit, ...patch });
}

function renderMinimap(battle: BattleState): string {
  return renderToStaticMarkup(createElement(SandboxMinimap, {
    battle,
    battlefield: SANDBOX_LARGE_BATTLEFIELD_DEFINITION,
    cameraViewStore: createCameraViewStore(),
    onCameraTargetRequest: () => undefined,
  }));
}

function minimapMineTag(markup: string, pitId: string): string {
  const tag = markup.match(new RegExp(`<circle[^>]*data-minimap-mine="${pitId}"[^>]*>`))?.[0];
  if (!tag) throw new Error(`Missing minimap marker for pit ${pitId}.`);
  return tag;
}
