import { describe, expect, it } from "vitest";
import { exportProjectImdfZip } from "./archiveExport";
import { importImdfArchiveZip } from "./archiveImport";

describe("archiveImport", () => {
  it("parses venues and maps building.venueId from building venue_id", async () => {
    const { blob } = await exportProjectImdfZip({
      venues: [
        { id: "venue-1", name: "Venue One" },
        { id: "venue-2", name: "Venue Two" },
      ],
      buildings: [
        { id: "building-1", venueId: "venue-1", name: "Building One" },
        { id: "building-2", venueId: "venue-2", name: "Building Two" },
      ],
      floors: [
        { id: "level-1", buildingId: "building-1", name: "Level One" },
        { id: "level-2", buildingId: "building-2", name: "Level Two" },
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

    const result = await importImdfArchiveZip(
      new File([blob], "project.imdf.zip", { type: "application/zip" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.venues).toHaveLength(2);
    const venueIds = new Set(result.value.venues.map((venue) => venue.id));
    expect(
      result.value.buildings.every((building) =>
        Boolean(building.venueId && venueIds.has(building.venueId)),
      ),
    ).toBe(true);
  });
});
