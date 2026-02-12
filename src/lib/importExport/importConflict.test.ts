import { describe, expect, it } from "vitest";
import {
  detectImportConflicts,
  hasImportConflicts,
  type ImportEntityData,
  mergeImportedDataReplaceConflicts,
} from "./importConflict";

const emptyImportData = (): ImportEntityData => ({
  venues: [],
  buildings: [],
  floors: [],
  features: [],
  overlays: [],
});

describe("importConflict", () => {
  it("detects conflicts by id across all supported entity groups", () => {
    const current: ImportEntityData = {
      venues: [{ id: "venue-1", name: "Venue 1" }],
      buildings: [{ id: "building-1", venueId: "venue-1", name: "Building 1" }],
      floors: [{ id: "level-1", buildingId: "building-1", name: "Level 1" }],
      features: [
        {
          type: "Feature",
          id: "feature-1",
          geometry: { type: "Point", coordinates: [1, 1] },
          properties: { kind: "amenity", floorId: "level-1" },
        },
      ],
      overlays: [
        {
          id: "overlay-1",
          floorId: "level-1",
          imageName: "level.png",
          imageDataUrl: "data:image/png;base64,aaa",
          opacity: 60,
          corners: {
            topLeft: [0, 0],
            topRight: [1, 0],
            bottomRight: [1, -1],
            bottomLeft: [0, -1],
          },
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    };
    const incoming: ImportEntityData = {
      venues: [{ id: "venue-1", name: "Imported venue" }],
      buildings: [{ id: "building-1", venueId: "venue-1", name: "Imported building" }],
      floors: [{ id: "level-1", buildingId: "building-1", name: "Imported level" }],
      features: [
        {
          type: "Feature",
          id: "feature-1",
          geometry: { type: "Point", coordinates: [2, 2] },
          properties: { kind: "amenity", floorId: "level-1" },
        },
      ],
      overlays: [
        {
          id: "overlay-1",
          floorId: "level-1",
          imageName: "imported.png",
          imageDataUrl: "data:image/png;base64,bbb",
          opacity: 70,
          corners: {
            topLeft: [0, 0],
            topRight: [1, 0],
            bottomRight: [1, -1],
            bottomLeft: [0, -1],
          },
          updatedAt: "2026-02-02T00:00:00.000Z",
        },
      ],
    };

    const conflicts = detectImportConflicts(current, incoming);
    expect(conflicts).toEqual({
      venueIds: ["venue-1"],
      buildingIds: ["building-1"],
      levelIds: ["level-1"],
      featureIds: ["feature-1"],
      overlayIds: ["overlay-1"],
    });
    expect(hasImportConflicts(conflicts)).toBe(true);
  });

  it("upserts imported entities and replaces matching ids", () => {
    const current: ImportEntityData = {
      venues: [{ id: "venue-1", name: "Venue 1" }],
      buildings: [{ id: "building-1", venueId: "venue-1", name: "Old Building" }],
      floors: [{ id: "level-1", buildingId: "building-1", name: "Old Level" }],
      features: [
        {
          type: "Feature",
          id: "feature-1",
          geometry: { type: "Point", coordinates: [1, 1] },
          properties: { kind: "amenity", floorId: "level-1", name: "Old feature" },
        },
      ],
      overlays: [],
    };
    const incoming: ImportEntityData = {
      venues: [
        { id: "venue-1", name: "Venue 1 Imported" },
        { id: "venue-2", name: "Venue 2 Imported" },
      ],
      buildings: [{ id: "building-1", venueId: "venue-1", name: "New Building" }],
      floors: [{ id: "level-2", buildingId: "building-1", name: "New Level" }],
      features: [
        {
          type: "Feature",
          id: "feature-1",
          geometry: { type: "Point", coordinates: [2, 2] },
          properties: { kind: "amenity", floorId: "level-2", name: "New feature" },
        },
      ],
      overlays: [],
    };

    const merged = mergeImportedDataReplaceConflicts(current, incoming);
    expect(merged.venues).toHaveLength(2);
    expect(merged.venues.find((venue) => venue.id === "venue-1")?.name).toBe("Venue 1 Imported");
    expect(merged.buildings.find((building) => building.id === "building-1")?.name).toBe(
      "New Building",
    );
    expect(merged.floors.map((floor) => floor.id).sort()).toEqual(["level-1", "level-2"]);
    expect(merged.features.find((feature) => feature.id === "feature-1")?.properties.name).toBe(
      "New feature",
    );
  });

  it("keeps later imports when the same incoming id appears multiple times", () => {
    const firstIncoming: ImportEntityData = {
      ...emptyImportData(),
      venues: [{ id: "venue-1", name: "Venue from file 1" }],
    };
    const secondIncoming: ImportEntityData = {
      ...emptyImportData(),
      venues: [{ id: "venue-1", name: "Venue from file 2" }],
    };

    const merged = mergeImportedDataReplaceConflicts(
      mergeImportedDataReplaceConflicts(emptyImportData(), firstIncoming),
      secondIncoming,
    );

    expect(merged.venues).toHaveLength(1);
    expect(merged.venues[0]?.name).toBe("Venue from file 2");
  });
});
