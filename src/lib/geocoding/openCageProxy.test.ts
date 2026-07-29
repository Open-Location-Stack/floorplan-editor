import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "../../../functions/api/geocode";

describe("OpenCage Pages Function", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the server-side key out of the client request", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ results: [] }, { headers: { "content-type": "application/json" } }),
    );

    const response = await onRequestGet({
      request: new Request("https://example.com/api/geocode?q=Dam+Square&limit=3"),
      env: { OPENCAGE_API_KEY: "server-only-key" },
    });

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.opencagedata.com/geocode/v1/json?q=Dam+Square&key=server-only-key&no_annotations=1&limit=3",
    );
  });

  it("rejects a key supplied by the browser", async () => {
    const response = await onRequestGet({
      request: new Request("https://example.com/api/geocode?q=Dam&key=client-key"),
      env: { OPENCAGE_API_KEY: "server-only-key" },
    });

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed when the server-side secret is missing", async () => {
    const response = await onRequestGet({
      request: new Request("https://example.com/api/geocode?q=Dam"),
      env: {},
    });

    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
});
