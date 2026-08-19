import * as pc from "playcanvas";

import type {
  BattleState,
  BattleUnit,
  UnitRole,
  WorldPoint,
} from "../../../src/game/battle";
import type { BattleBuilding } from "../../../src/game/buildings";
import type { DeploymentPreview } from "../../../src/game/deployTransaction";
import type { Faction } from "../../../src/game/types";
import {
  BATTLEFIELD_MAP,
  BATTLEFIELD_STATIC_STRUCTURES,
  axialToWorld,
  terrainHeightAt,
} from "../../../src/map/battlefield";
import { BATTLEFIELD_SCENERY } from "../../../src/map/battlefieldScenery";
import { BATTLEFIELD_CLOUDS } from "../../../src/map/battlefieldAtmosphere";
import {
  BATTLEFIELD_CLOUD_SCENE_ASSETS,
  BATTLE_BUILDING_ASSET_KEYS,
  SCENE_MODEL_URLS,
  SCENERY_SCENE_ASSETS,
  STRUCTURE_SCENE_ASSETS,
  battleBuildingDetailAssets,
  scenerySceneAssetFor,
} from "../../../src/scene/assets";
import {
  TERRAIN_TILE_ASSETS,
  TERRAIN_TILE_ASSET_KEYS,
  createTerrainTilePlan,
} from "../../../src/scene/terrain/tilePresentation";
import {
  CHARACTER_ANIMATION_URLS,
  CATAPULT_OPERATOR_ANIMATION_URLS,
  CHARACTER_SCENE_ASSETS,
  characterAnimationForState,
  characterAnimationLoops,
  characterTintStrength,
  type CharacterRole,
} from "../../../src/scene/units/characterPresentation";
import {
  catapultMotionPose,
  operatorAnimationForStatus,
  wheelRotationForTravel,
} from "../../../src/scene/units/catapultAnimation";
import { BATTLE_FX_SEQUENCES } from "../../../src/scene/effects/effectPresentation";
import {
  PlayCanvasAssetLibrary,
  type AssetLoadProgress,
} from "./PlayCanvasAssetLibrary";

interface BattlefieldCallbacks {
  readonly onHoverWorld: (point: WorldPoint | null) => void;
  readonly onClickWorld: (point: WorldPoint) => void;
  readonly onAssetProgress?: (progress: AssetLoadProgress) => void;
}

interface UnitVisual {
  readonly root: pc.Entity;
  readonly body: pc.Entity;
  readonly healthFill: pc.Entity;
  readonly target: pc.Vec3;
  healthRatio: number;
  status: BattleUnit["status"];
  phase: number;
  model: pc.Entity | null;
  modelLoading: boolean;
  animationName: string | null;
  catapultArm: pc.Entity | null;
  readonly catapultWheels: pc.Entity[];
  previousPosition: pc.Vec3;
  operator: pc.Entity | null;
  attackStartedAt: number | null;
}

interface BuildingVisual {
  readonly root: pc.Entity;
  readonly healthFill: pc.Entity;
  healthRatio: number;
  model: pc.Entity | null;
  modelLoading: boolean;
}

interface EffectVisual {
  readonly root: pc.Entity;
  age: number;
  readonly lifetime: number;
  readonly frameMaterials?: readonly pc.StandardMaterial[];
}

const FACTION_COLORS = {
  verdant: {
    primary: "#4fa7ff",
    dark: "#173f68",
    pale: "#a8dbff",
  },
  crimson: {
    primary: "#df4c4f",
    dark: "#5d2024",
    pale: "#ffb0aa",
  },
} as const satisfies Readonly<Record<Faction, Record<string, string>>>;

const UNIT_SCALE: Readonly<Record<UnitRole, number>> = {
  knight: 0.92,
  spearman: 0.86,
  ranger: 0.82,
  mage: 0.88,
  catapult: 1.2,
};

const CAMERA_BOUNDS = 14;
const CAMERA_HEIGHT = 29;
const CAMERA_DISTANCE = 26;

export class PlayCanvasBattlefield {
  readonly app: pc.Application;

  private readonly camera: pc.Entity;
  private readonly worldRoot: pc.Entity;
  private readonly dynamicRoot: pc.Entity;
  private readonly fallbackTerrainRoot: pc.Entity;
  private readonly fallbackStaticRoot: pc.Entity;
  private readonly artTerrainRoot: pc.Entity;
  private readonly artStaticRoot: pc.Entity;
  private readonly artSceneryRoot: pc.Entity;
  private readonly assetLibrary: PlayCanvasAssetLibrary;
  private readonly unitVisuals = new Map<string, UnitVisual>();
  private readonly buildingVisuals = new Map<string, BuildingVisual>();
  private readonly projectileVisuals = new Map<string, pc.Entity>();
  private readonly effects: EffectVisual[] = [];
  private readonly materials = new Map<string, pc.StandardMaterial>();
  private readonly callbacks: BattlefieldCallbacks;
  private readonly previewRoot: pc.Entity;
  private readonly previewMaterial: pc.StandardMaterial;

  private cameraTarget = new pc.Vec3(0, 0, 0);
  private cameraYaw = 39;
  private orthoHeight = 29;
  private dragging = false;
  private dragPointer = -1;
  private previousPointer = new pc.Vec2();
  private dragDistance = 0;
  private latestEventSequence = -1;
  private battleElapsed = 0;
  private destroyed = false;
  private characterTracks: ReadonlyMap<string, pc.AnimTrack> | null = null;
  private operatorTracks: ReadonlyMap<string, pc.AnimTrack> | null = null;
  private artReady = false;
  private latestUnits: readonly BattleUnit[] = [];
  private latestBuildings: readonly BattleBuilding[] = [];
  private arrowImpactMaterials: readonly pc.StandardMaterial[] = [];
  private magicFlightMaterials: readonly pc.StandardMaterial[] = [];

  constructor(canvas: HTMLCanvasElement, callbacks: BattlefieldCallbacks) {
    this.callbacks = callbacks;
    this.app = new pc.Application(canvas, {
      graphicsDeviceOptions: {
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      },
    });
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.scene.ambientLight = color("#8ba59b");
    this.app.scene.fog.type = pc.FOG_LINEAR;
    this.app.scene.fog.color = color("#aabbb2");
    this.app.scene.fog.start = 41;
    this.app.scene.fog.end = 76;

    this.worldRoot = new pc.Entity("Battlefield", this.app);
    this.dynamicRoot = new pc.Entity("Dynamic battle entities", this.app);
    this.fallbackTerrainRoot = new pc.Entity("Fallback terrain", this.app);
    this.fallbackStaticRoot = new pc.Entity("Fallback structures", this.app);
    this.artTerrainRoot = new pc.Entity("KayKit terrain", this.app);
    this.artStaticRoot = new pc.Entity("KayKit structures", this.app);
    this.artSceneryRoot = new pc.Entity("KayKit scenery", this.app);
    this.assetLibrary = new PlayCanvasAssetLibrary(this.app, callbacks.onAssetProgress);
    this.camera = this.createCamera();
    this.app.root.addChild(this.worldRoot);
    this.worldRoot.addChild(this.fallbackTerrainRoot);
    this.worldRoot.addChild(this.fallbackStaticRoot);
    this.worldRoot.addChild(this.artTerrainRoot);
    this.worldRoot.addChild(this.artStaticRoot);
    this.worldRoot.addChild(this.artSceneryRoot);
    this.worldRoot.addChild(this.dynamicRoot);
    this.createLighting();
    this.createTerrain();
    this.createStaticStructures();
    this.previewMaterial = this.material("preview", "#74eca5", {
      emissive: "#3cbd73",
      opacity: 0.47,
      unlit: true,
    });
    this.previewRoot = this.primitive("Deployment preview", "cylinder", this.previewMaterial);
    this.previewRoot.setLocalScale(1.45, 0.035, 1.45);
    this.previewRoot.enabled = false;
    this.worldRoot.addChild(this.previewRoot);
    this.bindInput(canvas);
    this.app.on("update", (delta: number) => this.update(delta));
    this.app.start();
    this.updateCamera();
    void this.initializeArtAssets();
  }

  syncBattle(battle: BattleState): void {
    this.battleElapsed = battle.elapsed;
    this.syncUnits(battle.units);
    for (const event of battle.events) {
      if (event.type !== "attack-started") continue;
      const visual = this.unitVisuals.get(event.attackerId);
      if (visual && (visual.attackStartedAt === null || event.time > visual.attackStartedAt)) {
        visual.attackStartedAt = event.time;
      }
    }
    this.syncBuildings(battle.buildings);
    this.syncProjectiles(battle);
    this.syncCombatEffects(battle);
  }

  setDeploymentPreview(preview: DeploymentPreview | null): void {
    if (!preview?.position) {
      this.previewRoot.enabled = false;
      return;
    }
    this.previewRoot.enabled = true;
    this.previewMaterial.diffuse = color(preview.valid ? "#74eca5" : "#ff6660");
    this.previewMaterial.emissive = color(preview.valid ? "#3cbd73" : "#c83232");
    this.previewMaterial.update();
    this.previewRoot.setPosition(
      preview.position.x,
      terrainHeightAt(preview.position) + 0.14,
      preview.position.z,
    );
  }

  resetPresentation(): void {
    for (const visual of this.unitVisuals.values()) visual.root.destroy();
    for (const visual of this.buildingVisuals.values()) visual.root.destroy();
    for (const visual of this.projectileVisuals.values()) visual.destroy();
    for (const visual of this.effects) visual.root.destroy();
    this.unitVisuals.clear();
    this.buildingVisuals.clear();
    this.projectileVisuals.clear();
    this.effects.length = 0;
    this.latestEventSequence = -1;
    this.previewRoot.enabled = false;
  }

  resetCamera(): void {
    this.cameraTarget.set(0, 0, 0);
    this.cameraYaw = 39;
    this.orthoHeight = 29;
    this.updateCamera();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.destroy();
  }

  private createCamera(): pc.Entity {
    const camera = new pc.Entity("Battle camera");
    camera.addComponent("camera", {
      clearColor: color("#aabbb2"),
      projection: pc.PROJECTION_ORTHOGRAPHIC,
      orthoHeight: this.orthoHeight,
      nearClip: 0.1,
      farClip: 120,
      frustumCulling: true,
    });
    this.app.root.addChild(camera);
    return camera;
  }

  private createLighting(): void {
    const sun = new pc.Entity("Warm key light");
    sun.addComponent("light", {
      type: "directional",
      color: color("#fff0c7"),
      intensity: 2.2,
      castShadows: true,
      shadowResolution: 2048,
      shadowDistance: 70,
    });
    sun.setEulerAngles(42, -35, 0);
    this.app.root.addChild(sun);

    const fill = new pc.Entity("Cool fill light");
    fill.addComponent("light", {
      type: "directional",
      color: color("#c7deec"),
      intensity: 0.7,
      castShadows: false,
    });
    fill.setEulerAngles(58, 145, 0);
    this.app.root.addChild(fill);
  }

  private createTerrain(): void {
    const surfaceMaterials = {
      grass: this.material("terrain-grass", "#9fba74"),
      camp: this.material("terrain-camp", "#c8ad6b"),
      bridge: this.material("terrain-bridge", "#b79c6a"),
      forest: this.material("terrain-forest", "#6f9568"),
      rock: this.material("terrain-rock", "#8e8c7d"),
      water: this.material("terrain-water", "#4c99ab", { emissive: "#173f52" }),
    } as const;
    const hexMesh = pc.Mesh.fromGeometry(this.app.graphicsDevice, new pc.CylinderGeometry({
      radius: 1.04,
      height: 0.24,
      heightSegments: 1,
      capSegments: 6,
    }));

    for (const cell of BATTLEFIELD_MAP.cells) {
      const world = axialToWorld(cell);
      const material = surfaceMaterials[cell.surface];
      const tile = this.meshEntity(`Hex ${cell.q},${cell.r}`, hexMesh, material, false, true);
      tile.setPosition(world.x, cell.height - 0.12, world.z);
      const territoryTint = cell.territory === "verdant" ? 1.025 : cell.territory === "crimson" ? 0.975 : 1;
      tile.setLocalScale(1, territoryTint, 1);
      this.fallbackTerrainRoot.addChild(tile);
      if ((cell.surface === "forest" || cell.surface === "rock") && hashCell(cell.q, cell.r) % 2 === 0) {
        this.createTerrainProp(cell.surface, world, cell.height, hashCell(cell.q, cell.r));
      }
    }

    const waterBase = this.primitive("Water base", "cylinder", surfaceMaterials.water, false, true);
    waterBase.setLocalScale(23.5, 1.2, 23.5);
    waterBase.setPosition(0, -1.02, 0);
    this.fallbackTerrainRoot.addChild(waterBase);
  }

  private createTerrainProp(
    surface: "forest" | "rock",
    point: WorldPoint,
    height: number,
    hash: number,
  ): void {
    const root = new pc.Entity(`${surface} prop`);
    root.setPosition(
      point.x + ((hash % 5) - 2) * 0.13,
      height + 0.02,
      point.z + (((hash >> 3) % 5) - 2) * 0.13,
    );
    root.setEulerAngles(0, hash % 360, 0);
    if (surface === "forest") {
      const trunk = this.primitive("Trunk", "cylinder", this.material("trunk", "#684b32"));
      trunk.setLocalScale(0.16, 0.72, 0.16);
      trunk.setLocalPosition(0, 0.68, 0);
      root.addChild(trunk);
      const crown = this.primitive("Crown", "cone", this.material("foliage", "#3f704c"));
      crown.setLocalScale(0.72, 1.18, 0.72);
      crown.setLocalPosition(0, 1.62, 0);
      root.addChild(crown);
    } else {
      const rock = this.primitive("Rock", "sphere", this.material("rock-prop", "#77796f"));
      rock.setLocalScale(0.7, 0.58, 0.76);
      rock.setLocalPosition(0, 0.35, 0);
      root.addChild(rock);
    }
    this.fallbackTerrainRoot.addChild(root);
  }

  private createStaticStructures(): void {
    for (const structure of BATTLEFIELD_STATIC_STRUCTURES) {
      const world = axialToWorld(structure.coordinate);
      const colors = FACTION_COLORS[structure.faction];
      const root = new pc.Entity(structure.id);
      root.setPosition(world.x, terrainHeightAt(world) + 0.04, world.z);
      root.setEulerAngles(0, structure.rotationY * pc.math.RAD_TO_DEG, 0);
      if (structure.kind.startsWith("wall")) {
        const wall = this.primitive("Wall", "box", this.material("stone-wall", "#a6a18e"), true, true);
        wall.setLocalScale(structure.kind === "wall-gate" ? 1.25 : 1.65, 0.82, 0.42);
        wall.setLocalPosition(0, 0.42, 0);
        root.addChild(wall);
      } else {
        const base = this.primitive("Building base", "box", this.material(`${structure.faction}-static`, colors.dark), true, true);
        base.setLocalScale(1.18, 0.78, 1.18);
        base.setLocalPosition(0, 0.4, 0);
        root.addChild(base);
        const roof = this.primitive("Building roof", "cone", this.material(`${structure.faction}-roof`, colors.primary), true, true);
        roof.setLocalScale(0.92, 0.66, 0.92);
        roof.setLocalPosition(0, 1.12, 0);
        root.addChild(roof);
      }
      this.fallbackStaticRoot.addChild(root);
    }
  }

  private async initializeArtAssets(): Promise<void> {
    const urls = this.collectArtAssetUrls();
    await this.assetLibrary.preload(urls);
    if (this.destroyed) return;
    try {
      [this.characterTracks, this.operatorTracks] = await Promise.all([
        this.assetLibrary.animationTracks(CHARACTER_ANIMATION_URLS),
        this.assetLibrary.animationTracks(CATAPULT_OPERATOR_ANIMATION_URLS),
      ]);
    } catch (error) {
      console.warn("Character animation tracks will use static poses.", error);
    }
    await this.loadBattleFxMaterials();
    const [terrainLoaded, structuresLoaded] = await Promise.all([
      this.createKayKitTerrain(),
      this.createKayKitStaticStructures(),
      this.createKayKitScenery(),
    ]);
    if (this.destroyed) return;
    if (terrainLoaded) this.fallbackTerrainRoot.enabled = false;
    if (structuresLoaded) this.fallbackStaticRoot.enabled = false;
    this.artReady = true;
    for (const unit of this.latestUnits) {
      const visual = this.unitVisuals.get(unit.id);
      if (visual && !visual.model) void this.attachUnitModel(unit, visual);
    }
    for (const building of this.latestBuildings) {
      const visual = this.buildingVisuals.get(building.id);
      if (visual && !visual.model) void this.attachBuildingModel(building, visual);
    }
  }

  private collectArtAssetUrls(): readonly string[] {
    const urls = new Set<string>();
    for (const key of TERRAIN_TILE_ASSET_KEYS) urls.add(TERRAIN_TILE_ASSETS[key].url);
    for (const asset of Object.values(BATTLEFIELD_CLOUD_SCENE_ASSETS)) urls.add(asset.url);
    for (const asset of Object.values(SCENERY_SCENE_ASSETS)) {
      urls.add(asset.url);
      if ("factionUrls" in asset && asset.factionUrls) {
        for (const url of Object.values(asset.factionUrls)) {
          if (url) urls.add(url);
        }
      }
    }
    for (const factionAssets of Object.values(STRUCTURE_SCENE_ASSETS)) {
      for (const asset of Object.values(factionAssets)) urls.add(asset.url);
    }
    for (const asset of Object.values(CHARACTER_SCENE_ASSETS)) {
      urls.add(asset.modelUrl);
      if ("equipment" in asset && asset.equipment) {
        for (const piece of asset.equipment) {
          for (const url of Object.values(piece.modelUrls)) {
            if (url) urls.add(url);
          }
        }
      }
    }
    for (const url of Object.values(SCENE_MODEL_URLS)) urls.add(url);
    for (const faction of ["verdant", "crimson"] as const) {
      for (const kind of ["castle", "arrow-tower", "guard-tower", "gold-mine", "barracks"] as const) {
        for (const detail of battleBuildingDetailAssets(faction, kind)) urls.add(detail.url);
      }
    }
    for (const url of CHARACTER_ANIMATION_URLS) urls.add(url);
    for (const url of CATAPULT_OPERATOR_ANIMATION_URLS) urls.add(url);
    return [...urls];
  }

  private async loadBattleFxMaterials(): Promise<void> {
    const createSequence = async (
      name: string,
      urls: readonly string[],
    ): Promise<readonly pc.StandardMaterial[]> => {
      const materials: pc.StandardMaterial[] = [];
      for (const [index, url] of urls.entries()) {
        try {
          const texture = await this.assetLibrary.texture(url);
          const material = new pc.StandardMaterial();
          material.name = `${name}-${index}`;
          material.diffuse = pc.Color.WHITE;
          material.diffuseMap = texture;
          material.emissive = pc.Color.WHITE;
          material.emissiveMap = texture;
          material.emissiveIntensity = 1.25;
          material.opacityMap = texture;
          material.opacityMapChannel = "a";
          material.blendType = pc.BLEND_NORMAL;
          material.depthWrite = false;
          material.useLighting = false;
          material.cull = pc.CULLFACE_NONE;
          material.update();
          materials.push(material);
        } catch (error) {
          console.warn(`Battle FX texture failed: ${url}.`, error);
        }
      }
      return materials;
    };
    [this.arrowImpactMaterials, this.magicFlightMaterials] = await Promise.all([
      createSequence("arrow-impact", BATTLE_FX_SEQUENCES.arrowImpact),
      createSequence("magic-flight", BATTLE_FX_SEQUENCES.magicFlight),
    ]);
  }

  private async createKayKitTerrain(): Promise<boolean> {
    const plan = createTerrainTilePlan(BATTLEFIELD_MAP);
    let loaded = 0;
    await Promise.all(plan.map(async ({ cell, assetKey, renderHeight, rotationY }) => {
      const asset = TERRAIN_TILE_ASSETS[assetKey];
      try {
        const model = await this.assetLibrary.instantiate(asset.url, {
          castShadows: false,
          receiveShadows: true,
        });
        if (this.destroyed) return model.destroy();
        const world = axialToWorld(cell);
        model.setLocalPosition(world.x, renderHeight - 0.03, world.z);
        model.setLocalEulerAngles(0, rotationY * pc.math.RAD_TO_DEG, 0);
        this.artTerrainRoot.addChild(model);
        loaded += 1;
      } catch (error) {
        console.warn(`Terrain asset failed for ${cell.q},${cell.r}.`, error);
      }
    }));
    const water = this.primitive(
      "KayKit water foundation",
      "cylinder",
      this.material("art-water-foundation", "#4b93a8", { emissive: "#173f52" }),
      false,
      true,
    );
    water.setLocalScale(23.5, 1.2, 23.5);
    water.setLocalPosition(0, -1.04, 0);
    this.artTerrainRoot.addChild(water);
    return loaded === plan.length;
  }

  private async createKayKitStaticStructures(): Promise<boolean> {
    let loaded = 0;
    await Promise.all(BATTLEFIELD_STATIC_STRUCTURES.map(async (structure) => {
      const asset = structure.kind === "wall-straight"
        || structure.kind === "wall-corner"
        || structure.kind === "wall-gate"
        ? STRUCTURE_SCENE_ASSETS.neutral[structure.kind]
        : STRUCTURE_SCENE_ASSETS[structure.faction][structure.kind];
      try {
        const model = await this.assetLibrary.instantiate(asset.url, {
          castShadows: true,
          receiveShadows: true,
          hiddenNodes: "hiddenNodes" in asset ? asset.hiddenNodes : undefined,
        });
        if (this.destroyed) return model.destroy();
        model.setLocalScale(asset.scale, asset.scale, asset.scale);
        model.setLocalEulerAngles(0, structure.rotationY * pc.math.RAD_TO_DEG, 0);
        this.assetLibrary.ground(model);
        const world = axialToWorld(structure.coordinate);
        const root = new pc.Entity(structure.id, this.app);
        root.setLocalPosition(world.x, terrainHeightAt(world) + 0.02, world.z);
        root.addChild(model);
        this.artStaticRoot.addChild(root);
        loaded += 1;
      } catch (error) {
        console.warn(`Structure asset failed: ${structure.id}.`, error);
      }
    }));
    return loaded === BATTLEFIELD_STATIC_STRUCTURES.length;
  }

  private async createKayKitScenery(): Promise<void> {
    await Promise.all(BATTLEFIELD_SCENERY.map(async (item) => {
      const asset = scenerySceneAssetFor(item.kind, item.faction);
      try {
        const model = await this.assetLibrary.instantiate(asset.url, {
          castShadows: true,
          receiveShadows: true,
        });
        if (this.destroyed) return model.destroy();
        const scale = asset.scale * item.scale;
        model.setLocalScale(scale, scale, scale);
        model.setLocalEulerAngles(0, item.rotationY * pc.math.RAD_TO_DEG, 0);
        this.assetLibrary.ground(model);
        const world = axialToWorld(item.coordinate);
        const root = new pc.Entity(item.id, this.app);
        root.setLocalPosition(
          world.x + item.offset.x,
          terrainHeightAt(world) + 0.02,
          world.z + item.offset.z,
        );
        root.addChild(model);
        this.artSceneryRoot.addChild(root);
      } catch (error) {
        console.warn(`Scenery asset failed: ${item.id}.`, error);
      }
    }));
    await Promise.all(BATTLEFIELD_CLOUDS.map(async (cloud) => {
      const asset = BATTLEFIELD_CLOUD_SCENE_ASSETS[cloud.kind];
      try {
        const model = await this.assetLibrary.instantiate(asset.url, {
          castShadows: false,
          receiveShadows: false,
        });
        if (this.destroyed) return model.destroy();
        const scale = asset.scale * cloud.scale;
        model.setLocalScale(scale, scale, scale);
        model.setLocalEulerAngles(0, cloud.rotationY * pc.math.RAD_TO_DEG, 0);
        model.setLocalPosition(...cloud.position);
        this.assetLibrary.cloneMaterials(model, (material) => {
          material.opacity = cloud.opacity;
          material.blendType = pc.BLEND_NORMAL;
          material.depthWrite = false;
        });
        this.artSceneryRoot.addChild(model);
      } catch (error) {
        console.warn(`Cloud asset failed: ${cloud.id}.`, error);
      }
    }));
  }

  private syncUnits(units: readonly BattleUnit[]): void {
    this.latestUnits = units;
    const liveIds = new Set(units.map(({ id }) => id));
    for (const [id, visual] of this.unitVisuals) {
      if (liveIds.has(id)) continue;
      visual.root.destroy();
      this.unitVisuals.delete(id);
    }
    for (const unit of units) {
      let visual = this.unitVisuals.get(unit.id);
      if (!visual) {
        visual = this.createUnitVisual(unit);
        this.unitVisuals.set(unit.id, visual);
      }
      visual.target.set(
        unit.position.x,
        terrainHeightAt(unit.position) + 0.08,
        unit.position.z,
      );
      visual.root.setEulerAngles(0, unit.facing * pc.math.RAD_TO_DEG, 0);
      visual.healthRatio = pc.math.clamp(unit.health / Math.max(1, unit.maxHealth), 0, 1);
      visual.status = unit.status;
      visual.root.enabled = unit.health > 0 || (unit.diedAt !== null && this.battleElapsed - unit.diedAt < 1.1);
      this.updateUnitAnimation(unit, visual);
    }
  }

  private createUnitVisual(unit: BattleUnit): UnitVisual {
    const colors = FACTION_COLORS[unit.faction];
    const root = new pc.Entity(unit.id);
    root.setPosition(unit.position.x, terrainHeightAt(unit.position) + 0.08, unit.position.z);
    const scale = UNIT_SCALE[unit.role];
    root.setLocalScale(scale, scale, scale);

    const ring = this.primitive("Faction ring", "cylinder", this.material(`${unit.faction}-ring`, colors.primary, {
      emissive: colors.dark,
    }));
    ring.setLocalScale(unit.role === "catapult" ? 0.68 : 0.38, 0.018, unit.role === "catapult" ? 0.68 : 0.38);
    ring.setLocalPosition(0, 0.025, 0);
    root.addChild(ring);

    const body = this.createUnitBody(unit.role, unit.faction);
    root.addChild(body);

    const healthRoot = new pc.Entity("Health bar");
    healthRoot.setLocalPosition(0, unit.role === "catapult" ? 1.75 : 2.18, 0);
    const healthBack = this.primitive("Health background", "box", this.material("health-back", "#171916", { unlit: true }));
    healthBack.setLocalScale(0.78, 0.065, 0.055);
    healthRoot.addChild(healthBack);
    const healthFill = this.primitive("Health fill", "box", this.material(`${unit.faction}-health`, colors.pale, { emissive: colors.dark, unlit: true }));
    healthFill.setLocalScale(0.72, 0.042, 0.064);
    healthFill.setLocalPosition(0, 0, -0.01);
    healthRoot.addChild(healthFill);
    root.addChild(healthRoot);

    this.dynamicRoot.addChild(root);
    const visual: UnitVisual = {
      root,
      body,
      healthFill,
      target: new pc.Vec3(unit.position.x, terrainHeightAt(unit.position), unit.position.z),
      healthRatio: 1,
      status: unit.status,
      phase: hashString(unit.id) * 0.003,
      model: null,
      modelLoading: false,
      animationName: null,
      catapultArm: null,
      catapultWheels: [],
      previousPosition: new pc.Vec3(unit.position.x, terrainHeightAt(unit.position), unit.position.z),
      operator: null,
      attackStartedAt: null,
    };
    if (this.artReady) void this.attachUnitModel(unit, visual);
    return visual;
  }

  private createUnitBody(role: UnitRole, faction: Faction): pc.Entity {
    if (role === "catapult") return this.createCatapultBody(faction);
    const colors = FACTION_COLORS[faction];
    const root = new pc.Entity(`${role} body`);
    const bodyShape = role === "mage" ? "cone" : "capsule";
    const body = this.primitive("Body", bodyShape, this.material(`${faction}-body`, colors.primary), true, true);
    body.setLocalScale(role === "mage" ? 0.42 : 0.32, role === "mage" ? 0.8 : 0.74, role === "mage" ? 0.42 : 0.32);
    body.setLocalPosition(0, 0.78, 0);
    root.addChild(body);
    const head = this.primitive("Head", "sphere", this.material("unit-skin", "#d9ae82"), true, true);
    head.setLocalScale(0.23, 0.25, 0.23);
    head.setLocalPosition(0, 1.58, 0);
    root.addChild(head);
    const markerMaterial = this.material(`${role}-marker`, role === "mage" ? "#95e4ff" : role === "ranger" ? "#dfc56d" : "#d9dde0", {
      emissive: role === "mage" ? "#1b8bb4" : "#3e3420",
    });
    if (role === "spearman") {
      const spear = this.primitive("Spear", "cylinder", markerMaterial, true, true);
      spear.setLocalScale(0.045, 1.15, 0.045);
      spear.setLocalPosition(0.35, 0.95, -0.05);
      spear.setLocalEulerAngles(8, 0, -12);
      root.addChild(spear);
    } else if (role === "knight") {
      const shield = this.primitive("Shield", "cylinder", markerMaterial, true, true);
      shield.setLocalScale(0.34, 0.055, 0.34);
      shield.setLocalPosition(-0.34, 0.86, 0.04);
      shield.setLocalEulerAngles(0, 0, 90);
      root.addChild(shield);
    } else if (role === "ranger") {
      const bow = this.primitive("Bow marker", "torus", markerMaterial, true, true);
      bow.setLocalScale(0.34, 0.34, 0.08);
      bow.setLocalPosition(0.32, 0.96, 0);
      bow.setLocalEulerAngles(0, 90, 0);
      root.addChild(bow);
    } else {
      const orb = this.primitive("Magic orb", "sphere", markerMaterial, false, false);
      orb.setLocalScale(0.17, 0.17, 0.17);
      orb.setLocalPosition(0.38, 1.15, 0);
      root.addChild(orb);
    }
    return root;
  }

  private createCatapultBody(faction: Faction): pc.Entity {
    const colors = FACTION_COLORS[faction];
    const root = new pc.Entity("Catapult body");
    const wood = this.material("catapult-wood", "#795033");
    const base = this.primitive("Chassis", "box", wood, true, true);
    base.setLocalScale(0.95, 0.28, 0.64);
    base.setLocalPosition(0, 0.48, 0);
    root.addChild(base);
    for (const side of [-1, 1]) {
      const wheel = this.primitive("Wheel", "cylinder", this.material("wheel", "#4b3425"), true, true);
      wheel.setLocalScale(0.36, 0.12, 0.36);
      wheel.setLocalPosition(side * 0.58, 0.38, 0);
      wheel.setLocalEulerAngles(0, 0, 90);
      root.addChild(wheel);
    }
    const arm = this.primitive("Throwing arm", "box", wood, true, true);
    arm.setLocalScale(0.15, 1.1, 0.14);
    arm.setLocalPosition(0, 1.16, 0.1);
    arm.setLocalEulerAngles(-28, 0, 0);
    root.addChild(arm);
    const accent = this.primitive("Faction standard", "box", this.material(`${faction}-catapult`, colors.primary), true, true);
    accent.setLocalScale(0.62, 0.08, 0.4);
    accent.setLocalPosition(0, 0.76, 0);
    root.addChild(accent);
    return root;
  }

  private async attachUnitModel(unit: BattleUnit, visual: UnitVisual): Promise<void> {
    if (visual.model || visual.modelLoading) return;
    visual.modelLoading = true;
    try {
      if (unit.role === "catapult") {
        await this.attachCatapultModel(unit, visual);
      } else {
        await this.attachCharacterModel(unit, visual);
      }
    } catch (error) {
      console.warn(`Unit model failed: ${unit.id}.`, error);
    } finally {
      visual.modelLoading = false;
    }
  }

  private async attachCharacterModel(unit: BattleUnit, visual: UnitVisual): Promise<void> {
    const role = unit.role as CharacterRole;
    const asset = CHARACTER_SCENE_ASSETS[role];
    const model = await this.assetLibrary.instantiate(asset.modelUrl, {
      castShadows: false,
      receiveShadows: true,
    });
    if (visual.root.parent === null || this.unitVisuals.get(unit.id) !== visual) {
      model.destroy();
      return;
    }
    model.setLocalScale(0.27, 0.27, 0.27);
    this.assetLibrary.cloneMaterials(model, (material, meshName) => {
      tintStandardMaterial(
        material,
        color(FACTION_COLORS[unit.faction].primary),
        characterTintStrength(role, meshName),
      );
    });
    this.assetLibrary.ground(model);
    if ("equipment" in asset && asset.equipment) {
      for (const piece of asset.equipment) {
        const equipmentUrl = piece.modelUrls[unit.faction];
        if (!equipmentUrl) continue;
        const equipment = await this.assetLibrary.instantiate(
          equipmentUrl,
          { castShadows: false, receiveShadows: true },
        );
        const bone = model.findByName(piece.boneName) as pc.Entity | null;
        if (bone) {
          equipment.setLocalScale(piece.scale, piece.scale, piece.scale);
          equipment.setLocalPosition(...piece.position);
          equipment.setLocalEulerAngles(
            piece.rotation[0] * pc.math.RAD_TO_DEG,
            piece.rotation[1] * pc.math.RAD_TO_DEG,
            piece.rotation[2] * pc.math.RAD_TO_DEG,
          );
          bone.addChild(equipment);
        } else {
          equipment.destroy();
        }
      }
    }
    visual.root.addChild(model);
    visual.body.enabled = false;
    visual.model = model;
    if (this.characterTracks) this.setupAnimation(model, this.characterTracks, "Idle_A");
    this.updateUnitAnimation(unit, visual, true);
  }

  private async attachCatapultModel(unit: BattleUnit, visual: UnitVisual): Promise<void> {
    const model = await this.assetLibrary.instantiate(SCENE_MODEL_URLS.mobileCatapult, {
      castShadows: false,
      receiveShadows: true,
    });
    if (visual.root.parent === null || this.unitVisuals.get(unit.id) !== visual) {
      model.destroy();
      return;
    }
    model.setLocalScale(2.2, 2.2, 2.2);
    this.assetLibrary.cloneMaterials(model, (material) => {
      tintStandardMaterial(material, color(FACTION_COLORS[unit.faction].primary), 0.12);
    });
    this.assetLibrary.ground(model);
    visual.root.addChild(model);
    visual.body.enabled = false;
    visual.model = model;
    visual.catapultArm = model.findByName("tripo_part_3") as pc.Entity | null;
    for (const name of ["tripo_part_1", "tripo_part_2", "tripo_part_5"]) {
      const wheel = model.findByName(name) as pc.Entity | null;
      if (wheel) visual.catapultWheels.push(wheel);
    }

    try {
      const operator = await this.assetLibrary.instantiate(SCENE_MODEL_URLS.catapultOperator, {
        castShadows: false,
        receiveShadows: true,
      });
      if (visual.root.parent === null || this.unitVisuals.get(unit.id) !== visual) {
        operator.destroy();
        return;
      }
      operator.setLocalScale(0.25, 0.25, 0.25);
      this.assetLibrary.cloneMaterials(operator, (material) => {
        tintStandardMaterial(material, color(FACTION_COLORS[unit.faction].primary), 0.34);
      });
      this.assetLibrary.ground(operator);
      operator.setLocalPosition(0.72, operator.getLocalPosition().y, -0.62);
      operator.setLocalEulerAngles(0, -9.2, 0);
      visual.root.addChild(operator);
      visual.operator = operator;
      if (this.operatorTracks) this.setupAnimation(operator, this.operatorTracks, "Idle_A");
      this.updateUnitAnimation(unit, visual, true);
    } catch (error) {
      console.warn(`Catapult operator failed: ${unit.id}.`, error);
    }
  }

  private setupAnimation(
    entity: pc.Entity,
    tracks: ReadonlyMap<string, pc.AnimTrack>,
    preferredDefault: string,
  ): void {
    if (tracks.size === 0) return;
    const stateNames = [...tracks.keys()].filter((name) => name !== "START" && name !== "END");
    const defaultState = tracks.has(preferredDefault) ? preferredDefault : stateNames[0];
    if (!defaultState) return;
    entity.addComponent("anim", { activate: true });
    const anim = entity.anim;
    if (!anim) return;
    anim.loadStateGraph({
      layers: [{
        name: "Base",
        states: [
          { name: "START", speed: 1 },
          ...stateNames.map((name) => ({
            name,
            speed: 1,
            loop: characterAnimationLoops(name),
            defaultState: name === defaultState,
          })),
        ],
        transitions: [{ from: "START", to: defaultState }],
      }],
      parameters: {},
    });
    for (const [name, track] of tracks) {
      if (!stateNames.includes(name)) continue;
      anim.assignAnimation(
        name,
        track,
        undefined,
        1,
        characterAnimationLoops(name),
      );
    }
  }

  private updateUnitAnimation(
    unit: BattleUnit,
    visual: UnitVisual,
    force = false,
  ): void {
    const animationName = unit.role === "catapult"
      ? operatorAnimationForStatus(unit.status)
      : characterAnimationForState({
          id: unit.id,
          role: unit.role as CharacterRole,
          status: unit.status,
          attackSequence: visual.attackStartedAt === null
            ? 0
            : Math.round(visual.attackStartedAt * 20),
          race: unit.combatProfile,
        });
    if (!force && visual.animationName === animationName) return;
    const animated = unit.role === "catapult" ? visual.operator : visual.model;
    if (!animated?.anim || !animated.anim.baseLayer) return;
    const tracks = unit.role === "catapult" ? this.operatorTracks : this.characterTracks;
    const resolvedName = tracks?.has(animationName)
      ? animationName
      : tracks?.has("Idle_A") ? "Idle_A" : tracks?.keys().next().value;
    if (!resolvedName) return;
    animated.anim.baseLayer.transition(resolvedName, force ? 0 : 0.12);
    visual.animationName = resolvedName;
  }

  private syncBuildings(buildings: readonly BattleBuilding[]): void {
    this.latestBuildings = buildings;
    const ids = new Set(buildings.map(({ id }) => id));
    for (const [id, visual] of this.buildingVisuals) {
      if (ids.has(id)) continue;
      visual.root.destroy();
      this.buildingVisuals.delete(id);
    }
    for (const building of buildings) {
      let visual = this.buildingVisuals.get(building.id);
      if (!visual) {
        visual = this.createBuildingVisual(building);
        this.buildingVisuals.set(building.id, visual);
      }
      visual.healthRatio = pc.math.clamp(building.health / Math.max(1, building.maxHealth), 0, 1);
      visual.root.enabled = building.status === "active" || (
        building.diedAt !== null && this.battleElapsed - building.diedAt < 0.85
      );
    }
  }

  private createBuildingVisual(building: BattleBuilding): BuildingVisual {
    const colors = FACTION_COLORS[building.faction];
    const world = axialToWorld(building.coordinate);
    const root = new pc.Entity(building.id);
    root.setPosition(world.x, terrainHeightAt(world) + 0.04, world.z);
    const size = building.kind === "castle" ? 1.65 : building.kind === "guard-tower" || building.kind === "arrow-tower" ? 0.82 : 1.08;
    const base = this.primitive("Building base", building.kind.includes("tower") ? "cylinder" : "box", this.material(`${building.faction}-building`, colors.dark), true, true);
    base.setLocalScale(size, building.kind === "castle" ? 1.3 : 0.92, size);
    base.setLocalPosition(0, building.kind === "castle" ? 1.24 : 0.86, 0);
    root.addChild(base);
    const crownShape = building.kind === "gold-mine" ? "sphere" : "cone";
    const crownColor = building.kind === "gold-mine" ? "#e7bf52" : colors.primary;
    const crown = this.primitive("Building crown", crownShape, this.material(`${building.faction}-${building.kind}-crown`, crownColor, {
      emissive: building.kind === "gold-mine" ? "#6d4f13" : colors.dark,
    }), true, true);
    crown.setLocalScale(size * 0.78, building.kind === "castle" ? 0.9 : 0.58, size * 0.78);
    crown.setLocalPosition(0, building.kind === "castle" ? 2.95 : 1.9, 0);
    root.addChild(crown);
    if (building.kind === "barracks") {
      const flag = this.primitive("Barracks flag", "box", this.material(`${building.faction}-flag`, colors.primary), true, true);
      flag.setLocalScale(0.08, 0.62, 0.42);
      flag.setLocalPosition(0.8, 1.65, 0);
      root.addChild(flag);
    }
    const healthRoot = new pc.Entity("Building health");
    healthRoot.setLocalPosition(0, building.kind === "castle" ? 4.05 : 2.65, 0);
    const healthBack = this.primitive("Health background", "box", this.material("building-health-back", "#171916", { unlit: true }));
    healthBack.setLocalScale(building.kind === "castle" ? 1.35 : 0.9, 0.08, 0.07);
    healthRoot.addChild(healthBack);
    const healthFill = this.primitive("Health fill", "box", this.material(`${building.faction}-building-health`, colors.pale, { emissive: colors.dark, unlit: true }));
    healthFill.setLocalScale(building.kind === "castle" ? 1.27 : 0.84, 0.052, 0.08);
    healthRoot.addChild(healthFill);
    root.addChild(healthRoot);
    this.dynamicRoot.addChild(root);
    const visual: BuildingVisual = {
      root,
      healthFill,
      healthRatio: 1,
      model: null,
      modelLoading: false,
    };
    if (this.artReady) void this.attachBuildingModel(building, visual);
    return visual;
  }

  private async attachBuildingModel(
    building: BattleBuilding,
    visual: BuildingVisual,
  ): Promise<void> {
    if (visual.model || visual.modelLoading) return;
    visual.modelLoading = true;
    const assetKey = BATTLE_BUILDING_ASSET_KEYS[building.kind];
    const asset = STRUCTURE_SCENE_ASSETS[building.faction][assetKey];
    try {
      const model = await this.assetLibrary.instantiate(asset.url, {
        castShadows: true,
        receiveShadows: true,
      });
      if (visual.root.parent === null || this.buildingVisuals.get(building.id) !== visual) {
        model.destroy();
        return;
      }
      model.setLocalScale(asset.scale, asset.scale, asset.scale);
      this.assetLibrary.ground(model);
      visual.root.addChild(model);
      await Promise.all(battleBuildingDetailAssets(building.faction, building.kind).map(
        async (detail) => {
          try {
            const prop = await this.assetLibrary.instantiate(detail.url, {
              castShadows: true,
              receiveShadows: true,
            });
            prop.setLocalScale(detail.scale, detail.scale, detail.scale);
            prop.setLocalPosition(...detail.position);
            prop.setLocalEulerAngles(0, detail.rotationY * pc.math.RAD_TO_DEG, 0);
            visual.root.addChild(prop);
          } catch (error) {
            console.warn(`Building detail failed: ${building.id}/${detail.id}.`, error);
          }
        },
      ));
      for (const child of visual.root.children) {
        if (child !== model && child.name !== "Building health") child.enabled = false;
      }
      visual.model = model;
    } catch (error) {
      console.warn(`Building model failed: ${building.id}.`, error);
    } finally {
      visual.modelLoading = false;
    }
  }

  private syncProjectiles(battle: BattleState): void {
    const ids = new Set(battle.projectiles.map(({ id }) => id));
    for (const [id, entity] of this.projectileVisuals) {
      if (ids.has(id)) continue;
      entity.destroy();
      this.projectileVisuals.delete(id);
    }
    for (const projectile of battle.projectiles) {
      let entity = this.projectileVisuals.get(projectile.id);
      if (!entity) {
        const projectileColor = projectile.role === "mage" ? "#78dcff" : projectile.role === "catapult" ? "#362f28" : "#f1d174";
        entity = this.primitive(projectile.id, projectile.role === "catapult" ? "sphere" : "capsule", this.material(`projectile-${projectile.role}`, projectileColor, {
          emissive: projectile.role === "mage" ? "#207fa4" : "#6e5118",
        }));
        const size = projectile.role === "catapult" ? 0.28 : 0.1;
        entity.setLocalScale(size, projectile.role === "catapult" ? size : 0.34, size);
        this.dynamicRoot.addChild(entity);
        this.projectileVisuals.set(projectile.id, entity);
      }
      const height = terrainHeightAt(projectile.position) + (projectile.role === "catapult" ? 1.35 : 1.05);
      entity.setPosition(projectile.position.x, height, projectile.position.z);
      if (projectile.role === "mage" && this.magicFlightMaterials.length > 0 && entity.render) {
        const frame = Math.floor(battle.elapsed * 18) % this.magicFlightMaterials.length;
        entity.render.material = this.magicFlightMaterials[frame]!;
        const pulse = 0.16 + Math.sin(battle.elapsed * 22) * 0.025;
        entity.setLocalScale(pulse, pulse, pulse);
      }
    }
  }

  private syncCombatEffects(battle: BattleState): void {
    for (const event of battle.events) {
      if (event.sequence <= this.latestEventSequence) continue;
      this.latestEventSequence = Math.max(this.latestEventSequence, event.sequence);
      if (event.type !== "projectile-hit") continue;
      const isMagic = event.role === "mage";
      const isCatapult = event.role === "catapult";
      const material = this.material(`impact-${event.role}`, isMagic ? "#8be7ff" : isCatapult ? "#ef9b55" : "#f6dc82", {
        emissive: isMagic ? "#238db7" : "#8c461d",
        opacity: 0.66,
        unlit: true,
      });
      const effect = this.primitive("Projectile impact", "sphere", material);
      effect.setPosition(
        event.position.x,
        terrainHeightAt(event.position) + 0.55,
        event.position.z,
      );
      const size = isCatapult ? 0.58 : isMagic ? 0.42 : 0.2;
      effect.setLocalScale(size, size, size);
      const frameMaterials = event.role === "ranger" && this.arrowImpactMaterials.length > 0
        ? this.arrowImpactMaterials
        : undefined;
      if (frameMaterials && effect.render) effect.render.material = frameMaterials[0]!;
      this.dynamicRoot.addChild(effect);
      this.effects.push({
        root: effect,
        age: 0,
        lifetime: isCatapult ? 0.55 : 0.34,
        frameMaterials,
      });
    }
  }

  private update(delta: number): void {
    this.updateKeyboard(delta);
    for (const visual of this.unitVisuals.values()) {
      const position = visual.root.getPosition();
      position.lerp(position, visual.target, 1 - Math.exp(-13 * delta));
      visual.root.setPosition(position);
      if (visual.catapultWheels.length > 0) {
        const travelled = visual.previousPosition.distance(position);
        const wheelRotation = wheelRotationForTravel(travelled) * pc.math.RAD_TO_DEG;
        for (const wheel of visual.catapultWheels) wheel.rotateLocal(wheelRotation, 0, 0);
      }
      visual.previousPosition.copy(position);
      if (visual.catapultArm) {
        const attackAge = visual.attackStartedAt === null
          ? undefined
          : this.battleElapsed - visual.attackStartedAt;
        const motion = catapultMotionPose(attackAge);
        const armEuler = visual.catapultArm.getLocalEulerAngles();
        visual.catapultArm.setLocalEulerAngles(
          motion.armRotation * pc.math.RAD_TO_DEG,
          armEuler.y,
          armEuler.z,
        );
        if (visual.model) {
          const modelPosition = visual.model.getLocalPosition();
          visual.model.setLocalEulerAngles(motion.carriageRock * pc.math.RAD_TO_DEG, 0, 0);
          visual.model.setLocalPosition(modelPosition);
        }
      }
      const bob = visual.status === "moving"
        ? Math.abs(Math.sin(this.battleElapsed * 12 + visual.phase)) * 0.07
        : visual.status === "attacking"
          ? Math.sin(this.battleElapsed * 16 + visual.phase) * 0.035
          : 0;
      visual.body.setLocalPosition(0, bob, 0);
      const width = 0.72 * visual.healthRatio;
      visual.healthFill.setLocalScale(width, 0.042, 0.064);
      visual.healthFill.setLocalPosition(-(0.72 - width) / 2, 0, -0.01);
      visual.healthFill.parent?.setLocalEulerAngles(0, -this.cameraYaw, 0);
    }
    for (const visual of this.buildingVisuals.values()) {
      const baseWidth = visual.root.name.includes("castle") ? 1.27 : 0.84;
      const width = baseWidth * visual.healthRatio;
      visual.healthFill.setLocalScale(width, 0.052, 0.08);
      visual.healthFill.setLocalPosition(-(baseWidth - width) / 2, 0, 0);
      visual.healthFill.parent?.setLocalEulerAngles(0, -this.cameraYaw, 0);
    }
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index]!;
      effect.age += delta;
      if (effect.age >= effect.lifetime) {
        effect.root.destroy();
        this.effects.splice(index, 1);
        continue;
      }
      const progress = effect.age / effect.lifetime;
      const scale = 1 + progress * 2.4;
      effect.root.setLocalScale(scale, scale, scale);
      if (effect.frameMaterials && effect.root.render) {
        const frame = Math.min(
          effect.frameMaterials.length - 1,
          Math.floor(progress * effect.frameMaterials.length),
        );
        effect.root.render.material = effect.frameMaterials[frame]!;
      }
    }
  }

  private updateKeyboard(delta: number): void {
    const keyboard = this.app.keyboard;
    if (!keyboard) return;
    let changed = false;
    const move = delta * this.orthoHeight * 0.48;
    if (keyboard.isPressed(pc.KEY_LEFT) || keyboard.isPressed(pc.KEY_A)) {
      this.panCamera(move, 0);
      changed = true;
    }
    if (keyboard.isPressed(pc.KEY_RIGHT) || keyboard.isPressed(pc.KEY_D)) {
      this.panCamera(-move, 0);
      changed = true;
    }
    if (keyboard.isPressed(pc.KEY_UP) || keyboard.isPressed(pc.KEY_W)) {
      this.panCamera(0, move);
      changed = true;
    }
    if (keyboard.isPressed(pc.KEY_DOWN) || keyboard.isPressed(pc.KEY_S)) {
      this.panCamera(0, -move);
      changed = true;
    }
    if (keyboard.isPressed(pc.KEY_Q)) {
      this.cameraYaw -= delta * 46;
      changed = true;
    }
    if (keyboard.isPressed(pc.KEY_E)) {
      this.cameraYaw += delta * 46;
      changed = true;
    }
    if (changed) this.updateCamera();
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 && event.button !== 1) return;
      this.dragging = true;
      this.dragPointer = event.pointerId;
      this.previousPointer.set(event.clientX, event.clientY);
      this.dragDistance = 0;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (this.dragging && event.pointerId === this.dragPointer) {
        const deltaX = event.clientX - this.previousPointer.x;
        const deltaY = event.clientY - this.previousPointer.y;
        this.dragDistance += Math.hypot(deltaX, deltaY);
        this.previousPointer.set(event.clientX, event.clientY);
        const pixelsToWorld = this.orthoHeight / Math.max(1, canvas.clientHeight);
        this.panCamera(deltaX * pixelsToWorld, deltaY * pixelsToWorld);
        this.updateCamera();
        if (this.dragDistance > 4) this.callbacks.onHoverWorld(null);
        return;
      }
      this.callbacks.onHoverWorld(this.screenToGround(event.clientX, event.clientY));
    });
    canvas.addEventListener("pointerup", (event) => {
      if (event.pointerId !== this.dragPointer) return;
      const clicked = this.dragDistance <= 4;
      this.dragging = false;
      this.dragPointer = -1;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!clicked) return;
      const point = this.screenToGround(event.clientX, event.clientY);
      if (point) this.callbacks.onClickWorld(point);
    });
    canvas.addEventListener("pointercancel", () => {
      this.dragging = false;
      this.dragPointer = -1;
      this.callbacks.onHoverWorld(null);
    });
    canvas.addEventListener("pointerleave", () => {
      if (!this.dragging) this.callbacks.onHoverWorld(null);
    });
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const zoom = Math.exp(event.deltaY * 0.0014);
      this.orthoHeight = pc.math.clamp(this.orthoHeight * zoom, 11, 42);
      this.updateCamera();
    }, { passive: false });
    window.addEventListener("resize", () => this.app.resizeCanvas());
  }

  private panCamera(deltaX: number, deltaY: number): void {
    const yaw = this.cameraYaw * pc.math.DEG_TO_RAD;
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    this.cameraTarget.x = pc.math.clamp(
      this.cameraTarget.x + rightX * deltaX + forwardX * deltaY,
      -CAMERA_BOUNDS,
      CAMERA_BOUNDS,
    );
    this.cameraTarget.z = pc.math.clamp(
      this.cameraTarget.z + rightZ * deltaX + forwardZ * deltaY,
      -CAMERA_BOUNDS,
      CAMERA_BOUNDS,
    );
  }

  private updateCamera(): void {
    const yaw = this.cameraYaw * pc.math.DEG_TO_RAD;
    this.camera.setPosition(
      this.cameraTarget.x + Math.sin(yaw) * CAMERA_DISTANCE,
      CAMERA_HEIGHT,
      this.cameraTarget.z + Math.cos(yaw) * CAMERA_DISTANCE,
    );
    this.camera.lookAt(this.cameraTarget.x, 0, this.cameraTarget.z);
    if (this.camera.camera) this.camera.camera.orthoHeight = this.orthoHeight;
  }

  private screenToGround(clientX: number, clientY: number): WorldPoint | null {
    const canvas = this.app.graphicsDevice.canvas as HTMLCanvasElement;
    const bounds = canvas.getBoundingClientRect();
    if (!this.camera.camera || bounds.width <= 0 || bounds.height <= 0) return null;
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    const start = this.camera.camera.screenToWorld(x, y, this.camera.camera.nearClip);
    const end = this.camera.camera.screenToWorld(x, y, this.camera.camera.farClip);
    const directionY = end.y - start.y;
    if (Math.abs(directionY) < 1e-6) return null;
    const distance = -start.y / directionY;
    if (distance < 0 || distance > 1) return null;
    return {
      x: start.x + (end.x - start.x) * distance,
      z: start.z + (end.z - start.z) * distance,
    };
  }

  private primitive(
    name: string,
    type: "box" | "capsule" | "cone" | "cylinder" | "sphere" | "torus",
    material: pc.StandardMaterial,
    castShadows = true,
    receiveShadows = false,
  ): pc.Entity {
    const entity = new pc.Entity(name);
    entity.addComponent("render", { type, castShadows, receiveShadows });
    if (entity.render) entity.render.material = material;
    return entity;
  }

  private meshEntity(
    name: string,
    mesh: pc.Mesh,
    material: pc.StandardMaterial,
    castShadows: boolean,
    receiveShadows: boolean,
  ): pc.Entity {
    const entity = new pc.Entity(name);
    const meshInstance = new pc.MeshInstance(mesh, material);
    meshInstance.castShadow = castShadows;
    entity.addComponent("render", {
      meshInstances: [meshInstance],
      castShadows,
      receiveShadows,
    });
    return entity;
  }

  private material(
    key: string,
    diffuse: string,
    options: {
      readonly emissive?: string;
      readonly opacity?: number;
      readonly unlit?: boolean;
    } = {},
  ): pc.StandardMaterial {
    const existing = this.materials.get(key);
    if (existing) return existing;
    const material = new pc.StandardMaterial();
    material.diffuse = color(diffuse);
    material.emissive = color(options.emissive ?? "#000000");
    material.emissiveIntensity = options.emissive ? 0.55 : 0;
    material.metalness = 0.02;
    material.gloss = 0.24;
    material.useLighting = !options.unlit;
    if (options.opacity !== undefined && options.opacity < 1) {
      material.opacity = options.opacity;
      material.blendType = pc.BLEND_NORMAL;
      material.depthWrite = false;
    }
    material.update();
    this.materials.set(key, material);
    return material;
  }
}

function color(hex: string): pc.Color {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 3
    ? normalized.split("").map((part) => `${part}${part}`).join("")
    : normalized, 16);
  return new pc.Color(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  );
}

function tintStandardMaterial(
  material: pc.StandardMaterial,
  tint: pc.Color,
  strength: number,
): void {
  const amount = pc.math.clamp(strength, 0, 1);
  const base = material.diffuse;
  material.diffuse = new pc.Color(
    base.r + (tint.r - base.r) * amount,
    base.g + (tint.g - base.g) * amount,
    base.b + (tint.b - base.b) * amount,
    base.a,
  );
}

function hashCell(q: number, r: number): number {
  return Math.abs(((q * 73856093) ^ (r * 19349663)) | 0);
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}
