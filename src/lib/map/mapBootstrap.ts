import MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { Feature as GeoJsonFeature, Geometry as GeoJsonGeometry } from "geojson";
import { transformOverlayFromDraggedCorner } from "../geometry/overlayCornerHandles";
import { createId } from "../id";
import type { Coordinates, FeatureCollection, FloorFeature, FloorOverlay } from "../types";

type MapLibreModule = typeof import("maplibre-gl");

export type DrawMode = "select" | "point" | "line" | "polygon";

type FeaturesChangeHandler = (features: FloorFeature[]) => void;
type FeatureSelectionChangeHandler = (featureId: string | undefined) => void;
type ViewStateHandler = (center: Coordinates, zoom: number) => void;
type InteractionModeChangeHandler = (mode: DrawMode) => void;
type OverlayCornersChangeHandler = (corners: FloorOverlay["corners"]) => void;
type VertexSelectionChangeHandler = (hasSelectedVertex: boolean) => void;

type MapController = {
  setFeatures: (features: FeatureCollection) => void;
  setSelection: (feature: FloorFeature | undefined) => void;
  setOverlay: (overlay: FloorOverlay | undefined) => void;
  setInteractionMode: (mode: DrawMode) => void;
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

const OVERLAY_SOURCE_ID = "floor-overlay";
const OVERLAY_LAYER_ID = "floor-overlay-layer";
const OVERLAY_HANDLE_SIZE = 12;
const OVERLAY_CENTER_HANDLE_SIZE = 16;
const OVERLAY_HANDLE_COLOR = "#f97316";
const OVERLAY_CENTER_HANDLE_COLOR = "#0ea5e9";
const OVERLAY_HANDLE_STROKE_COLOR = "#ffffff";
const OVERLAY_HANDLE_KEYS = ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const;
type OverlayCornerKey = (typeof OVERLAY_HANDLE_KEYS)[number];
const featureTypeExpression: unknown[] = ["coalesce", ["get", "imdfType"], ["get", "kind"], ""];

const drawLineColor = "#dc2626";

const drawPolygonFillColorExpression: unknown[] = [
  "case",
  ["==", featureTypeExpression, "level"],
  "#ffffff",
  ["any", ["==", featureTypeExpression, "unit"], ["==", featureTypeExpression, "room"]],
  "#e5e7eb",
  ["==", featureTypeExpression, "zone"],
  "#2563eb",
  "#9ca3af",
];

const drawPolygonFillOpacityExpression: unknown[] = [
  "case",
  ["==", featureTypeExpression, "zone"],
  0.4,
  ["==", featureTypeExpression, "level"],
  1,
  ["any", ["==", featureTypeExpression, "unit"], ["==", featureTypeExpression, "room"]],
  1,
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
      "line-color": drawLineColor,
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
      "line-color": drawLineColor,
      "line-width": 4,
    },
  },
  {
    id: "gl-draw-point-inactive",
    type: "circle",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ["!=", "meta", "midpoint"],
      ["==", "active", "false"],
      ["!=", "mode", "static"],
    ],
    paint: {
      "circle-radius": 5,
      "circle-color": "#111827",
    },
  },
  {
    id: "gl-draw-point-active",
    type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["!=", "meta", "midpoint"], ["==", "active", "true"]],
    paint: {
      "circle-radius": 6,
      "circle-color": "#111827",
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

const withConnectsTo = (
  properties: FloorFeature["properties"],
  targetId: string,
): FloorFeature["properties"] => {
  const propertyBag = properties as FloorFeature["properties"] & { connects_to?: unknown };
  const currentValue = propertyBag.connects_to;
  const normalized = Array.isArray(currentValue)
    ? currentValue
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .map((value) => value)
    : typeof currentValue === "string" && currentValue.length > 0
      ? [currentValue]
      : [];
  if (!normalized.includes(targetId)) {
    normalized.push(targetId);
  }

  return {
    ...properties,
    connects_to: normalized,
  };
};

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
    return {
      kind: "unknown",
    };
  }

  const candidate = value as { kind?: unknown } & Record<string, unknown>;
  return {
    ...candidate,
    kind: typeof candidate.kind === "string" && candidate.kind ? candidate.kind : "unknown",
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

  return {
    type: "Feature",
    id,
    geometry,
    properties: normalizeProperties(feature.properties),
  };
};

const toDrawFeature = (feature: FloorFeature): GeoJsonFeature => ({
  type: "Feature",
  id: feature.id,
  geometry: structuredClone(feature.geometry),
  properties: structuredClone(feature.properties),
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

const createOverlayHandleElement = (kind: "corner" | "center"): HTMLDivElement => {
  const element = document.createElement("div");
  const size = kind === "center" ? OVERLAY_CENTER_HANDLE_SIZE : OVERLAY_HANDLE_SIZE;
  const backgroundColor = kind === "center" ? OVERLAY_CENTER_HANDLE_COLOR : OVERLAY_HANDLE_COLOR;
  element.style.width = `${size}px`;
  element.style.height = `${size}px`;
  element.style.borderRadius = "9999px";
  element.style.backgroundColor = backgroundColor;
  element.style.border = `2px solid ${OVERLAY_HANDLE_STROKE_COLOR}`;
  element.style.boxShadow = "0 0 0 1px rgba(0, 0, 0, 0.2)";
  element.style.cursor = kind === "center" ? "move" : "grab";
  return element;
};

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
    onVertexSelectionChange?: VertexSelectionChangeHandler;
  },
  initialView?: {
    center: Coordinates;
    zoom: number;
  },
): Promise<MapController> => {
  const maplibre = (await import("maplibre-gl")) as MapLibreModule;
  configureDrawClassesForMapLibre(MapboxDraw);

  const map = new maplibre.Map({
    container,
    style: `https://api.maptiler.com/maps/${mapStyleId}/style.json?key=${maptilerApiKey}`,
    center: initialView?.center ?? [5.1214, 52.0907],
    zoom: initialView?.zoom ?? 17,
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
  let currentOverlay: FloorOverlay | undefined;
  let currentInteractionMode: DrawMode = "select";
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
  let overlayCenterDragStart:
    | {
        startCenter: Coordinates;
        startCorners: FloorOverlay["corners"];
      }
    | undefined;

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

    if (currentSelectedFeatureId && draw.get(currentSelectedFeatureId)) {
      if (isDrawInMode(draw, "direct_select")) {
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
    if (isDrawInMode(draw, "draw_line_string")) {
      // Keep in-progress line edits (including fork branches) under Draw's control until drawing ends.
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
    overlayCenterDragStart = undefined;
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
        element: createOverlayHandleElement("corner"),
        draggable: true,
      })
        .setLngLat(lngLat)
        .addTo(map);

      marker.on("dragstart", () => {
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
        currentOverlay = {
          ...currentOverlay,
          corners: nextCorners,
          updatedAt: new Date().toISOString(),
        };
        applyOverlay();
        syncOverlayHandles();
        handlers.onOverlayCornersChange(nextCorners);
      });

      marker.on("dragend", () => {
        if (currentInteractionMode === "select") {
          map.dragPan.enable();
        }
      });

      overlayHandleMarkers[key] = marker;
    }

    const center = overlayCenter(currentOverlay.corners);
    if (overlayCenterMarker) {
      overlayCenterMarker.setLngLat(center);
      return;
    }

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
      currentOverlay = {
        ...currentOverlay,
        corners: nextCorners,
        updatedAt: new Date().toISOString(),
      };
      applyOverlay();
      syncOverlayHandles();
      handlers.onOverlayCornersChange(nextCorners);
    });

    overlayCenterMarker.on("dragend", () => {
      overlayCenterDragStart = undefined;
      if (currentInteractionMode === "select") {
        map.dragPan.enable();
      }
    });
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
  };

  const applyPendingState = () => {
    if (!isStyleReady) {
      return;
    }

    withExternalSyncGuard(() => {
      applyFeatures();
      applyInteractionMode();
      applySelection();
      applyOverlay();
    });
    emitVertexSelectionChange();
  };

  const emitFeaturesChange = () => {
    const nextFeatures = draw
      .getAll()
      .features.map((feature) => normalizeDrawFeature(feature))
      .filter((feature): feature is FloorFeature => Boolean(feature));

    if (pendingForkState) {
      const isForkDrawInProgress = isDrawInMode(draw, "draw_line_string");
      const forkIndex = nextFeatures.findIndex(
        (feature) => feature.id === pendingForkState?.forkFeatureId,
      );
      const sourceIndex = nextFeatures.findIndex(
        (feature) => feature.id === pendingForkState?.sourceFeatureId,
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
          const normalizedForkFeature = nextFeatures[forkIndex];
          if (!normalizedForkFeature) {
            pendingForkState = undefined;
          } else {
            nextFeatures[forkIndex] = {
              ...normalizedForkFeature,
              properties: withConnectsTo(
                normalizedForkFeature.properties,
                pendingForkState.sourceFeatureId,
              ),
            };
            if (sourceIndex >= 0) {
              const sourceFeature = nextFeatures[sourceIndex];
              if (sourceFeature) {
                nextFeatures[sourceIndex] = {
                  ...sourceFeature,
                  properties: withConnectsTo(
                    sourceFeature.properties,
                    pendingForkState.forkFeatureId,
                  ),
                };
              }
            }
          }
          pendingForkState = undefined;
        }
      } else if (!isForkDrawInProgress) {
        pendingForkState = undefined;
      }
    }

    handlers.onFeaturesChange(nextFeatures);
  };

  map.on("load", () => {
    map.addControl(draw as never, "top-left");
    isStyleReady = true;
    applyPendingState();

    handlers.onViewStateChange(
      [map.getCenter().lng, map.getCenter().lat],
      Number(map.getZoom().toFixed(2)),
    );
  });

  map.on("moveend", () => {
    handlers.onViewStateChange(
      [map.getCenter().lng, map.getCenter().lat],
      Number(map.getZoom().toFixed(2)),
    );
  });

  map.on("draw.create" as never, () => {
    if (isSyncingExternalState) {
      return;
    }

    emitFeaturesChange();
    emitVertexSelectionChange();
  });

  map.on("draw.update" as never, () => {
    if (isSyncingExternalState) {
      return;
    }

    emitFeaturesChange();
    emitVertexSelectionChange();
  });

  map.on("draw.delete" as never, () => {
    if (isSyncingExternalState) {
      return;
    }

    emitFeaturesChange();
    emitVertexSelectionChange();
  });

  map.on("draw.selectionchange" as never, (event: { features?: GeoJsonFeature[] }) => {
    if (isSyncingExternalState) {
      return;
    }

    const selectedFeatureId = parseFeatureId(event.features?.[0]?.id);
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

    const renderedHits = map.queryRenderedFeatures(event.point) as RenderedFeatureHit[];

    if (hasVertexOrMidpointHit(renderedHits)) {
      emitVertexSelectionChange();
      return;
    }

    const featureId = getRenderableFeatureIdAtPoint(renderedHits);
    if (!featureId) {
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
      currentOverlay = {
        ...currentOverlay,
        corners: nextCorners,
        updatedAt: new Date().toISOString(),
      };
      applyOverlay();
      syncOverlayHandles();
      handlers.onOverlayCornersChange(nextCorners);
      map.getCanvas().style.cursor = "grabbing";
      return;
    }

    const hovered = map.queryRenderedFeatures(event.point) as RenderedFeatureHit[];
    if (canDragOverlay() && isOverlayLayerHit(hovered[0])) {
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
    if (!isOverlayLayerHit(hits[0]) || !currentOverlay) {
      return;
    }

    overlayDragState = {
      startLngLat: lngLat,
      startPoint: point,
      startCorners: structuredClone(currentOverlay.corners),
      hasMoved: false,
    };
    map.dragPan.disable();
    map.getCanvas().style.cursor = "grabbing";
  });

  map.on("mouseup", () => {
    if (!overlayDragState) {
      return;
    }

    suppressNextClick = overlayDragState.hasMoved;
    overlayDragState = undefined;
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
    setSelection: (feature) => {
      currentSelectedFeatureId = feature?.id;
      applyPendingState();
    },
    setOverlay: (overlay) => {
      currentOverlay = overlay;
      applyPendingState();
    },
    setInteractionMode: (mode) => {
      currentInteractionMode = mode;
      applyPendingState();
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
      removeOverlayHandles();
      map.remove();
    },
  };
};
