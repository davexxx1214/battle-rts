import { useFrame, useLoader } from "@react-three/fiber";
import {
  Box3,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import type { Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { legacyUndeadOpponentRaces } from "../../game/factions";
import type { BattleRace, Faction, FactionRaces } from "../../game/types";

import {
  axialToWorld,
  terrainHeightAtMap,
  type BattlefieldDecoration,
  type BattlefieldStructure,
} from "../../map/battlefield";
import type { BattlefieldCloud } from "../../map/battlefieldAtmosphere";
import {
  BATTLEFIELD_SCENERY_KINDS,
  type BattlefieldScenery,
  type BattlefieldSceneryKind,
} from "../../map/battlefieldScenery";
import {
  BATTLEFIELD_CASTLE_ROCK_COORDINATES,
  BATTLEFIELD_CRIMSON_FOREST_REFERENCE_COORDINATE,
} from "../../map/battlefieldLayout";
import {
  coordinateBelongsToFactionModule,
  fromCrimsonModuleCoordinate,
  fromCrimsonModuleOffset,
  fromCrimsonModuleRotation,
  mapModuleForFaction,
  toCrimsonModuleCoordinate,
} from "../../map/factionMapModules";
import {
  BATTLEFIELD_CLOUD_SCENE_ASSETS,
  SCENERY_SCENE_ASSETS,
  STRUCTURE_SCENE_ASSETS,
  UNDEAD_ENVIRONMENT_SCENE_ASSETS,
  UNDEAD_FORTIFICATION_SCENE_ASSETS,
  scenerySceneAssetFor,
  structureSceneAssetFor,
  type ScenerySceneAsset,
} from "../assets";
import { miningCartPose } from "./miningCartMotion";
import {
  TERRAIN_TILE_ASSETS,
  TERRAIN_TILE_ASSET_KEYS,
  createTerrainTilePlan,
  type TerrainTileAssetKey,
  type TerrainTilePresentation,
} from "./tilePresentation";
import { useBattlefieldDefinition } from "../battlefieldSceneContext";
import { createBattlefieldBoundaryPresentation } from "./battlefieldBoundaryPresentation";

const EMPTY_HIDDEN_NODES: readonly string[] = [];
const EMPTY_NODE_ROTATIONS: Readonly<Record<string, number>> = {};

export const UNDEAD_HALF_OPEN_GATE_NODE_ROTATIONS = {
  arch_gate_left: Math.PI * 0.34,
  arch_gate_right: -Math.PI * 0.34,
} as const satisfies Readonly<Record<string, number>>;

export function undeadFortificationRotation(
  kind: "wall-straight" | "wall-corner" | "wall-gate" | (string & {}),
): number {
  if (kind === "wall-straight") return Math.PI / 2;
  return 0;
}

export function undeadStructureRotation(
  kind: string,
  fallbackRotationY: number,
): number {
  if (kind.startsWith("wall-")) return undeadFortificationRotation(kind);
  if (kind === "blacksmith") return Math.PI / 6;
  return fallbackRotationY;
}

export function BattlefieldTerrain({
  factionRaces,
  undeadOpponent = false,
}: {
  readonly factionRaces?: FactionRaces;
  readonly undeadOpponent?: boolean;
}) {
  const resolvedFactionRaces = factionRaces ?? legacyUndeadOpponentRaces(undeadOpponent);
  return (
    <>
      <HexArena factionRaces={resolvedFactionRaces} />
      <BattlefieldProps factionRaces={resolvedFactionRaces} />
      <Suspense fallback={null}>
        <BattlefieldSceneryLayer factionRaces={resolvedFactionRaces} />
        <BattlefieldCloudLayer />
        {(["verdant", "crimson"] as const).map((faction) => (
          resolvedFactionRaces[faction] === "undead"
            ? <UndeadBattlefieldDressing faction={faction} key={faction} />
            : null
        ))}
      </Suspense>
    </>
  );
}

function BattlefieldCloudLayer() {
  const { clouds } = useBattlefieldDefinition();
  return (
    <group>
      {clouds.map((cloud) => (
        <BattlefieldCloudAsset cloud={cloud} key={cloud.id} />
      ))}
    </group>
  );
}

function BattlefieldCloudAsset({ cloud }: { readonly cloud: BattlefieldCloud }) {
  const asset = BATTLEFIELD_CLOUD_SCENE_ASSETS[cloud.kind];
  const gltf = useLoader(GLTFLoader, asset.url);
  const model = useMemo(
    () => prepareAtmosphereModel(
      gltf.scene,
      asset.scale * cloud.scale,
      cloud.rotationY,
      cloud.opacity,
    ),
    [asset.scale, cloud.opacity, cloud.rotationY, cloud.scale, gltf.scene],
  );
  return <primitive object={model} position={cloud.position} />;
}

function HexArena({ factionRaces }: { readonly factionRaces: FactionRaces }) {
  const { map, worldBounds } = useBattlefieldDefinition();
  const tileGltfs = useLoader(
    GLTFLoader,
    TERRAIN_TILE_ASSET_KEYS.map((key) => TERRAIN_TILE_ASSETS[key].url),
  );
  const templates = useMemo(() => new Map<TerrainTileAssetKey, TileTemplate>(
    TERRAIN_TILE_ASSET_KEYS.map((key, index) => [
      key,
      extractMeshTemplate(tileGltfs[index]!.scene),
    ]),
  ), [tileGltfs]);
  const boundary = useMemo(
    () => createBattlefieldBoundaryPresentation(map, worldBounds),
    [map, worldBounds],
  );
  const tilePlan = useMemo<readonly TerrainTilePresentation[]>(() => [
    ...createTerrainTilePlan(map),
    ...boundary.waterCells.map((cell) => ({
      cell,
      assetKey: "water" as const,
      renderHeight: cell.height,
      rotationY: 0,
      tint: "#caeff8",
      connections: [],
    })),
  ], [boundary.waterCells, map]);
  const undeadFactions = useMemo(() => (
    (["verdant", "crimson"] as const).filter((faction) => (
      mapModuleForFaction(factionRaces, faction).race === "undead"
    ))
  ), [factionRaces]);
  const tilesByAsset = useMemo(() => new Map(
    TERRAIN_TILE_ASSET_KEYS.map((key) => [
      key,
      tilePlan.filter((tile) => (
        tile.assetKey === key
        && !undeadFactions.some((faction) => undeadTerritoryTile(tile, faction))
      )),
    ]),
  ), [tilePlan, undeadFactions]);
  return (
    <group position={[0, -0.03, 0]}>
      {TERRAIN_TILE_ASSET_KEYS.map((key) => {
        const tiles = tilesByAsset.get(key) ?? [];
        return tiles.length > 0 && (
          <TileInstances key={key} template={templates.get(key)!} tiles={tiles} />
          );
        })}
      {undeadFactions.flatMap((faction) => TERRAIN_TILE_ASSET_KEYS.flatMap((key) => {
        const groundTiles = tilePlan
          .filter((tile) => tile.assetKey === key && undeadPlainGroundTile(tile, faction))
          .map((tile) => applyUndeadTerrainTintForFaction(tile, faction));
        const roadTiles = tilePlan
          .filter((tile) => tile.assetKey === key && undeadRoadTile(tile, faction))
          .map((tile) => applyUndeadTerrainTintForFaction(tile, faction));
        return [
          groundTiles.length > 0 ? (
            <TileInstances
              key={`${faction}-undead-ground-${key}`}
              template={templates.get(key)!}
              tiles={groundTiles}
              untextured
            />
          ) : null,
          roadTiles.length > 0 ? (
            <TileInstances
              key={`${faction}-undead-road-${key}`}
              template={templates.get(key)!}
              tiles={roadTiles}
              untextured
            />
          ) : null,
        ];
      }))}
      <mesh receiveShadow position={[
        boundary.underlay.center.x,
        boundary.underlay.y,
        boundary.underlay.center.z,
      ]}>
        <cylinderGeometry args={[
          boundary.underlay.topRadius,
          boundary.underlay.bottomRadius,
          boundary.underlay.height,
          54,
        ]} />
        <meshStandardMaterial color="#4b8fa4" roughness={0.62} metalness={0.04} />
      </mesh>
    </group>
  );
}

export function applyUndeadTerrainTint(
  tile: TerrainTilePresentation,
): TerrainTilePresentation {
  return applyUndeadTerrainTintForFaction(tile, "crimson");
}

export const UNDEAD_CASTLE_HIGHLAND_TINT = "#4d5159";
export const UNDEAD_TERRAIN_MATERIAL_COLOR = "#a8adb6";
export const UNDEAD_TERRAIN_EMISSIVE_COLOR = "#383c44";
export const UNDEAD_TERRAIN_EMISSIVE_INTENSITY = 0.75;

export function createUndeadTerrainMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: UNDEAD_TERRAIN_MATERIAL_COLOR,
    emissive: UNDEAD_TERRAIN_EMISSIVE_COLOR,
    emissiveIntensity: UNDEAD_TERRAIN_EMISSIVE_INTENSITY,
    flatShading: true,
    metalness: 0,
    roughness: 0.94,
    vertexColors: true,
  });
}

export function applyUndeadTerrainTintForFaction(
  tile: TerrainTilePresentation,
  faction: Faction,
): TerrainTilePresentation {
  if (!coordinateBelongsToFactionModule(tile.cell, faction) || tile.cell.surface === "water") {
    return tile;
  }
  if (tile.cell.surface === "camp") {
    return { ...tile, tint: UNDEAD_CASTLE_HIGHLAND_TINT };
  }
  const reference = toCrimsonModuleCoordinate(tile.cell, faction);
  const depth = MathUtils.clamp((-reference.r - 2) / 7, 0, 1);
  const gradient = tile.assetKey.startsWith("road-")
    ? { front: "#d4d6da", rear: "#8c9097" }
    : tile.cell.surface === "forest"
        ? { front: "#a4a7ad", rear: "#50555d" }
        : tile.cell.surface === "rock"
          ? { front: "#b0b3b8", rear: "#646870" }
          : { front: "#b9bbc0", rear: "#62666d" };
  const tint = `#${new Color(gradient.front)
    .lerp(new Color(gradient.rear), depth)
    .getHexString()}`;
  return { ...tile, tint };
}

function BattlefieldSceneryLayer({
  factionRaces,
}: {
  readonly factionRaces: FactionRaces;
}) {
  return (
    <group>
      {BATTLEFIELD_SCENERY_KINDS.map((kind) => (
        sceneryAssetUsesFullScene(kind)
          ? <DetailedSceneryAssets
              kind={kind}
              key={kind}
              factionRaces={factionRaces}
            />
            : <SceneryInstances
                kind={kind}
                key={kind}
                factionRaces={factionRaces}
              />
      ))}
    </group>
  );
}

function sceneryAssetUsesFullScene(kind: BattlefieldSceneryKind): boolean {
  const asset: ScenerySceneAsset = SCENERY_SCENE_ASSETS[kind];
  return asset.renderMode === "full-scene";
}

function DetailedSceneryAssets({
  kind,
  factionRaces,
}: {
  readonly kind: BattlefieldSceneryKind;
  readonly factionRaces: FactionRaces;
}) {
  const { map, scenery } = useBattlefieldDefinition();
  const items = scenery.filter((item) => (
    item.kind === kind
    && sceneryVisibleForMode(item, factionRaces)
  ));
  return items.map((item) => {
    const asset = scenerySceneAssetFor(kind, item.faction);
    const world = axialToWorld(item.coordinate);
    return (
      <StaticAsset
        key={item.id}
        url={asset.url}
        position={[
          world.x + item.offset.x,
          terrainHeightAtMap(map, world) + 0.02,
          world.z + item.offset.z,
        ]}
        scale={asset.scale * item.scale}
        rotationY={item.rotationY}
        undeadTreatment={item.faction !== undefined && factionRaces[item.faction] === "undead"}
      />
    );
  });
}

interface TileTemplate {
  readonly geometry: BufferGeometry;
  readonly material: Material;
}

function TileInstances({
  template,
  tiles,
  untextured = false,
}: {
  readonly template: TileTemplate;
  readonly tiles: readonly TerrainTilePresentation[];
  readonly untextured?: boolean;
}) {
  const instances = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
    if (!untextured) return template.geometry;
    const next = template.geometry.clone();
    const positions = next.getAttribute("position");
    next.setAttribute(
      "color",
      new Float32BufferAttribute(new Float32Array(positions.count * 3).fill(1), 3),
    );
    return next;
  }, [template.geometry, untextured]);
  const material = useMemo(() => {
    if (!untextured) return template.material;
    return createUndeadTerrainMaterial();
  }, [template.material, untextured]);
  useLayoutEffect(() => {
    const mesh = instances.current;
    if (!mesh) return;
    const transform = new Object3D();
    const color = new Color();
    tiles.forEach(({ cell, renderHeight, rotationY, tint }, index) => {
      const world = axialToWorld(cell);
      transform.position.set(world.x, renderHeight, world.z);
      transform.rotation.set(0, rotationY, 0);
      transform.scale.setScalar(1);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      const variation = ((cell.q * 17 + cell.r * 31) & 3) * 0.022;
      color.set(tint).offsetHSL(0, 0, variation);
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [tiles]);
  return (
    <instancedMesh
      ref={instances}
      args={[geometry, material, tiles.length]}
      receiveShadow
      frustumCulled={false}
    />
  );
}

function undeadTerritoryTile(tile: TerrainTilePresentation, faction: Faction): boolean {
  return coordinateBelongsToFactionModule(tile.cell, faction)
    && tile.cell.surface !== "water";
}

function undeadPlainGroundTile(tile: TerrainTilePresentation, faction: Faction): boolean {
  return undeadTerritoryTile(tile, faction) && !tile.assetKey.startsWith("road-");
}

function undeadRoadTile(tile: TerrainTilePresentation, faction: Faction): boolean {
  return undeadTerritoryTile(tile, faction) && tile.assetKey.startsWith("road-");
}

function BattlefieldProps({ factionRaces }: { readonly factionRaces: FactionRaces }) {
  const {
    decorations,
    map,
    staticStructures,
    structures,
  } = useBattlefieldDefinition();
  const structuresById = new Map(
    structures.map((structure) => [structure.id, structure] as const),
  );
  return (
    <group>
      {staticStructures.map((structure) => {
        const race = factionRaces[structure.faction];
        const world = axialToWorld(structure.coordinate);
        const asset = sceneAssetForStructure(structure, race);
        const dedicatedUndeadAsset = asset.url.startsWith(
          "/assets/generated/tripo/runtime/undead-",
        )
          || asset.url.startsWith("/assets/kaykit/halloween/")
          || asset.url.startsWith("/assets/threejsassets/dungeon/");
        return (
          <StaticAsset
            key={structure.id}
            url={asset.url}
            position={[world.x, terrainHeightAtMap(map, world) + 0.02, world.z]}
            scale={asset.scale}
            rotationY={race === "undead"
              ? fromCrimsonModuleRotation(
                  undeadStructureRotation(structure.kind, structure.rotationY),
                  structure.faction,
                )
              : structure.rotationY}
            hiddenNodes={"hiddenNodes" in asset ? asset.hiddenNodes : undefined}
            undeadTreatment={race === "undead" && !dedicatedUndeadAsset}
          />
        );
      })}
      {decorations.map((decoration) => (
        <BattlefieldDecorationAsset
          key={decoration.id}
          decoration={decoration}
          structuresById={structuresById}
        />
      ))}
    </group>
  );
}

export function cemeteryFacingRotation(
  coordinate: { readonly q: number; readonly r: number },
): number {
  const world = axialToWorld(coordinate);
  return Math.atan2(-world.x, -world.z);
}

type UndeadHalloweenAsset = keyof typeof UNDEAD_ENVIRONMENT_SCENE_ASSETS;

export interface UndeadCemeteryDressingItem {
  readonly id: string;
  readonly asset: UndeadHalloweenAsset;
  readonly coordinate: { readonly q: number; readonly r: number };
  readonly offset: readonly [x: number, z: number];
  readonly scale: number;
  readonly rotationY: number;
}

function cemeteryItem(
  id: string,
  asset: UndeadHalloweenAsset,
  q: number,
  r: number,
  offset: readonly [x: number, z: number],
  scale: number,
  rotationY = cemeteryFacingRotation({ q, r }),
): UndeadCemeteryDressingItem {
  return { id, asset, coordinate: { q, r }, offset, scale, rotationY };
}

const CEMETERY_MIRROR_TURN = Math.PI;
export const CEMETERY_GATE_COORDINATE = { q: -2, r: -4 } as const;
export const CEMETERY_GATE_ROTATION = Math.PI / 3;
export const CEMETERY_ROAD_GATE_COORDINATE = { q: 0, r: -6 } as const;

function rotateYawOffset(
  x: number,
  z: number,
  rotationY: number,
): readonly [number, number] {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return [x * cos + z * sin, -x * sin + z * cos];
}

export const UNDEAD_CEMETERY_DRESSING: readonly UndeadCemeteryDressingItem[] = [
  cemeteryItem("cemetery-crypt-lantern", "postLantern", 0, -7, [0.62, -0.42], 1.05, CEMETERY_MIRROR_TURN),
  cemeteryItem("cemetery-crypt-bench", "benchDecorated", 0, -7, [-0.58, 0.48], 0.72, CEMETERY_MIRROR_TURN + 0.4),
  cemeteryItem("cemetery-hearse", "coffinDecorated", 1, -7, [-0.04, 0.02], 0.48, CEMETERY_MIRROR_TURN + Math.PI / 3),
  cemeteryItem("cemetery-hearse-lantern", "lanternStanding", 1, -7, [0.48, -0.4], 0.92, CEMETERY_MIRROR_TURN),
  cemeteryItem("cemetery-open-plot", "gravePit", -1, -6, [0, 0], 0.42, CEMETERY_MIRROR_TURN + Math.PI / 3),
  cemeteryItem("cemetery-open-coffin", "coffinDecorated", -1, -6, [0.22, -0.18], 0.4, CEMETERY_MIRROR_TURN + 0.2),
  cemeteryItem("cemetery-open-ribs", "ribcage", -1, -6, [-0.38, 0.28], 0.86, 0.7),
  cemeteryItem("cemetery-yew", "treeDeadLargeDecorated", -2, -5, [0.04, -0.08], 0.96, CEMETERY_MIRROR_TURN + Math.PI / 6),
  cemeteryItem("cemetery-yew-marker", "graveMarkerA", -2, -5, [-0.46, 0.38], 0.92),
  cemeteryItem("cemetery-chapel-shrine", "shrineCandles", -3, -4, [0.06, 0.02], 1.12, CEMETERY_MIRROR_TURN + Math.PI / 3),
  cemeteryItem("cemetery-chapel-skull", "postSkull", -3, -4, [-0.52, 0.4], 1, CEMETERY_MIRROR_TURN),
  cemeteryItem("cemetery-waterside-shrine", "shrine", -3, -2, [0, 0.22], 1.18, CEMETERY_MIRROR_TURN),
  cemeteryItem("cemetery-waterfront-pine", "treePineOrangeLarge", -4, -2, [-0.04, 0.08], 1.04, CEMETERY_MIRROR_TURN + Math.PI / 6),
  cemeteryItem("cemetery-plot-1-8-pad", "floorDirtSmall", 1, -8, [0, 0], 0.92),
  cemeteryItem("cemetery-plot-1-8", "graveStone", 1, -8, [0.06, 0.04], 0.7),
  cemeteryItem("cemetery-plot-1-8-marker", "graveMarkerB", 1, -8, [0.38, -0.32], 0.84),
  cemeteryItem("cemetery-plot-1-9-pad", "floorDirtSmall", 1, -9, [0, 0], 0.9),
  cemeteryItem("cemetery-plot-1-9", "graveMarkerA", 1, -9, [0.08, 0.04], 0.92),
  cemeteryItem("cemetery-plot-1-9-pine", "treePineYellowSmall", 1, -9, [-0.46, -0.32], 0.92, 0.5),
  cemeteryItem("cemetery-plot-0-8-pad", "floorDirtSmall", 0, -8, [0, 0], 0.92),
  cemeteryItem("cemetery-plot-0-8", "graveStone", 0, -8, [0.08, 0], 0.68),
  cemeteryItem("cemetery-plot-0-8-marker", "graveMarkerA", 0, -8, [-0.4, 0.36], 0.86),
  cemeteryItem("cemetery-plot-minus1-7-pad", "floorDirtSmall", -1, -7, [0, 0], 0.9),
  cemeteryItem("cemetery-plot-minus1-7", "graveA", -1, -7, [0, 0.02], 0.46),
  cemeteryItem("cemetery-plot-minus1-7-bone", "boneA", -1, -7, [0.4, 0.3], 0.95, 1.1),
  cemeteryItem(
    "cemetery-plot-minus2-6-open-grave",
    "gravePit",
    -2,
    -6,
    [0, 0],
    0.52,
    CEMETERY_MIRROR_TURN + Math.PI / 3,
  ),
  cemeteryItem("cemetery-plot-minus3-5-pad", "floorDirtSmall", -3, -5, [0, 0], 0.9),
  cemeteryItem("cemetery-plot-minus3-5", "graveStone", -3, -5, [0, 0], 0.66),
  cemeteryItem("cemetery-plot-minus3-5-marker", "graveMarkerB", -3, -5, [0.38, -0.4], 0.84),
  cemeteryItem("cemetery-plot-minus4-3-pad", "floorDirtSmall", -4, -3, [0, 0], 0.9),
  cemeteryItem("cemetery-plot-minus4-3", "graveMarkerA", -4, -3, [0.1, 0.04], 0.9),
  cemeteryItem("cemetery-plot-minus4-3-pine", "treePineYellowMedium", -4, -3, [-0.42, 0.3], 0.9, 0.8),
  cemeteryItem("cemetery-plot-minus4-4-pad", "floorDirtSmall", -4, -4, [0, 0], 0.9),
  cemeteryItem("cemetery-plot-minus4-4", "graveADestroyed", -4, -4, [0, 0.02], 0.48),
  cemeteryItem("cemetery-plot-minus4-4-ribs", "ribcage", -4, -4, [0.36, 0.32], 0.84, -0.4),
  cemeteryItem("cemetery-plot-minus5-2", "graveMarkerB", -5, -2, [0.08, -0.06], 0.96),
  cemeteryItem("cemetery-plot-minus5-2-tree", "treeDeadSmall", -5, -2, [-0.4, 0.34], 0.94, 0.35),
  cemeteryItem("cemetery-plot-minus5-3", "floorDirtSmall", -5, -3, [0, 0], 1),
  cemeteryItem("cemetery-plot-minus5-3-marker", "graveMarkerA", -5, -3, [0.12, -0.08], 0.92),
  cemeteryItem("cemetery-plot-minus6-2-pad", "floorDirtSmall", -6, -2, [0, 0], 0.9),
  cemeteryItem("cemetery-plot-minus6-2", "graveMarkerB", -6, -2, [0.12, 0.04], 0.9),
  cemeteryItem("cemetery-plot-minus6-2-pine", "treePineOrangeMedium", -6, -2, [-0.38, -0.28], 0.94, 1.1),
  cemeteryItem(
    "cemetery-gate-arch",
    "arch",
    CEMETERY_GATE_COORDINATE.q,
    CEMETERY_GATE_COORDINATE.r,
    rotateYawOffset(0, 0.12, CEMETERY_GATE_ROTATION),
    1.02,
    CEMETERY_GATE_ROTATION,
  ),
  cemeteryItem(
    "cemetery-gate",
    "fenceGate",
    CEMETERY_GATE_COORDINATE.q,
    CEMETERY_GATE_COORDINATE.r,
    rotateYawOffset(0, 0.18, CEMETERY_GATE_ROTATION),
    0.78,
    CEMETERY_GATE_ROTATION,
  ),
  cemeteryItem(
    "cemetery-gate-pillar-left",
    "fencePillar",
    CEMETERY_GATE_COORDINATE.q,
    CEMETERY_GATE_COORDINATE.r,
    rotateYawOffset(-0.78, 0.18, CEMETERY_GATE_ROTATION),
    0.92,
    CEMETERY_GATE_ROTATION,
  ),
  cemeteryItem(
    "cemetery-gate-pillar-right",
    "fencePillar",
    CEMETERY_GATE_COORDINATE.q,
    CEMETERY_GATE_COORDINATE.r,
    rotateYawOffset(0.78, 0.18, CEMETERY_GATE_ROTATION),
    0.92,
    CEMETERY_GATE_ROTATION,
  ),
  cemeteryItem(
    "cemetery-road-gate",
    "fenceSeparateBroken",
    CEMETERY_ROAD_GATE_COORDINATE.q,
    CEMETERY_ROAD_GATE_COORDINATE.r,
    rotateYawOffset(0, 0.06, cemeteryFacingRotation(CEMETERY_ROAD_GATE_COORDINATE)),
    0.48,
    cemeteryFacingRotation(CEMETERY_ROAD_GATE_COORDINATE),
  ),
  cemeteryItem(
    "cemetery-road-gate-pillar-left",
    "fencePillar",
    CEMETERY_ROAD_GATE_COORDINATE.q,
    CEMETERY_ROAD_GATE_COORDINATE.r,
    rotateYawOffset(-0.78, 0.06, cemeteryFacingRotation(CEMETERY_ROAD_GATE_COORDINATE)),
    0.72,
    cemeteryFacingRotation(CEMETERY_ROAD_GATE_COORDINATE),
  ),
  cemeteryItem(
    "cemetery-road-gate-pillar-right",
    "fencePillar",
    CEMETERY_ROAD_GATE_COORDINATE.q,
    CEMETERY_ROAD_GATE_COORDINATE.r,
    rotateYawOffset(0.78, 0.06, cemeteryFacingRotation(CEMETERY_ROAD_GATE_COORDINATE)),
    0.72,
    cemeteryFacingRotation(CEMETERY_ROAD_GATE_COORDINATE),
  ),
  cemeteryItem("cemetery-edge-tree", "treeDeadMedium", -1, -5, [-0.16, 0.1], 0.94, 0.45),
  cemeteryItem("cemetery-edge-marker", "graveMarkerA", -1, -5, [0.4, -0.28], 0.88),
  cemeteryItem("cemetery-gap-tree", "treeDeadSmall", -3, -3, [-0.12, 0.08], 1, 0.2),
  cemeteryItem("cemetery-gap-bone", "boneB", -3, -3, [0.36, -0.3], 1, -0.6),
  cemeteryItem("cemetery-fence-west", "fenceSeparate", -6, -2, [0, 0.72], 1, 0),
  cemeteryItem("cemetery-fence-west-mid", "fenceSeparate", -5, -2, [0, 0.72], 1, 0),
  cemeteryItem("cemetery-fence-pine-edge", "fenceSeparate", -4, -2, [0, 0.72], 1, 0),
  cemeteryItem("cemetery-fence-shrine-edge", "fenceSeparate", -3, -2, [0, 0.72], 1, 0),
];

const RIVERBANK_PUMPKIN_SCALE = 0.25;

export const UNDEAD_RIVERBANK_DRESSING: readonly UndeadCemeteryDressingItem[] = [
  cemeteryItem(
    "undead-riverbank-pumpkin-main",
    "pumpkinYellowJack",
    3,
    -2,
    [0.02, 0.04],
    0.52 * RIVERBANK_PUMPKIN_SCALE,
    0.68,
  ),
  cemeteryItem(
    "undead-riverbank-pumpkin-orange",
    "pumpkinOrangeSmall",
    3,
    -2,
    [-0.48, 0.18],
    0.8 * RIVERBANK_PUMPKIN_SCALE,
    0.34,
  ),
  cemeteryItem(
    "undead-riverbank-pumpkin-small",
    "pumpkinYellowSmall",
    3,
    -2,
    [0.38, 0.3],
    0.7 * RIVERBANK_PUMPKIN_SCALE,
    -0.42,
  ),
];

export const UNDEAD_CASTLE_COURTYARD_DRESSING: readonly UndeadCemeteryDressingItem[] = [
  cemeteryItem("keep-pillar-front-west", "fencePillar", 2, -7, [-0.92, 0], 1.08, 0),
  cemeteryItem("keep-pillar-front-east", "fencePillar", 4, -7, [0.92, 0], 1.08, 0),
  cemeteryItem("keep-pillar-gate-west", "fencePillar", 3, -7, [-0.72, 0], 1.02, 0),
  cemeteryItem("keep-pillar-gate-east", "fencePillar", 3, -7, [0.72, 0], 1.02, 0),
  cemeteryItem("keep-pillar-rear-west", "fencePillar", 2, -8, [0.08, -0.92], 1.08, 0),
  cemeteryItem("keep-pillar-rear-east", "fencePillar", 5, -8, [-0.08, -0.92], 1.08, 0),
];

export const UNDEAD_CASTLE_EDGE_DRESSING: readonly UndeadCemeteryDressingItem[] = [
  cemeteryItem(
    "undead-castle-edge-orange-pine",
    "treePineOrangeLarge",
    BATTLEFIELD_CRIMSON_FOREST_REFERENCE_COORDINATE.q,
    BATTLEFIELD_CRIMSON_FOREST_REFERENCE_COORDINATE.r,
    [0, 0],
    1.04,
    CEMETERY_MIRROR_TURN + 0.18,
  ),
];

export const UNDEAD_CASTLE_TERRAIN_REPLACEMENTS: readonly UndeadCemeteryDressingItem[] =
  BATTLEFIELD_CASTLE_ROCK_COORDINATES
    .filter(({ r }) => r < 0)
    .map(({ q, r }) => cemeteryItem(
      `undead-castle-terrain-${q}-${r}`,
      "shrine",
      q,
      r,
      [0, 0.22],
      1.18,
      CEMETERY_MIRROR_TURN,
    ));

export const UNDEAD_MINE_DRESSING = [
  { id: "mine-crystal-front", asset: "cursedCrystal", coordinate: { q: 5, r: -4 }, offset: [0.22, -0.24] as const, scale: 0.42, rotationY: -0.24 },
  { id: "mine-crystal-middle", asset: "cursedCrystal", coordinate: { q: 6, r: -5 }, offset: [-0.34, 0.28] as const, scale: 0.36, rotationY: 0.48 },
  { id: "mine-crystal-rear", asset: "cursedCrystal", coordinate: { q: 7, r: -6 }, offset: [0.18, -0.18] as const, scale: 0.32, rotationY: -0.56 },
] as const satisfies readonly {
  readonly id: string;
  readonly asset: "cursedCrystal";
  readonly coordinate: { readonly q: number; readonly r: number };
  readonly offset: readonly [x: number, z: number];
  readonly scale: number;
  readonly rotationY: number;
}[];

export const UNDEAD_SHIPWRECK_DRESSING = {
  id: "undead-left-bay-shipwreck",
  asset: "shipwreck",
  coordinate: { q: -5, r: 0 },
  offset: [-0.12, 0.04] as const,
  scale: [3, 6.1, 2.5] as const,
  rotationY: 0.62,
  heightOffset: 2,
} as const satisfies {
  readonly id: string;
  readonly asset: keyof typeof UNDEAD_ENVIRONMENT_SCENE_ASSETS;
  readonly coordinate: { readonly q: number; readonly r: number };
  readonly offset: readonly [x: number, z: number];
  readonly scale: readonly [x: number, y: number, z: number];
  readonly rotationY: number;
  readonly heightOffset: number;
};

function UndeadBattlefieldDressing({ faction }: { readonly faction: Faction }) {
  const { map } = useBattlefieldDefinition();
  const wreck = UNDEAD_SHIPWRECK_DRESSING;
  const wreckCoordinate = fromCrimsonModuleCoordinate(wreck.coordinate, faction);
  const wreckOffset = fromCrimsonModuleOffset(wreck.offset, faction);
  const wreckWorld = axialToWorld(wreckCoordinate);
  const wreckAsset = UNDEAD_ENVIRONMENT_SCENE_ASSETS[wreck.asset];
  const modulePosition = (position: readonly [x: number, y: number, z: number]) => (
    faction === "crimson" ? position : [-position[0], position[1], -position[2]] as const
  );
  return (
    <group>
      {[
        ...UNDEAD_CEMETERY_DRESSING,
        ...UNDEAD_CASTLE_COURTYARD_DRESSING,
        ...UNDEAD_CASTLE_EDGE_DRESSING,
        ...UNDEAD_CASTLE_TERRAIN_REPLACEMENTS,
        ...UNDEAD_RIVERBANK_DRESSING,
        ...UNDEAD_MINE_DRESSING,
      ].map((item) => {
        const coordinate = fromCrimsonModuleCoordinate(item.coordinate, faction);
        const offset = fromCrimsonModuleOffset(item.offset, faction);
        const world = axialToWorld(coordinate);
        const asset = UNDEAD_ENVIRONMENT_SCENE_ASSETS[item.asset];
        const scale = asset.scale * item.scale;
        return (
          <StaticAsset
            key={`${faction}-${item.id}`}
            url={asset.url}
            position={[
              world.x + offset[0],
              terrainHeightAtMap(map, world) + 0.025,
              world.z + offset[1],
            ]}
            scale={scale}
            rotationY={fromCrimsonModuleRotation(item.rotationY, faction)}
          />
        );
      })}
      <StaticAsset
        key={`${faction}-${wreck.id}`}
        url={wreckAsset.url}
        position={[
          wreckWorld.x + wreckOffset[0],
          terrainHeightAtMap(map, wreckWorld) + wreck.heightOffset,
          wreckWorld.z + wreckOffset[1],
        ]}
        scale={wreck.scale}
        rotationY={fromCrimsonModuleRotation(wreck.rotationY, faction)}
      />
      <pointLight
        color="#8cff69"
        intensity={3.8}
        distance={5.5}
        decay={2}
        position={modulePosition([6, 2.4, -12.1])}
      />
      <pointLight
        color="#ad7ae0"
        intensity={3.6}
        distance={5.5}
        decay={2}
        position={modulePosition([-5, 2.5, -12.1])}
      />
      <pointLight
        color="#ad7ae0"
        intensity={2.4}
        distance={5}
        decay={2}
        position={modulePosition([-1, 3.2, -15.2])}
      />
    </group>
  );
}

function SceneryInstances({
  kind,
  factionRaces,
}: {
  readonly kind: BattlefieldSceneryKind;
  readonly factionRaces: FactionRaces;
}) {
  const { map, scenery } = useBattlefieldDefinition();
  const asset = SCENERY_SCENE_ASSETS[kind];
  const gltf = useLoader(GLTFLoader, asset.url);
  const template = useMemo(() => extractGroundedMeshTemplate(gltf.scene), [gltf.scene]);
  const items = useMemo(
    () => scenery.filter((item) => (
      item.kind === kind
      && sceneryVisibleForMode(item, factionRaces)
    )),
    [factionRaces, kind, scenery],
  );
  const instances = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = instances.current;
    if (!mesh) return;
    const transform = new Object3D();
    for (const [index, item] of items.entries()) {
      const center = axialToWorld(item.coordinate);
      const scale = asset.scale * item.scale;
      transform.position.set(
        center.x + item.offset.x,
        terrainHeightAtMap(map, center) + 0.02,
        center.z + item.offset.z,
      );
      transform.rotation.set(0, item.rotationY, 0);
      transform.scale.setScalar(scale);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [asset.scale, items, map]);
  return (
    <instancedMesh
      ref={instances}
      args={[template.geometry, template.material, items.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}

function undeadFoliageKind(kind: BattlefieldSceneryKind): boolean {
  return kind === "tree"
    || kind === "bush"
    || kind === "grove-a"
    || kind === "grove-b"
    || kind === "hill-grove";
}

function undeadHumanSceneryKind(kind: BattlefieldSceneryKind): boolean {
  return kind.startsWith("farm-")
    || kind.startsWith("village-")
    || kind === "tent"
    || kind === "wheelbarrow";
}

export function sceneryVisibleForMode(
  item: BattlefieldScenery,
  factionRacesOrLegacyUndeadOpponent: FactionRaces | boolean,
): boolean {
  const factionRaces = typeof factionRacesOrLegacyUndeadOpponent === "boolean"
    ? legacyUndeadOpponentRaces(factionRacesOrLegacyUndeadOpponent)
    : factionRacesOrLegacyUndeadOpponent;
  const undeadFaction = (["verdant", "crimson"] as const).find((faction) => (
    factionRaces[faction] === "undead"
    && (
      item.faction === faction
      || coordinateBelongsToFactionModule(item.coordinate, faction)
    )
  ));
  if (!undeadFaction) return true;
  const reference = toCrimsonModuleCoordinate(item.coordinate, undeadFaction);
  if (item.kind === "bay-ship" && item.faction === undeadFaction) return false;
  if (item.kind === "castle-rock") return false;
  if (undeadFoliageKind(item.kind)) return false;
  if (reference.r <= -2 && reference.q <= 1) return false;
  if (undeadHumanSceneryKind(item.kind)) return false;
  return true;
}

function BattlefieldDecorationAsset({
  decoration,
  structuresById,
}: {
  readonly decoration: BattlefieldDecoration;
  readonly structuresById: ReadonlyMap<string, BattlefieldStructure>;
}) {
  const { map } = useBattlefieldDefinition();
  const world = axialToWorld(decoration.coordinate);
  const asset = STRUCTURE_SCENE_ASSETS.neutral[decoration.kind];
  if (decoration.kind === "ore-pile") {
    return (
      <StaticAsset
        url={asset.url}
        position={[world.x, terrainHeightAtMap(map, world) + 0.02, world.z]}
        scale={asset.scale}
        rotationY={decoration.rotationY}
      />
    );
  }
  const mine = structuresById.get(decoration.targetStructureId);
  if (!mine || mine.kind !== "mine" || mine.faction !== decoration.faction) {
    throw new Error(`Mining cart ${decoration.id} must target a same-faction mine.`);
  }
  const mineWorld = axialToWorld(mine.coordinate);
  return (
    <MiningCart
      url={asset.url}
      start={[world.x, terrainHeightAtMap(map, world) + 0.02, world.z]}
      destination={[
        MathUtils.lerp(world.x, mineWorld.x, 0.55),
        terrainHeightAtMap(map, mineWorld) + 0.02,
        MathUtils.lerp(world.z, mineWorld.z, 0.55),
      ]}
      scale={asset.scale}
      phase={decoration.phase}
    />
  );
}

function MiningCart({
  url,
  start,
  destination,
  scale,
  phase,
}: {
  readonly url: string;
  readonly start: readonly [number, number, number];
  readonly destination: readonly [number, number, number];
  readonly scale: number;
  readonly phase: number;
}) {
  const gltf = useLoader(GLTFLoader, url);
  const root = useRef<Object3D>(null);
  const model = useMemo(
    () => prepareAssetModel(gltf.scene, scale),
    [gltf.scene, scale],
  );
  const initialPose = miningCartPose(0, phase, start, destination);
  useFrame(({ clock }) => {
    const cart = root.current;
    if (!cart) return;
    const pose = miningCartPose(clock.elapsedTime, phase, start, destination);
    cart.position.set(...pose.position);
    cart.rotation.y = pose.rotationY;
  });
  return (
    <group ref={root} position={initialPose.position} rotation={[0, initialPose.rotationY, 0]}>
      <primitive object={model} />
    </group>
  );
}

function StaticAsset({
  url,
  position,
  scale,
  rotationY = 0,
  hiddenNodes = EMPTY_HIDDEN_NODES,
  nodeRotations = EMPTY_NODE_ROTATIONS,
  undeadTreatment = false,
}: {
  readonly url: string;
  readonly position: readonly [number, number, number];
  readonly scale: number | readonly [x: number, y: number, z: number];
  readonly rotationY?: number;
  readonly hiddenNodes?: readonly string[];
  readonly nodeRotations?: Readonly<Record<string, number>>;
  readonly undeadTreatment?: boolean;
}) {
  const gltf = useLoader(GLTFLoader, url);
  const model = useMemo(
    () => prepareAssetModel(
      gltf.scene,
      scale,
      rotationY,
      hiddenNodes,
      undeadTreatment,
      nodeRotations,
    ),
    [gltf.scene, hiddenNodes, nodeRotations, rotationY, scale, undeadTreatment],
  );
  return <primitive object={model} position={position} />;
}

function prepareAssetModel(
  source: Object3D,
  scale: number | readonly [x: number, y: number, z: number],
  rotationY = 0,
  hiddenNodes: readonly string[] = [],
  undeadTreatment = false,
  nodeRotations: Readonly<Record<string, number>> = EMPTY_NODE_ROTATIONS,
): Object3D {
  const clone = source.clone(true);
  if (typeof scale === "number") clone.scale.setScalar(scale);
  else clone.scale.set(...scale);
  clone.rotation.y = rotationY;
  for (const [nodeName, nodeRotationY] of Object.entries(nodeRotations)) {
    const node = clone.getObjectByName(nodeName);
    if (node) node.rotation.y += nodeRotationY;
  }
  clone.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(clone);
  if (Number.isFinite(bounds.min.y)) clone.position.y -= bounds.min.y;
  clone.traverse((object) => {
    if (hiddenNodes.includes(object.name)) object.visible = false;
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      if (undeadTreatment) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        const treated = materials.map((material) => {
          const next = material.clone();
          if (next instanceof MeshStandardMaterial) {
            next.color.lerp(new Color("#3a2948"), 0.54);
            next.roughness = Math.max(next.roughness, 0.84);
          }
          return next;
        });
        object.material = Array.isArray(object.material) ? treated : treated[0]!;
      }
    }
  });
  return clone;
}

function prepareAtmosphereModel(
  source: Object3D,
  scale: number,
  rotationY: number,
  opacity: number,
): Object3D {
  const model = prepareAssetModel(source, scale, rotationY);
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : [object.material.clone()];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = opacity;
      material.depthWrite = false;
    }
    object.material = Array.isArray(object.material) ? materials : materials[0]!;
    object.castShadow = false;
    object.receiveShadow = false;
    object.raycast = () => undefined;
    object.renderOrder = 2;
  });
  return model;
}

function sceneAssetForStructure(
  structure: BattlefieldStructure,
  race: BattleRace,
) {
  if (
    structure.kind === "wall-straight"
    || structure.kind === "wall-corner"
    || structure.kind === "wall-gate"
  ) {
    if (race === "undead") {
      return UNDEAD_FORTIFICATION_SCENE_ASSETS[structure.kind];
    }
    return STRUCTURE_SCENE_ASSETS.neutral[structure.kind];
  }
  return structureSceneAssetFor(structure.faction, structure.kind, race);
}

function extractMeshTemplate(source: Object3D): TileTemplate {
  source.updateMatrixWorld(true);
  let first: Mesh | null = null;
  source.traverse((object) => {
    if (!first && object instanceof Mesh) first = object;
  });
  if (!first) throw new Error("Tile GLTF does not contain a mesh.");
  const tileMesh = first as Mesh;
  const geometry = tileMesh.geometry.clone();
  geometry.applyMatrix4(tileMesh.matrixWorld);
  const material = Array.isArray(tileMesh.material)
    ? tileMesh.material[0]?.clone()
    : tileMesh.material.clone();
  if (!material) throw new Error("Tile GLTF does not contain a material.");
  return { geometry, material };
}

function extractGroundedMeshTemplate(source: Object3D): TileTemplate {
  const template = extractMeshTemplate(source);
  template.geometry.computeBoundingBox();
  const minimumY = template.geometry.boundingBox?.min.y;
  if (minimumY !== undefined && Number.isFinite(minimumY)) {
    template.geometry.translate(0, -minimumY, 0);
  }
  return template;
}
