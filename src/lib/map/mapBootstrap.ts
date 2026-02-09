import type {
  Coordinates,
  FeatureCollection,
  FloorFeature,
  FloorOverlay,
  GeometryType,
} from "../types";

type MapLibreModule = typeof import("maplibre-gl");

export type MapClickPayload = {
  coordinates: Coordinates;
  featureId: string | undefined;
  vertexFeatureId: string | undefined;
  vertexIndex: number | undefined;
  midpointFeatureId: string | undefined;
  midpointAfterIndex: number | undefined;
};

export type GeometryDragPayload = {
  coordinates: Coordinates;
  featureId: string;
  mode: "vertex" | "feature";
  vertexIndex?: number;
  startCoordinates: Coordinates;
};

type MapClickHandler = (payload: MapClickPayload) => void;
type ViewStateHandler = (center: Coordinates, zoom: number) => void;
type GeometryDragHandler = (payload: GeometryDragPayload) => void;

type MapController = {
  setFeatures: (features: FeatureCollection) => void;
  setSelection: (feature: FloorFeature | undefined) => void;
  setEditableVertices: (
    featureId: string | undefined,
    geometryType: GeometryType | undefined,
    vertices: Coordinates[],
    selectedVertexIndex: number | undefined,
  ) => void;
  setOverlay: (overlay: FloorOverlay | undefined) => void;
  setDrawDraft: (mode: "select" | "point" | "line" | "polygon", vertices: Coordinates[]) => void;
  setInteractionMode: (mode: "select" | "point" | "line" | "polygon") => void;
  resize: () => void;
  destroy: () => void;
};

const FEATURE_SOURCE_ID = "editor-features";
const FEATURE_FILL_LAYER_ID = "editor-features-fill";
const FEATURE_LINE_LAYER_ID = "editor-features-line";
const FEATURE_POINT_LAYER_ID = "editor-features-point";

const SELECTED_SOURCE_ID = "editor-selected";
const SELECTED_FILL_LAYER_ID = "editor-selected-fill";
const SELECTED_LINE_LAYER_ID = "editor-selected-line";
const SELECTED_POINT_LAYER_ID = "editor-selected-point";

const EDIT_VERTICES_SOURCE_ID = "editor-edit-vertices";
const EDIT_VERTICES_LAYER_ID = "editor-edit-vertices-layer";
const EDIT_MIDPOINTS_SOURCE_ID = "editor-edit-midpoints";
const EDIT_MIDPOINTS_LAYER_ID = "editor-edit-midpoints-layer";
const EDIT_VERTEX_SELECTED_SOURCE_ID = "editor-selected-vertex";
const EDIT_VERTEX_SELECTED_LAYER_ID = "editor-selected-vertex-layer";

const DRAFT_SOURCE_ID = "editor-draft";
const DRAFT_FILL_LAYER_ID = "editor-draft-fill";
const DRAFT_LINE_LAYER_ID = "editor-draft-line";
const DRAFT_POINT_LAYER_ID = "editor-draft-point";

const OVERLAY_SOURCE_ID = "floor-overlay";
const OVERLAY_LAYER_ID = "floor-overlay-layer";

const INTERACTIVE_CLICK_LAYERS = [
  EDIT_VERTEX_SELECTED_LAYER_ID,
  EDIT_VERTICES_LAYER_ID,
  EDIT_MIDPOINTS_LAYER_ID,
  FEATURE_FILL_LAYER_ID,
  FEATURE_LINE_LAYER_ID,
  FEATURE_POINT_LAYER_ID,
  SELECTED_FILL_LAYER_ID,
  SELECTED_LINE_LAYER_ID,
  SELECTED_POINT_LAYER_ID,
];

const INTERACTIVE_DRAG_LAYERS = [
  EDIT_VERTEX_SELECTED_LAYER_ID,
  EDIT_VERTICES_LAYER_ID,
  SELECTED_FILL_LAYER_ID,
  SELECTED_LINE_LAYER_ID,
  SELECTED_POINT_LAYER_ID,
];

const emptyFeatureCollection = (): FeatureCollection => ({
  type: "FeatureCollection",
  features: [],
});

const singleFeatureCollection = (feature: FloorFeature | undefined): FeatureCollection => ({
  type: "FeatureCollection",
  features: feature ? [feature] : [],
});

const toDraftFeatures = (
  mode: "select" | "point" | "line" | "polygon",
  vertices: Coordinates[],
): FeatureCollection => {
  if (mode === "select" || mode === "point" || vertices.length === 0) {
    return emptyFeatureCollection();
  }

  const pointFeatures = vertices.map((coordinates, index) => ({
    type: "Feature" as const,
    id: `draft-point-${index}`,
    geometry: {
      type: "Point" as const,
      coordinates,
    },
    properties: {
      kind: "draft",
      name: `Draft vertex ${index + 1}`,
    },
  }));

  if (mode === "line") {
    return {
      type: "FeatureCollection",
      features:
        vertices.length >= 2
          ? [
              {
                type: "Feature",
                id: "draft-line",
                geometry: {
                  type: "LineString",
                  coordinates: vertices,
                },
                properties: {
                  kind: "draft",
                  name: "Draft line",
                },
              },
              ...pointFeatures,
            ]
          : pointFeatures,
    };
  }

  const firstVertex = vertices[0];
  const outline =
    vertices.length >= 2
      ? [
          {
            type: "Feature" as const,
            id: "draft-polygon-outline",
            geometry: {
              type: "LineString" as const,
              coordinates: vertices,
            },
            properties: {
              kind: "draft",
              name: "Draft polygon outline",
            },
          },
        ]
      : [];
  const ring = vertices.length >= 3 && firstVertex ? [...vertices, firstVertex] : [];
  const fill =
    ring.length >= 4
      ? [
          {
            type: "Feature" as const,
            id: "draft-polygon",
            geometry: {
              type: "Polygon" as const,
              coordinates: [ring],
            },
            properties: {
              kind: "draft",
              name: "Draft polygon",
            },
          },
        ]
      : [];

  return {
    type: "FeatureCollection",
    features: [...fill, ...outline, ...pointFeatures],
  };
};

const toVertexFeatures = (
  featureId: string | undefined,
  vertices: Coordinates[],
): FeatureCollection => {
  if (!featureId || vertices.length === 0) {
    return emptyFeatureCollection();
  }

  return {
    type: "FeatureCollection",
    features: vertices.map((coordinates, index) => ({
      type: "Feature",
      id: `${featureId}-vertex-${index}`,
      geometry: {
        type: "Point",
        coordinates,
      },
      properties: {
        kind: "vertex",
        name: `Vertex ${index + 1}`,
        floorId: featureId,
      },
    })),
  };
};

const midpoint = (from: Coordinates, to: Coordinates): Coordinates => [
  Number(((from[0] + to[0]) / 2).toFixed(9)),
  Number(((from[1] + to[1]) / 2).toFixed(9)),
];

const toMidpointFeatures = (
  featureId: string | undefined,
  geometryType: GeometryType | undefined,
  vertices: Coordinates[],
): FeatureCollection => {
  if (!featureId || !geometryType) {
    return emptyFeatureCollection();
  }

  if (geometryType === "Point" || vertices.length < 2) {
    return emptyFeatureCollection();
  }

  const edgeCount = geometryType === "Polygon" ? vertices.length : vertices.length - 1;
  if (edgeCount < 1) {
    return emptyFeatureCollection();
  }

  const features = Array.from({ length: edgeCount }, (_, index) => {
    const start = vertices[index];
    const end =
      geometryType === "Polygon" ? vertices[(index + 1) % vertices.length] : vertices[index + 1];
    if (!start || !end) {
      return undefined;
    }

    return {
      type: "Feature" as const,
      id: `${featureId}-midpoint-${index}`,
      geometry: {
        type: "Point" as const,
        coordinates: midpoint(start, end),
      },
      properties: {
        kind: "midpoint",
        featureId,
        afterIndex: index,
      },
    };
  }).filter((feature) => Boolean(feature));

  return {
    type: "FeatureCollection",
    features: features as FloorFeature[],
  };
};

const toSelectedVertexFeature = (
  featureId: string | undefined,
  vertices: Coordinates[],
  selectedVertexIndex: number | undefined,
): FeatureCollection => {
  if (!featureId || selectedVertexIndex === undefined) {
    return emptyFeatureCollection();
  }

  const selectedCoordinates = vertices[selectedVertexIndex];
  if (!selectedCoordinates) {
    return emptyFeatureCollection();
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: `${featureId}-selected-vertex-${selectedVertexIndex}`,
        geometry: {
          type: "Point",
          coordinates: selectedCoordinates,
        },
        properties: {
          kind: "selected-vertex",
          name: `Selected vertex ${selectedVertexIndex + 1}`,
          floorId: featureId,
        },
      },
    ],
  };
};

const isSetDataSource = (source: unknown): source is { setData: (data: unknown) => void } =>
  typeof source === "object" && source !== null && "setData" in source;

const isUpdateImageSource = (
  source: unknown,
): source is {
  updateImage: (value: {
    url: string;
    coordinates: [Coordinates, Coordinates, Coordinates, Coordinates];
  }) => void;
} => typeof source === "object" && source !== null && "updateImage" in source;

const parseNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const parseFeatureIdFromVertex = (
  id: unknown,
): { featureId: string | undefined; vertexIndex: number | undefined } => {
  if (typeof id !== "string") {
    return {
      featureId: undefined,
      vertexIndex: undefined,
    };
  }

  const marker = "-vertex-";
  const selectedMarker = "-selected-vertex-";
  if (id.includes(selectedMarker)) {
    const [featureId, suffix] = id.split(selectedMarker);
    return {
      featureId,
      vertexIndex: parseNumber(suffix),
    };
  }

  if (id.includes(marker)) {
    const [featureId, suffix] = id.split(marker);
    return {
      featureId,
      vertexIndex: parseNumber(suffix),
    };
  }

  return {
    featureId: undefined,
    vertexIndex: undefined,
  };
};

const parseFeatureIdFromMidpoint = (
  id: unknown,
): { featureId: string | undefined; afterIndex: number | undefined } => {
  if (typeof id !== "string") {
    return {
      featureId: undefined,
      afterIndex: undefined,
    };
  }

  const marker = "-midpoint-";
  if (!id.includes(marker)) {
    return {
      featureId: undefined,
      afterIndex: undefined,
    };
  }

  const [featureId, suffix] = id.split(marker);
  return {
    featureId,
    afterIndex: parseNumber(suffix),
  };
};

const parseFeatureId = (id: unknown): string | undefined => {
  if (typeof id === "string") {
    return id;
  }

  if (typeof id === "number") {
    return String(id);
  }

  return undefined;
};

const getSourceSetData = (map: import("maplibre-gl").Map, sourceId: string) => {
  const source = map.getSource(sourceId);
  return isSetDataSource(source) ? source : undefined;
};

const isDev = (): boolean => Boolean(import.meta.env.DEV);

const assertDev = (condition: boolean, message: string) => {
  if (!condition && isDev()) {
    throw new Error(message);
  }
};

const applyInteractionMode = (
  map: import("maplibre-gl").Map,
  mode: "select" | "point" | "line" | "polygon",
) => {
  if (mode === "select") {
    map.dragPan.enable();
    map.getCanvas().style.cursor = "";
    return;
  }

  map.dragPan.disable();
  map.getCanvas().style.cursor = "crosshair";
};

const updateDragPanForState = (
  map: import("maplibre-gl").Map,
  mode: "select" | "point" | "line" | "polygon",
  isDraggingGeometry: boolean,
) => {
  if (isDraggingGeometry) {
    map.dragPan.disable();
    return;
  }

  if (mode === "select") {
    map.dragPan.enable();
  } else {
    map.dragPan.disable();
  }
};

export const createMapController = async (
  container: HTMLElement,
  maptilerApiKey: string,
  handlers: {
    onMapClick: MapClickHandler;
    onViewStateChange: ViewStateHandler;
    onGeometryDragStart: GeometryDragHandler;
    onGeometryDrag: GeometryDragHandler;
    onGeometryDragEnd: () => void;
  },
): Promise<MapController> => {
  const maplibre = (await import("maplibre-gl")) as MapLibreModule;

  const map = new maplibre.Map({
    container,
    style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerApiKey}`,
    center: [5.1214, 52.0907],
    zoom: 17,
  });

  let activeDrag: GeometryDragPayload | undefined;
  let suppressClick = false;
  let interactionMode: "select" | "point" | "line" | "polygon" = "select";
  let isStyleReady = false;
  let currentFeatures: FeatureCollection = emptyFeatureCollection();
  let currentSelection: FloorFeature | undefined;
  let currentEditable: {
    featureId: string | undefined;
    geometryType: GeometryType | undefined;
    vertices: Coordinates[];
    selectedVertexIndex: number | undefined;
  } = {
    featureId: undefined,
    geometryType: undefined,
    vertices: [],
    selectedVertexIndex: undefined,
  };
  let currentOverlay: FloorOverlay | undefined;
  let currentDraft: { mode: "select" | "point" | "line" | "polygon"; vertices: Coordinates[] } = {
    mode: "select",
    vertices: [],
  };

  const applyOverlay = (overlay: FloorOverlay | undefined) => {
    if (!overlay?.imageDataUrl) {
      if (map.getLayer(OVERLAY_LAYER_ID)) {
        map.removeLayer(OVERLAY_LAYER_ID);
      }
      if (map.getSource(OVERLAY_SOURCE_ID)) {
        map.removeSource(OVERLAY_SOURCE_ID);
      }
      return;
    }

    const coordinates: [Coordinates, Coordinates, Coordinates, Coordinates] = [
      overlay.corners.topLeft,
      overlay.corners.topRight,
      overlay.corners.bottomRight,
      overlay.corners.bottomLeft,
    ];

    const source = map.getSource(OVERLAY_SOURCE_ID);
    if (isUpdateImageSource(source)) {
      source.updateImage({
        url: overlay.imageDataUrl,
        coordinates,
      });
    } else {
      map.addSource(OVERLAY_SOURCE_ID, {
        type: "image",
        url: overlay.imageDataUrl,
        coordinates,
      });
    }

    if (!map.getLayer(OVERLAY_LAYER_ID)) {
      map.addLayer({
        id: OVERLAY_LAYER_ID,
        type: "raster",
        source: OVERLAY_SOURCE_ID,
        paint: {
          "raster-opacity": overlay.opacity / 100,
        },
      });
    } else {
      map.setPaintProperty(OVERLAY_LAYER_ID, "raster-opacity", overlay.opacity / 100);
    }
  };

  const applyPendingState = () => {
    if (!isStyleReady) {
      return;
    }

    const featureSource = getSourceSetData(map, FEATURE_SOURCE_ID);
    assertDev(Boolean(featureSource), `Missing source: ${FEATURE_SOURCE_ID}`);
    featureSource?.setData(currentFeatures);

    const selectedSource = getSourceSetData(map, SELECTED_SOURCE_ID);
    assertDev(Boolean(selectedSource), `Missing source: ${SELECTED_SOURCE_ID}`);
    selectedSource?.setData(singleFeatureCollection(currentSelection));

    const verticesSource = getSourceSetData(map, EDIT_VERTICES_SOURCE_ID);
    assertDev(Boolean(verticesSource), `Missing source: ${EDIT_VERTICES_SOURCE_ID}`);
    verticesSource?.setData(toVertexFeatures(currentEditable.featureId, currentEditable.vertices));

    const midpointSource = getSourceSetData(map, EDIT_MIDPOINTS_SOURCE_ID);
    assertDev(Boolean(midpointSource), `Missing source: ${EDIT_MIDPOINTS_SOURCE_ID}`);
    midpointSource?.setData(
      toMidpointFeatures(
        currentEditable.featureId,
        currentEditable.geometryType,
        currentEditable.vertices,
      ),
    );

    const selectedVertexSource = getSourceSetData(map, EDIT_VERTEX_SELECTED_SOURCE_ID);
    assertDev(Boolean(selectedVertexSource), `Missing source: ${EDIT_VERTEX_SELECTED_SOURCE_ID}`);
    selectedVertexSource?.setData(
      toSelectedVertexFeature(
        currentEditable.featureId,
        currentEditable.vertices,
        currentEditable.selectedVertexIndex,
      ),
    );

    const draftSource = getSourceSetData(map, DRAFT_SOURCE_ID);
    assertDev(Boolean(draftSource), `Missing source: ${DRAFT_SOURCE_ID}`);
    draftSource?.setData(toDraftFeatures(currentDraft.mode, currentDraft.vertices));

    applyOverlay(currentOverlay);
  };

  map.on("load", () => {
    map.addSource(FEATURE_SOURCE_ID, {
      type: "geojson",
      data: emptyFeatureCollection(),
    });

    map.addLayer({
      id: FEATURE_FILL_LAYER_ID,
      type: "fill",
      source: FEATURE_SOURCE_ID,
      paint: {
        "fill-color": "#2563eb",
        "fill-opacity": 0.2,
      },
      filter: ["==", ["geometry-type"], "Polygon"],
    });

    map.addLayer({
      id: FEATURE_LINE_LAYER_ID,
      type: "line",
      source: FEATURE_SOURCE_ID,
      paint: {
        "line-color": "#111827",
        "line-width": 3,
      },
      filter: ["!=", ["geometry-type"], "Point"],
    });

    map.addLayer({
      id: FEATURE_POINT_LAYER_ID,
      type: "circle",
      source: FEATURE_SOURCE_ID,
      paint: {
        "circle-color": "#111827",
        "circle-radius": 6,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
      filter: ["==", ["geometry-type"], "Point"],
    });

    map.addSource(SELECTED_SOURCE_ID, {
      type: "geojson",
      data: emptyFeatureCollection(),
    });

    map.addLayer({
      id: SELECTED_FILL_LAYER_ID,
      type: "fill",
      source: SELECTED_SOURCE_ID,
      paint: {
        "fill-color": "#f97316",
        "fill-opacity": 0.25,
      },
      filter: ["==", ["geometry-type"], "Polygon"],
    });

    map.addLayer({
      id: SELECTED_LINE_LAYER_ID,
      type: "line",
      source: SELECTED_SOURCE_ID,
      paint: {
        "line-color": "#f97316",
        "line-width": 4,
      },
      filter: ["!=", ["geometry-type"], "Point"],
    });

    map.addLayer({
      id: SELECTED_POINT_LAYER_ID,
      type: "circle",
      source: SELECTED_SOURCE_ID,
      paint: {
        "circle-color": "#f97316",
        "circle-radius": 8,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
      filter: ["==", ["geometry-type"], "Point"],
    });

    map.addSource(EDIT_VERTICES_SOURCE_ID, {
      type: "geojson",
      data: emptyFeatureCollection(),
    });

    map.addLayer({
      id: EDIT_VERTICES_LAYER_ID,
      type: "circle",
      source: EDIT_VERTICES_SOURCE_ID,
      paint: {
        "circle-color": "#ffffff",
        "circle-radius": 6,
        "circle-stroke-color": "#0f172a",
        "circle-stroke-width": 2,
      },
    });

    map.addSource(EDIT_MIDPOINTS_SOURCE_ID, {
      type: "geojson",
      data: emptyFeatureCollection(),
    });

    map.addLayer({
      id: EDIT_MIDPOINTS_LAYER_ID,
      type: "circle",
      source: EDIT_MIDPOINTS_SOURCE_ID,
      paint: {
        "circle-color": "#93c5fd",
        "circle-radius": 4,
        "circle-stroke-color": "#1d4ed8",
        "circle-stroke-width": 2,
      },
    });

    map.addSource(EDIT_VERTEX_SELECTED_SOURCE_ID, {
      type: "geojson",
      data: emptyFeatureCollection(),
    });

    map.addLayer({
      id: EDIT_VERTEX_SELECTED_LAYER_ID,
      type: "circle",
      source: EDIT_VERTEX_SELECTED_SOURCE_ID,
      paint: {
        "circle-color": "#16a34a",
        "circle-radius": 8,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });

    map.addSource(DRAFT_SOURCE_ID, {
      type: "geojson",
      data: emptyFeatureCollection(),
    });

    map.addLayer({
      id: DRAFT_FILL_LAYER_ID,
      type: "fill",
      source: DRAFT_SOURCE_ID,
      paint: {
        "fill-color": "#f97316",
        "fill-opacity": 0.2,
      },
      filter: ["==", ["geometry-type"], "Polygon"],
    });

    map.addLayer({
      id: DRAFT_LINE_LAYER_ID,
      type: "line",
      source: DRAFT_SOURCE_ID,
      paint: {
        "line-color": "#f97316",
        "line-width": 3,
      },
    });

    map.addLayer({
      id: DRAFT_POINT_LAYER_ID,
      type: "circle",
      source: DRAFT_SOURCE_ID,
      paint: {
        "circle-color": "#f97316",
        "circle-radius": 5,
      },
      filter: ["==", ["geometry-type"], "Point"],
    });

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

  map.on("mousedown", (event) => {
    const rendered = map.queryRenderedFeatures(event.point, {
      layers: INTERACTIVE_DRAG_LAYERS,
    });

    const topHit = rendered[0];
    if (!topHit) {
      return;
    }

    const fromVertex = parseFeatureIdFromVertex(topHit.id);
    const startCoordinates: Coordinates = [event.lngLat.lng, event.lngLat.lat];

    if (fromVertex.featureId && fromVertex.vertexIndex !== undefined) {
      activeDrag = {
        mode: "vertex",
        featureId: fromVertex.featureId,
        vertexIndex: fromVertex.vertexIndex,
        coordinates: startCoordinates,
        startCoordinates,
      };
      updateDragPanForState(map, interactionMode, true);
      handlers.onGeometryDragStart(activeDrag);
      return;
    }

    const featureId = parseFeatureId(topHit.id);
    if (!featureId) {
      return;
    }

    activeDrag = {
      mode: "feature",
      featureId,
      coordinates: startCoordinates,
      startCoordinates,
    };
    updateDragPanForState(map, interactionMode, true);
    handlers.onGeometryDragStart(activeDrag);
  });

  map.on("mousemove", (event) => {
    if (!activeDrag) {
      return;
    }

    const next: GeometryDragPayload = {
      ...activeDrag,
      coordinates: [event.lngLat.lng, event.lngLat.lat],
    };

    activeDrag = next;
    suppressClick = true;
    handlers.onGeometryDrag(next);
  });

  map.on("mouseup", () => {
    if (!activeDrag) {
      return;
    }

    activeDrag = undefined;
    updateDragPanForState(map, interactionMode, false);
    handlers.onGeometryDragEnd();
  });

  map.on("mouseout", () => {
    if (!activeDrag) {
      return;
    }

    activeDrag = undefined;
    updateDragPanForState(map, interactionMode, false);
    handlers.onGeometryDragEnd();
  });

  map.on("click", (event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }

    const rendered = map.queryRenderedFeatures(event.point, {
      layers: INTERACTIVE_CLICK_LAYERS,
    });

    const topHit = rendered[0];
    let featureId: string | undefined;
    let vertexFeatureId: string | undefined;
    let vertexIndex: number | undefined;
    let midpointFeatureId: string | undefined;
    let midpointAfterIndex: number | undefined;

    if (topHit) {
      const fromVertex = parseFeatureIdFromVertex(topHit.id);
      vertexFeatureId = fromVertex.featureId;
      vertexIndex = fromVertex.vertexIndex;

      const fromMidpoint = parseFeatureIdFromMidpoint(topHit.id);
      midpointFeatureId = fromMidpoint.featureId;
      midpointAfterIndex = fromMidpoint.afterIndex;

      if (!vertexFeatureId && !midpointFeatureId) {
        featureId = parseFeatureId(topHit.id);
      } else {
        featureId = vertexFeatureId ?? midpointFeatureId;
      }
    }

    handlers.onMapClick({
      coordinates: [event.lngLat.lng, event.lngLat.lat],
      featureId,
      vertexFeatureId,
      vertexIndex,
      midpointFeatureId,
      midpointAfterIndex,
    });
  });

  return {
    setFeatures: (features) => {
      currentFeatures = features;
      applyPendingState();
    },
    setSelection: (feature) => {
      currentSelection = feature;
      applyPendingState();
    },
    setEditableVertices: (featureId, geometryType, vertices, selectedVertexIndex) => {
      currentEditable = {
        featureId,
        geometryType,
        vertices,
        selectedVertexIndex,
      };
      applyPendingState();
    },
    setOverlay: (overlay) => {
      currentOverlay = overlay;
      applyPendingState();
    },
    setDrawDraft: (mode, vertices) => {
      currentDraft = { mode, vertices };
      applyPendingState();
    },
    setInteractionMode: (mode) => {
      interactionMode = mode;
      applyInteractionMode(map, mode);
    },
    resize: () => map.resize(),
    destroy: () => map.remove(),
  };
};
