import { render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const MockMapCanvas = ({
  onViewStateChange,
}: {
  onViewStateChange: (center: [number, number], zoom: number) => void;
}) => {
  useEffect(() => {
    onViewStateChange([5.1214, 52.0907], 17);
  }, [onViewStateChange]);

  return <div data-testid="map-canvas" />;
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
});
