import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const MockMapCanvas = ({
  onViewStateChange,
  onFeatureSelectionChange,
  onInteractionModeChange,
  onFeaturesChange,
  drawMode,
  deleteRequestVersion,
}: {
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
  deleteRequestVersion: number;
  deleteVertexRequestVersion: number;
  splitPathRequestVersion: number;
  forkPathRequestVersion: number;
}) => {
  useEffect(() => {
    onViewStateChange([5.1214, 52.0907], 17);
  }, [onViewStateChange]);

  useEffect(() => {
    if (deleteRequestVersion < 1) {
      return;
    }

    onFeaturesChange([]);
  }, [deleteRequestVersion, onFeaturesChange]);

  return (
    <div data-testid="map-canvas">
      <div data-testid="mock-map-mode">{drawMode}</div>
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
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation(mockMatchMedia as unknown as typeof window.matchMedia),
    });

    mockRepository.loadProject.mockReset();
    mockRepository.saveProject.mockClear();
    vi.stubEnv("VITE_MAPTILER_API_KEY", "fake-key");
  });

  it("renders successfully with valid configuration", async () => {
    mockRepository.loadProject.mockResolvedValue(undefined);

    const { default: App } = await import("./App");
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /formation floor plan editor/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("map-canvas")).toBeInTheDocument();
    expect(
      screen.queryByText(/something went wrong\. please reload the editor\./i),
    ).not.toBeInTheDocument();
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
      expect(screen.getByRole("button", { name: /draw line/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /draw line/i }));
    fireEvent.click(screen.getByTestId("mock-map-select-feature"));

    await waitFor(() => {
      expect(screen.getByText(/selected:/i)).toBeInTheDocument();
      expect(screen.getAllByText(/test unit/i).length).toBeGreaterThan(0);
    });
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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /draw path/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /draw path/i }));

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
      expect(latestSnapshot.features[0]?.properties.kind).toBe("path");
      expect(latestSnapshot.features[0]?.properties.name).toBe("Path");
    });
  });

  it("starts polygon creation in polygon sketch mode and preserves selected polygon type", async () => {
    mockRepository.loadProject.mockResolvedValue(undefined);

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /draw zone/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /draw zone/i }));

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
      expect(latestSnapshot.features[0]?.properties.kind).toBe("zone");
      expect(latestSnapshot.features[0]?.properties.name).toBe("Zone");
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
});
