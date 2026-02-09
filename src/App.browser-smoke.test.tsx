import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const MockMapCanvas = ({
  onViewStateChange,
  onMapClick,
}: {
  onViewStateChange: (center: [number, number], zoom: number) => void;
  onMapClick: (payload: {
    coordinates: [number, number];
    featureId: string | undefined;
    vertexFeatureId: string | undefined;
    vertexIndex: number | undefined;
    midpointFeatureId: string | undefined;
    midpointAfterIndex: number | undefined;
  }) => void;
}) => {
  useEffect(() => {
    onViewStateChange([5.1214, 52.0907], 17);
  }, [onViewStateChange]);

  return (
    <div data-testid="map-canvas">
      <button
        type="button"
        data-testid="mock-map-select-feature"
        onClick={() =>
          onMapClick({
            coordinates: [5.1215, 52.0908],
            featureId: "shape-1",
            vertexFeatureId: undefined,
            vertexIndex: undefined,
            midpointFeatureId: undefined,
            midpointAfterIndex: undefined,
          })
        }
      >
        select feature
      </button>
      <button
        type="button"
        data-testid="mock-map-select-vertex"
        onClick={() =>
          onMapClick({
            coordinates: [5.122, 52.091],
            featureId: "shape-1",
            vertexFeatureId: "shape-1",
            vertexIndex: 1,
            midpointFeatureId: undefined,
            midpointAfterIndex: undefined,
          })
        }
      >
        select vertex
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

  it("deletes selected vertices before deleting selected features", async () => {
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
      expect(screen.getByTestId("mock-map-select-vertex")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("mock-map-select-vertex"));
    fireEvent.keyDown(window, { key: "Delete" });

    await waitFor(() => {
      const saveCalls = mockRepository.saveProject.mock.calls;
      expect(saveCalls.length).toBeGreaterThan(0);
      const latestSnapshot = saveCalls.at(-1)?.[0] as {
        features: Array<{
          geometry: {
            type: string;
            coordinates: number[][][];
          };
        }>;
      };

      expect(latestSnapshot.features).toHaveLength(1);
      expect(latestSnapshot.features[0]?.geometry.type).toBe("Polygon");
      expect(latestSnapshot.features[0]?.geometry.coordinates[0]).toHaveLength(4);
    });
  });
});
