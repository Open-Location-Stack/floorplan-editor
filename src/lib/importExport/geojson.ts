import type { FeatureCollection, FloorFeature } from "../types";
import { assertFeature, validateFeatureCollection } from "../validation/geojsonValidation";

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

export const normalizeFeatures = (features: unknown[]): FloorFeature[] =>
  features
    .map((feature) => assertFeature(feature))
    .filter((feature) => feature.feature_type !== "relationship");

export const parseGeoJsonImport = (
  raw: string,
): { ok: true; features: FloorFeature[] } | { ok: false; errors: string[] } => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      errors: ["Invalid JSON format."],
    };
  }

  const validated = validateFeatureCollection(parsed);
  if (!validated.ok) {
    return validated;
  }

  return {
    ok: true,
    features: normalizeFeatures(validated.value.features),
  };
};

export const exportGeoJson = (features: FloorFeature[]): string => {
  const collection: FeatureCollection = {
    type: "FeatureCollection",
    features,
  };

  const sorted = sortKeysRecursively(collection);
  return JSON.stringify(sorted, null, 2);
};
