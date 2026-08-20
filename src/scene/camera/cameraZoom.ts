export const COMPACT_CAMERA_INITIAL_ZOOM = 13;
export const COMPACT_CAMERA_MINIMUM_ZOOM = 11;
export const PORTRAIT_CAMERA_MINIMUM_INITIAL_ZOOM = 16;
export const PORTRAIT_CAMERA_MAXIMUM_INITIAL_ZOOM = 37;
export const CAMERA_MAXIMUM_ZOOM = 56;

const COMPACT_VIEWPORT_MAXIMUM_EDGE = 520;
const PORTRAIT_VERTICAL_HUD_RESERVE_PX = 150;
const PORTRAIT_CASTLE_SPAN_PX_PER_ZOOM = 18.2;
const WHEEL_LINE_HEIGHT_PX = 40;
const WHEEL_PAGE_HEIGHT_PX = 800;
const WHEEL_DELTA_PER_STEP = 100;
const WHEEL_ZOOM_PER_STEP = 1.1;
const MAXIMUM_WHEEL_EVENT_FACTOR = 1.18;

export interface CameraViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface CameraZoomBounds {
  readonly minimum: number;
  readonly maximum: number;
}

export function isCompactCameraViewport(size: CameraViewportSize): boolean {
  return Math.min(size.width, size.height) <= COMPACT_VIEWPORT_MAXIMUM_EDGE;
}

export function isPortraitCameraViewport(size: CameraViewportSize): boolean {
  return size.height > size.width;
}

export function initialCameraZoom(
  size: CameraViewportSize,
  desktopInitialZoom: number,
): number {
  if (isPortraitCameraViewport(size)) {
    return Math.min(
      PORTRAIT_CAMERA_MAXIMUM_INITIAL_ZOOM,
      Math.max(
        PORTRAIT_CAMERA_MINIMUM_INITIAL_ZOOM,
        (size.height - PORTRAIT_VERTICAL_HUD_RESERVE_PX)
          / PORTRAIT_CASTLE_SPAN_PX_PER_ZOOM,
      ),
    );
  }
  return isCompactCameraViewport(size)
    ? COMPACT_CAMERA_INITIAL_ZOOM
    : desktopInitialZoom;
}

export function cameraZoomBounds(
  size: CameraViewportSize,
  desktopInitialZoom: number,
): CameraZoomBounds {
  return {
    minimum: isCompactCameraViewport(size) || isPortraitCameraViewport(size)
      ? COMPACT_CAMERA_MINIMUM_ZOOM
      : desktopInitialZoom,
    maximum: CAMERA_MAXIMUM_ZOOM,
  };
}

export function clampedCameraZoom(
  currentZoom: number,
  factor: number,
  bounds: CameraZoomBounds,
): number {
  if (!Number.isFinite(currentZoom) || !Number.isFinite(factor) || factor <= 0) {
    return currentZoom;
  }
  return Math.min(bounds.maximum, Math.max(bounds.minimum, currentZoom * factor));
}

export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;

  const normalizedDelta = deltaY * (
    deltaMode === 1
      ? WHEEL_LINE_HEIGHT_PX
      : deltaMode === 2 ? WHEEL_PAGE_HEIGHT_PX : 1
  );
  const logarithmicChange = Math.max(
    -Math.log(MAXIMUM_WHEEL_EVENT_FACTOR),
    Math.min(
      Math.log(MAXIMUM_WHEEL_EVENT_FACTOR),
      (-normalizedDelta / WHEEL_DELTA_PER_STEP) * Math.log(WHEEL_ZOOM_PER_STEP),
    ),
  );
  return Math.exp(logarithmicChange);
}
