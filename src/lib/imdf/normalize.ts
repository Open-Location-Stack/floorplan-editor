import type { FloorFeature, ImdfFeatureType } from "../types";
import { getImdfSchemaRule, isKnownImdfType } from "./schema";

export type NormalizeContext = {
  buildingId: string;
  floorId: string;
};

const readReferenceId = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string"
  ) {
    return (value as { id: string }).id;
  }
  return undefined;
};

const resolveType = (feature: FloorFeature): ImdfFeatureType => {
  const raw =
    typeof feature.properties.imdfType === "string"
      ? feature.properties.imdfType
      : feature.properties.kind;

  if (typeof raw === "string" && isKnownImdfType(raw)) {
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
  let normalizedType = migratedType ?? resolveType(feature);
  if (normalizedType === "unit" && feature.geometry.type === "Polygon") {
    // Recovery path for previously mis-normalized level features.
    const hasLevelMarkers =
      (typeof feature.properties.short_name === "object" &&
        feature.properties.short_name !== null &&
        !Array.isArray(feature.properties.short_name)) ||
      typeof feature.properties.ordinal === "number" ||
      typeof feature.properties.outdoor === "boolean" ||
      Array.isArray(feature.properties.building_ids);
    const floorMatch =
      feature.id === context.floorId || feature.properties.level_id === context.floorId;
    if (hasLevelMarkers && floorMatch) {
      normalizedType = "level";
    }
  }
  const schema = getImdfSchemaRule(normalizedType);
  const origin =
    readReferenceId(feature.properties.origin) ?? readReferenceId(feature.properties.origin_id);
  const intermediary =
    readReferenceId(feature.properties.intermediary) ??
    readReferenceId(feature.properties.intermediary_id);
  const destination =
    readReferenceId(feature.properties.destination) ??
    readReferenceId(feature.properties.destination_id);
  const relation =
    normalizedType === "relationship" && origin && destination
      ? {
          origin: { featureId: origin },
          ...(intermediary
            ? { intermediary: { featureId: intermediary, floorId: context.floorId } }
            : {}),
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
      ...(origin ? { origin: { id: origin, feature_type: "unit" }, origin_id: origin } : {}),
      ...(intermediary
        ? {
            intermediary: { id: intermediary, feature_type: "unit" },
            intermediary_id: intermediary,
          }
        : {}),
      ...(destination
        ? { destination: { id: destination, feature_type: "unit" }, destination_id: destination }
        : {}),
      ...(relation ? { relation } : {}),
      ...(normalizedType === "relationship" && !feature.properties.direction
        ? { direction: "directed" }
        : {}),
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
  }

  return normalized;
};
