import type { GameMode } from "../app/gameMode";
import styles from "./GameModeSelector.module.css";

const GAME_MODES = [
  { mode: "campaign", label: "战役模式", shortLabel: "战役" },
  { mode: "normal", label: "自由对战", shortLabel: "自由" },
  { mode: "arena", label: "竞技场模式", shortLabel: "竞技" },
] as const satisfies readonly {
  readonly mode: GameMode;
  readonly label: string;
  readonly shortLabel: string;
}[];

export function GameModeSelector({
  mode,
  onChange,
}: {
  readonly mode: GameMode;
  readonly onChange: (mode: GameMode) => void;
}) {
  return (
    <nav className={styles.selector} aria-label="游戏模式">
      {GAME_MODES.map((option) => (
        <button
          className={styles.option}
          data-active={option.mode === mode}
          type="button"
          aria-label={option.label}
          aria-pressed={option.mode === mode}
          onClick={() => onChange(option.mode)}
          key={option.mode}
        >
          <span className={styles.fullLabel}>{option.label}</span>
          <span className={styles.shortLabel} aria-hidden="true">{option.shortLabel}</span>
        </button>
      ))}
    </nav>
  );
}
