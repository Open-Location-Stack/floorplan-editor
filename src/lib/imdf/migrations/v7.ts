import { createId } from "../../id";
import {
  NAVIGATION_NODE_CATEGORIES,
  type NavigationNodeCategory,
  openingPointToLine,
  VERTICAL_NAVIGATION_NODE_CATEGORIES,
} from "../../navigation/navigationModel";
import type { Coordinates, FloorFeature, ProjectSnapshot } from "../../types";
import { normalizeFeature } from "../normalize";

type PendingEdgeLink = {
  edgeId: string;
  levelId?: string;
  fromLegacyNodeId?: string | undefined;
  toLegacyNodeId?: string | undefined;
};

const readLabelName = (value: unknown): { en: string } => {
  if (typeof value === "string" && value.trim().length > 0) {
    return { en: value.trim() };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const english = (value as { en?: unknown }).en;
    if (typeof english === "string" && english.trim().length > 0) {
      return { en: english.trim() };
    }
  }
  return { en: "Opening" };
};

const readLevelId = (feature: FloorFeature): string | undefined =>
  typeof feature.properties.level_id === "string" ? feature.properties.level_id : undefined;

const readBuildingId = (
  levelId: string | undefined,
  levelsById: Map<string, string>,
  fallbackBuildingId: string,
): string => (levelId ? levelsById.get(levelId) : undefined) ?? fallbackBuildingId;

const readCategory = (value: unknown): NavigationNodeCategory => {
  if (
    typeof value === "string" &&
    (NAVIGATION_NODE_CATEGORIES as readonly string[]).includes(value)
  ) {
    return value as NavigationNodeCategory;
  }
  return "entrance";
};

const stripNavigationExtensions = (feature: FloorFeature): FloorFeature => {
  const nextProperties = { ...feature.properties };
  delete nextProperties["formation:navigation_category"];
  delete nextProperties["formation:path_category"];
  delete nextProperties["formation:navigation_levels"];
  delete nextProperties["formation:from_node_id"];
  delete nextProperties["formation:to_node_id"];
  // biome-ignore lint/complexity/useLiteralKeys: index signature access required by TS noPropertyAccessFromIndexSignature
  delete nextProperties["__navigation_levels"];
  // biome-ignore lint/complexity/useLiteralKeys: index signature access required by TS noPropertyAccessFromIndexSignature
  delete nextProperties["__navigation_path_category"];
  // biome-ignore lint/complexity/useLiteralKeys: index signature access required by TS noPropertyAccessFromIndexSignature
  delete nextProperties["__navigation_from_opening_id"];
  // biome-ignore lint/complexity/useLiteralKeys: index signature access required by TS noPropertyAccessFromIndexSignature
  delete nextProperties["__navigation_to_opening_id"];
  return {
    ...feature,
    properties: nextProperties,
  };
};

const normalizeOpeningGeometry = (feature: FloorFeature): FloorFeature["geometry"] => {
  if (feature.geometry.type === "LineString") {
    return feature.geometry;
  }
  if (feature.geometry.type === "Point") {
    return openingPointToLine(feature.geometry.coordinates);
  }
  const first = feature.geometry.coordinates[0]?.[0] as Coordinates | undefined;
  return openingPointToLine(first ?? [0, 0]);
};

export const migrateProjectSnapshotToImdfNavigationV7 = (
  snapshot: ProjectSnapshot,
): ProjectSnapshot => {
  const floors = snapshot.floors ?? snapshot.levels ?? [];
  const levelsById = new Map(floors.map((floor) => [floor.id, floor.buildingId]));
  const defaultLevelId = floors[0]?.id ?? "";
  const defaultBuildingId = snapshot.buildings?.[0]?.id ?? "";

  const migratedFeatures: FloorFeature[] = [];
  const pendingEdgeLinks: PendingEdgeLink[] = [];
  const convertedNodeIdsByLegacyId = new Map<string, Map<string, string>>();
  const convertedNodeCategoryByLegacyId = new Map<string, NavigationNodeCategory>();

  const createOpeningFromNode = (
    source: FloorFeature,
    levelId: string,
    category: NavigationNodeCategory,
  ): FloorFeature => {
    const point =
      source.geometry.type === "Point"
        ? source.geometry.coordinates
        : source.geometry.type === "LineString"
          ? (source.geometry.coordinates[0] ?? [0, 0])
          : ((source.geometry.coordinates[0]?.[0] as Coordinates | undefined) ?? [0, 0]);
    return normalizeFeature(
      {
        ...stripNavigationExtensions(source),
        id: createId(),
        feature_type: "opening",
        geometry: openingPointToLine(point),
        properties: {
          ...stripNavigationExtensions(source).properties,
          name: readLabelName(source.properties.name),
          category,
          level_id: levelId,
        },
      },
      {
        level_id: levelId,
        buildingId: readBuildingId(levelId, levelsById, defaultBuildingId),
      },
    );
  };

  for (const feature of snapshot.features) {
    const rawType = typeof feature.feature_type === "string" ? feature.feature_type : "";

    if (rawType === "formation:navigation-node") {
      const legacyLevelsRaw = feature.properties["formation:navigation_levels"];
      const levels = Array.isArray(legacyLevelsRaw)
        ? legacyLevelsRaw.filter((entry): entry is string => typeof entry === "string")
        : [];
      const fallbackLevel = readLevelId(feature) ?? defaultLevelId;
      const resolvedLevels = [...new Set(levels.length > 0 ? levels : [fallbackLevel])].filter(
        (levelId) => levelId.length > 0,
      );
      const category = readCategory(feature.properties["formation:navigation_category"]);
      convertedNodeCategoryByLegacyId.set(feature.id, category);
      const mapByLevel = new Map<string, string>();
      for (const levelId of resolvedLevels) {
        const converted = createOpeningFromNode(feature, levelId, category);
        migratedFeatures.push(converted);
        mapByLevel.set(levelId, converted.id);
      }
      convertedNodeIdsByLegacyId.set(feature.id, mapByLevel);
      continue;
    }

    if (rawType === "formation:navigation-edge") {
      const levelId = readLevelId(feature) ?? defaultLevelId;
      const opening = normalizeFeature(
        {
          ...stripNavigationExtensions(feature),
          feature_type: "opening",
          geometry: normalizeOpeningGeometry(feature),
          properties: {
            ...stripNavigationExtensions(feature).properties,
            category: "pedestrian",
            ...(feature.properties["formation:path_category"] === "wheelchair"
              ? { accessibility: { wheelchair: true } }
              : {}),
            level_id: levelId,
          },
        },
        {
          level_id: levelId,
          buildingId: readBuildingId(levelId, levelsById, defaultBuildingId),
        },
      );
      migratedFeatures.push(opening);
      pendingEdgeLinks.push({
        edgeId: opening.id,
        levelId,
        ...(typeof feature.properties["formation:from_node_id"] === "string"
          ? { fromLegacyNodeId: feature.properties["formation:from_node_id"] }
          : {}),
        ...(typeof feature.properties["formation:to_node_id"] === "string"
          ? { toLegacyNodeId: feature.properties["formation:to_node_id"] }
          : {}),
      });
      continue;
    }

    const stripped = stripNavigationExtensions(feature);
    if (rawType === "opening") {
      const category =
        stripped.properties.category === "wheelchair" ? "pedestrian" : stripped.properties.category;
      migratedFeatures.push(
        normalizeFeature(
          {
            ...stripped,
            feature_type: "opening",
            geometry: normalizeOpeningGeometry(stripped),
            properties: {
              ...stripped.properties,
              category:
                typeof category === "string" && category.trim().length > 0
                  ? category
                  : "pedestrian",
              ...(stripped.properties.category === "wheelchair"
                ? { accessibility: { wheelchair: true } }
                : {}),
            },
          },
          {
            level_id: readLevelId(stripped) ?? defaultLevelId,
            buildingId: readBuildingId(readLevelId(stripped), levelsById, defaultBuildingId),
          },
        ),
      );
      continue;
    }

    migratedFeatures.push(stripped);
  }

  for (const link of pendingEdgeLinks) {
    const fromId = link.fromLegacyNodeId
      ? (convertedNodeIdsByLegacyId.get(link.fromLegacyNodeId)?.get(link.levelId ?? "") ??
        [...(convertedNodeIdsByLegacyId.get(link.fromLegacyNodeId)?.values() ?? [])][0])
      : undefined;
    const toId = link.toLegacyNodeId
      ? (convertedNodeIdsByLegacyId.get(link.toLegacyNodeId)?.get(link.levelId ?? "") ??
        [...(convertedNodeIdsByLegacyId.get(link.toLegacyNodeId)?.values() ?? [])][0])
      : undefined;

    for (const nodeId of [fromId, toId]) {
      if (!nodeId) {
        continue;
      }
      migratedFeatures.push(
        normalizeFeature(
          {
            type: "Feature",
            id: createId(),
            feature_type: "relationship",
            geometry: {
              type: "LineString",
              coordinates: [
                [0, 0],
                [0, 0],
              ],
            },
            properties: {
              name: { en: "Navigation link" },
              ...(typeof link.levelId === "string" ? { level_id: link.levelId } : {}),
              direction: "undirected",
              origin: { id: link.edgeId, feature_type: "opening" },
              destination: { id: nodeId, feature_type: "opening" },
            },
          },
          {
            level_id: link.levelId ?? defaultLevelId,
            buildingId: readBuildingId(link.levelId, levelsById, defaultBuildingId),
          },
        ),
      );
    }
  }

  for (const [legacyNodeId, byLevel] of convertedNodeIdsByLegacyId.entries()) {
    const category = convertedNodeCategoryByLegacyId.get(legacyNodeId);
    if (!category || !VERTICAL_NAVIGATION_NODE_CATEGORIES.has(category)) {
      continue;
    }
    const entries = [...byLevel.entries()];
    for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
      const left = entries[leftIndex];
      if (!left) {
        continue;
      }
      for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
        const right = entries[rightIndex];
        if (!right) {
          continue;
        }
        const [leftLevel, leftNodeId] = left;
        const [, rightNodeId] = right;
        migratedFeatures.push(
          normalizeFeature(
            {
              type: "Feature",
              id: createId(),
              feature_type: "relationship",
              geometry: {
                type: "LineString",
                coordinates: [
                  [0, 0],
                  [0, 0],
                ],
              },
              properties: {
                name: { en: "Vertical connector" },
                level_id: leftLevel,
                direction: "undirected",
                origin: { id: leftNodeId, feature_type: "opening" },
                destination: { id: rightNodeId, feature_type: "opening" },
              },
            },
            {
              level_id: leftLevel,
              buildingId: readBuildingId(leftLevel, levelsById, defaultBuildingId),
            },
          ),
        );
      }
    }
  }

  return {
    ...snapshot,
    version: Math.max(snapshot.version, 7),
    features: migratedFeatures,
  };
};
