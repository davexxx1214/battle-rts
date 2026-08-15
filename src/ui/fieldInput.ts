interface ClosestTarget {
  closest?: (selector: string) => unknown;
}

export function shouldStartFieldPointerInteraction(
  button: number,
  target: ClosestTarget | null,
): boolean {
  if (button !== 0) return false;
  return !target?.closest?.(
    "button, a, input, select, textarea, [role='button'], [data-field-ui]",
  );
}
