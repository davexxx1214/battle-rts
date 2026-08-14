export interface ObjectPoolAssignment<T> {
  readonly key: string;
  readonly index: number;
  readonly value: T;
}

interface ObjectPoolSlot<T> {
  key: string | null;
  readonly value: T;
}

export class FixedObjectPool<T> {
  readonly #slots: ObjectPoolSlot<T>[];
  readonly #reset: (value: T) => void;

  constructor(capacity: number, create: () => T, reset: (value: T) => void) {
    this.#slots = Array.from(
      { length: Math.max(0, Math.floor(capacity)) },
      () => ({ key: null, value: create() }),
    );
    this.#reset = reset;
  }

  sync(keys: readonly string[]): ObjectPoolAssignment<T>[] {
    const requested = [...new Set(keys)];
    const requestedSet = new Set(requested);
    for (const slot of this.#slots) {
      if (slot.key === null || requestedSet.has(slot.key)) continue;
      this.#reset(slot.value);
      slot.key = null;
    }
    for (const key of requested) {
      if (this.#slots.some((slot) => slot.key === key)) continue;
      const available = this.#slots.find((slot) => slot.key === null);
      if (!available) break;
      available.key = key;
    }
    return requested.flatMap((key) => {
      const index = this.#slots.findIndex((slot) => slot.key === key);
      if (index < 0) return [];
      return [{ key, index, value: this.#slots[index]!.value }];
    });
  }
}
