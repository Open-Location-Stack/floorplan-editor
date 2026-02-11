import type { FloorFeature } from "../types";
import { IMDF_DATASET_TYPES, type ImdfDatasetType } from "./export";

export type FloorValidationResult = {
  errors: string[];
  warnings: string[];
};

export const validateFloor = (floorId: string, features: FloorFeature[]): FloorValidationResult => {
  const floorFeatures = features.filter((feature) => feature.properties.floorId === floorId);

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const feature of floorFeatures) {
    if (typeof feature.properties.imdfType !== "string" || !feature.properties.imdfType) {
      warnings.push(`Feature ${feature.id} has no IMDF type.`);
    }

    if (
      typeof feature.properties.name !== "string" ||
      feature.properties.name.trim().length === 0
    ) {
      warnings.push(`Feature ${feature.id} has no display name.`);
    }

    if (feature.geometry.type === "LineString" && feature.properties.kind !== "path") {
      warnings.push(`Feature ${feature.id} is a line but not marked as path.`);
    }

    if (typeof feature.properties.floorId !== "string" || feature.properties.floorId !== floorId) {
      errors.push(`Feature ${feature.id} is not assigned to floor ${floorId}.`);
    }

    if (
      typeof feature.properties.level_id !== "string" ||
      feature.properties.level_id !== floorId
    ) {
      errors.push(`Feature ${feature.id} is not assigned to level_id ${floorId}.`);
    }
  }

  return { errors, warnings };
};

export type ImdfDatasetValidationResult = {
  errors: string[];
  warnings: string[];
};

type RawManifest = {
  version?: unknown;
  files?: unknown;
};

type RawManifestEntry = {
  name?: unknown;
};

type RawCollection = {
  type?: unknown;
  features?: unknown;
};

type RawFeature = {
  type?: unknown;
  id?: unknown;
  feature_type?: unknown;
  geometry?: unknown;
  properties?: unknown;
};

type RawProperties = {
  name?: unknown;
  short_name?: unknown;
  venue_id?: unknown;
  ordinal?: unknown;
  outdoor?: unknown;
  building_ids?: unknown;
  level_id?: unknown;
  category?: unknown;
  origin_id?: unknown;
  intermediary_id?: unknown;
  destination_id?: unknown;
  [key: string]: unknown;
};

type RawGeometry = {
  type?: unknown;
  coordinates?: unknown;
};

const requiredDatasetFiles = [
  "manifest.json",
  "venue.geojson",
  "building.geojson",
  "footprint.geojson",
  "level.geojson",
  "unit.geojson",
] as const;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isLabelObject = (value: unknown): value is Record<string, string> =>
  isRecord(value) &&
  Object.values(value).every((label) => typeof label === "string" && label.trim().length > 0);

const isCoordinate = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === "number" &&
  Number.isFinite(value[0]) &&
  value[0] >= -180 &&
  value[0] <= 180 &&
  typeof value[1] === "number" &&
  Number.isFinite(value[1]) &&
  value[1] >= -90 &&
  value[1] <= 90;

const validateLineStringGeometry = (geometry: unknown, context: string, errors: string[]): void => {
  if (!isRecord(geometry)) {
    errors.push(`${context} must contain a LineString geometry.`);
    return;
  }

  const candidate = geometry as RawGeometry;
  if (candidate.type !== "LineString" || !Array.isArray(candidate.coordinates)) {
    errors.push(`${context} must contain a LineString geometry.`);
    return;
  }

  if (candidate.coordinates.length < 2 || !candidate.coordinates.every(isCoordinate)) {
    errors.push(`${context} has invalid LineString coordinates.`);
  }
};

const ringSignedArea = (ring: [number, number][]): number => {
  let sum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    if (!current || !next) {
      continue;
    }
    sum += current[0] * next[1] - next[0] * current[1];
  }
  return sum / 2;
};

const validatePolygonGeometry = (
  geometry: unknown,
  context: string,
  errors: string[],
  warnings: string[],
): void => {
  if (!isRecord(geometry)) {
    errors.push(`${context} must contain a Polygon geometry.`);
    return;
  }

  const candidate = geometry as RawGeometry;
  if (candidate.type !== "Polygon" || !Array.isArray(candidate.coordinates)) {
    errors.push(`${context} must contain a Polygon geometry.`);
    return;
  }

  const ring = candidate.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4 || !ring.every(isCoordinate)) {
    errors.push(`${context} has invalid Polygon coordinates.`);
    return;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
    errors.push(`${context} polygon ring must be closed.`);
  }

  if (ringSignedArea(ring) < 0) {
    warnings.push(
      `${context} polygon exterior ring is clockwise; RFC 7946 expects counter-clockwise.`,
    );
  }
};

const parseFeatureTypeFromFilename = (filename: string): ImdfDatasetType | undefined => {
  if (!filename.endsWith(".geojson")) {
    return undefined;
  }

  const base = filename.slice(0, -".geojson".length);
  return IMDF_DATASET_TYPES.find((type) => type === base);
};

const collectManifestFiles = (manifest: RawManifest): Set<string> => {
  if (!Array.isArray(manifest.files)) {
    return new Set();
  }

  return new Set(
    manifest.files
      .map((entry) => {
        if (!isRecord(entry)) {
          return undefined;
        }
        const manifestEntry = entry as RawManifestEntry;
        return typeof manifestEntry.name === "string" ? manifestEntry.name : undefined;
      })
      .filter((entry): entry is string => Boolean(entry)),
  );
};

export const validateImdfDatasetFiles = (
  files: Record<string, unknown>,
): ImdfDatasetValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const requiredFile of requiredDatasetFiles) {
    if (!(requiredFile in files)) {
      errors.push(`Missing required IMDF file: ${requiredFile}.`);
    }
  }

  const manifestRaw = files["manifest.json"];
  if (!manifestRaw) {
    errors.push("Missing manifest.json.");
  } else if (!isRecord(manifestRaw)) {
    errors.push("manifest.json must contain a JSON object.");
  } else {
    const manifest = manifestRaw as RawManifest;

    if (manifest.version !== "1.0.0") {
      warnings.push("manifest.json version is expected to be 1.0.0.");
    }

    const manifestFiles = collectManifestFiles(manifest);
    for (const type of IMDF_DATASET_TYPES) {
      const fileName = `${type}.geojson`;
      if (!manifestFiles.has(fileName)) {
        warnings.push(`manifest.json does not list ${fileName}.`);
      }
    }
  }

  const knownIds = new Set<string>();
  const references: Array<{ source: string; target: string; field: string }> = [];

  for (const [filename, collectionRaw] of Object.entries(files)) {
    const expectedType = parseFeatureTypeFromFilename(filename);
    if (!expectedType) {
      continue;
    }

    if (!isRecord(collectionRaw)) {
      errors.push(`${filename} must be a FeatureCollection.`);
      continue;
    }

    const collection = collectionRaw as RawCollection;
    if (collection.type !== "FeatureCollection") {
      errors.push(`${filename} must be a FeatureCollection.`);
      continue;
    }

    const rawFeatures = collection.features;
    if (!Array.isArray(rawFeatures)) {
      errors.push(`${filename} must contain a features array.`);
      continue;
    }

    for (const [index, featureRaw] of rawFeatures.entries()) {
      const context = `${filename} feature[${index}]`;
      if (!isRecord(featureRaw)) {
        errors.push(`${context} must be a GeoJSON Feature.`);
        continue;
      }

      const feature = featureRaw as RawFeature;
      if (feature.type !== "Feature") {
        errors.push(`${context} must be a GeoJSON Feature.`);
        continue;
      }

      if (!isUuid(feature.id)) {
        errors.push(`${context} has a non-UUID id.`);
      } else if (knownIds.has(feature.id)) {
        errors.push(`${context} has duplicate id ${feature.id}.`);
      } else {
        knownIds.add(feature.id);
      }

      if (feature.feature_type !== expectedType) {
        errors.push(
          `${context} must have feature_type "${expectedType}" (received "${String(
            feature.feature_type,
          )}").`,
        );
      }

      if (!isRecord(feature.properties)) {
        errors.push(`${context} must contain a properties object.`);
        continue;
      }

      const properties = feature.properties as RawProperties;

      if ("name" in properties && !isLabelObject(properties.name)) {
        errors.push(`${context} properties.name must be a labels object.`);
      }
      if ("short_name" in properties && !isLabelObject(properties.short_name)) {
        errors.push(`${context} properties.short_name must be a labels object.`);
      }

      if (expectedType === "building") {
        if (feature.geometry !== null) {
          errors.push(`${context} building geometry must be null.`);
        }
        if (!isUuid(properties.venue_id)) {
          errors.push(`${context} properties.venue_id must be a UUID.`);
        } else {
          references.push({
            source: `${feature.id}`,
            target: properties.venue_id,
            field: "venue_id",
          });
        }
      }

      if (
        expectedType === "venue" ||
        expectedType === "footprint" ||
        expectedType === "level" ||
        expectedType === "unit"
      ) {
        validatePolygonGeometry(feature.geometry, context, errors, warnings);
      }

      if (expectedType === "opening" || expectedType === "relationship") {
        validateLineStringGeometry(feature.geometry, context, errors);
      }

      if (expectedType === "level") {
        if (typeof properties.ordinal !== "number" || !Number.isFinite(properties.ordinal)) {
          errors.push(`${context} properties.ordinal must be a finite number.`);
        }
        if (typeof properties.outdoor !== "boolean") {
          errors.push(`${context} properties.outdoor must be a boolean.`);
        }
        if (!Array.isArray(properties.building_ids) || properties.building_ids.length === 0) {
          errors.push(`${context} properties.building_ids must be a non-empty UUID array.`);
        } else {
          for (const buildingId of properties.building_ids) {
            if (!isUuid(buildingId)) {
              errors.push(`${context} contains invalid building id "${String(buildingId)}".`);
              continue;
            }
            references.push({
              source: `${feature.id}`,
              target: buildingId,
              field: "building_ids",
            });
          }
        }
      }

      if (expectedType === "footprint") {
        if (!Array.isArray(properties.building_ids) || properties.building_ids.length === 0) {
          errors.push(`${context} properties.building_ids must be a non-empty UUID array.`);
        } else {
          for (const buildingId of properties.building_ids) {
            if (!isUuid(buildingId)) {
              errors.push(`${context} contains invalid building id "${String(buildingId)}".`);
              continue;
            }
            references.push({
              source: `${feature.id}`,
              target: buildingId,
              field: "building_ids",
            });
          }
        }
      }

      if (expectedType === "unit") {
        if (!isUuid(properties.level_id)) {
          errors.push(`${context} properties.level_id must be a UUID.`);
        } else {
          references.push({
            source: `${feature.id}`,
            target: properties.level_id,
            field: "level_id",
          });
        }
        if (typeof properties.category !== "string" || properties.category.trim().length === 0) {
          errors.push(`${context} properties.category must be a non-empty string.`);
        }
      }

      if (expectedType === "opening") {
        if (!isUuid(properties.level_id)) {
          errors.push(`${context} properties.level_id must be a UUID.`);
        } else {
          references.push({
            source: `${feature.id}`,
            target: properties.level_id,
            field: "level_id",
          });
        }
      }

      if (expectedType === "relationship") {
        if (!isUuid(properties.origin_id)) {
          errors.push(`${context} properties.origin_id must be a UUID.`);
        } else {
          references.push({
            source: `${feature.id}`,
            target: properties.origin_id,
            field: "origin_id",
          });
        }

        if (!isUuid(properties.intermediary_id)) {
          errors.push(`${context} properties.intermediary_id must be a UUID.`);
        } else {
          references.push({
            source: `${feature.id}`,
            target: properties.intermediary_id,
            field: "intermediary_id",
          });
        }

        if (!isUuid(properties.destination_id)) {
          errors.push(`${context} properties.destination_id must be a UUID.`);
        } else {
          references.push({
            source: `${feature.id}`,
            target: properties.destination_id,
            field: "destination_id",
          });
        }
      }
    }
  }

  for (const reference of references) {
    if (!knownIds.has(reference.target)) {
      errors.push(
        `Reference ${reference.field} from ${reference.source} points to missing id ${reference.target}.`,
      );
    }
  }

  return { errors, warnings };
};
