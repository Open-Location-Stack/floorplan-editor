import { describe, expect, it, vi } from "vitest";
import { getRuntimeConfig } from "./runtimeConfig";

describe("runtimeConfig", () => {
  it("returns an error if key is missing", () => {
    vi.stubEnv("VITE_MAPTILER_API_KEY", "");

    const result = getRuntimeConfig();

    expect(result.ok).toBe(false);
  });

  it("returns config if key exists", () => {
    vi.stubEnv("VITE_MAPTILER_API_KEY", "abc123");

    const result = getRuntimeConfig();

    expect(result).toEqual({
      ok: true,
      config: {
        maptilerApiKey: "abc123",
      },
    });
  });
});
