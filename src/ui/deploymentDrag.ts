import type { FieldPoint } from "./fieldInput";

export const DEPLOYMENT_DRAG_THRESHOLD_PX = 9;
const HORIZONTAL_SCROLL_BIAS = 1.15;

export type DeploymentGestureIntent = "pending" | "drag" | "scroll";

export function deploymentGestureIntent(
  start: FieldPoint,
  current: FieldPoint,
): DeploymentGestureIntent {
  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance < DEPLOYMENT_DRAG_THRESHOLD_PX) return "pending";
  if (Math.abs(deltaX) > Math.abs(deltaY) * HORIZONTAL_SCROLL_BIAS) {
    return "scroll";
  }
  return "drag";
}
