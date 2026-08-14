import { describe, expect, it } from "vitest";

// @ts-expect-error The generation helpers are executable Node.js modules.
import { apiData, canResumeTask, mediaExtension, successfulTaskMedia, textureArtifactStem, totalCreditsForEntry, validatedTripoRedirectUrl } from "../../scripts/tripo-generation.mjs";

describe("Tripo generation helpers", () => {
  it("unwraps successful API payloads and reports vendor errors", () => {
    expect(apiData({ code: 0, data: { task_id: "task-1" } })).toEqual({ task_id: "task-1" });
    expect(() => apiData({ code: 2010, message: "Insufficient credits" }))
      .toThrow(/Insufficient credits/);
  });

  it("requires successful tasks to contain a Tripo model URL", () => {
    expect(successfulTaskMedia({
      status: "success",
      output: {
        model_url: "https://cdn.tripo3d.ai/output/model.glb",
        rendered_image_url: "https://cdn.tripo3d.ai/output/preview.png",
      },
    })).toEqual({
      modelUrl: "https://cdn.tripo3d.ai/output/model.glb",
      previewUrl: "https://cdn.tripo3d.ai/output/preview.png",
    });
    expect(() => successfulTaskMedia({ status: "failed", output: {} })).toThrow(/failed/);
    expect(() => successfulTaskMedia({ status: "success", output: {} })).toThrow(/model URL/);
  });

  it("keeps only supported local media extensions", () => {
    expect(mediaExtension("https://cdn.tripo3d.ai/output/model.glb", ".glb")).toBe(".glb");
    expect(mediaExtension("https://cdn.tripo3d.ai/output/no-extension", ".png")).toBe(".png");
    expect(mediaExtension("https://cdn.tripo3d.ai/output/model.exe", ".glb")).toBe(".glb");
  });

  it("resumes a successful task when only the local download failed", () => {
    expect(canResumeTask({ taskId: "task-1", status: "success" })).toBe(true);
    expect(canResumeTask({ taskId: "task-1", status: "running" })).toBe(true);
    expect(canResumeTask({ taskId: "task-1", status: "failed" })).toBe(false);
    expect(canResumeTask({ taskId: null, status: "success" })).toBe(false);
  });

  it("derives a stable, path-safe texture artifact name from its segmented input", () => {
    expect(textureArtifactStem(
      "mobile-catapult/segmented-simple-semantic.glb",
      "fe41d875-f385-4db7-b9c2-501f7a1ec3a9",
    )).toBe("textured-simple-semantic-fe41d875");
    expect(textureArtifactStem("../segmented-odd name.glb", "task_ABC"))
      .toBe("textured-odd-name-task-ABC");
  });

  it("keeps every download redirect on an official Tripo HTTPS host", () => {
    expect(validatedTripoRedirectUrl(
      "https://cdn.tripo3d.ai/output/model.glb",
      "/signed/model.glb",
    ).href).toBe("https://cdn.tripo3d.ai/signed/model.glb");
    expect(() => validatedTripoRedirectUrl(
      "https://cdn.tripo3d.ai/output/model.glb",
      "https://example.test/model.glb",
    )).toThrow(/Tripo/);
  });

  it("counts archived generation and stage attempts without losing credits", () => {
    expect(totalCreditsForEntry({
      creditsConsumed: 40,
      postprocess: { creditsConsumed: 40 },
      texture: { creditsConsumed: 10 },
      postprocessHistory: [{ creditsConsumed: 40 }],
      generationHistory: [{
        creditsConsumed: 40,
        textureHistory: [{ creditsConsumed: 10 }],
      }],
    })).toBe(180);
  });
});
