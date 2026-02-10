import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchOpenCage } from "./openCage";

describe("searchOpenCage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns no results for an empty query", async () => {
    const results = await searchOpenCage("   ", "key");

    expect(results).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns normalized search results", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              formatted: "Dam Square, Amsterdam, Netherlands",
              geometry: {
                lat: 52.373056,
                lng: 4.892222,
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const results = await searchOpenCage("Dam Square", "my-key", {
      limit: 3,
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://api.opencagedata.com/geocode/v1/json?q=Dam+Square&key=my-key&no_annotations=1&limit=3",
      ),
      {},
    );
    expect(results).toEqual([
      {
        id: "0:4.892222,52.373056",
        formatted: "Dam Square, Amsterdam, Netherlands",
        coordinates: [4.892222, 52.373056],
      },
    ]);
  });

  it("filters malformed results", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              formatted: "Valid result",
              geometry: { lat: 52.1, lng: 4.3 },
            },
            {
              formatted: "",
              geometry: { lat: 52.2, lng: 4.4 },
            },
            {
              formatted: "Missing coordinates",
              geometry: { lat: "bad", lng: 4.4 },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const results = await searchOpenCage("query", "my-key");

    expect(results).toEqual([
      {
        id: "0:4.300000,52.100000",
        formatted: "Valid result",
        coordinates: [4.3, 52.1],
      },
    ]);
  });

  it("throws on non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("not allowed", { status: 401 }));

    await expect(searchOpenCage("query", "bad-key")).rejects.toThrow(
      "OpenCage request failed with status 401.",
    );
  });
});
