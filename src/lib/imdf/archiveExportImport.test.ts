import { describe, expect, it } from "vitest";
import {
  buildImdfArchivePayload,
  exportBuildingImdfZip,
  IMDF_STANDARD_DATASET_TYPES,
} from "./archiveExport";
import { importImdfArchiveZip } from "./archiveImport";
import { validateImdfDatasetFiles } from "./validate";

describe("imdf archive export/import", () => {
  it("builds strict dataset files for all standard collections", () => {
    const payload = buildImdfArchivePayload({
      building: {
        id: "building-1",
        name: "HQ",
        imdf: {
          venue: { name: { en: "HQ Venue" } },
          address: { address: "Main st 1", locality: "Utrecht", country: "NL" },
        },
      },
      floors: [{ id: "level-1", buildingId: "building-1", name: "Ground Floor" }],
      features: [
        {
          type: "Feature",
          id: "level-1",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.12, 52.09],
                [5.121, 52.09],
                [5.121, 52.091],
                [5.12, 52.091],
                [5.12, 52.09],
              ],
            ],
          },
          properties: {
            kind: "level",
            imdfType: "level",
            floorId: "level-1",
            level_id: "level-1",
            buildingId: "building-1",
          },
        },
      ],
      overlays: [],
    });

    for (const type of IMDF_STANDARD_DATASET_TYPES) {
      expect(payload.files[`${type}.geojson`]).toBeDefined();
    }
    expect(payload.files["formation_image.geojson"]).toBeDefined();
    expect(payload.files["formation_centroid.geojson"]).toBeDefined();

    const validation = validateImdfDatasetFiles(payload.files);
    expect(validation.errors).toEqual([]);
  });

  it("round-trips an exported zip into building/floor/features", async () => {
    const { blob } = await exportBuildingImdfZip({
      building: {
        id: "building-1",
        name: "HQ",
        imdf: {
          venue: { name: { en: "HQ Venue" } },
          address: { address: "Main st 1", locality: "Utrecht", country: "NL" },
        },
      },
      floors: [{ id: "level-1", buildingId: "building-1", name: "Ground Floor" }],
      features: [
        {
          type: "Feature",
          id: "level-1",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.12, 52.09],
                [5.121, 52.09],
                [5.121, 52.091],
                [5.12, 52.091],
                [5.12, 52.09],
              ],
            ],
          },
          properties: {
            kind: "level",
            imdfType: "level",
            floorId: "level-1",
            level_id: "level-1",
            buildingId: "building-1",
          },
        },
      ],
      overlays: [],
    });

    const file = new File([blob], "dataset.imdf.zip", { type: "application/zip" });
    const imported = await importImdfArchiveZip(file);
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.value.buildings.length).toBeGreaterThan(0);
    expect(imported.value.floors.length).toBeGreaterThan(0);
    expect(imported.value.features.some((feature) => feature.properties.imdfType === "level")).toBe(
      true,
    );
  });
});
