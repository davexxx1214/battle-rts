# Battle action sound effects

These WAV files provide a deliberately minimal combat mix: bow releases, catapult
launches, and catapult stone impacts. Arrow impacts, melee, magic, hurt, death,
structure, castle-activation, ambience, command, horn, and background-music sounds
are not kept in this directory. The generated catapult effects are limited to one
or two seconds.

Bow attacks use the project-provided `draw-bow.wav` file.

The effects were generated specifically for Ironfield RTS with Fal model
`sonilo/v1.1/text-to-sound-effects`. They are not represented as CC0 assets. Fal
describes the model output as commercial-use-safe; use remains subject to Fal's
terms, applicable law, and project-specific legal review.

Runtime mappings, probability, gain variation, and concurrency limits live in
`src/audio/battleAudio.ts`. SHA-256 checksums are validated by
`scripts/check-audio-assets.mjs`. Generation prompts, model request IDs, requested
durations, and checksums for the new additions are recorded in
`audio/combat-sfx.provenance.json`.
