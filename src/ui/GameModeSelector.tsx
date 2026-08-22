import type { GameMode } from "../app/gameMode";
import styles from "./GameModeSelector.module.css";

const GAME_MODES = [
  { mode: "campaign", label: "战役模式", shortLabel: "战役" },
  { mode: "normal", label: "自由对战", shortLabel: "自由" },
  { mode: "sandbox", label: "沙盒模式", shortLabel: "沙盒" },
] as const satisfies readonly {
  readonly mode: GameMode;
  readonly label: string;
  readonly shortLabel: string;
}[];

export function GameModeSelector({
  mode,
  onChange,
  compactOnPortrait = false,
}: {
  readonly mode: GameMode;
  readonly onChange: (mode: GameMode) => void;
  readonly compactOnPortrait?: boolean;
}) {
  return (
    <nav
      className={styles.selector}
      data-compact-on-portrait={compactOnPortrait}
      aria-label="游戏模式"
    >
      <select
        className={styles.mobileSelect}
        value={mode}
        aria-label="切换游戏模式"
        onChange={(event) => onChange(event.currentTarget.value as GameMode)}
      >
        {GAME_MODES.map((option) => (
          <option value={option.mode} key={option.mode}>
            {option.shortLabel}
          </option>
        ))}
      </select>
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
