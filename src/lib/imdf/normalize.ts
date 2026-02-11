import type { FloorFeature } from "../types";
import { getImdfSchemaRule, isSupportedImdfType, type SupportedImdfType } from "./schema";

export type NormalizeContext = {
  buildingId: string;
  floorId: string;
};

const resolveType = (feature: FloorFeature): SupportedImdfType => {
  const rawCandidate =
    typeof feature.properties.imdfType === "string"
      ? feature.properties.imdfType
      : feature.properties.kind;
  const raw =
    rawCandidate === "path" ? "opening" : rawCandidate === "zone" ? "section" : rawCandidate;

  if (typeof raw === "string" && isSupportedImdfType(raw)) {
    return raw;
  }

  if (feature.geometry.type === "LineString") {
    return "opening";
  }

  return "unit";
};

export const normalizeFeature = (
  feature: FloorFeature,
  context: NormalizeContext,
): FloorFeature => {
  const normalizedType = resolveType(feature);
  const schema = getImdfSchemaRule(normalizedType);

  return {
    ...feature,
    properties: {
      ...feature.properties,
      id: String(feature.id),
      imdf_id: String(feature.id),
      kind: normalizedType,
      imdfType: normalizedType,
      imdf_feature_type: normalizedType,
      floorId: context.floorId,
      level_id: context.floorId,
      buildingId: context.buildingId,
      building_id: context.buildingId,
      name:
        typeof feature.properties.name === "string" && feature.properties.name.trim().length > 0
          ? feature.properties.name
          : schema.defaultName,
    },
  };
};
