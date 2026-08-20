import type { MinimapViewport } from "./minimapProjection";
import { SANDBOX_MINIMAP_VIEWPORT } from "./minimapProjection";

export interface SandboxMinimapPlacement {
  readonly width: number;
  readonly right: number;
  readonly top?: number;
  readonly bottom?: number;
}

export interface SandboxMinimapScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const SANDBOX_MINIMAP_DESKTOP_PLACEMENT: SandboxMinimapPlacement = Object.freeze({
  width: 180,
  right: 18,
  bottom: 56,
});

export const SANDBOX_MINIMAP_COMPACT_PLACEMENT: SandboxMinimapPlacement = Object.freeze({
  width: 128,
  right: 6,
  top: 54,
});

export function sandboxMinimapScreenRect(
  screen: Readonly<{ width: number; height: number }>,
  placement: SandboxMinimapPlacement,
  minimapViewport: MinimapViewport = SANDBOX_MINIMAP_VIEWPORT,
): SandboxMinimapScreenRect {
  const height = placement.width * minimapViewport.height / minimapViewport.width;
  return {
    x: screen.width - placement.right - placement.width,
    y: placement.top
      ?? screen.height - (placement.bottom ?? 0) - height,
    width: placement.width,
    height,
  };
}
