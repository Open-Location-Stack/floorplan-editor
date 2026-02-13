import type { FloorFeature } from "../types";
import { readImdfType } from "./featureCatalog";

export const readFeatureType = (feature: FloorFeature): string =>
  readImdfType(feature.properties.imdfType) ??
  readImdfType(feature.properties.kind) ??
  feature.properties.kind ??
  "feature";

export const readFeatureDisplayName = (feature: FloorFeature): string => {
  const name = feature.properties.name;
  if (typeof name === "string" && name.trim().length > 0) {
    return name.trim();
  }
  if (name && typeof name === "object" && !Array.isArray(name)) {
    const english = (name as { en?: unknown }).en;
    if (typeof english === "string" && english.trim().length > 0) {
      return english.trim();
    }
    const first = Object.values(name).find(
      (entry) => typeof entry === "string" && entry.trim().length > 0,
    );
    if (typeof first === "string") {
      return first.trim();
    }
  }
  return readFeatureType(feature);
};

export const formatFeatureOptionLabel = (feature: FloorFeature): string =>
  `${readFeatureDisplayName(feature)} (${feature.id})`;
