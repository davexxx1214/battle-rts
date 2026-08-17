import * as pc from "playcanvas";

export interface AssetLoadProgress {
  readonly loaded: number;
  readonly total: number;
  readonly failed: number;
  readonly currentUrl: string;
}

export interface InstantiateModelOptions {
  readonly castShadows?: boolean;
  readonly receiveShadows?: boolean;
  readonly hiddenNodes?: readonly string[];
}

export class PlayCanvasAssetLibrary {
  private readonly containers = new Map<string, Promise<pc.Asset>>();
  private readonly textures = new Map<string, Promise<pc.Texture>>();
  private readonly failedUrls = new Set<string>();
  private progressTotal = 0;
  private progressLoaded = 0;

  constructor(
    private readonly app: pc.Application,
    private readonly onProgress?: (progress: AssetLoadProgress) => void,
  ) {}

  async preload(urls: readonly string[]): Promise<void> {
    const unique = [...new Set(urls)];
    this.progressTotal = unique.length;
    this.progressLoaded = 0;
    this.emitProgress("");
    await Promise.allSettled(unique.map(async (url) => {
      try {
        await this.loadContainer(url);
      } finally {
        this.progressLoaded += 1;
        this.emitProgress(url);
      }
    }));
  }

  async instantiate(
    url: string,
    options: InstantiateModelOptions = {},
  ): Promise<pc.Entity> {
    const asset = await this.loadContainer(url);
    const resource = asset.resource as pc.ContainerResource;
    const entity = resource.instantiateRenderEntity({
      castShadows: options.castShadows ?? true,
      receiveShadows: options.receiveShadows ?? true,
    });
    entity.name = `Asset: ${url.split("/").at(-1) ?? url}`;
    for (const hiddenName of options.hiddenNodes ?? []) {
      for (const hidden of entity.find((node) => node.name === hiddenName)) {
        hidden.enabled = false;
      }
    }
    for (const render of entity.findComponents("render") as pc.RenderComponent[]) {
      render.castShadows = options.castShadows ?? true;
      render.receiveShadows = options.receiveShadows ?? true;
    }
    return entity;
  }

  async animationTracks(urls: readonly string[]): Promise<ReadonlyMap<string, pc.AnimTrack>> {
    const tracks = new Map<string, pc.AnimTrack>();
    for (const url of urls) {
      const asset = await this.loadContainer(url);
      const resource = asset.resource as pc.ContainerResource & {
        readonly animations: readonly pc.Asset[];
      };
      for (const animationAsset of resource.animations) {
        const track = animationAsset.resource as pc.AnimTrack;
        const name = track.name || animationAsset.name;
        tracks.set(name, track);
      }
    }
    return tracks;
  }

  texture(url: string): Promise<pc.Texture> {
    const existing = this.textures.get(url);
    if (existing) return existing;
    const request = new Promise<pc.Texture>((resolve, reject) => {
      this.app.assets.loadFromUrl(url, "texture", (error, asset) => {
        if (error || !asset?.resource) {
          this.failedUrls.add(url);
          reject(new Error(`Unable to load texture ${url}: ${error ?? "missing asset"}`));
          return;
        }
        resolve(asset.resource as pc.Texture);
      });
    });
    this.textures.set(url, request);
    return request;
  }

  cloneMaterials(
    entity: pc.Entity,
    transform?: (material: pc.StandardMaterial, meshName: string) => void,
  ): pc.StandardMaterial[] {
    const materials: pc.StandardMaterial[] = [];
    for (const render of entity.findComponents("render") as pc.RenderComponent[]) {
      for (const meshInstance of render.meshInstances) {
        if (!(meshInstance.material instanceof pc.StandardMaterial)) continue;
        const material = meshInstance.material.clone();
        transform?.(material, meshInstance.node.name);
        material.update();
        meshInstance.material = material;
        materials.push(material);
      }
    }
    return materials;
  }

  ground(entity: pc.Entity): void {
    entity.syncHierarchy();
    let minimumY = Number.POSITIVE_INFINITY;
    for (const render of entity.findComponents("render") as pc.RenderComponent[]) {
      for (const meshInstance of render.meshInstances) {
        minimumY = Math.min(minimumY, meshInstance.aabb.getMin().y);
      }
    }
    if (!Number.isFinite(minimumY)) return;
    const position = entity.getLocalPosition();
    entity.setLocalPosition(position.x, position.y - minimumY, position.z);
  }

  hasFailed(url: string): boolean {
    return this.failedUrls.has(url);
  }

  private loadContainer(url: string): Promise<pc.Asset> {
    const existing = this.containers.get(url);
    if (existing) return existing;
    const request = new Promise<pc.Asset>((resolve, reject) => {
      this.app.assets.loadFromUrl(url, "container", (error, asset) => {
        if (error || !asset) {
          this.failedUrls.add(url);
          reject(new Error(`Unable to load ${url}: ${error ?? "missing asset"}`));
          return;
        }
        resolve(asset);
      });
    });
    this.containers.set(url, request);
    return request;
  }

  private emitProgress(currentUrl: string): void {
    this.onProgress?.({
      loaded: this.progressLoaded,
      total: this.progressTotal,
      failed: this.failedUrls.size,
      currentUrl,
    });
  }
}
