import type {
  Building,
  Coordinates,
  FloorFeature,
  FloorOverlay,
  Geometry,
  JsonObject,
  JsonValue,
  Level,
  ProjectSnapshot,
  Venue,
} from "../types";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeJsonValue = (value: unknown): JsonValue | undefined => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeJsonValue(entry))
      .filter((entry): entry is JsonValue => entry !== undefined);
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<JsonObject>(
      (accumulator, [key, nested]) => {
        const normalized = normalizeJsonValue(nested);
        if (normalized !== undefined) {
          accumulator[key] = normalized;
        }
        return accumulator;
      },
      {},
    );
  }

  return undefined;
};

const isCoordinates = (value: unknown): value is Coordinates =>
  Array.isArray(value) &&
  value.length === 2 &&
  isFiniteNumber(value[0]) &&
  isFiniteNumber(value[1]);

const normalizePoint = (geometry: unknown): Geometry | undefined => {
  if (!geometry || typeof geometry !== "object") {
    return undefined;
  }

  const coordinates = (geometry as { coordinates?: unknown }).coordinates;
  if (!isCoordinates(coordinates)) {
    return undefined;
  }

  return {
    type: "Point",
    coordinates,
  };
};

const normalizeLine = (geometry: unknown): Geometry | undefined => {
  if (!geometry || typeof geometry !== "object") {
    return undefined;
  }

  const coordinates = (geometry as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates)) {
    return undefined;
  }

  const normalized = coordinates.filter(isCoordinates);
  if (normalized.length < 2) {
    return undefined;
  }

  return {
    type: "LineString",
    coordinates: normalized,
  };
};

const normalizePolygon = (geometry: unknown): Geometry | undefined => {
  if (!geometry || typeof geometry !== "object") {
    return undefined;
  }

  const coordinates = (geometry as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates)) {
    return undefined;
  }

  const firstRing = coordinates[0];
  if (!Array.isArray(firstRing)) {
    return undefined;
  }

  const ring = firstRing.filter(isCoordinates);
  if (ring.length < 3) {
    return undefined;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  const closedRing =
    first && last && first[0] === last[0] && first[1] === last[1]
      ? ring
      : [...ring, ring[0] as Coordinates];

  if (closedRing.length < 4) {
    return undefined;
  }

  return {
    type: "Polygon",
    coordinates: [closedRing],
  };
};

const normalizeGeometry = (geometry: unknown): Geometry | undefined => {
  if (!geometry || typeof geometry !== "object") {
    return undefined;
  }

  const type = (geometry as { type?: unknown }).type;
  if (type === "Point") {
    return normalizePoint(geometry);
  }

  if (type === "LineString") {
    return normalizeLine(geometry);
  }

  if (type === "Polygon") {
    return normalizePolygon(geometry);
  }

  return undefined;
};

const normalizeFeature = (value: unknown): FloorFeature | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = value as {
    id?: unknown;
    type?: unknown;
    geometry?: unknown;
    properties?: unknown;
  };

  if (raw.type !== "Feature" || !isNonEmptyString(raw.id)) {
    return undefined;
  }

  const geometry = normalizeGeometry(raw.geometry);
  if (!geometry) {
    return undefined;
  }

  const rawProperties =
    raw.properties && typeof raw.properties === "object"
      ? (raw.properties as {
          kind?: unknown;
          name?: unknown;
          floorId?: unknown;
          [key: string]: unknown;
        })
      : {};

  const normalizedProperties = Object.entries(rawProperties).reduce<Record<string, JsonValue>>(
    (accumulator, [key, propertyValue]) => {
      const normalized = normalizeJsonValue(propertyValue);
      if (normalized !== undefined) {
        accumulator[key] = normalized;
      }
      return accumulator;
    },
    {},
  );

  const kind = isNonEmptyString(rawProperties.kind) ? rawProperties.kind : "unit";
  const name = isNonEmptyString(rawProperties.name) ? rawProperties.name : undefined;
  const floorId = isNonEmptyString(rawProperties.floorId) ? rawProperties.floorId : undefined;
  const properties: FloorFeature["properties"] = { ...normalizedProperties, kind };
  if (name) {
    properties.name = name;
  }
  if (floorId) {
    properties.floorId = floorId;
  }

  return {
    type: "Feature",
    id: raw.id,
    geometry,
    properties,
  };
};

const normalizeOverlay = (value: unknown): FloorOverlay | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = value as {
    id?: unknown;
    floorId?: unknown;
    imageName?: unknown;
    imageDataUrl?: unknown;
    opacity?: unknown;
    visible?: unknown;
    updatedAt?: unknown;
    corners?: {
      topLeft?: unknown;
      topRight?: unknown;
      bottomRight?: unknown;
      bottomLeft?: unknown;
    };
  };

  if (
    !isNonEmptyString(raw.id) ||
    !isNonEmptyString(raw.floorId) ||
    !isNonEmptyString(raw.imageDataUrl)
  ) {
    return undefined;
  }

  const topLeft = raw.corners?.topLeft;
  const topRight = raw.corners?.topRight;
  const bottomRight = raw.corners?.bottomRight;
  const bottomLeft = raw.corners?.bottomLeft;

  if (
    !isCoordinates(topLeft) ||
    !isCoordinates(topRight) ||
    !isCoordinates(bottomRight) ||
    !isCoordinates(bottomLeft)
  ) {
    return undefined;
  }

  const opacityCandidate = isFiniteNumber(raw.opacity) ? raw.opacity : 30;
  const opacity = Math.max(0, Math.min(100, Math.round(opacityCandidate)));

  return {
    id: raw.id,
    floorId: raw.floorId,
    imageName: isNonEmptyString(raw.imageName) ? raw.imageName : "overlay-image",
    imageDataUrl: raw.imageDataUrl,
    opacity,
    visible: raw.visible === undefined ? true : Boolean(raw.visible),
    updatedAt: isNonEmptyString(raw.updatedAt) ? raw.updatedAt : new Date().toISOString(),
    corners: {
      topLeft,
      topRight,
      bottomRight,
      bottomLeft,
    },
  };
};

const normalizeVenues = (venues: unknown): Venue[] => {
  if (!Array.isArray(venues)) {
    return [{ id: "venue-default", name: "Main Venue" }];
  }
  const normalized = venues
    .map((venue) => {
      if (!venue || typeof venue !== "object") {
        return undefined;
      }
      const raw = venue as { id?: unknown; name?: unknown };
      if (!isNonEmptyString(raw.id)) {
        return undefined;
      }
      return {
        id: raw.id,
        name: isNonEmptyString(raw.name) ? raw.name : "Untitled venue",
      };
    })
    .filter((venue): venue is Venue => Boolean(venue));
  return normalized.length > 0 ? normalized : [{ id: "venue-default", name: "Main Venue" }];
};

const normalizeBuildings = (buildings: unknown, venues: Venue[]): Building[] => {
  if (!Array.isArray(buildings)) {
    return [];
  }
  const fallbackVenueId = venues[0]?.id ?? "venue-default";
  const venueIds = new Set(venues.map((venue) => venue.id));

  const normalized = buildings
    .map((building) => {
      if (!building || typeof building !== "object") {
        return undefined;
      }

      const raw = building as {
        id?: unknown;
        name?: unknown;
        location?: unknown;
        venueId?: unknown;
      };
      if (!isNonEmptyString(raw.id)) {
        return undefined;
      }

      return {
        id: raw.id,
        venueId:
          isNonEmptyString(raw.venueId) && venueIds.has(raw.venueId)
            ? raw.venueId
            : fallbackVenueId,
        name: isNonEmptyString(raw.name) ? raw.name : "Untitled building",
        ...(isCoordinates(raw.location) ? { location: raw.location } : {}),
      };
    })
    .filter(Boolean) as Building[];

  return normalized;
};

const normalizeFloors = (floors: unknown, buildings: Building[]): Level[] => {
  const validBuildingIds = new Set(buildings.map((building) => building.id));
  if (!Array.isArray(floors)) {
    return [];
  }

  const normalized = floors
    .map((floor) => {
      if (!floor || typeof floor !== "object") {
        return undefined;
      }

      const raw = floor as { id?: unknown; buildingId?: unknown; name?: unknown };
      if (
        !isNonEmptyString(raw.id) ||
        !isNonEmptyString(raw.buildingId) ||
        !validBuildingIds.has(raw.buildingId)
      ) {
        return undefined;
      }

      return {
        id: raw.id,
        buildingId: raw.buildingId,
        name: isNonEmptyString(raw.name) ? raw.name : "Untitled floor",
      };
    })
    .filter((floor): floor is Level => Boolean(floor));

  return normalized;
};

const normalizeFeatures = (
  features: unknown,
  defaultFloorId: string | undefined,
  floorIds: Set<string>,
): FloorFeature[] => {
  if (!Array.isArray(features) || !defaultFloorId) {
    return [];
  }

  return features
    .map(normalizeFeature)
    .filter((feature): feature is FloorFeature => Boolean(feature))
    .map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        floorId:
          feature.properties.floorId && floorIds.has(feature.properties.floorId)
            ? feature.properties.floorId
            : defaultFloorId,
      },
    }));
};

const normalizeOverlays = (overlays: unknown, floorIds: Set<string>): FloorOverlay[] => {
  if (!Array.isArray(overlays)) {
    return [];
  }

  return overlays
    .map(normalizeOverlay)
    .filter((overlay): overlay is FloorOverlay => Boolean(overlay))
    .filter((overlay) => floorIds.has(overlay.floorId));
};

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter(isNonEmptyString))];
};

export const sanitizeProjectSnapshot = (project: ProjectSnapshot): ProjectSnapshot => {
  const venues = normalizeVenues(project.venues);
  const buildings = normalizeBuildings(project.buildings, venues);
  const floors = normalizeFloors(project.levels ?? project.floors, buildings);
  const defaultFloorId = floors[0]?.id;
  const floorIds = new Set(floors.map((floor) => floor.id));
  const features = normalizeFeatures(project.features, defaultFloorId, floorIds);
  const overlays = normalizeOverlays(project.overlays, floorIds);
  const featureIds = new Set(features.map((feature) => feature.id));
  const lockedFeatureIds = normalizeIdList(project.lockedFeatureIds).filter((id) =>
    featureIds.has(id),
  );
  const lockedOverlayFloorIds = normalizeIdList(project.lockedOverlayFloorIds).filter((floorId) =>
    floorIds.has(floorId),
  );

  return {
    ...project,
    venues,
    buildings,
    levels: floors,
    floors,
    features,
    overlays,
    lockedFeatureIds,
    lockedOverlayFloorIds,
  };
};
