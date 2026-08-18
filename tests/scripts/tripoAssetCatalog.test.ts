import { describe, expect, it } from "vitest";

// @ts-expect-error The generation catalog is an executable Node.js module.
import { TRIPO_ASSETS, readTripoKey, validateTripoMediaUrl } from "../../scripts/tripo-asset-catalog.mjs";
import { MOBILE_CATAPULT_PARTS } from "../../src/scene/assets";

describe("Tripo asset generation catalog", () => {
  it("keeps the mobile catapult editable, simply segmented and textured after H3.1 generation", () => {
    const catapult = TRIPO_ASSETS.find(({ id }: { id: string }) => id === "mobile-catapult");

    expect(catapult?.request).toMatchObject({
      model: "v3.1-20260211",
      face_limit: 6000,
      smart_low_poly: true,
      generate_parts: true,
      texture: false,
      pbr: false,
      quad: false,
    });
    expect(catapult?.postprocess).toEqual({
      endpoint: "mesh/segment",
      request: {
        model: "v2.0-20260430",
        segmentation_granularity: "simple",
        split_by_connectivity: false,
      },
    });
    expect(catapult?.texture).toEqual({
      endpoint: "models/texture",
      request: {
        model: "v3.0-20250812",
        texture_prompt: {
          text: expect.stringContaining("warm medium oak"),
        },
        pbr: false,
        texture_quality: "standard",
        texture_alignment: "geometry",
        bake: true,
      },
    });
    expect(catapult?.runtime).toMatchObject({
      sourceStage: "texture",
      path: "runtime/mobile-catapult.glb",
    });
    expect(catapult?.runtime.partContracts.map(({ node }: { node: string }) => node)).toEqual([
      MOBILE_CATAPULT_PARTS.throwingArm,
      ...MOBILE_CATAPULT_PARTS.wheels,
    ]);
    expect(catapult?.runtime.partContracts[0]).toMatchObject({
      semantic: "throwing-arm",
      node: MOBILE_CATAPULT_PARTS.throwingArm,
    });
  });

  it("keeps only runtime models in use plus the reserved frost bone dragon", () => {
    expect(TRIPO_ASSETS.map(({ id }: { id: string }) => id)).toEqual([
      "mobile-catapult",
      "undead-shipwreck",
      "undead-frost-bone-dragon",
    ]);
    const undeadAssets = TRIPO_ASSETS.filter(({ id }: { id: string }) => id.startsWith("undead-"));

    expect(undeadAssets.map(({ id }: { id: string }) => id)).toEqual([
      "undead-shipwreck",
      "undead-frost-bone-dragon",
    ]);
    expect(undeadAssets.every(({ request, runtime }: {
      request: { model: string; texture: boolean; pbr: boolean; prompt: string };
      runtime: { sourceStage: string; path: string };
    }) => (
      request.model === "P1-20260311"
      && request.texture
      && !request.pbr
      && request.prompt.includes("KayKit-inspired")
      && runtime.sourceStage === "generation"
      && runtime.path.startsWith("runtime/undead-")
    ))).toBe(true);
  });

  it("reads a quoted key without exposing any unrelated config values", () => {
    const config = [
      "fal_key: do-not-return",
      "tripo_key: 'test-tripo-key'",
      "remote_host: example.test",
    ].join("\n");

    expect(readTripoKey(config)).toBe("test-tripo-key");
  });

  it("only accepts HTTPS media URLs returned from Tripo domains", () => {
    expect(validateTripoMediaUrl("https://cdn.tripo3d.ai/output/model.glb").hostname)
      .toBe("cdn.tripo3d.ai");
    expect(validateTripoMediaUrl("https://tripo-data.rg1.data.tripo3d.com/output/model.glb").hostname)
      .toBe("tripo-data.rg1.data.tripo3d.com");
    expect(() => validateTripoMediaUrl("http://cdn.tripo3d.ai/output/model.glb"))
      .toThrow(/HTTPS/);
    expect(() => validateTripoMediaUrl("https://example.test/model.glb"))
      .toThrow(/Tripo/);
  });
});
