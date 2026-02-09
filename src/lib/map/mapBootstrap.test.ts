import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeatureCollection, FloorOverlay } from "../types";
import { createMapController } from "./mapBootstrap";

type EventHandler = (payload?: unknown) => void;

type DrawFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "Point" | "LineString" | "Polygon";
    coordinates: unknown;
  };
  properties: Record<string, unknown>;
};

type MockDrawInstance = {
  mode: string;
  selectedIds: string[];
  features: Map<string, DrawFeature>;
  onAdd: () => HTMLElement;
  onRemove: () => void;
  getAll: () => { type: "FeatureCollection"; features: DrawFeature[] };
  get: (id: string) => DrawFeature | undefined;
  add: (input: DrawFeature | { type: "FeatureCollection"; features: DrawFeature[] }) => string[];
  delete: (input: string | string[]) => void;
  changeMode: (mode: string, options?: { featureIds?: string[] }) => void;
  trash: () => MockDrawInstance;
};

let lastMockMap: MockMap | undefined;
let lastMockDraw: MockDrawInstance | undefined;

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

  addSource = vi.fn((id: string, spec: { type: string }) => {
    if (!this.styleLoaded) {
      throw new Error("Style is not done loading.");
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
  addControl = vi.fn((control: { onAdd: (map: MockMap) => HTMLElement }) => control.onAdd(this));
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

vi.mock("@mapbox/mapbox-gl-draw", () => ({
  default: class MockDraw {
    mode = "simple_select";
    selectedIds: string[] = [];
    features = new Map<string, DrawFeature>();

    constructor(_options: unknown) {
      lastMockDraw = this;
    }

    onAdd = vi.fn(() => document.createElement("div"));
    onRemove = vi.fn();

    getAll = vi.fn(() => ({
      type: "FeatureCollection" as const,
      features: Array.from(this.features.values()),
    }));

    get = vi.fn((id: string) => this.features.get(id));

    add = vi.fn((input: DrawFeature | { type: "FeatureCollection"; features: DrawFeature[] }) => {
      const features = input.type === "FeatureCollection" ? input.features : [input];
      for (const feature of features) {
        this.features.set(String(feature.id), feature);
      }

      return features.map((feature) => String(feature.id));
    });

    delete = vi.fn((input: string | string[]) => {
      const ids = Array.isArray(input) ? input : [input];
      for (const id of ids) {
        this.features.delete(String(id));
      }
    });

    changeMode = vi.fn((mode: string, options?: { featureIds?: string[] }) => {
      this.mode = mode;
      this.selectedIds = options?.featureIds ?? [];
    });

    trash = vi.fn(() => {
      if (this.selectedIds.length > 0) {
        this.delete(this.selectedIds);
        this.selectedIds = [];
      }

      return this;
    });
  },
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

const pointFeatureCollection = (): FeatureCollection => ({
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
});

describe("createMapController", () => {
  beforeEach(() => {
    lastMockMap = undefined;
    lastMockDraw = undefined;
    vi.clearAllMocks();
  });

  it("defers overlay updates until style load", async () => {
    const controller = await createMapController(document.createElement("div"), "fake-key", {
      onFeaturesChange: vi.fn(),
      onFeatureSelectionChange: vi.fn(),
      onViewStateChange: vi.fn(),
      onInteractionModeChange: vi.fn(),
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

  it("applies buffered features into draw after style load", async () => {
    const controller = await createMapController(document.createElement("div"), "fake-key", {
      onFeaturesChange: vi.fn(),
      onFeatureSelectionChange: vi.fn(),
      onViewStateChange: vi.fn(),
      onInteractionModeChange: vi.fn(),
    });

    controller.setFeatures(pointFeatureCollection());

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    map.emit("load");

    expect(draw.add).toHaveBeenCalled();
    expect(draw.get("f1")).toEqual(
      expect.objectContaining({
        id: "f1",
        geometry: expect.objectContaining({ type: "Point" }),
      }),
    );
  });

  it("emits draw feature mutations", async () => {
    const onFeaturesChange = vi.fn();
    const controller = await createMapController(document.createElement("div"), "fake-key", {
      onFeaturesChange,
      onFeatureSelectionChange: vi.fn(),
      onViewStateChange: vi.fn(),
      onInteractionModeChange: vi.fn(),
    });

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    map.emit("load");
    draw.add({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "shape-1",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.12, 52.09],
              [5.121, 52.091],
            ],
          },
          properties: {
            kind: "path",
            floorId: "f1",
          },
        },
      ],
    });

    map.emit("draw.update", {});

    expect(onFeaturesChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "shape-1",
        geometry: expect.objectContaining({ type: "LineString" }),
      }),
    ]);

    controller.destroy();
  });

  it("emits selection and mode changes from draw", async () => {
    const onFeatureSelectionChange = vi.fn();
    const onInteractionModeChange = vi.fn();

    const controller = await createMapController(document.createElement("div"), "fake-key", {
      onFeaturesChange: vi.fn(),
      onFeatureSelectionChange,
      onViewStateChange: vi.fn(),
      onInteractionModeChange,
    });

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map instance");
    }

    map.emit("load");

    map.emit("draw.selectionchange", {
      features: [
        {
          id: "shape-2",
        },
      ],
    });
    map.emit("draw.modechange", {
      mode: "draw_polygon",
    });

    expect(onFeatureSelectionChange).toHaveBeenCalledWith("shape-2");
    expect(onInteractionModeChange).toHaveBeenCalledWith("polygon");

    controller.destroy();
  });

  it("syncs external selection and interaction mode to draw", async () => {
    const controller = await createMapController(document.createElement("div"), "fake-key", {
      onFeaturesChange: vi.fn(),
      onFeatureSelectionChange: vi.fn(),
      onViewStateChange: vi.fn(),
      onInteractionModeChange: vi.fn(),
    });

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    controller.setFeatures(pointFeatureCollection());
    map.emit("load");

    controller.setSelection({
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
    });

    expect(draw.changeMode).toHaveBeenCalledWith("simple_select", {
      featureIds: ["f1"],
    });

    controller.setInteractionMode("line");
    expect(draw.mode).toBe("draw_line_string");

    controller.destroy();
  });

  it("uses draw trash for delete selection", async () => {
    const controller = await createMapController(document.createElement("div"), "fake-key", {
      onFeaturesChange: vi.fn(),
      onFeatureSelectionChange: vi.fn(),
      onViewStateChange: vi.fn(),
      onInteractionModeChange: vi.fn(),
    });

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    map.emit("load");
    controller.deleteSelection();

    expect(draw.trash).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it("selects clicked feature and exits draw mode when a feature is clicked", async () => {
    const onFeatureSelectionChange = vi.fn();
    const onInteractionModeChange = vi.fn();

    const controller = await createMapController(document.createElement("div"), "fake-key", {
      onFeaturesChange: vi.fn(),
      onFeatureSelectionChange,
      onViewStateChange: vi.fn(),
      onInteractionModeChange,
    });

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map instance");
    }

    controller.setFeatures(pointFeatureCollection());
    map.emit("load");
    controller.setInteractionMode("line");

    map.queryRenderedFeatures.mockReturnValueOnce([
      {
        id: "f1",
        properties: {
          meta: "feature",
        },
      },
    ] as never);

    map.emit("click", {
      point: { x: 4, y: 5 },
    });

    expect(onInteractionModeChange).toHaveBeenCalledWith("select");
    expect(onFeatureSelectionChange).toHaveBeenCalledWith("f1");

    controller.destroy();
  });
});
