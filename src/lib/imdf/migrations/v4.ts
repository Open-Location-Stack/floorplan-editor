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
        typeof feature.properties.imdfType === "string"
          ? feature.properties.imdfType
          : feature.properties.kind;
      return !LEGACY_TYPES.has(type ?? "");
    })
    .map((feature) => {
      const normalizedType =
        (typeof feature.properties.imdfType === "string"
          ? feature.properties.imdfType
          : feature.properties.kind) === "relationship" && feature.geometry.type === "LineString"
          ? "opening"
          : undefined;
      const floorId =
        typeof feature.properties.floorId === "string"
          ? feature.properties.floorId
          : defaultFloor?.id;
      const buildingId =
        (floorId ? floorById.get(floorId)?.buildingId : undefined) ?? defaultBuilding?.id ?? "";
      return normalizeFeature(
        {
          ...feature,
          properties: {
            ...feature.properties,
            ...(normalizedType
              ? {
                  kind: normalizedType,
                  imdfType: normalizedType,
                  category:
                    typeof feature.properties.category === "string"
                      ? feature.properties.category
                      : "pedestrian",
                }
              : {}),
            ...(floorId ? { floorId } : {}),
          },
        },
        {
          floorId: floorId ?? "",
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
