/* biome-ignore-all lint/complexity/useLiteralKeys: bracket notation is required by noPropertyAccessFromIndexSignature */
import type { FloorFeature, ImdfFeatureType } from "../types";
import { IMDF_STANDARD_DATASET_TYPES } from "./archiveExport";
import { getFeatureSpec, readImdfType } from "./featureCatalog";

export type FloorValidationResult = {
  errors: string[];
  warnings: string[];
};

export const validateFloor = (floorId: string, features: FloorFeature[]): FloorValidationResult => {
  const floorFeatures = features.filter((feature) => feature.properties.floorId === floorId);
  const allIds = new Set(features.map((feature) => feature.id));
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const feature of floorFeatures) {
    const featureType =
      readImdfType(feature.properties.imdfType) ?? readImdfType(feature.properties.kind);
    if (feature.properties.level_id !== floorId) {
      errors.push(`Feature ${feature.id} is not assigned to level_id ${floorId}.`);
    }
    if (!featureType) {
      warnings.push(`Feature ${feature.id} has no IMDF type.`);
      continue;
    }
    const spec = getFeatureSpec(featureType);
    for (const field of spec.fields.filter((entry) => entry.required)) {
      const value = feature.properties[field.key];
      if (value === undefined || value === null) {
        errors.push(`Feature ${feature.id} is missing required ${field.key}.`);
        continue;
      }
      if (field.type === "string" || field.type === "uuid") {
        if (typeof value !== "string" || value.trim().length === 0) {
          errors.push(`Feature ${feature.id} has invalid ${field.key}.`);
        }
      }
      if (field.type === "number") {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          errors.push(`Feature ${feature.id} has invalid ${field.key}.`);
        }
      }
      if (field.type === "boolean" && typeof value !== "boolean") {
        errors.push(`Feature ${feature.id} has invalid ${field.key}.`);
      }
      if (field.type === "label") {
        if (
          typeof value !== "object" ||
          !value ||
          Array.isArray(value) ||
          Object.values(value).some((entry) => typeof entry !== "string")
        ) {
          errors.push(`Feature ${feature.id} has invalid ${field.key}.`);
        }
      }
      if (field.type === "string[]" && (!Array.isArray(value) || value.length === 0)) {
        errors.push(`Feature ${feature.id} has invalid ${field.key}.`);
      }
      if (field.type === "references") {
        if (!Array.isArray(value) || value.length < 2) {
          errors.push(`Feature ${feature.id} has invalid references.`);
        } else {
          for (const ref of value) {
            if (
              !ref ||
              typeof ref !== "object" ||
              !("id" in ref) ||
              typeof ref["id"] !== "string" ||
              !allIds.has(ref["id"])
            ) {
              errors.push(`Feature ${feature.id} has references to missing feature ids.`);
              break;
            }
          }
        }
      }
    }
  }
  return { errors, warnings };
};

export type ImdfDatasetValidationResult = {
  errors: string[];
  warnings: string[];
};

const REQUIRED_IMDF_DATASET_FILES = [
  "manifest.json",
  "venue.geojson",
  "building.geojson",
  "footprint.geojson",
  "level.geojson",
  "unit.geojson",
];

const parseImdfFeatureTypeFromFilename = (filename: string): ImdfFeatureType | undefined => {
  if (!filename.endsWith(".geojson")) {
    return undefined;
  }
  return readImdfType(filename.slice(0, -".geojson".length));
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCoordinate = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === "number" &&
  Number.isFinite(value[0]) &&
  typeof value[1] === "number" &&
  Number.isFinite(value[1]);

const isLabelObject = (value: unknown): value is Record<string, string> =>
  isRecord(value) &&
  Object.keys(value).length > 0 &&
  Object.values(value).every((entry) => typeof entry === "string" && entry.trim().length > 0);

const validateGeometry = (
  featureType: string,
  geometry: unknown,
  context: string,
  errors: string[],
): void => {
  if (featureType === "building" || featureType === "relationship") {
    if (geometry !== null) {
      errors.push(`${context} ${featureType} geometry must be null.`);
    }
    return;
  }

  const expectedType = getFeatureSpec(featureType as ImdfFeatureType).geometryType;
  if (!isRecord(geometry)) {
    errors.push(`${context} has invalid geometry.`);
    return;
  }
  if (geometry["type"] !== expectedType) {
    errors.push(`${context} must use ${expectedType} geometry.`);
    return;
  }
  if (expectedType === "Point") {
    if (!isCoordinate(geometry["coordinates"])) {
      errors.push(`${context} has invalid point coordinates.`);
    }
    return;
  }
  if (expectedType === "LineString") {
    const coordinates = geometry["coordinates"];
    if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(isCoordinate)) {
      errors.push(`${context} has invalid line coordinates.`);
    }
    return;
  }
  const coordinates = geometry["coordinates"];
  const ring = Array.isArray(coordinates) ? coordinates[0] : undefined;
  if (!Array.isArray(ring) || ring.length < 4 || !ring.every(isCoordinate)) {
    errors.push(`${context} has invalid polygon coordinates.`);
  }
};

const validateFieldValue = (
  key: string,
  expected: "string" | "number" | "boolean" | "label" | "string[]" | "uuid" | "references",
  value: unknown,
  context: string,
  errors: string[],
): void => {
  if (expected === "string") {
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push(`${context} properties.${key} must be a non-empty string.`);
    }
    return;
  }
  if (expected === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`${context} properties.${key} must be a finite number.`);
    }
    return;
  }
  if (expected === "boolean") {
    if (typeof value !== "boolean") {
      errors.push(`${context} properties.${key} must be a boolean.`);
    }
    return;
  }
  if (expected === "label") {
    if (!isLabelObject(value)) {
      errors.push(`${context} properties.${key} must be a label object.`);
    }
    return;
  }
  if (expected === "string[]") {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      !value.every((entry) => typeof entry === "string")
    ) {
      errors.push(`${context} properties.${key} must be a non-empty string array.`);
    }
    return;
  }
  if (expected === "references") {
    if (
      !Array.isArray(value) ||
      value.length < 2 ||
      !value.every(
        (entry) =>
          isRecord(entry) &&
          typeof entry["id"] === "string" &&
          typeof entry["feature_type"] === "string",
      )
    ) {
      errors.push(`${context} properties.${key} must be a references array.`);
    }
    return;
  }
  if (!isUuid(value)) {
    errors.push(`${context} properties.${key} must be a UUID.`);
  }
};

export const validateImdfDatasetFiles = (
  files: Record<string, unknown>,
): ImdfDatasetValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const knownIds = new Set<string>();
  const refs: Array<{ source: string; target: string; field: string }> = [];

  for (const file of REQUIRED_IMDF_DATASET_FILES) {
    if (!(file in files)) {
      errors.push(`Missing required IMDF file: ${file}.`);
    }
  }

  const manifestRaw = files["manifest.json"];
  if (!isRecord(manifestRaw)) {
    errors.push("manifest.json must contain a JSON object.");
  } else {
    if (manifestRaw["version"] !== "1.0.0") {
      warnings.push("manifest.json version should be 1.0.0.");
    }
    if (!Array.isArray(manifestRaw["files"])) {
      errors.push("manifest.json files must be an array.");
    } else {
      const names = new Set(
        manifestRaw["files"]
          .map((entry) =>
            isRecord(entry) && typeof entry["name"] === "string" ? entry["name"] : undefined,
          )
          .filter((entry): entry is string => Boolean(entry)),
      );
      for (const type of IMDF_STANDARD_DATASET_TYPES) {
        const fileName = `${type}.geojson`;
        if (fileName in files && !names.has(fileName)) {
          warnings.push(`manifest.json does not list ${fileName}.`);
        }
      }
    }
  }

  for (const [filename, rawCollection] of Object.entries(files)) {
    const type = parseImdfFeatureTypeFromFilename(filename);
    if (!type) {
      continue;
    }
    if (!isRecord(rawCollection) || rawCollection["type"] !== "FeatureCollection") {
      errors.push(`${filename} must be a FeatureCollection.`);
      continue;
    }
    if (!Array.isArray(rawCollection["features"])) {
      errors.push(`${filename} must contain a features array.`);
      continue;
    }
    const spec = getFeatureSpec(type);
    for (const [index, rawFeature] of rawCollection["features"].entries()) {
      const context = `${filename} feature[${index}]`;
      if (!isRecord(rawFeature) || rawFeature["type"] !== "Feature") {
        errors.push(`${context} must be a GeoJSON Feature.`);
        continue;
      }
      if (!isUuid(rawFeature["id"])) {
        errors.push(`${context} has non-UUID id.`);
      } else if (knownIds.has(rawFeature["id"])) {
        errors.push(`${context} has duplicate id ${rawFeature["id"]}.`);
      } else {
        knownIds.add(rawFeature["id"]);
      }
      if (rawFeature["feature_type"] !== type) {
        errors.push(`${context} must have feature_type "${type}".`);
      }
      validateGeometry(type, rawFeature["geometry"], context, errors);
      if (!isRecord(rawFeature["properties"])) {
        errors.push(`${context} must contain a properties object.`);
        continue;
      }
      for (const field of spec.fields.filter((entry) => entry.required)) {
        if (!(field.key in rawFeature["properties"])) {
          errors.push(`${context} missing required properties.${field.key}.`);
          continue;
        }
        validateFieldValue(
          field.key,
          field.type,
          rawFeature["properties"][field.key],
          context,
          errors,
        );
      }

      for (const [key, value] of Object.entries(rawFeature["properties"])) {
        if (key.endsWith("_id")) {
          if (isUuid(value)) {
            refs.push({ source: String(rawFeature["id"]), target: value, field: key });
          }
        }
        if (key.endsWith("_ids") && Array.isArray(value)) {
          for (const maybeId of value) {
            if (isUuid(maybeId)) {
              refs.push({ source: String(rawFeature["id"]), target: maybeId, field: key });
            }
          }
        }
      }
    }
  }

  for (const ref of refs) {
    if (!knownIds.has(ref.target)) {
      errors.push(`Reference ${ref.field} from ${ref.source} points to missing id ${ref.target}.`);
    }
  }

  return { errors, warnings };
};
