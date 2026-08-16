import {
  AI_DIFFICULTIES,
  type AiDifficulty,
} from "../game/rules";
import styles from "./AiDifficultySelector.module.css";

const DIFFICULTY_LABELS = {
  easy: "简单",
  normal: "普通",
  hard: "困难",
} as const satisfies Readonly<Record<AiDifficulty, string>>;

export function AiDifficultySelector({
  difficulty,
  disabled = false,
  onChange,
}: {
  readonly difficulty: AiDifficulty;
  readonly disabled?: boolean;
  readonly onChange: (difficulty: AiDifficulty) => void;
}) {
  return (
    <nav
      className={styles.selector}
      data-locked={disabled}
      aria-label="对手难度"
      aria-disabled={disabled}
    >
      {AI_DIFFICULTIES.map((option) => (
        <button
          className={styles.option}
          data-active={option === difficulty}
          type="button"
          aria-pressed={option === difficulty}
          disabled={disabled}
          onClick={() => onChange(option)}
          key={option}
        >
          {DIFFICULTY_LABELS[option]}
        </button>
      ))}
    </nav>
  );
}
