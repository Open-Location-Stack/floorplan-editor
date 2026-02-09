import type { Coordinates } from "../types";

const EARTH_RADIUS_METERS = 6_378_137;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export const rotateAroundPoint = (
  point: Coordinates,
  center: Coordinates,
  degrees: number,
): Coordinates => {
  if (degrees === 0) {
    return point;
  }

  const centerLatRadians = center[1] * DEG_TO_RAD;
  const longitudeScale = Math.cos(centerLatRadians);
  if (Math.abs(longitudeScale) < 1e-12) {
    return point;
  }

  const pointDxMeters = (point[0] - center[0]) * DEG_TO_RAD * EARTH_RADIUS_METERS * longitudeScale;
  const pointDyMeters = (point[1] - center[1]) * DEG_TO_RAD * EARTH_RADIUS_METERS;

  const radians = degrees * DEG_TO_RAD;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rotatedDxMeters = pointDxMeters * cos - pointDyMeters * sin;
  const rotatedDyMeters = pointDxMeters * sin + pointDyMeters * cos;

  const longitude =
    center[0] + (rotatedDxMeters / (EARTH_RADIUS_METERS * longitudeScale)) * RAD_TO_DEG;
  const latitude = center[1] + (rotatedDyMeters / EARTH_RADIUS_METERS) * RAD_TO_DEG;
  return [longitude, latitude];
};
