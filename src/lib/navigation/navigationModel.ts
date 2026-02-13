import type { Coordinates, FloorFeature } from "../types";

export const NAVIGATION_NODE_FEATURE_TYPE = "formation:navigation-node";
export const NAVIGATION_EDGE_FEATURE_TYPE = "formation:navigation-edge";

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

export const NAVIGATION_EDGE_CATEGORIES = ["pedestrian", "wheelchair"] as const;
export type NavigationEdgeCategory = (typeof NAVIGATION_EDGE_CATEGORIES)[number];

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

export const isNavigationNodeFeature = (feature: FloorFeature): boolean =>
  readFeatureTypeString(feature) === NAVIGATION_NODE_FEATURE_TYPE;

export const isNavigationEdgeFeature = (feature: FloorFeature): boolean =>
  readFeatureTypeString(feature) === NAVIGATION_EDGE_FEATURE_TYPE;

export const readNavigationLevels = (feature: FloorFeature): string[] => {
  const raw = feature.properties["formation:navigation_levels"];
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  }
  const levelId =
    typeof feature.properties.level_id === "string"
      ? feature.properties.level_id
      : typeof feature.properties.floorId === "string"
        ? feature.properties.floorId
        : undefined;
  return levelId ? [levelId] : [];
};

export const featureHasLevel = (feature: FloorFeature, levelId: string): boolean => {
  if (isNavigationNodeFeature(feature)) {
    return readNavigationLevels(feature).includes(levelId);
  }
  return (
    feature.properties.level_id === levelId ||
    feature.properties.floorId === levelId ||
    (!feature.properties.level_id && !feature.properties.floorId)
  );
};

export const readNavigationNodeCategory = (
  feature: FloorFeature,
): NavigationNodeCategory | undefined => {
  const category = feature.properties["formation:navigation_category"];
  if (
    typeof category === "string" &&
    (NAVIGATION_NODE_CATEGORIES as readonly string[]).includes(category)
  ) {
    return category as NavigationNodeCategory;
  }
  return undefined;
};

export const readNavigationEdgeCategory = (
  feature: FloorFeature,
): NavigationEdgeCategory | undefined => {
  const category = feature.properties["formation:path_category"];
  if (
    typeof category === "string" &&
    (NAVIGATION_EDGE_CATEGORIES as readonly string[]).includes(category)
  ) {
    return category as NavigationEdgeCategory;
  }
  return undefined;
};

export const coordinatesEqual = (left: Coordinates, right: Coordinates, epsilon = 1e-7): boolean =>
  Math.abs(left[0] - right[0]) <= epsilon && Math.abs(left[1] - right[1]) <= epsilon;
