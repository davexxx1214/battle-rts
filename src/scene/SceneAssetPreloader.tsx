import { useLoader } from "@react-three/fiber";
import {
  Component,
  Suspense,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { TextureLoader } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { BattleBuildingKind } from "../game/buildings";
import type { Faction } from "../game/types";
import {
  BATTLEFIELD_CLOUD_SCENE_ASSETS,
  CASTLE_BATTLE_FLAG_ASSET,
  SCENE_MODEL_URLS,
  SCENERY_SCENE_ASSETS,
  STRUCTURE_SCENE_ASSETS,
  UNDEAD_CASTLE_BATTLE_FLAG_ASSET,
  UNDEAD_ENVIRONMENT_SCENE_ASSETS,
  UNDEAD_STRUCTURE_SCENE_ASSETS,
  battleBuildingDetailAssets,
} from "./assets";
import { BATTLE_FX_URLS } from "./effects/effectPresentation";
import type { SceneAssetLoadProgress } from "./loadingProgress";
import {
  TERRAIN_TILE_ASSETS,
  TERRAIN_TILE_ASSET_KEYS,
} from "./terrain/tilePresentation";
import {
  CATAPULT_OPERATOR_ANIMATION_URLS,
  CHARACTER_ANIMATION_URLS,
  CHARACTER_SCENE_ASSETS,
  UNDEAD_CHARACTER_SCENE_ASSETS,
  type CharacterSceneAsset,
} from "./units/characterPresentation";

interface SceneAssetPreloaderProps {
  readonly onProgress: (progress: SceneAssetLoadProgress) => void;
  readonly onReady: () => void;
}

interface AssetProbeProps {
  readonly id: string;
  readonly weight: number;
  readonly onLoaded: (id: string, weight: number) => void;
}

interface AssetGroup {
  readonly id: string;
  readonly urls: readonly string[];
}

const BUILDING_PRELOAD_KINDS = [
  "castle",
  "guard-tower",
  "gold-mine",
  "barracks",
] as const satisfies readonly BattleBuildingKind[];

const TERRAIN_ASSET_URLS = TERRAIN_TILE_ASSET_KEYS.map(
  (key) => TERRAIN_TILE_ASSETS[key].url,
);

const GLTF_ASSET_GROUPS: readonly AssetGroup[] = [
  { id: "terrain-tiles", urls: TERRAIN_ASSET_URLS },
  { id: "character-animations", urls: CHARACTER_ANIMATION_URLS },
  { id: "catapult-animations", urls: CATAPULT_OPERATOR_ANIMATION_URLS },
  ...(["verdant", "crimson"] as const satisfies readonly Faction[]).flatMap((faction) => (
    BUILDING_PRELOAD_KINDS.map((kind) => ({
      id: `building-details-${faction}-${kind}`,
      urls: battleBuildingDetailAssets(faction, kind).map(({ url }) => url),
    }))
  )),
  ...BUILDING_PRELOAD_KINDS.map((kind) => ({
    id: `building-details-undead-${kind}`,
    urls: battleBuildingDetailAssets("crimson", kind, true).map(({ url }) => url),
  })),
].filter(({ urls }) => urls.length > 0);

export const SCENE_SINGLE_GLTF_URLS = collectSingleGltfUrls();

const SCENE_ASSET_TOTAL = SCENE_SINGLE_GLTF_URLS.length
  + GLTF_ASSET_GROUPS.reduce((total, group) => total + group.urls.length, 0)
  + BATTLE_FX_URLS.length;

export function SceneAssetPreloader({
  onProgress,
  onReady,
}: SceneAssetPreloaderProps) {
  const completed = useRef(new Set<string>());
  const [loaded, setLoaded] = useState(0);
  const markLoaded = useCallback((id: string, weight: number) => {
    if (completed.current.has(id)) return;
    completed.current.add(id);
    setLoaded((current) => Math.min(SCENE_ASSET_TOTAL, current + weight));
  }, []);

  useEffect(() => {
    onProgress({ loaded, total: SCENE_ASSET_TOTAL });
  }, [loaded, onProgress]);

  useEffect(() => {
    if (loaded < SCENE_ASSET_TOTAL) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(onReady);
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [loaded, onReady]);

  return (
    <>
      {SCENE_SINGLE_GLTF_URLS.map((url) => (
        <Suspense fallback={null} key={url}>
          <SingleGltfAssetProbe
            id={`gltf:${url}`}
            url={url}
            weight={1}
            onLoaded={markLoaded}
          />
        </Suspense>
      ))}
      {GLTF_ASSET_GROUPS.map((group) => (
        <Suspense fallback={null} key={group.id}>
          <GltfAssetGroupProbe
            id={group.id}
            urls={group.urls}
            weight={group.urls.length}
            onLoaded={markLoaded}
          />
        </Suspense>
      ))}
      <Suspense fallback={null}>
        <TextureAssetGroupProbe
          id="battle-fx"
          urls={BATTLE_FX_URLS}
          weight={BATTLE_FX_URLS.length}
          onLoaded={markLoaded}
        />
      </Suspense>
    </>
  );
}

export class SceneAssetErrorBoundary extends Component<{
  readonly children: ReactNode;
  readonly onError: (message: string) => void;
}, { readonly failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : "未知资源加载错误");
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function SingleGltfAssetProbe({
  id,
  url,
  weight,
  onLoaded,
}: AssetProbeProps & { readonly url: string }) {
  useLoader(GLTFLoader, url);
  useEffect(() => onLoaded(id, weight), [id, onLoaded, weight]);
  return null;
}

function GltfAssetGroupProbe({
  id,
  urls,
  weight,
  onLoaded,
}: AssetProbeProps & { readonly urls: readonly string[] }) {
  useLoader(GLTFLoader, [...urls]);
  useEffect(() => onLoaded(id, weight), [id, onLoaded, weight]);
  return null;
}

function TextureAssetGroupProbe({
  id,
  urls,
  weight,
  onLoaded,
}: AssetProbeProps & { readonly urls: readonly string[] }) {
  useLoader(TextureLoader, [...urls]);
  useEffect(() => onLoaded(id, weight), [id, onLoaded, weight]);
  return null;
}

function collectSingleGltfUrls(): readonly string[] {
  const urls = new Set<string>();
  for (const asset of Object.values(BATTLEFIELD_CLOUD_SCENE_ASSETS)) {
    urls.add(asset.url);
  }
  for (const asset of Object.values(SCENERY_SCENE_ASSETS)) {
    urls.add(asset.url);
    if ("factionUrls" in asset) {
      for (const factionUrl of Object.values(asset.factionUrls)) {
        if (typeof factionUrl === "string") urls.add(factionUrl);
      }
    }
  }
    for (const factionAssets of Object.values(STRUCTURE_SCENE_ASSETS)) {
      for (const asset of Object.values(factionAssets)) urls.add(asset.url);
    }
    for (const asset of Object.values(UNDEAD_STRUCTURE_SCENE_ASSETS)) urls.add(asset.url);
  for (const asset of Object.values(CHARACTER_SCENE_ASSETS) as CharacterSceneAsset[]) {
    addCharacterAssetUrls(urls, asset);
  }
  for (const asset of Object.values(UNDEAD_CHARACTER_SCENE_ASSETS) as CharacterSceneAsset[]) {
    addCharacterAssetUrls(urls, asset);
  }
    for (const asset of Object.values(UNDEAD_ENVIRONMENT_SCENE_ASSETS)) urls.add(asset.url);
  for (const url of Object.values(SCENE_MODEL_URLS)) urls.add(url);
  urls.add(CASTLE_BATTLE_FLAG_ASSET.url);
  urls.add(UNDEAD_CASTLE_BATTLE_FLAG_ASSET.url);
  return [...urls];
}

function addCharacterAssetUrls(urls: Set<string>, asset: CharacterSceneAsset): void {
  urls.add(asset.modelUrl);
  for (const piece of asset.equipment ?? []) {
    for (const equipmentUrl of Object.values(piece.modelUrls)) {
      if (equipmentUrl) urls.add(equipmentUrl);
    }
  }
}
