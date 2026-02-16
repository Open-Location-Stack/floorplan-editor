import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  buildImdfArchivePayload,
  exportBuildingImdfZip,
  exportProjectImdfZip,
  exportVenueImdfZip,
  IMDF_STANDARD_DATASET_TYPES,
} from "./archiveExport";
import { importImdfArchiveZip } from "./archiveImport";
import {
  imdfCollectionFileName,
  imdfExtensionCollectionFileName,
  imdfLegacyCollectionFileName,
  imdfLegacyExtensionCollectionFileName,
} from "./fileNames";
import { validateImdfDatasetFiles } from "./validate";

const loadArchiveFixture = async (path: string): Promise<File> => {
  // @ts-expect-error Node typings are not included in this test tsconfig.
  const { readFile } = await import("node:fs/promises");
  const zipBuffer = await readFile(path);
  return new File([zipBuffer], path, { type: "application/zip" });
};

const expectImportedReferencesToResolve = (
  imported: Extract<Awaited<ReturnType<typeof importImdfArchiveZip>>, { ok: true }>["value"],
) => {
  const floorIds = new Set(imported.floors.map((floor) => floor.id));
  const buildingIds = new Set(imported.buildings.map((building) => building.id));

  for (const floor of imported.floors) {
    expect(buildingIds.has(floor.buildingId)).toBe(true);
  }

  for (const feature of imported.features) {
    if (typeof feature.properties.level_id === "string") {
      expect(floorIds.has(feature.properties.level_id)).toBe(true);
    }
  }
};

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
      expect(payload.files[imdfCollectionFileName(type)]).toBeDefined();
    }
    expect(payload.files[imdfExtensionCollectionFileName("formation_image")]).toBeDefined();
    expect(payload.files[imdfExtensionCollectionFileName("formation_centroid")]).toBeDefined();

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
    expect(imported.value.venues.length).toBeGreaterThan(0);
    expect(imported.value.buildings.length).toBeGreaterThan(0);
    expect(imported.value.floors.length).toBeGreaterThan(0);
    expect(imported.value.features.some((feature) => feature.properties.imdfType === "level")).toBe(
      true,
    );
  });

  it("exports and imports a venue archive with multiple buildings", async () => {
    const { blob } = await exportVenueImdfZip({
      venue: {
        id: "venue-1",
        name: "Campus A",
      },
      buildings: [
        { id: "building-1", venueId: "venue-1", name: "North Tower" },
        { id: "building-2", venueId: "venue-1", name: "South Tower" },
      ],
      floors: [
        { id: "level-1", buildingId: "building-1", name: "Ground Floor" },
        { id: "level-2", buildingId: "building-2", name: "Ground Floor" },
      ],
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
        {
          type: "Feature",
          id: "level-2",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.13, 52.09],
                [5.131, 52.09],
                [5.131, 52.091],
                [5.13, 52.091],
                [5.13, 52.09],
              ],
            ],
          },
          properties: {
            kind: "level",
            imdfType: "level",
            floorId: "level-2",
            level_id: "level-2",
            buildingId: "building-2",
          },
        },
      ],
      overlays: [],
    });

    const imported = await importImdfArchiveZip(
      new File([blob], "venue.imdf.zip", { type: "application/zip" }),
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.value.venues).toHaveLength(1);
    const venueId = imported.value.venues[0]?.id;
    expect(venueId).toBeDefined();
    expect(imported.value.buildings.every((building) => building.venueId === venueId)).toBe(true);
    expect(imported.value.buildings).toHaveLength(2);
  });

  it("exports and imports a project archive with multiple venues", async () => {
    const { blob } = await exportProjectImdfZip({
      venues: [
        { id: "venue-1", name: "Campus A" },
        { id: "venue-2", name: "Campus B" },
      ],
      buildings: [
        { id: "building-1", venueId: "venue-1", name: "Tower A" },
        { id: "building-2", venueId: "venue-2", name: "Tower B" },
      ],
      floors: [
        { id: "level-1", buildingId: "building-1", name: "Ground Floor" },
        { id: "level-2", buildingId: "building-2", name: "Ground Floor" },
      ],
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
        {
          type: "Feature",
          id: "level-2",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.13, 52.09],
                [5.131, 52.09],
                [5.131, 52.091],
                [5.13, 52.091],
                [5.13, 52.09],
              ],
            ],
          },
          properties: {
            kind: "level",
            imdfType: "level",
            floorId: "level-2",
            level_id: "level-2",
            buildingId: "building-2",
          },
        },
      ],
      overlays: [],
    });

    const imported = await importImdfArchiveZip(
      new File([blob], "project.imdf.zip", { type: "application/zip" }),
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.value.venues).toHaveLength(2);
    const venueIds = new Set(imported.value.venues.map((venue) => venue.id));
    expect(
      imported.value.buildings.every((building) =>
        Boolean(building.venueId && venueIds.has(building.venueId)),
      ),
    ).toBe(true);
    expect(imported.value.buildings).toHaveLength(2);
  });

  it("exports kiosk features without anchor_id", async () => {
    const { blob, warnings } = await exportBuildingImdfZip({
      building: {
        id: "building-1",
        name: "HQ",
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
        {
          type: "Feature",
          id: "kiosk-1",
          geometry: {
            type: "Point",
            coordinates: [5.1205, 52.0905],
          },
          properties: {
            kind: "kiosk",
            imdfType: "kiosk",
            floorId: "level-1",
          },
        },
      ],
      overlays: [],
    });

    expect(
      warnings.some((warning) => warning.includes("kiosk") && warning.includes("anchor_id")),
    ).toBe(false);

    const imported = await importImdfArchiveZip(
      new File([blob], "kiosk-skip.imdf.zip", { type: "application/zip" }),
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.value.features.some((feature) => feature.feature_type === "kiosk")).toBe(true);
  });

  it("imports legacy .geojson archive filenames for backward compatibility", async () => {
    const { blob } = await exportBuildingImdfZip({
      building: { id: "building-1", name: "HQ" },
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

    const exportedZip = await JSZip.loadAsync(blob);
    const legacyZip = new JSZip();
    for (const [filename, entry] of Object.entries(exportedZip.files)) {
      if (entry.dir) {
        continue;
      }
      const bytes = await entry.async("uint8array");
      const datasetType = IMDF_STANDARD_DATASET_TYPES.find(
        (type) => filename === imdfCollectionFileName(type),
      );
      if (datasetType) {
        legacyZip.file(imdfLegacyCollectionFileName(datasetType), bytes);
        continue;
      }
      if (filename === imdfExtensionCollectionFileName("formation_image")) {
        legacyZip.file(imdfLegacyExtensionCollectionFileName("formation_image"), bytes);
        continue;
      }
      if (filename === imdfExtensionCollectionFileName("formation_centroid")) {
        legacyZip.file(imdfLegacyExtensionCollectionFileName("formation_centroid"), bytes);
        continue;
      }
      legacyZip.file(filename, bytes);
    }

    const legacyBlob = await legacyZip.generateAsync({ type: "blob" });
    const imported = await importImdfArchiveZip(
      new File([legacyBlob], "legacy-geojson.imdf.zip", { type: "application/zip" }),
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.value.buildings.length).toBeGreaterThan(0);
  });

  it("imports osmtomimdf third-party archive in compatibility mode", async () => {
    const imported = await importImdfArchiveZip(
      await loadArchiveFixture("test-buildings/osmtomimdf-test-building.zip"),
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.value.venues.length).toBeGreaterThan(0);
    expect(imported.value.buildings.length).toBeGreaterThan(0);
    expect(imported.value.floors.length).toBeGreaterThan(0);
    expect(imported.value.features.some((feature) => feature.feature_type === "unit")).toBe(true);
    expect(imported.value.warnings.length).toBeGreaterThan(0);
    expect(imported.value.warnings.some((warning) => warning.includes("inferred venue_id"))).toBe(
      true,
    );
  });

  it("imports pdhoward IMDF fixture with resolved references and bounded warning volume", async () => {
    const imported = await importImdfArchiveZip(
      await loadArchiveFixture("test-buildings/ogc-imdf-pdhoward-venue.zip"),
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    expect(imported.value.venues.length).toBeGreaterThan(0);
    expect(imported.value.buildings.length).toBeGreaterThan(0);
    expect(imported.value.floors.length).toBeGreaterThan(0);
    expect(imported.value.features.some((feature) => feature.feature_type === "level")).toBe(true);
    expect(imported.value.features.some((feature) => feature.feature_type === "unit")).toBe(true);
    expectImportedReferencesToResolve(imported.value);

    expect(imported.value.warnings.length).toBeGreaterThan(0);
    expect(imported.value.warnings.length).toBeLessThan(2000);
    expect(
      imported.value.warnings.some((warning) =>
        warning.includes("missing required properties.name"),
      ),
    ).toBe(false);
    expect(
      imported.value.warnings.some((warning) =>
        warning.includes("properties.category must be one of"),
      ),
    ).toBe(false);
  });

  it("imports Open-IMDF fixture and preserves level/building links", async () => {
    const imported = await importImdfArchiveZip(
      await loadArchiveFixture("test-buildings/ogc-imdf-open-imdf-demo.zip"),
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    expect(imported.value.venues.length).toBeGreaterThan(0);
    expect(imported.value.buildings.length).toBeGreaterThan(0);
    expect(imported.value.floors.length).toBeGreaterThan(0);
    expect(imported.value.features.some((feature) => feature.feature_type === "level")).toBe(true);
    expect(imported.value.features.some((feature) => feature.feature_type === "unit")).toBe(true);
    expectImportedReferencesToResolve(imported.value);

    expect(imported.value.warnings.length).toBeGreaterThan(0);
    expect(imported.value.warnings.length).toBeLessThan(2000);
    expect(
      imported.value.warnings.some((warning) =>
        warning.includes("missing required properties.name"),
      ),
    ).toBe(false);
    expect(
      imported.value.warnings.some((warning) =>
        warning.includes("properties.category must be one of"),
      ),
    ).toBe(false);
  });

  it("preserves custom categories and emits non-blocking compatibility warnings on export", async () => {
    const { blob, warnings } = await exportBuildingImdfZip({
      building: {
        id: "building-custom-cat",
        name: "Custom Category Building",
      },
      floors: [{ id: "level-custom-cat", buildingId: "building-custom-cat", name: "Level 1" }],
      features: [
        {
          type: "Feature",
          id: "level-custom-cat",
          feature_type: "level",
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
            level_id: "level-custom-cat",
            floorId: "level-custom-cat",
            buildingId: "building-custom-cat",
          },
        },
        {
          type: "Feature",
          id: "opening-custom-cat",
          feature_type: "opening",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.1201, 52.0901],
              [5.1202, 52.0902],
            ],
          },
          properties: {
            kind: "opening",
            imdfType: "opening",
            level_id: "level-custom-cat",
            floorId: "level-custom-cat",
            category: "portal.custom",
          },
        },
      ],
      overlays: [],
    });

    expect(
      warnings.some((warning) =>
        warning.includes('non-standard opening category "portal.custom" preserved'),
      ),
    ).toBe(true);

    const imported = await importImdfArchiveZip(
      new File([blob], "custom-category.imdf.zip", { type: "application/zip" }),
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    const importedOpening = imported.value.features.find(
      (feature) =>
        feature.feature_type === "opening" && feature.properties.category === "portal.custom",
    );
    expect(importedOpening?.properties.category).toBe("portal.custom");
  });
});
