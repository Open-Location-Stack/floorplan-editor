/* biome-ignore-all lint/complexity/useLiteralKeys: bracket notation is required by noPropertyAccessFromIndexSignature */
import type { Coordinates, FeatureProperties, FloorFeature, ImdfFeatureType } from "../types";

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
  _parent: ContainmentParent | undefined,
): FeatureProperties => {
  // Containment is derived from IMDF relationships and geometry, not persisted in feature properties.
  return { ...properties };
};

const readRelationshipRef = (value: unknown): { id: string; feature_type?: string } | undefined => {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string"
  ) {
    const featureType = (value as { feature_type?: unknown }).feature_type;
    return {
      id: (value as { id: string }).id,
      ...(typeof featureType === "string" ? { feature_type: featureType } : {}),
    };
  }
  return undefined;
};

const geometryCenter = (feature: FloorFeature): Coordinates | undefined => {
  if (feature.geometry.type === "Point") {
    return feature.geometry.coordinates;
  }
  if (feature.geometry.type === "LineString") {
    const first = feature.geometry.coordinates[0];
    const last = feature.geometry.coordinates[feature.geometry.coordinates.length - 1];
    if (!first || !last) {
      return undefined;
    }
    return [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
  }
  const ring = feature.geometry.coordinates[0];
  if (!ring || ring.length < 3) {
    return undefined;
  }
  const sum = ring.reduce(
    (current, coordinate) => {
      current[0] += coordinate[0];
      current[1] += coordinate[1];
      return current;
    },
    [0, 0] as [number, number],
  );
  return [sum[0] / ring.length, sum[1] / ring.length];
};

const polygonArea = (feature: FloorFeature): number => {
  if (feature.geometry.type !== "Polygon") {
    return Number.POSITIVE_INFINITY;
  }
  const ring = feature.geometry.coordinates[0] ?? [];
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const left = ring[index];
    const right = ring[index + 1];
    if (!left || !right) {
      continue;
    }
    area += left[0] * right[1] - right[0] * left[1];
  }
  return Math.abs(area / 2);
};

const isPointInPolygon = (point: Coordinates, polygon: FloorFeature["geometry"]): boolean => {
  if (polygon.type !== "Polygon") {
    return false;
  }
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 3) {
    return false;
  }
  let inside = false;
  const x = point[0];
  const y = point[1];
  for (
    let leftIndex = 0, rightIndex = ring.length - 1;
    leftIndex < ring.length;
    rightIndex = leftIndex++
  ) {
    const left = ring[leftIndex];
    const right = ring[rightIndex];
    if (!left || !right) {
      continue;
    }
    const intersect =
      left[1] > y !== right[1] > y &&
      x < ((right[0] - left[0]) * (y - left[1])) / (right[1] - left[1]) + left[0];
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
};

const CONTAINMENT_PARENT_TYPES = new Set<ImdfFeatureType | "level">([
  "level",
  "unit",
  "section",
  "geofence",
]);

const buildRelationshipContainmentMap = (
  features: FloorFeature[],
  levelId: string,
): Map<string, string> => {
  const byId = new Map(features.map((feature) => [feature.id, feature]));
  const relationshipParentByChild = new Map<string, string>();
  for (const feature of features) {
    if (feature.properties.level_id !== levelId || resolveFeatureType(feature) !== "relationship") {
      continue;
    }
    const origin = readRelationshipRef(feature.properties.origin);
    const destination = readRelationshipRef(feature.properties.destination);
    if (!origin?.id || !destination?.id) {
      continue;
    }
    const originFeature = byId.get(origin.id);
    const destinationFeature = byId.get(destination.id);
    const originType =
      origin.feature_type ?? (originFeature ? resolveFeatureType(originFeature) : undefined);
    const destinationType =
      destination.feature_type ??
      (destinationFeature ? resolveFeatureType(destinationFeature) : undefined);
    if (!originType || !destinationType) {
      continue;
    }
    if (!CONTAINMENT_PARENT_TYPES.has(originType as ImdfFeatureType | "level")) {
      continue;
    }
    if (destinationType === "opening" || destinationType === "relationship") {
      continue;
    }
    relationshipParentByChild.set(destination.id, origin.id);
  }
  return relationshipParentByChild;
};

const resolveGeometricParentId = (
  feature: FloorFeature,
  candidates: FloorFeature[],
): string | undefined => {
  const point = geometryCenter(feature);
  if (!point) {
    return undefined;
  }
  let bestId: string | undefined;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate.id === feature.id || candidate.geometry.type !== "Polygon") {
      continue;
    }
    if (!isPointInPolygon(point, candidate.geometry)) {
      continue;
    }
    const area = polygonArea(candidate);
    if (area < bestArea) {
      bestArea = area;
      bestId = candidate.id;
    }
  }
  return bestId;
};

export const buildContainmentParentMap = (
  features: FloorFeature[],
  levelId: string,
): Map<string, string> => {
  const levelFeatures = features.filter((feature) => feature.properties.level_id === levelId);
  const relationshipParents = buildRelationshipContainmentMap(levelFeatures, levelId);
  const polygonContainers = levelFeatures.filter((feature) => {
    const type = resolveFeatureType(feature);
    return type === "unit" || type === "section" || type === "geofence";
  });

  const parentByFeature = new Map<string, string>();
  for (const feature of levelFeatures) {
    const fromRelationship = relationshipParents.get(feature.id);
    if (fromRelationship) {
      parentByFeature.set(feature.id, fromRelationship);
      continue;
    }
    const geometricParent = resolveGeometricParentId(feature, polygonContainers);
    parentByFeature.set(feature.id, geometricParent ?? levelId);
  }
  return parentByFeature;
};

export const getChildrenByParent = (
  features: FloorFeature[],
  levelId: string,
): Map<string, FloorFeature[]> => {
  const byParent = new Map<string, FloorFeature[]>();
  const parentByFeature = buildContainmentParentMap(features, levelId);
  for (const feature of features) {
    if (feature.properties.level_id !== levelId) {
      continue;
    }
    const parentId = parentByFeature.get(feature.id) ?? levelId;
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
  const source = features.find((feature) => feature.id === featureId);
  const levelId = source?.properties.level_id;
  if (typeof levelId !== "string") {
    return false;
  }
  const parentByFeature = buildContainmentParentMap(features, levelId);
  parentByFeature.set(featureId, nextParentId);
  let currentId: string | undefined = nextParentId;
  while (currentId) {
    if (currentId === featureId) {
      return true;
    }
    if (currentId === levelId) {
      return false;
    }
    currentId = parentByFeature.get(currentId);
  }
  return false;
};
