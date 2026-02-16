/* biome-ignore-all lint/complexity/useLiteralKeys: bracket notation is required by noPropertyAccessFromIndexSignature */
import JSZip from "jszip";
import type { Building, Coordinates, Floor, FloorFeature, FloorOverlay, Venue } from "../types";
import { getFeatureSpec, readImdfType } from "./featureCatalog";
import {
  imdfCollectionFileName,
  imdfCollectionFileNameAliases,
  imdfExtensionCollectionFileName,
  imdfExtensionCollectionFileNameAliases,
  resolveAliasFilename,
} from "./fileNames";
import { getImdfSchemaRule } from "./schema";
import { validateImdfDatasetFiles } from "./validate";

export const IMDF_STANDARD_DATASET_TYPES = [
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

export type ImdfStandardDatasetType = (typeof IMDF_STANDARD_DATASET_TYPES)[number];

export type ImdfFeature = {
  type: "Feature";
  id: string;
  feature_type: ImdfStandardDatasetType;
  geometry: FloorFeature["geometry"] | null;
  properties: Record<string, unknown>;
};

export type ImdfFeatureCollection = {
  type: "FeatureCollection";
  features: ImdfFeature[];
};

export type ImdfManifest = {
  version: "1.0.0";
  generated_at: string;
  generator: string;
  files: Array<{
    name: string;
    feature_type: ImdfStandardDatasetType;
    count: number;
  }>;
};

export type ImdfArchivePayload = {
  manifest: ImdfManifest;
  files: Record<string, unknown>;
  warnings: string[];
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string): boolean => uuidPattern.test(value);

const hashSeed = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const deterministicUuid = (seed: string): string => {
  const bytes = new Uint8Array(16);
  for (let block = 0; block < 4; block += 1) {
    const hash = hashSeed(`${seed}:${block}`);
    bytes[block * 4] = (hash >>> 24) & 0xff;
    bytes[block * 4 + 1] = (hash >>> 16) & 0xff;
    bytes[block * 4 + 2] = (hash >>> 8) & 0xff;
    bytes[block * 4 + 3] = hash & 0xff;
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
};

export const resolveImdfUuid = (seedOrId: string): string =>
  isUuid(seedOrId) ? seedOrId.toLowerCase() : deterministicUuid(seedOrId);

const createLabel = (value: unknown, fallback: string, locale: string): Record<string, string> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entry]) => typeof entry === "string" && entry.trim().length > 0,
    );
    if (entries.length > 0) {
      return Object.fromEntries(entries) as Record<string, string>;
    }
  }
  const label = typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
  return { [locale]: label };
};

const isCoordinate = (value: unknown): value is Coordinates =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === "number" &&
  Number.isFinite(value[0]) &&
  typeof value[1] === "number" &&
  Number.isFinite(value[1]);

const geometryCoordinates = (geometry: FloorFeature["geometry"]): Coordinates[] => {
  if (geometry.type === "Point") {
    return [geometry.coordinates];
  }
  if (geometry.type === "LineString") {
    return geometry.coordinates.filter(isCoordinate);
  }
  return (geometry.coordinates[0] ?? []).filter(isCoordinate);
};

const normalizePolygon = (
  geometry: FloorFeature["geometry"],
): Extract<FloorFeature["geometry"], { type: "Polygon" }> | undefined => {
  if (geometry.type !== "Polygon") {
    return undefined;
  }
  const ring = (geometry.coordinates[0] ?? []).filter(isCoordinate);
  if (ring.length < 3) {
    return undefined;
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed =
    first && last && first[0] === last[0] && first[1] === last[1]
      ? ring
      : [...ring, ring[0] as Coordinates];
  if (closed.length < 4) {
    return undefined;
  }
  return { type: "Polygon", coordinates: [closed] };
};

const normalizeLine = (
  geometry: FloorFeature["geometry"],
): Extract<FloorFeature["geometry"], { type: "LineString" }> | undefined => {
  if (geometry.type !== "LineString") {
    return undefined;
  }
  const coordinates = geometry.coordinates.filter(isCoordinate);
  if (coordinates.length < 2) {
    return undefined;
  }
  return { type: "LineString", coordinates };
};

const bboxFromCoordinates = (coordinates: Coordinates[]) => {
  if (coordinates.length === 0) {
    return undefined;
  }
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const [lng, lat] of coordinates) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  return { minLng, minLat, maxLng, maxLat };
};

const polygonFromBbox = (
  bbox:
    | {
        minLng: number;
        minLat: number;
        maxLng: number;
        maxLat: number;
      }
    | undefined,
  padding = 0,
): Extract<FloorFeature["geometry"], { type: "Polygon" }> => {
  const source = bbox ?? { minLng: -0.0005, minLat: -0.0005, maxLng: 0.0005, maxLat: 0.0005 };
  const minLng = source.minLng - padding;
  const minLat = source.minLat - padding;
  const maxLng = source.maxLng + padding;
  const maxLat = source.maxLat + padding;
  return {
    type: "Polygon",
    coordinates: [
      [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ],
    ],
  };
};

const polygonCentroid = (
  geometry: Extract<FloorFeature["geometry"], { type: "Polygon" }>,
): Coordinates | undefined => {
  const ring = geometry.coordinates[0];
  if (!ring || ring.length < 4) {
    return undefined;
  }
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const current = ring[i];
    const next = ring[i + 1];
    if (!current || !next) {
      continue;
    }
    const cross = current[0] * next[1] - next[0] * current[1];
    twiceArea += cross;
    cx += (current[0] + next[0]) * cross;
    cy += (current[1] + next[1]) * cross;
  }
  if (Math.abs(twiceArea) < 1e-12) {
    const bbox = bboxFromCoordinates(ring.filter(isCoordinate));
    if (!bbox) {
      return undefined;
    }
    return [(bbox.minLng + bbox.maxLng) / 2, (bbox.minLat + bbox.maxLat) / 2];
  }
  return [cx / (3 * twiceArea), cy / (3 * twiceArea)];
};

const polygonArea = (geometry: Extract<FloorFeature["geometry"], { type: "Polygon" }>): number => {
  const ring = geometry.coordinates[0] ?? [];
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const current = ring[i];
    const next = ring[i + 1];
    if (!current || !next) {
      continue;
    }
    sum += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(sum / 2);
};

const weightedCentroid = (
  polygons: Array<Extract<FloorFeature["geometry"], { type: "Polygon" }>>,
): Coordinates | undefined => {
  if (polygons.length === 0) {
    return undefined;
  }
  let totalWeight = 0;
  let lng = 0;
  let lat = 0;
  for (const polygon of polygons) {
    const center = polygonCentroid(polygon);
    if (!center) {
      continue;
    }
    const weight = Math.max(polygonArea(polygon), 1e-8);
    totalWeight += weight;
    lng += center[0] * weight;
    lat += center[1] * weight;
  }
  if (totalWeight === 0) {
    return undefined;
  }
  return [lng / totalWeight, lat / totalWeight];
};

const dataUrlToBytes = (dataUrl: string): { bytes: Uint8Array; mime: string } | undefined => {
  const [prefix, payload] = dataUrl.split(",", 2);
  if (!prefix || !payload) {
    return undefined;
  }
  const mimeMatch = /^data:([^;]+);base64$/i.exec(prefix);
  if (!mimeMatch) {
    return undefined;
  }
  const mime = mimeMatch[1] ?? "application/octet-stream";
  if (typeof atob !== "function") {
    return undefined;
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { bytes, mime };
};

const extensionForMime = (mime: string): string => {
  if (mime === "image/jpeg") {
    return "jpg";
  }
  if (mime === "image/webp") {
    return "webp";
  }
  if (mime === "image/png") {
    return "png";
  }
  return "bin";
};

const readRelationshipReference = (
  value: unknown,
): { id: string; feature_type?: string } | undefined => {
  if (typeof value === "string") {
    return { id: value };
  }
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string"
  ) {
    return {
      id: (value as { id: string }).id,
      ...(typeof (value as { feature_type?: unknown }).feature_type === "string"
        ? { feature_type: (value as { feature_type: string }).feature_type }
        : {}),
    };
  }
  return undefined;
};

type BuildInput = {
  building: Building;
  floors: Floor[];
  features: FloorFeature[];
  overlays: FloorOverlay[];
  defaultLocale?: string;
};

export const buildImdfArchivePayload = ({
  building,
  floors,
  features,
  overlays,
  defaultLocale = "en",
}: BuildInput): ImdfArchivePayload => {
  const warnings: string[] = [];
  const collections = Object.fromEntries(
    IMDF_STANDARD_DATASET_TYPES.map((type) => [
      type,
      { type: "FeatureCollection", features: [] as ImdfFeature[] },
    ]),
  ) as Record<ImdfStandardDatasetType, ImdfFeatureCollection>;

  const floorsInBuilding = floors.filter((floor) => floor.buildingId === building.id);
  const floorIds = new Set(floorsInBuilding.map((floor) => floor.id));
  const featuresInBuilding = features.filter((feature) =>
    floorIds.has(
      (typeof feature.properties.level_id === "string"
        ? feature.properties.level_id
        : feature.properties.floorId) ?? "",
    ),
  );
  const featureUuidById = new Map(
    featuresInBuilding.map((feature) => [feature.id, resolveImdfUuid(feature.id)]),
  );
  const exportedFeatureIds = new Set<string>();
  const levelByFloor = new Map<string, string>();
  const buildingId = resolveImdfUuid(building.id);
  const venueId = resolveImdfUuid(building.imdf?.venue?.id ?? `venue:${building.id}`);
  const addressId = resolveImdfUuid(building.imdf?.address?.id ?? `address:${building.id}`);

  const levelPolygons: Array<Extract<FloorFeature["geometry"], { type: "Polygon" }>> = [];
  const levelFeatures = featuresInBuilding.filter(
    (feature) =>
      (readImdfType(feature.feature_type) ??
        readImdfType(feature.properties.imdfType) ??
        readImdfType(feature.properties.kind)) === "level",
  );
  for (const floor of floorsInBuilding) {
    const floorLevelFeature = levelFeatures.find(
      (feature) => feature.properties.level_id === floor.id,
    );
    const sourcePolygon = floorLevelFeature
      ? normalizePolygon(floorLevelFeature.geometry)
      : undefined;
    const floorCoordinates = featuresInBuilding
      .filter((feature) => feature.properties.level_id === floor.id)
      .flatMap((feature) => geometryCoordinates(feature.geometry));
    const fallbackPolygon = polygonFromBbox(bboxFromCoordinates(floorCoordinates), 0);
    const geometry = sourcePolygon ?? fallbackPolygon;
    levelPolygons.push(geometry);
    const levelId = resolveImdfUuid(floor.id);
    levelByFloor.set(floor.id, levelId);
    collections.level.features.push({
      type: "Feature",
      id: levelId,
      feature_type: "level",
      geometry,
      properties: {
        name: createLabel(floor.name, floor.name, defaultLocale),
        short_name: createLabel(floor.name, floor.name, defaultLocale),
        ordinal: 0,
        outdoor: false,
        building_ids: [buildingId],
        display_point: polygonCentroid(geometry),
      },
    });
  }

  const venuePolygon = polygonFromBbox(
    bboxFromCoordinates(levelPolygons.flatMap((polygon) => polygon.coordinates[0] ?? [])),
    0.00005,
  );
  const footprintPolygon = polygonFromBbox(
    bboxFromCoordinates(levelPolygons.flatMap((polygon) => polygon.coordinates[0] ?? [])),
    0,
  );
  const centroid = weightedCentroid(levelPolygons) ??
    polygonCentroid(venuePolygon) ?? [building.location?.[0] ?? 0, building.location?.[1] ?? 0];

  collections.venue.features.push({
    type: "Feature",
    id: venueId,
    feature_type: "venue",
    geometry: venuePolygon,
    properties: {
      name:
        building.imdf?.venue?.name ?? createLabel(`${building.name} venue`, "Venue", defaultLocale),
      category: building.imdf?.venue?.category ?? "public",
    },
  });

  collections.address.features.push({
    type: "Feature",
    id: addressId,
    feature_type: "address",
    geometry: { type: "Point", coordinates: centroid },
    properties: {
      address: building.imdf?.address?.address ?? "",
      locality: building.imdf?.address?.locality ?? "",
      province: building.imdf?.address?.province ?? "",
      country: building.imdf?.address?.country ?? "",
      postal_code: building.imdf?.address?.postal_code ?? "",
      unit: building.imdf?.address?.unit ?? "",
      floor: building.imdf?.address?.floor ?? "",
      region: building.imdf?.address?.region ?? "",
      neighborhood: building.imdf?.address?.neighborhood ?? "",
    },
  });

  collections.building.features.push({
    type: "Feature",
    id: buildingId,
    feature_type: "building",
    geometry: null,
    properties: {
      name: createLabel(building.name, "Building", defaultLocale),
      venue_id: venueId,
      address_id: addressId,
    },
  });

  collections.footprint.features.push({
    type: "Feature",
    id: resolveImdfUuid(`footprint:${building.id}`),
    feature_type: "footprint",
    geometry: footprintPolygon,
    properties: {
      name: createLabel(`${building.name} footprint`, "Footprint", defaultLocale),
      building_ids: [buildingId],
    },
  });

  for (const entry of building.imdf?.directory ?? []) {
    const directoryId = resolveImdfUuid(entry.id);
    const directoryName =
      entry.name && typeof entry.name === "object" && !Array.isArray(entry.name)
        ? entry.name
        : createLabel(building.name, "Directory entry", defaultLocale);
    collections.directory.features.push({
      type: "Feature",
      id: directoryId,
      feature_type: "directory",
      geometry: { type: "Point", coordinates: centroid },
      properties: {
        name: directoryName,
        building_id: buildingId,
        ...(typeof entry.category === "string" ? { category: entry.category } : {}),
        ...(typeof entry.phone === "string" ? { phone: entry.phone } : {}),
        ...(typeof entry.website === "string" ? { website: entry.website } : {}),
        ...(typeof entry.hours === "string" ? { hours: entry.hours } : {}),
        ...(Array.isArray(entry.unit_ids) ? { unit_ids: entry.unit_ids } : {}),
        ...(typeof entry.anchor_id === "string" ? { anchor_id: entry.anchor_id } : {}),
        ...(entry.metadata && typeof entry.metadata === "object"
          ? { metadata: entry.metadata }
          : {}),
      },
    });
  }

  const datasetTypeSet = new Set<string>(IMDF_STANDARD_DATASET_TYPES);
  for (const feature of featuresInBuilding) {
    const mappedType =
      readImdfType(feature.feature_type) ??
      readImdfType(feature.properties.imdfType) ??
      readImdfType(feature.properties.kind);
    if (!mappedType || !datasetTypeSet.has(mappedType) || mappedType === "level") {
      continue;
    }
    if (
      mappedType === "venue" ||
      mappedType === "building" ||
      mappedType === "address" ||
      mappedType === "footprint" ||
      mappedType === "directory"
    ) {
      continue;
    }
    const spec = getImdfSchemaRule(mappedType);
    const featureSpec = getFeatureSpec(mappedType);
    const level_id = feature.properties["level_id"] ?? feature.properties.floorId;
    const levelId = typeof level_id === "string" ? levelByFloor.get(level_id) : undefined;
    if (!levelId && spec.type !== "relationship") {
      warnings.push(`Feature ${feature.id} skipped: missing floor/level reference.`);
      continue;
    }
    const id = resolveImdfUuid(feature.id);
    const baseProperties: Record<string, unknown> = {
      name: createLabel(feature.properties.name, spec.defaultName, defaultLocale),
    };
    if (levelId) {
      baseProperties["level_id"] = levelId;
    }
    if (typeof feature.properties["category"] === "string") {
      baseProperties["category"] = feature.properties["category"];
    }
    for (const key of [
      "website",
      "phone",
      "hours",
      "unit_ids",
      "anchor_id",
      "address_id",
      "door",
      "accessibility",
      "restriction",
      "section_id",
      "unit_id",
    ]) {
      const value = feature.properties[key];
      if (value !== undefined) {
        baseProperties[key] = value;
      }
    }
    const relation = feature.properties["formation:relation"] ?? feature.properties.relation;
    const originRef =
      readRelationshipReference(feature.properties.origin) ??
      (typeof feature.properties.origin_id === "string"
        ? { id: feature.properties.origin_id }
        : undefined);
    const intermediaryRef =
      readRelationshipReference(feature.properties.intermediary) ??
      (typeof feature.properties.intermediary_id === "string"
        ? { id: feature.properties.intermediary_id }
        : undefined);
    const destinationRef =
      readRelationshipReference(feature.properties.destination) ??
      (typeof feature.properties.destination_id === "string"
        ? { id: feature.properties.destination_id }
        : undefined);
    const resolvedOriginId = relation?.origin?.featureId ?? originRef?.id;
    const resolvedIntermediaryId = relation?.intermediary?.featureId ?? intermediaryRef?.id;
    const resolvedDestinationId = relation?.destination?.featureId ?? destinationRef?.id;
    if (mappedType === "relationship") {
      if (resolvedOriginId) {
        baseProperties["origin"] = {
          id: featureUuidById.get(resolvedOriginId) ?? resolveImdfUuid(resolvedOriginId),
          feature_type: originRef?.feature_type ?? "unit",
        };
      }
      if (resolvedIntermediaryId) {
        baseProperties["intermediary"] = {
          id:
            featureUuidById.get(resolvedIntermediaryId) ?? resolveImdfUuid(resolvedIntermediaryId),
          feature_type: intermediaryRef?.feature_type ?? "unit",
        };
      }
      if (resolvedDestinationId) {
        baseProperties["destination"] = {
          id: featureUuidById.get(resolvedDestinationId) ?? resolveImdfUuid(resolvedDestinationId),
          feature_type: destinationRef?.feature_type ?? "unit",
        };
      }
      baseProperties["direction"] =
        typeof feature.properties.direction === "string"
          ? feature.properties.direction
          : "directed";
    } else {
      if (resolvedOriginId) {
        baseProperties["origin_id"] =
          featureUuidById.get(resolvedOriginId) ?? resolveImdfUuid(resolvedOriginId);
      }
      if (resolvedIntermediaryId) {
        baseProperties["intermediary_id"] =
          featureUuidById.get(resolvedIntermediaryId) ?? resolveImdfUuid(resolvedIntermediaryId);
      }
      if (resolvedDestinationId) {
        baseProperties["destination_id"] =
          featureUuidById.get(resolvedDestinationId) ?? resolveImdfUuid(resolvedDestinationId);
      }
    }
    for (const field of featureSpec.fields) {
      if (baseProperties[field.key] === undefined && field.defaultValue !== undefined) {
        baseProperties[field.key] = field.defaultValue;
      }
    }
    const missingRequiredFields = featureSpec.fields
      .filter((field) => field.required)
      .map((field) => field.key)
      .filter((key) => baseProperties[key] === undefined);
    if (missingRequiredFields.length > 0) {
      warnings.push(
        `Feature ${feature.id} skipped: missing required ${mappedType} properties (${missingRequiredFields.join(", ")}).`,
      );
      continue;
    }

    let geometry: FloorFeature["geometry"] | null = null;
    if (spec.geometryType === "Polygon") {
      const normalized = normalizePolygon(feature.geometry);
      if (!normalized) {
        warnings.push(`Feature ${feature.id} skipped: invalid polygon geometry for ${mappedType}.`);
        continue;
      }
      geometry = normalized;
    }
    if (spec.geometryType === "LineString" && mappedType !== "relationship") {
      const normalized = normalizeLine(feature.geometry);
      if (!normalized) {
        warnings.push(`Feature ${feature.id} skipped: invalid line geometry for ${mappedType}.`);
        continue;
      }
      geometry = normalized;
    }
    if (mappedType === "relationship") {
      const normalized = normalizeLine(feature.geometry);
      geometry = normalized ?? null;
    }
    if (spec.geometryType === "Point") {
      if (feature.geometry.type !== "Point") {
        warnings.push(`Feature ${feature.id} skipped: invalid point geometry for ${mappedType}.`);
        continue;
      }
      geometry = feature.geometry;
    }

    collections[mappedType as ImdfStandardDatasetType].features.push({
      type: "Feature",
      id,
      feature_type: mappedType as ImdfStandardDatasetType,
      geometry,
      properties: baseProperties,
    });
    exportedFeatureIds.add(feature.id);
  }

  for (const feature of featuresInBuilding) {
    if (!exportedFeatureIds.has(feature.id)) {
      continue;
    }
    const mappedType =
      readImdfType(feature.feature_type) ??
      readImdfType(feature.properties.imdfType) ??
      readImdfType(feature.properties.kind);
    if (!mappedType || mappedType === "level" || mappedType === "relationship") {
      continue;
    }
    const level_id = feature.properties.level_id ?? feature.properties.floorId;
    const levelId = typeof level_id === "string" ? levelByFloor.get(level_id) : undefined;
    if (!levelId) {
      continue;
    }
    const childId = featureUuidById.get(feature.id) ?? resolveImdfUuid(feature.id);
    const metadata =
      feature.properties["formation:metadata"] &&
      typeof feature.properties["formation:metadata"] === "object"
        ? (feature.properties["formation:metadata"] as {
            imdfRelationshipParentId?: string;
            imdfRelationshipParentType?: string;
          })
        : undefined;
    const overrideParentRaw =
      typeof feature.properties["formation:containment_parent_id"] === "string"
        ? feature.properties["formation:containment_parent_id"]
        : metadata && typeof metadata.imdfRelationshipParentId === "string"
          ? metadata.imdfRelationshipParentId
          : undefined;
    const overrideParentType =
      typeof feature.properties["formation:containment_parent_type"] === "string"
        ? feature.properties["formation:containment_parent_type"]
        : metadata && typeof metadata.imdfRelationshipParentType === "string"
          ? metadata.imdfRelationshipParentType
          : undefined;
    const parentId = overrideParentRaw
      ? (featureUuidById.get(overrideParentRaw) ??
        levelByFloor.get(overrideParentRaw) ??
        resolveImdfUuid(overrideParentRaw))
      : levelId;
    const parentType = overrideParentRaw ? (overrideParentType ?? "unit") : "level";
    collections.relationship.features.push({
      type: "Feature",
      id: resolveImdfUuid(`contains:${parentId}:${childId}`),
      feature_type: "relationship",
      geometry: null,
      properties: {
        name: createLabel("Contains relationship", "Contains relationship", defaultLocale),
        direction: "directed",
        origin: { id: parentId, feature_type: parentType },
        destination: { id: childId, feature_type: mappedType },
      },
    });
  }

  for (const type of IMDF_STANDARD_DATASET_TYPES) {
    collections[type].features.sort((a, b) => a.id.localeCompare(b.id));
  }

  const imageExtensionFeatures: Array<Record<string, unknown>> = [];
  const imageBytes: Array<{ path: string; bytes: Uint8Array }> = [];
  const overlaysInBuilding = overlays.filter((overlay) => floorIds.has(overlay.floorId));
  for (const overlay of overlaysInBuilding) {
    const decoded = dataUrlToBytes(overlay.imageDataUrl);
    if (!decoded) {
      warnings.push(`Overlay ${overlay.id} skipped: unsupported image payload.`);
      continue;
    }
    const ext = extensionForMime(decoded.mime);
    const imagePath = `images/${overlay.id}.${ext}`;
    imageBytes.push({ path: imagePath, bytes: decoded.bytes });
    imageExtensionFeatures.push({
      type: "Feature",
      id: resolveImdfUuid(`overlay:${overlay.id}`),
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            overlay.corners.topLeft,
            overlay.corners.topRight,
            overlay.corners.bottomRight,
            overlay.corners.bottomLeft,
            overlay.corners.topLeft,
          ],
        ],
      },
      properties: {
        level_id: levelByFloor.get(overlay.floorId),
        image_path: imagePath,
        image_name: overlay.imageName,
        opacity: overlay.opacity,
        visible: overlay.visible !== false,
        corners: overlay.corners,
      },
    });
  }

  const centroidFeatures = [
    {
      type: "Feature",
      id: resolveImdfUuid(`centroid:building:${building.id}`),
      geometry: { type: "Point", coordinates: centroid },
      properties: { scope: "building", building_id: buildingId },
    },
    {
      type: "Feature",
      id: resolveImdfUuid(`centroid:venue:${building.id}`),
      geometry: { type: "Point", coordinates: centroid },
      properties: { scope: "venue", venue_id: venueId },
    },
    {
      type: "Feature",
      id: resolveImdfUuid(`centroid:address:${building.id}`),
      geometry: { type: "Point", coordinates: centroid },
      properties: { scope: "address", address_id: addressId },
    },
  ];

  const manifest: ImdfManifest = {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    generator: "formation-floorplan-editor",
    files: IMDF_STANDARD_DATASET_TYPES.map((type) => ({
      name: imdfCollectionFileName(type),
      feature_type: type,
      count: collections[type].features.length,
    })),
  };

  const files: Record<string, unknown> = { "manifest.json": manifest };
  for (const type of IMDF_STANDARD_DATASET_TYPES) {
    files[imdfCollectionFileName(type)] = collections[type];
  }
  files[imdfExtensionCollectionFileName("formation_image")] = {
    type: "FeatureCollection",
    features: imageExtensionFeatures,
  };
  files[imdfExtensionCollectionFileName("formation_centroid")] = {
    type: "FeatureCollection",
    features: centroidFeatures,
  };
  files["formation_assets.json"] = { images: imageBytes.map((entry) => entry.path) };

  (files["formation_assets.json"] as Record<string, unknown>)["imagePayloads"] = imageBytes;

  return {
    manifest,
    files,
    warnings,
  };
};

type MultiBuildingBuildInput = {
  buildings: Building[];
  floors: Floor[];
  features: FloorFeature[];
  overlays: FloorOverlay[];
  defaultLocale?: string;
};

type VenueBuildInput = {
  venue: Venue;
  buildings: Building[];
  floors: Floor[];
  features: FloorFeature[];
  overlays: FloorOverlay[];
  defaultLocale?: string;
};

type ProjectBuildInput = {
  venues: Venue[];
  buildings: Building[];
  floors: Floor[];
  features: FloorFeature[];
  overlays: FloorOverlay[];
  defaultLocale?: string;
};

const readCollection = (files: Record<string, unknown>, name: string): ImdfFeatureCollection => {
  const raw = files[name];
  if (!raw || typeof raw !== "object") {
    return { type: "FeatureCollection", features: [] };
  }
  const collection = raw as {
    type?: unknown;
    features?: unknown;
  };
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    return { type: "FeatureCollection", features: [] };
  }
  return {
    type: "FeatureCollection",
    features: collection.features.filter(
      (feature): feature is ImdfFeature =>
        Boolean(feature) &&
        typeof feature === "object" &&
        typeof (feature as { id?: unknown }).id === "string",
    ),
  };
};

const readExtensionFeatures = (
  files: Record<string, unknown>,
  name: string,
): Record<string, unknown>[] => {
  const raw = files[name];
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const collection = raw as {
    type?: unknown;
    features?: unknown;
  };
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    return [];
  }
  return collection.features.filter(
    (feature): feature is Record<string, unknown> =>
      Boolean(feature) &&
      typeof feature === "object" &&
      typeof (feature as { id?: unknown }).id === "string",
  );
};

const mergeArchivePayloads = (payloads: ImdfArchivePayload[]): ImdfArchivePayload => {
  const warnings: string[] = [];
  const collections = Object.fromEntries(
    IMDF_STANDARD_DATASET_TYPES.map((type) => [type, new Map<string, ImdfFeature>()]),
  ) as Record<ImdfStandardDatasetType, Map<string, ImdfFeature>>;
  const imageFeatures = new Map<string, Record<string, unknown>>();
  const centroidFeatures = new Map<string, Record<string, unknown>>();
  const imagePayloadsByPath = new Map<string, Uint8Array>();

  for (const payload of payloads) {
    warnings.push(...payload.warnings);
    for (const type of IMDF_STANDARD_DATASET_TYPES) {
      const collection = readCollection(
        payload.files,
        resolveAliasFilename(payload.files, imdfCollectionFileNameAliases(type)) ??
          imdfCollectionFileName(type),
      );
      for (const feature of collection.features) {
        collections[type].set(feature.id, feature);
      }
    }
    for (const feature of readExtensionFeatures(
      payload.files,
      resolveAliasFilename(
        payload.files,
        imdfExtensionCollectionFileNameAliases("formation_image"),
      ) ?? imdfExtensionCollectionFileName("formation_image"),
    )) {
      imageFeatures.set(feature["id"] as string, feature);
    }
    for (const feature of readExtensionFeatures(
      payload.files,
      resolveAliasFilename(
        payload.files,
        imdfExtensionCollectionFileNameAliases("formation_centroid"),
      ) ?? imdfExtensionCollectionFileName("formation_centroid"),
    )) {
      centroidFeatures.set(feature["id"] as string, feature);
    }
    const assets = payload.files["formation_assets.json"] as
      | {
          imagePayloads?: Array<{ path: string; bytes: Uint8Array }>;
        }
      | undefined;
    for (const asset of assets?.imagePayloads ?? []) {
      if (typeof asset.path !== "string" || !(asset.bytes instanceof Uint8Array)) {
        continue;
      }
      imagePayloadsByPath.set(asset.path, asset.bytes);
    }
  }

  const files: Record<string, unknown> = {};
  for (const type of IMDF_STANDARD_DATASET_TYPES) {
    files[imdfCollectionFileName(type)] = {
      type: "FeatureCollection",
      features: [...collections[type].values()].sort((a, b) => a.id.localeCompare(b.id)),
    };
  }

  const sortedImageFeatures = [...imageFeatures.values()].sort((left, right) =>
    (left["id"] as string).localeCompare(right["id"] as string),
  );
  const sortedCentroidFeatures = [...centroidFeatures.values()].sort((left, right) =>
    (left["id"] as string).localeCompare(right["id"] as string),
  );
  const imagePayloads = [...imagePayloadsByPath.entries()]
    .map(([path, bytes]) => ({ path, bytes }))
    .sort((left, right) => left.path.localeCompare(right.path));

  files[imdfExtensionCollectionFileName("formation_image")] = {
    type: "FeatureCollection",
    features: sortedImageFeatures,
  };
  files[imdfExtensionCollectionFileName("formation_centroid")] = {
    type: "FeatureCollection",
    features: sortedCentroidFeatures,
  };

  const manifest: ImdfManifest = {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    generator: "formation-floorplan-editor",
    files: IMDF_STANDARD_DATASET_TYPES.map((type) => ({
      name: imdfCollectionFileName(type),
      feature_type: type,
      count: (
        files[imdfCollectionFileName(type)] as {
          features: unknown[];
        }
      ).features.length,
    })),
  };

  files["manifest.json"] = manifest;
  files["formation_assets.json"] = {
    images: imagePayloads.map((entry) => entry.path),
    imagePayloads,
  };

  return {
    manifest,
    files,
    warnings,
  };
};

const stableSortKeys = (input: unknown): unknown => {
  if (Array.isArray(input)) {
    return input.map(stableSortKeys);
  }
  if (!input || typeof input !== "object") {
    return input;
  }
  return Object.keys(input as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((accumulator, key) => {
      accumulator[key] = stableSortKeys((input as Record<string, unknown>)[key]);
      return accumulator;
    }, {});
};

const buildZipFromPayload = async (
  payload: ImdfArchivePayload,
): Promise<{ blob: Blob; warnings: string[] }> => {
  const validation = validateImdfDatasetFiles(payload.files);
  if (validation.errors.length > 0) {
    const details = validation.errors.map((error) => `- ${error}`).join("\n");
    throw new Error(`IMDF export blocked: dataset validation failed.\n${details}`);
  }
  const zip = new JSZip();
  for (const [filename, content] of Object.entries(payload.files)) {
    if (filename === "formation_assets.json") {
      continue;
    }
    zip.file(filename, JSON.stringify(stableSortKeys(content), null, 2));
  }
  const imagePayloads =
    (
      payload.files["formation_assets.json"] as {
        imagePayloads?: Array<{ path: string; bytes: Uint8Array }>;
      }
    )?.["imagePayloads"] ?? [];
  for (const asset of imagePayloads) {
    zip.file(asset.path, asset.bytes);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, warnings: [...payload.warnings, ...validation.warnings] };
};

const exportMultiBuildingImdfZip = async (
  input: MultiBuildingBuildInput,
): Promise<{ blob: Blob; warnings: string[] }> => {
  const payloads = input.buildings.map((building) =>
    buildImdfArchivePayload({
      building,
      floors: input.floors,
      features: input.features,
      overlays: input.overlays,
      ...(input.defaultLocale ? { defaultLocale: input.defaultLocale } : {}),
    }),
  );
  const payload = mergeArchivePayloads(payloads);
  return buildZipFromPayload(payload);
};

export const exportBuildingImdfZip = async (
  input: BuildInput,
): Promise<{ blob: Blob; warnings: string[] }> => {
  const payload = buildImdfArchivePayload(input);
  return buildZipFromPayload(payload);
};

export const exportVenueImdfZip = async (
  input: VenueBuildInput,
): Promise<{ blob: Blob; warnings: string[] }> => {
  const buildings = input.buildings
    .filter((building) => (building.venueId ?? input.venue.id) === input.venue.id)
    .map((building) => ({
      ...building,
      venueId: input.venue.id,
      imdf: {
        ...building.imdf,
        venue: {
          ...building.imdf?.venue,
          id: input.venue.id,
          name: building.imdf?.venue?.name ?? { en: input.venue.name },
        },
      },
    }));
  return exportMultiBuildingImdfZip({
    buildings,
    floors: input.floors,
    features: input.features,
    overlays: input.overlays,
    ...(input.defaultLocale ? { defaultLocale: input.defaultLocale } : {}),
  });
};

export const exportProjectImdfZip = async (
  input: ProjectBuildInput,
): Promise<{ blob: Blob; warnings: string[] }> => {
  const buildings = input.buildings.map((building) => {
    const fallbackVenueId = building.venueId ?? `venue:${building.id}`;
    const resolvedVenue = input.venues.find((venue) => venue.id === fallbackVenueId);
    const venueId = resolvedVenue?.id ?? fallbackVenueId;
    const venueName = building.imdf?.venue?.name ?? { en: resolvedVenue?.name ?? "Venue" };
    return {
      ...building,
      venueId,
      imdf: {
        ...building.imdf,
        venue: {
          ...building.imdf?.venue,
          id: venueId,
          name: venueName,
        },
      },
    };
  });
  return exportMultiBuildingImdfZip({
    buildings,
    floors: input.floors,
    features: input.features,
    overlays: input.overlays,
    ...(input.defaultLocale ? { defaultLocale: input.defaultLocale } : {}),
  });
};
