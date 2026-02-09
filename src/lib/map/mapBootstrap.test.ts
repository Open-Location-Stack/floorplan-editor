import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeatureCollection, FloorOverlay } from "../types";
import { createMapController } from "./mapBootstrap";

type EventHandler = (payload?: unknown) => void;

let lastMockMap: MockMap | undefined;

class MockMap {
  styleLoaded = false;
  handlers = new Map<string, EventHandler[]>();
  sources = new Map<string, unknown>();
  layers = new Set<string>();
  canvas = { style: { cursor: "" } };

  dragPan = {
    enable: vi.fn(),
    disable: vi.fn(),
  };

  constructor(_options: unknown) {
    lastMockMap = this;
  }

  on = (event: string, handler: EventHandler) => {
    const current = this.handlers.get(event) ?? [];
    this.handlers.set(event, [...current, handler]);
  };

  emit = (event: string, payload?: unknown) => {
    if (event === "load") {
      this.styleLoaded = true;
    }

    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload);
    }
  };

  addSource = vi.fn((id: string, spec: { type: string; data?: unknown }) => {
    if (!this.styleLoaded) {
      throw new Error("Style is not done loading.");
    }

    if (spec.type === "geojson") {
      this.sources.set(id, {
        setData: vi.fn(),
      });
      return;
    }

    if (spec.type === "image") {
      this.sources.set(id, {
        updateImage: vi.fn(),
      });
      return;
    }

    this.sources.set(id, {});
  });

  getSource = vi.fn((id: string) => this.sources.get(id));

  addLayer = vi.fn((layer: { id: string }) => {
    if (!this.styleLoaded) {
      throw new Error("Style is not done loading.");
    }

    this.layers.add(layer.id);
  });

  getLayer = vi.fn((id: string) => (this.layers.has(id) ? { id } : undefined));

  removeLayer = vi.fn((id: string) => {
    this.layers.delete(id);
  });

  removeSource = vi.fn((id: string) => {
    this.sources.delete(id);
  });

  setPaintProperty = vi.fn();
  queryRenderedFeatures = vi.fn(() => []);
  getCenter = vi.fn(() => ({ lng: 5.1214, lat: 52.0907 }));
  getZoom = vi.fn(() => 17);
  getCanvas = vi.fn(() => this.canvas);
  resize = vi.fn();
  remove = vi.fn();
}

vi.mock("maplibre-gl", () => ({
  Map: MockMap,
}));

const createOverlay = (): FloorOverlay => ({
  id: "overlay-1",
  floorId: "f1",
  imageName: "overlay.png",
  imageDataUrl: "data:image/png;base64,abc",
  opacity: 65,
  corners: {
    topLeft: [5.12, 52.1],
    topRight: [5.13, 52.1],
    bottomRight: [5.13, 52.09],
    bottomLeft: [5.12, 52.09],
  },
  updatedAt: "2026-02-09T00:00:00.000Z",
});

describe("createMapController", () => {
  beforeEach(() => {
    lastMockMap = undefined;
    vi.clearAllMocks();
  });

  it("defers overlay updates until style load", async () => {
    const container = document.createElement("div");
    const controller = await createMapController(container, "fake-key", {
      onMapClick: vi.fn(),
      onViewStateChange: vi.fn(),
      onGeometryDragStart: vi.fn(),
      onGeometryDrag: vi.fn(),
      onGeometryDragEnd: vi.fn(),
    });

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map mock instance");
    }

    expect(() => controller.setOverlay(createOverlay())).not.toThrow();
    expect(map.addSource).toHaveBeenCalledTimes(0);

    map.emit("load");

    expect(map.addSource).toHaveBeenCalledWith(
      "floor-overlay",
      expect.objectContaining({ type: "image" }),
    );
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "floor-overlay-layer" }),
      "editor-features-fill",
    );
  });

  it("applies buffered feature collection after style load", async () => {
    const container = document.createElement("div");
    const controller = await createMapController(container, "fake-key", {
      onMapClick: vi.fn(),
      onViewStateChange: vi.fn(),
      onGeometryDragStart: vi.fn(),
      onGeometryDrag: vi.fn(),
      onGeometryDragEnd: vi.fn(),
    });

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map mock instance");
    }

    const features: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "f1",
          geometry: {
            type: "Point",
            coordinates: [5.12, 52.09],
          },
          properties: {
            kind: "amenity",
            floorId: "f1",
          },
        },
      ],
    };

    controller.setFeatures(features);
    map.emit("load");

    const featureSource = map.getSource("editor-features") as
      | { setData?: ReturnType<typeof vi.fn> }
      | undefined;
    expect(featureSource?.setData).toHaveBeenCalledWith({
      type: "FeatureCollection",
      features: [
        expect.objectContaining({
          id: "f1",
          properties: expect.objectContaining({
            kind: "amenity",
            floorId: "f1",
            __featureId: "f1",
          }),
        }),
      ],
    });
  });

  it("applies buffered selection, editable vertices, and draft after style load", async () => {
    const container = document.createElement("div");
    const controller = await createMapController(container, "fake-key", {
      onMapClick: vi.fn(),
      onViewStateChange: vi.fn(),
      onGeometryDragStart: vi.fn(),
      onGeometryDrag: vi.fn(),
      onGeometryDragEnd: vi.fn(),
    });

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map mock instance");
    }

    const selectedFeature = {
      type: "Feature" as const,
      id: "selected-1",
      geometry: {
        type: "LineString" as const,
        coordinates: [[5.12, 52.09] as [number, number], [5.121, 52.091] as [number, number]],
      },
      properties: {
        kind: "path",
        floorId: "f1",
      },
    };

    controller.setSelection(selectedFeature);
    controller.setEditableVertices(
      selectedFeature.id,
      selectedFeature.geometry.type,
      [
        [5.12, 52.09],
        [5.121, 52.091],
      ],
      1,
    );
    controller.setDrawDraft("polygon", [
      [5.12, 52.09],
      [5.121, 52.09],
      [5.121, 52.091],
    ]);

    map.emit("load");

    const selectedSource = map.getSource("editor-selected") as
      | { setData?: ReturnType<typeof vi.fn> }
      | undefined;
    const verticesSource = map.getSource("editor-edit-vertices") as
      | { setData?: ReturnType<typeof vi.fn> }
      | undefined;
    const midpointSource = map.getSource("editor-edit-midpoints") as
      | { setData?: ReturnType<typeof vi.fn> }
      | undefined;
    const draftSource = map.getSource("editor-draft") as
      | { setData?: ReturnType<typeof vi.fn> }
      | undefined;

    expect(selectedSource?.setData).toHaveBeenCalled();
    expect(verticesSource?.setData).toHaveBeenCalled();
    expect(midpointSource?.setData).toHaveBeenCalled();
    expect(draftSource?.setData).toHaveBeenCalled();
  });

  it("sets pointer cursor when hovering an editable feature in select mode", async () => {
    const container = document.createElement("div");
    const controller = await createMapController(container, "fake-key", {
      onMapClick: vi.fn(),
      onViewStateChange: vi.fn(),
      onGeometryDragStart: vi.fn(),
      onGeometryDrag: vi.fn(),
      onGeometryDragEnd: vi.fn(),
    });

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map mock instance");
    }

    map.emit("load");
    map.queryRenderedFeatures.mockReturnValueOnce([
      {
        id: "feature-1",
      },
    ] as never);

    map.emit("mousemove", {
      point: { x: 10, y: 12 },
    });

    expect(map.getCanvas().style.cursor).toBe("pointer");

    controller.destroy();
  });

  it("treats ids containing -vertex- as regular feature ids unless suffixed with a vertex index", async () => {
    const onMapClick = vi.fn();
    const container = document.createElement("div");
    const controller = await createMapController(container, "fake-key", {
      onMapClick,
      onViewStateChange: vi.fn(),
      onGeometryDragStart: vi.fn(),
      onGeometryDrag: vi.fn(),
      onGeometryDragEnd: vi.fn(),
    });

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map mock instance");
    }

    map.emit("load");
    map.queryRenderedFeatures.mockReturnValueOnce([
      {
        id: "unit-vertex-east",
      },
    ] as never);

    map.emit("click", {
      point: { x: 0, y: 0 },
      lngLat: { lng: 5.1215, lat: 52.0908 },
    });

    expect(onMapClick).toHaveBeenCalledWith({
      coordinates: [5.1215, 52.0908],
      featureId: "unit-vertex-east",
      vertexFeatureId: undefined,
      vertexIndex: undefined,
      midpointFeatureId: undefined,
      midpointAfterIndex: undefined,
    });

    controller.destroy();
  });

  it("reports vertex selection when clicking a rendered vertex handle", async () => {
    const onMapClick = vi.fn();
    const container = document.createElement("div");
    const controller = await createMapController(container, "fake-key", {
      onMapClick,
      onViewStateChange: vi.fn(),
      onGeometryDragStart: vi.fn(),
      onGeometryDrag: vi.fn(),
      onGeometryDragEnd: vi.fn(),
    });

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map mock instance");
    }

    map.emit("load");
    map.queryRenderedFeatures.mockReturnValueOnce([
      {
        id: "shape-1",
      },
      {
        id: "shape-1-vertex-2",
      },
    ] as never);

    map.emit("click", {
      point: { x: 4, y: 4 },
      lngLat: { lng: 5.1215, lat: 52.0908 },
    });

    expect(onMapClick).toHaveBeenCalledWith({
      coordinates: [5.1215, 52.0908],
      featureId: "shape-1",
      vertexFeatureId: "shape-1",
      vertexIndex: 2,
      midpointFeatureId: undefined,
      midpointAfterIndex: undefined,
    });

    controller.destroy();
  });

  it("starts vertex drag when pressing a rendered vertex handle", async () => {
    const onGeometryDragStart = vi.fn();
    const onGeometryDrag = vi.fn();
    const container = document.createElement("div");
    const controller = await createMapController(container, "fake-key", {
      onMapClick: vi.fn(),
      onViewStateChange: vi.fn(),
      onGeometryDragStart,
      onGeometryDrag,
      onGeometryDragEnd: vi.fn(),
    });

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map mock instance");
    }

    map.emit("load");
    map.queryRenderedFeatures.mockReturnValueOnce([
      {
        id: "shape-1-vertex-1",
      },
    ] as never);

    map.emit("mousedown", {
      point: { x: 8, y: 8 },
      lngLat: { lng: 5.1214, lat: 52.0907 },
    });
    map.emit("mousemove", {
      point: { x: 9, y: 9 },
      lngLat: { lng: 5.1216, lat: 52.0909 },
    });

    expect(onGeometryDragStart).toHaveBeenCalledWith({
      mode: "vertex",
      featureId: "shape-1",
      vertexIndex: 1,
      coordinates: [5.1214, 52.0907],
      startCoordinates: [5.1214, 52.0907],
    });
    expect(onGeometryDrag).toHaveBeenCalledWith({
      mode: "vertex",
      featureId: "shape-1",
      vertexIndex: 1,
      coordinates: [5.1216, 52.0909],
      startCoordinates: [5.1214, 52.0907],
    });

    controller.destroy();
  });

  it("selects a vertex using hit properties when rendered ids are unavailable", async () => {
    const onMapClick = vi.fn();
    const container = document.createElement("div");
    const controller = await createMapController(container, "fake-key", {
      onMapClick,
      onViewStateChange: vi.fn(),
      onGeometryDragStart: vi.fn(),
      onGeometryDrag: vi.fn(),
      onGeometryDragEnd: vi.fn(),
    });

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map mock instance");
    }

    map.emit("load");
    map.queryRenderedFeatures.mockReturnValueOnce([
      {
        properties: {
          featureId: "shape-2",
          __featureId: "shape-2",
          __vertexIndex: 3,
        },
      },
    ] as never);

    map.emit("click", {
      point: { x: 12, y: 15 },
      lngLat: { lng: 5.1217, lat: 52.091 },
    });

    expect(onMapClick).toHaveBeenCalledWith({
      coordinates: [5.1217, 52.091],
      featureId: "shape-2",
      vertexFeatureId: "shape-2",
      vertexIndex: 3,
      midpointFeatureId: undefined,
      midpointAfterIndex: undefined,
    });

    controller.destroy();
  });

  it("starts vertex drag using hit properties when rendered ids are unavailable", async () => {
    const onGeometryDragStart = vi.fn();
    const container = document.createElement("div");
    const controller = await createMapController(container, "fake-key", {
      onMapClick: vi.fn(),
      onViewStateChange: vi.fn(),
      onGeometryDragStart,
      onGeometryDrag: vi.fn(),
      onGeometryDragEnd: vi.fn(),
    });

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map mock instance");
    }

    map.emit("load");
    map.queryRenderedFeatures.mockReturnValueOnce([
      {
        properties: {
          featureId: "shape-3",
          __featureId: "shape-3",
          __vertexIndex: 1,
        },
      },
    ] as never);

    map.emit("mousedown", {
      point: { x: 16, y: 10 },
      lngLat: { lng: 5.1216, lat: 52.0909 },
    });

    expect(onGeometryDragStart).toHaveBeenCalledWith({
      mode: "vertex",
      featureId: "shape-3",
      vertexIndex: 1,
      coordinates: [5.1216, 52.0909],
      startCoordinates: [5.1216, 52.0909],
    });

    controller.destroy();
  });
});
