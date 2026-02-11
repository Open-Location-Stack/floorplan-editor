import type { FloorFeature } from "../types";
import { getImdfSchemaRule, isSupportedImdfType, type SupportedImdfType } from "./schema";

export type NormalizeContext = {
  buildingId: string;
  floorId: string;
};

const resolveType = (feature: FloorFeature): SupportedImdfType => {
  const raw =
    typeof feature.properties.imdfType === "string"
      ? feature.properties.imdfType
      : feature.properties.kind;

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
  const origin =
    typeof feature.properties.origin === "string"
      ? feature.properties.origin
      : typeof feature.properties.origin_id === "string"
        ? feature.properties.origin_id
        : undefined;
  const intermediary =
    typeof feature.properties.intermediary === "string"
      ? feature.properties.intermediary
      : typeof feature.properties.intermediary_id === "string"
        ? feature.properties.intermediary_id
        : undefined;
  const destination =
    typeof feature.properties.destination === "string"
      ? feature.properties.destination
      : typeof feature.properties.destination_id === "string"
        ? feature.properties.destination_id
        : undefined;
  const relation =
    normalizedType === "relationship" && origin && intermediary && destination
      ? {
          origin: { featureId: origin },
          intermediary: { featureId: intermediary, floorId: context.floorId },
          destination: { featureId: destination },
        }
      : feature.properties.relation;

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
      ...(origin ? { origin, origin_id: origin } : {}),
      ...(intermediary ? { intermediary, intermediary_id: intermediary } : {}),
      ...(destination ? { destination, destination_id: destination } : {}),
      ...(relation ? { relation } : {}),
      name:
        typeof feature.properties.name === "string" && feature.properties.name.trim().length > 0
          ? feature.properties.name
          : schema.defaultName,
    },
  };
};
