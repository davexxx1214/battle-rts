export const sounds = [
  {
    id: "sword_swing_01",
    duration: 1,
    prompt: "Isolated medieval one-handed sword fast swing, crisp steel blade whoosh, aggressive close combat, dry studio sound, no impact, no voice, no ambience, no music",
  },
  {
    id: "sword_swing_02",
    duration: 1,
    prompt: "Isolated medieval sword broad slashing swing, heavier steel blade air movement, sharp and forceful, dry close-mic sound, no impact, no voice, no ambience, no music",
  },
  {
    id: "sword_hit_armor_01",
    duration: 1,
    prompt: "Single medieval sword strike hitting plate armor, hard metallic clang with short low body impact, dry close sound, no swing, no voice, no ambience, no music",
  },
  {
    id: "sword_hit_armor_02",
    duration: 1,
    prompt: "Single steel sword impact against chainmail and leather armor, compact metallic scrape and blunt thud, dry close sound, no swing, no voice, no ambience, no music",
  },
  {
    id: "shield_block_01",
    duration: 1,
    prompt: "Single sword blocked by a round wooden shield with iron rim, sharp metal clack and solid wood knock, dry close sound, no voice, no ambience, no music",
  },
  {
    id: "shield_block_02",
    duration: 1,
    prompt: "Heavy weapon impact stopped by a medieval shield, deep wood thump with brief iron ring, isolated dry studio sound, no voice, no ambience, no music",
  },
  {
    id: "bow_release_01",
    duration: 1,
    prompt: "Single medieval longbow arrow release, tight bowstring snap followed by a very short arrow whistle, isolated close sound, no impact, no ambience, no music",
  },
  {
    id: "bow_release_02",
    duration: 1,
    prompt: "Single powerful longbow shot, taut string twang and quick arrow flight whoosh, clean dry close sound, no impact, no voice, no ambience, no music",
  },
  {
    id: "arrow_impact_01",
    duration: 1,
    prompt: "Single medieval arrow striking a wooden shield, sharp wooden thunk with tiny shaft vibration, isolated dry close sound, no flight, no voice, no ambience, no music",
  },
  {
    id: "arrow_impact_02",
    duration: 1,
    prompt: "Single arrow hitting leather and light metal armor, compact piercing thud with small metal tick, isolated dry sound, no flight, no voice, no ambience, no music",
  },
  {
    id: "mage_cast_01",
    duration: 2,
    prompt: "Short fantasy battle mage spell cast, magical energy gathering into a bright crystalline launch, controlled arcane crackle, isolated dry effect, no explosion, no voice, no ambience, no music",
  },
  {
    id: "mage_cast_02",
    duration: 2,
    prompt: "Short dark-blue arcane projectile cast, quick rising energy swirl and forceful magical release, isolated game sound effect, no impact, no voice, no ambience, no music",
  },
  {
    id: "mage_impact_01",
    duration: 2,
    prompt: "Compact fantasy magic projectile impact, bright arcane burst with crystalline crack and low magical boom, fast decay, isolated game sound, no voice, no ambience, no music",
  },
  {
    id: "mage_impact_02",
    duration: 2,
    prompt: "Compact blue magic explosion on stone and armor, energetic electric crackle with short bass impact, fast decay, isolated sound effect, no voice, no ambience, no music",
  },
  {
    id: "unit_hurt_armor_01",
    duration: 1,
    prompt: "Single armored fighter taking a hit, brief nonverbal male pain grunt with leather and armor jolt, restrained and game-ready, no words, no ambience, no music",
  },
  {
    id: "unit_hurt_armor_02",
    duration: 1,
    prompt: "Single fantasy soldier hurt reaction, short nonverbal exertion grunt and compact armor rattle, dry close sound, no words, no ambience, no music",
  },
  {
    id: "unit_death_armor_01",
    duration: 2,
    prompt: "Armored medieval soldier collapsing onto firm ground, brief nonverbal final grunt, heavy body fall and armor clatter, isolated dry sound, no words, no ambience, no music",
  },
  {
    id: "unit_death_armor_02",
    duration: 2,
    prompt: "Fantasy warrior defeated, short nonverbal breath and body falling with shield and chainmail clatter, compact game-ready sound, no words, no ambience, no music",
  },
  {
    id: "command_move",
    duration: 1,
    prompt: "Short medieval strategy game move-command confirmation, subtle leather tap and wooden token click, precise and understated UI sound, no voice, no ambience, no music",
  },
  {
    id: "command_attack",
    duration: 1,
    prompt: "Short medieval strategy game attack-command confirmation, decisive steel click with compact low impact, urgent but not loud, no voice, no ambience, no music",
  },
  {
    id: "war_horn_victory",
    duration: 2,
    prompt: "One short medieval battlefield victory horn signal, two confident brass notes with natural outdoor tail, sound effect not a song, no crowd, no drums, no background music",
  },
  {
    id: "ambient_wind_loop",
    duration: 8,
    prompt: "Seamless quiet wind across an open medieval island battlefield, soft grass movement and distant airy gusts, restrained neutral ambience, no birds, no voices, no combat, no melody, no music",
  },
];

export const playbackCatalog = {
  version: 1,
  buses: {
    weapons: { maxConcurrent: 6 },
    projectiles: { maxConcurrent: 4 },
    magic: { maxConcurrent: 3 },
    reactions: { maxConcurrent: 3 },
    commands: { maxConcurrent: 2 },
    horns: { maxConcurrent: 1 },
    ambience: { maxConcurrent: 1 },
  },
  cues: {
    "knight.attack": {
      bus: "weapons",
      variants: ["sword_swing_01", "sword_swing_02"],
      gain: [0.72, 0.86],
      pitch: [0.96, 1.04],
    },
    "knight.impact": {
      bus: "weapons",
      variants: ["sword_hit_armor_01", "sword_hit_armor_02", "shield_block_01", "shield_block_02"],
      gain: [0.76, 0.92],
      pitch: [0.96, 1.04],
    },
    "ranger.attack": {
      bus: "projectiles",
      variants: ["bow_release_01", "bow_release_02"],
      gain: [0.7, 0.84],
      pitch: [0.97, 1.03],
    },
    "ranger.impact": {
      bus: "projectiles",
      variants: ["arrow_impact_01", "arrow_impact_02"],
      gain: [0.72, 0.88],
      pitch: [0.96, 1.04],
    },
    "mage.attack": {
      bus: "magic",
      variants: ["mage_cast_01", "mage_cast_02"],
      gain: [0.66, 0.8],
      pitch: [0.97, 1.03],
    },
    "mage.impact": {
      bus: "magic",
      variants: ["mage_impact_01", "mage_impact_02"],
      gain: [0.7, 0.86],
      pitch: [0.97, 1.03],
    },
    "unit.hurt": {
      bus: "reactions",
      variants: ["unit_hurt_armor_01", "unit_hurt_armor_02"],
      gain: [0.56, 0.7],
      pitch: [0.96, 1.04],
      probability: 0.28,
    },
    "unit.death": {
      bus: "reactions",
      variants: ["unit_death_armor_01", "unit_death_armor_02"],
      gain: [0.62, 0.76],
      pitch: [0.97, 1.03],
    },
    "command.move": {
      bus: "commands",
      variants: ["command_move"],
      gain: [0.7, 0.7],
      pitch: [1, 1],
    },
    "command.attack": {
      bus: "commands",
      variants: ["command_attack"],
      gain: [0.76, 0.76],
      pitch: [1, 1],
    },
    "building.gold": {
      bus: "magic",
      variants: ["mage_cast_01", "mage_cast_02"],
      gain: [0.24, 0.3],
      pitch: [1.34, 1.44],
    },
    "building.gold-wasted": {
      bus: "commands",
      variants: ["command_attack"],
      gain: [0.34, 0.38],
      pitch: [0.72, 0.78],
    },
    "building.spawn": {
      bus: "commands",
      variants: ["command_move"],
      gain: [0.5, 0.58],
      pitch: [1.08, 1.16],
    },
    "building.destroy": {
      bus: "reactions",
      variants: ["unit_death_armor_01", "unit_death_armor_02"],
      gain: [0.76, 0.86],
      pitch: [0.7, 0.78],
    },
    "castle.activate": {
      bus: "horns",
      variants: ["war_horn_victory"],
      gain: [0.7, 0.76],
      pitch: [0.86, 0.9],
    },
    "battle.victory": {
      bus: "horns",
      variants: ["war_horn_victory"],
      gain: [0.82, 0.82],
      pitch: [1, 1],
    },
    "ambience.wind": {
      bus: "ambience",
      variants: ["ambient_wind_loop"],
      gain: [0.1, 0.14],
      pitch: [1, 1],
      loop: true,
    },
  },
};

export function createPublicCueCatalog(entries = sounds.map(({ id }) => ({
  id,
  file: `${id}.wav`,
}))) {
  const soundIds = new Set(sounds.map(({ id }) => id));
  if (soundIds.size !== sounds.length) throw new Error("Sound catalog contains duplicate ids.");
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const referencedIds = new Set();
  const cues = {};
  for (const [cueName, cue] of Object.entries(playbackCatalog.cues)) {
    if (!playbackCatalog.buses[cue.bus]) {
      throw new Error(`${cueName}: cue references unknown bus ${cue.bus}.`);
    }
    cues[cueName] = {
      ...cue,
      variants: cue.variants.map((id) => {
        if (!soundIds.has(id)) throw new Error(`${cueName}: cue references unknown sound ${id}.`);
        const entry = entriesById.get(id);
        if (!entry) throw new Error(`${cueName}: generated entries omit sound ${id}.`);
        referencedIds.add(id);
        return entry.file;
      }),
    };
  }
  const unreferencedIds = sounds
    .map(({ id }) => id)
    .filter((id) => !referencedIds.has(id));
  if (unreferencedIds.length > 0) {
    throw new Error(`Playback catalog does not reference: ${unreferencedIds.join(", ")}.`);
  }
  return {
    version: playbackCatalog.version,
    buses: playbackCatalog.buses,
    cues,
  };
}
