import { createId } from "./id";
import type { Floor, FloorFeature, FloorOverlay, JsonValue } from "./types";

type CloneFloorOptions = {
  floor: Floor;
  floors: Floor[];
  features: FloorFeature[];
  overlays: FloorOverlay[];
  createIdFn?: () => string;
  timestamp?: string;
};

type CloneFloorResult = {
  floor: Floor;
  features: FloorFeature[];
  overlay: FloorOverlay | undefined;
};

const deepClone = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
};

const remapJsonValue = (value: JsonValue, idMap: ReadonlyMap<string, string>): JsonValue => {
  if (typeof value === "string") {
    return idMap.get(value) ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => remapJsonValue(entry, idMap));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).reduce<Record<string, JsonValue>>((accumulator, [key, entry]) => {
      accumulator[key] = remapJsonValue(entry, idMap);
      return accumulator;
    }, {});
  }

  return value;
};

const remapOptionalJsonValue = (
  value: JsonValue | undefined,
  idMap: ReadonlyMap<string, string>,
): JsonValue | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return remapJsonValue(value, idMap);
};

const nextCopiedFloorName = (sourceName: string, floorsInBuilding: Floor[]): string => {
  const existing = new Set(
    floorsInBuilding
      .filter((floor) => floor.name.startsWith(sourceName))
      .map((floor) => floor.name),
  );

  const firstCandidate = `${sourceName} copy`;
  if (!existing.has(firstCandidate)) {
    return firstCandidate;
  }

  let copyNumber = 2;
  while (existing.has(`${sourceName} copy ${copyNumber}`)) {
    copyNumber += 1;
  }

  return `${sourceName} copy ${copyNumber}`;
};

export const cloneFloorWithReferences = ({
  floor,
  floors,
  features,
  overlays,
  createIdFn = createId,
  timestamp = new Date().toISOString(),
}: CloneFloorOptions): CloneFloorResult => {
  const floorFeatures = features.filter((feature) => feature.properties.floorId === floor.id);
  const sourceOverlay = overlays.find((overlay) => overlay.floorId === floor.id);
  const floorsInBuilding = floors.filter((current) => current.buildingId === floor.buildingId);

  const clonedFloorId = createIdFn();
  const featureIdMap = new Map<string, string>(
    floorFeatures.map((feature) => [feature.id, createIdFn()]),
  );
  const idMap = new Map<string, string>([[floor.id, clonedFloorId], ...featureIdMap.entries()]);

  const clonedFeatures = floorFeatures.map((sourceFeature) => {
    const clonedFeature = deepClone(sourceFeature);
    const clonedFeatureId = featureIdMap.get(sourceFeature.id) ?? createIdFn();

    clonedFeature.id = clonedFeatureId;
    const remappedProperties = deepClone(clonedFeature.properties);
    for (const [key, value] of Object.entries(remappedProperties)) {
      remappedProperties[key] = remapOptionalJsonValue(value, idMap);
    }
    clonedFeature.properties = remappedProperties;
    clonedFeature.properties.id = clonedFeatureId;
    clonedFeature.properties.imdf_id = clonedFeatureId;
    clonedFeature.properties.floorId = clonedFloorId;
    clonedFeature.properties.floor_id = clonedFloorId;
    clonedFeature.properties.level_id = clonedFloorId;
    clonedFeature.properties.buildingId = floor.buildingId;
    clonedFeature.properties.building_id = floor.buildingId;

    return clonedFeature;
  });

  const clonedOverlay = sourceOverlay
    ? {
        ...deepClone(sourceOverlay),
        id: createIdFn(),
        floorId: clonedFloorId,
        updatedAt: timestamp,
      }
    : undefined;

  return {
    floor: {
      ...floor,
      id: clonedFloorId,
      name: nextCopiedFloorName(floor.name, floorsInBuilding),
    },
    features: clonedFeatures,
    overlay: clonedOverlay,
  };
};
