import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { type DrawMode, MapCanvas } from "./components/MapCanvas";
import { EditorPanels } from "./features/editor/EditorPanels";
import { getRuntimeConfig } from "./lib/config/runtimeConfig";
import {
  addFeature,
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
import type { GeometryDragPayload, MapClickPayload } from "./lib/map/mapBootstrap";
import { projectRepository } from "./lib/persistence/projectRepository";
import { sanitizeProjectSnapshot } from "./lib/persistence/projectSnapshotSanitizer";
import type {
  Building,
  Coordinates,
  Floor,
  FloorFeature,
  FloorOverlay,
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

const getFeatureVertices = (feature: FloorFeature | undefined): Coordinates[] => {
  if (!feature) {
    return [];
  }

  if (feature.geometry.type === "LineString") {
    return feature.geometry.coordinates;
  }

  if (feature.geometry.type === "Polygon") {
    const ring = feature.geometry.coordinates[0] ?? [];
    return ring.slice(0, -1);
  }

  return [];
};

const withUpdatedVertices = (feature: FloorFeature, vertices: Coordinates[]): FloorFeature => {
  if (feature.geometry.type === "LineString") {
    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: vertices,
      },
    };
  }

  if (feature.geometry.type === "Polygon") {
    if (vertices.length === 0) {
      return feature;
    }

    const firstVertex = vertices[0];
    if (!firstVertex) {
      return feature;
    }

    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: [[...vertices, firstVertex]],
      },
    };
  }

  return feature;
};

const withTranslatedFeature = (feature: FloorFeature, dx: number, dy: number): FloorFeature => {
  if (feature.geometry.type === "Point") {
    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: [feature.geometry.coordinates[0] + dx, feature.geometry.coordinates[1] + dy],
      },
    };
  }

  const currentVertices = getFeatureVertices(feature);
  const translated = currentVertices.map(
    (vertex) => [vertex[0] + dx, vertex[1] + dy] as Coordinates,
  );
  return withUpdatedVertices(feature, translated);
};

const withInsertedVertex = (
  feature: FloorFeature,
  afterIndex: number,
  coordinates: Coordinates,
): FloorFeature => {
  if (feature.geometry.type !== "LineString" && feature.geometry.type !== "Polygon") {
    return feature;
  }

  const currentVertices = getFeatureVertices(feature);
  if (afterIndex < -1 || afterIndex >= currentVertices.length) {
    return feature;
  }

  const insertAt = afterIndex + 1;
  const nextVertices = [
    ...currentVertices.slice(0, insertAt),
    coordinates,
    ...currentVertices.slice(insertAt),
  ];
  return withUpdatedVertices(feature, nextVertices);
};

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
  const [draftVertices, setDraftVertices] = useState<Coordinates[]>([]);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | undefined>();
  const [_dragSnapshot, setDragSnapshot] = useState<{
    featureId: string;
    startCoordinates: Coordinates;
    startFeature: FloorFeature;
    mode: "feature" | "vertex";
    vertexIndex?: number;
  } | null>(null);
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
        setDrawMode("select");
        setDraftVertices([]);
        setDragSnapshot(null);
        return;
      }

      if (event.key === "Enter" && (drawMode === "line" || drawMode === "polygon")) {
        event.preventDefault();
        setDraftVertices((current) => {
          if (drawMode === "line" && current.length >= 2) {
            const feature: FloorFeature = {
              type: "Feature",
              id: createId(),
              geometry: {
                type: "LineString",
                coordinates: current,
              },
              properties: {
                kind: "path",
                floorId: selectedFloorId,
                name: "New line",
              },
            };
            setEditorState((state) => addFeature(state, feature));
          }

          if (drawMode === "polygon" && current.length >= 3) {
            const firstVertex = current[0];
            if (firstVertex) {
              const feature: FloorFeature = {
                type: "Feature",
                id: createId(),
                geometry: {
                  type: "Polygon",
                  coordinates: [[...current, firstVertex]],
                },
                properties: {
                  kind: "unit",
                  floorId: selectedFloorId,
                  name: "New polygon",
                },
              };
              setEditorState((state) => addFeature(state, feature));
            }
          }

          setDrawMode("select");
          return [];
        });
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        setEditorState((current) => deleteSelectedFeature(current));
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
  }, [drawMode, selectedFloorId]);

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

  const editableVertices = useMemo(() => getFeatureVertices(selectedFeature), [selectedFeature]);

  const commitDraftShape = useCallback(() => {
    if (drawMode === "line" && draftVertices.length >= 2) {
      const feature: FloorFeature = {
        type: "Feature",
        id: createId(),
        geometry: {
          type: "LineString",
          coordinates: draftVertices,
        },
        properties: {
          kind: "path",
          floorId: selectedFloorId,
          name: "New line",
        },
      };
      setEditorState((current) => addFeature(current, feature));
    }

    if (drawMode === "polygon" && draftVertices.length >= 3) {
      const firstVertex = draftVertices[0];
      if (firstVertex) {
        const feature: FloorFeature = {
          type: "Feature",
          id: createId(),
          geometry: {
            type: "Polygon",
            coordinates: [[...draftVertices, firstVertex]],
          },
          properties: {
            kind: "unit",
            floorId: selectedFloorId,
            name: "New polygon",
          },
        };
        setEditorState((current) => addFeature(current, feature));
      }
    }

    setDrawMode("select");
    setDraftVertices([]);
  }, [drawMode, draftVertices, selectedFloorId]);

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

  const onMapClick = useCallback(
    (payload: MapClickPayload) => {
      const {
        coordinates,
        featureId,
        vertexFeatureId,
        vertexIndex,
        midpointFeatureId,
        midpointAfterIndex,
      } = payload;

      if (vertexFeatureId && vertexIndex !== undefined) {
        if (drawMode !== "select") {
          setDrawMode("select");
        }
        setEditorState((current) => selectFeature(current, vertexFeatureId));
        setSelectedVertexIndex(vertexIndex);
        return;
      }

      if (midpointFeatureId && midpointAfterIndex !== undefined) {
        if (drawMode !== "select") {
          setDrawMode("select");
        }
        setEditorState((current) =>
          updateFeature(current, midpointFeatureId, (feature) =>
            withInsertedVertex(feature, midpointAfterIndex, coordinates),
          ),
        );
        setSelectedVertexIndex(midpointAfterIndex + 1);
        return;
      }

      if (featureId) {
        if (drawMode !== "select") {
          setDrawMode("select");
        }
        setEditorState((current) => selectFeature(current, featureId));
        setSelectedVertexIndex(undefined);
        return;
      }

      if (drawMode === "point") {
        const feature: FloorFeature = {
          type: "Feature",
          id: createId(),
          geometry: {
            type: "Point",
            coordinates,
          },
          properties: {
            kind: "amenity",
            floorId: selectedFloorId,
            name: "New point",
          },
        };
        setEditorState((current) => addFeature(current, feature));
        return;
      }

      if (drawMode === "line" || drawMode === "polygon") {
        setDraftVertices((current) => [...current, coordinates]);
        return;
      }

      setEditorState((current) => selectFeature(current, undefined));
      setSelectedVertexIndex(undefined);
    },
    [drawMode, selectedFloorId],
  );

  const onGeometryDragStart = useCallback(
    (payload: GeometryDragPayload) => {
      if (drawMode !== "select") {
        return;
      }

      const feature = editorState.features.find((candidate) => candidate.id === payload.featureId);
      if (!feature) {
        return;
      }

      setEditorState((current) => selectFeature(current, feature.id));
      if (payload.mode === "vertex" && payload.vertexIndex !== undefined) {
        setSelectedVertexIndex(payload.vertexIndex);
      }

      setDragSnapshot({
        featureId: feature.id,
        startCoordinates: payload.startCoordinates,
        startFeature: structuredClone(feature),
        mode: payload.mode,
        ...(payload.vertexIndex !== undefined ? { vertexIndex: payload.vertexIndex } : {}),
      });
    },
    [drawMode, editorState.features],
  );

  const onGeometryDrag = useCallback((payload: GeometryDragPayload) => {
    setDragSnapshot((snapshot) => {
      if (!snapshot || snapshot.featureId !== payload.featureId) {
        return snapshot;
      }

      const dx = payload.coordinates[0] - snapshot.startCoordinates[0];
      const dy = payload.coordinates[1] - snapshot.startCoordinates[1];

      setEditorState((current) =>
        updateFeature(current, snapshot.featureId, () => {
          if (snapshot.mode === "vertex" && snapshot.vertexIndex !== undefined) {
            const startVertices = getFeatureVertices(snapshot.startFeature);
            const startVertex = startVertices[snapshot.vertexIndex];
            if (!startVertex) {
              return snapshot.startFeature;
            }

            const nextVertices = [...startVertices];
            nextVertices[snapshot.vertexIndex] = [startVertex[0] + dx, startVertex[1] + dy];
            return withUpdatedVertices(snapshot.startFeature, nextVertices);
          }

          return withTranslatedFeature(snapshot.startFeature, dx, dy);
        }),
      );
      return snapshot;
    });
  }, []);

  const onGeometryDragEnd = useCallback(() => {
    setDragSnapshot(null);
  }, []);

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
                    setSelectedVertexIndex(undefined);
                    setDragSnapshot(null);
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
                  setSelectedVertexIndex(undefined);
                  setDragSnapshot(null);
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
                  setSelectedVertexIndex(undefined);
                  setDragSnapshot(null);
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
                  setSelectedVertexIndex(undefined);
                  setDragSnapshot(null);
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
                  setSelectedVertexIndex(undefined);
                  setDragSnapshot(null);
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
                  setSelectedVertexIndex(undefined);
                  setDragSnapshot(null);
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
                drawMode={drawMode}
                draftVertexCount={draftVertices.length}
                selectedVertexIndex={selectedVertexIndex}
                onSelectFeature={(featureId) => {
                  setSelectedVertexIndex(undefined);
                  setDragSnapshot(null);
                  setEditorState((current) => selectFeature(current, featureId));
                }}
                onStartDraw={(mode) => {
                  setDrawMode(mode);
                  setDraftVertices([]);
                  setSelectedVertexIndex(undefined);
                  setDragSnapshot(null);
                  setEditorState((current) => selectFeature(current, undefined));
                }}
                onCompleteDraw={commitDraftShape}
                onCancelDraw={() => {
                  setDrawMode("select");
                  setDraftVertices([]);
                  setSelectedVertexIndex(undefined);
                  setDragSnapshot(null);
                }}
                onRemoveLastVertex={() => setDraftVertices((current) => current.slice(0, -1))}
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
                onSelectVertexIndex={(index) => setSelectedVertexIndex(index)}
                onDeleteSelectedVertex={() => {
                  if (!selectedFeature || selectedVertexIndex === undefined) {
                    return;
                  }

                  const currentVertices = getFeatureVertices(selectedFeature);
                  const nextVertices = currentVertices.filter(
                    (_, index) => index !== selectedVertexIndex,
                  );

                  if (selectedFeature.geometry.type === "LineString" && nextVertices.length < 2) {
                    return;
                  }

                  if (selectedFeature.geometry.type === "Polygon" && nextVertices.length < 3) {
                    return;
                  }

                  setEditorState((current) =>
                    updateFeature(current, selectedFeature.id, (feature) =>
                      withUpdatedVertices(feature, nextVertices),
                    ),
                  );
                  setSelectedVertexIndex((current) => {
                    if (current === undefined) {
                      return undefined;
                    }

                    if (current >= nextVertices.length) {
                      return nextVertices.length - 1;
                    }

                    return current;
                  });
                }}
                onUndo={() => setEditorState((current) => undo(current))}
                onRedo={() => setEditorState((current) => redo(current))}
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
                <div className="h-[50vh] xl:min-h-0 xl:flex-1">
                  <MapCanvas
                    maptilerApiKey={runtimeConfig.config.maptilerApiKey}
                    features={visibleFeatures}
                    selectedFeature={selectedFeature}
                    editableVertices={editableVertices}
                    selectedVertexIndex={selectedVertexIndex}
                    overlay={selectedOverlay}
                    draftVertices={draftVertices}
                    drawMode={drawMode}
                    onMapClick={onMapClick}
                    onGeometryDragStart={onGeometryDragStart}
                    onGeometryDrag={onGeometryDrag}
                    onGeometryDragEnd={onGeometryDragEnd}
                    onViewStateChange={onViewStateChange}
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
