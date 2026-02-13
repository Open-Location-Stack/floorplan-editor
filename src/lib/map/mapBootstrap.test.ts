import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeatureCollection, FloorOverlay } from "../types";
import { createMapController, deriveNavigationOpeningEndpointMarkers } from "./mapBootstrap";

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
  selectedPoints: DrawFeature[];
  features: Map<string, DrawFeature>;
  onAdd: () => HTMLElement;
  onRemove: () => void;
  getAll: () => { type: "FeatureCollection"; features: DrawFeature[] };
  getSelectedPoints: (() => {
    type: "FeatureCollection";
    features: DrawFeature[];
  }) & {
    mockReturnValueOnce: (value: { type: "FeatureCollection"; features: DrawFeature[] }) => void;
    mockImplementationOnce: (
      implementation: () => { type: "FeatureCollection"; features: DrawFeature[] },
    ) => void;
  };
  get: (id: string) => DrawFeature | undefined;
  add: ((
    input: DrawFeature | { type: "FeatureCollection"; features: DrawFeature[] },
  ) => string[]) & {
    mockClear: () => void;
  };
  delete: ((input: string | string[]) => void) & {
    mockClear: () => void;
  };
  getMode: () => string;
  getSelectedIds: () => string[];
  changeMode: (
    mode: string,
    options?: {
      featureIds?: string[];
      featureId?: string;
      coordPath?: string;
      from?: number[];
    },
  ) => void;
  trash: () => MockDrawInstance;
};

let lastMockMap: MockMap | undefined;
let lastMockDraw: MockDrawInstance | undefined;
let mockMarkers: MockMarker[] = [];

class MockMap {
  styleLoaded = false;
  handlers = new Map<string, EventHandler[]>();
  sources = new Map<string, unknown>();
  layers = new Set<string>();
  styleLayers: Array<{ id: string }> = [];
  images = new Set<string>();
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

    this.sources.set(id, {
      setData: vi.fn(),
    });
  });

  getSource = vi.fn((id: string) => this.sources.get(id));

  addLayer = vi.fn((layer: { id: string }) => {
    if (!this.styleLoaded) {
      throw new Error("Style is not done loading.");
    }

    this.layers.add(layer.id);
    this.styleLayers.push({ id: layer.id });
  });

  getLayer = vi.fn((id: string) => (this.layers.has(id) ? { id } : undefined));

  removeLayer = vi.fn((id: string) => {
    this.layers.delete(id);
    this.styleLayers = this.styleLayers.filter((layer) => layer.id !== id);
  });

  removeSource = vi.fn((id: string) => {
    this.sources.delete(id);
  });

  setPaintProperty = vi.fn();
  setLayoutProperty = vi.fn();
  moveLayer = vi.fn();
  hasImage = vi.fn((id: string) => this.images.has(id));
  addImage = vi.fn((id: string) => {
    this.images.add(id);
  });
  addControl = vi.fn((control: { onAdd: (map: MockMap) => HTMLElement }) => control.onAdd(this));
  queryRenderedFeatures = vi.fn(() => []);
  getStyle = vi.fn(() => ({ layers: this.styleLayers }));
  getCenter = vi.fn(() => ({ lng: 5.1214, lat: 52.0907 }));
  getZoom = vi.fn(() => 17);
  easeTo = vi.fn();
  flyTo = vi.fn();
  getCanvas = vi.fn(() => this.canvas);
  resize = vi.fn();
  remove = vi.fn();
}

class MockMarker {
  lngLat = { lng: 0, lat: 0 };
  handlers = new Map<string, Array<() => void>>();
  options: {
    element?: HTMLElement;
  };

  constructor(options: { element?: HTMLElement }) {
    this.options = options;
    mockMarkers.push(this);
  }

  setLngLat = vi.fn((value: [number, number]) => {
    this.lngLat = { lng: value[0], lat: value[1] };
    return this;
  });

  getLngLat = vi.fn(() => this.lngLat);
  addTo = vi.fn(() => this);
  remove = vi.fn(() => this);

  on = vi.fn((event: string, handler: () => void) => {
    const current = this.handlers.get(event) ?? [];
    this.handlers.set(event, [...current, handler]);
    return this;
  });

  emit = (event: string) => {
    for (const handler of this.handlers.get(event) ?? []) {
      handler();
    }
  };
}

vi.mock("maplibre-gl", () => ({
  Map: MockMap,
  Marker: MockMarker,
}));

vi.mock("@mapbox/mapbox-gl-draw", () => ({
  default: class MockDraw {
    mode = "simple_select";
    selectedIds: string[] = [];
    selectedPoints: DrawFeature[] = [];
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

    getSelectedPoints = vi.fn(() => ({
      type: "FeatureCollection" as const,
      features: this.selectedPoints,
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

    getMode = vi.fn(() => this.mode);

    getSelectedIds = vi.fn(() => this.selectedIds);

    changeMode = vi.fn(
      (
        mode: string,
        options?: {
          featureIds?: string[];
          featureId?: string;
          coordPath?: string;
          from?: number[];
        },
      ) => {
        this.mode = mode;
        if (mode === "direct_select") {
          this.selectedIds = options?.featureId ? [options.featureId] : this.selectedIds;
          return;
        }

        this.selectedIds = options?.featureIds ?? [];
      },
    );

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

const findOverlayMarker = (
  kind: string,
  corner?: "topLeft" | "topRight" | "bottomRight" | "bottomLeft",
): MockMarker | undefined =>
  mockMarkers.find((marker) => {
    const element = marker.options.element;
    if (!element) {
      return false;
    }

    if (element.getAttribute("data-overlay-handle") !== kind) {
      return false;
    }

    if (corner) {
      return element.getAttribute("data-overlay-corner") === corner;
    }

    return true;
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

const polygonFeatureCollection = (): FeatureCollection => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "shape-1",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [5.12, 52.09],
            [5.121, 52.091],
            [5.122, 52.09],
            [5.12, 52.09],
          ],
        ],
      },
      properties: {
        kind: "unit",
        floorId: "f1",
      },
    },
  ],
});

const lineFeatureCollection = (): FeatureCollection => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "path-1",
      geometry: {
        type: "LineString",
        coordinates: [
          [5.12, 52.09],
          [5.121, 52.091],
          [5.122, 52.092],
        ],
      },
      properties: {
        kind: "path",
        floorId: "f1",
      },
    },
  ],
});

describe("createMapController", () => {
  beforeEach(() => {
    lastMockMap = undefined;
    lastMockDraw = undefined;
    mockMarkers = [];
    vi.clearAllMocks();
  });

  it("defers overlay updates until style load", async () => {
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

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
      undefined,
    );
  });

  it("drags the overlay bitmap to translate all corners", async () => {
    const onOverlayCornersChange = vi.fn();
    const overlay = createOverlay();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange,
      },
    );

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map instance");
    }

    controller.setOverlay(overlay);
    map.emit("load");
    map.queryRenderedFeatures.mockReturnValue([
      {
        layer: {
          id: "floor-overlay-layer",
        },
      },
    ] as never);

    map.emit("mousedown", {
      point: { x: 100, y: 120 },
      lngLat: { lng: 5.12, lat: 52.1 },
    });
    map.emit("mousemove", {
      point: { x: 106, y: 124 },
      lngLat: { lng: 5.121, lat: 52.099 },
    });
    map.emit("mouseup", {
      point: { x: 106, y: 124 },
      lngLat: { lng: 5.121, lat: 52.099 },
    });

    expect(onOverlayCornersChange).toHaveBeenCalled();
    const latestCorners = onOverlayCornersChange.mock.lastCall?.[0];
    expect(latestCorners).toBeDefined();
    if (!latestCorners) {
      throw new Error("Expected overlay corner update payload");
    }

    expect(latestCorners.topLeft[0]).toBeCloseTo(overlay.corners.topLeft[0] + 0.001);
    expect(latestCorners.topLeft[1]).toBeCloseTo(overlay.corners.topLeft[1] - 0.001);
    expect(latestCorners.bottomRight[0]).toBeCloseTo(overlay.corners.bottomRight[0] + 0.001);
    expect(latestCorners.bottomRight[1]).toBeCloseTo(overlay.corners.bottomRight[1] - 0.001);
  });

  it("drags the center overlay handle to translate all corners", async () => {
    const onOverlayCornersChange = vi.fn();
    const overlay = createOverlay();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange,
      },
    );

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map instance");
    }

    controller.setOverlay(overlay);
    map.emit("load");

    expect(mockMarkers.length).toBeGreaterThanOrEqual(6);
    const centerMarker = findOverlayMarker("center");
    expect(centerMarker).toBeDefined();
    if (!centerMarker) {
      throw new Error("Expected center overlay marker");
    }

    const center = [
      (overlay.corners.topLeft[0] +
        overlay.corners.topRight[0] +
        overlay.corners.bottomRight[0] +
        overlay.corners.bottomLeft[0]) /
        4,
      (overlay.corners.topLeft[1] +
        overlay.corners.topRight[1] +
        overlay.corners.bottomRight[1] +
        overlay.corners.bottomLeft[1]) /
        4,
    ] as const;

    centerMarker.emit("dragstart");
    centerMarker.setLngLat([center[0] + 0.002, center[1] - 0.0015]);
    centerMarker.emit("drag");
    centerMarker.emit("dragend");

    expect(onOverlayCornersChange).toHaveBeenCalled();
    const latestCorners = onOverlayCornersChange.mock.lastCall?.[0];
    expect(latestCorners).toBeDefined();
    if (!latestCorners) {
      throw new Error("Expected overlay corner update payload");
    }

    expect(latestCorners.topLeft[0]).toBeCloseTo(overlay.corners.topLeft[0] + 0.002);
    expect(latestCorners.topLeft[1]).toBeCloseTo(overlay.corners.topLeft[1] - 0.0015);
    expect(latestCorners.bottomRight[0]).toBeCloseTo(overlay.corners.bottomRight[0] + 0.002);
    expect(latestCorners.bottomRight[1]).toBeCloseTo(overlay.corners.bottomRight[1] - 0.0015);
  });

  it("drags the rotate overlay handle to rotate corners around overlay center", async () => {
    const onOverlayCornersChange = vi.fn();
    const overlay = createOverlay();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange,
      },
    );

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map instance");
    }

    controller.setOverlay(overlay);
    map.emit("load");

    const rotateMarker = findOverlayMarker("rotate");
    expect(rotateMarker).toBeDefined();
    if (!rotateMarker) {
      throw new Error("Expected rotate overlay marker");
    }

    const center = [
      (overlay.corners.topLeft[0] +
        overlay.corners.topRight[0] +
        overlay.corners.bottomRight[0] +
        overlay.corners.bottomLeft[0]) /
        4,
      (overlay.corners.topLeft[1] +
        overlay.corners.topRight[1] +
        overlay.corners.bottomRight[1] +
        overlay.corners.bottomLeft[1]) /
        4,
    ] as const;
    const rotateHandleStart = rotateMarker.getLngLat();
    const rotateVector = [
      rotateHandleStart.lng - center[0],
      rotateHandleStart.lat - center[1],
    ] as const;

    rotateMarker.emit("dragstart");
    rotateMarker.setLngLat([center[0] - rotateVector[1], center[1] + rotateVector[0]]);
    rotateMarker.emit("drag");
    rotateMarker.emit("dragend");

    expect(onOverlayCornersChange).toHaveBeenCalled();
    const latestCorners = onOverlayCornersChange.mock.lastCall?.[0];
    expect(latestCorners).toBeDefined();
    if (!latestCorners) {
      throw new Error("Expected overlay corner update payload");
    }

    const nextCenter = [
      (latestCorners.topLeft[0] +
        latestCorners.topRight[0] +
        latestCorners.bottomRight[0] +
        latestCorners.bottomLeft[0]) /
        4,
      (latestCorners.topLeft[1] +
        latestCorners.topRight[1] +
        latestCorners.bottomRight[1] +
        latestCorners.bottomLeft[1]) /
        4,
    ] as const;

    expect(nextCenter[0]).toBeCloseTo(center[0], 6);
    expect(nextCenter[1]).toBeCloseTo(center[1], 6);
    const topRightDelta = Math.hypot(
      latestCorners.topRight[0] - overlay.corners.topRight[0],
      latestCorners.topRight[1] - overlay.corners.topRight[1],
    );
    expect(topRightDelta).toBeGreaterThan(1e-6);
  });

  it("applies buffered features into draw after style load", async () => {
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

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

  it("preserves level feature type in draw properties when kind is missing", async () => {
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

    controller.setFeatures({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "level-shape-1",
          feature_type: "level",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.12, 52.09],
                [5.121, 52.09],
                [5.121, 52.089],
                [5.12, 52.089],
                [5.12, 52.09],
              ],
            ],
          },
          properties: {
            floorId: "f1",
          },
        },
      ],
    });

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    map.emit("load");

    expect(draw.get("level-shape-1")).toEqual(
      expect.objectContaining({
        id: "level-shape-1",
        properties: expect.objectContaining({
          feature_type: "level",
        }),
      }),
    );
  });

  it("registers custom point icons on map load", async () => {
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map instance");
    }

    map.emit("load");

    expect(map.addImage).toHaveBeenCalledWith(
      "point-icon-kiosk",
      expect.objectContaining({
        width: expect.any(Number),
        height: expect.any(Number),
        data: expect.any(Uint8Array),
      }),
      { pixelRatio: 2 },
    );
    expect(map.hasImage("point-icon-kiosk")).toBe(true);
    expect(map.hasImage("point-icon-connector")).toBe(true);

    controller.destroy();
  });

  it("derives endpoint markers only for two-point navigation nodes", () => {
    const result = deriveNavigationOpeningEndpointMarkers([
      {
        type: "Feature",
        id: "stairs-node",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.09],
            [5.121, 52.09],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          category: "stairs",
        },
      },
      {
        type: "Feature",
        id: "stairs-polyline",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.0905],
            [5.1205, 52.0906],
            [5.121, 52.0905],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          category: "stairs",
        },
      },
      {
        type: "Feature",
        id: "ped-path",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.122, 52.09],
            [5.123, 52.09],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          category: "pedestrian",
        },
      },
      {
        type: "Feature",
        id: "amenity-point",
        feature_type: "amenity",
        geometry: {
          type: "Point",
          coordinates: [5.124, 52.09],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          category: "restroom",
        },
      },
      {
        type: "Feature",
        id: "legacy-elevator-node",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.125, 52.09],
            [5.126, 52.09],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          name: "elevator node",
        },
      },
    ]);

    expect(result.features).toHaveLength(4);
    expect(result.features[0]).toEqual(
      expect.objectContaining({
        id: "stairs-node:endpoint:0",
        geometry: {
          type: "Point",
          coordinates: [5.12, 52.09],
        },
        properties: expect.objectContaining({
          source_opening_id: "stairs-node",
          endpoint_index: 0,
          endpoint_role: "node",
          category: "stairs",
          feature_type: "opening_endpoint_marker",
        }),
      }),
    );
    expect(result.features[1]).toEqual(
      expect.objectContaining({
        id: "stairs-node:endpoint:1",
        geometry: {
          type: "Point",
          coordinates: [5.121, 52.09],
        },
        properties: expect.objectContaining({
          source_opening_id: "stairs-node",
          endpoint_index: 1,
          endpoint_role: "connector",
          category: "stairs",
          feature_type: "opening_endpoint_marker",
        }),
      }),
    );
    expect(result.features[2]).toEqual(
      expect.objectContaining({
        id: "legacy-elevator-node:endpoint:0",
        properties: expect.objectContaining({
          source_opening_id: "legacy-elevator-node",
          endpoint_role: "node",
          category: "elevator",
        }),
      }),
    );
    expect(result.features[3]).toEqual(
      expect.objectContaining({
        id: "legacy-elevator-node:endpoint:1",
        properties: expect.objectContaining({
          source_opening_id: "legacy-elevator-node",
          endpoint_role: "connector",
          category: "elevator",
        }),
      }),
    );
  });

  it("renders opening endpoint overlay source for navigation node openings", async () => {
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

    controller.setFeatures({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "stairs-node",
          feature_type: "opening",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.12, 52.09],
              [5.121, 52.09],
            ],
          },
          properties: {
            level_id: "f1",
            floorId: "f1",
            category: "stairs",
          },
        },
      ],
    });

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map instance");
    }

    map.emit("load");

    expect(map.addSource).toHaveBeenCalledWith(
      "opening-endpoint-overlay",
      expect.objectContaining({
        type: "geojson",
        data: expect.objectContaining({
          features: expect.arrayContaining([
            expect.objectContaining({
              id: "stairs-node:endpoint:0",
              properties: expect.objectContaining({
                endpoint_role: "node",
                category: "stairs",
              }),
            }),
            expect.objectContaining({
              id: "stairs-node:endpoint:1",
              properties: expect.objectContaining({
                endpoint_role: "connector",
                category: "stairs",
              }),
            }),
          ]),
        }),
      }),
    );
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "opening-endpoint-overlay-symbol",
        type: "symbol",
        source: "opening-endpoint-overlay",
      }),
    );
  });

  it("emits draw feature mutations", async () => {
    const onFeaturesChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange,
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

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

  it("snaps updated vertices to nearby vertices on other features", async () => {
    const onFeaturesChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange,
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

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
          id: "anchor-point",
          geometry: {
            type: "Point",
            coordinates: [5.12, 52.09],
          },
          properties: {
            kind: "amenity",
            floorId: "f1",
          },
        },
        {
          type: "Feature",
          id: "moving-point",
          geometry: {
            type: "Point",
            coordinates: [5.120001, 52.09],
          },
          properties: {
            kind: "amenity",
            floorId: "f1",
          },
        },
      ],
    });

    map.emit("draw.update", {
      features: [{ id: "moving-point" }],
    });

    expect(onFeaturesChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "moving-point",
          geometry: {
            type: "Point",
            coordinates: [5.12, 52.09],
          },
        }),
      ]),
    );

    controller.destroy();
  });

  it("snaps updated vertices to nearby edges on other features", async () => {
    const onFeaturesChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange,
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

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
          id: "anchor-line",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.1195, 52.09],
              [5.1205, 52.09],
            ],
          },
          properties: {
            kind: "path",
            floorId: "f1",
          },
        },
        {
          type: "Feature",
          id: "moving-point",
          geometry: {
            type: "Point",
            coordinates: [5.12, 52.090001],
          },
          properties: {
            kind: "amenity",
            floorId: "f1",
          },
        },
      ],
    });

    map.emit("draw.update", {
      features: [{ id: "moving-point" }],
    });

    expect(onFeaturesChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "moving-point",
          geometry: {
            type: "Point",
            coordinates: [5.12, 52.09],
          },
        }),
      ]),
    );

    controller.destroy();
  });

  it("connects path endpoints to existing target path vertices", async () => {
    const onFeaturesChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange,
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

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
          id: "target-path",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.1195, 52.09],
              [5.12, 52.09],
              [5.1205, 52.09],
            ],
          },
          properties: {
            kind: "path",
            floorId: "f1",
          },
        },
        {
          type: "Feature",
          id: "source-path",
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

    map.emit("draw.update", {
      features: [{ id: "source-path" }],
    });

    expect(onFeaturesChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "source-path",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.12, 52.09],
              [5.121, 52.091],
            ],
          },
        }),
        expect.objectContaining({
          id: "target-path",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.1195, 52.09],
              [5.12, 52.09],
              [5.1205, 52.09],
            ],
          },
        }),
      ]),
    );

    controller.destroy();
  });

  it("connects endpoints to target edges by inserting a new target vertex", async () => {
    const onFeaturesChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange,
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

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
          id: "target-path",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.1195, 52.09],
              [5.1205, 52.09],
            ],
          },
          properties: {
            kind: "path",
            floorId: "f1",
          },
        },
        {
          type: "Feature",
          id: "source-path",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.12, 52.090001],
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

    map.emit("draw.update", {
      features: [{ id: "source-path" }],
    });

    const latestFeatures = onFeaturesChange.mock.lastCall?.[0] as
      | FeatureCollection["features"]
      | undefined;
    expect(latestFeatures).toBeDefined();
    if (!latestFeatures) {
      throw new Error("Expected updated features");
    }

    const source = latestFeatures.find((feature) => feature.id === "source-path");
    const target = latestFeatures.find((feature) => feature.id === "target-path");
    expect(source).toBeDefined();
    expect(target).toBeDefined();
    if (
      !source ||
      !target ||
      source.geometry.type !== "LineString" ||
      target.geometry.type !== "LineString"
    ) {
      throw new Error("Expected source and target path features");
    }

    expect(source.geometry.coordinates[0]).toEqual([5.12, 52.09]);
    expect(target.geometry.coordinates).toEqual([
      [5.1195, 52.09],
      [5.1205, 52.09],
    ]);

    map.emit("draw.update", {
      features: [{ id: "source-path" }],
    });

    const repeatedFeatures = onFeaturesChange.mock.lastCall?.[0] as
      | FeatureCollection["features"]
      | undefined;
    const repeatedTarget = repeatedFeatures?.find((feature) => feature.id === "target-path");
    expect(repeatedTarget).toBeDefined();
    if (!repeatedTarget || repeatedTarget.geometry.type !== "LineString") {
      throw new Error("Expected target path feature");
    }
    expect(repeatedTarget.geometry.coordinates).toEqual([
      [5.1195, 52.09],
      [5.1205, 52.09],
    ]);

    controller.destroy();
  });

  it("does not create path connections when only non-endpoint vertices snap", async () => {
    const onFeaturesChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange,
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

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
          id: "target-path",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.1195, 52.09],
              [5.1205, 52.09],
            ],
          },
          properties: {
            kind: "path",
            floorId: "f1",
          },
        },
        {
          type: "Feature",
          id: "source-path",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.121, 52.091],
              [5.12, 52.090001],
              [5.122, 52.092],
            ],
          },
          properties: {
            kind: "path",
            floorId: "f1",
          },
        },
      ],
    });

    map.emit("draw.update", {
      features: [{ id: "source-path" }],
    });

    const latestFeatures = onFeaturesChange.mock.lastCall?.[0] as
      | FeatureCollection["features"]
      | undefined;
    const source = latestFeatures?.find((feature) => feature.id === "source-path");
    expect(source).toBeDefined();
    if (!source || source.geometry.type !== "LineString") {
      throw new Error("Expected source path feature");
    }

    controller.destroy();
  });

  it("keeps updated coordinates unchanged when snapping is disabled", async () => {
    const onFeaturesChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange,
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    map.emit("load");
    controller.setSnapEnabled(false);

    draw.add({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "anchor-point",
          geometry: {
            type: "Point",
            coordinates: [5.12, 52.09],
          },
          properties: {
            kind: "amenity",
            floorId: "f1",
          },
        },
        {
          type: "Feature",
          id: "moving-point",
          geometry: {
            type: "Point",
            coordinates: [5.120001, 52.09],
          },
          properties: {
            kind: "amenity",
            floorId: "f1",
          },
        },
      ],
    });

    map.emit("draw.update", {
      features: [{ id: "moving-point" }],
    });

    expect(onFeaturesChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "moving-point",
          geometry: {
            type: "Point",
            coordinates: [5.120001, 52.09],
          },
        }),
      ]),
    );

    controller.destroy();
  });

  it("does not connect paths while snapping is disabled", async () => {
    const onFeaturesChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange,
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    map.emit("load");
    controller.setSnapEnabled(false);
    draw.add({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "target-path",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.1195, 52.09],
              [5.1205, 52.09],
            ],
          },
          properties: {
            kind: "path",
            floorId: "f1",
          },
        },
        {
          type: "Feature",
          id: "source-path",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.12, 52.090001],
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

    map.emit("draw.update", {
      features: [{ id: "source-path" }],
    });

    const latestFeatures = onFeaturesChange.mock.lastCall?.[0] as
      | FeatureCollection["features"]
      | undefined;
    const source = latestFeatures?.find((feature) => feature.id === "source-path");
    const target = latestFeatures?.find((feature) => feature.id === "target-path");
    expect(source).toBeDefined();
    expect(target).toBeDefined();
    if (
      !source ||
      !target ||
      source.geometry.type !== "LineString" ||
      target.geometry.type !== "LineString"
    ) {
      throw new Error("Expected source and target path features");
    }

    expect(source.geometry.coordinates[0]).toEqual([5.12, 52.090001]);
    expect(target.geometry.coordinates).toEqual([
      [5.1195, 52.09],
      [5.1205, 52.09],
    ]);

    controller.destroy();
  });

  it("snaps created line features even while draw mode remains draw_line_string", async () => {
    const onFeaturesChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange,
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    map.emit("load");
    draw.mode = "draw_line_string";
    draw.add({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "anchor-point",
          geometry: {
            type: "Point",
            coordinates: [5.12, 52.09],
          },
          properties: {
            kind: "amenity",
            floorId: "f1",
          },
        },
        {
          type: "Feature",
          id: "new-path",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.120001, 52.09],
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

    map.emit("draw.create", {
      features: [{ id: "new-path" }],
    });

    expect(onFeaturesChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "new-path",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.12, 52.09],
              [5.121, 52.091],
            ],
          },
        }),
      ]),
    );

    controller.destroy();
  });

  it("snaps vertex drags live in direct_select mode", async () => {
    const onFeaturesChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange,
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

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
          id: "anchor-point",
          geometry: {
            type: "Point",
            coordinates: [5.12, 52.09],
          },
          properties: {
            kind: "amenity",
            floorId: "f1",
          },
        },
        {
          type: "Feature",
          id: "path-1",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.120001, 52.09],
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

    draw.changeMode("direct_select", { featureId: "path-1" });
    map.emit("draw.update", {
      features: [{ id: "path-1" }],
    });

    expect(draw.mode).toBe("direct_select");
    expect(onFeaturesChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "path-1",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.12, 52.09],
              [5.121, 52.091],
            ],
          },
        }),
      ]),
    );

    controller.destroy();
  });

  it("snaps active polygon updates when draw.update has no feature ids", async () => {
    const onFeaturesChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange,
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    map.emit("load");
    draw.mode = "draw_polygon";
    draw.selectedIds = [];
    draw.add({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "anchor-point",
          geometry: {
            type: "Point",
            coordinates: [5.12, 52.09],
          },
          properties: {
            kind: "amenity",
            floorId: "f1",
          },
        },
        {
          type: "Feature",
          id: "poly-1",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.120001, 52.09],
                [5.121, 52.091],
                [5.122, 52.09],
                [5.120001, 52.09],
              ],
            ],
          },
          properties: {
            kind: "unit",
            floorId: "f1",
            active: "true",
          },
        },
      ],
    });

    map.emit("draw.update", {});

    expect(onFeaturesChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "poly-1",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.12, 52.09],
                [5.121, 52.091],
                [5.122, 52.09],
                [5.12, 52.09],
              ],
            ],
          },
        }),
      ]),
    );

    controller.destroy();
  });

  it("snaps in-progress polygon pointer before closing", async () => {
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    map.emit("load");
    draw.mode = "draw_polygon";
    draw.selectedIds = [];
    draw.add({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "anchor-point",
          geometry: {
            type: "Point",
            coordinates: [5.12, 52.09],
          },
          properties: {
            kind: "amenity",
            floorId: "f1",
          },
        },
        {
          type: "Feature",
          id: "poly-1",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.121, 52.091],
                [5.122, 52.09],
                [5.120001, 52.09],
                [5.121, 52.091],
              ],
            ],
          },
          properties: {
            kind: "unit",
            floorId: "f1",
            active: "true",
          },
        },
      ],
    });

    map.emit("mousemove", {
      point: { x: 100, y: 120 },
    });

    const updated = draw.get("poly-1");
    expect(updated).toBeDefined();
    if (!updated || updated.geometry.type !== "Polygon") {
      throw new Error("Expected updated polygon");
    }

    const updatedCoordinates = updated.geometry.coordinates as number[][][];
    const updatedRing = updatedCoordinates[0];
    expect(updatedRing?.[2]).toEqual([5.12, 52.09]);

    controller.destroy();
  });

  it("normalizes unclosed polygons during draw updates", async () => {
    const onFeaturesChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange,
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

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
            type: "Polygon",
            coordinates: [
              [
                [5.12, 52.09],
                [5.121, 52.091],
                [5.122, 52.09],
              ],
            ],
          },
          properties: {
            kind: "unit",
            floorId: "f1",
          },
        },
      ],
    });

    map.emit("draw.update", {});

    expect(onFeaturesChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "shape-1",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [5.12, 52.09],
              [5.121, 52.091],
              [5.122, 52.09],
            ],
          ],
        },
      }),
    ]);

    controller.destroy();
  });

  it("does not replace active polygons during draw-driven state sync", async () => {
    let controller: Awaited<ReturnType<typeof createMapController>> | undefined;

    controller = await createMapController(document.createElement("div"), "fake-key", "basic-v2", {
      onFeaturesChange: (features) => {
        controller?.setFeatures({
          type: "FeatureCollection",
          features,
        });
      },
      onFeatureSelectionChange: vi.fn(),
      onViewStateChange: vi.fn(),
      onInteractionModeChange: vi.fn(),
      onOverlayCornersChange: vi.fn(),
    });

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    map.emit("load");
    controller.setInteractionMode("polygon");

    draw.add({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "shape-1",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.12, 52.09],
                [5.121, 52.091],
                [5.122, 52.09],
              ],
            ],
          },
          properties: {
            kind: "unit",
            floorId: "f1",
          },
        },
      ],
    });

    draw.add.mockClear();
    draw.delete.mockClear();

    map.emit("draw.update", {});

    expect(draw.delete).not.toHaveBeenCalled();
    expect(draw.add).not.toHaveBeenCalled();

    controller.destroy();
  });

  it("does not delete incomplete polygon drafts during draw-driven state sync", async () => {
    let controller: Awaited<ReturnType<typeof createMapController>> | undefined;

    controller = await createMapController(document.createElement("div"), "fake-key", "basic-v2", {
      onFeaturesChange: (features) => {
        controller?.setFeatures({
          type: "FeatureCollection",
          features,
        });
      },
      onFeatureSelectionChange: vi.fn(),
      onViewStateChange: vi.fn(),
      onInteractionModeChange: vi.fn(),
      onOverlayCornersChange: vi.fn(),
    });

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    map.emit("load");
    controller.setInteractionMode("polygon");

    draw.add({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "draft-polygon",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.12, 52.09],
                [5.121, 52.091],
              ],
            ],
          },
          properties: {
            kind: "unit",
            floorId: "f1",
          },
        },
      ],
    });

    draw.delete.mockClear();
    draw.add.mockClear();

    map.emit("draw.update", {});

    expect(draw.delete).not.toHaveBeenCalled();
    expect(draw.add).not.toHaveBeenCalled();

    controller.destroy();
  });

  it("emits selection and mode changes from draw", async () => {
    const onFeatureSelectionChange = vi.fn();
    const onInteractionModeChange = vi.fn();

    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange,
        onViewStateChange: vi.fn(),
        onInteractionModeChange,
        onOverlayCornersChange: vi.fn(),
      },
    );

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
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

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

  it("does not force direct_select for point selections", async () => {
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    controller.setFeatures(pointFeatureCollection());
    map.emit("load");
    draw.changeMode("direct_select", { featureId: "shape-1" });
    (draw.changeMode as unknown as { mockClear: () => void }).mockClear();

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
    expect(
      (
        draw.changeMode as unknown as {
          mock: { calls: Array<[string, unknown?]> };
        }
      ).mock.calls.some(([mode]) => mode === "direct_select"),
    ).toBe(false);

    controller.destroy();
  });

  it("uses draw trash for delete selection", async () => {
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

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

  it("deletes only selected vertices when requested", async () => {
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    map.emit("load");

    draw.selectedPoints = [];
    controller.deleteVertex();
    expect(draw.trash).toHaveBeenCalledTimes(0);

    draw.selectedPoints = [
      {
        type: "Feature",
        id: "vertex-1",
        geometry: {
          type: "Point",
          coordinates: [5.12, 52.09],
        },
        properties: {},
      },
    ];
    controller.deleteVertex();
    expect(draw.trash).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it("splits a selected path segment by inserting a midpoint node", async () => {
    const onFeaturesChange = vi.fn();
    const onFeatureSelectionChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange,
        onFeatureSelectionChange,
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
        onVertexSelectionChange: vi.fn(),
      },
    );

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    const collection = lineFeatureCollection();
    const selectedFeature = collection.features[0];
    if (!selectedFeature) {
      throw new Error("Expected line feature");
    }

    controller.setFeatures(collection);
    map.emit("load");
    controller.setSelection(selectedFeature);
    draw.selectedIds = ["path-1"];
    draw.selectedPoints = [
      {
        type: "Feature",
        id: "vertex-1",
        geometry: {
          type: "Point",
          coordinates: [5.121, 52.091],
        },
        properties: {},
      },
    ];

    controller.splitPathSegment();

    const updatedFeature = draw.get("path-1");
    expect(updatedFeature?.geometry.type).toBe("LineString");
    const coordinates = updatedFeature?.geometry.coordinates as number[][] | undefined;
    expect(coordinates).toBeDefined();
    expect(coordinates).toHaveLength(4);
    expect(coordinates?.[0]).toEqual([5.12, 52.09]);
    expect(coordinates?.[1]).toEqual([5.121, 52.091]);
    expect(coordinates?.[2]?.[0]).toBeCloseTo(5.1215);
    expect(coordinates?.[2]?.[1]).toBeCloseTo(52.0915);
    expect(coordinates?.[3]).toEqual([5.122, 52.092]);
    expect(draw.changeMode).toHaveBeenCalledWith(
      "direct_select",
      expect.objectContaining({
        featureId: "path-1",
      }),
    );
    expect(onFeatureSelectionChange).toHaveBeenCalledWith("path-1");
    expect(onFeaturesChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "path-1",
      }),
    ]);

    controller.destroy();
  });

  it("forks a path from a selected node and enters line draw mode", async () => {
    const onFeaturesChange = vi.fn();
    const onFeatureSelectionChange = vi.fn();
    const onInteractionModeChange = vi.fn();
    const onVertexSelectionChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange,
        onFeatureSelectionChange,
        onViewStateChange: vi.fn(),
        onInteractionModeChange,
        onOverlayCornersChange: vi.fn(),
        onVertexSelectionChange,
      },
    );

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    const collection = lineFeatureCollection();
    const selectedFeature = collection.features[0];
    if (!selectedFeature) {
      throw new Error("Expected line feature");
    }

    controller.setFeatures(collection);
    map.emit("load");
    controller.setSelection(selectedFeature);
    draw.selectedIds = ["path-1"];
    draw.selectedPoints = [
      {
        type: "Feature",
        id: "vertex-1",
        geometry: {
          type: "Point",
          coordinates: [5.121, 52.091],
        },
        properties: {},
      },
    ];
    (draw.add as unknown as { mockClear: () => void }).mockClear();

    controller.forkPathAtNode();

    const addCalls = (
      draw.add as unknown as {
        mock: {
          calls: Array<[DrawFeature | { type: "FeatureCollection"; features: DrawFeature[] }]>;
        };
      }
    ).mock.calls;
    const latestAdd = addCalls.at(-1)?.[0];
    expect(latestAdd).toBeDefined();
    if (!latestAdd) {
      throw new Error("Expected seed line feature to be added");
    }
    if (latestAdd.type !== "Feature") {
      throw new Error("Expected seeded feature input");
    }
    expect(latestAdd.geometry.type).toBe("LineString");
    expect(latestAdd.geometry.coordinates).toEqual([
      [5.121, 52.091],
      [5.121, 52.091],
    ]);

    const forkFeatureId = String(latestAdd.id);

    expect(draw.changeMode).toHaveBeenCalledWith(
      "draw_line_string",
      expect.objectContaining({
        featureId: forkFeatureId,
        from: [5.121, 52.091],
      }),
    );
    expect(onInteractionModeChange).toHaveBeenCalledWith("line");
    expect(onFeatureSelectionChange).toHaveBeenCalledWith(undefined);
    expect(onVertexSelectionChange).toHaveBeenCalledWith(false);

    const forkFeature = draw.get(forkFeatureId);
    expect(forkFeature).toBeDefined();
    if (!forkFeature || forkFeature.geometry.type !== "LineString") {
      throw new Error("Expected fork feature");
    }
    forkFeature.geometry.coordinates = [
      [5.121, 52.091],
      [5.121, 52.091],
      [5.125, 52.095],
    ];
    draw.features.set(forkFeatureId, forkFeature);

    map.emit("draw.update", {});

    expect(onFeaturesChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "path-1",
        }),
        expect.objectContaining({
          id: forkFeatureId,
          geometry: expect.objectContaining({
            type: "LineString",
          }),
        }),
      ]),
    );

    draw.mode = "simple_select";
    map.emit("draw.create", {});

    expect(onFeaturesChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "path-1",
        }),
        expect.objectContaining({
          id: forkFeatureId,
          geometry: expect.objectContaining({
            type: "LineString",
            coordinates: [
              [5.121, 52.091],
              [5.125, 52.095],
            ],
          }),
        }),
      ]),
    );

    controller.destroy();
  });

  it("does not reset fork continuation when external line mode sync runs", async () => {
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
        onVertexSelectionChange: vi.fn(),
      },
    );

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    const collection = lineFeatureCollection();
    const selectedFeature = collection.features[0];
    if (!selectedFeature) {
      throw new Error("Expected line feature");
    }

    controller.setFeatures(collection);
    map.emit("load");
    controller.setSelection(selectedFeature);
    draw.selectedIds = ["path-1"];
    draw.selectedPoints = [
      {
        type: "Feature",
        id: "vertex-1",
        geometry: {
          type: "Point",
          coordinates: [5.121, 52.091],
        },
        properties: {},
      },
    ];

    controller.forkPathAtNode();
    (draw.changeMode as unknown as { mockClear: () => void }).mockClear();

    controller.setInteractionMode("line");

    expect(draw.changeMode).not.toHaveBeenCalled();
    expect(draw.mode).toBe("draw_line_string");

    controller.destroy();
  });

  it("does not replace in-progress fork line when external state enriches properties", async () => {
    let controller: Awaited<ReturnType<typeof createMapController>> | undefined;

    controller = await createMapController(document.createElement("div"), "fake-key", "basic-v2", {
      onFeaturesChange: (features) => {
        controller?.setFeatures({
          type: "FeatureCollection",
          features: features.map((feature) => ({
            ...feature,
            properties: {
              ...feature.properties,
              name:
                typeof feature.properties.name === "string" && feature.properties.name.length > 0
                  ? feature.properties.name
                  : "Path",
            },
          })),
        });
      },
      onFeatureSelectionChange: vi.fn(),
      onViewStateChange: vi.fn(),
      onInteractionModeChange: vi.fn(),
      onOverlayCornersChange: vi.fn(),
      onVertexSelectionChange: vi.fn(),
    });

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    const collection = lineFeatureCollection();
    const selectedFeature = collection.features[0];
    if (!selectedFeature) {
      throw new Error("Expected line feature");
    }

    controller.setFeatures(collection);
    map.emit("load");
    controller.setSelection(selectedFeature);
    draw.selectedIds = ["path-1"];
    draw.selectedPoints = [
      {
        type: "Feature",
        id: "vertex-1",
        geometry: {
          type: "Point",
          coordinates: [5.121, 52.091],
        },
        properties: {},
      },
    ];

    controller.forkPathAtNode();

    const addCalls = (
      draw.add as unknown as {
        mock: {
          calls: Array<[DrawFeature | { type: "FeatureCollection"; features: DrawFeature[] }]>;
        };
      }
    ).mock.calls;
    const latestAdd = addCalls.at(-1)?.[0];
    if (!latestAdd || latestAdd.type !== "Feature") {
      throw new Error("Expected seeded feature input");
    }
    const forkFeatureId = String(latestAdd.id);

    draw.add.mockClear();
    draw.delete.mockClear();

    const forkFeature = draw.get(forkFeatureId);
    expect(forkFeature).toBeDefined();
    if (!forkFeature || forkFeature.geometry.type !== "LineString") {
      throw new Error("Expected fork feature");
    }
    forkFeature.geometry.coordinates = [
      [5.121, 52.091],
      [5.121, 52.091],
      [5.125, 52.095],
    ];
    draw.features.set(forkFeatureId, forkFeature);

    map.emit("draw.update", {});

    expect(draw.mode).toBe("draw_line_string");
    expect(draw.delete).not.toHaveBeenCalled();
    expect(draw.add).not.toHaveBeenCalled();

    const persistedForkFeature = draw.get(forkFeatureId);
    expect(persistedForkFeature).toBeDefined();
    if (!persistedForkFeature || persistedForkFeature.geometry.type !== "LineString") {
      throw new Error("Expected persisted fork feature");
    }
    expect(persistedForkFeature.geometry.coordinates).toEqual([
      [5.121, 52.091],
      [5.121, 52.091],
      [5.125, 52.095],
    ]);

    controller.destroy();
  });

  it("forks from last selected line node when vertex selection blurs", async () => {
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
        onVertexSelectionChange: vi.fn(),
      },
    );

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    const collection = lineFeatureCollection();
    const selectedFeature = collection.features[0];
    if (!selectedFeature) {
      throw new Error("Expected line feature");
    }

    controller.setFeatures(collection);
    map.emit("load");
    controller.setSelection(selectedFeature);
    draw.selectedIds = ["path-1"];
    draw.selectedPoints = [
      {
        type: "Feature",
        id: "vertex-1",
        geometry: {
          type: "Point",
          coordinates: [5.121, 52.091],
        },
        properties: {},
      },
    ];
    map.emit("draw.update", {});
    draw.selectedPoints = [];
    (draw.add as unknown as { mockClear: () => void }).mockClear();

    controller.forkPathAtNode();

    expect(draw.add).toHaveBeenCalled();
    expect(draw.changeMode).toHaveBeenCalledWith(
      "draw_line_string",
      expect.objectContaining({
        from: [5.121, 52.091],
      }),
    );

    controller.destroy();
  });

  it("does not crash when selected vertex probing fails during draw.update", async () => {
    const onVertexSelectionChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
        onVertexSelectionChange,
      },
    );

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    map.emit("load");
    draw.getSelectedPoints.mockImplementationOnce(() => {
      throw new Error("JSON.parse failure");
    });

    expect(() => map.emit("draw.update", {})).not.toThrow();
    expect(onVertexSelectionChange).toHaveBeenCalledWith(false);

    controller.destroy();
  });

  it("keeps draw mode when clicking a persisted feature", async () => {
    const onFeatureSelectionChange = vi.fn();
    const onInteractionModeChange = vi.fn();

    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange,
        onViewStateChange: vi.fn(),
        onInteractionModeChange,
        onOverlayCornersChange: vi.fn(),
      },
    );

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

    expect(onInteractionModeChange).not.toHaveBeenCalledWith("select");
    expect(onFeatureSelectionChange).not.toHaveBeenCalledWith("f1");

    controller.destroy();
  });

  it("keeps draw mode when clicking non-persisted draw features", async () => {
    const onFeatureSelectionChange = vi.fn();
    const onInteractionModeChange = vi.fn();

    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange,
        onViewStateChange: vi.fn(),
        onInteractionModeChange,
        onOverlayCornersChange: vi.fn(),
      },
    );

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map instance");
    }

    controller.setFeatures(pointFeatureCollection());
    map.emit("load");
    controller.setInteractionMode("polygon");

    map.queryRenderedFeatures.mockReturnValueOnce([
      {
        id: "draft-shape",
        properties: {
          meta: "feature",
        },
      },
    ] as never);

    map.emit("click", {
      point: { x: 4, y: 5 },
    });

    expect(onInteractionModeChange).not.toHaveBeenCalledWith("select");
    expect(onFeatureSelectionChange).not.toHaveBeenCalledWith("draft-shape");

    controller.destroy();
  });

  it("does not reset direct_select when clicking a vertex handle", async () => {
    const onFeatureSelectionChange = vi.fn();
    const onVertexSelectionChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange,
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
        onVertexSelectionChange,
      },
    );

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    const collection = lineFeatureCollection();
    const selectedFeature = collection.features[0];
    if (!selectedFeature) {
      throw new Error("Expected line feature");
    }

    controller.setFeatures(collection);
    map.emit("load");
    controller.setInteractionMode("select");
    controller.setSelection(selectedFeature);
    draw.changeMode("direct_select", { featureId: "path-1" });
    draw.selectedPoints = [
      {
        type: "Feature",
        id: "vertex-1",
        geometry: {
          type: "Point",
          coordinates: [5.121, 52.091],
        },
        properties: {
          parent: "path-1",
          coord_path: "1",
          meta: "vertex",
        },
      },
    ];
    (draw.changeMode as unknown as { mockClear: () => void }).mockClear();
    onFeatureSelectionChange.mockClear();

    map.queryRenderedFeatures.mockReturnValueOnce([
      {
        id: "vertex-1",
        properties: {
          meta: "vertex",
        },
      },
      {
        id: "path-1",
        properties: {
          meta: "feature",
        },
      },
    ] as never);

    map.emit("click", {
      point: { x: 10, y: 12 },
    });

    expect(draw.changeMode).not.toHaveBeenCalled();
    expect(onFeatureSelectionChange).not.toHaveBeenCalled();
    expect(onVertexSelectionChange).toHaveBeenCalledWith(true);

    controller.destroy();
  });

  it("enters direct_select on first click for non-point features in select mode", async () => {
    const onFeatureSelectionChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange,
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    controller.setFeatures(polygonFeatureCollection());
    map.emit("load");
    controller.setInteractionMode("select");

    map.queryRenderedFeatures.mockReturnValueOnce([
      {
        id: "shape-1",
        properties: {
          meta: "feature",
        },
      },
    ] as never);

    map.emit("click", {
      point: { x: 10, y: 12 },
    });

    expect(draw.mode).toBe("direct_select");
    expect(draw.selectedIds).toEqual(["shape-1"]);
    expect(onFeatureSelectionChange).toHaveBeenCalledWith("shape-1");

    controller.destroy();
  });

  it("does not enter direct_select when clicking a locked feature", async () => {
    const onFeatureSelectionChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange,
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    controller.setFeatures(polygonFeatureCollection());
    map.emit("load");
    controller.setLockedFeatureIds(["shape-1"]);
    controller.setInteractionMode("select");
    onFeatureSelectionChange.mockClear();

    map.queryRenderedFeatures.mockReturnValueOnce([
      {
        id: "shape-1",
        properties: {
          meta: "feature",
        },
      },
    ] as never);

    map.emit("click", {
      point: { x: 10, y: 12 },
    });

    expect(draw.mode).not.toBe("direct_select");
    expect(onFeatureSelectionChange).not.toHaveBeenCalledWith("shape-1");

    controller.destroy();
  });

  it("clears draw selection when a locked feature is selected", async () => {
    const onFeatureSelectionChange = vi.fn();
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange,
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    controller.setFeatures(polygonFeatureCollection());
    map.emit("load");
    controller.setLockedFeatureIds(["shape-1"]);
    onFeatureSelectionChange.mockClear();

    map.emit("draw.selectionchange", {
      features: [
        {
          type: "Feature",
          id: "shape-1",
          geometry: {
            type: "Polygon",
            coordinates: [],
          },
          properties: {},
        },
      ],
    });

    expect(draw.changeMode).toHaveBeenCalledWith("simple_select", {
      featureIds: [],
    });
    expect(onFeatureSelectionChange).toHaveBeenCalledWith(undefined);

    controller.destroy();
  });

  it("preserves direct_select during draw-driven state sync", async () => {
    let controller: Awaited<ReturnType<typeof createMapController>> | undefined;
    const collection = polygonFeatureCollection();
    const selectedFeature = collection.features[0];
    if (!selectedFeature) {
      throw new Error("Expected polygon feature");
    }

    controller = await createMapController(document.createElement("div"), "fake-key", "basic-v2", {
      onFeaturesChange: (features) => {
        controller?.setFeatures({
          type: "FeatureCollection",
          features,
        });
      },
      onFeatureSelectionChange: vi.fn(),
      onViewStateChange: vi.fn(),
      onInteractionModeChange: vi.fn(),
      onOverlayCornersChange: vi.fn(),
    });

    const map = lastMockMap;
    const draw = lastMockDraw;
    expect(map).toBeDefined();
    expect(draw).toBeDefined();
    if (!map || !draw) {
      throw new Error("Expected map and draw instances");
    }

    controller.setFeatures(collection);
    map.emit("load");
    controller.setSelection(selectedFeature);
    draw.changeMode("direct_select", { featureId: "shape-1" });
    (draw.changeMode as unknown as { mockClear: () => void }).mockClear();

    map.emit("draw.update", {});

    expect(draw.mode).toBe("direct_select");
    const switchedToSimpleSelect = (
      draw.changeMode as unknown as { mock: { calls: Array<[string, unknown?]> } }
    ).mock.calls.some(([mode]) => mode === "simple_select");
    expect(switchedToSimpleSelect).toBe(false);

    controller.destroy();
  });

  it("recenters map when setView is called", async () => {
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map instance");
    }

    controller.setView([4.892222, 52.373056], 16);

    expect(map.flyTo).toHaveBeenCalledWith({
      center: [4.892222, 52.373056],
      curve: 1.5,
      essential: true,
      speed: 1,
      zoom: 16,
    });
  });

  it("updates cursor when hovering controllable draw elements", async () => {
    const controller = await createMapController(
      document.createElement("div"),
      "fake-key",
      "basic-v2",
      {
        onFeaturesChange: vi.fn(),
        onFeatureSelectionChange: vi.fn(),
        onViewStateChange: vi.fn(),
        onInteractionModeChange: vi.fn(),
        onOverlayCornersChange: vi.fn(),
      },
    );

    const map = lastMockMap;
    expect(map).toBeDefined();
    if (!map) {
      throw new Error("Expected map instance");
    }

    map.emit("load");
    controller.setInteractionMode("select");

    map.queryRenderedFeatures.mockReturnValueOnce([
      {
        properties: {
          meta: "feature",
        },
      },
    ] as never);
    map.emit("mousemove", {
      point: { x: 4, y: 5 },
    });
    expect(map.canvas.style.cursor).toBe("grab");

    map.queryRenderedFeatures.mockReturnValueOnce([
      {
        properties: {
          meta: "vertex",
        },
      },
    ] as never);
    map.emit("mousemove", {
      point: { x: 6, y: 7 },
    });
    expect(map.canvas.style.cursor).toBe("pointer");

    map.queryRenderedFeatures.mockReturnValueOnce([] as never);
    map.emit("mousemove", {
      point: { x: 8, y: 9 },
    });
    expect(map.canvas.style.cursor).toBe("");

    map.emit("mouseout");
    expect(map.canvas.style.cursor).toBe("");

    controller.destroy();
  });
});
