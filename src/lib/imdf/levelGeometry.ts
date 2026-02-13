import type { FloorFeature } from "../types";

export const isLevelGeometryFeature = (feature: FloorFeature): boolean => {
  return feature.feature_type === "level" && feature.geometry.type === "Polygon";
};

export const getLevelGeometryFeatures = (
  features: FloorFeature[],
  levelId: string,
): FloorFeature[] =>
  features.filter(
    (feature) => feature.properties.level_id === levelId && isLevelGeometryFeature(feature),
  );

export const hasLevelGeometry = (features: FloorFeature[], levelId: string): boolean =>
  getLevelGeometryFeatures(features, levelId).length > 0;
