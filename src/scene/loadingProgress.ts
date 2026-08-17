export interface SceneAssetLoadProgress {
  readonly loaded: number;
  readonly total: number;
}

export function sceneAssetLoadPercentage(progress: SceneAssetLoadProgress): number {
  if (progress.total <= 0) return 0;
  const ratio = progress.loaded / progress.total;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}
