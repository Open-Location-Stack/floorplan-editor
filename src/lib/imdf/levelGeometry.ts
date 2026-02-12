import type { FloorFeature } from "../types";

export const isLevelGeometryFeature = (feature: FloorFeature): boolean => {
  const featureType =
    typeof feature.properties.imdfType === "string"
      ? feature.properties.imdfType
      : feature.properties.kind;
  return featureType === "level" && feature.geometry.type === "Polygon";
};

export const getLevelGeometryFeatures = (
  features: FloorFeature[],
  levelId: string,
): FloorFeature[] =>
  features.filter(
    (feature) => feature.properties.floorId === levelId && isLevelGeometryFeature(feature),
  );

export const hasLevelGeometry = (features: FloorFeature[], levelId: string): boolean =>
  getLevelGeometryFeatures(features, levelId).length > 0;
