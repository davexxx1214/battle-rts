# Ironfield battle sound effects

Generated with Fal model `sonilo/v1.1/text-to-sound-effects`. These files contain combat and command effects only; there is no background music.

## Event mapping

| Game event | Sound pool |
| --- | --- |
| Knight `attack-started` | `sword_swing_01`, `sword_swing_02` |
| Knight damage or blocked hit | `sword_hit_armor_01`, `sword_hit_armor_02`, `shield_block_01`, `shield_block_02` |
| Ranger `attack-started` | `bow_release_01`, `bow_release_02` |
| Ranger `projectile-hit` | `arrow_impact_01`, `arrow_impact_02` |
| Mage `attack-started` | `mage_cast_01`, `mage_cast_02` |
| Mage `projectile-hit` | `mage_impact_01`, `mage_impact_02` |
| Occasional `damage-applied` reaction | `unit_hurt_armor_01`, `unit_hurt_armor_02` |
| `unit-died` | `unit_death_armor_01`, `unit_death_armor_02` |
| Player move or attack command | `command_move`, `command_attack` |
| Victory | `war_horn_victory` |
| Quiet battlefield ambience | `ambient_wind_loop` |

Do not play a hurt reaction for every damage event in a large battle. Use probability and concurrency limits so the mix stays readable. The versioned `cues.json` file is the runtime contract for event mappings, gain ranges, and simultaneous limits.

`audio/battle-sfx.provenance.json` (outside the public asset directory) records the exact prompts, model, checksums, requested durations, filenames, and Fal request IDs. Regenerate missing or out-of-date files with:

See [`PROVENANCE.md`](./PROVENANCE.md) for the asset-origin and usage note.

```bash
pnpm generate:sfx
```

Pass `--force` to replace every existing sound:

```bash
pnpm generate:sfx -- --force
```
