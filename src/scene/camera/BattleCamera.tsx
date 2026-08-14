import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils, OrthographicCamera, Vector3 } from "three";
import { useEffect, useRef } from "react";

export interface CameraShakeImpulse {
  readonly sequence: number;
  readonly intensity: number;
}

export function BattleCamera({
  resetToken,
  shake,
}: {
  readonly resetToken: number;
  readonly shake: CameraShakeImpulse | null;
}) {
  const { camera } = useThree();
  const target = useRef(new Vector3(0, 0, 0));
  const keys = useRef(new Set<string>());
  const yaw = useRef(0.68);
  const orbiting = useRef(false);
  const lastPointerX = useRef(0);
  const shakeEnergy = useRef(0);
  const shakePhase = useRef(0);

  useEffect(() => {
    target.current.set(0, 0, 0);
    yaw.current = 0.68;
    shakeEnergy.current = 0;
    if (camera instanceof OrthographicCamera) {
      camera.zoom = 32;
      camera.updateProjectionMatrix();
    }
  }, [camera, resetToken]);

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
    const speed = 8 * delta;
    if (keys.current.has("arrowleft")) target.current.x -= speed;
    if (keys.current.has("arrowright")) target.current.x += speed;
    if (keys.current.has("arrowup")) target.current.z -= speed;
    if (keys.current.has("arrowdown")) target.current.z += speed;
    target.current.x = MathUtils.clamp(target.current.x, -11, 11);
    target.current.z = MathUtils.clamp(target.current.z, -9, 9);
    shakeEnergy.current = Math.max(0, shakeEnergy.current - delta * 1.9);
    const shakeX = Math.sin(shakePhase.current + shakeEnergy.current * 43) * shakeEnergy.current * 0.24;
    const shakeY = Math.cos(shakePhase.current * 1.7 + shakeEnergy.current * 37) * shakeEnergy.current * 0.13;
    camera.position.set(
      target.current.x + Math.sin(yaw.current) * 25 + shakeX,
      18 + shakeY,
      target.current.z + Math.cos(yaw.current) * 25 - shakeX * 0.45,
    );
    camera.lookAt(target.current);
    camera.updateMatrixWorld();
  });
  return null;
}
