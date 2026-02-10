import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { type DrawMode, MapCanvas } from "./components/MapCanvas";
import { SelectionSidebar } from "./components/Sidebar/SelectionSidebar";
import { BuildingsTree } from "./components/Tree/BuildingsTree";
import { getRuntimeConfig } from "./lib/config/runtimeConfig";
import {
  addFeature,
  createInitialEditorState,
  type EditorState,
  redo,
  replaceAllFeatures,
  selectFeature,
  undo,
  updateFeature,
} from "./lib/editor/editorModel";
import { firstValidSelection, resolveSelection, type Selection } from "./lib/editor/selection";
import { cloneFloorWithReferences } from "./lib/floorClone";
import { type OpenCageSearchResult, searchOpenCage } from "./lib/geocoding/openCage";
import { createId } from "./lib/id";
import { sortFeaturesForRendering } from "./lib/imdf/export";
import { cloneImdfFeature } from "./lib/imdf/factories";
import { normalizeFeature } from "./lib/imdf/normalize";
import { getImdfSchemaRule, type SupportedImdfType } from "./lib/imdf/schema";
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
const MAP_VIEW_STORAGE_KEY = "floorplan-editor-map-view";
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

const INITIAL_MAP_CENTER: Coordinates = [5.1214, 52.0907];
const INITIAL_MAP_ZOOM = 17;
const DEFAULT_MAP_VIEW = {
  center: INITIAL_MAP_CENTER,
  zoom: INITIAL_MAP_ZOOM,
} as const;

type SaveStatus = "idle" | "saving" | "saved" | "error";
type LocationSearchStatus = "idle" | "loading" | "error";

type MapRelocationRequest = {
  center: Coordinates;
  zoom?: number;
  requestVersion: number;
};

const isCoordinateTuple = (value: unknown): value is Coordinates =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === "number" &&
  Number.isFinite(value[0]) &&
  typeof value[1] === "number" &&
  Number.isFinite(value[1]);

const getInitialMapView = (): { center: Coordinates; zoom: number } => {
  if (typeof window === "undefined") {
    return {
      center: [...DEFAULT_MAP_VIEW.center],
      zoom: DEFAULT_MAP_VIEW.zoom,
    };
  }

  try {
    const raw = window.localStorage.getItem(MAP_VIEW_STORAGE_KEY);
    if (!raw) {
      return {
        center: [...DEFAULT_MAP_VIEW.center],
        zoom: DEFAULT_MAP_VIEW.zoom,
      };
    }

    const parsed = JSON.parse(raw) as {
      center?: unknown;
      zoom?: unknown;
    };
    if (!isCoordinateTuple(parsed.center)) {
      return {
        center: [...DEFAULT_MAP_VIEW.center],
        zoom: DEFAULT_MAP_VIEW.zoom,
      };
    }

    const parsedZoom =
      typeof parsed.zoom === "number" && Number.isFinite(parsed.zoom)
        ? parsed.zoom
        : DEFAULT_MAP_VIEW.zoom;

    return {
      center: [parsed.center[0], parsed.center[1]],
      zoom: parsedZoom,
    };
  } catch {
    return {
      center: [...DEFAULT_MAP_VIEW.center],
      zoom: DEFAULT_MAP_VIEW.zoom,
    };
  }
};

const cornersAroundView = (center: Coordinates, zoom: number): OverlayCorners => {
  const span = Math.max(0.00005, 0.02 / 2 ** Math.max(0, zoom - 14));
  return {
    topLeft: [center[0] - span, center[1] + span],
    topRight: [center[0] + span, center[1] + span],
    bottomRight: [center[0] + span, center[1] - span],
    bottomLeft: [center[0] - span, center[1] - span],
  };
};

const overlayCenter = (corners: OverlayCorners): Coordinates => [
  (corners.topLeft[0] + corners.topRight[0] + corners.bottomRight[0] + corners.bottomLeft[0]) / 4,
  (corners.topLeft[1] + corners.topRight[1] + corners.bottomRight[1] + corners.bottomLeft[1]) / 4,
];

const geometryCenter = (geometry: FloorFeature["geometry"]): Coordinates | undefined => {
  if (geometry.type === "Point") {
    return geometry.coordinates;
  }

  const points =
    geometry.type === "LineString" ? geometry.coordinates : (geometry.coordinates[0] ?? []);

  if (points.length === 0) {
    return undefined;
  }

  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minLng = Math.min(minLng, point[0]);
    maxLng = Math.max(maxLng, point[0]);
    minLat = Math.min(minLat, point[1]);
    maxLat = Math.max(maxLat, point[1]);
  }

  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
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
    return "New path";
  }

  return "New polygon";
};

const isFeatureOnFloor = (feature: FloorFeature, floorId: string): boolean =>
  feature.properties.floorId === floorId || !feature.properties.floorId;

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
  const [initialMapView] = useState(() => getInitialMapView());
  const [theme, setTheme] = useState<ThemeId>(() => getInitialTheme());
  const [editorState, setEditorState] = useState<EditorState>(() => createInitialEditorState());
  const [overlays, setOverlays] = useState<FloorOverlay[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [selection, setSelection] = useState<Selection | undefined>(undefined);
  const [drawMode, setDrawMode] = useState<DrawMode>("select");
  const [deleteRequestVersion, setDeleteRequestVersion] = useState(0);
  const [deleteVertexRequestVersion, setDeleteVertexRequestVersion] = useState(0);
  const [splitPathRequestVersion, setSplitPathRequestVersion] = useState(0);
  const [forkPathRequestVersion, setForkPathRequestVersion] = useState(0);
  const [pendingDrawFeatureType, setPendingDrawFeatureType] = useState<SupportedImdfType>();
  const [hasSelectedVertex, setHasSelectedVertex] = useState(false);
  const [mapView, setMapView] = useState<{ center: Coordinates; zoom: number }>(initialMapView);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSearchResults, setLocationSearchResults] = useState<OpenCageSearchResult[]>([]);
  const [locationSearchStatus, setLocationSearchStatus] = useState<LocationSearchStatus>("idle");
  const [locationSearchNoResults, setLocationSearchNoResults] = useState(false);
  const [locationSearchFocused, setLocationSearchFocused] = useState(false);
  const [relocationRequest, setRelocationRequest] = useState<MapRelocationRequest>({
    center: initialMapView.center,
    zoom: initialMapView.zoom,
    requestVersion: 1,
  });

  const runtimeConfig = getRuntimeConfig();
  const openCageApiKey = runtimeConfig.ok ? runtimeConfig.config.opencageApiKey : "";

  const resolvedSelection = useMemo(
    () =>
      selection
        ? resolveSelection(selection, {
            buildings,
            floors,
            features: editorState.features,
          })
        : undefined,
    [selection, buildings, floors, editorState.features],
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify(mapView));
  }, [mapView]);

  useEffect(() => {
    let cancelled = false;

    void projectRepository.loadProject(PROJECT_ID).then((project) => {
      if (cancelled || !project) {
        return;
      }

      const sanitizedProject = sanitizeProjectSnapshot(project);
      const loadedBuildings = sanitizedProject.buildings ?? [];
      const loadedFloors = sanitizedProject.floors ?? [];
      const primaryFloor = loadedFloors[0];
      const primaryBuilding = loadedBuildings[0];

      const migratedFeatures = sanitizedProject.features.map((feature) => {
        const resolvedFloorId =
          typeof feature.properties.floorId === "string"
            ? feature.properties.floorId
            : primaryFloor?.id;

        return normalizeFeature(
          {
            ...feature,
            properties: {
              ...feature.properties,
              ...(resolvedFloorId ? { floorId: resolvedFloorId } : {}),
            },
          },
          {
            floorId: resolvedFloorId ?? "",
            buildingId:
              loadedFloors.find((floor) => floor.id === resolvedFloorId)?.buildingId ??
              primaryBuilding?.id ??
              "",
          },
        );
      });

      setEditorState(createInitialEditorState(migratedFeatures));
      setOverlays(sanitizedProject.overlays);
      setBuildings(loadedBuildings);
      setFloors(loadedFloors);
      setSelection(
        firstValidSelection({
          buildings: loadedBuildings,
          floors: loadedFloors,
          features: migratedFeatures,
        }),
      );
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
    if (!selection) {
      const fallback = firstValidSelection({ buildings, floors, features: editorState.features });
      setSelection(fallback);
      return;
    }

    if (resolvedSelection) {
      return;
    }

    const fallback = firstValidSelection({ buildings, floors, features: editorState.features });
    setSelection(fallback);
    setEditorState((current) => selectFeature(current, undefined));
  }, [selection, resolvedSelection, buildings, floors, editorState.features]);

  const activeBuilding = resolvedSelection?.building ?? buildings[0];
  const activeFloor =
    resolvedSelection?.floor ??
    floors.find((floor) => floor.buildingId === activeBuilding?.id) ??
    floors[0];

  const selectedFeature = useMemo(
    () => editorState.features.find((feature) => feature.id === editorState.selectedFeatureId),
    [editorState.features, editorState.selectedFeatureId],
  );

  const selectedOverlay = useMemo(
    () => overlays.find((overlay) => overlay.floorId === activeFloor?.id),
    [overlays, activeFloor?.id],
  );

  const visibleFeatures = useMemo(() => {
    if (!activeFloor) {
      return [];
    }

    return sortFeaturesForRendering(
      editorState.features.filter((feature) => feature.properties.floorId === activeFloor.id),
    );
  }, [editorState.features, activeFloor]);

  const selectedFeatureForMap =
    selectedFeature && activeFloor && selectedFeature.properties.floorId === activeFloor.id
      ? selectedFeature
      : undefined;

  const startDrawMode = useCallback(
    (mode: DrawMode) => {
      setDrawMode(mode);
      setPendingDrawFeatureType(undefined);
      setHasSelectedVertex(false);
      if (mode !== "select") {
        setEditorState((current) => selectFeature(current, undefined));
        if (activeFloor) {
          setSelection({ kind: "floor", id: activeFloor.id });
        }
      }
    },
    [activeFloor],
  );

  const cancelDrawMode = useCallback(() => {
    setDrawMode("select");
    setPendingDrawFeatureType(undefined);
    setHasSelectedVertex(false);
  }, []);

  const deleteSelection = useCallback(() => {
    setDeleteRequestVersion((current) => current + 1);
  }, []);

  const deleteVertex = useCallback(() => {
    setDeleteVertexRequestVersion((current) => current + 1);
  }, []);

  const splitPathSegment = useCallback(() => {
    setSplitPathRequestVersion((current) => current + 1);
  }, []);

  const forkPathAtNode = useCallback(() => {
    setForkPathRequestVersion((current) => current + 1);
  }, []);

  const onDrawFeaturesChange = useCallback(
    (featuresFromMap: FloorFeature[]) => {
      if (!activeFloor || !activeBuilding) {
        return;
      }

      const pendingSchema = pendingDrawFeatureType
        ? getImdfSchemaRule(pendingDrawFeatureType)
        : undefined;
      let consumedPendingTemplate = false;

      setEditorState((current) => {
        const currentVisible = current.features.filter((feature) =>
          isFeatureOnFloor(feature, activeFloor.id),
        );
        const currentVisibleById = new Map(currentVisible.map((feature) => [feature.id, feature]));

        const nextVisible = featuresFromMap.map((feature) => {
          const existing = currentVisibleById.get(feature.id);
          const shouldApplyPendingTemplate =
            !existing && pendingSchema && pendingSchema.geometryType === feature.geometry.type;
          if (shouldApplyPendingTemplate) {
            consumedPendingTemplate = true;
          }
          const mergedProperties = {
            ...(existing?.properties ?? {}),
            ...feature.properties,
            ...(shouldApplyPendingTemplate
              ? {
                  kind: pendingSchema.type,
                  imdfType: pendingSchema.type,
                  name: pendingSchema.defaultName,
                }
              : {}),
          };

          return normalizeFeature(
            {
              ...feature,
              properties: {
                ...mergedProperties,
                floorId: mergedProperties.floorId ?? existing?.properties.floorId ?? activeFloor.id,
                kind:
                  typeof mergedProperties.kind === "string" && mergedProperties.kind
                    ? mergedProperties.kind
                    : kindForGeometry(feature.geometry.type),
                name:
                  typeof mergedProperties.name === "string" && mergedProperties.name
                    ? mergedProperties.name
                    : (existing?.properties.name ?? nameForGeometry(feature.geometry.type)),
              },
            },
            {
              floorId: activeFloor.id,
              buildingId: activeBuilding.id,
            },
          );
        });

        if (areFeatureListsEqual(currentVisible, nextVisible)) {
          return current;
        }

        const nonVisible = current.features.filter(
          (feature) => !isFeatureOnFloor(feature, activeFloor.id),
        );
        const nextFeatures = [...nonVisible, ...nextVisible];
        const nextSelectedFeatureId =
          current.selectedFeatureId &&
          nextFeatures.some((feature) => feature.id === current.selectedFeatureId)
            ? current.selectedFeatureId
            : undefined;

        return selectFeature(replaceAllFeatures(current, nextFeatures), nextSelectedFeatureId);
      });

      if (consumedPendingTemplate) {
        setPendingDrawFeatureType(undefined);
      }
    },
    [activeFloor, activeBuilding, pendingDrawFeatureType],
  );

  const onDrawSelectionChange = useCallback(
    (featureId: string | undefined) => {
      setEditorState((current) => selectFeature(current, featureId));

      if (!featureId) {
        if (activeFloor) {
          setSelection({ kind: "floor", id: activeFloor.id });
        }
        return;
      }

      const feature = editorState.features.find((current) => current.id === featureId);
      if (!feature) {
        return;
      }

      setSelection({ kind: "feature", id: featureId });
      setDrawMode("select");
    },
    [editorState.features, activeFloor],
  );

  const onInteractionModeChange = useCallback((mode: DrawMode) => {
    setDrawMode(mode);
    if (mode !== "select") {
      setHasSelectedVertex(false);
    }
  }, []);

  useEffect(() => {
    const trimmedQuery = locationQuery.trim();
    if (!locationSearchFocused || !openCageApiKey || trimmedQuery.length < 3) {
      setLocationSearchStatus("idle");
      setLocationSearchResults([]);
      setLocationSearchNoResults(false);
      return;
    }

    setLocationSearchStatus("idle");
    setLocationSearchResults([]);
    setLocationSearchNoResults(false);

    const abortController = new AbortController();
    const timer = window.setTimeout(() => {
      setLocationSearchStatus("loading");

      void searchOpenCage(trimmedQuery, openCageApiKey, {
        limit: 6,
        signal: abortController.signal,
      })
        .then((results) => {
          if (abortController.signal.aborted) {
            return;
          }

          setLocationSearchResults(results);
          setLocationSearchNoResults(results.length === 0);
          setLocationSearchStatus("idle");
        })
        .catch((error: unknown) => {
          if (abortController.signal.aborted) {
            return;
          }

          clientLogger.error("geocoding.opencage_search_failed", {
            error,
            query: trimmedQuery,
          });
          setLocationSearchStatus("error");
          setLocationSearchResults([]);
          setLocationSearchNoResults(false);
        });
    }, 250);

    return () => {
      abortController.abort();
      window.clearTimeout(timer);
    };
  }, [locationQuery, locationSearchFocused, openCageApiKey]);

  const onLocationSearchSelect = useCallback((result: OpenCageSearchResult) => {
    setLocationQuery(result.formatted);
    setLocationSearchResults([]);
    setLocationSearchStatus("idle");
    setLocationSearchNoResults(false);
    setLocationSearchFocused(false);
    setMapView((current) => ({
      ...current,
      center: result.coordinates,
    }));
    setRelocationRequest((current) => ({
      center: result.coordinates,
      requestVersion: (current?.requestVersion ?? 0) + 1,
    }));
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
        if (hasSelectedVertex) {
          deleteVertex();
        } else {
          deleteSelection();
        }
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
  }, [cancelDrawMode, deleteSelection, deleteVertex, hasSelectedVertex]);

  const applyToCurrentOverlay = useCallback(
    (transform: (overlay: FloorOverlay) => FloorOverlay) => {
      if (!activeFloor) {
        return;
      }

      setOverlays((current) =>
        current.map((overlay) => {
          if (overlay.floorId !== activeFloor.id || overlay.locked) {
            return overlay;
          }

          return transform(overlay);
        }),
      );
    },
    [activeFloor],
  );

  const onViewStateChange = useCallback((center: Coordinates, zoom: number) => {
    setMapView({ center, zoom });
  }, []);

  const relocateMap = useCallback((center: Coordinates, zoom?: number) => {
    setMapView((current) => ({
      center,
      zoom: typeof zoom === "number" ? zoom : current.zoom,
    }));
    setRelocationRequest((current) => ({
      center,
      ...(typeof zoom === "number" ? { zoom } : {}),
      requestVersion: (current?.requestVersion ?? 0) + 1,
    }));
  }, []);

  const floorCenter = useCallback(
    (floorId: string): Coordinates | undefined => {
      const floorOverlay = overlays.find((overlay) => overlay.floorId === floorId);
      if (floorOverlay) {
        return overlayCenter(floorOverlay.corners);
      }

      const floorFeatures = editorState.features.filter(
        (feature) => feature.properties.floorId === floorId,
      );
      if (floorFeatures.length === 0) {
        return undefined;
      }

      let minLng = Number.POSITIVE_INFINITY;
      let maxLng = Number.NEGATIVE_INFINITY;
      let minLat = Number.POSITIVE_INFINITY;
      let maxLat = Number.NEGATIVE_INFINITY;

      let hasPoint = false;
      for (const feature of floorFeatures) {
        const center = geometryCenter(feature.geometry);
        if (!center) {
          continue;
        }
        hasPoint = true;
        minLng = Math.min(minLng, center[0]);
        maxLng = Math.max(maxLng, center[0]);
        minLat = Math.min(minLat, center[1]);
        maxLat = Math.max(maxLat, center[1]);
      }

      if (!hasPoint) {
        return undefined;
      }

      return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
    },
    [editorState.features, overlays],
  );

  const buildingCenter = useCallback(
    (buildingId: string): Coordinates | undefined => {
      const directBuildingLocation = buildings.find(
        (building) => building.id === buildingId,
      )?.location;
      if (directBuildingLocation) {
        return directBuildingLocation;
      }

      const floorIds = floors
        .filter((floor) => floor.buildingId === buildingId)
        .map((floor) => floor.id);
      for (const floorId of floorIds) {
        const center = floorCenter(floorId);
        if (center) {
          return center;
        }
      }

      return undefined;
    },
    [buildings, floors, floorCenter],
  );

  const uploadOverlayForCurrentFloor = useCallback(
    (file: File) => {
      if (!activeFloor) {
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) {
          return;
        }

        setOverlays((current) => {
          const nextOverlay: FloorOverlay = {
            id: selectedOverlay?.id ?? createId(),
            floorId: activeFloor.id,
            imageName: file.name,
            imageDataUrl: dataUrl,
            opacity: selectedOverlay?.opacity ?? 70,
            visible: selectedOverlay?.visible ?? true,
            locked: false,
            corners: cornersAroundView(mapView.center, mapView.zoom),
            updatedAt: new Date().toISOString(),
          };

          const withoutCurrent = current.filter((overlay) => overlay.floorId !== activeFloor.id);
          return [...withoutCurrent, nextOverlay];
        });
      };
      reader.readAsDataURL(file);
    },
    [mapView.center, mapView.zoom, activeFloor, selectedOverlay],
  );

  const selectNode = useCallback(
    (nextSelection: Selection) => {
      let targetCenter: Coordinates | undefined;
      if (nextSelection.kind === "building") {
        targetCenter = buildingCenter(nextSelection.id);
      } else if (nextSelection.kind === "floor") {
        targetCenter = floorCenter(nextSelection.id);
      } else {
        const feature = editorState.features.find((current) => current.id === nextSelection.id);
        targetCenter = feature ? geometryCenter(feature.geometry) : undefined;
      }

      if (targetCenter) {
        relocateMap(targetCenter);
      }

      setSelection(nextSelection);
      if (nextSelection.kind === "feature") {
        setEditorState((current) => selectFeature(current, nextSelection.id));
        setDrawMode("select");
        return;
      }

      setEditorState((current) => selectFeature(current, undefined));
    },
    [buildingCenter, editorState.features, floorCenter, relocateMap],
  );

  const onAddBuilding = useCallback(() => {
    const buildingId = createId();
    const floorId = createId();
    const building: Building = {
      id: buildingId,
      name: `Building ${buildings.length + 1}`,
      location: mapView.center,
    };
    const floor: Floor = {
      id: floorId,
      buildingId,
      name: "Ground Floor",
    };

    setBuildings((current) => [...current, building]);
    setFloors((current) => [...current, floor]);
    setSelection({ kind: "floor", id: floorId });
    setEditorState((current) => selectFeature(current, undefined));
  }, [buildings.length, mapView.center]);

  const onDeleteBuilding = useCallback(
    (buildingId: string) => {
      const floorsToDelete = floors
        .filter((floor) => floor.buildingId === buildingId)
        .map((floor) => floor.id);
      const nextBuildings = buildings.filter((building) => building.id !== buildingId);
      const nextFloors = floors.filter((floor) => floor.buildingId !== buildingId);

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

      const nextSelection = firstValidSelection({
        buildings: nextBuildings,
        floors: nextFloors,
        features: editorState.features.filter(
          (feature) => !floorsToDelete.includes(feature.properties.floorId ?? ""),
        ),
      });
      setSelection(nextSelection);
    },
    [buildings, floors, editorState.features],
  );

  const onAddFloor = useCallback(
    (buildingId: string) => {
      const nextFloor: Floor = {
        id: createId(),
        buildingId,
        name: `Floor ${floors.filter((current) => current.buildingId === buildingId).length + 1}`,
      };

      setFloors((current) => [...current, nextFloor]);
      setSelection({ kind: "floor", id: nextFloor.id });
      setEditorState((current) => selectFeature(current, undefined));
    },
    [floors],
  );

  const onDeleteFloor = useCallback(
    (floorId: string) => {
      const floor = floors.find((current) => current.id === floorId);
      if (!floor) {
        return;
      }

      const nextFloors = floors.filter((current) => current.id !== floorId);
      setFloors(nextFloors);
      setOverlays((current) => current.filter((overlay) => overlay.floorId !== floorId));
      setEditorState((current) =>
        replaceAllFeatures(
          selectFeature(current, undefined),
          current.features.filter((feature) => feature.properties.floorId !== floorId),
        ),
      );

      const nextFloor =
        nextFloors.find((current) => current.buildingId === floor.buildingId) ?? nextFloors[0];
      if (nextFloor) {
        setSelection({ kind: "floor", id: nextFloor.id });
      } else {
        setSelection({ kind: "building", id: floor.buildingId });
      }
    },
    [floors],
  );

  const onCloneFloor = useCallback(
    (floorId: string) => {
      const sourceFloor = floors.find((floor) => floor.id === floorId);
      if (!sourceFloor) {
        return;
      }

      const clone = cloneFloorWithReferences({
        floor: sourceFloor,
        floors,
        features: editorState.features,
        overlays,
      });

      setFloors((current) => [...current, clone.floor]);
      setEditorState((current) =>
        replaceAllFeatures(selectFeature(current, undefined), [
          ...current.features,
          ...clone.features,
        ]),
      );
      const cloneOverlay = clone.overlay;
      if (cloneOverlay) {
        setOverlays((current) => [...current, cloneOverlay]);
      }
      setSelection({ kind: "floor", id: clone.floor.id });
      setDrawMode("select");
    },
    [editorState.features, floors, overlays],
  );

  const onCreateFeature = useCallback(
    (type: SupportedImdfType) => {
      const schema = getImdfSchemaRule(type);
      if (schema.geometryType === "LineString") {
        startDrawMode("line");
        setPendingDrawFeatureType(type);
        return;
      }

      startDrawMode("polygon");
      setPendingDrawFeatureType(type);
    },
    [startDrawMode],
  );

  const canEditPathNode = drawMode === "select" && hasSelectedVertex;
  const trimmedLocationQuery = locationQuery.trim();
  const showLocationSearchPopup =
    locationSearchFocused &&
    trimmedLocationQuery.length >= 3 &&
    (locationSearchStatus !== "idle" ||
      locationSearchNoResults ||
      locationSearchResults.length > 0);

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

          <div className="grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[320px_minmax(0,1fr)_420px]">
            <aside className="xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              <div className="mb-3 flex gap-2">
                <button className="btn btn-sm" type="button" onClick={onAddBuilding}>
                  Add building
                </button>
              </div>
              <div className="relative mb-3">
                <label className="input input-bordered input-sm flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="size-4 opacity-70" aria-hidden="true">
                    <path
                      d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <input
                    type="text"
                    className="grow"
                    value={locationQuery}
                    placeholder="Search any address worldwide"
                    aria-label="Search map address"
                    autoComplete="off"
                    onFocus={() => setLocationSearchFocused(true)}
                    onBlur={() => setLocationSearchFocused(false)}
                    onChange={(event) => setLocationQuery(event.currentTarget.value)}
                  />
                </label>
                {showLocationSearchPopup ? (
                  <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-xl">
                    {locationSearchStatus === "loading" ? (
                      <div className="px-3 py-2 text-sm text-base-content/70">Searching…</div>
                    ) : null}
                    {locationSearchStatus === "error" ? (
                      <div className="px-3 py-2 text-sm text-error">
                        Address search failed. Please try again.
                      </div>
                    ) : null}
                    {locationSearchStatus === "idle" && locationSearchResults.length > 0 ? (
                      <div role="listbox" aria-label="Address results">
                        <ul className="menu menu-sm w-full p-1">
                          {locationSearchResults.map((result) => (
                            <li key={result.id}>
                              <button
                                type="button"
                                role="option"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => onLocationSearchSelect(result)}
                              >
                                {result.formatted}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {locationSearchStatus === "idle" && locationSearchNoResults ? (
                      <div className="px-3 py-2 text-sm text-base-content/70">
                        No matching addresses found.
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <BuildingsTree
                buildings={buildings}
                floors={floors}
                features={editorState.features}
                selection={selection}
                onSelect={selectNode}
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
                        className="btn btn-sm join-item"
                        type="button"
                        aria-label="Delete selected vertex"
                        title="Delete selected vertex"
                        onClick={deleteVertex}
                        disabled={!hasSelectedVertex}
                      >
                        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                          <path
                            d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-4 8h8"
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
                        aria-label="Split selected path segment"
                        title="Split selected path segment"
                        onClick={splitPathSegment}
                        disabled={!canEditPathNode}
                      >
                        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                          <path
                            d="M4 12h16M12 8v8"
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
                        aria-label="Fork path from selected node"
                        title="Fork path from selected node"
                        onClick={forkPathAtNode}
                        disabled={!canEditPathNode}
                      >
                        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                          <path
                            d="M7 4v7m0 0 5 5m-5-5 5-5m0 10h7"
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
                  </div>
                  <MapCanvas
                    maptilerApiKey={runtimeConfig.config.maptilerApiKey}
                    initialView={initialMapView}
                    features={visibleFeatures}
                    selectedFeature={selectedFeatureForMap}
                    overlay={selectedOverlay}
                    drawMode={drawMode}
                    deleteRequestVersion={deleteRequestVersion}
                    deleteVertexRequestVersion={deleteVertexRequestVersion}
                    splitPathRequestVersion={splitPathRequestVersion}
                    forkPathRequestVersion={forkPathRequestVersion}
                    relocationRequest={relocationRequest}
                    onFeaturesChange={onDrawFeaturesChange}
                    onFeatureSelectionChange={onDrawSelectionChange}
                    onViewStateChange={onViewStateChange}
                    onInteractionModeChange={onInteractionModeChange}
                    onVertexSelectionChange={(hasVertex) => setHasSelectedVertex(hasVertex)}
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

            <aside className="xl:min-h-0 xl:overflow-y-auto xl:pl-1">
              <SelectionSidebar
                selection={selection}
                building={resolvedSelection?.building}
                floor={activeFloor}
                feature={selectedFeature}
                allFeatures={editorState.features}
                overlay={selectedOverlay}
                onRenameBuilding={(buildingId, name) => {
                  setBuildings((current) =>
                    current.map((building) =>
                      building.id === buildingId
                        ? { ...building, name: name || "Untitled building" }
                        : building,
                    ),
                  );
                }}
                onDeleteBuilding={onDeleteBuilding}
                onAddFloor={onAddFloor}
                onRenameFloor={(floorId, name) => {
                  setFloors((current) =>
                    current.map((floor) =>
                      floor.id === floorId ? { ...floor, name: name || "Untitled floor" } : floor,
                    ),
                  );
                }}
                onCloneFloor={onCloneFloor}
                onDeleteFloor={onDeleteFloor}
                onCreateFeature={onCreateFeature}
                onUpdateFeatureProperty={(featureId, key, value) => {
                  const floor = floors.find(
                    (current) =>
                      current.id ===
                      editorState.features.find((feature) => feature.id === featureId)?.properties
                        .floorId,
                  );
                  const building = floor
                    ? buildings.find((current) => current.id === floor.buildingId)
                    : undefined;

                  setEditorState((current) =>
                    updateFeature(current, featureId, (feature) =>
                      normalizeFeature(
                        {
                          ...feature,
                          properties: {
                            ...feature.properties,
                            [key]: value || undefined,
                          },
                        },
                        {
                          floorId: floor?.id ?? activeFloor?.id ?? feature.properties.floorId ?? "",
                          buildingId:
                            building?.id ??
                            activeBuilding?.id ??
                            feature.properties.buildingId ??
                            "",
                        },
                      ),
                    ),
                  );
                }}
                onUpdateFeatureMetadata={(featureId, metadata) => {
                  setEditorState((current) =>
                    updateFeature(current, featureId, (feature) => ({
                      ...feature,
                      properties: {
                        ...feature.properties,
                        metadata,
                      },
                    })),
                  );
                }}
                onDeleteFeature={(featureId) => {
                  const deletedFeature = editorState.features.find(
                    (feature) => feature.id === featureId,
                  );
                  setEditorState((current) =>
                    replaceAllFeatures(
                      selectFeature(current, undefined),
                      current.features.filter((feature) => feature.id !== featureId),
                    ),
                  );

                  if (deletedFeature?.properties.floorId) {
                    setSelection({ kind: "floor", id: deletedFeature.properties.floorId });
                  }
                }}
                onCloneFeature={(featureId) => {
                  const source = editorState.features.find((feature) => feature.id === featureId);
                  if (!source) {
                    return;
                  }

                  const floor = floors.find((current) => current.id === source.properties.floorId);
                  const building = floor
                    ? buildings.find((current) => current.id === floor.buildingId)
                    : activeBuilding;

                  if (!floor || !building) {
                    return;
                  }

                  const clone = cloneImdfFeature(source, {
                    floorId: floor.id,
                    buildingId: building.id,
                  });

                  setEditorState((current) => addFeature(current, clone));
                  setSelection({ kind: "feature", id: clone.id });
                  setDrawMode("select");
                }}
                onOverlayUpload={uploadOverlayForCurrentFloor}
                onOverlayOpacityChange={(opacity) => {
                  if (!activeFloor) {
                    return;
                  }

                  setOverlays((current) =>
                    current.map((overlay) =>
                      overlay.floorId === activeFloor.id
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
                onOverlayToggleVisibility={() => {
                  if (!activeFloor) {
                    return;
                  }

                  setOverlays((current) =>
                    current.map((overlay) =>
                      overlay.floorId === activeFloor.id
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
                  if (!activeFloor) {
                    return;
                  }

                  setOverlays((current) =>
                    current.map((overlay) =>
                      overlay.floorId === activeFloor.id
                        ? {
                            ...overlay,
                            locked: !overlay.locked,
                            updatedAt: new Date().toISOString(),
                          }
                        : overlay,
                    ),
                  );
                }}
                onReplaceFloorFeatures={(floorId, features) => {
                  setEditorState((current) => {
                    const withoutFloor = current.features.filter(
                      (feature) => feature.properties.floorId !== floorId,
                    );
                    return replaceAllFeatures(current, [...withoutFloor, ...features]);
                  });
                  setSelection({ kind: "floor", id: floorId });
                }}
              />
            </aside>
          </div>
        </div>
      </main>
    </ErrorBoundary>
  );
}

export default App;
