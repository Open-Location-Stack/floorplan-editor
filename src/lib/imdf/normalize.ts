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
  const originalType =
    typeof feature.properties.imdfType === "string"
      ? feature.properties.imdfType
      : feature.properties.kind;
  const migratedType =
    originalType === "relationship" && feature.geometry.type === "LineString"
      ? "opening"
      : undefined;
  const normalizedType = migratedType ?? resolveType(feature);
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

  const rawName = feature.properties.name;
  const existingLabel =
    typeof rawName === "object" && rawName !== null && !Array.isArray(rawName)
      ? (rawName as { en?: unknown })
      : undefined;
  const normalizedName =
    typeof existingLabel?.en === "string"
      ? (rawName as Record<string, string>)
      : typeof rawName === "string" && rawName.trim().length > 0
        ? { en: rawName.trim() }
        : { en: schema.defaultName };

  const normalized: FloorFeature = {
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
      ...(normalizedType === "level" ? { building_ids: [context.buildingId] } : {}),
      ...(origin ? { origin, origin_id: origin } : {}),
      ...(intermediary ? { intermediary, intermediary_id: intermediary } : {}),
      ...(destination ? { destination, destination_id: destination } : {}),
      ...(relation ? { relation } : {}),
      name: normalizedName,
    },
  };

  if (normalizedType === "level") {
    if (typeof normalized.properties.short_name !== "object" || !normalized.properties.short_name) {
      normalized.properties.short_name = normalizedName;
    }
    if (typeof normalized.properties.ordinal !== "number") {
      normalized.properties.ordinal = 0;
    }
    if (typeof normalized.properties.outdoor !== "boolean") {
      normalized.properties.outdoor = false;
    }
  }

  if (normalizedType === "opening") {
    if (
      typeof normalized.properties.category !== "string" ||
      normalized.properties.category.trim().length === 0 ||
      normalized.properties.category === "door"
    ) {
      normalized.properties.category = "pedestrian";
    }
    if (
      normalized.properties.door !== -1 &&
      normalized.properties.door !== 0 &&
      normalized.properties.door !== 1
    ) {
      normalized.properties.door = 0;
    }
  }

  return normalized;
};
