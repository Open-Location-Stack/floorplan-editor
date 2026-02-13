import type { ProjectSnapshot } from "../../types";
import { normalizeFeature } from "../normalize";

const LEGACY_TYPES = new Set(["path", "pathway", "zone"]);

export const migrateProjectSnapshotToImdfV4 = (snapshot: ProjectSnapshot): ProjectSnapshot => {
  const floors = snapshot.floors ?? [];
  const buildings = snapshot.buildings ?? [];
  const floorById = new Map(floors.map((floor) => [floor.id, floor]));
  const defaultFloor = floors[0];
  const defaultBuilding = buildings[0];

  const features = snapshot.features
    .filter((feature) => {
      const type =
        typeof feature.feature_type === "string" ? feature.feature_type : feature.feature_type;
      return !LEGACY_TYPES.has(type ?? "");
    })
    .map((feature) => {
      const normalizedType =
        (typeof feature.feature_type === "string" ? feature.feature_type : feature.feature_type) ===
          "relationship" && feature.geometry.type === "LineString"
          ? "opening"
          : undefined;
      const level_id =
        typeof feature.properties.level_id === "string"
          ? feature.properties.level_id
          : defaultFloor?.id;
      const buildingId =
        (level_id ? floorById.get(level_id)?.buildingId : undefined) ?? defaultBuilding?.id ?? "";
      return normalizeFeature(
        {
          ...feature,
          properties: {
            ...feature.properties,
            ...(normalizedType
              ? {
                  kind: normalizedType,
                  feature_type: normalizedType,
                  category:
                    typeof feature.properties.category === "string"
                      ? feature.properties.category
                      : "pedestrian",
                }
              : {}),
            ...(level_id ? { level_id } : {}),
          },
        },
        {
          level_id: level_id ?? "",
          buildingId,
        },
      );
    });

  return {
    ...snapshot,
    version: Math.max(snapshot.version, 4),
    features,
  };
};
