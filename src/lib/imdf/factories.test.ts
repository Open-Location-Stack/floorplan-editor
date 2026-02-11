import { describe, expect, it } from "vitest";
import { cloneImdfFeature, createImdfFeature } from "./factories";

describe("imdf factories", () => {
  it("creates polygon feature for unit", () => {
    const feature = createImdfFeature({
      type: "unit",
      center: [5, 52],
      context: {
        buildingId: "b1",
        floorId: "f1",
      },
    });

    expect(feature.geometry.type).toBe("Polygon");
    expect(feature.properties.imdfType).toBe("unit");
    expect(feature.properties.floorId).toBe("f1");
  });

  it("creates line feature for opening", () => {
    const feature = createImdfFeature({
      type: "opening",
      center: [5, 52],
      context: {
        buildingId: "b1",
        floorId: "f1",
      },
    });

    expect(feature.geometry.type).toBe("LineString");
    expect(feature.properties.kind).toBe("opening");
  });

  it("clones with new id and shifted coordinates", () => {
    const source = createImdfFeature({
      type: "unit",
      center: [5, 52],
      context: {
        buildingId: "b1",
        floorId: "f1",
      },
    });

    const clone = cloneImdfFeature(source, {
      buildingId: "b1",
      floorId: "f1",
    });

    expect(clone.id).not.toBe(source.id);
    expect(clone.geometry).not.toEqual(source.geometry);
    expect(clone.properties.floorId).toBe("f1");
  });
});
