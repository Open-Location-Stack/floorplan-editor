import { describe, expect, it } from "vitest";
import {
  convertArea,
  convertLength,
  featureAreaSquareMeters,
  featureLengthMeters,
} from "./measurements";

describe("measurements", () => {
  it("converts length and area deterministically", () => {
    expect(convertLength(10, "m")).toBe(10);
    expect(convertLength(10, "ft")).toBe(32.81);
    expect(convertArea(10, "m2")).toBe(10);
    expect(convertArea(10, "ft2")).toBe(107.64);
  });

  it("calculates line length", () => {
    const feature = {
      type: "Feature" as const,
      id: "a",
      geometry: {
        type: "LineString" as const,
        coordinates: [[0, 0] as [number, number], [0, 0.001] as [number, number]],
      },
      properties: {
        kind: "path",
      },
    };

    expect(featureLengthMeters(feature)).toBeGreaterThan(100);
  });

  it("calculates polygon area", () => {
    const feature = {
      type: "Feature" as const,
      id: "b",
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [0, 0] as [number, number],
            [0.001, 0] as [number, number],
            [0.001, 0.001] as [number, number],
            [0, 0.001] as [number, number],
            [0, 0] as [number, number],
          ],
        ],
      },
      properties: {
        kind: "unit",
      },
    };

    expect(featureAreaSquareMeters(feature)).toBeGreaterThan(10000);
  });
});
