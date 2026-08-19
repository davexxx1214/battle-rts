import type { GameMode } from "../app/gameMode";
import styles from "./GameModeSelector.module.css";

const GAME_MODES = [
  { mode: "campaign", label: "战役模式" },
  { mode: "normal", label: "自由对战" },
  { mode: "arena", label: "竞技场模式" },
] as const satisfies readonly { readonly mode: GameMode; readonly label: string }[];

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
          aria-pressed={option.mode === mode}
          onClick={() => onChange(option.mode)}
          key={option.mode}
        >
          {option.label}
        </button>
      ))}
    </nav>
  );
}
