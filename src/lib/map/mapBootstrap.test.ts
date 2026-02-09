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
    expect(featureSource?.setData).toHaveBeenCalledWith(features);
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
});
