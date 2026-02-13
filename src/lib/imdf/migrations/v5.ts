import { createId } from "../../id";
import {
  NAVIGATION_EDGE_FEATURE_TYPE,
  NAVIGATION_NODE_CATEGORIES,
  NAVIGATION_NODE_FEATURE_TYPE,
  type NavigationNodeCategory,
} from "../../navigation/navigationModel";
import type { Coordinates, FloorFeature, ProjectSnapshot } from "../../types";
import { normalizeFeature } from "../normalize";

const coordinateKey = (coordinate: Coordinates): string =>
  `${Math.round(coordinate[0] * 1e7)}:${Math.round(coordinate[1] * 1e7)}`;

const categoryToNodeCategory = (category: unknown): NavigationNodeCategory => {
  if (
    typeof category === "string" &&
    (NAVIGATION_NODE_CATEGORIES as readonly string[]).includes(category)
  ) {
    return category as NavigationNodeCategory;
  }
  return "entrance";
};

export const migrateProjectSnapshotToNavigationGraphV5 = (
  snapshot: ProjectSnapshot,
): ProjectSnapshot => {
  const features: FloorFeature[] = [];
  const nodeIdByKey = new Map<string, string>();
  const floorById = new Map(
    (snapshot.floors ?? snapshot.levels ?? []).map((floor) => [floor.id, floor]),
  );
  const defaultFloor = (snapshot.floors ?? snapshot.levels ?? [])[0];
  const defaultBuilding = (snapshot.buildings ?? [])[0];

  const resolveBuildingId = (levelId: string | undefined): string =>
    (levelId ? floorById.get(levelId)?.buildingId : undefined) ?? defaultBuilding?.id ?? "";

  const addOrReuseNode = (
    coordinate: Coordinates,
    levelId: string | undefined,
    category: NavigationNodeCategory,
  ): string => {
    const resolvedLevelId = levelId ?? defaultFloor?.id ?? "";
    const key = `${resolvedLevelId}:${coordinateKey(coordinate)}`;
    const existingId = nodeIdByKey.get(key);
    if (existingId) {
      return existingId;
    }
    const nodeId = createId();
    nodeIdByKey.set(key, nodeId);
    features.push(
      normalizeFeature(
        {
          type: "Feature",
          id: nodeId,
          feature_type: NAVIGATION_NODE_FEATURE_TYPE,
          geometry: {
            type: "Point",
            coordinates: coordinate,
          },
          properties: {
            name: { en: "Navigation node" },
            level_id: resolvedLevelId,
            floorId: resolvedLevelId,
            "formation:navigation_category": category,
            "formation:navigation_levels": [resolvedLevelId],
          },
        },
        {
          level_id: resolvedLevelId,
          buildingId: resolveBuildingId(resolvedLevelId),
        },
      ),
    );
    return nodeId;
  };

  for (const feature of snapshot.features) {
    const type =
      typeof feature.feature_type === "string" ? feature.feature_type : feature.properties.kind;
    if (type !== "opening" || feature.geometry.type !== "LineString") {
      features.push(feature);
      continue;
    }

    const start = feature.geometry.coordinates[0];
    const end = feature.geometry.coordinates[feature.geometry.coordinates.length - 1];
    if (!start || !end) {
      continue;
    }

    const levelId =
      typeof feature.properties.level_id === "string"
        ? feature.properties.level_id
        : typeof feature.properties.floorId === "string"
          ? feature.properties.floorId
          : defaultFloor?.id;
    const nodeCategory = categoryToNodeCategory(feature.properties.category);
    const fromNodeId = addOrReuseNode(start, levelId, nodeCategory);
    const toNodeId = addOrReuseNode(end, levelId, nodeCategory);
    const pathCategory = feature.properties.category === "wheelchair" ? "wheelchair" : "pedestrian";

    features.push(
      normalizeFeature(
        {
          ...feature,
          feature_type: NAVIGATION_EDGE_FEATURE_TYPE,
          properties: {
            ...feature.properties,
            kind: NAVIGATION_EDGE_FEATURE_TYPE,
            feature_type: NAVIGATION_EDGE_FEATURE_TYPE,
            "formation:path_category": pathCategory,
            "formation:from_node_id": fromNodeId,
            "formation:to_node_id": toNodeId,
            ...(levelId ? { level_id: levelId, floorId: levelId } : {}),
          },
        },
        {
          level_id: levelId ?? "",
          buildingId: resolveBuildingId(levelId),
        },
      ),
    );
  }

  return {
    ...snapshot,
    version: Math.max(snapshot.version, 6),
    features,
  };
};
