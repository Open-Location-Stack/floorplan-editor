import type { FloorFeature } from "../types";

export const readCanonicalFeatureType = (feature: FloorFeature): string =>
  typeof feature.feature_type === "string" ? feature.feature_type : "";

export const readCanonicalLevelId = (feature: FloorFeature): string | undefined =>
  typeof feature.properties.level_id === "string" ? feature.properties.level_id : undefined;
