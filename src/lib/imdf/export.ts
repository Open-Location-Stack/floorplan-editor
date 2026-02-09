import type { Building, FeatureCollection, Floor, FloorFeature } from "../types";
import { normalizeFeature } from "./normalize";
import { sortOrderForFeatureType } from "./renderRules";

const sortKeysRecursively = (input: unknown): unknown => {
  if (Array.isArray(input)) {
    return input.map(sortKeysRecursively);
  }

  if (input && typeof input === "object") {
    return Object.keys(input as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = sortKeysRecursively((input as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return input;
};

export const sortFeaturesForRendering = (features: FloorFeature[]): FloorFeature[] =>
  [...features].sort((left, right) => {
    const leftType =
      typeof left.properties.imdfType === "string"
        ? left.properties.imdfType
        : left.properties.kind;
    const rightType =
      typeof right.properties.imdfType === "string"
        ? right.properties.imdfType
        : right.properties.kind;

    const order = sortOrderForFeatureType(leftType) - sortOrderForFeatureType(rightType);
    if (order !== 0) {
      return order;
    }

    return left.id.localeCompare(right.id);
  });

type ExportFloorInput = {
  building: Building;
  floor: Floor;
  features: FloorFeature[];
};

export const exportFloorGeoJson = ({
  building,
  floor,
  features,
}: ExportFloorInput): FeatureCollection => {
  const floorFeatures = features
    .filter((feature) => feature.properties.floorId === floor.id)
    .map((feature) => normalizeFeature(feature, { buildingId: building.id, floorId: floor.id }));

  return {
    type: "FeatureCollection",
    features: sortFeaturesForRendering(floorFeatures),
  };
};

export const exportFloorGeoJsonText = (input: ExportFloorInput): string =>
  JSON.stringify(sortKeysRecursively(exportFloorGeoJson(input)), null, 2);
