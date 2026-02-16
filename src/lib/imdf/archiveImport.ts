/* biome-ignore-all lint/complexity/useLiteralKeys: bracket notation is required by noPropertyAccessFromIndexSignature */
import JSZip from "jszip";
import { createId } from "../id";
import type {
  Building,
  Floor,
  FloorFeature,
  FloorOverlay,
  ImdfFeatureType,
  JsonValue,
  Venue,
} from "../types";
import { IMDF_STANDARD_DATASET_TYPES } from "./archiveExport";
import { normalizeLegacyImportedCategory } from "./categories";
import {
  imdfCollectionFileName,
  imdfCollectionFileNameAliases,
  imdfExtensionCollectionFileName,
  imdfExtensionCollectionFileNameAliases,
} from "./fileNames";
import { validateImdfDatasetFiles } from "./validate";

type RawFeature = {
  type?: unknown;
  id?: unknown;
  feature_type?: unknown;
  geometry?: unknown;
  properties?: Record<string, unknown>;
};

type RawCollection = {
  type?: unknown;
  features?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCoordinate = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === "number" &&
  Number.isFinite(value[0]) &&
  typeof value[1] === "number" &&
  Number.isFinite(value[1]);

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null) {
    return true;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value === "object") {
    return Object.values(value).every(isJsonValue);
  }
  return false;
};

const labelToString = (value: unknown): string | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const english = value["en"];
  if (typeof english === "string" && english.trim().length > 0) {
    return english;
  }
  const first = Object.values(value).find(
    (entry) => typeof entry === "string" && entry.trim().length > 0,
  );
  return typeof first === "string" ? first : undefined;
};

const toLabelObject = (value: unknown, fallback?: string): Record<string, string> | undefined => {
  if (isRecord(value)) {
    const entries = Object.entries(value).filter(
      ([, entry]) => typeof entry === "string" && entry.trim().length > 0,
    );
    if (entries.length > 0) {
      return Object.fromEntries(entries) as Record<string, string>;
    }
  }
  if (typeof fallback === "string" && fallback.trim().length > 0) {
    return { en: fallback.trim() };
  }
  return undefined;
};

const toDataUrl = (bytes: Uint8Array, path: string): string => {
  const lower = path.toLowerCase();
  const mime =
    lower.endsWith(".jpg") || lower.endsWith(".jpeg")
      ? "image/jpeg"
      : lower.endsWith(".webp")
        ? "image/webp"
        : "image/png";
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 = btoa(binary);
  return `data:${mime};base64,${base64}`;
};

const geometryFromImdf = (geometry: unknown): FloorFeature["geometry"] | undefined => {
  if (!isRecord(geometry)) {
    return undefined;
  }
  const type = geometry["type"];
  if (type === "Point") {
    const coordinates = geometry["coordinates"];
    if (isCoordinate(coordinates)) {
      return { type: "Point", coordinates };
    }
    return undefined;
  }
  if (type === "LineString") {
    const coordinates = geometry["coordinates"];
    if (Array.isArray(coordinates) && coordinates.every(isCoordinate)) {
      return { type: "LineString", coordinates };
    }
    return undefined;
  }
  if (type === "Polygon") {
    const coordinates = geometry["coordinates"];
    const ring = Array.isArray(coordinates) ? coordinates[0] : undefined;
    if (Array.isArray(ring) && ring.every(isCoordinate)) {
      return { type: "Polygon", coordinates: [ring] };
    }
    return undefined;
  }
  return undefined;
};

const readRelationshipRefId = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }
  if (
    isRecord(value) &&
    typeof value["id"] === "string" &&
    typeof value["feature_type"] === "string"
  ) {
    return value["id"];
  }
  return undefined;
};

const readLevelIdFromProperties = (properties: Record<string, unknown>): string | undefined => {
  if (typeof properties["level_id"] === "string") {
    return properties["level_id"];
  }
  if (Array.isArray(properties["level_ids"])) {
    const first = properties["level_ids"].find((value) => typeof value === "string");
    if (typeof first === "string") {
      return first;
    }
  }
  return undefined;
};

const readCollection = (files: Record<string, unknown>, name: string): RawFeature[] => {
  const raw = files[name];
  if (!isRecord(raw)) {
    return [];
  }
  const collection = raw as RawCollection;
  if (collection["type"] !== "FeatureCollection" || !Array.isArray(collection["features"])) {
    return [];
  }
  return collection["features"].filter((feature): feature is RawFeature => isRecord(feature));
};

export type ImportedArchiveData = {
  venues: Venue[];
  buildings: Building[];
  floors: Floor[];
  features: FloorFeature[];
  overlays: FloorOverlay[];
  warnings: string[];
};

export type ImportArchiveResult =
  | { ok: true; value: ImportedArchiveData }
  | { ok: false; errors: string[]; warnings: string[] };

export const importImdfArchiveZip = async (file: File): Promise<ImportArchiveResult> => {
  const zip = await JSZip.loadAsync(file);
  const files: Record<string, unknown> = {};

  const manifestEntry = zip.file("manifest.json");
  if (manifestEntry) {
    try {
      files["manifest.json"] = JSON.parse(await manifestEntry.async("text")) as unknown;
    } catch {
      return { ok: false, errors: ["manifest.json is not valid JSON."], warnings: [] };
    }
  }

  for (const type of IMDF_STANDARD_DATASET_TYPES) {
    const [canonicalName, legacyName] = imdfCollectionFileNameAliases(type);
    const entry = zip.file(canonicalName) ?? zip.file(legacyName);
    if (!entry) {
      continue;
    }
    try {
      files[imdfCollectionFileName(type)] = JSON.parse(await entry.async("text")) as unknown;
    } catch {
      return { ok: false, errors: [`${entry.name} is not valid JSON.`], warnings: [] };
    }
  }

  for (const extensionType of ["formation_image", "formation_centroid"] as const) {
    const [canonicalName, legacyName] = imdfExtensionCollectionFileNameAliases(extensionType);
    const entry = zip.file(canonicalName) ?? zip.file(legacyName);
    if (!entry) {
      continue;
    }
    try {
      files[imdfExtensionCollectionFileName(extensionType)] = JSON.parse(
        await entry.async("text"),
      ) as unknown;
    } catch {
      return { ok: false, errors: [`${entry.name} is not valid JSON.`], warnings: [] };
    }
  }

  const validation = validateImdfDatasetFiles(files, { mode: "import-lenient" });
  if (validation.errors.length > 0) {
    return { ok: false, errors: validation.errors, warnings: validation.warnings };
  }

  const warnings = [...validation.warnings];
  const warnedCategoryMigrations = new Set<string>();
  const normalizeImportedCategory = (
    type: ImdfFeatureType,
    rawCategory: unknown,
    featureId: string,
  ): string | undefined => {
    if (typeof rawCategory !== "string" || rawCategory.trim().length === 0) {
      return undefined;
    }
    const { category, migrated } = normalizeLegacyImportedCategory(type, rawCategory);
    if (migrated) {
      const migrationKey = `${type}:${rawCategory.trim()}=>${category}`;
      if (!warnedCategoryMigrations.has(migrationKey)) {
        warnedCategoryMigrations.add(migrationKey);
        warnings.push(
          `Feature ${featureId}: migrated legacy ${type} category "${rawCategory.trim()}" to "${category}".`,
        );
      }
    }
    return category;
  };
  const venuesById = new Map<string, Venue>();
  const buildingsById = new Map<string, Building>();
  const floorsById = new Map<string, Floor>();
  const features: FloorFeature[] = [];
  const levelToBuildingId = new Map<string, string>();

  const venueFeatures = readCollection(files, imdfCollectionFileName("venue"));
  const addressFeatures = readCollection(files, imdfCollectionFileName("address"));
  const buildingFeatures = readCollection(files, imdfCollectionFileName("building"));
  const directoryFeatures = readCollection(files, imdfCollectionFileName("directory"));
  const levelFeatures = readCollection(files, imdfCollectionFileName("level"));
  const uniqueVenueIds = [
    ...new Set(
      venueFeatures
        .map((feature) => (typeof feature["id"] === "string" ? feature["id"] : undefined))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const inferredVenueId = uniqueVenueIds.length === 1 ? uniqueVenueIds[0] : undefined;

  for (const venueFeature of venueFeatures) {
    if (typeof venueFeature["id"] !== "string") {
      continue;
    }
    const properties = isRecord(venueFeature.properties) ? venueFeature.properties : {};
    venuesById.set(venueFeature["id"], {
      id: venueFeature["id"],
      name: labelToString(properties["name"]) ?? "Imported venue",
    });
  }

  for (const buildingFeature of buildingFeatures) {
    if (typeof buildingFeature["id"] !== "string") {
      continue;
    }
    const properties = isRecord(buildingFeature.properties) ? buildingFeature.properties : {};
    const venueId = typeof properties["venue_id"] === "string" ? properties["venue_id"] : undefined;
    const addressId =
      typeof properties["address_id"] === "string" ? properties["address_id"] : undefined;
    const venue = venueFeatures.find((candidate) => candidate["id"] === venueId);
    const address = addressFeatures.find((candidate) => candidate["id"] === addressId);
    let resolvedVenueId = venueId ?? (typeof venue?.["id"] === "string" ? venue["id"] : undefined);
    if (!resolvedVenueId && inferredVenueId) {
      resolvedVenueId = inferredVenueId;
      warnings.push(
        `Building ${buildingFeature["id"]}: inferred venue_id ${inferredVenueId} because archive defines a single venue.`,
      );
    }

    const venueProperties = isRecord(venue?.properties) ? venue.properties : {};
    const addressProperties = isRecord(address?.properties) ? address.properties : {};
    const imdf: Building["imdf"] = {};
    if (resolvedVenueId) {
      imdf.venue = {
        id: resolvedVenueId,
        ...(isRecord(venueProperties["name"])
          ? { name: venueProperties["name"] as Record<string, string> }
          : {}),
        ...(typeof venueProperties["category"] === "string"
          ? { category: venueProperties["category"] }
          : {}),
      };
      if (!venuesById.has(resolvedVenueId)) {
        venuesById.set(resolvedVenueId, {
          id: resolvedVenueId,
          name: labelToString(venueProperties["name"]) ?? "Imported venue",
        });
      }
    }
    if (address) {
      imdf.address = {
        ...(typeof address["id"] === "string" ? { id: address["id"] } : {}),
        ...(typeof addressProperties["address"] === "string"
          ? { address: addressProperties["address"] }
          : {}),
        ...(typeof addressProperties["locality"] === "string"
          ? { locality: addressProperties["locality"] }
          : {}),
        ...(typeof addressProperties["province"] === "string"
          ? { province: addressProperties["province"] }
          : {}),
        ...(typeof addressProperties["country"] === "string"
          ? { country: addressProperties["country"] }
          : {}),
        ...(typeof addressProperties["postal_code"] === "string"
          ? { postal_code: addressProperties["postal_code"] }
          : {}),
      };
    }
    const directoryEntries = directoryFeatures
      .filter((candidate) => {
        if (!isRecord(candidate.properties)) {
          return false;
        }
        return candidate.properties["building_id"] === buildingFeature["id"];
      })
      .map((candidate) => {
        const directoryProperties = isRecord(candidate.properties) ? candidate.properties : {};
        const name = toLabelObject(directoryProperties["name"], "Directory entry");
        const metadata =
          isRecord(directoryProperties["metadata"]) && directoryProperties["metadata"]
            ? (Object.fromEntries(
                Object.entries(directoryProperties["metadata"]).filter(([, value]) =>
                  isJsonValue(value),
                ),
              ) as Record<string, JsonValue>)
            : undefined;
        return {
          id: typeof candidate["id"] === "string" ? candidate["id"] : createId(),
          name: name ?? { en: "Directory entry" },
          ...(typeof directoryProperties["category"] === "string"
            ? { category: directoryProperties["category"] }
            : {}),
          ...(typeof directoryProperties["phone"] === "string"
            ? { phone: directoryProperties["phone"] }
            : {}),
          ...(typeof directoryProperties["website"] === "string"
            ? { website: directoryProperties["website"] }
            : {}),
          ...(typeof directoryProperties["hours"] === "string"
            ? { hours: directoryProperties["hours"] }
            : {}),
          ...(Array.isArray(directoryProperties["unit_ids"])
            ? {
                unit_ids: directoryProperties["unit_ids"].filter(
                  (value): value is string => typeof value === "string",
                ),
              }
            : {}),
          ...(typeof directoryProperties["anchor_id"] === "string"
            ? { anchor_id: directoryProperties["anchor_id"] }
            : {}),
          ...(metadata ? { metadata } : {}),
        };
      });
    if (directoryEntries.length > 0) {
      imdf.directory = directoryEntries;
    }

    buildingsById.set(buildingFeature["id"], {
      id: buildingFeature["id"],
      ...(resolvedVenueId ? { venueId: resolvedVenueId } : {}),
      name: labelToString(properties["name"]) ?? "Imported building",
      imdf,
    });
  }

  for (const levelFeature of levelFeatures) {
    if (typeof levelFeature["id"] !== "string") {
      continue;
    }
    const properties = isRecord(levelFeature.properties) ? levelFeature.properties : {};
    const buildingIds = Array.isArray(properties["building_ids"])
      ? properties["building_ids"].filter((value): value is string => typeof value === "string")
      : [];
    const buildingId = buildingIds[0];
    if (!buildingId) {
      warnings.push(`Level ${levelFeature["id"]} skipped: no building_ids[0].`);
      continue;
    }
    floorsById.set(levelFeature["id"], {
      id: levelFeature["id"],
      buildingId,
      name: labelToString(properties["name"]) ?? "Imported floor",
    });
    levelToBuildingId.set(levelFeature["id"], buildingId);
    const geometry = geometryFromImdf(levelFeature["geometry"]);
    if (geometry) {
      const levelName = labelToString(properties["name"]);
      const levelLabel = toLabelObject(properties["name"], levelName);
      const shortNameLabel = toLabelObject(properties["short_name"], levelName);
      features.push({
        type: "Feature",
        id: levelFeature["id"],
        feature_type: "level",
        geometry,
        properties: {
          kind: "level",
          imdfType: "level",
          ...(levelLabel ? { name: levelLabel } : {}),
          ...(shortNameLabel ? { short_name: shortNameLabel } : {}),
          ordinal: typeof properties["ordinal"] === "number" ? properties["ordinal"] : 0,
          outdoor: Boolean(properties["outdoor"]),
          level_id: levelFeature["id"],
          floorId: levelFeature["id"],
          building_ids: [buildingId],
        },
      });
    }
  }

  const collectionTypes: ImdfFeatureType[] = [
    "unit",
    "section",
    "geofence",
    "opening",
    "anchor",
    "detail",
    "fixture",
    "kiosk",
    "occupant",
  ];
  for (const type of collectionTypes) {
    const datasetFile = imdfCollectionFileName(type);
    const rawFeatures = readCollection(files, datasetFile);
    for (const raw of rawFeatures) {
      if (typeof raw["id"] !== "string") {
        continue;
      }
      const properties = isRecord(raw.properties) ? raw.properties : {};
      const level_id = readLevelIdFromProperties(properties);
      if (!level_id || !floorsById.has(level_id)) {
        warnings.push(`Feature ${raw["id"]} in ${datasetFile} skipped: missing level_id.`);
        continue;
      }
      const geometry = geometryFromImdf(raw["geometry"]);
      if (!geometry) {
        warnings.push(`Feature ${raw["id"]} in ${datasetFile} skipped: invalid geometry.`);
        continue;
      }
      const featureName = labelToString(properties["name"]);
      const featureNameLabel = toLabelObject(properties["name"], featureName);
      const normalizedCategory = normalizeImportedCategory(type, properties["category"], raw["id"]);
      const buildingId = levelToBuildingId.get(level_id);
      const originId =
        readRelationshipRefId(properties["origin"]) ??
        (typeof properties["origin_id"] === "string" ? properties["origin_id"] : undefined);
      const intermediaryId =
        readRelationshipRefId(properties["intermediary"]) ??
        (typeof properties["intermediary_id"] === "string"
          ? properties["intermediary_id"]
          : undefined);
      const destinationId =
        readRelationshipRefId(properties["destination"]) ??
        (typeof properties["destination_id"] === "string"
          ? properties["destination_id"]
          : undefined);
      features.push({
        type: "Feature",
        id: raw["id"],
        feature_type: type,
        geometry,
        properties: {
          kind: type,
          imdfType: type,
          level_id: level_id,
          floorId: level_id,
          ...(buildingId ? { building_ids: [buildingId] } : {}),
          ...(featureNameLabel ? { name: featureNameLabel } : {}),
          ...(normalizedCategory ? { category: normalizedCategory } : {}),
          ...(isJsonValue(properties["door"]) ? { door: properties["door"] } : {}),
          ...(isJsonValue(properties["accessibility"])
            ? { accessibility: properties["accessibility"] }
            : {}),
          ...(typeof properties["restriction"] === "string"
            ? { restriction: properties["restriction"] }
            : {}),
          ...(typeof properties["section_id"] === "string"
            ? { section_id: properties["section_id"] }
            : {}),
          ...(typeof properties["unit_id"] === "string" ? { unit_id: properties["unit_id"] } : {}),
          ...(typeof properties["anchor_id"] === "string"
            ? { anchor_id: properties["anchor_id"] }
            : {}),
          ...(typeof properties["address_id"] === "string"
            ? { address_id: properties["address_id"] }
            : {}),
          ...(originId
            ? { origin: { id: originId, feature_type: "unit" }, origin_id: originId }
            : {}),
          ...(intermediaryId
            ? {
                intermediary: { id: intermediaryId, feature_type: "unit" },
                intermediary_id: intermediaryId,
              }
            : {}),
          ...(destinationId
            ? {
                destination: { id: destinationId, feature_type: "unit" },
                destination_id: destinationId,
              }
            : {}),
          ...(originId && destinationId
            ? {
                "formation:relation": {
                  origin: { featureId: originId },
                  ...(intermediaryId
                    ? { intermediary: { featureId: intermediaryId, level_id } }
                    : {}),
                  destination: { featureId: destinationId },
                },
              }
            : {}),
          ...(Array.isArray(properties["unit_ids"])
            ? {
                unit_ids: properties["unit_ids"].filter(
                  (value): value is string => typeof value === "string",
                ),
              }
            : {}),
          ...(typeof properties["website"] === "string" ? { website: properties["website"] } : {}),
          ...(typeof properties["phone"] === "string" ? { phone: properties["phone"] } : {}),
          ...(typeof properties["hours"] === "string" ? { hours: properties["hours"] } : {}),
        },
      });
    }
  }

  const unitLevelById = new Map<string, string>();
  for (const feature of features) {
    if (feature.feature_type !== "unit") {
      continue;
    }
    const levelId =
      typeof feature.properties["level_id"] === "string"
        ? feature.properties["level_id"]
        : undefined;
    if (levelId) {
      unitLevelById.set(feature.id, levelId);
    }
  }

  const amenityFile = imdfCollectionFileName("amenity");
  const amenityFeatures = readCollection(files, amenityFile);
  for (const raw of amenityFeatures) {
    if (typeof raw["id"] !== "string") {
      continue;
    }
    const properties = isRecord(raw.properties) ? raw.properties : {};
    let level_id = readLevelIdFromProperties(properties);
    if (!level_id && Array.isArray(properties["unit_ids"])) {
      const linkedUnitIds = properties["unit_ids"].filter(
        (value): value is string => typeof value === "string",
      );
      for (const unitId of linkedUnitIds) {
        const inferredLevelId = unitLevelById.get(unitId);
        if (!inferredLevelId) {
          continue;
        }
        level_id = inferredLevelId;
        warnings.push(
          `Feature ${raw["id"]} in ${amenityFile}: inferred level_id ${inferredLevelId} from unit_ids.`,
        );
        break;
      }
    }
    if (!level_id || !floorsById.has(level_id)) {
      warnings.push(`Feature ${raw["id"]} in ${amenityFile} skipped: missing level_id.`);
      continue;
    }
    const geometry = geometryFromImdf(raw["geometry"]);
    if (!geometry) {
      warnings.push(`Feature ${raw["id"]} in ${amenityFile} skipped: invalid geometry.`);
      continue;
    }
    const featureName = labelToString(properties["name"]);
    const featureNameLabel = toLabelObject(properties["name"], featureName);
    const normalizedCategory = normalizeImportedCategory(
      "amenity",
      properties["category"],
      raw["id"],
    );
    const buildingId = levelToBuildingId.get(level_id);
    features.push({
      type: "Feature",
      id: raw["id"],
      feature_type: "amenity",
      geometry,
      properties: {
        kind: "amenity",
        imdfType: "amenity",
        level_id: level_id,
        floorId: level_id,
        ...(buildingId ? { building_ids: [buildingId] } : {}),
        ...(featureNameLabel ? { name: featureNameLabel } : {}),
        ...(normalizedCategory ? { category: normalizedCategory } : {}),
        ...(isJsonValue(properties["accessibility"])
          ? { accessibility: properties["accessibility"] }
          : {}),
        ...(typeof properties["restriction"] === "string"
          ? { restriction: properties["restriction"] }
          : {}),
        ...(typeof properties["address_id"] === "string"
          ? { address_id: properties["address_id"] }
          : {}),
        ...(Array.isArray(properties["unit_ids"])
          ? {
              unit_ids: properties["unit_ids"].filter(
                (value): value is string => typeof value === "string",
              ),
            }
          : {}),
        ...(typeof properties["website"] === "string" ? { website: properties["website"] } : {}),
        ...(typeof properties["phone"] === "string" ? { phone: properties["phone"] } : {}),
        ...(typeof properties["hours"] === "string" ? { hours: properties["hours"] } : {}),
      },
    });
  }

  const relationships = readCollection(files, imdfCollectionFileName("relationship"));
  for (const raw of relationships) {
    if (typeof raw["id"] !== "string") {
      continue;
    }
    const properties = isRecord(raw.properties) ? raw.properties : {};
    const originId =
      readRelationshipRefId(properties["origin"]) ??
      (typeof properties["origin_id"] === "string" ? properties["origin_id"] : undefined);
    const destinationId =
      readRelationshipRefId(properties["destination"]) ??
      (typeof properties["destination_id"] === "string" ? properties["destination_id"] : undefined);
    if (!originId || !destinationId) {
      continue;
    }
    const childFeature = features.find((feature) => feature.id === destinationId);
    if (!childFeature) {
      continue;
    }
    // Relationship features are not editable in the UI.
    // We only extract containment metadata from relationship edges.
    const originType =
      isRecord(properties["origin"]) && typeof properties["origin"]["feature_type"] === "string"
        ? (properties["origin"]["feature_type"] as string)
        : "unit";
    if (!["level", "unit", "section", "geofence"].includes(originType)) {
      continue;
    }
    const metadata =
      childFeature.properties["formation:metadata"] &&
      typeof childFeature.properties["formation:metadata"] === "object"
        ? childFeature.properties["formation:metadata"]
        : {};
    childFeature.properties["formation:metadata"] = {
      ...metadata,
      imdfRelationshipParentId: originId,
      imdfRelationshipParentType: originType,
    };
    childFeature.properties["formation:containment_parent_id"] = originId;
    childFeature.properties["formation:containment_parent_type"] = originType as ImdfFeatureType;
  }

  const overlays: FloorOverlay[] = [];
  const extension = files[imdfExtensionCollectionFileName("formation_image")];
  if (isRecord(extension)) {
    const collection = extension as RawCollection;
    if (collection["type"] === "FeatureCollection" && Array.isArray(collection["features"])) {
      for (const rawFeature of collection["features"]) {
        if (!isRecord(rawFeature)) {
          continue;
        }
        const feature = rawFeature as RawFeature;
        if (feature["type"] !== "Feature" || !isRecord(feature["properties"])) {
          continue;
        }
        const properties = feature["properties"];
        const levelId =
          typeof properties["level_id"] === "string" ? properties["level_id"] : undefined;
        const imagePath =
          typeof properties["image_path"] === "string" ? properties["image_path"] : undefined;
        const corners = properties["corners"];
        if (!levelId || !imagePath || !isRecord(corners)) {
          continue;
        }
        const topLeft = corners["topLeft"];
        const topRight = corners["topRight"];
        const bottomRight = corners["bottomRight"];
        const bottomLeft = corners["bottomLeft"];
        if (
          !isCoordinate(topLeft) ||
          !isCoordinate(topRight) ||
          !isCoordinate(bottomRight) ||
          !isCoordinate(bottomLeft)
        ) {
          continue;
        }
        const asset = zip.file(imagePath);
        if (!asset) {
          continue;
        }
        const bytes = new Uint8Array(await asset.async("uint8array"));
        overlays.push({
          id: typeof feature["id"] === "string" ? feature["id"] : createId(),
          floorId: levelId,
          level_id: levelId,
          imageName:
            typeof properties["image_name"] === "string" ? properties["image_name"] : imagePath,
          imageDataUrl: toDataUrl(bytes, imagePath),
          opacity: typeof properties["opacity"] === "number" ? properties["opacity"] : 70,
          visible: properties["visible"] !== false,
          corners: { topLeft, topRight, bottomRight, bottomLeft },
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  return {
    ok: true,
    value: {
      venues: [...venuesById.values()],
      buildings: [...buildingsById.values()],
      floors: [...floorsById.values()],
      features,
      overlays,
      warnings,
    },
  };
};
