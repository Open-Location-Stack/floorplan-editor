import MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { Feature as GeoJsonFeature, Geometry as GeoJsonGeometry } from "geojson";
import { transformOverlayFromDraggedCorner } from "../geometry/overlayCornerHandles";
import { rotateAroundPoint } from "../geometry/overlayTransforms";
import { mapPointIconIdForOpeningEndpoint } from "../icons/iconRegistry";
import { createPointIconImage, MAP_POINT_ICON_SPECS } from "../icons/mapPointSprites";
import { createId } from "../id";
import {
  isNavigationPathOpening,
  readFeatureTypeString,
  readNavigationNodeCategory,
  readNavigationPathCategory,
} from "../navigation/navigationModel";
import type { Coordinates, FeatureCollection, FloorFeature, FloorOverlay } from "../types";

type MapLibreModule = typeof import("maplibre-gl");

export type DrawMode = "select" | "point" | "line" | "polygon";
export type OrientationMode = "north" | "grid";

type FeaturesChangeHandler = (features: FloorFeature[]) => void;
type FeatureSelectionChangeHandler = (featureId: string | undefined) => void;
type ViewStateHandler = (center: Coordinates, zoom: number) => void;
type InteractionModeChangeHandler = (mode: DrawMode) => void;
type OverlayCornersChangeHandler = (corners: FloorOverlay["corners"]) => void;
type OverlayInteractionHandler = () => void;
type VertexSelectionChangeHandler = (hasSelectedVertex: boolean) => void;
type MapClickHandler = (coordinate: Coordinates) => void;

type MapController = {
  setFeatures: (features: FeatureCollection) => void;
  setLockedFeatureIds: (featureIds: string[]) => void;
  setRouteOverlay: (features: FeatureCollection) => void;
  setSelection: (feature: FloorFeature | undefined) => void;
  setOverlay: (overlay: FloorOverlay | undefined) => void;
  setInteractionMode: (mode: DrawMode) => void;
  setRoutePickEnabled: (enabled: boolean) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setGridVisible: (visible: boolean) => void;
  setOrientationMode: (mode: OrientationMode) => void;
  setView: (center: Coordinates, zoom?: number) => void;
  deleteSelection: () => void;
  deleteVertex: () => void;
  splitPathSegment: () => void;
  forkPathAtNode: () => void;
  resize: () => void;
  destroy: () => void;
};

type PendingForkState = {
  sourceFeatureId: string;
  forkFeatureId: string;
  startCoordinate: Coordinates;
};

type SnapSettings = {
  enabled: boolean;
};

const OVERLAY_SOURCE_ID = "floor-overlay";
const OVERLAY_LAYER_ID = "floor-overlay-layer";
const GRID_SOURCE_ID = "grid-overlay";
const GRID_LINE_LAYER_ID = "grid-overlay-line";
const GRID_NODE_LAYER_ID = "grid-overlay-node";
const ROUTE_SOURCE_ID = "route-overlay";
const ROUTE_LINE_LAYER_ID = "route-overlay-line";
const ROUTE_POINT_LAYER_ID = "route-overlay-point";
const OPENING_ENDPOINT_SOURCE_ID = "opening-endpoint-overlay";
const OPENING_ENDPOINT_LAYER_ID = "opening-endpoint-overlay-symbol";
const SNAP_MARKER_SOURCE_ID = "snap-marker-overlay";
const SNAP_MARKER_LAYER_ID = "snap-marker-overlay-symbol";
const SNAP_MARKER_ICON_ID = "point-icon-snap-marker";
const SNAP_MARKER_GRAPH_READY_ICON_ID = "point-icon-snap-marker-graph-ready";
const OVERLAY_HANDLE_SIZE = 12;
const OVERLAY_CENTER_HANDLE_SIZE = 16;
const OVERLAY_ROTATE_HANDLE_SIZE = 14;
const OVERLAY_HANDLE_COLOR = "#f97316";
const OVERLAY_CENTER_HANDLE_COLOR = "#0ea5e9";
const OVERLAY_ROTATE_HANDLE_COLOR = "#14b8a6";
const OVERLAY_HANDLE_STROKE_COLOR = "#ffffff";
const OVERLAY_ROTATE_HANDLE_OFFSET_RATIO = 0.2;
const OVERLAY_ROTATE_HANDLE_OFFSET_MIN_METERS = 1.5;
const OVERLAY_ROTATE_HANDLE_OFFSET_MAX_METERS = 6;
const GRID_BASE_SPACING_METERS = 0.5;
const GRID_NODE_DISPLAY_EVERY = 4;
const GRID_EXTENT_FALLBACK_METERS = 30;
const GRID_EXTENT_MAX_METERS = 400;
const OVERLAY_HANDLE_KEYS = ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const;
type OverlayCornerKey = (typeof OVERLAY_HANDLE_KEYS)[number];
const featureTypeExpression: unknown[] = [
  "coalesce",
  ["get", "user_feature_type"],
  ["get", "user_imdfType"],
  ["get", "user_kind"],
  ["get", "feature_type"],
  ["get", "imdfType"],
  ["get", "kind"],
  "",
];
const featureCategoryExpression: unknown[] = [
  "coalesce",
  ["get", "wheelchair", ["get", "user_accessibility"]],
  ["get", "user_category"],
  ["get", "wheelchair", ["get", "accessibility"]],
  ["get", "category"],
  "",
];

const drawLineColorExpression: unknown[] = [
  "coalesce",
  ["get", "user___draw_line_color"],
  ["get", "__draw_line_color"],
  "#dc2626",
];
const geofenceFillColorExpression: unknown[] = [
  "coalesce",
  ["get", "fillColor", ["get", "style", ["get", "metadata"]]],
  ["get", "color", ["get", "style", ["get", "metadata"]]],
  "#22c55e",
];

const pointIconImageExpression: unknown[] = [
  "case",
  ["all", ["==", featureTypeExpression, "opening"], ["==", featureCategoryExpression, "entrance"]],
  "point-icon-nav-entrance",
  ["all", ["==", featureTypeExpression, "opening"], ["==", featureCategoryExpression, "door"]],
  "point-icon-nav-door",
  ["all", ["==", featureTypeExpression, "opening"], ["==", featureCategoryExpression, "stairs"]],
  "point-icon-nav-stairs",
  ["all", ["==", featureTypeExpression, "opening"], ["==", featureCategoryExpression, "elevator"]],
  "point-icon-nav-elevator",
  ["all", ["==", featureTypeExpression, "opening"], ["==", featureCategoryExpression, "escalator"]],
  "point-icon-nav-escalator",
  [
    "all",
    ["==", featureTypeExpression, "opening"],
    ["==", featureCategoryExpression, "revolving_door"],
  ],
  "point-icon-nav-revolving-door",
  ["all", ["==", featureTypeExpression, "opening"], ["==", featureCategoryExpression, "exit"]],
  "point-icon-nav-exit",
  ["all", ["==", featureTypeExpression, "opening"], ["==", featureCategoryExpression, "entrance"]],
  "point-icon-opening-entrance",
  ["all", ["==", featureTypeExpression, "opening"], ["==", featureCategoryExpression, "door"]],
  "point-icon-opening-door",
  ["all", ["==", featureTypeExpression, "opening"], ["==", featureCategoryExpression, "elevator"]],
  "point-icon-opening-elevator",
  ["all", ["==", featureTypeExpression, "opening"], ["==", featureCategoryExpression, "stairs"]],
  "point-icon-opening-stairs",
  ["all", ["==", featureTypeExpression, "opening"], ["==", featureCategoryExpression, "escalator"]],
  "point-icon-opening-escalator",
  ["all", ["==", featureTypeExpression, "opening"], ["==", featureCategoryExpression, "exit"]],
  "point-icon-opening-exit",
  ["==", featureTypeExpression, "amenity"],
  "point-icon-amenity",
  ["==", featureTypeExpression, "anchor"],
  "point-icon-anchor",
  ["==", featureTypeExpression, "detail"],
  "point-icon-detail",
  ["==", featureTypeExpression, "fixture"],
  "point-icon-fixture",
  ["==", featureTypeExpression, "kiosk"],
  "point-icon-kiosk",
  ["==", featureTypeExpression, "occupant"],
  "point-icon-occupant",
  ["==", featureTypeExpression, "opening"],
  "point-icon-opening",
  ["==", featureTypeExpression, "relationship"],
  "point-icon-relationship",
  "point-icon-default",
];

const openingEndpointIconExpression: unknown[] = [
  "match",
  ["get", "endpoint_role"],
  "connector",
  mapPointIconIdForOpeningEndpoint(undefined, "connector"),
  [
    "match",
    ["get", "category"],
    "entrance",
    mapPointIconIdForOpeningEndpoint("entrance", "node"),
    "door",
    mapPointIconIdForOpeningEndpoint("door", "node"),
    "stairs",
    mapPointIconIdForOpeningEndpoint("stairs", "node"),
    "elevator",
    mapPointIconIdForOpeningEndpoint("elevator", "node"),
    "escalator",
    mapPointIconIdForOpeningEndpoint("escalator", "node"),
    "revolving_door",
    mapPointIconIdForOpeningEndpoint("revolving_door", "node"),
    "exit",
    mapPointIconIdForOpeningEndpoint("exit", "node"),
    mapPointIconIdForOpeningEndpoint(undefined, "node"),
  ],
];

const snapMarkerIconExpression: unknown[] = [
  "match",
  ["get", "snap_state"],
  "graph_ready",
  SNAP_MARKER_GRAPH_READY_ICON_ID,
  SNAP_MARKER_ICON_ID,
];

type OpeningEndpointRole = "node" | "connector";
type SnapMarkerState = "snapped" | "graph_ready";
const NAVIGATION_NODE_CATEGORY_VALUES = new Set([
  "entrance",
  "door",
  "stairs",
  "elevator",
  "escalator",
  "revolving_door",
  "exit",
]);

type OpeningEndpointMarker = FloorFeature & {
  geometry: {
    type: "Point";
    coordinates: Coordinates;
  };
  properties: FloorFeature["properties"] & {
    source_opening_id: string;
    endpoint_index: 0 | 1;
    endpoint_role: OpeningEndpointRole;
    category: string;
    feature_type: "opening_endpoint_marker";
  };
};

type SnapMarkerFeature = FloorFeature & {
  geometry: {
    type: "Point";
    coordinates: Coordinates;
  };
  properties: FloorFeature["properties"] & {
    feature_type: "snap_marker";
    snap_state: SnapMarkerState;
  };
};

const createOpeningEndpointMarker = (
  sourceFeature: FloorFeature,
  category: string,
  coordinate: Coordinates,
  endpointIndex: 0 | 1,
): OpeningEndpointMarker => ({
  type: "Feature",
  id: `${sourceFeature.id}:endpoint:${endpointIndex}`,
  feature_type: "formation:opening_endpoint_marker",
  geometry: {
    type: "Point",
    coordinates: coordinate,
  },
  properties: {
    source_opening_id: sourceFeature.id,
    endpoint_index: endpointIndex,
    endpoint_role: endpointIndex === 0 ? "node" : "connector",
    category,
    feature_type: "opening_endpoint_marker",
  },
});

const SNAP_MARKER_ICON_SIZE = 20;
const SNAP_MARKER_INSET = 4;

const createFallbackSnapMarkerImage = (fillColor: [number, number, number]) => {
  const data = new Uint8Array(SNAP_MARKER_ICON_SIZE * SNAP_MARKER_ICON_SIZE * 4);
  for (let y = SNAP_MARKER_INSET; y < SNAP_MARKER_ICON_SIZE - SNAP_MARKER_INSET; y += 1) {
    for (let x = SNAP_MARKER_INSET; x < SNAP_MARKER_ICON_SIZE - SNAP_MARKER_INSET; x += 1) {
      const offset = (y * SNAP_MARKER_ICON_SIZE + x) * 4;
      data[offset] = fillColor[0];
      data[offset + 1] = fillColor[1];
      data[offset + 2] = fillColor[2];
      data[offset + 3] = 255;
    }
  }
  return {
    width: SNAP_MARKER_ICON_SIZE,
    height: SNAP_MARKER_ICON_SIZE,
    data,
  };
};

const createSnapMarkerImage = (
  fillColor: string,
  strokeColor: string,
): {
  width: number;
  height: number;
  data: Uint8Array;
} => {
  if (typeof document === "undefined") {
    return createFallbackSnapMarkerImage([15, 23, 42]);
  }
  const canvas = document.createElement("canvas");
  canvas.width = SNAP_MARKER_ICON_SIZE;
  canvas.height = SNAP_MARKER_ICON_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    return createFallbackSnapMarkerImage([15, 23, 42]);
  }

  context.clearRect(0, 0, SNAP_MARKER_ICON_SIZE, SNAP_MARKER_ICON_SIZE);
  context.fillStyle = fillColor;
  context.strokeStyle = strokeColor;
  context.lineWidth = 2;
  context.fillRect(
    SNAP_MARKER_INSET,
    SNAP_MARKER_INSET,
    SNAP_MARKER_ICON_SIZE - SNAP_MARKER_INSET * 2,
    SNAP_MARKER_ICON_SIZE - SNAP_MARKER_INSET * 2,
  );
  context.strokeRect(
    SNAP_MARKER_INSET + 0.5,
    SNAP_MARKER_INSET + 0.5,
    SNAP_MARKER_ICON_SIZE - SNAP_MARKER_INSET * 2 - 1,
    SNAP_MARKER_ICON_SIZE - SNAP_MARKER_INSET * 2 - 1,
  );
  const imageData = context.getImageData(0, 0, SNAP_MARKER_ICON_SIZE, SNAP_MARKER_ICON_SIZE);
  return {
    width: imageData.width,
    height: imageData.height,
    data: new Uint8Array(imageData.data),
  };
};

const createSnapMarkerFeature = (
  coordinate: Coordinates,
  state: SnapMarkerState,
  index: number,
): SnapMarkerFeature => ({
  type: "Feature",
  id: `snap-marker:${index}`,
  feature_type: "formation:snap_marker",
  geometry: {
    type: "Point",
    coordinates: coordinate,
  },
  properties: {
    feature_type: "snap_marker",
    snap_state: state,
  },
});

const readFeatureName = (feature: FloorFeature): string | undefined => {
  const name = feature.properties.name;
  if (typeof name === "string" && name.trim().length > 0) {
    return name.trim();
  }
  if (name && typeof name === "object" && !Array.isArray(name)) {
    const english = (name as { en?: unknown }).en;
    if (typeof english === "string" && english.trim().length > 0) {
      return english.trim();
    }
  }
  return undefined;
};

const readNodeCategoryFromProperties = (feature: FloorFeature): string | undefined => {
  const category = feature.properties.category;
  if (typeof category !== "string") {
    return undefined;
  }
  return NAVIGATION_NODE_CATEGORY_VALUES.has(category) ? category : undefined;
};

const inferNavigationNodeCategoryFromName = (feature: FloorFeature): string | undefined => {
  const name = readFeatureName(feature)?.toLowerCase();
  if (!name) {
    return undefined;
  }
  if (name.includes("revolving door") || name.includes("revolving_door")) {
    return "revolving_door";
  }
  if (name.includes("entrance")) {
    return "entrance";
  }
  if (name.includes("elevator")) {
    return "elevator";
  }
  if (name.includes("escalator")) {
    return "escalator";
  }
  if (name.includes("stairs") || name.includes("stair")) {
    return "stairs";
  }
  if (name.includes("door")) {
    return "door";
  }
  if (name.includes("exit")) {
    return "exit";
  }
  return undefined;
};

const resolveEndpointCategory = (feature: FloorFeature): string | undefined =>
  readNavigationNodeCategory(feature) ??
  readNodeCategoryFromProperties(feature) ??
  inferNavigationNodeCategoryFromName(feature);

export const deriveNavigationOpeningEndpointMarkers = (
  features: FloorFeature[],
): FeatureCollection => {
  const markers: FloorFeature[] = [];

  for (const feature of features) {
    if (feature.geometry.type !== "LineString" || isNavigationPathOpening(feature)) {
      continue;
    }

    const category = resolveEndpointCategory(feature);
    if (!category) {
      continue;
    }

    const [first, second] = feature.geometry.coordinates;
    if (!first || !second || feature.geometry.coordinates.length !== 2) {
      continue;
    }

    markers.push(createOpeningEndpointMarker(feature, category, first, 0));
    markers.push(createOpeningEndpointMarker(feature, category, second, 1));
  }

  return {
    type: "FeatureCollection",
    features: markers,
  };
};

const drawPolygonFillColorExpression: unknown[] = [
  "case",
  ["==", featureTypeExpression, "level"],
  "#ffffff",
  [
    "all",
    ["any", ["==", featureTypeExpression, "unit"], ["==", featureTypeExpression, "room"]],
    ["==", ["get", "formation:system_type"], "fallback_unit"],
  ],
  "#9ca3af",
  ["any", ["==", featureTypeExpression, "unit"], ["==", featureTypeExpression, "room"]],
  "#ffffff",
  ["==", featureTypeExpression, "geofence"],
  geofenceFillColorExpression,
  "#9ca3af",
];

const drawPolygonFillOpacityExpression: unknown[] = [
  "case",
  ["==", featureTypeExpression, "geofence"],
  ["coalesce", ["get", "opacity", ["get", "style", ["get", "metadata"]]], 0.35],
  ["==", featureTypeExpression, "level"],
  0,
  [
    "all",
    ["any", ["==", featureTypeExpression, "unit"], ["==", featureTypeExpression, "room"]],
    ["==", ["get", "formation:system_type"], "fallback_unit"],
  ],
  0.35,
  ["any", ["==", featureTypeExpression, "unit"], ["==", featureTypeExpression, "room"]],
  0.55,
  0.3,
];

const drawPolygonStrokeWidthExpression: unknown[] = [
  "case",
  ["==", featureTypeExpression, "level"],
  4,
  ["any", ["==", featureTypeExpression, "unit"], ["==", featureTypeExpression, "room"]],
  1,
  2,
];

const buildDrawStyles = (): Array<Record<string, unknown>> => [
  {
    id: "gl-draw-polygon-fill-inactive",
    type: "fill",
    filter: [
      "all",
      ["==", "$type", "Polygon"],
      ["==", "active", "false"],
      ["!=", "mode", "static"],
    ],
    paint: {
      "fill-color": drawPolygonFillColorExpression,
      "fill-opacity": drawPolygonFillOpacityExpression,
    },
  },
  {
    id: "gl-draw-polygon-fill-static",
    type: "fill",
    filter: ["all", ["==", "$type", "Polygon"], ["==", "mode", "static"]],
    paint: {
      "fill-color": drawPolygonFillColorExpression,
      "fill-opacity": drawPolygonFillOpacityExpression,
    },
  },
  {
    id: "gl-draw-polygon-fill-active",
    type: "fill",
    filter: ["all", ["==", "$type", "Polygon"], ["==", "active", "true"]],
    paint: {
      "fill-color": drawPolygonFillColorExpression,
      "fill-opacity": drawPolygonFillOpacityExpression,
    },
  },
  {
    id: "gl-draw-polygon-stroke-inactive",
    type: "line",
    filter: [
      "all",
      ["==", "$type", "Polygon"],
      ["==", "active", "false"],
      ["!=", "mode", "static"],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#111827",
      "line-width": drawPolygonStrokeWidthExpression,
    },
  },
  {
    id: "gl-draw-polygon-stroke-static",
    type: "line",
    filter: ["all", ["==", "$type", "Polygon"], ["==", "mode", "static"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#111827",
      "line-width": drawPolygonStrokeWidthExpression,
    },
  },
  {
    id: "gl-draw-polygon-stroke-active",
    type: "line",
    filter: ["all", ["==", "$type", "Polygon"], ["==", "active", "true"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#111827",
      "line-width": drawPolygonStrokeWidthExpression,
    },
  },
  {
    id: "gl-draw-line-inactive",
    type: "line",
    filter: [
      "all",
      ["==", "$type", "LineString"],
      ["==", "active", "false"],
      ["!=", "mode", "static"],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": drawLineColorExpression,
      "line-width": 3,
    },
  },
  {
    id: "gl-draw-line-static",
    type: "line",
    filter: ["all", ["==", "$type", "LineString"], ["==", "mode", "static"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": drawLineColorExpression,
      "line-width": 3,
    },
  },
  {
    id: "gl-draw-line-active",
    type: "line",
    filter: ["all", ["==", "$type", "LineString"], ["==", "active", "true"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": drawLineColorExpression,
      "line-width": 4,
    },
  },
  {
    id: "gl-draw-point-symbol-inactive",
    type: "symbol",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ["!=", "meta", "midpoint"],
      ["==", "active", "false"],
      ["!=", "mode", "static"],
    ],
    layout: {
      "icon-image": pointIconImageExpression,
      "icon-size": 0.8,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  },
  {
    id: "gl-draw-point-symbol-active",
    type: "symbol",
    filter: ["all", ["==", "$type", "Point"], ["!=", "meta", "midpoint"], ["==", "active", "true"]],
    layout: {
      "icon-image": pointIconImageExpression,
      "icon-size": 0.9,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  },
  {
    id: "gl-draw-polygon-and-line-vertex-halo-active",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"], ["==", "active", "true"]],
    paint: {
      "circle-radius": 10,
      "circle-color": "#ffffff",
    },
  },
  {
    id: "gl-draw-polygon-and-line-vertex-active",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"], ["==", "active", "true"]],
    paint: {
      "circle-radius": 6,
      "circle-color": "#dc2626",
    },
  },
  {
    id: "gl-draw-polygon-midpoint",
    type: "circle",
    filter: ["all", ["==", "meta", "midpoint"], ["==", "$type", "Point"]],
    paint: {
      "circle-radius": 6,
      "circle-color": "#dc2626",
    },
  },
];

const emptyFeatureCollection = (): FeatureCollection => ({
  type: "FeatureCollection",
  features: [],
});

type DrawClassNames = {
  CANVAS?: string;
  CONTROL_BASE?: string;
  CONTROL_PREFIX?: string;
  CONTROL_GROUP?: string;
  ATTRIBUTION?: string;
  [key: string]: string | undefined;
};

type RenderedProperties = {
  meta?: unknown;
  id?: unknown;
  [key: string]: unknown;
};

type RenderedFeatureHit = {
  id?: unknown;
  properties?: RenderedProperties;
  layer?: {
    id?: unknown;
  };
};

const isUpdateImageSource = (
  source: unknown,
): source is {
  updateImage: (value: {
    url: string;
    coordinates: [Coordinates, Coordinates, Coordinates, Coordinates];
  }) => void;
} => typeof source === "object" && source !== null && "updateImage" in source;

const isGeoJsonSourceWithSetData = (
  source: unknown,
): source is {
  setData: (data: FeatureCollection) => void;
} => typeof source === "object" && source !== null && "setData" in source;

const parseFeatureId = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return undefined;
};

const parseLineVertexIndex = (coordPath: string): number | undefined => {
  const segments = coordPath
    .split(".")
    .map((segment) => Number.parseInt(segment, 10))
    .filter((segment) => Number.isInteger(segment) && segment >= 0);
  const index = segments.at(-1);
  return typeof index === "number" ? index : undefined;
};

const midpointBetween = (from: Coordinates, to: Coordinates): Coordinates => [
  (from[0] + to[0]) / 2,
  (from[1] + to[1]) / 2,
];

const findNearestVertexIndex = (
  coordinates: Coordinates[],
  target: Coordinates,
): number | undefined => {
  if (coordinates.length === 0) {
    return undefined;
  }

  const exactIndex = coordinates.findIndex(
    (coordinate) => coordinate[0] === target[0] && coordinate[1] === target[1],
  );
  if (exactIndex >= 0) {
    return exactIndex;
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < coordinates.length; index += 1) {
    const coordinate = coordinates[index];
    if (!coordinate) {
      continue;
    }

    const distance =
      (coordinate[0] - target[0]) * (coordinate[0] - target[0]) +
      (coordinate[1] - target[1]) * (coordinate[1] - target[1]);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  return Number.isFinite(nearestDistance) ? nearestIndex : undefined;
};

const coordinateEquals = (left: Coordinates, right: Coordinates): boolean =>
  left[0] === right[0] && left[1] === right[1];

const coordinateKey = (coordinate: Coordinates): string => `${coordinate[0]},${coordinate[1]}`;

const normalizeForkCoordinates = (
  coordinates: Coordinates[],
  startCoordinate: Coordinates,
): Coordinates[] => {
  const withStart = coordinateEquals(coordinates[0] ?? startCoordinate, startCoordinate)
    ? coordinates
    : [startCoordinate, ...coordinates];
  const deduped: Coordinates[] = [];
  for (const coordinate of withStart) {
    const previous = deduped.at(-1);
    if (previous && coordinateEquals(previous, coordinate)) {
      continue;
    }
    deduped.push(coordinate);
  }

  if (deduped.length >= 2) {
    return deduped;
  }

  return [startCoordinate, startCoordinate];
};

const isValidCoordinate = (value: unknown): value is Coordinates =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === "number" &&
  Number.isFinite(value[0]) &&
  typeof value[1] === "number" &&
  Number.isFinite(value[1]);

const normalizePoint = (value: unknown): Coordinates | undefined => {
  if (!isValidCoordinate(value)) {
    return undefined;
  }

  return [value[0], value[1]];
};

const normalizeLine = (value: unknown): Coordinates[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value.map((entry) => normalizePoint(entry)).filter((entry) => Boolean(entry));
  if (normalized.length < 2) {
    return undefined;
  }

  return normalized as Coordinates[];
};

const normalizePolygon = (value: unknown): Coordinates[][] | undefined => {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const outerRing = value[0];
  if (!Array.isArray(outerRing)) {
    return undefined;
  }

  const normalizedRing = outerRing
    .map((entry) => normalizePoint(entry))
    .filter((entry) => Boolean(entry));
  if (normalizedRing.length < 3) {
    return undefined;
  }

  return [normalizedRing as Coordinates[]];
};

const normalizeGeometry = (
  geometry: GeoJsonGeometry | null,
): FloorFeature["geometry"] | undefined => {
  if (!geometry) {
    return undefined;
  }

  if (geometry.type === "Point") {
    const point = normalizePoint(geometry.coordinates);
    if (!point) {
      return undefined;
    }

    return {
      type: "Point",
      coordinates: point,
    };
  }

  if (geometry.type === "LineString") {
    const line = normalizeLine(geometry.coordinates);
    if (!line) {
      return undefined;
    }

    return {
      type: "LineString",
      coordinates: line,
    };
  }

  if (geometry.type === "Polygon") {
    const polygon = normalizePolygon(geometry.coordinates);
    if (!polygon) {
      return undefined;
    }

    return {
      type: "Polygon",
      coordinates: polygon,
    };
  }

  return undefined;
};

const normalizeProperties = (value: unknown): FloorFeature["properties"] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const candidate = value as Record<string, unknown>;
  return {
    ...candidate,
  } as FloorFeature["properties"];
};

const normalizeDrawFeature = (feature: GeoJsonFeature): FloorFeature | undefined => {
  const id = parseFeatureId(feature.id);
  if (!id) {
    return undefined;
  }

  const geometry = normalizeGeometry(feature.geometry ?? null);
  if (!geometry) {
    return undefined;
  }

  const normalizedType: Exclude<FloorFeature["feature_type"], undefined> =
    // biome-ignore lint/complexity/useLiteralKeys: GeoJSON properties are index-signature based.
    typeof feature.properties?.["feature_type"] === "string"
      ? // biome-ignore lint/complexity/useLiteralKeys: GeoJSON properties are index-signature based.
        (feature.properties["feature_type"] as Exclude<FloorFeature["feature_type"], undefined>)
      : // biome-ignore lint/complexity/useLiteralKeys: GeoJSON properties are index-signature based.
        typeof feature.properties?.["kind"] === "string"
        ? // biome-ignore lint/complexity/useLiteralKeys: GeoJSON properties are index-signature based.
          (feature.properties["kind"] as Exclude<FloorFeature["feature_type"], undefined>)
        : ("formation:unknown" as const);

  return {
    type: "Feature",
    id,
    feature_type: normalizedType,
    geometry,
    properties: normalizeProperties(feature.properties),
  };
};

const drawLineColorForFeature = (feature: FloorFeature): string => {
  const featureType = readFeatureTypeString(feature);
  if (featureType === "opening" || featureType === "path") {
    return readNavigationPathCategory(feature) === "wheelchair" ? "#16a34a" : "#dc2626";
  }
  return "#dc2626";
};

const toDrawFeature = (feature: FloorFeature): GeoJsonFeature => ({
  type: "Feature",
  id: feature.id,
  geometry: structuredClone(feature.geometry),
  properties: {
    ...structuredClone(feature.properties),
    __draw_line_color: drawLineColorForFeature(feature),
    feature_type: feature.feature_type,
  },
});

const toInteractionMode = (mode: string): DrawMode => {
  if (mode === "draw_point") {
    return "point";
  }

  if (mode === "draw_line_string") {
    return "line";
  }

  if (mode === "draw_polygon") {
    return "polygon";
  }

  return "select";
};

const configureDrawClassesForMapLibre = (DrawConstructor: typeof MapboxDraw) => {
  const constants = (
    DrawConstructor as unknown as {
      constants?: {
        classes?: DrawClassNames;
      };
    }
  ).constants;

  if (!constants?.classes) {
    return;
  }

  constants.classes.CANVAS = "maplibregl-canvas";
  constants.classes.CONTROL_BASE = "maplibregl-ctrl";
  constants.classes.CONTROL_PREFIX = "maplibregl-ctrl-";
  constants.classes.CONTROL_GROUP = "maplibregl-ctrl-group";
  constants.classes.ATTRIBUTION = "maplibregl-ctrl-attrib";
};

const sameFeature = (left: FloorFeature, right: FloorFeature): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const getRenderableFeatureIdAtPoint = (rendered: RenderedFeatureHit[]): string | undefined => {
  for (const hit of rendered) {
    const meta = hit.properties?.meta;
    if (meta !== "feature") {
      continue;
    }

    const id = parseFeatureId(hit.id) ?? parseFeatureId(hit.properties?.id);
    if (id) {
      return id;
    }
  }

  return undefined;
};

const getActiveDrawFeatureIds = (drawFeatures: GeoJsonFeature[]): string[] =>
  drawFeatures
    .map((feature) => {
      const activeValue =
        feature.properties && typeof feature.properties === "object"
          ? (feature.properties as { active?: unknown }).active
          : undefined;
      if (activeValue !== true && activeValue !== "true") {
        return undefined;
      }
      return parseFeatureId(feature.id);
    })
    .filter((featureId): featureId is string => Boolean(featureId));

const hasVertexOrMidpointHit = (rendered: RenderedFeatureHit[]): boolean =>
  rendered.some((hit) => {
    const meta = hit.properties?.meta;
    return meta === "vertex" || meta === "midpoint";
  });

const toHoverCursor = (meta: unknown, mode: DrawMode): string | undefined => {
  if (meta === "vertex" || meta === "midpoint") {
    return "pointer";
  }

  if (meta === "feature") {
    return mode === "select" ? "grab" : "pointer";
  }

  return undefined;
};

const getEventPoint = (event: unknown): { x: number; y: number } | undefined => {
  if (!event || typeof event !== "object") {
    return undefined;
  }

  const candidate = event as {
    point?: {
      x?: unknown;
      y?: unknown;
    };
  };
  if (!candidate.point) {
    return undefined;
  }

  if (typeof candidate.point.x !== "number" || typeof candidate.point.y !== "number") {
    return undefined;
  }

  return { x: candidate.point.x, y: candidate.point.y };
};

const getEventLngLat = (event: unknown): Coordinates | undefined => {
  if (!event || typeof event !== "object") {
    return undefined;
  }

  const candidate = event as {
    lngLat?: {
      lng?: unknown;
      lat?: unknown;
    };
  };
  if (!candidate.lngLat) {
    return undefined;
  }

  if (typeof candidate.lngLat.lng !== "number" || typeof candidate.lngLat.lat !== "number") {
    return undefined;
  }

  return [candidate.lngLat.lng, candidate.lngLat.lat];
};

const isOverlayLayerHit = (hit: RenderedFeatureHit | undefined): boolean =>
  hit?.layer?.id === OVERLAY_LAYER_ID;

const hasOverlayLayerHit = (hits: RenderedFeatureHit[]): boolean =>
  hits.some((hit) => isOverlayLayerHit(hit));

const shiftOverlayCorners = (
  corners: FloorOverlay["corners"],
  dx: number,
  dy: number,
): FloorOverlay["corners"] => ({
  topLeft: [corners.topLeft[0] + dx, corners.topLeft[1] + dy],
  topRight: [corners.topRight[0] + dx, corners.topRight[1] + dy],
  bottomRight: [corners.bottomRight[0] + dx, corners.bottomRight[1] + dy],
  bottomLeft: [corners.bottomLeft[0] + dx, corners.bottomLeft[1] + dy],
});

const overlayCenter = (corners: FloorOverlay["corners"]): Coordinates => [
  (corners.topLeft[0] + corners.topRight[0] + corners.bottomRight[0] + corners.bottomLeft[0]) / 4,
  (corners.topLeft[1] + corners.topRight[1] + corners.bottomRight[1] + corners.bottomLeft[1]) / 4,
];

const EARTH_RADIUS_METERS = 6_378_137;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const metersPerLongitude = (latitude: number): number =>
  EARTH_RADIUS_METERS * Math.cos(latitude * DEG_TO_RAD) * DEG_TO_RAD;

const toLocalMeters = (
  point: Coordinates,
  center: Coordinates,
): {
  x: number;
  y: number;
} => ({
  x: (point[0] - center[0]) * metersPerLongitude(center[1]),
  y: (point[1] - center[1]) * EARTH_RADIUS_METERS * DEG_TO_RAD,
});

const toCoordinates = (xMeters: number, yMeters: number, center: Coordinates): Coordinates => [
  center[0] + xMeters / metersPerLongitude(center[1]),
  center[1] + yMeters / (EARTH_RADIUS_METERS * DEG_TO_RAD),
];

const rotateMeters = (
  x: number,
  y: number,
  angleDegrees: number,
): {
  x: number;
  y: number;
} => {
  if (angleDegrees === 0) {
    return { x, y };
  }

  const radians = angleDegrees * DEG_TO_RAD;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
};

const overlayRotationDegrees = (overlay: FloorOverlay | undefined): number => {
  if (!overlay?.corners || overlay.visible === false) {
    return 0;
  }

  const center = overlayCenter(overlay.corners);
  const left = toLocalMeters(overlay.corners.topLeft, center);
  const right = toLocalMeters(overlay.corners.topRight, center);
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1e-9) {
    return 0;
  }
  return Math.atan2(dy, dx) * RAD_TO_DEG;
};

export const snapDistanceMetersForZoom = (zoom: number): number => {
  if (zoom >= 21) {
    return 0.05;
  }
  if (zoom >= 20) {
    return 0.1;
  }
  if (zoom >= 19) {
    return 0.2;
  }
  if (zoom >= 18) {
    return 0.5;
  }
  return 1;
};

export const gridSpacingMetersForZoom = (zoom: number): number | undefined => {
  if (zoom >= 21) {
    return 0.25;
  }
  if (zoom >= 18) {
    return GRID_BASE_SPACING_METERS;
  }
  if (zoom >= 16) {
    return 1;
  }
  if (zoom >= 14) {
    return 5;
  }
  if (zoom >= 13) {
    return 10;
  }
  return undefined;
};

const readBoundsCorner = (
  value: unknown,
):
  | {
      lng: number;
      lat: number;
    }
  | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const maybe = value as { lng?: unknown; lat?: unknown };
  if (typeof maybe.lng !== "number" || typeof maybe.lat !== "number") {
    return undefined;
  }
  return { lng: maybe.lng, lat: maybe.lat };
};

const deriveGridExtentMeters = (
  map: {
    getBounds?: () => unknown;
  },
  center: Coordinates,
  gridSpacingMeters: number,
): number => {
  const bounds = map.getBounds?.();
  if (!bounds || typeof bounds !== "object") {
    return GRID_EXTENT_FALLBACK_METERS;
  }

  const candidate = bounds as {
    getNorthEast?: () => unknown;
    getSouthWest?: () => unknown;
    _ne?: unknown;
    _sw?: unknown;
  };
  const northEast = readBoundsCorner(candidate.getNorthEast?.() ?? candidate._ne);
  const southWest = readBoundsCorner(candidate.getSouthWest?.() ?? candidate._sw);
  if (!northEast || !southWest) {
    return GRID_EXTENT_FALLBACK_METERS;
  }

  const neLocal = toLocalMeters([northEast.lng, northEast.lat], center);
  const swLocal = toLocalMeters([southWest.lng, southWest.lat], center);
  const extent = Math.max(
    Math.abs(neLocal.x),
    Math.abs(swLocal.x),
    Math.abs(neLocal.y),
    Math.abs(swLocal.y),
  );
  if (!Number.isFinite(extent) || extent <= 0) {
    return GRID_EXTENT_FALLBACK_METERS;
  }
  return Math.min(GRID_EXTENT_MAX_METERS, extent + gridSpacingMeters * 4);
};

const gridDataForViewport = (
  center: Coordinates,
  angleDegrees: number,
  extentMeters: number,
  gridSpacingMeters: number,
): FeatureCollection => {
  const clampedExtent = Math.max(gridSpacingMeters, extentMeters);
  const minStep = Math.ceil(-clampedExtent / gridSpacingMeters);
  const maxStep = Math.floor(clampedExtent / gridSpacingMeters);
  const features: FloorFeature[] = [];

  for (let step = minStep; step <= maxStep; step += 1) {
    const xMeters = step * gridSpacingMeters;
    const verticalStart = rotateMeters(xMeters, -clampedExtent, angleDegrees);
    const verticalEnd = rotateMeters(xMeters, clampedExtent, angleDegrees);
    features.push({
      type: "Feature",
      id: `grid-v-${step}`,
      feature_type: "formation:grid",
      geometry: {
        type: "LineString",
        coordinates: [
          toCoordinates(verticalStart.x, verticalStart.y, center),
          toCoordinates(verticalEnd.x, verticalEnd.y, center),
        ],
      },
      properties: {},
    });

    const yMeters = step * gridSpacingMeters;
    const horizontalStart = rotateMeters(-clampedExtent, yMeters, angleDegrees);
    const horizontalEnd = rotateMeters(clampedExtent, yMeters, angleDegrees);
    features.push({
      type: "Feature",
      id: `grid-h-${step}`,
      feature_type: "formation:grid",
      geometry: {
        type: "LineString",
        coordinates: [
          toCoordinates(horizontalStart.x, horizontalStart.y, center),
          toCoordinates(horizontalEnd.x, horizontalEnd.y, center),
        ],
      },
      properties: {},
    });
  }

  const minNodeStep = Math.ceil(-clampedExtent / (gridSpacingMeters * GRID_NODE_DISPLAY_EVERY));
  const maxNodeStep = Math.floor(clampedExtent / (gridSpacingMeters * GRID_NODE_DISPLAY_EVERY));
  for (let stepX = minNodeStep; stepX <= maxNodeStep; stepX += 1) {
    for (let stepY = minNodeStep; stepY <= maxNodeStep; stepY += 1) {
      const pointMeters = rotateMeters(
        stepX * gridSpacingMeters * GRID_NODE_DISPLAY_EVERY,
        stepY * gridSpacingMeters * GRID_NODE_DISPLAY_EVERY,
        angleDegrees,
      );
      features.push({
        type: "Feature",
        id: `grid-node-${stepX}-${stepY}`,
        feature_type: "formation:grid",
        geometry: {
          type: "Point",
          coordinates: toCoordinates(pointMeters.x, pointMeters.y, center),
        },
        properties: {},
      });
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
};

type SnapTargets = {
  vertices: Array<{
    featureId: string;
    coordinate: Coordinates;
    vertexIndex: number;
    geometryType: "Point" | "LineString" | "Polygon";
  }>;
  edges: Array<{
    featureId: string;
    start: Coordinates;
    end: Coordinates;
    segmentIndex: number;
    geometryType: "LineString" | "Polygon";
  }>;
};

type SnapCandidate = {
  coordinate: Coordinates;
  distanceMeters: number;
  kind: "vertex" | "edge" | "grid";
  targetFeatureId: string;
  targetGeometryType: "Point" | "LineString" | "Polygon";
  targetVertexIndex?: number;
  targetSegmentIndex?: number;
};

type SnapMarkerCandidate = {
  coordinate: Coordinates;
  state: SnapMarkerState;
};

const readStringProperty = (
  properties: Record<string, unknown> | undefined,
  key: string,
): string | undefined => {
  if (!properties) {
    return undefined;
  }
  const value = properties[key];
  return typeof value === "string" ? value : undefined;
};

const readBooleanProperty = (
  properties: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined => {
  if (!properties) {
    return undefined;
  }
  const value = properties[key];
  return typeof value === "boolean" ? value : undefined;
};

const readObjectProperty = (
  properties: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined => {
  if (!properties) {
    return undefined;
  }
  const value = properties[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
};

type ActiveDrawPointerTarget =
  | {
      geometryType: "LineString";
      coordinates: Coordinates[];
      activeCoordinateIndex: number;
    }
  | {
      geometryType: "Polygon";
      ring: Coordinates[];
      activeCoordinateIndex: number;
    };

const distanceMetersBetween = (
  from: Coordinates,
  to: Coordinates,
  referenceCenter: Coordinates,
): number => {
  const fromLocal = toLocalMeters(from, referenceCenter);
  const toLocal = toLocalMeters(to, referenceCenter);
  return Math.hypot(fromLocal.x - toLocal.x, fromLocal.y - toLocal.y);
};

const getClosestPointOnSegment = (
  point: Coordinates,
  segmentStart: Coordinates,
  segmentEnd: Coordinates,
  referenceCenter: Coordinates,
): Coordinates | undefined => {
  const pointLocal = toLocalMeters(point, referenceCenter);
  const startLocal = toLocalMeters(segmentStart, referenceCenter);
  const endLocal = toLocalMeters(segmentEnd, referenceCenter);
  const segmentDx = endLocal.x - startLocal.x;
  const segmentDy = endLocal.y - startLocal.y;
  const segmentLengthSquared = segmentDx * segmentDx + segmentDy * segmentDy;
  if (segmentLengthSquared <= 1e-12) {
    return undefined;
  }

  const projection =
    ((pointLocal.x - startLocal.x) * segmentDx + (pointLocal.y - startLocal.y) * segmentDy) /
    segmentLengthSquared;
  const t = Math.max(0, Math.min(1, projection));
  return toCoordinates(startLocal.x + segmentDx * t, startLocal.y + segmentDy * t, referenceCenter);
};

const appendLineSnapTargets = (
  featureId: string,
  geometryType: "LineString" | "Polygon",
  coordinates: Coordinates[],
  targets: SnapTargets,
) => {
  for (const [index, coordinate] of coordinates.entries()) {
    targets.vertices.push({
      featureId,
      coordinate,
      vertexIndex: index,
      geometryType,
    });
  }

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    if (!start || !end) {
      continue;
    }
    targets.edges.push({
      featureId,
      start,
      end,
      segmentIndex: index,
      geometryType,
    });
  }
};

const collectSnapTargets = (
  drawFeatures: GeoJsonFeature[],
  featureIdToIgnore: string,
): SnapTargets => {
  const targets: SnapTargets = {
    vertices: [],
    edges: [],
  };

  for (const feature of drawFeatures) {
    const featureId = parseFeatureId(feature.id);
    if (!featureId || featureId === featureIdToIgnore || !feature.geometry) {
      continue;
    }

    if (feature.geometry.type === "Point") {
      const coordinate = normalizePoint(feature.geometry.coordinates);
      if (coordinate) {
        targets.vertices.push({
          featureId,
          coordinate,
          vertexIndex: 0,
          geometryType: "Point",
        });
      }
      continue;
    }

    if (feature.geometry.type === "LineString") {
      const coordinates = normalizeLine(feature.geometry.coordinates);
      if (coordinates) {
        appendLineSnapTargets(featureId, "LineString", coordinates, targets);
      }
      continue;
    }

    if (feature.geometry.type === "Polygon") {
      const ring = normalizePolygon(feature.geometry.coordinates)?.[0];
      if (ring && ring.length >= 3) {
        appendLineSnapTargets(featureId, "Polygon", ring, targets);
      }
    }
  }

  return targets;
};

const findBestSnapCandidate = (
  coordinate: Coordinates,
  targets: SnapTargets,
  maxDistanceMeters: number,
  referenceCenter: Coordinates,
): SnapCandidate | undefined => {
  let bestCandidate: SnapCandidate | undefined;

  for (const vertex of targets.vertices) {
    const distanceMeters = distanceMetersBetween(coordinate, vertex.coordinate, referenceCenter);
    if (distanceMeters > maxDistanceMeters) {
      continue;
    }

    if (!bestCandidate || distanceMeters < bestCandidate.distanceMeters) {
      bestCandidate = {
        coordinate: vertex.coordinate,
        distanceMeters,
        kind: "vertex",
        targetFeatureId: vertex.featureId,
        targetGeometryType: vertex.geometryType,
        targetVertexIndex: vertex.vertexIndex,
      };
    }
  }

  for (const edge of targets.edges) {
    const closestPoint = getClosestPointOnSegment(
      coordinate,
      edge.start,
      edge.end,
      referenceCenter,
    );
    if (!closestPoint) {
      continue;
    }

    const distanceMeters = distanceMetersBetween(coordinate, closestPoint, referenceCenter);
    if (distanceMeters > maxDistanceMeters) {
      continue;
    }

    if (!bestCandidate || distanceMeters < bestCandidate.distanceMeters) {
      bestCandidate = {
        coordinate: closestPoint,
        distanceMeters,
        kind: "edge",
        targetFeatureId: edge.featureId,
        targetGeometryType: edge.geometryType,
        targetSegmentIndex: edge.segmentIndex,
      };
    }
  }

  return bestCandidate;
};

const findGridSnapCandidate = (
  coordinate: Coordinates,
  gridAngleDegrees: number,
  referenceCenter: Coordinates,
  gridSpacingMeters: number,
): SnapCandidate => {
  const local = toLocalMeters(coordinate, referenceCenter);
  const unrotated = rotateMeters(local.x, local.y, -gridAngleDegrees);
  const snappedUnrotated = {
    x: Math.round(unrotated.x / gridSpacingMeters) * gridSpacingMeters,
    y: Math.round(unrotated.y / gridSpacingMeters) * gridSpacingMeters,
  };
  const rotated = rotateMeters(snappedUnrotated.x, snappedUnrotated.y, gridAngleDegrees);
  const snappedCoordinate = toCoordinates(rotated.x, rotated.y, referenceCenter);
  return {
    coordinate: snappedCoordinate,
    distanceMeters: distanceMetersBetween(coordinate, snappedCoordinate, referenceCenter),
    kind: "grid",
    targetFeatureId: "grid",
    targetGeometryType: "Point",
  };
};

const findBestSnapCandidateWithGrid = (
  coordinate: Coordinates,
  targets: SnapTargets,
  maxDistanceMeters: number,
  referenceCenter: Coordinates,
  gridEnabled: boolean,
  gridAngleDegrees: number,
  gridSpacingMeters: number,
): SnapCandidate | undefined => {
  const geometryCandidate = findBestSnapCandidate(
    coordinate,
    targets,
    maxDistanceMeters,
    referenceCenter,
  );
  if (!gridEnabled) {
    return geometryCandidate;
  }

  const gridCandidate = findGridSnapCandidate(
    coordinate,
    gridAngleDegrees,
    referenceCenter,
    gridSpacingMeters,
  );
  const maxGridDistanceMeters = maxDistanceMeters * 0.65;
  if (gridCandidate.distanceMeters > maxGridDistanceMeters) {
    return geometryCandidate;
  }
  if (!geometryCandidate || gridCandidate.distanceMeters <= geometryCandidate.distanceMeters) {
    return gridCandidate;
  }
  return geometryCandidate;
};

const snapCoordinates = (
  coordinates: Coordinates[],
  targets: SnapTargets,
  maxDistanceMeters: number,
  referenceCenter: Coordinates,
  gridEnabled: boolean,
  gridAngleDegrees: number,
  gridSpacingMeters: number,
): {
  coordinates: Coordinates[];
  changed: boolean;
  candidates: Array<SnapCandidate | undefined>;
} => {
  let changed = false;
  const candidates: Array<SnapCandidate | undefined> = [];
  const snapped = coordinates.map((coordinate) => {
    const candidate = findBestSnapCandidateWithGrid(
      coordinate,
      targets,
      maxDistanceMeters,
      referenceCenter,
      gridEnabled,
      gridAngleDegrees,
      gridSpacingMeters,
    );
    candidates.push(candidate);
    if (!candidate) {
      return coordinate;
    }

    if (!coordinateEquals(coordinate, candidate.coordinate)) {
      changed = true;
    }

    return candidate.coordinate;
  });

  return { coordinates: snapped, changed, candidates };
};

const activeDrawPointerTargetForFeature = (
  feature: GeoJsonFeature,
): ActiveDrawPointerTarget | undefined => {
  if (!feature.geometry) {
    return undefined;
  }

  if (feature.geometry.type === "LineString") {
    const coordinates = normalizeLine(feature.geometry.coordinates);
    if (!coordinates || coordinates.length === 0) {
      return undefined;
    }

    return {
      geometryType: "LineString",
      coordinates,
      activeCoordinateIndex: coordinates.length - 1,
    };
  }

  if (feature.geometry.type === "Polygon") {
    const ring = normalizePolygon(feature.geometry.coordinates)?.[0];
    if (!ring || ring.length === 0) {
      return undefined;
    }

    const lastIndex = ring.length - 1;
    const firstCoordinate = ring[0];
    const lastCoordinate = ring[lastIndex];
    if (!firstCoordinate || !lastCoordinate) {
      return undefined;
    }
    const likelyClosed = lastIndex >= 1 && coordinateEquals(lastCoordinate, firstCoordinate);
    const activeCoordinateIndex = likelyClosed ? Math.max(0, lastIndex - 1) : lastIndex;

    return {
      geometryType: "Polygon",
      ring,
      activeCoordinateIndex,
    };
  }

  return undefined;
};

const isNavigationPathLineFeature = (feature: GeoJsonFeature | undefined): boolean => {
  if (!feature) {
    return false;
  }
  const normalized = normalizeDrawFeature(feature);
  return Boolean(
    normalized && normalized.geometry.type === "LineString" && isNavigationPathOpening(normalized),
  );
};

const canSplitOrForkLineFeature = (feature: GeoJsonFeature | undefined): boolean => {
  if (!feature || feature.geometry?.type !== "LineString") {
    return false;
  }

  const properties =
    feature.properties &&
    typeof feature.properties === "object" &&
    !Array.isArray(feature.properties)
      ? (feature.properties as Record<string, unknown>)
      : undefined;
  const category =
    readStringProperty(properties, "category") ?? readStringProperty(properties, "user_category");
  if (category && NAVIGATION_NODE_CATEGORY_VALUES.has(category)) {
    return false;
  }
  if (category === "pedestrian") {
    return true;
  }

  const featureType =
    readStringProperty(properties, "feature_type") ??
    readStringProperty(properties, "user_feature_type") ??
    readStringProperty(properties, "kind") ??
    readStringProperty(properties, "user_kind");
  if (featureType === "relationship") {
    return false;
  }
  if (featureType === "path") {
    return true;
  }
  if (featureType === "opening") {
    return true;
  }

  const accessibility =
    readObjectProperty(properties, "accessibility") ??
    readObjectProperty(properties, "user_accessibility");
  if (readBooleanProperty(accessibility, "wheelchair") === true) {
    return true;
  }

  return false;
};

const isNavigationNodeLineFeature = (feature: GeoJsonFeature | undefined): boolean => {
  if (!feature) {
    return false;
  }
  const normalized = normalizeDrawFeature(feature);
  return Boolean(
    normalized &&
      normalized.geometry.type === "LineString" &&
      normalized.geometry.coordinates.length === 2 &&
      readNavigationNodeCategory(normalized),
  );
};

const snapMarkerStateForCandidate = (
  candidate: SnapCandidate,
  sourceFeature: GeoJsonFeature,
  drawFeaturesById: Map<string, GeoJsonFeature>,
): SnapMarkerState => {
  if (!isNavigationPathLineFeature(sourceFeature)) {
    return "snapped";
  }
  if (candidate.kind !== "vertex" || candidate.targetVertexIndex !== 1) {
    return "snapped";
  }

  const targetFeature = drawFeaturesById.get(candidate.targetFeatureId);
  return isNavigationNodeLineFeature(targetFeature) ? "graph_ready" : "snapped";
};

const angleFromCenter = (center: Coordinates, point: Coordinates): number => {
  const localPoint = toLocalMeters(point, center);
  return Math.atan2(localPoint.y, localPoint.x);
};

const rotateOverlayCorners = (
  corners: FloorOverlay["corners"],
  angleDegrees: number,
): FloorOverlay["corners"] => {
  const center = overlayCenter(corners);
  return {
    topLeft: rotateAroundPoint(corners.topLeft, center, angleDegrees),
    topRight: rotateAroundPoint(corners.topRight, center, angleDegrees),
    bottomRight: rotateAroundPoint(corners.bottomRight, center, angleDegrees),
    bottomLeft: rotateAroundPoint(corners.bottomLeft, center, angleDegrees),
  };
};

const rotateHandleCoordinate = (corners: FloorOverlay["corners"]): Coordinates => {
  const center = overlayCenter(corners);
  const topRightMeters = toLocalMeters(corners.topRight, center);
  const distanceFromCenter = Math.hypot(topRightMeters.x, topRightMeters.y);
  if (distanceFromCenter < 1e-6) {
    return corners.topRight;
  }

  const offsetDistance = Math.min(
    OVERLAY_ROTATE_HANDLE_OFFSET_MAX_METERS,
    Math.max(
      OVERLAY_ROTATE_HANDLE_OFFSET_MIN_METERS,
      distanceFromCenter * OVERLAY_ROTATE_HANDLE_OFFSET_RATIO,
    ),
  );
  const normalized = {
    x: topRightMeters.x / distanceFromCenter,
    y: topRightMeters.y / distanceFromCenter,
  };

  return toCoordinates(
    topRightMeters.x + normalized.x * offsetDistance,
    topRightMeters.y + normalized.y * offsetDistance,
    center,
  );
};

const isDrawInMode = (
  draw: {
    getMode?: () => string;
  },
  mode: string,
): boolean => draw.getMode?.() === mode;

const drawHasSelectedFeature = (
  draw: {
    getSelectedIds?: () => string[];
  },
  featureId: string,
): boolean => (draw.getSelectedIds?.() ?? []).includes(featureId);

const firstDrawLayerId = (
  styleLayers:
    | Array<{
        id?: string;
      }>
    | undefined,
): string | undefined =>
  styleLayers?.find((layer) => typeof layer.id === "string" && layer.id.startsWith("gl-draw-"))?.id;

const createOverlayHandleElement = (
  kind: "corner" | "center" | "rotate",
  corner?: OverlayCornerKey,
): HTMLDivElement => {
  const element = document.createElement("div");
  element.setAttribute("data-overlay-handle", kind);
  if (corner) {
    element.setAttribute("data-overlay-corner", corner);
  }
  const size =
    kind === "center"
      ? OVERLAY_CENTER_HANDLE_SIZE
      : kind === "rotate"
        ? OVERLAY_ROTATE_HANDLE_SIZE
        : OVERLAY_HANDLE_SIZE;
  const backgroundColor =
    kind === "center"
      ? OVERLAY_CENTER_HANDLE_COLOR
      : kind === "rotate"
        ? OVERLAY_ROTATE_HANDLE_COLOR
        : OVERLAY_HANDLE_COLOR;
  element.style.width = `${size}px`;
  element.style.height = `${size}px`;
  element.style.borderRadius = "9999px";
  element.style.backgroundColor = backgroundColor;
  element.style.border = `2px solid ${OVERLAY_HANDLE_STROKE_COLOR}`;
  element.style.display = "grid";
  element.style.placeItems = "center";
  element.style.boxShadow = "0 0 0 1px rgba(0, 0, 0, 0.2)";
  element.style.cursor = kind === "center" ? "move" : "grab";
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("width", kind === "center" ? "11" : "10");
  icon.setAttribute("height", kind === "center" ? "11" : "10");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "#ffffff");
  icon.setAttribute("stroke-width", "1.75");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");

  if (kind === "center") {
    icon.innerHTML =
      '<path d="M8 2v12"/><path d="M2 8h12"/><path d="m8 2 2 2"/><path d="m8 2-2 2"/><path d="m14 8-2 2"/><path d="m14 8-2-2"/><path d="m8 14 2-2"/><path d="m8 14-2-2"/><path d="m2 8 2 2"/><path d="m2 8 2-2"/>';
  } else if (kind === "rotate") {
    icon.innerHTML =
      '<path d="M12.5 5.5a4.8 4.8 0 1 0 .2 4.6"/><path d="m11.5 1.7 2.8-.2-.2 2.8"/>';
  } else {
    icon.innerHTML = '<path d="M4 12 12 4"/><path d="m8.6 4H12v3.4"/>';
    const rotationByCorner: Record<OverlayCornerKey, string> = {
      topLeft: "180deg",
      topRight: "0deg",
      bottomRight: "90deg",
      bottomLeft: "270deg",
    };
    icon.style.transform = `rotate(${rotationByCorner[corner ?? "topRight"]})`;
  }

  element.append(icon);
  return element;
};

const normalizeBearingDegrees = (value: number): number => (((value % 360) + 540) % 360) - 180;

export const createMapController = async (
  container: HTMLElement,
  maptilerApiKey: string,
  mapStyleId: string,
  handlers: {
    onFeaturesChange: FeaturesChangeHandler;
    onFeatureSelectionChange: FeatureSelectionChangeHandler;
    onViewStateChange: ViewStateHandler;
    onInteractionModeChange: InteractionModeChangeHandler;
    onOverlayCornersChange: OverlayCornersChangeHandler;
    onOverlayInteractionStart?: OverlayInteractionHandler;
    onOverlayInteractionEnd?: OverlayInteractionHandler;
    onVertexSelectionChange?: VertexSelectionChangeHandler;
    onMapClick?: MapClickHandler;
  },
  initialView?: {
    center: Coordinates;
    zoom: number;
  },
  options?: {
    snapping?: Partial<SnapSettings>;
  },
): Promise<MapController> => {
  const maplibre = (await import("maplibre-gl")) as MapLibreModule;
  configureDrawClassesForMapLibre(MapboxDraw);

  const map = new maplibre.Map({
    container,
    style: `https://api.maptiler.com/maps/${mapStyleId}/style.json?key=${maptilerApiKey}`,
    center: initialView?.center ?? [5.1214, 52.0907],
    zoom: initialView?.zoom ?? 17,
    maxZoom: 24,
  });

  const draw = new MapboxDraw({
    displayControlsDefault: false,
    defaultMode: "simple_select",
    userProperties: true,
    styles: buildDrawStyles(),
  });

  let isStyleReady = false;
  let isSyncingExternalState = false;
  let currentFeatures: FeatureCollection = emptyFeatureCollection();
  let currentLockedFeatureIds = new Set<string>();
  let currentRouteOverlay: FeatureCollection = emptyFeatureCollection();
  let currentSnapMarkers: FeatureCollection = emptyFeatureCollection();
  let currentOverlay: FloorOverlay | undefined;
  let currentInteractionMode: DrawMode = "select";
  let currentOrientationMode: OrientationMode = "north";
  let currentRoutePickEnabled = false;
  let currentSnapEnabled = options?.snapping?.enabled ?? true;
  let currentGridVisible = false;
  let currentSelectedFeatureId: string | undefined;
  let pendingForkState: PendingForkState | undefined;
  let overlayDragState:
    | {
        startLngLat: Coordinates;
        startPoint: { x: number; y: number };
        startCorners: FloorOverlay["corners"];
        hasMoved: boolean;
      }
    | undefined;
  let suppressNextClick = false;
  type DrawWithSelectedPoints = {
    getSelectedPoints?: () => {
      features?: unknown[];
    };
  };
  type SelectedLineVertex = {
    featureId: string;
    coordinate: Coordinates;
    vertexIndex: number;
  };
  let lastSelectedLineVertex: SelectedLineVertex | undefined;
  type MarkerInstance = InstanceType<MapLibreModule["Marker"]>;
  const overlayHandleMarkers: Partial<Record<OverlayCornerKey, MarkerInstance>> = {};
  let overlayCenterMarker: MarkerInstance | undefined;
  let overlayRotateMarker: MarkerInstance | undefined;
  let overlayCenterDragStart:
    | {
        startCenter: Coordinates;
        startCorners: FloorOverlay["corners"];
      }
    | undefined;
  let overlayRotateDragStart:
    | {
        startCorners: FloorOverlay["corners"];
        startAngleRadians: number;
      }
    | undefined;
  let overlayCornersUpdateAnimationFrame: number | undefined;
  let pendingOverlayCornersUpdate: FloorOverlay["corners"] | undefined;
  let isOverlayInteractionActive = false;
  let lastAppliedOrientationBearing: number | undefined;

  const scheduleAnimationFrame = (callback: FrameRequestCallback): number => {
    if (typeof globalThis.requestAnimationFrame === "function") {
      return globalThis.requestAnimationFrame(callback);
    }

    return globalThis.setTimeout(() => callback(Date.now()), 0);
  };

  const cancelScheduledAnimationFrame = (id: number) => {
    if (typeof globalThis.cancelAnimationFrame === "function") {
      globalThis.cancelAnimationFrame(id);
      return;
    }

    globalThis.clearTimeout(id);
  };

  const applyOverlayCornersUpdate = (nextCorners: FloorOverlay["corners"]) => {
    if (!currentOverlay || currentOverlay.locked) {
      return;
    }

    currentOverlay = {
      ...currentOverlay,
      corners: nextCorners,
      updatedAt: new Date().toISOString(),
    };
    applyOverlay();
    syncOverlayHandles();
    handlers.onOverlayCornersChange(nextCorners);
  };

  const startOverlayInteraction = () => {
    if (isOverlayInteractionActive) {
      return;
    }

    isOverlayInteractionActive = true;
    handlers.onOverlayInteractionStart?.();
  };

  const endOverlayInteraction = () => {
    if (!isOverlayInteractionActive) {
      return;
    }

    isOverlayInteractionActive = false;
    handlers.onOverlayInteractionEnd?.();
  };

  const flushOverlayCornersUpdate = () => {
    if (overlayCornersUpdateAnimationFrame !== undefined) {
      cancelScheduledAnimationFrame(overlayCornersUpdateAnimationFrame);
      overlayCornersUpdateAnimationFrame = undefined;
    }

    const nextCorners = pendingOverlayCornersUpdate;
    pendingOverlayCornersUpdate = undefined;
    if (!nextCorners) {
      return;
    }

    applyOverlayCornersUpdate(nextCorners);
  };

  const cancelOverlayCornersUpdate = () => {
    pendingOverlayCornersUpdate = undefined;
    if (overlayCornersUpdateAnimationFrame !== undefined) {
      cancelScheduledAnimationFrame(overlayCornersUpdateAnimationFrame);
      overlayCornersUpdateAnimationFrame = undefined;
    }
  };

  const scheduleOverlayCornersUpdate = (nextCorners: FloorOverlay["corners"]) => {
    if (overlayCornersUpdateAnimationFrame === undefined) {
      applyOverlayCornersUpdate(nextCorners);
      overlayCornersUpdateAnimationFrame = scheduleAnimationFrame(() => {
        overlayCornersUpdateAnimationFrame = undefined;
        flushOverlayCornersUpdate();
      });
      return;
    }

    pendingOverlayCornersUpdate = nextCorners;
  };

  const hasSelectedVertex = () => {
    try {
      const selectedPoints = (draw as unknown as DrawWithSelectedPoints).getSelectedPoints?.();
      return Array.isArray(selectedPoints?.features) && selectedPoints.features.length > 0;
    } catch {
      // Mapbox Draw may transiently hold stale coord paths while deleting a vertex.
      // Treat that brief state as "no selected vertex" instead of crashing the app.
      return false;
    }
  };

  const getSelectedLineVertex = (): SelectedLineVertex | undefined => {
    try {
      const selectedPoints = (draw as unknown as DrawWithSelectedPoints).getSelectedPoints?.();
      if (!Array.isArray(selectedPoints?.features)) {
        return undefined;
      }

      const findParentLineFeatureId = (coordinate: Coordinates): string | undefined => {
        const drawFeatures = draw.getAll().features;
        let nearestFeatureId: string | undefined;
        let nearestDistance = Number.POSITIVE_INFINITY;

        for (const feature of drawFeatures) {
          if (feature.geometry.type !== "LineString") {
            continue;
          }

          const featureId = parseFeatureId(feature.id);
          if (!featureId) {
            continue;
          }

          const lineCoordinates = feature.geometry.coordinates
            .map((entry) => normalizePoint(entry))
            .filter((entry): entry is Coordinates => Boolean(entry));
          if (lineCoordinates.length < 2) {
            continue;
          }

          const nearestVertexIndex = findNearestVertexIndex(lineCoordinates, coordinate);
          if (nearestVertexIndex === undefined) {
            continue;
          }

          const nearestVertex = lineCoordinates[nearestVertexIndex];
          if (!nearestVertex) {
            continue;
          }

          const distance =
            (nearestVertex[0] - coordinate[0]) * (nearestVertex[0] - coordinate[0]) +
            (nearestVertex[1] - coordinate[1]) * (nearestVertex[1] - coordinate[1]);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestFeatureId = featureId;
          }
        }

        return nearestFeatureId;
      };

      for (const selectedPoint of selectedPoints.features) {
        if (!selectedPoint || typeof selectedPoint !== "object") {
          continue;
        }

        const candidate = selectedPoint as {
          geometry?: {
            type?: unknown;
            coordinates?: unknown;
          };
          properties?: {
            parent?: unknown;
            coord_path?: unknown;
            coordPath?: unknown;
          };
        };

        if (candidate.geometry?.type !== "Point") {
          continue;
        }

        const coordinate = normalizePoint(candidate.geometry.coordinates);
        if (!coordinate) {
          continue;
        }

        const explicitParentFeatureId =
          parseFeatureId(candidate.properties?.parent) ??
          draw.getSelectedIds?.()[0] ??
          currentSelectedFeatureId;
        const parentFeatureId = explicitParentFeatureId ?? findParentLineFeatureId(coordinate);
        if (!parentFeatureId) {
          continue;
        }

        const coordPath =
          typeof candidate.properties?.coord_path === "string"
            ? candidate.properties.coord_path
            : typeof candidate.properties?.coordPath === "string"
              ? candidate.properties.coordPath
              : undefined;

        const parentFeature =
          draw.get(parentFeatureId) ??
          (() => {
            const fallbackFeatureId = findParentLineFeatureId(coordinate);
            return fallbackFeatureId ? draw.get(fallbackFeatureId) : undefined;
          })();
        if (!parentFeature || parentFeature.geometry.type !== "LineString") {
          continue;
        }

        const lineCoordinates = parentFeature.geometry.coordinates
          .map((entry) => normalizePoint(entry))
          .filter((entry): entry is Coordinates => Boolean(entry));
        if (lineCoordinates.length < 2) {
          continue;
        }

        const vertexIndex =
          (coordPath ? parseLineVertexIndex(coordPath) : undefined) ??
          findNearestVertexIndex(lineCoordinates, coordinate);
        if (vertexIndex === undefined || vertexIndex < 0 || vertexIndex >= lineCoordinates.length) {
          continue;
        }

        return {
          featureId: parentFeatureId,
          coordinate,
          vertexIndex,
        };
      }
    } catch {
      return undefined;
    }

    return undefined;
  };

  const emitVertexSelectionChange = () => {
    const selectedVertex = getSelectedLineVertex();
    if (selectedVertex) {
      lastSelectedLineVertex = selectedVertex;
    }
    handlers.onVertexSelectionChange?.(hasSelectedVertex());
  };

  const withExternalSyncGuard = (action: () => void) => {
    isSyncingExternalState = true;
    try {
      action();
    } finally {
      isSyncingExternalState = false;
    }
  };

  const applyInteractionMode = () => {
    if (currentInteractionMode === "point") {
      if (!isDrawInMode(draw, "draw_point")) {
        draw.changeMode("draw_point");
      }
    } else if (currentInteractionMode === "line") {
      if (!isDrawInMode(draw, "draw_line_string")) {
        draw.changeMode("draw_line_string");
      }
    } else if (currentInteractionMode === "polygon") {
      if (!isDrawInMode(draw, "draw_polygon")) {
        draw.changeMode("draw_polygon");
      }
    } else {
      if (!isDrawInMode(draw, "direct_select")) {
        draw.changeMode("simple_select");
      }
    }

    if (currentInteractionMode === "select") {
      map.dragPan.enable();
      return;
    }

    map.dragPan.disable();
  };

  const applySelection = () => {
    if (currentInteractionMode !== "select") {
      return;
    }

    if (currentSelectedFeatureId && currentLockedFeatureIds.has(currentSelectedFeatureId)) {
      draw.changeMode("simple_select", {
        featureIds: [],
      });
      return;
    }

    const selectedFeature = currentSelectedFeatureId
      ? draw.get(currentSelectedFeatureId)
      : undefined;
    if (currentSelectedFeatureId && selectedFeature) {
      const selectedGeometryType = selectedFeature.geometry?.type;
      const canUseDirectSelect = selectedGeometryType !== "Point";
      if (isDrawInMode(draw, "direct_select")) {
        if (!canUseDirectSelect) {
          draw.changeMode("simple_select", {
            featureIds: [currentSelectedFeatureId],
          });
          return;
        }

        if (drawHasSelectedFeature(draw, currentSelectedFeatureId)) {
          return;
        }

        draw.changeMode("direct_select", {
          featureId: currentSelectedFeatureId,
        });
        return;
      }

      draw.changeMode("simple_select", {
        featureIds: [currentSelectedFeatureId],
      });
      return;
    }

    draw.changeMode("simple_select", {
      featureIds: [],
    });
  };

  const canDragOverlay = (): boolean =>
    currentInteractionMode === "select" &&
    Boolean(currentOverlay?.imageDataUrl) &&
    currentOverlay?.visible !== false &&
    !currentOverlay?.locked;

  const applyFeatures = () => {
    if (
      isDrawInMode(draw, "draw_point") ||
      isDrawInMode(draw, "draw_line_string") ||
      isDrawInMode(draw, "draw_polygon")
    ) {
      // Keep in-progress sketch edits under Draw's control until drawing ends.
      return;
    }

    const nextById = new Map(currentFeatures.features.map((feature) => [feature.id, feature]));

    const currentDrawFeatures = draw
      .getAll()
      .features.map((feature) => normalizeDrawFeature(feature))
      .filter((feature): feature is FloorFeature => Boolean(feature));

    const currentById = new Map(currentDrawFeatures.map((feature) => [feature.id, feature]));

    const idsToDelete = Array.from(currentById.keys()).filter((id) => !nextById.has(id));
    if (idsToDelete.length > 0) {
      draw.delete(idsToDelete);
    }

    const idsToReplace = Array.from(nextById.entries())
      .filter(([id, feature]) => {
        const existing = currentById.get(id);
        if (!existing) {
          return true;
        }

        return !sameFeature(existing, feature);
      })
      .map(([id]) => id);

    if (idsToReplace.length > 0) {
      draw.delete(idsToReplace);
      draw.add({
        type: "FeatureCollection",
        features: idsToReplace
          .map((id) => nextById.get(id))
          .filter((feature): feature is FloorFeature => Boolean(feature))
          .map((feature) => toDrawFeature(feature)),
      });
    }
  };

  const removeOverlayHandles = () => {
    for (const key of OVERLAY_HANDLE_KEYS) {
      overlayHandleMarkers[key]?.remove();
      delete overlayHandleMarkers[key];
    }
    overlayCenterMarker?.remove();
    overlayCenterMarker = undefined;
    overlayRotateMarker?.remove();
    overlayRotateMarker = undefined;
    overlayCenterDragStart = undefined;
    overlayRotateDragStart = undefined;
    endOverlayInteraction();
  };

  const syncOverlayHandles = () => {
    if (!isStyleReady) {
      return;
    }

    const showHandles =
      Boolean(currentOverlay?.imageDataUrl) &&
      !currentOverlay?.locked &&
      currentOverlay?.visible !== false;
    if (!showHandles || !currentOverlay) {
      removeOverlayHandles();
      return;
    }

    for (const key of OVERLAY_HANDLE_KEYS) {
      const lngLat = currentOverlay.corners[key];
      const existing = overlayHandleMarkers[key];
      if (existing) {
        existing.setLngLat(lngLat);
        continue;
      }

      const marker = new maplibre.Marker({
        element: createOverlayHandleElement("corner", key),
        draggable: true,
      })
        .setLngLat(lngLat)
        .addTo(map);

      marker.on("dragstart", () => {
        startOverlayInteraction();
        map.dragPan.disable();
      });

      marker.on("drag", () => {
        if (!currentOverlay || currentOverlay.locked) {
          return;
        }

        const handlePosition = marker.getLngLat();
        const nextCorners = transformOverlayFromDraggedCorner(currentOverlay.corners, key, [
          handlePosition.lng,
          handlePosition.lat,
        ]);
        scheduleOverlayCornersUpdate(nextCorners);
      });

      marker.on("dragend", () => {
        flushOverlayCornersUpdate();
        endOverlayInteraction();
        if (currentInteractionMode === "select") {
          map.dragPan.enable();
        }
      });

      overlayHandleMarkers[key] = marker;
    }

    const center = overlayCenter(currentOverlay.corners);
    if (overlayCenterMarker) {
      overlayCenterMarker.setLngLat(center);
    } else {
      overlayCenterMarker = new maplibre.Marker({
        element: createOverlayHandleElement("center"),
        draggable: true,
      })
        .setLngLat(center)
        .addTo(map);

      overlayCenterMarker.on("dragstart", () => {
        if (!currentOverlay || currentOverlay.locked) {
          return;
        }

        overlayCenterDragStart = {
          startCenter: overlayCenter(currentOverlay.corners),
          startCorners: structuredClone(currentOverlay.corners),
        };
        startOverlayInteraction();
        map.dragPan.disable();
      });

      overlayCenterMarker.on("drag", () => {
        if (
          !currentOverlay ||
          currentOverlay.locked ||
          !overlayCenterDragStart ||
          !overlayCenterMarker
        ) {
          return;
        }

        const handlePosition = overlayCenterMarker.getLngLat();
        const deltaLng = handlePosition.lng - overlayCenterDragStart.startCenter[0];
        const deltaLat = handlePosition.lat - overlayCenterDragStart.startCenter[1];
        const nextCorners = shiftOverlayCorners(
          overlayCenterDragStart.startCorners,
          deltaLng,
          deltaLat,
        );
        scheduleOverlayCornersUpdate(nextCorners);
      });

      overlayCenterMarker.on("dragend", () => {
        flushOverlayCornersUpdate();
        overlayCenterDragStart = undefined;
        endOverlayInteraction();
        if (currentInteractionMode === "select") {
          map.dragPan.enable();
        }
      });
    }

    const rotateHandle = rotateHandleCoordinate(currentOverlay.corners);
    if (overlayRotateMarker) {
      overlayRotateMarker.setLngLat(rotateHandle);
      return;
    }

    overlayRotateMarker = new maplibre.Marker({
      element: createOverlayHandleElement("rotate"),
      draggable: true,
    })
      .setLngLat(rotateHandle)
      .addTo(map);

    overlayRotateMarker.on("dragstart", () => {
      if (!currentOverlay || currentOverlay.locked || !overlayRotateMarker) {
        return;
      }

      const rotateHandlePosition = overlayRotateMarker.getLngLat();
      overlayRotateDragStart = {
        startCorners: structuredClone(currentOverlay.corners),
        startAngleRadians: angleFromCenter(overlayCenter(currentOverlay.corners), [
          rotateHandlePosition.lng,
          rotateHandlePosition.lat,
        ]),
      };
      startOverlayInteraction();
      map.dragPan.disable();
    });

    overlayRotateMarker.on("drag", () => {
      if (
        !currentOverlay ||
        currentOverlay.locked ||
        !overlayRotateDragStart ||
        !overlayRotateMarker
      ) {
        return;
      }

      const centerPoint = overlayCenter(overlayRotateDragStart.startCorners);
      const handlePosition = overlayRotateMarker.getLngLat();
      const currentAngle = angleFromCenter(centerPoint, [handlePosition.lng, handlePosition.lat]);
      const deltaAngleRadians = currentAngle - overlayRotateDragStart.startAngleRadians;
      const deltaAngleDegrees = deltaAngleRadians * RAD_TO_DEG;
      const nextCorners = rotateOverlayCorners(
        overlayRotateDragStart.startCorners,
        deltaAngleDegrees,
      );
      scheduleOverlayCornersUpdate(nextCorners);
    });

    overlayRotateMarker.on("dragend", () => {
      flushOverlayCornersUpdate();
      overlayRotateDragStart = undefined;
      endOverlayInteraction();
      if (currentInteractionMode === "select") {
        map.dragPan.enable();
      }
    });
  };

  const gridRotationDegrees = (): number => overlayRotationDegrees(currentOverlay);

  const applyOrientationBearing = (force = false) => {
    if (!isStyleReady) {
      return;
    }

    const targetBearing = currentOrientationMode === "north" ? 0 : -gridRotationDegrees();
    if (!Number.isFinite(targetBearing)) {
      return;
    }

    const normalizedTarget = normalizeBearingDegrees(targetBearing);
    if (!force && lastAppliedOrientationBearing !== undefined) {
      const delta = Math.abs(normalizedTarget - lastAppliedOrientationBearing);
      if (delta < 0.01) {
        return;
      }
    }

    map.easeTo({
      bearing: normalizedTarget,
      duration: 200,
      essential: true,
    });
    lastAppliedOrientationBearing = normalizedTarget;
  };

  const applyGridOverlay = () => {
    const source = map.getSource(GRID_SOURCE_ID);
    const center = [map.getCenter().lng, map.getCenter().lat] as Coordinates;
    const gridSpacingMeters = gridSpacingMetersForZoom(map.getZoom());
    const gridVisibleAtZoom = currentGridVisible && typeof gridSpacingMeters === "number";
    const extent = gridVisibleAtZoom
      ? deriveGridExtentMeters(map, center, gridSpacingMeters)
      : GRID_EXTENT_FALLBACK_METERS;
    const gridData = gridVisibleAtZoom
      ? gridDataForViewport(center, gridRotationDegrees(), extent, gridSpacingMeters)
      : emptyFeatureCollection();

    if (isGeoJsonSourceWithSetData(source)) {
      source.setData(gridData);
    } else if (!source) {
      map.addSource(GRID_SOURCE_ID, {
        type: "geojson",
        data: gridData,
      });
    }

    const beforeLayerId = firstDrawLayerId(map.getStyle().layers);
    if (!map.getLayer(GRID_LINE_LAYER_ID)) {
      map.addLayer(
        {
          id: GRID_LINE_LAYER_ID,
          type: "line",
          source: GRID_SOURCE_ID,
          filter: ["==", "$type", "LineString"],
          paint: {
            "line-color": "#6b7280",
            "line-width": 1,
            "line-opacity": 0.45,
          },
          layout: {
            visibility: gridVisibleAtZoom ? "visible" : "none",
          },
        },
        beforeLayerId,
      );
    } else {
      map.setLayoutProperty(
        GRID_LINE_LAYER_ID,
        "visibility",
        gridVisibleAtZoom ? "visible" : "none",
      );
    }

    if (!map.getLayer(GRID_NODE_LAYER_ID)) {
      map.addLayer(
        {
          id: GRID_NODE_LAYER_ID,
          type: "circle",
          source: GRID_SOURCE_ID,
          filter: ["==", "$type", "Point"],
          paint: {
            "circle-color": "#6b7280",
            "circle-opacity": 0.35,
            "circle-radius": 1.25,
          },
          layout: {
            visibility: gridVisibleAtZoom ? "visible" : "none",
          },
        },
        beforeLayerId,
      );
    } else {
      map.setLayoutProperty(
        GRID_NODE_LAYER_ID,
        "visibility",
        gridVisibleAtZoom ? "visible" : "none",
      );
    }

    if (beforeLayerId) {
      map.moveLayer(GRID_LINE_LAYER_ID, beforeLayerId);
      map.moveLayer(GRID_NODE_LAYER_ID, beforeLayerId);
    }
  };

  const applyOverlay = () => {
    if (!currentOverlay?.imageDataUrl) {
      if (map.getLayer(OVERLAY_LAYER_ID)) {
        map.removeLayer(OVERLAY_LAYER_ID);
      }
      if (map.getSource(OVERLAY_SOURCE_ID)) {
        map.removeSource(OVERLAY_SOURCE_ID);
      }
      removeOverlayHandles();
      applyGridOverlay();
      if (currentOrientationMode === "grid") {
        applyOrientationBearing(true);
      }
      return;
    }

    const coordinates: [Coordinates, Coordinates, Coordinates, Coordinates] = [
      currentOverlay.corners.topLeft,
      currentOverlay.corners.topRight,
      currentOverlay.corners.bottomRight,
      currentOverlay.corners.bottomLeft,
    ];

    const source = map.getSource(OVERLAY_SOURCE_ID);
    if (isUpdateImageSource(source)) {
      source.updateImage({
        url: currentOverlay.imageDataUrl,
        coordinates,
      });
    } else {
      map.addSource(OVERLAY_SOURCE_ID, {
        type: "image",
        url: currentOverlay.imageDataUrl,
        coordinates,
      });
    }

    const beforeLayerId = firstDrawLayerId(map.getStyle().layers);

    if (!map.getLayer(OVERLAY_LAYER_ID)) {
      map.addLayer(
        {
          id: OVERLAY_LAYER_ID,
          type: "raster",
          source: OVERLAY_SOURCE_ID,
          paint: {
            "raster-opacity": currentOverlay.opacity / 100,
          },
          layout: {
            visibility: currentOverlay.visible === false ? "none" : "visible",
          },
        },
        beforeLayerId,
      );
      syncOverlayHandles();
      applyGridOverlay();
      if (currentOrientationMode === "grid") {
        applyOrientationBearing(true);
      }
      return;
    }

    map.setPaintProperty(OVERLAY_LAYER_ID, "raster-opacity", currentOverlay.opacity / 100);
    map.setLayoutProperty(
      OVERLAY_LAYER_ID,
      "visibility",
      currentOverlay.visible === false ? "none" : "visible",
    );
    if (beforeLayerId) {
      map.moveLayer(OVERLAY_LAYER_ID, beforeLayerId);
    }
    syncOverlayHandles();
    applyGridOverlay();
    if (currentOrientationMode === "grid") {
      applyOrientationBearing(true);
    }
  };

  const applyRouteOverlay = () => {
    const source = map.getSource(ROUTE_SOURCE_ID);
    if (isGeoJsonSourceWithSetData(source)) {
      source.setData(currentRouteOverlay);
    } else if (!source) {
      map.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: currentRouteOverlay,
      });
    }

    if (!map.getLayer(ROUTE_LINE_LAYER_ID)) {
      map.addLayer({
        id: ROUTE_LINE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        filter: ["==", "$type", "LineString"],
        paint: {
          "line-color": "#2563eb",
          "line-width": 8,
          "line-opacity": 1,
        },
      });
    }
    if (!map.getLayer(ROUTE_POINT_LAYER_ID)) {
      map.addLayer({
        id: ROUTE_POINT_LAYER_ID,
        type: "circle",
        source: ROUTE_SOURCE_ID,
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-color": "#2563eb",
          "circle-radius": 6,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
    }
    // Keep route overlay above draw layers so the computed path remains visible.
    map.moveLayer(ROUTE_LINE_LAYER_ID);
    map.moveLayer(ROUTE_POINT_LAYER_ID);
  };

  const applySnapMarkerOverlay = () => {
    const source = map.getSource(SNAP_MARKER_SOURCE_ID);
    if (isGeoJsonSourceWithSetData(source)) {
      source.setData(currentSnapMarkers);
    } else if (!source) {
      map.addSource(SNAP_MARKER_SOURCE_ID, {
        type: "geojson",
        data: currentSnapMarkers,
      });
    }

    if (!map.getLayer(SNAP_MARKER_LAYER_ID)) {
      map.addLayer({
        id: SNAP_MARKER_LAYER_ID,
        type: "symbol",
        source: SNAP_MARKER_SOURCE_ID,
        layout: {
          "icon-image": snapMarkerIconExpression as never,
          "icon-size": 0.8,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });
    }

    map.moveLayer(SNAP_MARKER_LAYER_ID);
  };

  const applyOpeningEndpointOverlay = () => {
    const endpointFeatures = deriveNavigationOpeningEndpointMarkers(currentFeatures.features);
    const source = map.getSource(OPENING_ENDPOINT_SOURCE_ID);
    if (isGeoJsonSourceWithSetData(source)) {
      source.setData(endpointFeatures);
    } else if (!source) {
      map.addSource(OPENING_ENDPOINT_SOURCE_ID, {
        type: "geojson",
        data: endpointFeatures,
      });
    }

    if (!map.getLayer(OPENING_ENDPOINT_LAYER_ID)) {
      map.addLayer({
        id: OPENING_ENDPOINT_LAYER_ID,
        type: "symbol",
        source: OPENING_ENDPOINT_SOURCE_ID,
        layout: {
          "icon-image": openingEndpointIconExpression as never,
          "icon-size": 0.8,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });
    }

    map.moveLayer(OPENING_ENDPOINT_LAYER_ID);
  };

  const registerPointIcons = () => {
    for (const icon of MAP_POINT_ICON_SPECS) {
      if (map.hasImage(icon.id)) {
        continue;
      }
      map.addImage(icon.id, createPointIconImage(icon), {
        pixelRatio: 2,
      });
    }
    if (!map.hasImage(SNAP_MARKER_ICON_ID)) {
      map.addImage(SNAP_MARKER_ICON_ID, createSnapMarkerImage("#ffffff", "#0f172a"), {
        pixelRatio: 2,
      });
    }
    if (!map.hasImage(SNAP_MARKER_GRAPH_READY_ICON_ID)) {
      map.addImage(SNAP_MARKER_GRAPH_READY_ICON_ID, createSnapMarkerImage("#22c55e", "#14532d"), {
        pixelRatio: 2,
      });
    }
  };

  const setSnapMarkerCandidates = (candidates: SnapMarkerCandidate[]) => {
    if (!currentSnapEnabled || candidates.length === 0) {
      currentSnapMarkers = emptyFeatureCollection();
      if (isStyleReady) {
        applySnapMarkerOverlay();
      }
      return;
    }

    const statesByCoordinate = new Map<string, SnapMarkerState>();
    const coordinatesByCoordinate = new Map<string, Coordinates>();
    for (const candidate of candidates) {
      const key = coordinateKey(candidate.coordinate);
      const existing = statesByCoordinate.get(key);
      if (existing === "graph_ready") {
        continue;
      }
      statesByCoordinate.set(
        key,
        existing === "snapped" || candidate.state === "graph_ready" ? candidate.state : "snapped",
      );
      coordinatesByCoordinate.set(key, candidate.coordinate);
    }

    const markerFeatures = [...coordinatesByCoordinate.entries()].map(([key, coordinate], index) =>
      createSnapMarkerFeature(coordinate, statesByCoordinate.get(key) ?? "snapped", index),
    );
    currentSnapMarkers = {
      type: "FeatureCollection",
      features: markerFeatures,
    };
    if (isStyleReady) {
      applySnapMarkerOverlay();
    }
  };

  const clearSnapMarkers = () => {
    currentSnapMarkers = emptyFeatureCollection();
    if (isStyleReady) {
      applySnapMarkerOverlay();
    }
  };

  const applyPendingState = () => {
    if (!isStyleReady) {
      return;
    }

    withExternalSyncGuard(() => {
      applyFeatures();
      applyOpeningEndpointOverlay();
      applyRouteOverlay();
      applySnapMarkerOverlay();
      applyInteractionMode();
      applySelection();
      applyOverlay();
    });
    emitVertexSelectionChange();
  };

  const emitFeaturesChange = () => {
    let nextFeatures = draw
      .getAll()
      .features.map((feature) => normalizeDrawFeature(feature))
      .filter((feature): feature is FloorFeature => Boolean(feature));

    if (currentLockedFeatureIds.size > 0) {
      const persistedById = new Map(
        currentFeatures.features.map((feature) => [feature.id, feature]),
      );
      const nextById = new Map(nextFeatures.map((feature) => [feature.id, feature]));
      for (const lockedFeatureId of currentLockedFeatureIds) {
        const persisted = persistedById.get(lockedFeatureId);
        if (!persisted) {
          continue;
        }
        nextById.set(lockedFeatureId, persisted);
      }
      nextFeatures = Array.from(nextById.values());
    }

    if (pendingForkState) {
      const isForkDrawInProgress = isDrawInMode(draw, "draw_line_string");
      const forkIndex = nextFeatures.findIndex(
        (feature) => feature.id === pendingForkState?.forkFeatureId,
      );
      const forkFeature = forkIndex >= 0 ? nextFeatures[forkIndex] : undefined;

      if (!isForkDrawInProgress && forkFeature?.geometry.type === "LineString") {
        const normalizedForkCoordinates = normalizeForkCoordinates(
          forkFeature.geometry.coordinates,
          pendingForkState.startCoordinate,
        );
        nextFeatures[forkIndex] = {
          ...forkFeature,
          geometry: {
            ...forkFeature.geometry,
            coordinates: normalizedForkCoordinates,
          },
        };

        const distinctCoordinateCount = new Set(
          normalizedForkCoordinates.map((coordinate) => coordinateKey(coordinate)),
        ).size;
        if (distinctCoordinateCount >= 2) {
          pendingForkState = undefined;
        } else if (!isForkDrawInProgress) {
          pendingForkState = undefined;
        }
      } else if (!isForkDrawInProgress) {
        pendingForkState = undefined;
      }
    }

    handlers.onFeaturesChange(nextFeatures);
  };

  const getFeatureIdsFromDrawEvent = (event: unknown): string[] => {
    if (!event || typeof event !== "object") {
      return [];
    }

    const candidate = event as {
      features?: unknown;
    };
    if (!Array.isArray(candidate.features)) {
      return [];
    }

    return candidate.features
      .map((feature) => {
        if (!feature || typeof feature !== "object") {
          return undefined;
        }

        const withId = feature as { id?: unknown };
        return parseFeatureId(withId.id);
      })
      .filter((featureId): featureId is string => Boolean(featureId));
  };

  const applySnappingToFeatureIds = (featureIds: string[], phase: "create" | "update"): void => {
    if (!currentSnapEnabled || featureIds.length === 0) {
      clearSnapMarkers();
      return;
    }

    if (phase === "update" && isDrawInMode(draw, "draw_line_string")) {
      return;
    }

    const zoomLevel = map.getZoom();
    const maxDistanceMeters = snapDistanceMetersForZoom(zoomLevel);
    const gridSpacingMeters = gridSpacingMetersForZoom(zoomLevel);
    const gridSnapEnabled = currentGridVisible && typeof gridSpacingMeters === "number";
    if (!Number.isFinite(maxDistanceMeters) || maxDistanceMeters <= 0) {
      return;
    }

    const center = [map.getCenter().lng, map.getCenter().lat] as Coordinates;
    const allDrawFeatures = draw.getAll().features;
    const drawFeaturesById = new Map(
      allDrawFeatures
        .map((feature) => [parseFeatureId(feature.id), feature] as const)
        .filter((entry): entry is [string, GeoJsonFeature] => Boolean(entry[0])),
    );
    const snapMarkerCandidates: SnapMarkerCandidate[] = [];
    const updatesById = new Map<string, GeoJsonFeature>();
    const getWorkingFeature = (id: string): GeoJsonFeature | undefined =>
      updatesById.get(id) ?? draw.get(id);
    const queueUpdate = (id: string, feature: GeoJsonFeature) => {
      updatesById.set(id, feature);
    };

    for (const featureId of featureIds) {
      const sourceFeature = getWorkingFeature(featureId);
      if (!sourceFeature?.geometry) {
        continue;
      }

      const targets = collectSnapTargets(allDrawFeatures, featureId);
      if (!gridSnapEnabled && targets.vertices.length === 0 && targets.edges.length === 0) {
        continue;
      }

      if (sourceFeature.geometry.type === "Point") {
        const coordinate = normalizePoint(sourceFeature.geometry.coordinates);
        if (!coordinate) {
          continue;
        }

        const candidate = findBestSnapCandidateWithGrid(
          coordinate,
          targets,
          maxDistanceMeters,
          center,
          gridSnapEnabled,
          gridRotationDegrees(),
          gridSpacingMeters ?? GRID_BASE_SPACING_METERS,
        );
        if (!candidate) {
          continue;
        }
        snapMarkerCandidates.push({
          coordinate: candidate.coordinate,
          state: snapMarkerStateForCandidate(candidate, sourceFeature, drawFeaturesById),
        });
        if (coordinateEquals(coordinate, candidate.coordinate)) {
          continue;
        }

        queueUpdate(featureId, {
          ...sourceFeature,
          geometry: {
            type: "Point",
            coordinates: candidate.coordinate,
          },
        });
        continue;
      }

      if (sourceFeature.geometry.type === "LineString") {
        const coordinates = normalizeLine(sourceFeature.geometry.coordinates);
        if (!coordinates) {
          continue;
        }

        const snapped = snapCoordinates(
          coordinates,
          targets,
          maxDistanceMeters,
          center,
          gridSnapEnabled,
          gridRotationDegrees(),
          gridSpacingMeters ?? GRID_BASE_SPACING_METERS,
        );
        for (const candidate of snapped.candidates) {
          if (!candidate) {
            continue;
          }
          snapMarkerCandidates.push({
            coordinate: candidate.coordinate,
            state: snapMarkerStateForCandidate(candidate, sourceFeature, drawFeaturesById),
          });
        }
        const nextCoordinates = [...snapped.coordinates];
        if (!snapped.changed) {
          continue;
        }

        queueUpdate(featureId, {
          ...sourceFeature,
          geometry: {
            type: "LineString",
            coordinates: nextCoordinates,
          },
        });
        continue;
      }

      if (sourceFeature.geometry.type === "Polygon") {
        const ring = normalizePolygon(sourceFeature.geometry.coordinates)?.[0];
        if (!ring) {
          continue;
        }

        const snapped = snapCoordinates(
          ring,
          targets,
          maxDistanceMeters,
          center,
          gridSnapEnabled,
          gridRotationDegrees(),
          gridSpacingMeters ?? GRID_BASE_SPACING_METERS,
        );
        for (const candidate of snapped.candidates) {
          if (!candidate) {
            continue;
          }
          snapMarkerCandidates.push({
            coordinate: candidate.coordinate,
            state: snapMarkerStateForCandidate(candidate, sourceFeature, drawFeaturesById),
          });
        }
        if (!snapped.changed) {
          continue;
        }

        queueUpdate(featureId, {
          ...sourceFeature,
          geometry: {
            type: "Polygon",
            coordinates: [snapped.coordinates],
          },
        });
      }
    }

    const updates = Array.from(updatesById.entries()).map(([featureId, feature]) => ({
      featureId,
      feature,
    }));
    setSnapMarkerCandidates(snapMarkerCandidates);

    if (updates.length === 0) {
      return;
    }

    const drawModeBefore = draw.getMode();
    const selectedFeatureIds = draw.getSelectedIds();
    withExternalSyncGuard(() => {
      for (const update of updates) {
        draw.add(update.feature);
      }

      if (drawModeBefore === "direct_select") {
        const selectedFeatureId = selectedFeatureIds[0] ?? updates[0]?.featureId;
        if (selectedFeatureId) {
          draw.changeMode("direct_select", { featureId: selectedFeatureId });
        }
      } else if (drawModeBefore === "simple_select") {
        draw.changeMode("simple_select", { featureIds: selectedFeatureIds });
      }
    });
  };

  const applyLivePointerSnapping = (): void => {
    if (!currentSnapEnabled) {
      clearSnapMarkers();
      return;
    }

    const drawMode = draw.getMode();
    if (drawMode === "direct_select") {
      const selectedVertex = getSelectedLineVertex();
      if (!selectedVertex) {
        clearSnapMarkers();
        return;
      }

      const sourceFeature = draw.get(selectedVertex.featureId);
      if (!sourceFeature) {
        clearSnapMarkers();
        return;
      }

      const allDrawFeatures = draw.getAll().features;
      const targets = collectSnapTargets(allDrawFeatures, selectedVertex.featureId);
      const zoomLevel = map.getZoom();
      const maxDistanceMeters = snapDistanceMetersForZoom(zoomLevel);
      const gridSpacingMeters = gridSpacingMetersForZoom(zoomLevel);
      const gridSnapEnabled = currentGridVisible && typeof gridSpacingMeters === "number";
      if (!gridSnapEnabled && targets.vertices.length === 0 && targets.edges.length === 0) {
        clearSnapMarkers();
        return;
      }
      if (!Number.isFinite(maxDistanceMeters) || maxDistanceMeters <= 0) {
        clearSnapMarkers();
        return;
      }

      const center = [map.getCenter().lng, map.getCenter().lat] as Coordinates;
      const candidate = findBestSnapCandidateWithGrid(
        selectedVertex.coordinate,
        targets,
        maxDistanceMeters,
        center,
        gridSnapEnabled,
        gridRotationDegrees(),
        gridSpacingMeters ?? GRID_BASE_SPACING_METERS,
      );
      if (!candidate) {
        clearSnapMarkers();
        return;
      }

      const drawFeaturesById = new Map(
        allDrawFeatures
          .map((feature) => [parseFeatureId(feature.id), feature] as const)
          .filter((entry): entry is [string, GeoJsonFeature] => Boolean(entry[0])),
      );
      setSnapMarkerCandidates([
        {
          coordinate: candidate.coordinate,
          state: snapMarkerStateForCandidate(candidate, sourceFeature, drawFeaturesById),
        },
      ]);
      return;
    }

    if (drawMode !== "draw_line_string" && drawMode !== "draw_polygon") {
      clearSnapMarkers();
      return;
    }

    const allDrawFeatures = draw.getAll().features;
    const activeFeatureIds = getActiveDrawFeatureIds(allDrawFeatures);
    if (activeFeatureIds.length === 0) {
      clearSnapMarkers();
      return;
    }

    const zoomLevel = map.getZoom();
    const maxDistanceMeters = snapDistanceMetersForZoom(zoomLevel);
    const gridSpacingMeters = gridSpacingMetersForZoom(zoomLevel);
    const gridSnapEnabled = currentGridVisible && typeof gridSpacingMeters === "number";
    if (!Number.isFinite(maxDistanceMeters) || maxDistanceMeters <= 0) {
      return;
    }

    const center = [map.getCenter().lng, map.getCenter().lat] as Coordinates;
    const updates: Array<{
      featureId: string;
      feature: GeoJsonFeature;
    }> = [];
    const drawFeaturesById = new Map(
      allDrawFeatures
        .map((feature) => [parseFeatureId(feature.id), feature] as const)
        .filter((entry): entry is [string, GeoJsonFeature] => Boolean(entry[0])),
    );
    const snapMarkerCandidates: SnapMarkerCandidate[] = [];

    for (const featureId of activeFeatureIds) {
      const sourceFeature = draw.get(featureId);
      if (!sourceFeature) {
        continue;
      }

      const pointerTarget = activeDrawPointerTargetForFeature(sourceFeature);
      if (!pointerTarget) {
        continue;
      }

      const targets = collectSnapTargets(allDrawFeatures, featureId);
      if (!gridSnapEnabled && targets.vertices.length === 0 && targets.edges.length === 0) {
        continue;
      }

      if (pointerTarget.geometryType === "LineString") {
        const activeCoordinate = pointerTarget.coordinates[pointerTarget.activeCoordinateIndex];
        if (!activeCoordinate) {
          continue;
        }

        const candidate = findBestSnapCandidateWithGrid(
          activeCoordinate,
          targets,
          maxDistanceMeters,
          center,
          gridSnapEnabled,
          gridRotationDegrees(),
          gridSpacingMeters ?? GRID_BASE_SPACING_METERS,
        );
        if (!candidate) {
          continue;
        }
        snapMarkerCandidates.push({
          coordinate: candidate.coordinate,
          state: snapMarkerStateForCandidate(candidate, sourceFeature, drawFeaturesById),
        });
        if (coordinateEquals(activeCoordinate, candidate.coordinate)) {
          continue;
        }

        const nextCoordinates = [...pointerTarget.coordinates];
        nextCoordinates[pointerTarget.activeCoordinateIndex] = candidate.coordinate;
        updates.push({
          featureId,
          feature: {
            ...sourceFeature,
            geometry: {
              type: "LineString",
              coordinates: nextCoordinates,
            },
          },
        });
        continue;
      }

      const activeCoordinate = pointerTarget.ring[pointerTarget.activeCoordinateIndex];
      if (!activeCoordinate) {
        continue;
      }

      const candidate = findBestSnapCandidateWithGrid(
        activeCoordinate,
        targets,
        maxDistanceMeters,
        center,
        gridSnapEnabled,
        gridRotationDegrees(),
        gridSpacingMeters ?? GRID_BASE_SPACING_METERS,
      );
      if (!candidate) {
        continue;
      }
      snapMarkerCandidates.push({
        coordinate: candidate.coordinate,
        state: snapMarkerStateForCandidate(candidate, sourceFeature, drawFeaturesById),
      });
      if (coordinateEquals(activeCoordinate, candidate.coordinate)) {
        continue;
      }

      const nextRing = [...pointerTarget.ring];
      nextRing[pointerTarget.activeCoordinateIndex] = candidate.coordinate;
      const lastIndex = nextRing.length - 1;
      const firstCoordinate = nextRing[0];
      const lastCoordinate = nextRing[lastIndex];
      if (firstCoordinate && lastCoordinate && coordinateEquals(lastCoordinate, firstCoordinate)) {
        nextRing[lastIndex] = firstCoordinate;
      }

      updates.push({
        featureId,
        feature: {
          ...sourceFeature,
          geometry: {
            type: "Polygon",
            coordinates: [nextRing],
          },
        },
      });
    }
    setSnapMarkerCandidates(snapMarkerCandidates);

    if (updates.length === 0) {
      return;
    }

    withExternalSyncGuard(() => {
      for (const update of updates) {
        draw.add(update.feature);
      }
    });
  };

  map.on("load", () => {
    registerPointIcons();
    map.addControl(draw as never, "top-left");
    if ("ScaleControl" in maplibre) {
      const scaleControl = new maplibre.ScaleControl({
        maxWidth: 120,
        unit: "metric",
      });
      map.addControl(scaleControl as never, "bottom-right");
    }
    isStyleReady = true;
    applyPendingState();

    handlers.onViewStateChange(
      [map.getCenter().lng, map.getCenter().lat],
      Number(map.getZoom().toFixed(2)),
    );
    applyOrientationBearing(true);
  });

  map.on("moveend", () => {
    if (isStyleReady) {
      applyGridOverlay();
    }
    handlers.onViewStateChange(
      [map.getCenter().lng, map.getCenter().lat],
      Number(map.getZoom().toFixed(2)),
    );
  });

  map.on("draw.create" as never, (event: unknown) => {
    if (isSyncingExternalState) {
      return;
    }

    applySnappingToFeatureIds(getFeatureIdsFromDrawEvent(event), "create");
    emitFeaturesChange();
    emitVertexSelectionChange();
  });

  map.on("draw.update" as never, (event: unknown) => {
    if (isSyncingExternalState) {
      return;
    }

    const featureIdsFromEvent = getFeatureIdsFromDrawEvent(event);
    if (featureIdsFromEvent.length > 0) {
      applySnappingToFeatureIds(featureIdsFromEvent, "update");
    } else {
      const activeDrawFeatureIds = getActiveDrawFeatureIds(draw.getAll().features);
      if (activeDrawFeatureIds.length > 0) {
        applySnappingToFeatureIds(activeDrawFeatureIds, "update");
      } else {
        applySnappingToFeatureIds(draw.getSelectedIds(), "update");
      }
    }
    emitFeaturesChange();
    emitVertexSelectionChange();
  });

  map.on("draw.delete" as never, () => {
    if (isSyncingExternalState) {
      return;
    }

    clearSnapMarkers();
    emitFeaturesChange();
    emitVertexSelectionChange();
  });

  map.on("draw.selectionchange" as never, (event: { features?: GeoJsonFeature[] }) => {
    if (isSyncingExternalState) {
      return;
    }

    const selectedFeatureId = parseFeatureId(event.features?.[0]?.id);
    if (selectedFeatureId && currentLockedFeatureIds.has(selectedFeatureId)) {
      withExternalSyncGuard(() => {
        draw.changeMode("simple_select", {
          featureIds: [],
        });
      });
      currentSelectedFeatureId = undefined;
      handlers.onFeatureSelectionChange(undefined);
      emitVertexSelectionChange();
      return;
    }

    if (
      lastSelectedLineVertex &&
      selectedFeatureId &&
      selectedFeatureId !== lastSelectedLineVertex.featureId
    ) {
      lastSelectedLineVertex = undefined;
    }
    handlers.onFeatureSelectionChange(selectedFeatureId);
    emitVertexSelectionChange();
  });

  map.on("draw.modechange" as never, (event: { mode?: string }) => {
    const nextMode = toInteractionMode(event.mode ?? "simple_select");

    if (nextMode === "select") {
      map.dragPan.enable();
    } else {
      map.dragPan.disable();
    }

    if (isSyncingExternalState) {
      emitVertexSelectionChange();
      return;
    }

    currentInteractionMode = nextMode;
    if (nextMode !== "select") {
      lastSelectedLineVertex = undefined;
    }
    handlers.onInteractionModeChange(nextMode);
    emitVertexSelectionChange();
  });

  map.on("click", (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }

    if (currentRoutePickEnabled) {
      handlers.onMapClick?.([event.lngLat.lng, event.lngLat.lat]);
      return;
    }

    const renderedHits = map.queryRenderedFeatures(event.point) as RenderedFeatureHit[];

    if (hasVertexOrMidpointHit(renderedHits)) {
      emitVertexSelectionChange();
      return;
    }

    const featureId = getRenderableFeatureIdAtPoint(renderedHits);
    if (!featureId) {
      return;
    }
    if (currentLockedFeatureIds.has(featureId)) {
      return;
    }

    if (currentInteractionMode !== "select") {
      return;
    }

    const clickedFeature = draw.get(featureId);
    if (!clickedFeature || clickedFeature.geometry.type === "Point") {
      return;
    }

    withExternalSyncGuard(() => {
      currentSelectedFeatureId = featureId;
      draw.changeMode("direct_select", {
        featureId,
      });
    });

    handlers.onFeatureSelectionChange(featureId);
    handlers.onVertexSelectionChange?.(hasSelectedVertex());
  });

  map.on("mousemove", (event) => {
    if (overlayDragState && currentOverlay && canDragOverlay()) {
      const pointer = getEventLngLat(event);
      const point = getEventPoint(event);
      if (!pointer || !point) {
        return;
      }

      const deltaLng = pointer[0] - overlayDragState.startLngLat[0];
      const deltaLat = pointer[1] - overlayDragState.startLngLat[1];
      const pixelDistance = Math.hypot(
        point.x - overlayDragState.startPoint.x,
        point.y - overlayDragState.startPoint.y,
      );
      if (pixelDistance > 1) {
        overlayDragState.hasMoved = true;
      }

      const nextCorners = shiftOverlayCorners(overlayDragState.startCorners, deltaLng, deltaLat);
      scheduleOverlayCornersUpdate(nextCorners);
      map.getCanvas().style.cursor = "grabbing";
      return;
    }

    applyLivePointerSnapping();

    const hovered = map.queryRenderedFeatures(event.point) as RenderedFeatureHit[];
    if (canDragOverlay() && hasOverlayLayerHit(hovered)) {
      map.getCanvas().style.cursor = "grab";
      return;
    }

    const cursor = hovered
      .map((hit) => toHoverCursor(hit.properties?.meta, currentInteractionMode))
      .find((value) => typeof value === "string");
    map.getCanvas().style.cursor = cursor ?? "";
  });

  map.on("mousedown", (event) => {
    if (!canDragOverlay() || overlayDragState) {
      return;
    }

    const point = getEventPoint(event);
    const lngLat = getEventLngLat(event);
    if (!point || !lngLat) {
      return;
    }

    const hits = map.queryRenderedFeatures([point.x, point.y]) as RenderedFeatureHit[];
    if (!hasOverlayLayerHit(hits) || !currentOverlay) {
      return;
    }

    overlayDragState = {
      startLngLat: lngLat,
      startPoint: point,
      startCorners: structuredClone(currentOverlay.corners),
      hasMoved: false,
    };
    startOverlayInteraction();
    map.dragPan.disable();
    map.getCanvas().style.cursor = "grabbing";
  });

  map.on("mouseup", () => {
    if (!overlayDragState) {
      return;
    }

    flushOverlayCornersUpdate();
    suppressNextClick = overlayDragState.hasMoved;
    overlayDragState = undefined;
    endOverlayInteraction();
    if (currentInteractionMode === "select") {
      map.dragPan.enable();
    }
  });

  map.on("mouseout", () => {
    if (!overlayDragState) {
      map.getCanvas().style.cursor = "";
      return;
    }

    map.getCanvas().style.cursor = "";
  });

  return {
    setFeatures: (features) => {
      currentFeatures = {
        type: "FeatureCollection",
        features: features.features.map((feature) => structuredClone(feature)),
      };
      applyPendingState();
    },
    setLockedFeatureIds: (featureIds) => {
      currentLockedFeatureIds = new Set(featureIds);
      if (currentSelectedFeatureId && currentLockedFeatureIds.has(currentSelectedFeatureId)) {
        currentSelectedFeatureId = undefined;
      }
      applyPendingState();
    },
    setRouteOverlay: (features) => {
      currentRouteOverlay = {
        type: "FeatureCollection",
        features: features.features.map((feature) => structuredClone(feature)),
      };
      applyPendingState();
    },
    setSelection: (feature) => {
      currentSelectedFeatureId = feature?.id;
      applyPendingState();
    },
    setOverlay: (overlay) => {
      cancelOverlayCornersUpdate();
      if (!overlay) {
        endOverlayInteraction();
      }
      currentOverlay = overlay;
      applyPendingState();
    },
    setInteractionMode: (mode) => {
      currentInteractionMode = mode;
      applyPendingState();
    },
    setRoutePickEnabled: (enabled) => {
      currentRoutePickEnabled = enabled;
    },
    setSnapEnabled: (enabled) => {
      currentSnapEnabled = enabled;
      if (!enabled) {
        clearSnapMarkers();
      }
    },
    setGridVisible: (visible) => {
      currentGridVisible = visible;
      if (isStyleReady) {
        applyGridOverlay();
      }
    },
    setOrientationMode: (mode) => {
      currentOrientationMode = mode;
      applyOrientationBearing(true);
    },
    setView: (center, zoom) => {
      map.flyTo({
        center,
        ...(typeof zoom === "number" ? { zoom } : {}),
        speed: 1,
        curve: 1.5,
        essential: true,
      });
    },
    deleteSelection: () => {
      if (!isStyleReady) {
        return;
      }

      const selectedIds = draw.getSelectedIds();
      if (selectedIds.length === 0) {
        draw.trash();
        return;
      }
      const deletableFeatureIds = selectedIds.filter((id) => !currentLockedFeatureIds.has(id));
      if (deletableFeatureIds.length === 0) {
        return;
      }
      withExternalSyncGuard(() => {
        draw.changeMode("simple_select", {
          featureIds: deletableFeatureIds,
        });
      });
      draw.trash();
    },
    deleteVertex: () => {
      if (!isStyleReady) {
        return;
      }

      if (!hasSelectedVertex()) {
        return;
      }

      draw.trash();
    },
    splitPathSegment: () => {
      if (!isStyleReady) {
        return;
      }

      const selectedVertex =
        getSelectedLineVertex() ?? (!hasSelectedVertex() ? lastSelectedLineVertex : undefined);
      if (!selectedVertex) {
        return;
      }

      const sourceFeature = draw.get(selectedVertex.featureId);
      if (!sourceFeature || sourceFeature.geometry.type !== "LineString") {
        return;
      }
      if (!canSplitOrForkLineFeature(sourceFeature)) {
        return;
      }

      const coordinates = sourceFeature.geometry.coordinates
        .map((coordinate) => normalizePoint(coordinate))
        .filter((coordinate): coordinate is Coordinates => Boolean(coordinate));
      if (coordinates.length < 2) {
        return;
      }

      let startIndex = selectedVertex.vertexIndex;
      let endIndex = selectedVertex.vertexIndex + 1;
      if (endIndex >= coordinates.length) {
        startIndex = selectedVertex.vertexIndex - 1;
        endIndex = selectedVertex.vertexIndex;
      }

      if (startIndex < 0 || endIndex >= coordinates.length) {
        return;
      }

      const startCoordinate = coordinates[startIndex];
      const endCoordinate = coordinates[endIndex];
      if (!startCoordinate || !endCoordinate) {
        return;
      }

      const nextCoordinates = [...coordinates];
      const insertIndex = endIndex;
      nextCoordinates.splice(insertIndex, 0, midpointBetween(startCoordinate, endCoordinate));

      withExternalSyncGuard(() => {
        draw.delete(selectedVertex.featureId);
        draw.add({
          ...sourceFeature,
          id: selectedVertex.featureId,
          geometry: {
            type: "LineString",
            coordinates: nextCoordinates,
          },
        } as GeoJsonFeature);
        draw.changeMode("direct_select", {
          featureId: selectedVertex.featureId,
          coordPath: String(insertIndex),
        } as never);
      });

      currentSelectedFeatureId = selectedVertex.featureId;
      lastSelectedLineVertex = {
        ...selectedVertex,
        vertexIndex: insertIndex,
      };
      emitFeaturesChange();
      handlers.onFeatureSelectionChange(selectedVertex.featureId);
      emitVertexSelectionChange();
    },
    forkPathAtNode: () => {
      if (!isStyleReady) {
        return;
      }

      const selectedVertex =
        getSelectedLineVertex() ?? (!hasSelectedVertex() ? lastSelectedLineVertex : undefined);
      if (!selectedVertex) {
        return;
      }

      const sourceFeature = draw.get(selectedVertex.featureId);
      if (!sourceFeature || sourceFeature.geometry.type !== "LineString") {
        return;
      }
      if (!canSplitOrForkLineFeature(sourceFeature)) {
        return;
      }

      const sourceProperties =
        sourceFeature?.properties && typeof sourceFeature.properties === "object"
          ? structuredClone(sourceFeature.properties)
          : {};
      const forkFeatureId = createId();
      const seedFeature: GeoJsonFeature = {
        type: "Feature",
        id: forkFeatureId,
        geometry: {
          type: "LineString",
          coordinates: [selectedVertex.coordinate, selectedVertex.coordinate],
        },
        properties: sourceProperties as Record<string, unknown>,
      };

      withExternalSyncGuard(() => {
        currentInteractionMode = "line";
        currentSelectedFeatureId = undefined;
        pendingForkState = {
          sourceFeatureId: selectedVertex.featureId,
          forkFeatureId,
          startCoordinate: selectedVertex.coordinate,
        };
        lastSelectedLineVertex = undefined;
        draw.add(seedFeature);
        draw.changeMode(
          "draw_line_string" as never,
          {
            featureId: forkFeatureId,
            from: selectedVertex.coordinate,
          } as never,
        );
      });

      handlers.onInteractionModeChange("line");
      handlers.onFeatureSelectionChange(undefined);
      handlers.onVertexSelectionChange?.(false);
    },
    resize: () => map.resize(),
    destroy: () => {
      cancelOverlayCornersUpdate();
      endOverlayInteraction();
      removeOverlayHandles();
      map.remove();
    },
  };
};
