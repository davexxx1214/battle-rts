import { useFrame, useLoader } from "@react-three/fiber";
import {
  Box3,
  BufferGeometry,
  Color,
  InstancedMesh,
  MathUtils,
  Mesh,
  Object3D,
} from "three";
import type { Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";

import {
  BATTLEFIELD_DECORATIONS,
  BATTLEFIELD_MAP,
  BATTLEFIELD_STATIC_STRUCTURES,
  BATTLEFIELD_STRUCTURES,
  axialToWorld,
  terrainHeightAt,
  type BattlefieldCell,
  type BattlefieldDecoration,
  type BattlefieldStructure,
} from "../../map/battlefield";
import {
  BATTLEFIELD_SCENERY,
  BATTLEFIELD_SCENERY_KINDS,
  type BattlefieldSceneryKind,
} from "../../map/battlefieldScenery";
import {
  SCENERY_SCENE_ASSETS,
  STRUCTURE_SCENE_ASSETS,
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

const EMPTY_HIDDEN_NODES: readonly string[] = [];

export function BattlefieldTerrain() {
  return (
    <>
      <HexArena />
      <BattlefieldProps />
      <Suspense fallback={null}>
        <BattlefieldSceneryLayer />
      </Suspense>
    </>
  );
}

function HexArena() {
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
  const tilePlan = useMemo<readonly TerrainTilePresentation[]>(() => [
    ...createTerrainTilePlan(BATTLEFIELD_MAP),
    ...createOuterWaterRing(BATTLEFIELD_MAP.radius + 1).map((cell) => ({
      cell,
      assetKey: "water" as const,
      renderHeight: cell.height,
      rotationY: 0,
      tint: "#caeff8",
      connections: [],
    })),
  ], []);
  const tilesByAsset = useMemo(() => new Map(
    TERRAIN_TILE_ASSET_KEYS.map((key) => [
      key,
      tilePlan.filter(({ assetKey }) => assetKey === key),
    ]),
  ), [tilePlan]);
  return (
    <group position={[0, -0.03, 0]}>
      {TERRAIN_TILE_ASSET_KEYS.map((key) => {
        const tiles = tilesByAsset.get(key) ?? [];
        return tiles.length > 0 && (
          <TileInstances key={key} template={templates.get(key)!} tiles={tiles} />
        );
      })}
      <mesh receiveShadow position={[0, -0.95, 0]}>
        <cylinderGeometry args={[22, 23.5, 1.5, 54]} />
        <meshStandardMaterial color="#4b8fa4" roughness={0.62} metalness={0.04} />
      </mesh>
    </group>
  );
}

function BattlefieldSceneryLayer() {
  return (
    <group>
      {BATTLEFIELD_SCENERY_KINDS.map((kind) => (
        sceneryAssetUsesFullScene(kind)
          ? <DetailedSceneryAssets kind={kind} key={kind} />
          : <SceneryInstances kind={kind} key={kind} />
      ))}
    </group>
  );
}

function sceneryAssetUsesFullScene(kind: BattlefieldSceneryKind): boolean {
  const asset: ScenerySceneAsset = SCENERY_SCENE_ASSETS[kind];
  return asset.renderMode === "full-scene";
}

function DetailedSceneryAssets({ kind }: { readonly kind: BattlefieldSceneryKind }) {
  const asset = SCENERY_SCENE_ASSETS[kind];
  const items = BATTLEFIELD_SCENERY.filter((item) => item.kind === kind);
  return items.map((item) => {
    const world = axialToWorld(item.coordinate);
    return (
      <StaticAsset
        key={item.id}
        url={asset.url}
        position={[
          world.x + item.offset.x,
          terrainHeightAt(world) + 0.02,
          world.z + item.offset.z,
        ]}
        scale={asset.scale * item.scale}
        rotationY={item.rotationY}
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
}: {
  readonly template: TileTemplate;
  readonly tiles: readonly TerrainTilePresentation[];
}) {
  const instances = useRef<InstancedMesh>(null);
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
      args={[template.geometry, template.material, tiles.length]}
      receiveShadow
      frustumCulled={false}
    />
  );
}

function BattlefieldProps() {
  const structuresById = new Map(
    BATTLEFIELD_STRUCTURES.map((structure) => [structure.id, structure] as const),
  );
  return (
    <group>
      {BATTLEFIELD_STATIC_STRUCTURES.map((structure) => {
        const world = axialToWorld(structure.coordinate);
        const asset = sceneAssetForStructure(structure);
        return (
          <StaticAsset
            key={structure.id}
            url={asset.url}
            position={[world.x, terrainHeightAt(world) + 0.02, world.z]}
            scale={asset.scale}
            rotationY={structure.rotationY}
            hiddenNodes={"hiddenNodes" in asset ? asset.hiddenNodes : undefined}
          />
        );
      })}
      {BATTLEFIELD_DECORATIONS.map((decoration) => (
        <BattlefieldDecorationAsset
          key={decoration.id}
          decoration={decoration}
          structuresById={structuresById}
        />
      ))}
    </group>
  );
}

function SceneryInstances({ kind }: { readonly kind: BattlefieldSceneryKind }) {
  const asset = SCENERY_SCENE_ASSETS[kind];
  const gltf = useLoader(GLTFLoader, asset.url);
  const template = useMemo(() => extractGroundedMeshTemplate(gltf.scene), [gltf.scene]);
  const items = useMemo(
    () => BATTLEFIELD_SCENERY.filter((item) => item.kind === kind),
    [kind],
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
        terrainHeightAt(center) + 0.02,
        center.z + item.offset.z,
      );
      transform.rotation.set(0, item.rotationY, 0);
      transform.scale.setScalar(scale);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [asset.scale, items]);
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

function BattlefieldDecorationAsset({
  decoration,
  structuresById,
}: {
  readonly decoration: BattlefieldDecoration;
  readonly structuresById: ReadonlyMap<string, BattlefieldStructure>;
}) {
  const world = axialToWorld(decoration.coordinate);
  const asset = STRUCTURE_SCENE_ASSETS.neutral[decoration.kind];
  if (decoration.kind === "ore-pile") {
    return (
      <StaticAsset
        url={asset.url}
        position={[world.x, terrainHeightAt(world) + 0.02, world.z]}
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
      start={[world.x, terrainHeightAt(world) + 0.02, world.z]}
      destination={[
        MathUtils.lerp(world.x, mineWorld.x, 0.55),
        terrainHeightAt(mineWorld) + 0.02,
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
}: {
  readonly url: string;
  readonly position: readonly [number, number, number];
  readonly scale: number | readonly [x: number, y: number, z: number];
  readonly rotationY?: number;
  readonly hiddenNodes?: readonly string[];
}) {
  const gltf = useLoader(GLTFLoader, url);
  const model = useMemo(
    () => prepareAssetModel(gltf.scene, scale, rotationY, hiddenNodes),
    [gltf.scene, hiddenNodes, rotationY, scale],
  );
  return <primitive object={model} position={position} />;
}

function prepareAssetModel(
  source: Object3D,
  scale: number | readonly [x: number, y: number, z: number],
  rotationY = 0,
  hiddenNodes: readonly string[] = [],
): Object3D {
  const clone = source.clone(true);
  if (typeof scale === "number") clone.scale.setScalar(scale);
  else clone.scale.set(...scale);
  clone.rotation.y = rotationY;
  clone.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(clone);
  if (Number.isFinite(bounds.min.y)) clone.position.y -= bounds.min.y;
  clone.traverse((object) => {
    if (hiddenNodes.includes(object.name)) object.visible = false;
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return clone;
}

function sceneAssetForStructure(structure: BattlefieldStructure) {
  if (
    structure.kind === "wall-straight"
    || structure.kind === "wall-corner"
    || structure.kind === "wall-gate"
  ) {
    return STRUCTURE_SCENE_ASSETS.neutral[structure.kind];
  }
  return STRUCTURE_SCENE_ASSETS[structure.faction][structure.kind];
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

function createOuterWaterRing(radius: number): BattlefieldCell[] {
  const cells: BattlefieldCell[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) {
      const distance = (Math.abs(q) + Math.abs(r) + Math.abs(-q - r)) / 2;
      if (distance === radius) {
        cells.push({
          q,
          r,
          height: -0.34,
          surface: "water",
          walkable: false,
          territory: null,
          buildable: false,
          reservedForPath: false,
        });
      }
    }
  }
  return cells;
}
