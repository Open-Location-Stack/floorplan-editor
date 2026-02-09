import { describe, expect, it } from "vitest";
import { validateFloor } from "./validate";

describe("validateFloor", () => {
  it("reports missing IMDF properties", () => {
    const result = validateFloor("f1", [
      {
        type: "Feature",
        id: "shape-1",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
        properties: {
          kind: "unit",
          floorId: "f1",
        },
      },
    ]);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });
});
