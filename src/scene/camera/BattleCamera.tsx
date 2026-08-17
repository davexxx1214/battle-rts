import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils, OrthographicCamera, Vector3 } from "three";
import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { BATTLEFIELD_WORLD_BOUNDS } from "../../map/battlefield";
import type { CameraViewSnapshot } from "./cameraViewStore";
import { clampCameraTarget, screenPanWorldDelta } from "./cameraPan";
import type { SceneInteractionBridge } from "../sceneInteractionBridge";

const CAMERA_HEIGHT = 18;
const CAMERA_GROUND_DISTANCE = 25;

export interface CameraShakeImpulse {
  readonly sequence: number;
  readonly intensity: number;
}

export function BattleCamera({
  resetToken,
  shake,
  onViewChange,
  bridgeRef,
}: {
  readonly resetToken: number;
  readonly shake: CameraShakeImpulse | null;
  readonly onViewChange?: (view: CameraViewSnapshot) => void;
  readonly bridgeRef: MutableRefObject<SceneInteractionBridge>;
}) {
  const { camera, size } = useThree();
  const compactViewport = Math.min(size.width, size.height) <= 520;
  const target = useRef(new Vector3(0, 0, 0));
  const keys = useRef(new Set<string>());
  const yaw = useRef(0.68);
  const orbiting = useRef(false);
  const lastPointerX = useRef(0);
  const shakeEnergy = useRef(0);
  const shakePhase = useRef(0);
  const viewReportDelay = useRef(0);
  const lastViewSignature = useRef("");

  useEffect(() => {
    target.current.set(0, 0, 0);
    yaw.current = 0.68;
    shakeEnergy.current = 0;
    if (camera instanceof OrthographicCamera) {
      camera.zoom = compactViewport ? 13 : 32;
      camera.updateProjectionMatrix();
    }
    viewReportDelay.current = 0.1;
    lastViewSignature.current = "";
  }, [camera, compactViewport, resetToken]);

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
    bridgeRef.current.panByScreenDelta = (deltaX, deltaY) => {
      const worldDelta = screenPanWorldDelta(
        deltaX,
        deltaY,
        yaw.current,
        camera instanceof OrthographicCamera ? camera.zoom : 1,
        CAMERA_HEIGHT,
        CAMERA_GROUND_DISTANCE,
      );
      target.current.x += worldDelta.x;
      target.current.z += worldDelta.z;
    };
    const speed = 8 * delta;
    if (keys.current.has("arrowleft")) target.current.x -= speed;
    if (keys.current.has("arrowright")) target.current.x += speed;
    if (keys.current.has("arrowup")) target.current.z -= speed;
    if (keys.current.has("arrowdown")) target.current.z += speed;
    const panProgress = camera instanceof OrthographicCamera
      ? normalizedPanProgress(camera.zoom, compactViewport ? 11 : 22, 56)
      : 1;
    const clampedTarget = clampCameraTarget(
      target.current,
      BATTLEFIELD_WORLD_BOUNDS,
      yaw.current,
      panProgress,
    );
    target.current.x = clampedTarget.x;
    target.current.z = clampedTarget.z;
    shakeEnergy.current = Math.max(0, shakeEnergy.current - delta * 1.9);
    const shakeX = Math.sin(shakePhase.current + shakeEnergy.current * 43) * shakeEnergy.current * 0.24;
    const shakeY = Math.cos(shakePhase.current * 1.7 + shakeEnergy.current * 37) * shakeEnergy.current * 0.13;
    camera.position.set(
      target.current.x + Math.sin(yaw.current) * 25 + shakeX,
      CAMERA_HEIGHT + shakeY,
      target.current.z + Math.cos(yaw.current) * CAMERA_GROUND_DISTANCE - shakeX * 0.45,
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
