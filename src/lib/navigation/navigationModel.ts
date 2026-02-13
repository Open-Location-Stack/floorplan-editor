import type { Coordinates, FloorFeature } from "../types";

export const NAVIGATION_NODE_CATEGORIES = [
  "entrance",
  "door",
  "stairs",
  "elevator",
  "escalator",
  "revolving_door",
  "exit",
] as const;

export type NavigationNodeCategory = (typeof NAVIGATION_NODE_CATEGORIES)[number];

export const NAVIGATION_PATH_CATEGORIES = ["pedestrian", "wheelchair"] as const;
export type NavigationPathCategory = (typeof NAVIGATION_PATH_CATEGORIES)[number];

export const VERTICAL_NAVIGATION_NODE_CATEGORIES = new Set<NavigationNodeCategory>([
  "stairs",
  "elevator",
  "escalator",
]);

export const readFeatureTypeString = (feature: FloorFeature): string =>
  typeof feature.feature_type === "string"
    ? feature.feature_type
    : typeof feature.properties.feature_type === "string"
      ? feature.properties.feature_type
      : typeof feature.properties.kind === "string"
        ? feature.properties.kind
        : "";

export const readOpeningCategory = (feature: FloorFeature): string | undefined =>
  typeof feature.properties.category === "string" ? feature.properties.category : undefined;

export const isOpeningFeature = (feature: FloorFeature): boolean =>
  readFeatureTypeString(feature) === "opening";

export const isRelationshipFeature = (feature: FloorFeature): boolean =>
  readFeatureTypeString(feature) === "relationship";

export const isNavigationNodeOpening = (feature: FloorFeature): boolean =>
  isOpeningFeature(feature) &&
  typeof feature.properties.category === "string" &&
  (NAVIGATION_NODE_CATEGORIES as readonly string[]).includes(feature.properties.category);

export const isNavigationPathOpening = (feature: FloorFeature): boolean =>
  isOpeningFeature(feature) && feature.properties.category === "pedestrian";

export const readNavigationNodeCategory = (
  feature: FloorFeature,
): NavigationNodeCategory | undefined => {
  const category = readOpeningCategory(feature);
  if (
    typeof category === "string" &&
    (NAVIGATION_NODE_CATEGORIES as readonly string[]).includes(category)
  ) {
    return category as NavigationNodeCategory;
  }
  return undefined;
};

export const readNavigationPathCategory = (feature: FloorFeature): NavigationPathCategory => {
  if (
    feature.properties.accessibility &&
    typeof feature.properties.accessibility === "object" &&
    !Array.isArray(feature.properties.accessibility) &&
    (feature.properties.accessibility as { wheelchair?: unknown }).wheelchair === true
  ) {
    return "wheelchair";
  }
  return "pedestrian";
};

export const featureHasLevel = (feature: FloorFeature, levelId: string): boolean =>
  feature.properties.level_id === levelId ||
  feature.properties.floorId === levelId ||
  (!feature.properties.level_id && !feature.properties.floorId);

export const coordinatesEqual = (left: Coordinates, right: Coordinates, epsilon = 1e-7): boolean =>
  Math.abs(left[0] - right[0]) <= epsilon && Math.abs(left[1] - right[1]) <= epsilon;

export const openingPointToLine = (
  point: Coordinates,
  span = 0.00003,
): Extract<FloorFeature["geometry"], { type: "LineString" }> => ({
  type: "LineString",
  coordinates: [
    [point[0] - span, point[1]],
    [point[0] + span, point[1]],
  ],
});

export const openingRepresentativePoint = (feature: FloorFeature): Coordinates | undefined => {
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
  if (!ring || ring.length === 0) {
    return undefined;
  }
  const first = ring[0];
  const last = ring[ring.length - 1] ?? first;
  if (!first || !last) {
    return undefined;
  }
  return [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
};
