import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { type DrawMode, MapCanvas } from "./components/MapCanvas";
import { EditorPanels } from "./features/editor/EditorPanels";
import { getRuntimeConfig } from "./lib/config/runtimeConfig";
import {
  createInitialEditorState,
  deleteSelectedFeature,
  type EditorState,
  redo,
  replaceAllFeatures,
  selectFeature,
  undo,
  updateFeature,
} from "./lib/editor/editorModel";
import { rotateAroundPoint } from "./lib/geometry/overlayTransforms";
import { createId } from "./lib/id";
import { clientLogger } from "./lib/logging/clientLogger";
import { projectRepository } from "./lib/persistence/projectRepository";
import { sanitizeProjectSnapshot } from "./lib/persistence/projectSnapshotSanitizer";
import type {
  Building,
  Coordinates,
  Floor,
  FloorFeature,
  FloorOverlay,
  GeometryType,
  OverlayCorners,
  ThemeId,
} from "./lib/types";

const THEME_STORAGE_KEY = "floorplan-editor-theme";
const PROJECT_ID = "default-project";

const isThemeId = (value: string | null): value is ThemeId =>
  value === "qr-light" || value === "qr-dark";

const getInitialTheme = (): ThemeId => {
  if (typeof window === "undefined") {
    return "qr-light";
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isThemeId(stored)) {
    return stored;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "qr-dark" : "qr-light";
};

const defaultBuilding = (): Building => ({ id: "building-1", name: "Building 1" });
const defaultFloor = (buildingId: string): Floor => ({
  id: "floor-1",
  buildingId,
  name: "Ground Floor",
});

type SaveStatus = "idle" | "saving" | "saved" | "error";

const cornersAroundView = (center: Coordinates, zoom: number): OverlayCorners => {
  const span = Math.max(0.00005, 0.02 / 2 ** Math.max(0, zoom - 14));
  return {
    topLeft: [center[0] - span, center[1] + span],
    topRight: [center[0] + span, center[1] + span],
    bottomRight: [center[0] + span, center[1] - span],
    bottomLeft: [center[0] - span, center[1] - span],
  };
};

const mapCorners = (
  corners: OverlayCorners,
  transform: (point: Coordinates) => Coordinates,
): OverlayCorners => ({
  topLeft: transform(corners.topLeft),
  topRight: transform(corners.topRight),
  bottomRight: transform(corners.bottomRight),
  bottomLeft: transform(corners.bottomLeft),
});

const overlayCenter = (corners: OverlayCorners): Coordinates => {
  const values = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  const sum = values.reduce<[number, number]>(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1]],
    [0, 0],
  );
  return [sum[0] / 4, sum[1] / 4];
};

const shiftCorners = (corners: OverlayCorners, dx: number, dy: number): OverlayCorners =>
  mapCorners(corners, (point) => [point[0] + dx, point[1] + dy]);

const scaleCorners = (corners: OverlayCorners, factor: number): OverlayCorners => {
  const center = overlayCenter(corners);
  return mapCorners(corners, (point) => [
    center[0] + (point[0] - center[0]) * factor,
    center[1] + (point[1] - center[1]) * factor,
  ]);
};

const rotateCorners = (corners: OverlayCorners, degrees: number): OverlayCorners => {
  const center = overlayCenter(corners);
  return mapCorners(corners, (point) => rotateAroundPoint(point, center, degrees));
};

const kindForGeometry = (geometryType: GeometryType): string => {
  if (geometryType === "Point") {
    return "amenity";
  }

  if (geometryType === "LineString") {
    return "path";
  }

  return "unit";
};

const nameForGeometry = (geometryType: GeometryType): string => {
  if (geometryType === "Point") {
    return "New point";
  }

  if (geometryType === "LineString") {
    return "New line";
  }

  return "New polygon";
};

const isFeatureOnSelectedFloor = (feature: FloorFeature, selectedFloorId: string): boolean =>
  feature.properties.floorId === selectedFloorId || !feature.properties.floorId;

const areFeatureListsEqual = (left: FloorFeature[], right: FloorFeature[]): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const saveEditorSnapshot = async (
  features: FloorFeature[],
  overlays: FloorOverlay[],
  buildings: Building[],
  floors: Floor[],
): Promise<void> => {
  await projectRepository.saveProject({
    id: PROJECT_ID,
    name: "Main project",
    version: 3,
    updatedAt: new Date().toISOString(),
    features,
    overlays,
    buildings,
    floors,
  });
};

function App() {
  const [theme, setTheme] = useState<ThemeId>(() => getInitialTheme());
  const [editorState, setEditorState] = useState<EditorState>(() => createInitialEditorState());
  const [overlays, setOverlays] = useState<FloorOverlay[]>([]);
  const [buildings, setBuildings] = useState<Building[]>(() => [defaultBuilding()]);
  const [floors, setFloors] = useState<Floor[]>(() => [defaultFloor(defaultBuilding().id)]);
  const [selectedBuildingId, setSelectedBuildingId] = useState(defaultBuilding().id);
  const [selectedFloorId, setSelectedFloorId] = useState(defaultFloor(defaultBuilding().id).id);
  const [drawMode, setDrawMode] = useState<DrawMode>("select");
  const [deleteRequestVersion, setDeleteRequestVersion] = useState(0);
  const [mapView, setMapView] = useState<{ center: Coordinates; zoom: number }>({
    center: [5.1214, 52.0907],
    zoom: 17,
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const runtimeConfig = getRuntimeConfig();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    void projectRepository.loadProject(PROJECT_ID).then((project) => {
      if (cancelled || !project) {
        return;
      }

      const sanitizedProject = sanitizeProjectSnapshot(project);

      const loadedBuildings = sanitizedProject.buildings?.length
        ? sanitizedProject.buildings
        : [defaultBuilding()];
      const primaryBuilding = loadedBuildings[0] ?? defaultBuilding();
      const loadedFloors = sanitizedProject.floors?.length
        ? sanitizedProject.floors
        : [defaultFloor(primaryBuilding.id)];
      const primaryFloor = loadedFloors[0] ?? defaultFloor(primaryBuilding.id);
      const defaultFloorId = primaryFloor.id;

      const migratedFeatures = sanitizedProject.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          floorId: feature.properties.floorId ?? defaultFloorId,
        },
      }));

      setEditorState(createInitialEditorState(migratedFeatures));
      setOverlays(sanitizedProject.overlays);
      setBuildings(loadedBuildings);
      setFloors(loadedFloors);
      setSelectedBuildingId(primaryBuilding.id);
      setSelectedFloorId(defaultFloorId);
      setSaveStatus("saved");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSaveStatus("saving");
      void saveEditorSnapshot(editorState.features, overlays, buildings, floors)
        .then(() => {
          setSaveStatus("saved");
        })
        .catch((error: unknown) => {
          clientLogger.error("persistence.save_failed", { error });
          setSaveStatus("error");
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [editorState.features, overlays, buildings, floors]);

  const visibleFeatures = useMemo(
    () =>
      editorState.features.filter(
        (feature) => feature.properties.floorId === selectedFloorId || !feature.properties.floorId,
      ),
    [editorState.features, selectedFloorId],
  );

  const selectedOverlay = useMemo(
    () => overlays.find((overlay) => overlay.floorId === selectedFloorId),
    [overlays, selectedFloorId],
  );

  const selectedFeature = useMemo(
    () => editorState.features.find((feature) => feature.id === editorState.selectedFeatureId),
    [editorState.features, editorState.selectedFeatureId],
  );

  const startDrawMode = useCallback((mode: DrawMode) => {
    setDrawMode(mode);
    if (mode !== "select") {
      setEditorState((current) => selectFeature(current, undefined));
    }
  }, []);

  const cancelDrawMode = useCallback(() => {
    setDrawMode("select");
  }, []);

  const deleteSelection = useCallback(() => {
    setDeleteRequestVersion((current) => current + 1);
  }, []);

  const onDrawFeaturesChange = useCallback(
    (featuresFromMap: FloorFeature[]) => {
      setEditorState((current) => {
        const currentVisible = current.features.filter((feature) =>
          isFeatureOnSelectedFloor(feature, selectedFloorId),
        );
        const currentVisibleById = new Map(currentVisible.map((feature) => [feature.id, feature]));

        const nextVisible = featuresFromMap.map((feature) => {
          const existing = currentVisibleById.get(feature.id);
          const mergedProperties = {
            ...(existing?.properties ?? {}),
            ...feature.properties,
          };

          return {
            ...feature,
            properties: {
              ...mergedProperties,
              floorId: mergedProperties.floorId ?? existing?.properties.floorId ?? selectedFloorId,
              kind:
                typeof mergedProperties.kind === "string" && mergedProperties.kind
                  ? mergedProperties.kind
                  : kindForGeometry(feature.geometry.type),
              name:
                typeof mergedProperties.name === "string" && mergedProperties.name
                  ? mergedProperties.name
                  : (existing?.properties.name ?? nameForGeometry(feature.geometry.type)),
            },
          };
        });

        if (areFeatureListsEqual(currentVisible, nextVisible)) {
          return current;
        }

        const nonVisible = current.features.filter(
          (feature) => !isFeatureOnSelectedFloor(feature, selectedFloorId),
        );
        const nextFeatures = [...nonVisible, ...nextVisible];
        const nextSelectedFeatureId =
          current.selectedFeatureId &&
          nextFeatures.some((feature) => feature.id === current.selectedFeatureId)
            ? current.selectedFeatureId
            : undefined;

        return selectFeature(replaceAllFeatures(current, nextFeatures), nextSelectedFeatureId);
      });
    },
    [selectedFloorId],
  );

  const onDrawSelectionChange = useCallback((featureId: string | undefined) => {
    setEditorState((current) => selectFeature(current, featureId));
  }, []);

  const onInteractionModeChange = useCallback((mode: DrawMode) => {
    setDrawMode(mode);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      if (tagName === "INPUT" || tagName === "TEXTAREA") {
        return;
      }

      const isMeta = event.ctrlKey || event.metaKey;

      if (event.key === "Escape") {
        event.preventDefault();
        cancelDrawMode();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelection();
        return;
      }

      if (!isMeta) {
        return;
      }

      if (event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        setEditorState((current) => redo(current));
        return;
      }

      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        setEditorState((current) => undo(current));
        return;
      }

      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        setEditorState((current) => redo(current));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [cancelDrawMode, deleteSelection]);

  const applyToCurrentOverlay = useCallback(
    (transform: (overlay: FloorOverlay) => FloorOverlay) => {
      setOverlays((current) =>
        current.map((overlay) => {
          if (overlay.floorId !== selectedFloorId || overlay.locked) {
            return overlay;
          }

          return transform(overlay);
        }),
      );
    },
    [selectedFloorId],
  );

  const onViewStateChange = useCallback((center: Coordinates, zoom: number) => {
    setMapView({ center, zoom });
  }, []);

  const uploadOverlayForCurrentFloor = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) {
          return;
        }

        setOverlays((current) => {
          const nextOverlay: FloorOverlay = {
            id: selectedOverlay?.id ?? createId(),
            floorId: selectedFloorId,
            imageName: file.name,
            imageDataUrl: dataUrl,
            opacity: selectedOverlay?.opacity ?? 70,
            visible: selectedOverlay?.visible ?? true,
            locked: false,
            corners: cornersAroundView(mapView.center, mapView.zoom),
            updatedAt: new Date().toISOString(),
          };

          const withoutCurrent = current.filter((overlay) => overlay.floorId !== selectedFloorId);
          return [...withoutCurrent, nextOverlay];
        });
      };
      reader.readAsDataURL(file);
    },
    [mapView.center, mapView.zoom, selectedFloorId, selectedOverlay],
  );

  if (!runtimeConfig.ok) {
    return (
      <main className="min-h-screen bg-base-200 p-6">
        <div className="mx-auto max-w-3xl">
          <div className="alert alert-error">
            <div>
              <h1 className="text-lg font-semibold">Configuration error</h1>
              <p>{runtimeConfig.error}</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <ErrorBoundary>
      <main className="min-h-screen bg-base-200 xl:h-screen">
        <div className="flex min-h-screen flex-col gap-4 p-4 xl:h-screen xl:min-h-0">
          <header className="navbar bg-base-100 shadow">
            <div className="flex-1">
              <h1 className="text-xl font-semibold">FORMATION Floor Plan Editor</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge badge-outline">{saveStatus}</span>
              <label className="swap swap-rotate rounded-box bg-base-200 p-2">
                <input
                  type="checkbox"
                  aria-label="Toggle theme"
                  checked={theme === "qr-dark"}
                  onChange={(event) =>
                    setTheme(event.currentTarget.checked ? "qr-dark" : "qr-light")
                  }
                />
                <span className="swap-on">Dark</span>
                <span className="swap-off">Light</span>
              </label>
            </div>
          </header>

          <div className="grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[460px_minmax(0,1fr)]">
            <aside className="xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              <EditorPanels
                buildings={buildings}
                floors={floors}
                selectedBuildingId={selectedBuildingId}
                selectedFloorId={selectedFloorId}
                onSelectBuilding={(buildingId) => {
                  setSelectedBuildingId(buildingId);
                  const firstFloor = floors.find((floor) => floor.buildingId === buildingId);
                  if (firstFloor) {
                    setSelectedFloorId(firstFloor.id);
                    setEditorState((current) => selectFeature(current, undefined));
                  }
                }}
                onAddBuilding={() => {
                  const buildingId = createId();
                  const floorId = createId();
                  const building: Building = {
                    id: buildingId,
                    name: `Building ${buildings.length + 1}`,
                  };
                  const floor: Floor = {
                    id: floorId,
                    buildingId,
                    name: "Ground Floor",
                  };
                  setBuildings((current) => [...current, building]);
                  setFloors((current) => [...current, floor]);
                  setSelectedBuildingId(buildingId);
                  setSelectedFloorId(floorId);
                  setEditorState((current) => selectFeature(current, undefined));
                }}
                onDeleteBuilding={(buildingId) => {
                  const floorsToDelete = floors
                    .filter((floor) => floor.buildingId === buildingId)
                    .map((floor) => floor.id);
                  const nextBuildings = buildings.filter((building) => building.id !== buildingId);
                  const nextFloors = floors.filter((floor) => floor.buildingId !== buildingId);
                  if (nextBuildings.length === 0 || nextFloors.length === 0) {
                    return;
                  }

                  setBuildings(nextBuildings);
                  setFloors(nextFloors);
                  setOverlays((current) =>
                    current.filter((overlay) => !floorsToDelete.includes(overlay.floorId)),
                  );
                  setEditorState((current) =>
                    replaceAllFeatures(
                      selectFeature(current, undefined),
                      current.features.filter(
                        (feature) => !floorsToDelete.includes(feature.properties.floorId ?? ""),
                      ),
                    ),
                  );

                  const primaryBuilding = nextBuildings[0];
                  const primaryFloor = nextFloors[0];
                  if (!primaryBuilding || !primaryFloor) {
                    return;
                  }
                  setSelectedBuildingId(primaryBuilding.id);
                  setSelectedFloorId(primaryFloor.id);
                }}
                onRenameBuilding={(buildingId, name) => {
                  setBuildings((current) =>
                    current.map((building) =>
                      building.id === buildingId
                        ? { ...building, name: name || "Untitled building" }
                        : building,
                    ),
                  );
                }}
                onSelectFloor={(floorId) => {
                  setSelectedFloorId(floorId);
                  setEditorState((current) => selectFeature(current, undefined));
                }}
                onAddFloor={() => {
                  const floor: Floor = {
                    id: createId(),
                    buildingId: selectedBuildingId,
                    name: `Floor ${floors.filter((current) => current.buildingId === selectedBuildingId).length + 1}`,
                  };
                  setFloors((current) => [...current, floor]);
                  setSelectedFloorId(floor.id);
                  setEditorState((current) => selectFeature(current, undefined));
                }}
                onDeleteFloor={(floorId) => {
                  const nextFloors = floors.filter((floor) => floor.id !== floorId);
                  const siblingFloors = nextFloors.filter(
                    (floor) => floor.buildingId === selectedBuildingId,
                  );
                  if (siblingFloors.length === 0) {
                    return;
                  }

                  setFloors(nextFloors);
                  setOverlays((current) =>
                    current.filter((overlay) => overlay.floorId !== floorId),
                  );
                  setEditorState((current) =>
                    replaceAllFeatures(
                      selectFeature(current, undefined),
                      current.features.filter((feature) => feature.properties.floorId !== floorId),
                    ),
                  );
                  const primarySibling = siblingFloors[0];
                  if (!primarySibling) {
                    return;
                  }
                  setSelectedFloorId(primarySibling.id);
                }}
                onRenameFloor={(floorId, name) => {
                  setFloors((current) =>
                    current.map((floor) =>
                      floor.id === floorId ? { ...floor, name: name || "Untitled floor" } : floor,
                    ),
                  );
                }}
                features={visibleFeatures}
                selectedFeatureId={editorState.selectedFeatureId}
                onDeleteSelectedFeature={() =>
                  setEditorState((current) => deleteSelectedFeature(current))
                }
                onUpdateSelectedFeatureProperty={(key, value) => {
                  if (!editorState.selectedFeatureId) {
                    return;
                  }

                  setEditorState((current) =>
                    updateFeature(current, editorState.selectedFeatureId ?? "", (feature) => ({
                      ...feature,
                      properties: {
                        ...feature.properties,
                        [key]: value || undefined,
                      },
                    })),
                  );
                }}
                onUpdateSelectedFeatureMetadata={(metadata) => {
                  if (!editorState.selectedFeatureId) {
                    return;
                  }

                  setEditorState((current) =>
                    updateFeature(current, editorState.selectedFeatureId ?? "", (feature) => ({
                      ...feature,
                      properties: {
                        ...feature.properties,
                        metadata,
                      },
                    })),
                  );
                }}
                onImport={(importedFeatures) => {
                  const normalized = importedFeatures.map((feature) => ({
                    ...feature,
                    id: feature.id || createId(),
                    properties: {
                      ...feature.properties,
                      floorId: selectedFloorId,
                    },
                  }));

                  setEditorState((current) => {
                    const withoutCurrentFloor = current.features.filter(
                      (feature) => feature.properties.floorId !== selectedFloorId,
                    );
                    return replaceAllFeatures(current, [...withoutCurrentFloor, ...normalized]);
                  });
                }}
                overlay={selectedOverlay}
                onOverlayUpload={uploadOverlayForCurrentFloor}
                onOverlayOpacityChange={(opacity) => {
                  setOverlays((current) =>
                    current.map((overlay) =>
                      overlay.floorId === selectedFloorId
                        ? { ...overlay, opacity, updatedAt: new Date().toISOString() }
                        : overlay,
                    ),
                  );
                }}
                onOverlayRecenter={() => {
                  applyToCurrentOverlay((overlay) => ({
                    ...overlay,
                    corners: cornersAroundView(mapView.center, mapView.zoom),
                    updatedAt: new Date().toISOString(),
                  }));
                }}
                onOverlayNudge={(dx, dy) => {
                  applyToCurrentOverlay((overlay) => ({
                    ...overlay,
                    corners: shiftCorners(overlay.corners, dx, dy),
                    updatedAt: new Date().toISOString(),
                  }));
                }}
                onOverlayScale={(factor) => {
                  applyToCurrentOverlay((overlay) => ({
                    ...overlay,
                    corners: scaleCorners(overlay.corners, factor),
                    updatedAt: new Date().toISOString(),
                  }));
                }}
                onOverlayRotate={(degrees) => {
                  applyToCurrentOverlay((overlay) => ({
                    ...overlay,
                    corners: rotateCorners(overlay.corners, degrees),
                    updatedAt: new Date().toISOString(),
                  }));
                }}
                onOverlayToggleVisibility={() => {
                  setOverlays((current) =>
                    current.map((overlay) =>
                      overlay.floorId === selectedFloorId
                        ? {
                            ...overlay,
                            visible: overlay.visible === false,
                            updatedAt: new Date().toISOString(),
                          }
                        : overlay,
                    ),
                  );
                }}
                onOverlayToggleLock={() => {
                  setOverlays((current) =>
                    current.map((overlay) =>
                      overlay.floorId === selectedFloorId
                        ? {
                            ...overlay,
                            locked: !overlay.locked,
                            updatedAt: new Date().toISOString(),
                          }
                        : overlay,
                    ),
                  );
                }}
              />
            </aside>

            <section className="card bg-base-100 shadow xl:min-h-0">
              <div className="card-body gap-3 xl:min-h-0">
                <h2 className="card-title text-lg">Map View</h2>
                <div className="relative h-[50vh] xl:min-h-0 xl:flex-1">
                  <div className="absolute left-3 top-3 z-10 flex flex-col gap-2">
                    <div
                      className="join bg-base-100/95 p-1 shadow"
                      role="toolbar"
                      aria-label="Map edit tools"
                    >
                      <button
                        className={`btn btn-sm join-item ${drawMode === "select" ? "btn-primary" : ""}`}
                        type="button"
                        aria-label="Select mode"
                        title="Select mode"
                        onClick={cancelDrawMode}
                      >
                        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                          <path
                            d="m4 3 6 15 2.8-5.2L18 10 4 3Z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        className={`btn btn-sm join-item ${drawMode === "point" ? "btn-primary" : ""}`}
                        type="button"
                        aria-label="Draw point"
                        title="Draw point"
                        onClick={() => startDrawMode("point")}
                      >
                        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                          <circle cx="12" cy="12" r="4" fill="currentColor" />
                        </svg>
                      </button>
                      <button
                        className={`btn btn-sm join-item ${drawMode === "line" ? "btn-primary" : ""}`}
                        type="button"
                        aria-label="Draw line"
                        title="Draw line"
                        onClick={() => startDrawMode("line")}
                      >
                        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                          <path
                            d="M4 18 20 6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          />
                        </svg>
                      </button>
                      <button
                        className={`btn btn-sm join-item ${drawMode === "polygon" ? "btn-primary" : ""}`}
                        type="button"
                        aria-label="Draw polygon"
                        title="Draw polygon"
                        onClick={() => startDrawMode("polygon")}
                      >
                        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                          <path
                            d="M6 6h8l4 6-6 6H5l1-12Z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        className="btn btn-sm join-item"
                        type="button"
                        aria-label="Undo"
                        title="Undo"
                        onClick={() => setEditorState((current) => undo(current))}
                      >
                        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                          <path
                            d="M8 8 4 12l4 4M5 12h9a6 6 0 1 1 0 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        className="btn btn-sm join-item"
                        type="button"
                        aria-label="Redo"
                        title="Redo"
                        onClick={() => setEditorState((current) => redo(current))}
                      >
                        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                          <path
                            d="m16 8 4 4-4 4M19 12h-9a6 6 0 1 0 0 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        className="btn btn-sm btn-error join-item"
                        type="button"
                        aria-label="Delete selection"
                        title="Delete selection"
                        onClick={deleteSelection}
                      >
                        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                          <path
                            d="M4 7h16M9 7V5h6v2m-7 0v12h8V7"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                    <div className="rounded-box bg-base-100/95 px-3 py-2 text-xs shadow">
                      {drawMode === "select"
                        ? "Select mode: click features, drag features, or drag vertices."
                        : "Draw mode: click to add geometry. Press Escape to cancel."}
                    </div>
                  </div>
                  <MapCanvas
                    maptilerApiKey={runtimeConfig.config.maptilerApiKey}
                    features={visibleFeatures}
                    selectedFeature={selectedFeature}
                    overlay={selectedOverlay}
                    drawMode={drawMode}
                    deleteRequestVersion={deleteRequestVersion}
                    onFeaturesChange={onDrawFeaturesChange}
                    onFeatureSelectionChange={onDrawSelectionChange}
                    onViewStateChange={onViewStateChange}
                    onInteractionModeChange={onInteractionModeChange}
                    onOverlayCornersChange={(corners) => {
                      applyToCurrentOverlay((overlay) => ({
                        ...overlay,
                        corners,
                        updatedAt: new Date().toISOString(),
                      }));
                    }}
                  />
                </div>
                <div className="rounded-box bg-base-200 p-3 text-sm">
                  Center: {mapView.center[0].toFixed(6)}, {mapView.center[1].toFixed(6)} | Zoom:{" "}
                  {mapView.zoom.toFixed(2)}
                </div>
                {selectedFeature ? (
                  <div className="rounded-box bg-base-200 p-3 text-sm">
                    Selected:{" "}
                    <span className="font-semibold">
                      {selectedFeature.properties.name ?? selectedFeature.id}
                    </span>
                  </div>
                ) : (
                  <div className="rounded-box bg-base-200 p-3 text-sm text-base-content/70">
                    No feature selected.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </ErrorBoundary>
  );
}

export default App;
