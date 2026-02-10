import type { Building, FeatureCollection, Floor, FloorFeature } from "../types";
import { normalizeFeature } from "./normalize";
import { sortOrderForFeatureType } from "./renderRules";

export const IMDF_DATASET_TYPES = [
  "venue",
  "building",
  "footprint",
  "level",
  "unit",
  "opening",
  "relationship",
] as const;

export type ImdfDatasetType = (typeof IMDF_DATASET_TYPES)[number];

export type ImdfLabel = Record<string, string>;

export type ImdfFeature = {
  type: "Feature";
  id: string;
  feature_type: ImdfDatasetType;
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
    feature_type: ImdfDatasetType;
    count: number;
  }>;
};

export type ImdfDataset = {
  manifest: ImdfManifest;
  collections: Record<ImdfDatasetType, ImdfFeatureCollection>;
  files: Record<string, ImdfManifest | ImdfFeatureCollection>;
};

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

  const byteSix = bytes[6] ?? 0;
  const byteEight = bytes[8] ?? 0;
  bytes[6] = (byteSix & 0x0f) | 0x40;
  bytes[8] = (byteEight & 0x3f) | 0x80;

  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
};

const resolveUuid = (seed: string): string =>
  isUuid(seed) ? seed.toLowerCase() : deterministicUuid(seed);

const createLabel = (value: unknown, fallback: string, locale: string): ImdfLabel => {
  const resolved = typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
  return { [locale]: resolved };
};

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

const ensureClosedRing = (ring: [number, number][]): [number, number][] => {
  if (ring.length === 0) {
    return ring;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    return ring;
  }

  return [...ring, ring[0] as [number, number]];
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

const normalizePolygonGeometry = (
  geometry: FloorFeature["geometry"],
): Extract<FloorFeature["geometry"], { type: "Polygon" }> | undefined => {
  if (geometry.type !== "Polygon") {
    return undefined;
  }

  const firstRing = geometry.coordinates[0];
  if (!Array.isArray(firstRing)) {
    return undefined;
  }

  const validCoordinates = firstRing.filter(isCoordinate);
  if (validCoordinates.length < 3) {
    return undefined;
  }

  const closed = ensureClosedRing(validCoordinates);
  if (closed.length < 4) {
    return undefined;
  }

  const ccw = ringSignedArea(closed) >= 0 ? closed : ensureClosedRing([...closed].reverse());
  return {
    type: "Polygon",
    coordinates: [ccw],
  };
};

const normalizeLineGeometry = (
  geometry: FloorFeature["geometry"],
): Extract<FloorFeature["geometry"], { type: "LineString" }> | undefined => {
  if (geometry.type !== "LineString") {
    return undefined;
  }

  const validCoordinates = geometry.coordinates.filter(isCoordinate);
  if (validCoordinates.length < 2) {
    return undefined;
  }

  return {
    type: "LineString",
    coordinates: validCoordinates,
  };
};

const collectGeometryCoordinates = (geometry: FloorFeature["geometry"]): [number, number][] => {
  if (geometry.type === "Point") {
    return isCoordinate(geometry.coordinates) ? [geometry.coordinates] : [];
  }

  if (geometry.type === "LineString") {
    return geometry.coordinates.filter(isCoordinate);
  }

  const ring = geometry.coordinates[0];
  return Array.isArray(ring) ? ring.filter(isCoordinate) : [];
};

const calculateBoundingBox = (
  coordinates: [number, number][],
): { minLng: number; minLat: number; maxLng: number; maxLat: number } | undefined => {
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

  return {
    minLng,
    minLat,
    maxLng,
    maxLat,
  };
};

const polygonFromBoundingBox = (
  bbox:
    | {
        minLng: number;
        minLat: number;
        maxLng: number;
        maxLat: number;
      }
    | undefined,
  padding: number,
): Extract<FloorFeature["geometry"], { type: "Polygon" }> => {
  const fallback = {
    minLng: -0.0005,
    minLat: -0.0005,
    maxLng: 0.0005,
    maxLat: 0.0005,
  };
  const source = bbox ?? fallback;

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

const displayPointForGeometry = (
  geometry: FloorFeature["geometry"],
): [number, number] | undefined => {
  const coordinates = collectGeometryCoordinates(geometry);
  const bbox = calculateBoundingBox(coordinates);
  if (!bbox) {
    return undefined;
  }

  return [(bbox.minLng + bbox.maxLng) / 2, (bbox.minLat + bbox.maxLat) / 2];
};

const pointInRing = (point: [number, number], ring: [number, number][]): boolean => {
  let inside = false;

  for (let left = 0, right = ring.length - 1; left < ring.length; right = left, left += 1) {
    const a = ring[left];
    const b = ring[right];
    if (!a || !b) {
      continue;
    }

    const intersects =
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const resolveInternalType = (feature: FloorFeature): string => {
  const typeCandidate =
    typeof feature.properties.imdfType === "string"
      ? feature.properties.imdfType
      : feature.properties.kind;

  return typeof typeCandidate === "string" ? typeCandidate : "";
};

const buildEmptyCollections = (): Record<ImdfDatasetType, ImdfFeatureCollection> => ({
  venue: { type: "FeatureCollection", features: [] },
  building: { type: "FeatureCollection", features: [] },
  footprint: { type: "FeatureCollection", features: [] },
  level: { type: "FeatureCollection", features: [] },
  unit: { type: "FeatureCollection", features: [] },
  opening: { type: "FeatureCollection", features: [] },
  relationship: { type: "FeatureCollection", features: [] },
});

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

type ExportImdfDatasetInput = ExportFloorInput & {
  defaultLocale?: string;
};

export const exportImdfDataset = ({
  building,
  floor,
  features,
  defaultLocale = "en",
}: ExportImdfDatasetInput): ImdfDataset => {
  const normalizedFloorFeatures = exportFloorGeoJson({ building, floor, features }).features;
  const collections = buildEmptyCollections();
  const idMap = new Map<string, string>();
  const toExportId = (sourceId: string, scope: string): string => {
    const key = `${scope}:${sourceId}`;
    const existing = idMap.get(key);
    if (existing) {
      return existing;
    }

    const resolved = deterministicUuid(key);
    idMap.set(key, resolved);
    return resolved;
  };

  const levelSourceFeatures = normalizedFloorFeatures.filter(
    (feature) => feature.geometry.type === "Polygon" && resolveInternalType(feature) === "level",
  );

  const pathSourceFeatures = normalizedFloorFeatures.filter(
    (feature) =>
      feature.geometry.type === "LineString" &&
      ["path", "pathway"].includes(resolveInternalType(feature)),
  );

  const unitSourceFeatures = normalizedFloorFeatures.filter(
    (feature) => feature.geometry.type === "Polygon" && resolveInternalType(feature) !== "level",
  );

  const allCoordinates = normalizedFloorFeatures.flatMap((feature) =>
    collectGeometryCoordinates(feature.geometry),
  );
  const datasetBounds = calculateBoundingBox(allCoordinates);

  const venueGeometry = polygonFromBoundingBox(
    datasetBounds,
    Math.max(
      0.00005,
      ((datasetBounds?.maxLng ?? 0) - (datasetBounds?.minLng ?? 0)) * 0.05,
      ((datasetBounds?.maxLat ?? 0) - (datasetBounds?.minLat ?? 0)) * 0.05,
    ),
  );

  const footprintGeometry =
    normalizePolygonGeometry(levelSourceFeatures[0]?.geometry ?? venueGeometry) ??
    polygonFromBoundingBox(datasetBounds, 0);

  const venueId = resolveUuid(`venue:${building.id}:${floor.id}`);
  const buildingId = resolveUuid(`building:${building.id}`);
  const footprintId = resolveUuid(`footprint:${building.id}:${floor.id}`);

  collections.venue.features.push({
    type: "Feature",
    id: venueId,
    feature_type: "venue",
    geometry: venueGeometry,
    properties: {
      name: createLabel(`${building.name} venue`, "Venue", defaultLocale),
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
    },
  });

  collections.footprint.features.push({
    type: "Feature",
    id: footprintId,
    feature_type: "footprint",
    geometry: footprintGeometry,
    properties: {
      name: createLabel(`${building.name} footprint`, "Footprint", defaultLocale),
      building_ids: [buildingId],
    },
  });

  const levelFeatures = levelSourceFeatures.length > 0 ? levelSourceFeatures : [undefined];
  for (const [index, sourceFeature] of levelFeatures.entries()) {
    const sourceId = sourceFeature?.id ?? `level:${floor.id}:${index}`;
    const id = toExportId(sourceId, "level");
    const geometry =
      (sourceFeature && normalizePolygonGeometry(sourceFeature.geometry)) ?? footprintGeometry;
    const displayPoint = displayPointForGeometry(geometry);

    collections.level.features.push({
      type: "Feature",
      id,
      feature_type: "level",
      geometry,
      properties: {
        name: createLabel(sourceFeature?.properties.name, floor.name, defaultLocale),
        short_name: createLabel(floor.name, floor.name, defaultLocale),
        ordinal: 0,
        outdoor: false,
        building_ids: [buildingId],
        display_point: displayPoint,
      },
    });
  }

  const primaryLevelId = collections.level.features[0]?.id ?? resolveUuid(`level:${floor.id}`);

  const exportedUnits: Array<{
    id: string;
    geometry: Extract<FloorFeature["geometry"], { type: "Polygon" }>;
  }> = [];
  for (const sourceFeature of unitSourceFeatures) {
    const geometry = normalizePolygonGeometry(sourceFeature.geometry);
    if (!geometry) {
      continue;
    }

    const id = toExportId(sourceFeature.id, "unit");
    const displayPoint = displayPointForGeometry(geometry);

    collections.unit.features.push({
      type: "Feature",
      id,
      feature_type: "unit",
      geometry,
      properties: {
        name: createLabel(sourceFeature.properties.name, "Unit", defaultLocale),
        level_id: primaryLevelId,
        category:
          typeof sourceFeature.properties.category === "string" &&
          sourceFeature.properties.category.trim().length > 0
            ? sourceFeature.properties.category
            : "unspecified",
        display_point: displayPoint,
      },
    });

    exportedUnits.push({ id, geometry });
  }

  for (const [index, sourceFeature] of pathSourceFeatures.entries()) {
    const lineGeometry = normalizeLineGeometry(sourceFeature.geometry);
    if (!lineGeometry) {
      continue;
    }

    const openingId = toExportId(sourceFeature.id, "opening");
    const relationshipId = toExportId(sourceFeature.id, "relationship");
    const start = lineGeometry.coordinates[0];
    const end = lineGeometry.coordinates[lineGeometry.coordinates.length - 1];

    const originUnit = start
      ? exportedUnits.find((unit) => pointInRing(start, unit.geometry.coordinates[0] ?? []))
      : undefined;
    const destinationUnit = end
      ? exportedUnits.find((unit) => pointInRing(end, unit.geometry.coordinates[0] ?? []))
      : undefined;

    const originId = originUnit?.id ?? primaryLevelId;
    const destinationId = destinationUnit?.id ?? primaryLevelId;

    collections.opening.features.push({
      type: "Feature",
      id: openingId,
      feature_type: "opening",
      geometry: lineGeometry,
      properties: {
        name: createLabel(sourceFeature.properties.name, `Opening ${index + 1}`, defaultLocale),
        level_id: primaryLevelId,
      },
    });

    collections.relationship.features.push({
      type: "Feature",
      id: relationshipId,
      feature_type: "relationship",
      geometry: lineGeometry,
      properties: {
        name: createLabel(sourceFeature.properties.name, `Path ${index + 1}`, defaultLocale),
        origin_id: originId,
        intermediary_id: openingId,
        destination_id: destinationId,
      },
    });
  }

  for (const type of IMDF_DATASET_TYPES) {
    collections[type].features.sort((left, right) => left.id.localeCompare(right.id));
  }

  const manifest: ImdfManifest = {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    generator: "formation-floorplan-editor",
    files: IMDF_DATASET_TYPES.map((type) => ({
      name: `${type}.geojson`,
      feature_type: type,
      count: collections[type].features.length,
    })),
  };

  const files: Record<string, ImdfManifest | ImdfFeatureCollection> = {
    "manifest.json": manifest,
  };
  for (const type of IMDF_DATASET_TYPES) {
    files[`${type}.geojson`] = collections[type];
  }

  return {
    manifest,
    collections,
    files,
  };
};

export const exportImdfDatasetText = (input: ExportImdfDatasetInput): string =>
  JSON.stringify(sortKeysRecursively(exportImdfDataset(input).files), null, 2);
