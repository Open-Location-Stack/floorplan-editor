/* biome-ignore-all lint/complexity/useLiteralKeys: bracket notation is required by noPropertyAccessFromIndexSignature */
import type { FloorFeature, ImdfFeatureType, JsonObject } from "../types";

export const CONTAINER_TYPES = new Set<ImdfFeatureType | "level">([
  "level",
  "unit",
  "section",
  "geofence",
]);

export const resolveFeatureType = (feature: FloorFeature): ImdfFeatureType =>
  ((typeof feature.properties.imdfType === "string"
    ? feature.properties.imdfType
    : feature.properties.kind) as ImdfFeatureType) ?? "unit";

export const canContainChildren = (type: ImdfFeatureType | "level"): boolean =>
  CONTAINER_TYPES.has(type);

const legacyMetadataParent = (feature: FloorFeature): string | undefined => {
  const metadata =
    feature.properties.metadata && typeof feature.properties.metadata === "object"
      ? (feature.properties.metadata as JsonObject)
      : undefined;
  const parent =
    metadata && typeof metadata["imdfRelationshipParentId"] === "string"
      ? metadata["imdfRelationshipParentId"]
      : undefined;
  return parent;
};

export const getContainmentParentId = (feature: FloorFeature): string | undefined =>
  typeof feature.properties.containmentParentId === "string"
    ? feature.properties.containmentParentId
    : legacyMetadataParent(feature);

export const getContainmentParentType = (feature: FloorFeature): ImdfFeatureType | "level" => {
  if (typeof feature.properties.containmentParentType === "string") {
    return feature.properties.containmentParentType as ImdfFeatureType | "level";
  }
  return "level";
};

export const getChildrenByParent = (
  features: FloorFeature[],
  levelId: string,
): Map<string, FloorFeature[]> => {
  const byParent = new Map<string, FloorFeature[]>();
  for (const feature of features) {
    if (feature.properties.floorId !== levelId) {
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
