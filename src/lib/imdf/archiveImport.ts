/* biome-ignore-all lint/complexity/useLiteralKeys: bracket notation is required by noPropertyAccessFromIndexSignature */
import JSZip from "jszip";
import { createId } from "../id";
import type { Building, Floor, FloorFeature, FloorOverlay, ImdfFeatureType } from "../types";
import { IMDF_STANDARD_DATASET_TYPES } from "./archiveExport";
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

  for (const filename of [
    "manifest.json",
    ...IMDF_STANDARD_DATASET_TYPES.map((type) => `${type}.geojson`),
  ]) {
    const entry = zip.file(filename);
    if (!entry) {
      continue;
    }
    try {
      files[filename] = JSON.parse(await entry.async("text")) as unknown;
    } catch {
      return { ok: false, errors: [`${filename} is not valid JSON.`], warnings: [] };
    }
  }

  const extensionNames = ["formation_image.geojson", "formation_centroid.geojson"];
  for (const filename of extensionNames) {
    const entry = zip.file(filename);
    if (!entry) {
      continue;
    }
    try {
      files[filename] = JSON.parse(await entry.async("text")) as unknown;
    } catch {
      return { ok: false, errors: [`${filename} is not valid JSON.`], warnings: [] };
    }
  }

  const validation = validateImdfDatasetFiles(files);
  if (validation.errors.length > 0) {
    return { ok: false, errors: validation.errors, warnings: validation.warnings };
  }

  const warnings = [...validation.warnings];
  const buildingsById = new Map<string, Building>();
  const floorsById = new Map<string, Floor>();
  const features: FloorFeature[] = [];
  const levelToBuildingId = new Map<string, string>();

  const venueFeatures = readCollection(files, "venue.geojson");
  const addressFeatures = readCollection(files, "address.geojson");
  const buildingFeatures = readCollection(files, "building.geojson");
  const levelFeatures = readCollection(files, "level.geojson");

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

    const venueProperties = isRecord(venue?.properties) ? venue.properties : {};
    const addressProperties = isRecord(address?.properties) ? address.properties : {};
    const imdf: Building["imdf"] = {};
    if (venue) {
      imdf.venue = {
        ...(typeof venue["id"] === "string" ? { id: venue["id"] } : {}),
        ...(isRecord(venueProperties["name"])
          ? { name: venueProperties["name"] as Record<string, string> }
          : {}),
        ...(typeof venueProperties["category"] === "string"
          ? { category: venueProperties["category"] }
          : {}),
      };
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

    buildingsById.set(buildingFeature["id"], {
      id: buildingFeature["id"],
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
      features.push({
        type: "Feature",
        id: levelFeature["id"],
        geometry,
        properties: {
          kind: "level",
          imdfType: "level",
          imdf_feature_type: "level",
          ...(levelName ? { name: levelName } : {}),
          ...(isRecord(properties["short_name"])
            ? { short_name: properties["short_name"] as Record<string, string> }
            : {}),
          ordinal: typeof properties["ordinal"] === "number" ? properties["ordinal"] : 0,
          outdoor: Boolean(properties["outdoor"]),
          floorId: levelFeature["id"],
          level_id: levelFeature["id"],
          buildingId,
          building_id: buildingId,
        },
      });
    }
  }

  const collectionTypes: ImdfFeatureType[] = [
    "unit",
    "section",
    "geofence",
    "opening",
    "relationship",
    "amenity",
    "anchor",
    "detail",
    "fixture",
    "kiosk",
    "occupant",
  ];
  for (const type of collectionTypes) {
    const rawFeatures = readCollection(files, `${type}.geojson`);
    for (const raw of rawFeatures) {
      if (typeof raw["id"] !== "string") {
        continue;
      }
      const properties = isRecord(raw.properties) ? raw.properties : {};
      const floorId =
        typeof properties["level_id"] === "string" ? properties["level_id"] : undefined;
      if (!floorId || !floorsById.has(floorId)) {
        warnings.push(`Feature ${raw["id"]} in ${type}.geojson skipped: missing level_id.`);
        continue;
      }
      const geometry = geometryFromImdf(raw["geometry"]);
      if (!geometry) {
        warnings.push(`Feature ${raw["id"]} in ${type}.geojson skipped: invalid geometry.`);
        continue;
      }
      const featureName = labelToString(properties["name"]);
      const buildingId = levelToBuildingId.get(floorId);
      const originId =
        typeof properties["origin_id"] === "string" ? properties["origin_id"] : undefined;
      const intermediaryId =
        typeof properties["intermediary_id"] === "string"
          ? properties["intermediary_id"]
          : undefined;
      const destinationId =
        typeof properties["destination_id"] === "string" ? properties["destination_id"] : undefined;
      features.push({
        type: "Feature",
        id: raw["id"],
        geometry,
        properties: {
          kind: type,
          imdfType: type,
          imdf_feature_type: type,
          floorId,
          level_id: floorId,
          ...(buildingId ? { buildingId } : {}),
          ...(buildingId ? { building_id: buildingId } : {}),
          ...(featureName ? { name: featureName } : {}),
          ...(typeof properties["category"] === "string"
            ? { category: properties["category"] }
            : {}),
          ...(originId ? { origin: originId, origin_id: originId } : {}),
          ...(intermediaryId
            ? { intermediary: intermediaryId, intermediary_id: intermediaryId }
            : {}),
          ...(destinationId ? { destination: destinationId, destination_id: destinationId } : {}),
          ...(originId && intermediaryId && destinationId
            ? {
                relation: {
                  origin: { featureId: originId },
                  intermediary: { featureId: intermediaryId, floorId },
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

  const overlays: FloorOverlay[] = [];
  const extension = files["formation_image.geojson"];
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
          imageName:
            typeof properties["image_name"] === "string" ? properties["image_name"] : imagePath,
          imageDataUrl: toDataUrl(bytes, imagePath),
          opacity: typeof properties["opacity"] === "number" ? properties["opacity"] : 70,
          visible: properties["visible"] !== false,
          locked: Boolean(properties["locked"]),
          corners: { topLeft, topRight, bottomRight, bottomLeft },
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  return {
    ok: true,
    value: {
      buildings: [...buildingsById.values()],
      floors: [...floorsById.values()],
      features,
      overlays,
      warnings,
    },
  };
};
