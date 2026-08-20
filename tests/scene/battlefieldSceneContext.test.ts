import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { terrainHeightAtMap } from "../../src/map/battlefield";
import {
  LEGACY_BATTLEFIELD_DEFINITION,
  type BattlefieldDefinition,
} from "../../src/map/battlefieldDefinition";
import {
  BattlefieldSceneProvider,
  useBattlefieldDefinition,
} from "../../src/scene/battlefieldSceneContext";

describe("battlefield scene context", () => {
  it("follows A to B to A renders without retaining the first map", () => {
    const raised = definitionWithCenterHeight("raised-test-map", 7.5);
    const legacy = LEGACY_BATTLEFIELD_DEFINITION;
    const legacyHeight = terrainHeightAtMap(legacy.map, { x: 0, z: 0 });

    expect(renderProbe(legacy)).toContain(`${legacy.id}:${legacyHeight}`);
    expect(renderProbe(raised)).toContain("raised-test-map:7.5");
    expect(renderProbe(legacy)).toContain(`${legacy.id}:${legacyHeight}`);
  });
});

function HeightProbe() {
  const definition = useBattlefieldDefinition();
  return `${definition.id}:${terrainHeightAtMap(definition.map, { x: 0, z: 0 })}`;
}

function renderProbe(definition: BattlefieldDefinition): string {
  return renderToString(createElement(
    BattlefieldSceneProvider,
    { definition, children: createElement(HeightProbe) },
  ));
}

function definitionWithCenterHeight(
  id: string,
  height: number,
): BattlefieldDefinition {
  const legacy = LEGACY_BATTLEFIELD_DEFINITION;
  return {
    ...legacy,
    id,
    map: {
      ...legacy.map,
      cells: legacy.map.cells.map((cell) => (
        cell.q === 0 && cell.r === 0 ? { ...cell, height } : cell
      )),
    },
  };
}
