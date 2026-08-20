import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  createBattleState,
  createBattleUnit,
  type BattleState,
} from "../../src/game/battle";
import { createBattleBuilding } from "../../src/game/buildings";
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
    const battle = sandboxBattleWithDynamicMarkers(firstMine.coordinate);
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
    expect(markup).toContain(`data-minimap-mine="${firstMine.id}"`);
    expect(markup).toMatch(new RegExp(
      `data-faction="verdant" data-minimap-mine="${firstMine.id}" data-status="occupied"`,
    ));
    expect(markup).toContain('data-minimap-viewport="true"');
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
  mineCoordinate: Readonly<{ q: number; r: number }>,
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
  return {
    ...battle,
    buildings: [
      ...battle.buildings,
      createBattleBuilding({
        id: "verdant-pit-mine",
        kind: "gold-mine",
        faction: "verdant",
        coordinate: mineCoordinate,
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
