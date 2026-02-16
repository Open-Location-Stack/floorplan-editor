/* biome-ignore-all lint/complexity/useLiteralKeys: bracket notation is required by noPropertyAccessFromIndexSignature */
import type { FloorFeature, ImdfFeatureType } from "../types";
import { getFeatureSpec, readImdfType } from "./featureCatalog";
import {
  imdfCollectionFileName,
  imdfCollectionFileNameAliases,
  resolveAliasFilename,
} from "./fileNames";

export type FloorValidationResult = {
  errors: string[];
  warnings: string[];
};

const describeValue = (value: unknown): string => {
  if (typeof value === "undefined") {
    return "undefined";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const isLabel = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length > 0 &&
  Object.values(value).every((entry) => typeof entry === "string" && entry.trim().length > 0);

const readFeatureName = (feature: FloorFeature): string | undefined => {
  const { name } = feature.properties;
  if (typeof name === "string" && name.trim().length > 0) {
    return name.trim();
  }
  if (name && typeof name === "object" && !Array.isArray(name)) {
    const english = name["en"];
    if (typeof english === "string" && english.trim().length > 0) {
      return english.trim();
    }
    for (const value of Object.values(name)) {
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }
  return undefined;
};

const describeFeature = (feature: FloorFeature): string => {
  const featureName = readFeatureName(feature);
  if (featureName) {
    return `Feature "${featureName}" (id: ${feature.id})`;
  }
  return `Feature ${feature.id}`;
};

export const validateFloor = (
  level_id: string,
  features: FloorFeature[],
): FloorValidationResult => {
  const floorFeatures = features.filter((feature) => {
    const featureLevelId =
      typeof feature.properties.level_id === "string"
        ? feature.properties.level_id
        : feature.properties.floorId;
    return featureLevelId === level_id || featureLevelId === undefined;
  });
  const allIds = new Set(features.map((feature) => feature.id));
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const feature of floorFeatures) {
    const featureDescription = describeFeature(feature);
    const featureType =
      readImdfType(feature.feature_type) ??
      readImdfType(feature.properties.imdfType) ??
      readImdfType(feature.properties.kind);
    if (feature.properties.level_id !== level_id) {
      errors.push(`${featureDescription} is not assigned to level_id ${level_id}.`);
    }
    if (!featureType) {
      warnings.push(`${featureDescription} has no IMDF type.`);
      continue;
    }
    const spec = getFeatureSpec(featureType);
    for (const field of spec.fields.filter((entry) => entry.required)) {
      const value = feature.properties[field.key];
      if (value === undefined || value === null) {
        errors.push(`${featureDescription} is missing required ${field.key}.`);
        continue;
      }
      if (field.type === "string" || field.type === "uuid") {
        if (typeof value !== "string" || value.trim().length === 0) {
          errors.push(
            `${featureDescription} has invalid ${field.key}: ${describeValue(value)}. Expected a non-empty string.`,
          );
        }
      }
      if (field.type === "number") {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          errors.push(
            `${featureDescription} has invalid ${field.key}: ${describeValue(value)}. Expected a finite number.`,
          );
        }
      }
      if (field.type === "boolean" && typeof value !== "boolean") {
        errors.push(
          `${featureDescription} has invalid ${field.key}: ${describeValue(value)}. Expected true or false.`,
        );
      }
      if (field.type === "label") {
        if (!isLabel(value)) {
          errors.push(
            `${featureDescription} has invalid ${field.key}: ${describeValue(value)}. Expected a non-empty label object like {"en":"Name"}.`,
          );
        }
      }
      if (
        field.type === "string[]" &&
        (!Array.isArray(value) ||
          value.length === 0 ||
          value.some((entry) => typeof entry !== "string" || entry.trim().length === 0))
      ) {
        errors.push(
          `${featureDescription} has invalid ${field.key}: ${describeValue(value)}. Expected a non-empty array of non-empty strings.`,
        );
      }
      if (field.type === "reference") {
        if (
          typeof value !== "object" ||
          !value ||
          Array.isArray(value) ||
          !("id" in value) ||
          typeof value["id"] !== "string" ||
          !allIds.has(value["id"])
        ) {
          errors.push(`${featureDescription} has ${field.key} reference to missing feature id.`);
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

export type ImdfDatasetValidationOptions = {
  mode?: "strict" | "import-lenient";
};

const IMDF_STANDARD_DATASET_TYPES = [
  "address",
  "amenity",
  "anchor",
  "building",
  "directory",
  "detail",
  "fixture",
  "footprint",
  "geofence",
  "kiosk",
  "level",
  "occupant",
  "opening",
  "relationship",
  "section",
  "unit",
  "venue",
] as const;

const REQUIRED_IMDF_DATASET_TYPES = ["venue", "building", "footprint", "level", "unit"] as const;

const parseImdfFeatureTypeFromFilename = (filename: string): ImdfFeatureType | undefined => {
  if (filename.endsWith(".json")) {
    return readImdfType(filename.slice(0, -".json".length));
  }
  if (filename.endsWith(".geojson")) {
    return readImdfType(filename.slice(0, -".geojson".length));
  }
  return undefined;
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
  if (featureType === "building") {
    if (geometry !== null) {
      errors.push(`${context} building geometry must be null.`);
    }
    return;
  }
  if (featureType === "relationship") {
    if (geometry === null) {
      return;
    }
    if (
      !isRecord(geometry) ||
      geometry["type"] !== "LineString" ||
      !Array.isArray(geometry["coordinates"]) ||
      geometry["coordinates"].length < 2 ||
      !geometry["coordinates"].every(isCoordinate)
    ) {
      errors.push(`${context} relationship geometry must be null or a valid LineString.`);
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
  expected: "string" | "number" | "boolean" | "label" | "string[]" | "uuid" | "json" | "reference",
  value: unknown,
  context: string,
  errors: string[],
  warnings: string[],
  mode: "strict" | "import-lenient",
): void => {
  const issues = mode === "import-lenient" ? warnings : errors;
  if (expected === "string") {
    if (typeof value !== "string" || value.trim().length === 0) {
      issues.push(`${context} properties.${key} must be a non-empty string.`);
    }
    return;
  }
  if (expected === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      issues.push(`${context} properties.${key} must be a finite number.`);
    }
    return;
  }
  if (expected === "boolean") {
    if (typeof value !== "boolean") {
      issues.push(`${context} properties.${key} must be a boolean.`);
    }
    return;
  }
  if (expected === "label") {
    if (!isLabelObject(value)) {
      issues.push(`${context} properties.${key} must be a label object.`);
    }
    return;
  }
  if (expected === "string[]") {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      !value.every((entry) => typeof entry === "string")
    ) {
      issues.push(`${context} properties.${key} must be a non-empty string array.`);
    }
    return;
  }
  if (expected === "json") {
    return;
  }
  if (expected === "reference") {
    if (
      !isRecord(value) ||
      !isUuid(value["id"]) ||
      typeof value["feature_type"] !== "string" ||
      value["feature_type"].trim().length === 0
    ) {
      issues.push(
        `${context} properties.${key} must be a reference object with id and feature_type.`,
      );
    }
    return;
  }
  if (!isUuid(value)) {
    issues.push(`${context} properties.${key} must be a UUID.`);
  }
};

export const validateImdfDatasetFiles = (
  files: Record<string, unknown>,
  options: ImdfDatasetValidationOptions = {},
): ImdfDatasetValidationResult => {
  const mode = options.mode ?? "strict";
  const errors: string[] = [];
  const warnings: string[] = [];
  const knownIds = new Set<string>();
  const refs: Array<{ source: string; target: string; field: string }> = [];

  for (const type of REQUIRED_IMDF_DATASET_TYPES) {
    const foundFilename = resolveAliasFilename(files, imdfCollectionFileNameAliases(type));
    if (!foundFilename) {
      errors.push(`Missing required IMDF file: ${imdfCollectionFileName(type)}.`);
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
      if (mode === "strict") {
        errors.push("manifest.json files must be an array.");
      } else {
        warnings.push("manifest.json files should be an array.");
      }
    } else {
      const names = new Set(
        manifestRaw["files"]
          .map((entry) =>
            isRecord(entry) && typeof entry["name"] === "string" ? entry["name"] : undefined,
          )
          .filter((entry): entry is string => Boolean(entry)),
      );
      for (const type of IMDF_STANDARD_DATASET_TYPES) {
        const aliases = imdfCollectionFileNameAliases(type);
        const foundFilename = resolveAliasFilename(files, aliases);
        if (foundFilename && !aliases.some((name) => names.has(name))) {
          warnings.push(`manifest.json does not list ${foundFilename}.`);
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
      const featureIssues = mode === "strict" ? errors : warnings;
      if (!isRecord(rawFeature) || rawFeature["type"] !== "Feature") {
        errors.push(`${context} must be a GeoJSON Feature.`);
        continue;
      }
      if (!isUuid(rawFeature["id"])) {
        featureIssues.push(`${context} has non-UUID id.`);
      } else if (knownIds.has(rawFeature["id"])) {
        featureIssues.push(`${context} has duplicate id ${rawFeature["id"]}.`);
      } else {
        knownIds.add(rawFeature["id"]);
      }
      if (rawFeature["feature_type"] !== type) {
        featureIssues.push(`${context} must have feature_type "${type}".`);
      }
      validateGeometry(type, rawFeature["geometry"], context, featureIssues);
      if (!isRecord(rawFeature["properties"])) {
        errors.push(`${context} must contain a properties object.`);
        continue;
      }
      for (const field of spec.fields.filter((entry) => entry.required)) {
        if (!(field.key in rawFeature["properties"])) {
          if (mode === "strict") {
            errors.push(`${context} missing required properties.${field.key}.`);
          } else {
            warnings.push(`${context} missing required properties.${field.key}.`);
          }
          continue;
        }
        validateFieldValue(
          field.key,
          field.type,
          rawFeature["properties"][field.key],
          context,
          errors,
          warnings,
          mode,
        );
      }
      for (const field of spec.fields) {
        if (!field.enumOptions || !(field.key in rawFeature["properties"])) {
          continue;
        }
        const value = rawFeature["properties"][field.key];
        if (typeof value !== "string" || !field.enumOptions.includes(value)) {
          const issue = `${context} properties.${field.key} must be one of: ${field.enumOptions.join(", ")}.`;
          if (mode === "strict") {
            errors.push(issue);
          } else {
            warnings.push(issue);
          }
        }
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
      const issue = `Reference ${ref.field} from ${ref.source} points to missing id ${ref.target}.`;
      if (mode === "strict") {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    }
  }

  return { errors, warnings };
};
