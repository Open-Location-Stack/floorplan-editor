import { area as turfArea, length as turfLength } from "@turf/turf";
import type { FloorFeature, LineStringGeometry, PolygonGeometry } from "../types";

export type LengthUnit = "m" | "ft";
export type AreaUnit = "m2" | "ft2";

const FEET_PER_METER = 3.28084;
const SQUARE_FEET_PER_SQUARE_METER = 10.7639;

const round = (value: number, precision = 2): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

export const convertLength = (meters: number, unit: LengthUnit): number =>
  unit === "ft" ? round(meters * FEET_PER_METER) : round(meters);

export const convertArea = (squareMeters: number, unit: AreaUnit): number =>
  unit === "ft2" ? round(squareMeters * SQUARE_FEET_PER_SQUARE_METER) : round(squareMeters);

export const featureLengthMeters = (feature: FloorFeature): number => {
  if (feature.geometry.type !== "LineString") {
    return 0;
  }

  const line = {
    type: "Feature" as const,
    geometry: feature.geometry as LineStringGeometry,
    properties: feature.properties,
  };

  return round(turfLength(line, { units: "meters" }), 3);
};

export const featureAreaSquareMeters = (feature: FloorFeature): number => {
  if (feature.geometry.type !== "Polygon") {
    return 0;
  }

  const polygon = {
    type: "Feature" as const,
    geometry: feature.geometry as PolygonGeometry,
    properties: feature.properties,
  };

  return round(turfArea(polygon), 3);
};
