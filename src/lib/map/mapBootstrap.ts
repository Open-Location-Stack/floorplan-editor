import type { Coordinates, FeatureCollection, FloorFeature, FloorOverlay } from "../types";

type MapLibreModule = typeof import("maplibre-gl");

type MapClickPayload = {
  coordinates: Coordinates;
  featureId: string | undefined;
  vertexFeatureId: string | undefined;
  vertexIndex: number | undefined;
};

type MapClickHandler = (payload: MapClickPayload) => void;
type ViewStateHandler = (center: Coordinates, zoom: number) => void;

type MapController = {
  setFeatures: (features: FeatureCollection) => void;
  setSelection: (feature: FloorFeature | undefined) => void;
  setEditableVertices: (
    featureId: string | undefined,
    vertices: Coordinates[],
    selectedVertexIndex: number | undefined,
  ) => void;
  setOverlay: (overlay: FloorOverlay | undefined) => void;
  setDrawDraft: (mode: "select" | "point" | "line" | "polygon", vertices: Coordinates[]) => void;
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
const EDIT_VERTEX_SELECTED_SOURCE_ID = "editor-selected-vertex";
const EDIT_VERTEX_SELECTED_LAYER_ID = "editor-selected-vertex-layer";

const DRAFT_SOURCE_ID = "editor-draft";
const DRAFT_FILL_LAYER_ID = "editor-draft-fill";
const DRAFT_LINE_LAYER_ID = "editor-draft-line";
const DRAFT_POINT_LAYER_ID = "editor-draft-point";

const OVERLAY_SOURCE_ID = "floor-overlay";
const OVERLAY_LAYER_ID = "floor-overlay-layer";

const INTERACTIVE_LAYERS = [
  EDIT_VERTEX_SELECTED_LAYER_ID,
  EDIT_VERTICES_LAYER_ID,
  FEATURE_FILL_LAYER_ID,
  FEATURE_LINE_LAYER_ID,
  FEATURE_POINT_LAYER_ID,
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

  if (mode === "line") {
    return {
      type: "FeatureCollection",
      features: [
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
      ],
    };
  }

  const firstVertex = vertices[0];
  const ring = vertices.length >= 3 && firstVertex ? [...vertices, firstVertex] : vertices;

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "draft-polygon",
        geometry: {
          type: "Polygon",
          coordinates: [ring],
        },
        properties: {
          kind: "draft",
          name: "Draft polygon",
        },
      },
    ],
  };
};

const toVertexFeatures = (featureId: string | undefined, vertices: Coordinates[]): FeatureCollection => {
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

const parseFeatureIdFromVertex = (id: unknown): { featureId: string | undefined; vertexIndex: number | undefined } => {
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

const getSourceSetData = (map: import("maplibre-gl").Map, sourceId: string) => {
  const source = map.getSource(sourceId);
  return isSetDataSource(source) ? source : undefined;
};

export const createMapController = async (
  container: HTMLElement,
  maptilerApiKey: string,
  handlers: {
    onMapClick: MapClickHandler;
    onViewStateChange: ViewStateHandler;
  },
): Promise<MapController> => {
  const maplibre = (await import("maplibre-gl")) as MapLibreModule;

  const map = new maplibre.Map({
    container,
    style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerApiKey}`,
    center: [5.1214, 52.0907],
    zoom: 17,
  });

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

  map.on("click", (event) => {
    const rendered = map.queryRenderedFeatures(event.point, {
      layers: INTERACTIVE_LAYERS,
    });

    const topHit = rendered[0];
    let featureId: string | undefined;
    let vertexFeatureId: string | undefined;
    let vertexIndex: number | undefined;

    if (topHit) {
      const fromVertex = parseFeatureIdFromVertex(topHit.id);
      vertexFeatureId = fromVertex.featureId;
      vertexIndex = fromVertex.vertexIndex;

      if (!vertexFeatureId) {
        const rawId = topHit.id;
        featureId =
          typeof rawId === "string"
            ? rawId
            : typeof rawId === "number"
              ? String(rawId)
              : undefined;
      } else {
        featureId = vertexFeatureId;
      }
    }

    handlers.onMapClick({
      coordinates: [event.lngLat.lng, event.lngLat.lat],
      featureId,
      vertexFeatureId,
      vertexIndex,
    });
  });

  return {
    setFeatures: (features) => {
      const source = getSourceSetData(map, FEATURE_SOURCE_ID);
      source?.setData(features);
    },
    setSelection: (feature) => {
      const source = getSourceSetData(map, SELECTED_SOURCE_ID);
      source?.setData(singleFeatureCollection(feature));
    },
    setEditableVertices: (featureId, vertices, selectedVertexIndex) => {
      const verticesSource = getSourceSetData(map, EDIT_VERTICES_SOURCE_ID);
      verticesSource?.setData(toVertexFeatures(featureId, vertices));

      const selectedSource = getSourceSetData(map, EDIT_VERTEX_SELECTED_SOURCE_ID);
      selectedSource?.setData(toSelectedVertexFeature(featureId, vertices, selectedVertexIndex));
    },
    setOverlay: (overlay) => {
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
    },
    setDrawDraft: (mode, vertices) => {
      const source = getSourceSetData(map, DRAFT_SOURCE_ID);
      source?.setData(toDraftFeatures(mode, vertices));
    },
    resize: () => map.resize(),
    destroy: () => map.remove(),
  };
};
