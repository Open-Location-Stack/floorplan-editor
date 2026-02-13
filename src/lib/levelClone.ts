import { createId } from "./id";
import type { Floor, FloorFeature, FloorOverlay, JsonValue } from "./types";

type CloneLevelOptions = {
  level: Floor;
  levels: Floor[];
  features: FloorFeature[];
  overlays: FloorOverlay[];
  createIdFn?: () => string;
  timestamp?: string;
};

type CloneLevelResult = {
  level: Floor;
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

const nextCopiedLevelName = (sourceName: string, levelsInBuilding: Floor[]): string => {
  const existing = new Set(
    levelsInBuilding
      .filter((level) => level.name.startsWith(sourceName))
      .map((level) => level.name),
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

export const cloneLevelWithReferences = ({
  level,
  levels,
  features,
  overlays,
  createIdFn = createId,
  timestamp = new Date().toISOString(),
}: CloneLevelOptions): CloneLevelResult => {
  const levelFeatures = features.filter(
    (feature) =>
      feature.properties.level_id === level.id || feature.properties.floorId === level.id,
  );
  const sourceOverlay = overlays.find(
    (overlay) => overlay.level_id === level.id || overlay.floorId === level.id,
  );
  const levelsInBuilding = levels.filter((current) => current.buildingId === level.buildingId);

  const clonedLevelId = createIdFn();
  const featureIdMap = new Map<string, string>(
    levelFeatures.map((feature) => [feature.id, createIdFn()]),
  );
  const idMap = new Map<string, string>([[level.id, clonedLevelId], ...featureIdMap.entries()]);

  const clonedFeatures = levelFeatures.map((sourceFeature) => {
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
    clonedFeature.properties.level_id = clonedLevelId;
    clonedFeature.properties.floorId = clonedLevelId;
    clonedFeature.properties.floor_id = clonedLevelId;
    clonedFeature.properties.buildingId = level.buildingId;
    clonedFeature.properties.building_id = level.buildingId;

    return clonedFeature;
  });

  const clonedOverlay = sourceOverlay
    ? {
        ...deepClone(sourceOverlay),
        id: createIdFn(),
        floorId: clonedLevelId,
        level_id: clonedLevelId,
        updatedAt: timestamp,
      }
    : undefined;

  return {
    level: {
      ...level,
      id: clonedLevelId,
      name: nextCopiedLevelName(level.name, levelsInBuilding),
    },
    features: clonedFeatures,
    overlay: clonedOverlay,
  };
};
