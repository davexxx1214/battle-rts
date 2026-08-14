export const TRIPO_ASSETS = [
  {
    id: "mobile-catapult",
    label: "移动式投石车",
    modelFamily: "H3.1",
    runtime: {
      sourceStage: "texture",
      path: "runtime/mobile-catapult.glb",
      partContracts: [
        {
          semantic: "throwing-arm",
          node: "tripo_part_3",
          localSizeMin: [0.13, 0.52, 0.62],
          localSizeMax: [0.17, 0.62, 0.72],
          pivotCenterAbsMax: [0.02, 0.04, 0.1],
        },
        {
          semantic: "left-wheel",
          node: "tripo_part_1",
          localSizeMin: [0.09, 0.24, 0.24],
          localSizeMax: [0.12, 0.29, 0.29],
          pivotCenterAbsMax: [0.02, 0.03, 0.02],
        },
        {
          semantic: "right-wheel",
          node: "tripo_part_2",
          localSizeMin: [0.09, 0.24, 0.24],
          localSizeMax: [0.12, 0.29, 0.29],
          pivotCenterAbsMax: [0.02, 0.03, 0.02],
        },
        {
          semantic: "rear-wheel",
          node: "tripo_part_5",
          localSizeMin: [0.06, 0.19, 0.19],
          localSizeMax: [0.09, 0.25, 0.25],
          pivotCenterAbsMax: [0.02, 0.06, 0.04],
        },
      ],
    },
    request: {
      prompt: [
        "Game-ready low-poly medieval mobile counterweight catapult,",
        "a standalone four-wheeled siege engine with a heavy oak chassis,",
        "chunky wooden wheels, reinforced A-frame supports, a long throwing arm,",
        "a visible rope sling with a small leather pouch, and a rear stone counterweight box.",
        "KayKit-inspired stylized proportions, readable silhouette from an isometric RTS camera,",
        "clean flat shapes, centered at world origin, arm lowered in a neutral loading pose,",
        "no people, no terrain, no fortress, no tower, no surrounding props.",
        "Keep chassis, wheels, throwing arm, sling pouch, counterweight and projectile separable.",
      ].join(" "),
      model: "v3.1-20260211",
      negative_prompt: "fixed tower, building, characters, scenery, text, photorealistic, fused moving parts, broken mesh, extra wheels",
      face_limit: 6000,
      smart_low_poly: true,
      generate_parts: true,
      texture: false,
      pbr: false,
      quad: false,
      auto_size: true,
      export_uv: true,
    },
    postprocess: {
      endpoint: "mesh/segment",
      request: {
        model: "v2.0-20260430",
        segmentation_granularity: "simple",
        split_by_connectivity: false,
      },
    },
    texture: {
      endpoint: "models/texture",
      request: {
        model: "v3.0-20250812",
        texture_prompt: {
          text: [
            "Stylized low-poly medieval siege engine matching KayKit Medieval Hex:",
            "warm medium oak frame, pale wood wheels and throwing arm,",
            "muted gray iron bands and axle, coarse beige rope sling,",
            "dark brown leather pouch, desaturated stone counterweight,",
            "clean flat colors, minimal wear, no photorealism.",
          ].join(" "),
        },
        pbr: false,
        texture_quality: "standard",
        texture_alignment: "geometry",
        bake: true,
      },
    },
  },
  {
    id: "siege-workshop",
    label: "攻城工坊",
    modelFamily: "P1",
    runtime: {
      sourceStage: "generation",
      path: "runtime/siege-workshop.glb",
    },
    request: {
      prompt: [
        "Game-ready low-poly medieval siege workshop building,",
        "visually distinct from a blacksmith and barracks, with a broad heavy timber frame,",
        "low stone foundation, open front construction bay, simple asymmetric gabled roof,",
        "stacked siege beams, rope coils and one oversized wooden gear integrated into the facade.",
        "KayKit Medieval Hex inspired stylized proportions, chunky readable silhouette for an RTS,",
        "warm ochre wood, dark brown roof and muted stone, clean flat color texture,",
        "isolated complete building, no people, no terrain tile, no smoke, no text.",
      ].join(" "),
      model: "P1-20260311",
      face_limit: 5000,
      texture: true,
      pbr: false,
      texture_quality: "standard",
      auto_size: true,
      export_uv: true,
    },
  },
];

export { readTripoKey, validateTripoMediaUrl } from "./tripo-provider.mjs";
