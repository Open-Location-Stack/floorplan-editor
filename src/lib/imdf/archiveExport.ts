/* biome-ignore-all lint/complexity/useLiteralKeys: bracket notation is required by noPropertyAccessFromIndexSignature */
import JSZip from "jszip";
import type { Building, Coordinates, Floor, FloorFeature, FloorOverlay } from "../types";
import { readImdfType } from "./featureCatalog";
import { getImdfSchemaRule } from "./schema";

export const IMDF_STANDARD_DATASET_TYPES = [
  "address",
  "amenity",
  "anchor",
  "building",
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

const resolveUuid = (seedOrId: string): string =>
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
    floorIds.has(feature.properties.floorId ?? ""),
  );
  const featureUuidById = new Map(
    featuresInBuilding.map((feature) => [feature.id, resolveUuid(feature.id)]),
  );
  const levelByFloor = new Map<string, string>();
  const buildingId = resolveUuid(building.id);
  const venueId = resolveUuid(building.imdf?.venue?.id ?? `venue:${building.id}`);
  const addressId = resolveUuid(building.imdf?.address?.id ?? `address:${building.id}`);

  const levelPolygons: Array<Extract<FloorFeature["geometry"], { type: "Polygon" }>> = [];
  const levelFeatures = featuresInBuilding.filter(
    (feature) => readImdfType(feature.properties.imdfType) === "level",
  );
  for (const floor of floorsInBuilding) {
    const floorLevelFeature = levelFeatures.find(
      (feature) => feature.properties.floorId === floor.id,
    );
    const sourcePolygon = floorLevelFeature
      ? normalizePolygon(floorLevelFeature.geometry)
      : undefined;
    const floorCoordinates = featuresInBuilding
      .filter((feature) => feature.properties.floorId === floor.id)
      .flatMap((feature) => geometryCoordinates(feature.geometry));
    const fallbackPolygon = polygonFromBbox(bboxFromCoordinates(floorCoordinates), 0);
    const geometry = sourcePolygon ?? fallbackPolygon;
    levelPolygons.push(geometry);
    const levelId = resolveUuid(floor.id);
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
    id: resolveUuid(`footprint:${building.id}`),
    feature_type: "footprint",
    geometry: footprintPolygon,
    properties: {
      name: createLabel(`${building.name} footprint`, "Footprint", defaultLocale),
      building_ids: [buildingId],
    },
  });

  const datasetTypeSet = new Set<string>(IMDF_STANDARD_DATASET_TYPES);
  for (const feature of featuresInBuilding) {
    const mappedType =
      readImdfType(feature.properties.imdfType) ?? readImdfType(feature.properties.kind);
    if (!mappedType || !datasetTypeSet.has(mappedType) || mappedType === "level") {
      continue;
    }
    if (
      mappedType === "venue" ||
      mappedType === "building" ||
      mappedType === "address" ||
      mappedType === "footprint" ||
      mappedType === "relationship"
    ) {
      continue;
    }
    const spec = getImdfSchemaRule(mappedType);
    const floorId = feature.properties["floorId"];
    const levelId = typeof floorId === "string" ? levelByFloor.get(floorId) : undefined;
    if (!levelId && spec.type !== "relationship") {
      warnings.push(`Feature ${feature.id} skipped: missing floor/level reference.`);
      continue;
    }
    const id = resolveUuid(feature.id);
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
    const relation = feature.properties.relation;
    const originId =
      relation?.origin?.featureId ??
      (typeof feature.properties.origin === "string" ? feature.properties.origin : undefined) ??
      (typeof feature.properties.origin_id === "string" ? feature.properties.origin_id : undefined);
    const intermediaryId =
      relation?.intermediary?.featureId ??
      (typeof feature.properties.intermediary === "string"
        ? feature.properties.intermediary
        : undefined) ??
      (typeof feature.properties.intermediary_id === "string"
        ? feature.properties.intermediary_id
        : undefined);
    const destinationId =
      relation?.destination?.featureId ??
      (typeof feature.properties.destination === "string"
        ? feature.properties.destination
        : undefined) ??
      (typeof feature.properties.destination_id === "string"
        ? feature.properties.destination_id
        : undefined);
    if (originId) {
      baseProperties["origin_id"] = featureUuidById.get(originId) ?? resolveUuid(originId);
    }
    if (intermediaryId) {
      baseProperties["intermediary_id"] =
        featureUuidById.get(intermediaryId) ?? resolveUuid(intermediaryId);
    }
    if (destinationId) {
      baseProperties["destination_id"] =
        featureUuidById.get(destinationId) ?? resolveUuid(destinationId);
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
    if (spec.geometryType === "LineString") {
      const normalized = normalizeLine(feature.geometry);
      if (!normalized) {
        warnings.push(`Feature ${feature.id} skipped: invalid line geometry for ${mappedType}.`);
        continue;
      }
      geometry = normalized;
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
  }

  for (const feature of featuresInBuilding) {
    const mappedType =
      readImdfType(feature.properties.imdfType) ?? readImdfType(feature.properties.kind);
    if (!mappedType || mappedType === "level" || mappedType === "relationship") {
      continue;
    }
    const floorId = feature.properties.floorId;
    const levelId = typeof floorId === "string" ? levelByFloor.get(floorId) : undefined;
    if (!levelId) {
      continue;
    }
    const childId = featureUuidById.get(feature.id) ?? resolveUuid(feature.id);
    const metadata =
      feature.properties.metadata && typeof feature.properties.metadata === "object"
        ? (feature.properties.metadata as {
            imdfRelationshipParentId?: string;
            imdfRelationshipParentType?: string;
          })
        : undefined;
    const overrideParentRaw =
      metadata && typeof metadata.imdfRelationshipParentId === "string"
        ? metadata.imdfRelationshipParentId
        : undefined;
    const overrideParentType =
      metadata && typeof metadata.imdfRelationshipParentType === "string"
        ? metadata.imdfRelationshipParentType
        : undefined;
    const parentId = overrideParentRaw
      ? (featureUuidById.get(overrideParentRaw) ??
        levelByFloor.get(overrideParentRaw) ??
        resolveUuid(overrideParentRaw))
      : levelId;
    const parentType = overrideParentRaw ? (overrideParentType ?? "unit") : "level";
    collections.relationship.features.push({
      type: "Feature",
      id: resolveUuid(`contains:${parentId}:${childId}`),
      feature_type: "relationship",
      geometry: null,
      properties: {
        name: createLabel("Contains relationship", "Contains relationship", defaultLocale),
        category: "contains",
        direction: 1,
        references: [
          { id: parentId, feature_type: parentType },
          { id: childId, feature_type: mappedType },
        ],
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
      id: resolveUuid(`overlay:${overlay.id}`),
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
      id: resolveUuid(`centroid:building:${building.id}`),
      geometry: { type: "Point", coordinates: centroid },
      properties: { scope: "building", building_id: buildingId },
    },
    {
      type: "Feature",
      id: resolveUuid(`centroid:venue:${building.id}`),
      geometry: { type: "Point", coordinates: centroid },
      properties: { scope: "venue", venue_id: venueId },
    },
    {
      type: "Feature",
      id: resolveUuid(`centroid:address:${building.id}`),
      geometry: { type: "Point", coordinates: centroid },
      properties: { scope: "address", address_id: addressId },
    },
  ];

  const manifest: ImdfManifest = {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    generator: "formation-floorplan-editor",
    files: IMDF_STANDARD_DATASET_TYPES.map((type) => ({
      name: `${type}.geojson`,
      feature_type: type,
      count: collections[type].features.length,
    })),
  };

  const files: Record<string, unknown> = { "manifest.json": manifest };
  for (const type of IMDF_STANDARD_DATASET_TYPES) {
    files[`${type}.geojson`] = collections[type];
  }
  files["formation_image.geojson"] = {
    type: "FeatureCollection",
    features: imageExtensionFeatures,
  };
  files["formation_centroid.geojson"] = { type: "FeatureCollection", features: centroidFeatures };
  files["formation_assets.json"] = { images: imageBytes.map((entry) => entry.path) };

  (files["formation_assets.json"] as Record<string, unknown>)["imagePayloads"] = imageBytes;

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

export const exportBuildingImdfZip = async (
  input: BuildInput,
): Promise<{ blob: Blob; warnings: string[] }> => {
  const payload = buildImdfArchivePayload(input);
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
  return { blob, warnings: payload.warnings };
};
