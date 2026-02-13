import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const IMDF_DATASET_TYPES = [
  "venue",
  "building",
  "footprint",
  "level",
  "unit",
  "opening",
  "relationship",
];

const requiredDatasetFiles = [
  "manifest.json",
  "venue.geojson",
  "building.geojson",
  "footprint.geojson",
  "level.geojson",
  "unit.geojson",
];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value) => typeof value === "string" && uuidPattern.test(value);

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

const isLabelObject = (value) =>
  isRecord(value) &&
  Object.values(value).every((label) => typeof label === "string" && label.trim().length > 0);

const isCoordinate = (value) =>
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

const validateLineStringGeometry = (geometry, context, errors) => {
  if (
    !isRecord(geometry) ||
    geometry.type !== "LineString" ||
    !Array.isArray(geometry.coordinates)
  ) {
    errors.push(`${context} must contain a LineString geometry.`);
    return;
  }

  if (geometry.coordinates.length < 2 || !geometry.coordinates.every(isCoordinate)) {
    errors.push(`${context} has invalid LineString coordinates.`);
  }
};

const isRelationshipReference = (value) =>
  isRecord(value) && isUuid(value.id) && typeof value.feature_type === "string";

const ringSignedArea = (ring) => {
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

const validatePolygonGeometry = (geometry, context, errors, warnings) => {
  if (!isRecord(geometry) || geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates)) {
    errors.push(`${context} must contain a Polygon geometry.`);
    return;
  }

  const ring = geometry.coordinates[0];
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

const parseFeatureTypeFromFilename = (filename) => {
  if (!filename.endsWith(".geojson")) {
    return undefined;
  }

  const base = filename.slice(0, -".geojson".length);
  return IMDF_DATASET_TYPES.find((type) => type === base);
};

const collectManifestFiles = (manifest) => {
  if (!Array.isArray(manifest.files)) {
    return new Set();
  }

  return new Set(
    manifest.files
      .map((entry) => (isRecord(entry) && typeof entry.name === "string" ? entry.name : undefined))
      .filter((entry) => Boolean(entry)),
  );
};

const validateImdfDatasetFiles = (files) => {
  const errors = [];
  const warnings = [];

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
    if (manifestRaw.version !== "1.0.0") {
      warnings.push("manifest.json version is expected to be 1.0.0.");
    }

    const manifestFiles = collectManifestFiles(manifestRaw);
    for (const type of IMDF_DATASET_TYPES) {
      const fileName = `${type}.geojson`;
      if (!manifestFiles.has(fileName)) {
        warnings.push(`manifest.json does not list ${fileName}.`);
      }
    }
  }

  const knownIds = new Set();
  const references = [];

  for (const [filename, collectionRaw] of Object.entries(files)) {
    const expectedType = parseFeatureTypeFromFilename(filename);
    if (!expectedType) {
      continue;
    }

    if (!isRecord(collectionRaw) || collectionRaw.type !== "FeatureCollection") {
      errors.push(`${filename} must be a FeatureCollection.`);
      continue;
    }

    if (!Array.isArray(collectionRaw.features)) {
      errors.push(`${filename} must contain a features array.`);
      continue;
    }

    for (const [index, featureRaw] of collectionRaw.features.entries()) {
      const context = `${filename} feature[${index}]`;
      if (!isRecord(featureRaw) || featureRaw.type !== "Feature") {
        errors.push(`${context} must be a GeoJSON Feature.`);
        continue;
      }

      if (!isUuid(featureRaw.id)) {
        errors.push(`${context} has a non-UUID id.`);
      } else if (knownIds.has(featureRaw.id)) {
        errors.push(`${context} has duplicate id ${featureRaw.id}.`);
      } else {
        knownIds.add(featureRaw.id);
      }

      if (featureRaw.feature_type !== expectedType) {
        errors.push(
          `${context} must have feature_type "${expectedType}" (received "${String(
            featureRaw.feature_type,
          )}").`,
        );
      }

      if (!isRecord(featureRaw.properties)) {
        errors.push(`${context} must contain a properties object.`);
        continue;
      }

      const properties = featureRaw.properties;

      if ("name" in properties && !isLabelObject(properties.name)) {
        errors.push(`${context} properties.name must be a labels object.`);
      }
      if ("short_name" in properties && !isLabelObject(properties.short_name)) {
        errors.push(`${context} properties.short_name must be a labels object.`);
      }

      if (expectedType === "building") {
        if (featureRaw.geometry !== null) {
          errors.push(`${context} building geometry must be null.`);
        }
        if (!isUuid(properties.venue_id)) {
          errors.push(`${context} properties.venue_id must be a UUID.`);
        } else {
          references.push({
            source: `${featureRaw.id}`,
            target: properties.venue_id,
            field: "venue_id",
          });
        }
      }

      if (["venue", "footprint", "level", "unit"].includes(expectedType)) {
        validatePolygonGeometry(featureRaw.geometry, context, errors, warnings);
      }

      if (expectedType === "opening") {
        validateLineStringGeometry(featureRaw.geometry, context, errors);
      }

      if (expectedType === "relationship") {
        if (featureRaw.geometry !== null) {
          validateLineStringGeometry(featureRaw.geometry, context, errors);
        }
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
              source: `${featureRaw.id}`,
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
              source: `${featureRaw.id}`,
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
            source: `${featureRaw.id}`,
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
            source: `${featureRaw.id}`,
            target: properties.level_id,
            field: "level_id",
          });
        }
      }

      if (expectedType === "relationship") {
        if (!isRelationshipReference(properties.origin)) {
          errors.push(`${context} properties.origin must be a reference object.`);
        } else {
          references.push({
            source: `${featureRaw.id}`,
            target: properties.origin.id,
            field: "origin",
          });
        }

        if (
          properties.intermediary !== undefined &&
          !isRelationshipReference(properties.intermediary)
        ) {
          errors.push(
            `${context} properties.intermediary must be a reference object when present.`,
          );
        } else {
          if (isRelationshipReference(properties.intermediary)) {
            references.push({
              source: `${featureRaw.id}`,
              target: properties.intermediary.id,
              field: "intermediary",
            });
          }
        }

        if (!isRelationshipReference(properties.destination)) {
          errors.push(`${context} properties.destination must be a reference object.`);
        } else {
          references.push({
            source: `${featureRaw.id}`,
            target: properties.destination.id,
            field: "destination",
          });
        }
        if (!["directed", "undirected"].includes(properties.direction)) {
          errors.push(`${context} properties.direction must be directed or undirected.`);
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

const loadDatasetFiles = async (directory) => {
  const resolvedDirectory = path.resolve(directory);
  const entries = await readdir(resolvedDirectory);
  const files = entries.filter((entry) => entry.endsWith(".json") || entry.endsWith(".geojson"));

  const parsedEntries = await Promise.all(
    files.map(async (entry) => {
      const raw = await readFile(path.join(resolvedDirectory, entry), "utf8");
      return [entry, JSON.parse(raw)];
    }),
  );

  return Object.fromEntries(parsedEntries);
};

const printIssues = (heading, issues) => {
  if (issues.length === 0) {
    return;
  }

  console.error(heading);
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
};

const targetDirectory = process.argv[2] ?? "testdata/imdf-sample";

try {
  const datasetFiles = await loadDatasetFiles(targetDirectory);
  const result = validateImdfDatasetFiles(datasetFiles);

  printIssues("IMDF validation errors:", result.errors);
  printIssues("IMDF validation warnings:", result.warnings);

  if (result.errors.length > 0) {
    process.exitCode = 1;
  } else {
    console.log(`IMDF dataset is valid: ${path.resolve(targetDirectory)}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to validate IMDF dataset at ${path.resolve(targetDirectory)}.`);
  console.error(message);
  process.exitCode = 1;
}
