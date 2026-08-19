import {
  BATTLE_RACES,
  BATTLE_RACE_LABELS,
} from "../game/factions";
import type { BattleRace, Faction, FactionRaces } from "../game/types";
import styles from "./FactionRaceSelector.module.css";

const FACTION_LABELS = {
  verdant: "我方",
  crimson: "敌方",
} as const satisfies Readonly<Record<Faction, string>>;

export function FactionRaceSelector({
  disabled = false,
  factionRaces,
  onChange,
}: {
  readonly disabled?: boolean;
  readonly factionRaces: FactionRaces;
  readonly onChange: (faction: Faction, race: BattleRace) => void;
}) {
  return (
    <section className={styles.selector} aria-label="双方种族">
      {(["verdant", "crimson"] as const).map((faction) => (
        <div className={styles.side} data-faction={faction} key={faction}>
          <span>{FACTION_LABELS[faction]}</span>
          <div role="group" aria-label={`${FACTION_LABELS[faction]}种族`}>
            {BATTLE_RACES.map((race) => (
              <button
                aria-pressed={factionRaces[faction] === race}
                className={styles.option}
                data-active={factionRaces[faction] === race}
                disabled={disabled}
                key={race}
                onClick={() => onChange(faction, race)}
                type="button"
              >
                {BATTLE_RACE_LABELS[race]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
