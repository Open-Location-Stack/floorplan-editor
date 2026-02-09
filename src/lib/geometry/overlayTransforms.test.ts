import { distance, point } from "@turf/turf";
import { describe, expect, it } from "vitest";
import type { Coordinates } from "../types";
import { rotateAroundPoint } from "./overlayTransforms";

const EARTH_RADIUS_METERS = 6_378_137;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const metersToCoordinates = (
  center: Coordinates,
  dxMeters: number,
  dyMeters: number,
): Coordinates => {
  const longitudeScale = Math.cos(center[1] * DEG_TO_RAD);
  const longitude = center[0] + (dxMeters / (EARTH_RADIUS_METERS * longitudeScale)) * RAD_TO_DEG;
  const latitude = center[1] + (dyMeters / EARTH_RADIUS_METERS) * RAD_TO_DEG;
  return [longitude, latitude];
};

const naiveRotateAroundPoint = (
  pointCoordinates: Coordinates,
  centerCoordinates: Coordinates,
  degrees: number,
): Coordinates => {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = pointCoordinates[0] - centerCoordinates[0];
  const dy = pointCoordinates[1] - centerCoordinates[1];
  return [centerCoordinates[0] + dx * cos - dy * sin, centerCoordinates[1] + dx * sin + dy * cos];
};

const lengthMeters = (from: Coordinates, to: Coordinates): number =>
  distance(point(from), point(to), { units: "meters" });

describe("rotateAroundPoint", () => {
  it("returns original coordinate for zero rotation", () => {
    const center: Coordinates = [5.1214, 52.0907];
    const pointCoordinate: Coordinates = [5.123, 52.0913];

    expect(rotateAroundPoint(pointCoordinate, center, 0)).toEqual(pointCoordinate);
  });

  it("preserves edge lengths for large overlays at high latitudes", () => {
    const center: Coordinates = [10, 70];
    const topLeft = metersToCoordinates(center, -750, 500);
    const topRight = metersToCoordinates(center, 750, 500);

    const originalWidth = lengthMeters(topLeft, topRight);
    const rotatedTopLeft = rotateAroundPoint(topLeft, center, 45);
    const rotatedTopRight = rotateAroundPoint(topRight, center, 45);
    const rotatedWidth = lengthMeters(rotatedTopLeft, rotatedTopRight);
    const rotatedError = Math.abs(rotatedWidth - originalWidth);

    const naiveTopLeft = naiveRotateAroundPoint(topLeft, center, 45);
    const naiveTopRight = naiveRotateAroundPoint(topRight, center, 45);
    const naiveWidth = lengthMeters(naiveTopLeft, naiveTopRight);
    const naiveError = Math.abs(naiveWidth - originalWidth);

    expect(rotatedError).toBeLessThan(1);
    expect(rotatedError).toBeLessThan(naiveError);
  });
});
