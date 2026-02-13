/* biome-ignore-all lint/complexity/useLiteralKeys: bracket notation is required by noPropertyAccessFromIndexSignature */
import type { FeatureProperties, FloorFeature, ImdfFeatureType, JsonObject } from "../types";

export const CONTAINER_TYPES = new Set<ImdfFeatureType | "level">([
  "level",
  "unit",
  "section",
  "geofence",
]);

export const resolveFeatureType = (feature: FloorFeature): ImdfFeatureType =>
  (feature.feature_type as ImdfFeatureType) ?? "unit";

export const canContainChildren = (type: ImdfFeatureType | "level"): boolean =>
  CONTAINER_TYPES.has(type);

export type ContainmentParent = {
  parentId: string;
  parentType: ImdfFeatureType | "level";
};

const legacyMetadataParent = (feature: FloorFeature): string | undefined => {
  const metadata =
    feature.properties["formation:metadata"] &&
    typeof feature.properties["formation:metadata"] === "object"
      ? (feature.properties["formation:metadata"] as JsonObject)
      : undefined;
  const parent =
    metadata && typeof metadata["imdfRelationshipParentId"] === "string"
      ? metadata["imdfRelationshipParentId"]
      : undefined;
  return parent;
};

export const getContainmentParentId = (feature: FloorFeature): string | undefined =>
  typeof feature.properties["formation:containment_parent_id"] === "string"
    ? feature.properties["formation:containment_parent_id"]
    : legacyMetadataParent(feature);

export const getContainmentParentType = (feature: FloorFeature): ImdfFeatureType | "level" => {
  if (typeof feature.properties["formation:containment_parent_type"] === "string") {
    return feature.properties["formation:containment_parent_type"] as ImdfFeatureType | "level";
  }
  return "level";
};

export const resolvePendingContainmentParent = (
  parentFeature: FloorFeature | undefined,
): ContainmentParent | undefined => {
  if (!parentFeature) {
    return undefined;
  }
  const parentType = resolveFeatureType(parentFeature);
  if (!canContainChildren(parentType)) {
    return undefined;
  }
  return {
    parentId: parentFeature.id,
    parentType,
  };
};

export const applyContainmentParent = (
  properties: FeatureProperties,
  parent: ContainmentParent | undefined,
): FeatureProperties => {
  const nextProperties: FeatureProperties = { ...properties };
  if (!parent) {
    delete nextProperties["formation:containment_parent_id"];
    delete nextProperties["formation:containment_parent_type"];
    return nextProperties;
  }
  nextProperties["formation:containment_parent_id"] = parent.parentId;
  nextProperties["formation:containment_parent_type"] = parent.parentType;
  return nextProperties;
};

export const getChildrenByParent = (
  features: FloorFeature[],
  levelId: string,
): Map<string, FloorFeature[]> => {
  const byParent = new Map<string, FloorFeature[]>();
  for (const feature of features) {
    if (feature.properties.level_id !== levelId) {
      continue;
    }
    const parentId = getContainmentParentId(feature) ?? levelId;
    const current = byParent.get(parentId) ?? [];
    current.push(feature);
    byParent.set(parentId, current);
  }
  return byParent;
};

export const wouldCreateContainmentCycle = (
  featureId: string,
  nextParentId: string | undefined,
  features: FloorFeature[],
): boolean => {
  if (!nextParentId || nextParentId === featureId) {
    return nextParentId === featureId;
  }
  const byId = new Map(features.map((feature) => [feature.id, feature]));
  let currentId: string | undefined = nextParentId;
  while (currentId) {
    if (currentId === featureId) {
      return true;
    }
    const current = byId.get(currentId);
    if (!current) {
      return false;
    }
    currentId = getContainmentParentId(current);
  }
  return false;
};
