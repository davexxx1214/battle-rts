import { Object3D, Quaternion } from "three";

export function shouldShowUnitHealthBar(health: number, maxHealth: number): boolean {
  return Number.isFinite(health)
    && Number.isFinite(maxHealth)
    && maxHealth > 0
    && health > 0
    && health < maxHealth;
}

export function faceHealthBarToCamera(
  healthBar: Object3D,
  camera: Object3D,
  parentWorldRotation: Quaternion,
  cameraWorldRotation: Quaternion,
): void {
  camera.getWorldQuaternion(cameraWorldRotation);
  const parent = healthBar.parent;
  if (!parent) {
    healthBar.quaternion.copy(cameraWorldRotation);
    return;
  }
  parent.getWorldQuaternion(parentWorldRotation);
  healthBar.quaternion
    .copy(parentWorldRotation)
    .invert()
    .multiply(cameraWorldRotation);
}
