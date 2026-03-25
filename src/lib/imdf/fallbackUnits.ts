import { difference, featureCollection, polygon } from "@turf/turf";
import type { Feature as GeoJsonFeature, MultiPolygon, Polygon } from "geojson";
import type { Coordinates, FloorFeature, Level } from "../types";
import { readCanonicalFeatureType } from "./featureAccess";

const FALLBACK_UNIT_SYSTEM_TYPE = "fallback_unit";
const FALLBACK_CATEGORY = "circulation";

type PolygonGeometry = Extract<FloorFeature["geometry"], { type: "Polygon" }>;

const isPolygonFeature = (
  feature: FloorFeature,
): feature is FloorFeature & { geometry: PolygonGeometry } => feature.geometry.type === "Polygon";

const toTurfPolygon = (geometry: PolygonGeometry): GeoJsonFeature<Polygon> | undefined => {
  const ring = geometry.coordinates[0];
  if (!ring || ring.length < 4) {
    return undefined;
  }
  return polygon([ring]);
};

const toFeatureGeometry = (input: GeoJsonFeature<Polygon | MultiPolygon>): PolygonGeometry[] => {
  if (input.geometry.type === "Polygon") {
    return [{ type: "Polygon", coordinates: input.geometry.coordinates as Coordinates[][] }];
  }
  return input.geometry.coordinates.map((coordinates) => ({
    type: "Polygon" as const,
    coordinates: coordinates as Coordinates[][],
  }));
};

export const isFallbackUnitFeature = (feature: FloorFeature): boolean =>
  readCanonicalFeatureType(feature) === "unit" &&
  feature.properties["formation:system_type"] === FALLBACK_UNIT_SYSTEM_TYPE;

const fallbackUnitId = (levelId: string, index: number): string =>
  `formation:fallback-unit:${levelId}:${index}`;

const buildFallbackUnitsForLevel = (features: FloorFeature[], levelId: string): FloorFeature[] => {
  const levelFeature = features.find(
    (feature) => readCanonicalFeatureType(feature) === "level" && feature.id === levelId,
  );
  if (!levelFeature || !isPolygonFeature(levelFeature)) {
    return [];
  }
  const levelPolygon = toTurfPolygon(levelFeature.geometry);
  if (!levelPolygon) {
    return [];
  }

  const authoredUnits = features
    .filter(
      (feature) =>
        readCanonicalFeatureType(feature) === "unit" &&
        feature.properties.level_id === levelId &&
        !isFallbackUnitFeature(feature),
    )
    .filter(isPolygonFeature);

  let residual: GeoJsonFeature<Polygon | MultiPolygon> | null = levelPolygon;
  for (const unit of authoredUnits) {
    const unitPolygon = toTurfPolygon(unit.geometry);
    if (!unitPolygon || !residual) {
      continue;
    }
    residual = difference(featureCollection([residual, unitPolygon]));
    if (!residual) {
      return [];
    }
  }

  const geometries = toFeatureGeometry(residual);
  return geometries.map((geometry, index) => ({
    type: "Feature",
    id: fallbackUnitId(levelId, index),
    feature_type: "unit",
    geometry,
    properties: {
      level_id: levelId,
      name: { en: `Fallback circulation ${index + 1}` },
      category: FALLBACK_CATEGORY,
      "formation:system_type": FALLBACK_UNIT_SYSTEM_TYPE,
    },
  }));
};

export const reconcileFallbackUnits = (
  features: FloorFeature[],
  levels: Level[],
): FloorFeature[] => {
  const withoutFallback = features.filter((feature) => !isFallbackUnitFeature(feature));
  const next = [...withoutFallback];
  for (const level of levels) {
    next.push(...buildFallbackUnitsForLevel(withoutFallback, level.id));
  }
  return next;
};
