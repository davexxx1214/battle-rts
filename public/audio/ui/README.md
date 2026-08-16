# Ironfield UI sound effects

The runtime uses three short MP3 files from [UI SFX](https://uisfx.com/) version `0.4.0`, using its `organic` sound pack.

| Game interaction | UI SFX cue | Runtime file |
| --- | --- | --- |
| Select a troop or building card | `hover` | `organic/hover.mp3` |
| Place a troop squad | `drop` | `organic/drop.mp3` |
| Place a building | `snap` | `organic/snap.mp3` |

Card selection uses the shorter, quieter `hover` texture at `0.25` gain, but still triggers only on click. `organic/select.mp3` remains in the checked-in source pack for integrity tracking, but it is not mapped, preloaded, or played by the runtime. Troop placement uses full UI gain; building placement retains the quieter mix.

The source repository is [romainsimon/uisfx](https://github.com/romainsimon/uisfx/tree/v0.4.0). UI SFX audio assets are released under CC0 1.0; see [`LICENSE-AUDIO`](./LICENSE-AUDIO).

## Integrity

| File | SHA-256 |
| --- | --- |
| `organic/hover.mp3` | `014EE5AA188437D8E9B498A010F761B92C2B9BCE8531622FBB1A2CDE4206F8BD` |
| `organic/select.mp3` | `7955C150979F41669701CDF6155E54EC3DEEA00F715E0847CE6EC55223EE74A2` |
| `organic/drop.mp3` | `1F86693B432F4F6748D936EC7835F2C4937A4ED014B7C1A77166028C2C7B661D` |
| `organic/snap.mp3` | `2F2FB677266F14289999EAAD3B58FB9C19A8F95A545D87FF2BC219C9513E244A` |
