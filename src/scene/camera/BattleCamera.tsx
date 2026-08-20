import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils, OrthographicCamera, Vector3 } from "three";
import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import {
  LEGACY_BATTLEFIELD_DEFINITION,
} from "../../map/battlefieldDefinition";
import type { CameraViewSnapshot } from "./cameraViewStore";
import {
  cameraCenterForWorldPoint,
  clampCameraTarget,
  screenPanWorldDelta,
} from "./cameraPan";
import {
  BATTLE_CAMERA_GROUND_DISTANCE,
  BATTLE_CAMERA_HEIGHT,
  cameraZoomBounds,
  clampedCameraZoom,
  initialCameraZoom,
  isPortraitCameraViewport,
  wheelZoomFactor,
} from "./cameraZoom";
import type { SceneInteractionBridge } from "../sceneInteractionBridge";
import { useBattlefieldDefinition } from "../battlefieldSceneContext";

export const DESKTOP_CAMERA_YAW = LEGACY_BATTLEFIELD_DEFINITION.cameraPreset.desktopYaw;
export const PORTRAIT_CAMERA_YAW = LEGACY_BATTLEFIELD_DEFINITION.cameraPreset.portraitYaw;

export interface CameraShakeImpulse {
  readonly sequence: number;
  readonly intensity: number;
}

export function BattleCamera({
  resetToken,
  shake,
  initialTargetZ,
  initialZoom,
  onViewChange,
  bridgeRef,
}: {
  readonly resetToken: number;
  readonly shake: CameraShakeImpulse | null;
  readonly initialTargetZ?: number;
  readonly initialZoom?: number;
  readonly onViewChange?: (view: CameraViewSnapshot) => void;
  readonly bridgeRef: MutableRefObject<SceneInteractionBridge>;
}) {
  const battlefield = useBattlefieldDefinition();
  const resolvedInitialTargetZ = initialTargetZ
    ?? battlefield.cameraPreset.initialTarget.z;
  const resolvedInitialZoom = initialZoom
    ?? battlefield.cameraPreset.startZoom;
  const { camera, size } = useThree();
  const portraitViewport = isPortraitCameraViewport(size);
  const presetYaw = portraitViewport
    ? battlefield.cameraPreset.portraitYaw
    : battlefield.cameraPreset.desktopYaw;
  const startingZoomBounds = cameraZoomBounds({
    size,
    worldBounds: battlefield.worldBounds,
    yaw: presetYaw,
    overviewPaddingCells: battlefield.cameraPreset.overviewPaddingCells,
    maximumZoom: battlefield.cameraPreset.maximumZoom,
  });
  const startingZoom = clampedCameraZoom(
    initialCameraZoom(size, resolvedInitialZoom),
    1,
    startingZoomBounds,
  );
  const target = useRef(new Vector3(0, 0, 0));
  const keys = useRef(new Set<string>());
  const yaw = useRef(presetYaw);
  const orbiting = useRef(false);
  const lastPointerX = useRef(0);
  const shakeEnergy = useRef(0);
  const shakePhase = useRef(0);
  const viewReportDelay = useRef(0);
  const lastViewSignature = useRef("");

  useEffect(() => {
    target.current.set(
      battlefield.cameraPreset.initialTarget.x,
      0,
      portraitViewport
        ? battlefield.cameraPreset.initialTarget.z
        : resolvedInitialTargetZ,
    );
    yaw.current = presetYaw;
    shakeEnergy.current = 0;
    if (camera instanceof OrthographicCamera) {
      camera.zoom = startingZoom;
      camera.near = battlefield.cameraPreset.near;
      camera.far = battlefield.cameraPreset.far;
      camera.updateProjectionMatrix();
    }
    viewReportDelay.current = 0.1;
    lastViewSignature.current = "";
  }, [
    battlefield,
    camera,
    portraitViewport,
    presetYaw,
    resetToken,
    resolvedInitialTargetZ,
    startingZoom,
  ]);

  useEffect(() => {
    if (!shake) return;
    shakeEnergy.current = Math.max(shakeEnergy.current, shake.intensity);
    shakePhase.current = shake.sequence * 1.618;
  }, [shake?.intensity, shake?.sequence]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key.startsWith("arrow")) keys.current.add(key);
      if (key === "q") yaw.current -= 0.12;
      if (key === "e") yaw.current += 0.12;
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    const clear = () => keys.current.clear();
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 1 || !(event.target instanceof HTMLCanvasElement)) return;
      orbiting.current = true;
      lastPointerX.current = event.clientX;
      event.preventDefault();
    };
    const pointerMove = (event: PointerEvent) => {
      if (!orbiting.current) return;
      yaw.current -= (event.clientX - lastPointerX.current) * 0.006;
      lastPointerX.current = event.clientX;
    };
    const pointerUp = (event: PointerEvent) => {
      if (event.button === 1) orbiting.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    window.addEventListener("pointerdown", pointerDown);
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      window.removeEventListener("pointerdown", pointerDown);
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
    };
  }, []);

  useFrame((_, delta) => {
    const currentZoomBounds = cameraZoomBounds({
      size,
      worldBounds: battlefield.worldBounds,
      yaw: yaw.current,
      overviewPaddingCells: battlefield.cameraPreset.overviewPaddingCells,
      maximumZoom: battlefield.cameraPreset.maximumZoom,
    });
    const currentPanProgress = camera instanceof OrthographicCamera
      ? normalizedPanProgress(
        camera.zoom,
        currentZoomBounds.minimum,
        currentZoomBounds.maximum,
      )
      : 1;
    bridgeRef.current.panByScreenDelta = (deltaX, deltaY) => {
      const worldDelta = screenPanWorldDelta(
        deltaX,
        deltaY,
        yaw.current,
        camera instanceof OrthographicCamera ? camera.zoom : 1,
        BATTLE_CAMERA_HEIGHT,
        BATTLE_CAMERA_GROUND_DISTANCE,
      );
      target.current.x += worldDelta.x;
      target.current.z += worldDelta.z;
    };
    bridgeRef.current.centerOn = (point) => {
      const centerZoomBounds = cameraZoomBounds({
        size,
        worldBounds: battlefield.worldBounds,
        yaw: yaw.current,
        overviewPaddingCells: battlefield.cameraPreset.overviewPaddingCells,
        maximumZoom: battlefield.cameraPreset.maximumZoom,
      });
      const centerPanProgress = camera instanceof OrthographicCamera
        ? normalizedPanProgress(
          camera.zoom,
          centerZoomBounds.minimum,
          centerZoomBounds.maximum,
        )
        : 1;
      const centered = cameraCenterForWorldPoint(
        point,
        battlefield.worldBounds,
        yaw.current,
        centerPanProgress,
      );
      target.current.set(centered.x, 0, centered.z);
    };
    bridgeRef.current.zoomByFactor = (factor) => {
      if (!(camera instanceof OrthographicCamera)) return;
      const nextZoom = clampedCameraZoom(camera.zoom, factor, cameraZoomBounds({
        size,
        worldBounds: battlefield.worldBounds,
        yaw: yaw.current,
        overviewPaddingCells: battlefield.cameraPreset.overviewPaddingCells,
        maximumZoom: battlefield.cameraPreset.maximumZoom,
      }));
      if (nextZoom === camera.zoom) return;
      camera.zoom = nextZoom;
      camera.updateProjectionMatrix();
    };
    bridgeRef.current.zoomBy = (deltaY, deltaMode) => {
      bridgeRef.current.zoomByFactor(wheelZoomFactor(deltaY, deltaMode));
    };
    const speed = 8 * delta;
    if (keys.current.has("arrowleft")) target.current.x -= speed;
    if (keys.current.has("arrowright")) target.current.x += speed;
    if (keys.current.has("arrowup")) target.current.z -= speed;
    if (keys.current.has("arrowdown")) target.current.z += speed;
    const clampedTarget = clampCameraTarget(
      target.current,
      battlefield.worldBounds,
      yaw.current,
      currentPanProgress,
    );
    target.current.x = clampedTarget.x;
    target.current.z = clampedTarget.z;
    shakeEnergy.current = Math.max(0, shakeEnergy.current - delta * 1.9);
    const shakeX = Math.sin(shakePhase.current + shakeEnergy.current * 43) * shakeEnergy.current * 0.24;
    const shakeY = Math.cos(shakePhase.current * 1.7 + shakeEnergy.current * 37) * shakeEnergy.current * 0.13;
    camera.position.set(
      target.current.x + Math.sin(yaw.current) * BATTLE_CAMERA_GROUND_DISTANCE + shakeX,
      BATTLE_CAMERA_HEIGHT + shakeY,
      target.current.z + Math.cos(yaw.current) * BATTLE_CAMERA_GROUND_DISTANCE - shakeX * 0.45,
    );
    camera.lookAt(target.current);
    camera.updateMatrixWorld();
    viewReportDelay.current += delta;
    if (
      onViewChange
      && camera instanceof OrthographicCamera
      && viewReportDelay.current >= 0.08
    ) {
      viewReportDelay.current = 0;
      const view = {
        center: { x: target.current.x, z: target.current.z },
        width: size.width / camera.zoom,
        height: size.height / camera.zoom,
        yaw: yaw.current,
      };
      const signature = [
        view.center.x.toFixed(2),
        view.center.z.toFixed(2),
        view.width.toFixed(2),
        view.height.toFixed(2),
        view.yaw.toFixed(2),
      ].join(":");
      if (signature !== lastViewSignature.current) {
        lastViewSignature.current = signature;
        onViewChange(view);
      }
    }
  });
  return null;
}

export function normalizedPanProgress(
  zoom: number,
  minimumZoom: number,
  maximumZoom: number,
): number {
  if (zoom <= minimumZoom || maximumZoom <= minimumZoom) return 0;
  const maximumTravel = 1 - minimumZoom / maximumZoom;
  return MathUtils.clamp((1 - minimumZoom / zoom) / maximumTravel, 0, 1);
}
