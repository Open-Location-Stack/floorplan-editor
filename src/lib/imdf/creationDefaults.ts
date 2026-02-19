/* biome-ignore-all lint/complexity/useLiteralKeys: bracket notation is required by noPropertyAccessFromIndexSignature */
import type { Coordinates, FloorFeature, ImdfFeatureType } from "../types";
import { getCategoryOptions } from "./categories";
import type { ContainmentParent } from "./containment";
import { getFeatureSpec, readImdfType } from "./featureCatalog";

const readFeatureType = (feature: FloorFeature): ImdfFeatureType | undefined =>
  readImdfType(feature.feature_type) ??
  (typeof feature.properties["feature_type"] === "string"
    ? readImdfType(feature.properties["feature_type"])
    : undefined);

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
    const intersects =
      left[1] > y !== right[1] > y &&
      x < ((right[0] - left[0]) * (y - left[1])) / (right[1] - left[1]) + left[0];
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
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

export const requiresAnchorId = (type: ImdfFeatureType): boolean =>
  getFeatureSpec(type).fields.some(
    (field) =>
      field.key === "anchor_id" &&
      field.required &&
      field.type === "uuid" &&
      field.referenceTypes?.includes("anchor"),
  );

export const defaultCategoryForType = (type: ImdfFeatureType): string | undefined => {
  const spec = getFeatureSpec(type);
  const categoryField = spec.fields.find(
    (field) => field.key === "category" && field.type === "string" && field.required,
  );
  if (!categoryField) {
    return undefined;
  }
  if (typeof categoryField.defaultValue === "string" && categoryField.defaultValue.length > 0) {
    return categoryField.defaultValue;
  }
  return getCategoryOptions(type)[0]?.value;
};

export const resolveUnitIdForNewAnchor = (
  features: FloorFeature[],
  levelId: string,
  point: Coordinates,
  selectedFeature: FloorFeature | undefined,
  pendingContainmentParent: ContainmentParent | undefined,
): string | undefined => {
  const unitsOnLevel = features.filter(
    (feature) => feature.properties.level_id === levelId && readFeatureType(feature) === "unit",
  );
  if (unitsOnLevel.length === 0) {
    return undefined;
  }

  if (
    selectedFeature &&
    selectedFeature.properties.level_id === levelId &&
    readFeatureType(selectedFeature) === "unit" &&
    unitsOnLevel.some((feature) => feature.id === selectedFeature.id)
  ) {
    return selectedFeature.id;
  }

  if (
    pendingContainmentParent?.parentType === "unit" &&
    unitsOnLevel.some((feature) => feature.id === pendingContainmentParent.parentId)
  ) {
    return pendingContainmentParent.parentId;
  }

  const containingUnits = unitsOnLevel
    .filter((feature) => isPointInPolygon(point, feature.geometry))
    .sort((left, right) => polygonArea(left) - polygonArea(right));
  if (containingUnits.length > 0) {
    return containingUnits[0]?.id;
  }

  if (unitsOnLevel.length === 1) {
    return unitsOnLevel[0]?.id;
  }

  const nearest = unitsOnLevel
    .map((unit) => {
      const center = geometryCenter(unit);
      if (!center) {
        return undefined;
      }
      const distance = Math.hypot(point[0] - center[0], point[1] - center[1]);
      return { id: unit.id, distance };
    })
    .filter((candidate): candidate is { id: string; distance: number } => Boolean(candidate))
    .sort((left, right) => left.distance - right.distance)[0];
  return nearest?.id;
};
