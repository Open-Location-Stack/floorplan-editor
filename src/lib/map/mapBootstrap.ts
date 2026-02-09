import MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { Feature as GeoJsonFeature, Geometry as GeoJsonGeometry } from "geojson";
import { transformOverlayFromDraggedCorner } from "../geometry/overlayCornerHandles";
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
  deleteSelection: () => void;
  deleteVertex: () => void;
  resize: () => void;
  destroy: () => void;
};

const OVERLAY_SOURCE_ID = "floor-overlay";
const OVERLAY_LAYER_ID = "floor-overlay-layer";
const OVERLAY_HANDLE_SIZE = 12;
const OVERLAY_HANDLE_COLOR = "#f97316";
const OVERLAY_HANDLE_STROKE_COLOR = "#ffffff";
const OVERLAY_HANDLE_KEYS = ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const;
type OverlayCornerKey = (typeof OVERLAY_HANDLE_KEYS)[number];

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

const toHoverCursor = (meta: unknown, mode: DrawMode): string | undefined => {
  if (meta === "vertex" || meta === "midpoint") {
    return "pointer";
  }

  if (meta === "feature") {
    return mode === "select" ? "grab" : "pointer";
  }

  return undefined;
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

const createOverlayHandleElement = (): HTMLDivElement => {
  const element = document.createElement("div");
  element.style.width = `${OVERLAY_HANDLE_SIZE}px`;
  element.style.height = `${OVERLAY_HANDLE_SIZE}px`;
  element.style.borderRadius = "9999px";
  element.style.backgroundColor = OVERLAY_HANDLE_COLOR;
  element.style.border = `2px solid ${OVERLAY_HANDLE_STROKE_COLOR}`;
  element.style.boxShadow = "0 0 0 1px rgba(0, 0, 0, 0.2)";
  element.style.cursor = "grab";
  return element;
};

export const createMapController = async (
  container: HTMLElement,
  maptilerApiKey: string,
  handlers: {
    onFeaturesChange: FeaturesChangeHandler;
    onFeatureSelectionChange: FeatureSelectionChangeHandler;
    onViewStateChange: ViewStateHandler;
    onInteractionModeChange: InteractionModeChangeHandler;
    onOverlayCornersChange: OverlayCornersChangeHandler;
    onVertexSelectionChange?: VertexSelectionChangeHandler;
  },
): Promise<MapController> => {
  const maplibre = (await import("maplibre-gl")) as MapLibreModule;
  configureDrawClassesForMapLibre(MapboxDraw);

  const map = new maplibre.Map({
    container,
    style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerApiKey}`,
    center: [5.1214, 52.0907],
    zoom: 17,
  });

  const draw = new MapboxDraw({
    displayControlsDefault: false,
    defaultMode: "simple_select",
    userProperties: true,
  });

  let isStyleReady = false;
  let isSyncingExternalState = false;
  let currentFeatures: FeatureCollection = emptyFeatureCollection();
  let currentOverlay: FloorOverlay | undefined;
  let currentInteractionMode: DrawMode = "select";
  let currentSelectedFeatureId: string | undefined;
  type DrawWithSelectedPoints = {
    getSelectedPoints?: () => {
      features?: unknown[];
    };
  };
  type MarkerInstance = InstanceType<MapLibreModule["Marker"]>;
  const overlayHandleMarkers: Partial<Record<OverlayCornerKey, MarkerInstance>> = {};

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

  const emitVertexSelectionChange = () => {
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
      draw.changeMode("draw_point");
    } else if (currentInteractionMode === "line") {
      draw.changeMode("draw_line_string");
    } else if (currentInteractionMode === "polygon") {
      draw.changeMode("draw_polygon");
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

  const applyFeatures = () => {
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
        element: createOverlayHandleElement(),
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
    handlers.onInteractionModeChange(nextMode);
    emitVertexSelectionChange();
  });

  map.on("click", (event) => {
    const featureId = getRenderableFeatureIdAtPoint(
      map.queryRenderedFeatures(event.point) as RenderedFeatureHit[],
    );
    if (!featureId) {
      return;
    }

    if (currentInteractionMode === "select") {
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
      return;
    }

    const isPersistedFeature = currentFeatures.features.some((feature) => feature.id === featureId);
    if (!isPersistedFeature) {
      return;
    }

    withExternalSyncGuard(() => {
      currentInteractionMode = "select";
      currentSelectedFeatureId = featureId;
      applyInteractionMode();
      applySelection();
    });

    handlers.onInteractionModeChange("select");
    handlers.onFeatureSelectionChange(featureId);
    handlers.onVertexSelectionChange?.(false);
  });

  map.on("mousemove", (event) => {
    const hovered = map.queryRenderedFeatures(event.point) as RenderedFeatureHit[];
    const cursor = hovered
      .map((hit) => toHoverCursor(hit.properties?.meta, currentInteractionMode))
      .find((value) => typeof value === "string");
    map.getCanvas().style.cursor = cursor ?? "";
  });

  map.on("mouseout", () => {
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
    resize: () => map.resize(),
    destroy: () => {
      removeOverlayHandles();
      map.remove();
    },
  };
};
