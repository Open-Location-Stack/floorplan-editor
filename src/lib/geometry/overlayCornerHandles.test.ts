import { distance, point } from "@turf/turf";
import { describe, expect, it } from "vitest";
import type { OverlayCorners } from "../types";
import { transformOverlayFromDraggedCorner } from "./overlayCornerHandles";

const widthMeters = (corners: OverlayCorners): number =>
  distance(point(corners.topLeft), point(corners.topRight), { units: "meters" });

const heightMeters = (corners: OverlayCorners): number =>
  distance(point(corners.topLeft), point(corners.bottomLeft), { units: "meters" });

const centerPoint = (corners: OverlayCorners): [number, number] => [
  (corners.topLeft[0] + corners.bottomRight[0]) / 2,
  (corners.topLeft[1] + corners.bottomRight[1]) / 2,
];

describe("transformOverlayFromDraggedCorner", () => {
  it("keeps the opposite corner fixed and preserves image aspect ratio", () => {
    const corners: OverlayCorners = {
      topLeft: [5.1209, 52.09095],
      topRight: [5.1219, 52.09095],
      bottomRight: [5.1219, 52.09045],
      bottomLeft: [5.1209, 52.09045],
    };

    const originalRatio = widthMeters(corners) / heightMeters(corners);
    const next = transformOverlayFromDraggedCorner(corners, "topLeft", [5.12045, 52.09125]);

    expect(next.bottomRight[0]).toBeCloseTo(corners.bottomRight[0], 8);
    expect(next.bottomRight[1]).toBeCloseTo(corners.bottomRight[1], 8);

    const nextRatio = widthMeters(next) / heightMeters(next);
    expect(nextRatio).toBeCloseTo(originalRatio, 2);
  });

  it("scales while keeping the current rotation fixed", () => {
    const corners: OverlayCorners = {
      topLeft: [5.1209, 52.09095],
      topRight: [5.1219, 52.09095],
      bottomRight: [5.1219, 52.09045],
      bottomLeft: [5.1209, 52.09045],
    };
    const next = transformOverlayFromDraggedCorner(corners, "topRight", [5.12235, 52.0914]);

    expect(widthMeters(next)).toBeGreaterThan(widthMeters(corners));
    const originalTopEdgeBearing = Math.atan2(
      corners.topRight[1] - corners.topLeft[1],
      corners.topRight[0] - corners.topLeft[0],
    );
    const nextTopEdgeBearing = Math.atan2(
      next.topRight[1] - next.topLeft[1],
      next.topRight[0] - next.topLeft[0],
    );
    expect(nextTopEdgeBearing).toBeCloseTo(originalTopEdgeBearing, 6);

    const [originalCenterLng, originalCenterLat] = centerPoint(corners);
    const [nextCenterLng, nextCenterLat] = centerPoint(next);
    expect(nextCenterLng).not.toBeCloseTo(originalCenterLng, 6);
    expect(nextCenterLat).not.toBeCloseTo(originalCenterLat, 6);
  });
});
