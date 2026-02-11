import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MockMapCanvas = ({
  mapStyleId,
  initialView,
  relocationRequest,
  features,
  overlay,
  onViewStateChange,
  onFeatureSelectionChange,
  onInteractionModeChange,
  onFeaturesChange,
  drawMode,
  snapEnabled: _snapEnabled,
  deleteRequestVersion,
}: {
  mapStyleId: string;
  initialView: {
    center: [number, number];
    zoom: number;
  };
  relocationRequest?: {
    center: [number, number];
    zoom?: number;
    requestVersion: number;
  };
  features: Array<{
    id: string;
  }>;
  overlay?: {
    floorId: string;
  };
  onViewStateChange: (center: [number, number], zoom: number) => void;
  onFeatureSelectionChange: (featureId: string | undefined) => void;
  onInteractionModeChange: (mode: "select" | "point" | "line" | "polygon") => void;
  onFeaturesChange: (
    features: Array<{
      type: "Feature";
      id: string;
      geometry: {
        type: "Point" | "LineString" | "Polygon";
        coordinates: unknown;
      };
      properties: Record<string, unknown>;
    }>,
  ) => void;
  drawMode: "select" | "point" | "line" | "polygon";
  snapEnabled: boolean;
  deleteRequestVersion: number;
  deleteVertexRequestVersion: number;
  splitPathRequestVersion: number;
  forkPathRequestVersion: number;
}) => {
  const lastRelocationVersionRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    onViewStateChange(initialView.center, initialView.zoom);
  }, [initialView, onViewStateChange]);

  useEffect(() => {
    if (!relocationRequest) {
      return;
    }

    if (lastRelocationVersionRef.current === relocationRequest.requestVersion) {
      return;
    }

    lastRelocationVersionRef.current = relocationRequest.requestVersion;
    onViewStateChange(relocationRequest.center, relocationRequest.zoom ?? initialView.zoom);
  }, [initialView.zoom, onViewStateChange, relocationRequest]);

  useEffect(() => {
    if (deleteRequestVersion < 1) {
      return;
    }

    onFeaturesChange([]);
  }, [deleteRequestVersion, onFeaturesChange]);

  return (
    <div data-testid="map-canvas">
      <div data-testid="mock-map-mode">{drawMode}</div>
      <div data-testid="mock-map-style">{mapStyleId}</div>
      <div data-testid="mock-map-feature-ids">
        {features.map((feature) => feature.id).join(",")}
      </div>
      <div data-testid="mock-map-overlay-floor">{overlay?.floorId ?? "none"}</div>
      <button
        type="button"
        data-testid="mock-map-select-feature"
        onClick={() => {
          onInteractionModeChange("select");
          onFeatureSelectionChange("shape-1");
        }}
      >
        select feature
      </button>
      <button
        type="button"
        data-testid="mock-map-create-line-feature"
        onClick={() => {
          onFeaturesChange([
            {
              type: "Feature",
              id: "path-draft-1",
              geometry: {
                type: "LineString",
                coordinates: [
                  [5.2, 52.2],
                  [5.201, 52.201],
                  [5.202, 52.202],
                ],
              },
              properties: {},
            },
          ]);
          onInteractionModeChange("select");
          onFeatureSelectionChange("path-draft-1");
        }}
      >
        create line feature
      </button>
      <button
        type="button"
        data-testid="mock-map-create-polygon-feature"
        onClick={() => {
          onFeaturesChange([
            {
              type: "Feature",
              id: "polygon-draft-1",
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [5.3, 52.3],
                    [5.301, 52.302],
                    [5.302, 52.3],
                    [5.3, 52.3],
                  ],
                ],
              },
              properties: {},
            },
          ]);
          onInteractionModeChange("select");
          onFeatureSelectionChange("polygon-draft-1");
        }}
      >
        create polygon feature
      </button>
    </div>
  );
};

vi.mock("./components/MapCanvas", () => ({
  MapCanvas: MockMapCanvas,
}));

const mockRepository = {
  loadProject: vi.fn(),
  saveProject: vi.fn().mockResolvedValue(undefined),
  listProjects: vi.fn().mockResolvedValue([]),
};

vi.mock("./lib/persistence/projectRepository", () => ({
  projectRepository: mockRepository,
}));

const mockMatchMedia = () => ({
  matches: false,
  media: "(prefers-color-scheme: dark)",
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

describe("App browser smoke", () => {
  const MAP_VIEW_STORAGE_KEY = "floorplan-editor-map-view";

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.removeItem(MAP_VIEW_STORAGE_KEY);
  });

  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation(mockMatchMedia as unknown as typeof window.matchMedia),
    });

    mockRepository.loadProject.mockReset();
    mockRepository.saveProject.mockClear();
    vi.stubEnv("VITE_MAPTILER_API_KEY", "fake-key");
    vi.stubEnv("VITE_OPENCAGE_API_KEY", "fake-open-cage-key");
  });

  it("renders successfully with valid configuration", async () => {
    mockRepository.loadProject.mockResolvedValue(undefined);

    const { default: App } = await import("./App");
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /formation floor plan editor/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toBeInTheDocument();
    expect(screen.getByLabelText(/basemap style/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/something went wrong\. please reload the editor\./i),
    ).not.toBeInTheDocument();
  });

  it("uses a non-building basemap by default and allows switching styles", async () => {
    mockRepository.loadProject.mockResolvedValue(undefined);

    const { default: App } = await import("./App");
    render(<App />);

    const styleSelect = screen.getByLabelText(/basemap style/i);
    expect(styleSelect).toHaveValue("basic-v2");
    expect(screen.getByTestId("mock-map-style")).toHaveTextContent("basic-v2");

    fireEvent.change(styleSelect, { target: { value: "hybrid" } });
    expect(screen.getByTestId("mock-map-style")).toHaveTextContent("hybrid");
  });

  it("restores map view from local storage on startup", async () => {
    mockRepository.loadProject.mockResolvedValue(undefined);
    window.localStorage.setItem(
      MAP_VIEW_STORAGE_KEY,
      JSON.stringify({
        center: [-73.9855, 40.758],
        zoom: 15.5,
      }),
    );

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Center: -73\.985500, 40\.758000/i)).toBeInTheDocument();
      expect(screen.getByText(/Zoom: 15\.50/i)).toBeInTheDocument();
    });
  });

  it("starts with no default building until add building is clicked", async () => {
    mockRepository.loadProject.mockResolvedValue(undefined);

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("No buildings.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /add building/i }));

    await waitFor(() => {
      const saveCalls = mockRepository.saveProject.mock.calls;
      expect(saveCalls.length).toBeGreaterThan(0);
      const latestSnapshot = saveCalls.at(-1)?.[0] as {
        buildings: Array<{ id: string; location?: [number, number] }>;
        floors: Array<{ id: string; buildingId: string }>;
      };

      expect(latestSnapshot.buildings).toHaveLength(1);
      expect(latestSnapshot.buildings[0]?.location).toEqual([5.1214, 52.0907]);
      expect(latestSnapshot.floors).toHaveLength(1);
      expect(latestSnapshot.floors[0]?.buildingId).toBe(latestSnapshot.buildings[0]?.id);
    });
  });

  it("searches addresses and recenters the map when selecting a result", async () => {
    mockRepository.loadProject.mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [
              {
                formatted: "Times Square, Manhattan, New York, NY, USA",
                geometry: {
                  lat: 40.758,
                  lng: -73.9855,
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      ),
    );

    const { default: App } = await import("./App");
    render(<App />);

    const input = screen.getByRole("textbox", { name: /search map address/i });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "times square" } });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /times square/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("option", { name: /times square/i }));

    expect(screen.getByText(/Center: -73\.985500, 40\.758000/i)).toBeInTheDocument();
  });

  it("recenters the map when selecting building, floor, or feature in the tree", async () => {
    mockRepository.loadProject.mockResolvedValue({
      id: "default-project",
      name: "tree recenter",
      version: 3,
      updatedAt: "2026-02-10T00:00:00.000Z",
      buildings: [{ id: "building-1", name: "HQ Building", location: [1, 2] }],
      floors: [{ id: "floor-1", buildingId: "building-1", name: "Ground Floor" }],
      features: [
        {
          type: "Feature",
          id: "shape-1",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.12, 52.09],
                [5.13, 52.09],
                [5.13, 52.1],
                [5.12, 52.1],
                [5.12, 52.09],
              ],
            ],
          },
          properties: { kind: "unit", floorId: "floor-1", name: "Room A" },
        },
      ],
      overlays: [],
    });

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "HQ Building" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "HQ Building" }));
    await waitFor(() => {
      expect(screen.getByText(/Center: 1\.000000, 2\.000000/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Ground Floor" }));
    await waitFor(() => {
      expect(screen.getByText(/Center: 5\.125000, 52\.095000/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Room A" }));
    await waitFor(() => {
      expect(screen.getByText(/Center: 5\.125000, 52\.095000/i)).toBeInTheDocument();
    });
  });

  it("keeps only selected floor features and overlay active when selecting from tree", async () => {
    mockRepository.loadProject.mockResolvedValue({
      id: "default-project",
      name: "floor activation",
      version: 3,
      updatedAt: "2026-02-10T00:00:00.000Z",
      buildings: [{ id: "building-1", name: "HQ Building", location: [1, 2] }],
      floors: [
        { id: "floor-1", buildingId: "building-1", name: "Ground Floor" },
        { id: "floor-2", buildingId: "building-1", name: "First Floor" },
      ],
      features: [
        {
          type: "Feature",
          id: "shape-ground",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.12, 52.09],
                [5.13, 52.09],
                [5.13, 52.1],
                [5.12, 52.1],
                [5.12, 52.09],
              ],
            ],
          },
          properties: { kind: "unit", floorId: "floor-1", name: "Ground Room" },
        },
        {
          type: "Feature",
          id: "shape-first",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.14, 52.09],
                [5.15, 52.09],
                [5.15, 52.1],
                [5.14, 52.1],
                [5.14, 52.09],
              ],
            ],
          },
          properties: { kind: "unit", floorId: "floor-2", name: "First Room" },
        },
      ],
      overlays: [
        {
          id: "overlay-1",
          floorId: "floor-1",
          imageName: "ground.png",
          imageDataUrl: "data:image/png;base64,abc",
          opacity: 70,
          visible: true,
          locked: false,
          corners: {
            topLeft: [5.119, 52.101],
            topRight: [5.131, 52.101],
            bottomRight: [5.131, 52.089],
            bottomLeft: [5.119, 52.089],
          },
          updatedAt: "2026-02-10T00:00:00.000Z",
        },
        {
          id: "overlay-2",
          floorId: "floor-2",
          imageName: "first.png",
          imageDataUrl: "data:image/png;base64,def",
          opacity: 70,
          visible: true,
          locked: false,
          corners: {
            topLeft: [5.139, 52.101],
            topRight: [5.151, 52.101],
            bottomRight: [5.151, 52.089],
            bottomLeft: [5.139, 52.089],
          },
          updatedAt: "2026-02-10T00:00:00.000Z",
        },
      ],
    });

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ground Floor" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "First Floor" })).toBeInTheDocument();
    });

    expect(screen.getByTestId("mock-map-feature-ids")).toHaveTextContent("shape-ground");
    expect(screen.getByTestId("mock-map-feature-ids")).not.toHaveTextContent("shape-first");
    expect(screen.getByTestId("mock-map-overlay-floor")).toHaveTextContent("floor-1");

    fireEvent.change(screen.getByRole("combobox", { name: /paths/i }), {
      target: { value: "opening" },
    });
    expect(screen.getByTestId("mock-map-mode")).toHaveTextContent("line");

    fireEvent.click(screen.getByRole("button", { name: "First Floor" }));

    await waitFor(() => {
      expect(screen.getByTestId("mock-map-mode")).toHaveTextContent("select");
    });
    expect(screen.getByTestId("mock-map-feature-ids")).toHaveTextContent("shape-first");
    expect(screen.getByTestId("mock-map-feature-ids")).not.toHaveTextContent("shape-ground");
    expect(screen.getByTestId("mock-map-overlay-floor")).toHaveTextContent("floor-2");

    fireEvent.click(screen.getByRole("button", { name: "Ground Room" }));
    expect(screen.getByTestId("mock-map-feature-ids")).toHaveTextContent("shape-ground");
    expect(screen.getByTestId("mock-map-overlay-floor")).toHaveTextContent("floor-1");
  });

  it("renders when matchMedia is unavailable", async () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: undefined,
    });

    mockRepository.loadProject.mockResolvedValue(undefined);

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /formation floor plan editor/i }),
      ).toBeInTheDocument();
    });
  });

  it("sanitizes malformed persisted data instead of crashing", async () => {
    mockRepository.loadProject.mockResolvedValue({
      id: "default-project",
      name: "bad project",
      version: 1,
      updatedAt: "2026-02-06T00:00:00.000Z",
      buildings: [{ id: "b1", name: "Building" }],
      floors: [{ id: "f1", buildingId: "b1", name: "Floor" }],
      features: [
        {
          type: "Feature",
          id: "invalid-polygon",
          geometry: {
            type: "Polygon",
            coordinates: [[[5.1, 52.1]]],
          },
          properties: { kind: "unit" },
        },
      ],
      overlays: [
        {
          id: "overlay-1",
          floorId: "f1",
          imageName: "bad.png",
          imageDataUrl: "data:image/png;base64,abc",
          opacity: 50,
          corners: {
            topLeft: ["bad", 0],
            topRight: [1, 0],
            bottomRight: [1, -1],
            bottomLeft: [0, -1],
          },
          updatedAt: "2026-02-06T00:00:00.000Z",
        },
      ],
    });

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /formation floor plan editor/i }),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByText(/something went wrong\. please reload the editor\./i),
    ).not.toBeInTheDocument();
  });

  it("selects clicked map feature even when draw mode is active", async () => {
    mockRepository.loadProject.mockResolvedValue({
      id: "default-project",
      name: "test project",
      version: 3,
      updatedAt: "2026-02-09T00:00:00.000Z",
      buildings: [{ id: "building-1", name: "Building 1" }],
      floors: [{ id: "floor-1", buildingId: "building-1", name: "Ground Floor" }],
      features: [
        {
          type: "Feature",
          id: "shape-1",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.121, 52.091],
                [5.122, 52.091],
                [5.122, 52.09],
                [5.121, 52.09],
                [5.121, 52.091],
              ],
            ],
          },
          properties: { kind: "unit", floorId: "floor-1", name: "Test unit" },
        },
      ],
      overlays: [],
    });

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /paths/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox", { name: /paths/i }), {
      target: { value: "opening" },
    });
    fireEvent.click(screen.getByTestId("mock-map-select-feature"));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /unit/i })).toBeInTheDocument();
      expect(screen.getByDisplayValue(/test unit/i)).toBeInTheDocument();
    });
  });

  it("toggles snap mode from the toolbar", async () => {
    mockRepository.loadProject.mockResolvedValue(undefined);

    const { default: App } = await import("./App");
    render(<App />);

    const snapToggle = await screen.findByRole("button", { name: /toggle snap to geometry/i });
    expect(snapToggle).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(snapToggle);
    expect(snapToggle).toHaveAttribute("aria-pressed", "false");
  });

  it("applies draw-driven deletes from keyboard", async () => {
    mockRepository.loadProject.mockResolvedValue({
      id: "default-project",
      name: "test project",
      version: 3,
      updatedAt: "2026-02-09T00:00:00.000Z",
      buildings: [{ id: "building-1", name: "Building 1" }],
      floors: [{ id: "floor-1", buildingId: "building-1", name: "Ground Floor" }],
      features: [
        {
          type: "Feature",
          id: "shape-1",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.121, 52.091],
                [5.122, 52.091],
                [5.122, 52.09],
                [5.121, 52.09],
                [5.121, 52.091],
              ],
            ],
          },
          properties: { kind: "unit", floorId: "floor-1", name: "Test unit" },
        },
      ],
      overlays: [],
    });

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("mock-map-select-feature")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("mock-map-select-feature"));
    fireEvent.keyDown(window, { key: "Delete" });

    await waitFor(() => {
      const saveCalls = mockRepository.saveProject.mock.calls;
      expect(saveCalls.length).toBeGreaterThan(0);
      const latestSnapshot = saveCalls.at(-1)?.[0] as {
        features: Array<{
          id: string;
        }>;
      };

      expect(latestSnapshot.features).toHaveLength(0);
    });
  });

  it("starts path creation in line sketch mode and keeps sketch coordinates", async () => {
    mockRepository.loadProject.mockResolvedValue(undefined);

    const { default: App } = await import("./App");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /add building/i }));

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /paths/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox", { name: /paths/i }), {
      target: { value: "opening" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("mock-map-mode")).toHaveTextContent("line");
    });

    fireEvent.click(screen.getByTestId("mock-map-create-line-feature"));

    await waitFor(() => {
      const saveCalls = mockRepository.saveProject.mock.calls;
      expect(saveCalls.length).toBeGreaterThan(0);
      const latestSnapshot = saveCalls.at(-1)?.[0] as {
        features: Array<{
          id: string;
          geometry: {
            type: "LineString";
            coordinates: number[][];
          };
          properties: {
            kind?: string;
            name?: string;
          };
        }>;
      };
      expect(latestSnapshot.features).toHaveLength(1);
      expect(latestSnapshot.features[0]?.id).toBe("path-draft-1");
      expect(latestSnapshot.features[0]?.geometry.coordinates).toEqual([
        [5.2, 52.2],
        [5.201, 52.201],
        [5.202, 52.202],
      ]);
      expect(latestSnapshot.features[0]?.properties.kind).toBe("opening");
      expect(latestSnapshot.features[0]?.properties.name).toBe("Opening");
    });
  });

  it("starts polygon creation in polygon sketch mode and preserves selected polygon type", async () => {
    mockRepository.loadProject.mockResolvedValue(undefined);

    const { default: App } = await import("./App");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /add building/i }));

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /areas/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox", { name: /areas/i }), {
      target: { value: "section" },
    });

    await waitFor(() => {
      expect(screen.getByTestId("mock-map-mode")).toHaveTextContent("polygon");
    });

    fireEvent.click(screen.getByTestId("mock-map-create-polygon-feature"));

    await waitFor(() => {
      const saveCalls = mockRepository.saveProject.mock.calls;
      expect(saveCalls.length).toBeGreaterThan(0);
      const latestSnapshot = saveCalls.at(-1)?.[0] as {
        features: Array<{
          id: string;
          geometry: {
            type: "Polygon";
            coordinates: number[][][];
          };
          properties: {
            kind?: string;
            name?: string;
          };
        }>;
      };
      expect(latestSnapshot.features).toHaveLength(1);
      expect(latestSnapshot.features[0]?.id).toBe("polygon-draft-1");
      expect(latestSnapshot.features[0]?.geometry.coordinates).toEqual([
        [
          [5.3, 52.3],
          [5.301, 52.302],
          [5.302, 52.3],
          [5.3, 52.3],
        ],
      ]);
      expect(latestSnapshot.features[0]?.properties.kind).toBe("section");
      expect(latestSnapshot.features[0]?.properties.name).toBe("Section");
    });
  });

  it("allows deleting the last floor and cascades floor data", async () => {
    mockRepository.loadProject.mockResolvedValue({
      id: "default-project",
      name: "test project",
      version: 3,
      updatedAt: "2026-02-09T00:00:00.000Z",
      buildings: [{ id: "building-1", name: "HQ Building" }],
      floors: [{ id: "floor-1", buildingId: "building-1", name: "Ground Floor" }],
      features: [
        {
          type: "Feature",
          id: "shape-1",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.121, 52.091],
                [5.122, 52.091],
                [5.122, 52.09],
                [5.121, 52.09],
                [5.121, 52.091],
              ],
            ],
          },
          properties: { kind: "unit", floorId: "floor-1", name: "Test unit" },
        },
      ],
      overlays: [
        {
          id: "overlay-1",
          floorId: "floor-1",
          imageName: "ground.png",
          imageDataUrl: "data:image/png;base64,abc",
          opacity: 70,
          visible: true,
          locked: false,
          corners: {
            topLeft: [5.12, 52.1],
            topRight: [5.13, 52.1],
            bottomRight: [5.13, 52.09],
            bottomLeft: [5.12, 52.09],
          },
          updatedAt: "2026-02-09T00:00:00.000Z",
        },
      ],
    });

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /delete floor/i })).toBeInTheDocument();
    });

    const deleteFloorButton = screen.getByRole("button", { name: /delete floor/i });
    expect(deleteFloorButton).not.toBeDisabled();
    fireEvent.click(deleteFloorButton);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    await waitFor(() => {
      const saveCalls = mockRepository.saveProject.mock.calls;
      expect(saveCalls.length).toBeGreaterThan(0);
      const latestSnapshot = saveCalls.at(-1)?.[0] as {
        buildings: Array<{ id: string }>;
        floors: Array<{ id: string }>;
        features: Array<{ id: string }>;
        overlays: Array<{ id: string }>;
      };

      expect(latestSnapshot.buildings.map((building) => building.id)).toEqual(["building-1"]);
      expect(latestSnapshot.floors).toHaveLength(0);
      expect(latestSnapshot.features).toHaveLength(0);
      expect(latestSnapshot.overlays).toHaveLength(0);
    });
  });

  it("clones a floor and remaps feature references to new ids", async () => {
    mockRepository.loadProject.mockResolvedValue({
      id: "default-project",
      name: "test project",
      version: 3,
      updatedAt: "2026-02-09T00:00:00.000Z",
      buildings: [{ id: "building-1", name: "HQ Building" }],
      floors: [{ id: "floor-1", buildingId: "building-1", name: "Ground Floor" }],
      features: [
        {
          type: "Feature",
          id: "unit-1",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.121, 52.091],
                [5.122, 52.091],
                [5.122, 52.09],
                [5.121, 52.09],
                [5.121, 52.091],
              ],
            ],
          },
          properties: { kind: "unit", floorId: "floor-1", name: "Room A" },
        },
        {
          type: "Feature",
          id: "relationship-1",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.121, 52.091],
              [5.122, 52.09],
            ],
          },
          properties: {
            kind: "relationship",
            floorId: "floor-1",
            origin_id: "unit-1",
            destination_id: "unit-1",
            linked_feature_ids: ["unit-1", "relationship-1"],
            metadata: {
              sourceFloor: "floor-1",
              sourceFeature: "relationship-1",
            },
          },
        },
      ],
      overlays: [],
    });

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /clone floor/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /clone floor/i }));
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    await waitFor(() => {
      const saveCalls = mockRepository.saveProject.mock.calls;
      expect(saveCalls.length).toBeGreaterThan(0);
      const latestSnapshot = saveCalls.at(-1)?.[0] as {
        floors: Array<{ id: string; buildingId: string; name: string }>;
        features: Array<{
          id: string;
          properties: {
            floorId?: string;
            kind?: string;
            origin_id?: string;
            destination_id?: string;
            linked_feature_ids?: string[];
            metadata?: unknown;
          };
        }>;
      };

      expect(latestSnapshot.floors).toHaveLength(2);
      const clonedFloor = latestSnapshot.floors.find((floor) => floor.id !== "floor-1");
      expect(clonedFloor).toBeDefined();
      expect(clonedFloor?.name).toMatch(/^Ground Floor copy/);
      expect(clonedFloor?.buildingId).toBe("building-1");

      const clonedFloorFeatures = latestSnapshot.features.filter(
        (feature) => feature.properties.floorId === clonedFloor?.id,
      );
      expect(clonedFloorFeatures).toHaveLength(2);

      const clonedUnit = clonedFloorFeatures.find((feature) => feature.properties.kind === "unit");
      const clonedRelationship = clonedFloorFeatures.find(
        (feature) => typeof feature.properties.origin_id === "string",
      );
      expect(clonedUnit).toBeDefined();
      expect(clonedRelationship).toBeDefined();
      expect(clonedUnit?.id).not.toBe("unit-1");
      expect(clonedRelationship?.id).not.toBe("relationship-1");
      expect(clonedRelationship?.properties.origin_id).toBe(clonedUnit?.id);
      expect(clonedRelationship?.properties.destination_id).toBe(clonedUnit?.id);
      expect(clonedRelationship?.properties.linked_feature_ids).toEqual([
        clonedUnit?.id,
        clonedRelationship?.id,
      ]);
      expect(clonedRelationship?.properties.metadata).toEqual({
        sourceFloor: clonedFloor?.id,
        sourceFeature: clonedRelationship?.id,
      });
    });
  });

  it("allows deleting the last building and cascades floors and floor data", async () => {
    mockRepository.loadProject.mockResolvedValue({
      id: "default-project",
      name: "test project",
      version: 3,
      updatedAt: "2026-02-09T00:00:00.000Z",
      buildings: [{ id: "building-1", name: "HQ Building" }],
      floors: [{ id: "floor-1", buildingId: "building-1", name: "Ground Floor" }],
      features: [
        {
          type: "Feature",
          id: "shape-1",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.121, 52.091],
                [5.122, 52.091],
                [5.122, 52.09],
                [5.121, 52.09],
                [5.121, 52.091],
              ],
            ],
          },
          properties: { kind: "unit", floorId: "floor-1", name: "Test unit" },
        },
      ],
      overlays: [
        {
          id: "overlay-1",
          floorId: "floor-1",
          imageName: "ground.png",
          imageDataUrl: "data:image/png;base64,abc",
          opacity: 70,
          visible: true,
          locked: false,
          corners: {
            topLeft: [5.12, 52.1],
            topRight: [5.13, 52.1],
            bottomRight: [5.13, 52.09],
            bottomLeft: [5.12, 52.09],
          },
          updatedAt: "2026-02-09T00:00:00.000Z",
        },
      ],
    });

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "HQ Building" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "HQ Building" }));
    const deleteBuildingButton = screen.getByRole("button", { name: /delete building/i });
    expect(deleteBuildingButton).not.toBeDisabled();
    fireEvent.click(deleteBuildingButton);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    await waitFor(() => {
      const saveCalls = mockRepository.saveProject.mock.calls;
      expect(saveCalls.length).toBeGreaterThan(0);
      const latestSnapshot = saveCalls.at(-1)?.[0] as {
        buildings: Array<{ id: string }>;
        floors: Array<{ id: string }>;
        features: Array<{ id: string }>;
        overlays: Array<{ id: string }>;
      };

      expect(latestSnapshot.buildings).toHaveLength(0);
      expect(latestSnapshot.floors).toHaveLength(0);
      expect(latestSnapshot.features).toHaveLength(0);
      expect(latestSnapshot.overlays).toHaveLength(0);
    });
  });

  it("supports undo after deleting a floor from the shared undo button", async () => {
    mockRepository.loadProject.mockResolvedValue({
      id: "default-project",
      name: "test project",
      version: 3,
      updatedAt: "2026-02-09T00:00:00.000Z",
      buildings: [{ id: "building-1", name: "HQ Building" }],
      floors: [{ id: "floor-1", buildingId: "building-1", name: "Ground Floor" }],
      features: [
        {
          type: "Feature",
          id: "shape-1",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.121, 52.091],
                [5.122, 52.091],
                [5.122, 52.09],
                [5.121, 52.09],
                [5.121, 52.091],
              ],
            ],
          },
          properties: { kind: "unit", floorId: "floor-1", name: "Test unit" },
        },
      ],
      overlays: [],
    });

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /delete floor/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /delete floor/i }));
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      const saveCalls = mockRepository.saveProject.mock.calls;
      expect(saveCalls.length).toBeGreaterThan(0);
      const latestSnapshot = saveCalls.at(-1)?.[0] as {
        buildings: Array<{ id: string }>;
        floors: Array<{ id: string }>;
        features: Array<{ id: string }>;
      };

      expect(latestSnapshot.buildings.map((building) => building.id)).toEqual(["building-1"]);
      expect(latestSnapshot.floors.map((floor) => floor.id)).toEqual(["floor-1"]);
      expect(latestSnapshot.features.map((feature) => feature.id)).toEqual(["shape-1"]);
    });
  });

  it("supports keyboard redo for deleted floor", async () => {
    mockRepository.loadProject.mockResolvedValue({
      id: "default-project",
      name: "test project",
      version: 3,
      updatedAt: "2026-02-09T00:00:00.000Z",
      buildings: [{ id: "building-1", name: "HQ Building" }],
      floors: [{ id: "floor-1", buildingId: "building-1", name: "Ground Floor" }],
      features: [
        {
          type: "Feature",
          id: "shape-1",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [5.121, 52.091],
                [5.122, 52.091],
                [5.122, 52.09],
                [5.121, 52.09],
                [5.121, 52.091],
              ],
            ],
          },
          properties: { kind: "unit", floorId: "floor-1", name: "Test unit" },
        },
      ],
      overlays: [],
    });

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /delete floor/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /delete floor/i }));
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });

    await waitFor(() => {
      const saveCalls = mockRepository.saveProject.mock.calls;
      expect(saveCalls.length).toBeGreaterThan(0);
      const latestSnapshot = saveCalls.at(-1)?.[0] as {
        floors: Array<{ id: string }>;
      };
      expect(latestSnapshot.floors.map((floor) => floor.id)).toEqual(["floor-1"]);
    });

    fireEvent.keyDown(window, { key: "y", ctrlKey: true });

    await waitFor(() => {
      const saveCalls = mockRepository.saveProject.mock.calls;
      expect(saveCalls.length).toBeGreaterThan(0);
      const latestSnapshot = saveCalls.at(-1)?.[0] as {
        floors: Array<{ id: string }>;
      };
      expect(latestSnapshot.floors).toHaveLength(0);
    });
  });
});
