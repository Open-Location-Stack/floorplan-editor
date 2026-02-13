import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppIcon } from "./components/icons/AppIcon";
import { type DrawMode, MapCanvas } from "./components/MapCanvas";
import type { AddFeatureRequest } from "./components/Sidebar/AddFeatureButtonGroups";
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
import {
  type OpenCageSearchResult,
  reverseGeocodeOpenCage,
  searchOpenCage,
} from "./lib/geocoding/openCage";
import { createId } from "./lib/id";
import {
  exportBuildingImdfZip,
  exportProjectImdfZip,
  exportVenueImdfZip,
} from "./lib/imdf/archiveExport";
import { importImdfArchiveZip } from "./lib/imdf/archiveImport";
import {
  applyContainmentParent,
  type ContainmentParent,
  resolvePendingContainmentParent,
} from "./lib/imdf/containment";
import { sortFeaturesForRendering } from "./lib/imdf/export";
import { cloneImdfFeature } from "./lib/imdf/factories";
import { getLevelGeometryFeatures, isLevelGeometryFeature } from "./lib/imdf/levelGeometry";
import { migrateProjectSnapshotToNavigationGraphV5 } from "./lib/imdf/migrations/v5";
import { normalizeFeature } from "./lib/imdf/normalize";
import { getImdfSchemaRule } from "./lib/imdf/schema";
import {
  detectImportConflicts,
  hasImportConflicts,
  type ImportConflictSummary,
  type ImportEntityData,
  mergeImportedDataReplaceConflicts,
} from "./lib/importExport/importConflict";
import { cloneLevelWithReferences } from "./lib/levelClone";
import { clientLogger } from "./lib/logging/clientLogger";
import { buildNavigationGraph } from "./lib/navigation/graphBuilder";
import {
  coordinatesEqual,
  featureHasLevel,
  isNavigationEdgeFeature,
  isNavigationNodeFeature,
  NAVIGATION_EDGE_FEATURE_TYPE,
  NAVIGATION_NODE_FEATURE_TYPE,
  type NavigationEdgeCategory,
  type NavigationNodeCategory,
  readNavigationLevels,
} from "./lib/navigation/navigationModel";
import { findRouteBetweenPoints } from "./lib/navigation/pointRouting";
import { projectRepository } from "./lib/persistence/projectRepository";
import { sanitizeProjectSnapshot } from "./lib/persistence/projectSnapshotSanitizer";
import type {
  Building,
  Coordinates,
  FloorFeature,
  FloorOverlay,
  GeometryType,
  Level,
  OverlayCorners,
  ThemeId,
  Venue,
} from "./lib/types";

const THEME_STORAGE_KEY = "floorplan-editor-theme";
const MAP_VIEW_STORAGE_KEY = "floorplan-editor-map-view";
const PROJECT_ID = "default-project";
const PROJECT_SCHEMA_VERSION = 6;

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
const DEFAULT_MAP_STYLE_ID = "basic-v2";
const DEFAULT_SNAP_DISTANCE_METERS = 0.2;
const MAP_STYLE_OPTIONS = [
  { id: "basic-v2", label: "Basic (no buildings)" },
  { id: "streets-v2", label: "Streets (with buildings)" },
  { id: "topo-v2", label: "Topographic" },
  { id: "satellite", label: "Satellite" },
  { id: "hybrid", label: "Hybrid (satellite + labels)" },
] as const;
const DEFAULT_MAP_VIEW = {
  center: INITIAL_MAP_CENTER,
  zoom: INITIAL_MAP_ZOOM,
} as const;

type SaveStatus = "idle" | "saving" | "saved" | "error";
type LocationSearchStatus = "idle" | "loading" | "error";
type ArchiveNoticeLevel = "error" | "warning" | "info";
type ArchiveNotice = {
  level: ArchiveNoticeLevel;
  message: string;
};

type ProjectSnapshot = {
  editorState: EditorState;
  overlays: FloorOverlay[];
  venues: Venue[];
  buildings: Building[];
  levels: Level[];
  selection: Selection | undefined;
  drawMode: DrawMode;
};

type ProjectHistoryEntry = {
  label: string;
  snapshot: ProjectSnapshot;
};

type PendingConfirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  apply: () => void;
};

type MapRelocationRequest = {
  center: Coordinates;
  zoom?: number;
  requestVersion: number;
};

type PendingDrawTemplate = {
  featureType: string;
  geometryType: GeometryType;
  defaultName: string;
  properties: FloorFeature["properties"];
};

const importEntityDataFromState = (
  venues: Venue[],
  buildings: Building[],
  levels: Level[],
  features: FloorFeature[],
  overlays: FloorOverlay[],
): ImportEntityData => ({
  venues,
  buildings,
  floors: levels,
  features,
  overlays,
});

const countImportConflicts = (summary: ImportConflictSummary): number =>
  summary.venueIds.length +
  summary.buildingIds.length +
  summary.levelIds.length +
  summary.featureIds.length +
  summary.overlayIds.length;

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

const overlayCornersEqual = (left: OverlayCorners, right: OverlayCorners): boolean =>
  left.topLeft[0] === right.topLeft[0] &&
  left.topLeft[1] === right.topLeft[1] &&
  left.topRight[0] === right.topRight[0] &&
  left.topRight[1] === right.topRight[1] &&
  left.bottomRight[0] === right.bottomRight[0] &&
  left.bottomRight[1] === right.bottomRight[1] &&
  left.bottomLeft[0] === right.bottomLeft[0] &&
  left.bottomLeft[1] === right.bottomLeft[1];

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

const polygonCentroid = (
  geometry: Extract<FloorFeature["geometry"], { type: "Polygon" }>,
): Coordinates | undefined => {
  const ring = geometry.coordinates[0];
  if (!ring || ring.length < 4) {
    return undefined;
  }
  let twiceArea = 0;
  let centroidLng = 0;
  let centroidLat = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    if (!current || !next) {
      continue;
    }
    const cross = current[0] * next[1] - next[0] * current[1];
    twiceArea += cross;
    centroidLng += (current[0] + next[0]) * cross;
    centroidLat += (current[1] + next[1]) * cross;
  }
  if (Math.abs(twiceArea) < 1e-12) {
    return geometryCenter(geometry);
  }
  return [centroidLng / (3 * twiceArea), centroidLat / (3 * twiceArea)];
};

const polygonArea = (geometry: Extract<FloorFeature["geometry"], { type: "Polygon" }>): number => {
  const ring = geometry.coordinates[0] ?? [];
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    if (!current || !next) {
      continue;
    }
    area += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(area / 2);
};

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const kindForGeometry = (geometryType: GeometryType): string => {
  if (geometryType === "Point") {
    return "amenity";
  }

  if (geometryType === "LineString") {
    return "opening";
  }

  return "unit";
};

const nameForGeometry = (geometryType: GeometryType): string => {
  if (geometryType === "Point") {
    return "New point";
  }

  if (geometryType === "LineString") {
    return "New opening";
  }

  return "New polygon";
};

const navigationNodeName = (category: NavigationNodeCategory): string =>
  `${category.replaceAll("_", " ")} node`;

const navigationEdgeName = (category: NavigationEdgeCategory): string =>
  category === "wheelchair" ? "Wheelchair path" : "Pedestrian path";

const PATH_NAME_PATTERN = /^Path (\d+)$/;

const readFeatureName = (feature: FloorFeature): string | undefined => {
  const name = feature.properties.name;
  if (typeof name === "string" && name.trim().length > 0) {
    return name.trim();
  }
  if (name && typeof name === "object" && !Array.isArray(name)) {
    const english = (name as { en?: unknown }).en;
    if (typeof english === "string" && english.trim().length > 0) {
      return english.trim();
    }
  }
  return undefined;
};

const nextPathNumberForLevel = (features: FloorFeature[], level_id: string): number => {
  let max = 0;
  for (const feature of features) {
    if (feature.properties.level_id !== level_id) {
      continue;
    }
    const type =
      typeof feature.feature_type === "string" ? feature.feature_type : feature.feature_type;
    if (type !== "opening" && type !== NAVIGATION_EDGE_FEATURE_TYPE) {
      continue;
    }
    const name = readFeatureName(feature);
    if (!name) {
      continue;
    }
    const match = PATH_NAME_PATTERN.exec(name);
    if (!match) {
      continue;
    }
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      max = Math.max(max, parsed);
    }
  }
  return max + 1;
};

const isFeatureOnLevel = (feature: FloorFeature, level_id: string): boolean =>
  featureHasLevel(feature, level_id);

const ensureNavigationEdgeEndpoints = (
  edge: FloorFeature,
  nodeCandidates: FloorFeature[],
  levelId: string,
): FloorFeature => {
  if (!isNavigationEdgeFeature(edge) || edge.geometry.type !== "LineString") {
    return edge;
  }
  const first = edge.geometry.coordinates[0];
  const last = edge.geometry.coordinates[edge.geometry.coordinates.length - 1];
  if (!first || !last) {
    return edge;
  }
  const sameLevelNodes = nodeCandidates.filter((candidate) =>
    readNavigationLevels(candidate).includes(levelId),
  );
  const fromNode = sameLevelNodes.find(
    (candidate) =>
      candidate.geometry.type === "Point" &&
      coordinatesEqual(candidate.geometry.coordinates, first),
  );
  const toNode = sameLevelNodes.find(
    (candidate) =>
      candidate.geometry.type === "Point" && coordinatesEqual(candidate.geometry.coordinates, last),
  );
  const nextProperties: FloorFeature["properties"] = {
    ...edge.properties,
    level_id: levelId,
    floorId: levelId,
  };
  if (fromNode) {
    nextProperties["formation:from_node_id"] = fromNode.id;
  } else {
    delete nextProperties["formation:from_node_id"];
  }
  if (toNode) {
    nextProperties["formation:to_node_id"] = toNode.id;
  } else {
    delete nextProperties["formation:to_node_id"];
  }
  return {
    ...edge,
    properties: nextProperties,
  };
};

const areFeatureListsEqual = (left: FloorFeature[], right: FloorFeature[]): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const saveEditorSnapshot = async (
  features: FloorFeature[],
  overlays: FloorOverlay[],
  lockedFeatureIds: string[],
  lockedOverlayFloorIds: string[],
  venues: Venue[],
  buildings: Building[],
  levels: Level[],
): Promise<void> => {
  await projectRepository.saveProject({
    id: PROJECT_ID,
    name: "Main project",
    version: PROJECT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    features,
    overlays,
    lockedFeatureIds,
    lockedOverlayFloorIds,
    venues,
    buildings,
    levels,
    floors: levels,
  });
};

function App() {
  const [initialMapView] = useState(() => getInitialMapView());
  const [theme, setTheme] = useState<ThemeId>(() => getInitialTheme());
  const [editorState, setEditorState] = useState<EditorState>(() => createInitialEditorState());
  const [overlays, setOverlays] = useState<FloorOverlay[]>([]);
  const [lockedFeatureIds, setLockedFeatureIds] = useState<string[]>([]);
  const [lockedOverlayFloorIds, setLockedOverlayFloorIds] = useState<string[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [selection, setSelection] = useState<Selection | undefined>(undefined);
  const [drawMode, setDrawMode] = useState<DrawMode>("select");
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [deleteRequestVersion, setDeleteRequestVersion] = useState(0);
  const [deleteVertexRequestVersion, setDeleteVertexRequestVersion] = useState(0);
  const [splitPathRequestVersion, setSplitPathRequestVersion] = useState(0);
  const [forkPathRequestVersion, setForkPathRequestVersion] = useState(0);
  const [pendingDrawTemplate, setPendingDrawTemplate] = useState<PendingDrawTemplate>();
  const [pendingContainmentParent, setPendingContainmentParent] = useState<
    ContainmentParent | undefined
  >();
  const [hasSelectedVertex, setHasSelectedVertex] = useState(false);
  const [mapStyleId, setMapStyleId] = useState<string>(DEFAULT_MAP_STYLE_ID);
  const [mapView, setMapView] = useState<{ center: Coordinates; zoom: number }>(initialMapView);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSearchResults, setLocationSearchResults] = useState<OpenCageSearchResult[]>([]);
  const [locationSearchStatus, setLocationSearchStatus] = useState<LocationSearchStatus>("idle");
  const [locationSearchNoResults, setLocationSearchNoResults] = useState(false);
  const [locationSearchFocused, setLocationSearchFocused] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation>();
  const [projectUndoStack, setProjectUndoStack] = useState<ProjectHistoryEntry[]>([]);
  const [projectRedoStack, setProjectRedoStack] = useState<ProjectHistoryEntry[]>([]);
  const [archiveNotices, setArchiveNotices] = useState<ArchiveNotice[]>([]);
  const [routePickEnabled, setRoutePickEnabled] = useState(false);
  const [routeStartCoordinate, setRouteStartCoordinate] = useState<Coordinates>();
  const [routeEndCoordinate, setRouteEndCoordinate] = useState<Coordinates>();
  const [relocationRequest, setRelocationRequest] = useState<MapRelocationRequest>({
    center: initialMapView.center,
    zoom: initialMapView.zoom,
    requestVersion: 1,
  });
  const projectUndoStackRef = useRef<ProjectHistoryEntry[]>([]);
  const projectRedoStackRef = useRef<ProjectHistoryEntry[]>([]);
  const overlayInteractionSnapshotRef = useRef<ProjectSnapshot | undefined>(undefined);
  const overlayInteractionChangedRef = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const runtimeConfig = getRuntimeConfig();
  const openCageApiKey = runtimeConfig.ok ? runtimeConfig.config.opencageApiKey : "";
  const lockedFeatureIdsSet = useMemo(() => new Set(lockedFeatureIds), [lockedFeatureIds]);
  const lockedOverlayFloorIdsSet = useMemo(
    () => new Set(lockedOverlayFloorIds),
    [lockedOverlayFloorIds],
  );

  const resolvedSelection = useMemo(
    () =>
      selection
        ? resolveSelection(selection, {
            buildings,
            venues,
            levels,
            features: editorState.features,
          })
        : undefined,
    [selection, venues, buildings, levels, editorState.features],
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

      if (project.version < 5) {
        void projectRepository.deleteProject(PROJECT_ID);
        return;
      }
      const migratedProject =
        project.version < PROJECT_SCHEMA_VERSION
          ? migrateProjectSnapshotToNavigationGraphV5(project)
          : project;
      const sanitizedProject = sanitizeProjectSnapshot(migratedProject);
      const loadedVenues = sanitizedProject.venues ?? [];
      const loadedBuildings = sanitizedProject.buildings ?? [];
      const loadedLevels = sanitizedProject.levels ?? [];
      const primaryLevel = loadedLevels[0];
      const primaryBuilding = loadedBuildings[0];

      const migratedFeatures = sanitizedProject.features.map((feature) => {
        const resolvedFloorId =
          typeof feature.properties.level_id === "string"
            ? feature.properties.level_id
            : primaryLevel?.id;

        return normalizeFeature(
          {
            ...feature,
            properties: {
              ...feature.properties,
              ...(resolvedFloorId ? { level_id: resolvedFloorId } : {}),
            },
          },
          {
            level_id: resolvedFloorId ?? "",
            buildingId:
              loadedLevels.find((level) => level.id === resolvedFloorId)?.buildingId ??
              primaryBuilding?.id ??
              "",
          },
        );
      });

      setEditorState(createInitialEditorState(migratedFeatures));
      setOverlays(sanitizedProject.overlays);
      setLockedFeatureIds(sanitizedProject.lockedFeatureIds ?? []);
      setLockedOverlayFloorIds(sanitizedProject.lockedOverlayFloorIds ?? []);
      setVenues(loadedVenues);
      setBuildings(loadedBuildings);
      setLevels(loadedLevels);
      setSelection(
        firstValidSelection({
          venues: loadedVenues,
          buildings: loadedBuildings,
          levels: loadedLevels,
          floors: loadedLevels,
          features: migratedFeatures,
        }),
      );
      projectUndoStackRef.current = [];
      projectRedoStackRef.current = [];
      overlayInteractionSnapshotRef.current = undefined;
      overlayInteractionChangedRef.current = false;
      setProjectUndoStack([]);
      setProjectRedoStack([]);
      setSaveStatus("saved");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSaveStatus("saving");
      void saveEditorSnapshot(
        editorState.features,
        overlays,
        lockedFeatureIds,
        lockedOverlayFloorIds,
        venues,
        buildings,
        levels,
      )
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
  }, [
    editorState.features,
    overlays,
    lockedFeatureIds,
    lockedOverlayFloorIds,
    venues,
    buildings,
    levels,
  ]);

  useEffect(() => {
    if (!selection) {
      const fallback = firstValidSelection({
        venues,
        buildings,
        levels,
        floors: levels,
        features: editorState.features,
      });
      setSelection(fallback);
      return;
    }

    if (resolvedSelection) {
      return;
    }

    const fallback = firstValidSelection({
      venues,
      buildings,
      levels,
      floors: levels,
      features: editorState.features,
    });
    setSelection(fallback);
    setEditorState((current) => selectFeature(current, undefined));
  }, [selection, resolvedSelection, venues, buildings, levels, editorState.features]);

  const selectedVenue =
    selection?.kind === "venue"
      ? venues.find((current) => current.id === selection.id)
      : resolvedSelection?.venue;
  const activeVenue = selectedVenue ?? venues[0];
  const activeBuilding = resolvedSelection?.building ?? buildings[0];
  const activeLevel =
    resolvedSelection?.floor ??
    levels.find((floor) => floor.buildingId === activeBuilding?.id) ??
    levels[0];

  const selectedFeature = useMemo(
    () => editorState.features.find((feature) => feature.id === editorState.selectedFeatureId),
    [editorState.features, editorState.selectedFeatureId],
  );

  const selectedOverlay = useMemo(
    () => overlays.find((overlay) => overlay.level_id === activeLevel?.id),
    [overlays, activeLevel?.id],
  );
  const selectedOverlayForMap = useMemo(() => {
    if (!selectedOverlay) {
      return undefined;
    }
    return {
      ...selectedOverlay,
      locked: lockedOverlayFloorIdsSet.has(selectedOverlay.level_id ?? selectedOverlay.floorId),
    };
  }, [selectedOverlay, lockedOverlayFloorIdsSet]);

  useEffect(() => {
    setBuildings((current) => {
      let changed = false;
      const next = current.map((building) => {
        const floorIds = levels
          .filter((floor) => floor.buildingId === building.id)
          .map((floor) => floor.id);
        const levelPolygons = editorState.features
          .filter((feature) =>
            floorIds.includes(
              (typeof feature.properties.level_id === "string"
                ? feature.properties.level_id
                : feature.properties.floorId) ?? "",
            ),
          )
          .filter(
            (feature) =>
              feature.geometry.type === "Polygon" && String(feature.feature_type) === "level",
          )
          .map(
            (feature) => feature.geometry as Extract<FloorFeature["geometry"], { type: "Polygon" }>,
          );
        if (levelPolygons.length === 0) {
          return building;
        }
        let totalWeight = 0;
        let weightedLng = 0;
        let weightedLat = 0;
        for (const polygon of levelPolygons) {
          const center = polygonCentroid(polygon);
          if (!center) {
            continue;
          }
          const weight = Math.max(polygonArea(polygon), 1e-8);
          totalWeight += weight;
          weightedLng += center[0] * weight;
          weightedLat += center[1] * weight;
        }
        if (totalWeight === 0) {
          return building;
        }
        const location: Coordinates = [weightedLng / totalWeight, weightedLat / totalWeight];
        if (
          building.location &&
          Math.abs(building.location[0] - location[0]) < 1e-10 &&
          Math.abs(building.location[1] - location[1]) < 1e-10
        ) {
          return building;
        }
        changed = true;
        return { ...building, location };
      });
      return changed ? next : current;
    });
  }, [editorState.features, levels]);

  const visibleFeatures = useMemo(() => {
    if (!activeLevel) {
      return [];
    }

    return sortFeaturesForRendering(
      editorState.features.filter((feature) => isFeatureOnLevel(feature, activeLevel.id)),
    );
  }, [editorState.features, activeLevel]);

  const navigationGraph = useMemo(
    () => buildNavigationGraph(editorState.features),
    [editorState.features],
  );
  const routeResult = useMemo(() => {
    if (!activeLevel || !routeStartCoordinate || !routeEndCoordinate) {
      return undefined;
    }
    return findRouteBetweenPoints(
      navigationGraph,
      routeStartCoordinate,
      routeEndCoordinate,
      activeLevel.id,
    );
  }, [navigationGraph, routeStartCoordinate, routeEndCoordinate, activeLevel]);

  const routeOverlayFeatures = useMemo(() => {
    if (!activeLevel || !routeResult?.found) {
      return [] as FloorFeature[];
    }
    const routeFeatures: FloorFeature[] = [];
    routeFeatures.push({
      type: "Feature",
      id: "route-line",
      feature_type: "formation:route-edge",
      geometry: {
        type: "LineString",
        coordinates: routeResult.routeCoordinates,
      },
      properties: {
        level_id: activeLevel.id,
      },
    });
    if (routeResult.snappedStart) {
      routeFeatures.push({
        type: "Feature",
        id: "route-start",
        feature_type: "formation:route-node",
        geometry: {
          type: "Point",
          coordinates: routeResult.snappedStart,
        },
        properties: {
          level_id: activeLevel.id,
        },
      });
    }
    if (routeResult.snappedEnd) {
      routeFeatures.push({
        type: "Feature",
        id: "route-end",
        feature_type: "formation:route-node",
        geometry: {
          type: "Point",
          coordinates: routeResult.snappedEnd,
        },
        properties: {
          level_id: activeLevel.id,
        },
      });
    }
    return routeFeatures;
  }, [routeResult, activeLevel]);

  const selectedFeatureForMap =
    selectedFeature && activeLevel && isFeatureOnLevel(selectedFeature, activeLevel.id)
      ? selectedFeature
      : undefined;

  const snapshotProjectState = useCallback(
    (): ProjectSnapshot => ({
      editorState: structuredClone(editorState),
      overlays: structuredClone(overlays),
      venues: structuredClone(venues),
      buildings: structuredClone(buildings),
      levels: structuredClone(levels),
      selection: selection ? structuredClone(selection) : undefined,
      drawMode,
    }),
    [editorState, overlays, venues, buildings, levels, selection, drawMode],
  );

  const restoreProjectState = useCallback((snapshot: ProjectSnapshot) => {
    setEditorState(snapshot.editorState);
    setOverlays(snapshot.overlays);
    setVenues(snapshot.venues);
    setBuildings(snapshot.buildings);
    setLevels(snapshot.levels);
    setSelection(snapshot.selection);
    setDrawMode(snapshot.drawMode);
  }, []);

  const applyProjectMutation = useCallback(
    (label: string, apply: () => void) => {
      const snapshot = snapshotProjectState();
      apply();
      const nextUndo = [...projectUndoStackRef.current, { label, snapshot }];
      projectUndoStackRef.current = nextUndo;
      projectRedoStackRef.current = [];
      setProjectUndoStack(nextUndo);
      setProjectRedoStack([]);
    },
    [snapshotProjectState],
  );

  const pushProjectUndoSnapshot = useCallback((label: string, snapshot: ProjectSnapshot) => {
    const nextUndo = [...projectUndoStackRef.current, { label, snapshot }];
    projectUndoStackRef.current = nextUndo;
    projectRedoStackRef.current = [];
    setProjectUndoStack(nextUndo);
    setProjectRedoStack([]);
  }, []);

  const undoProjectMutation = useCallback((): boolean => {
    const previous = projectUndoStackRef.current.at(-1);
    if (!previous) {
      return false;
    }

    const currentSnapshot = snapshotProjectState();
    restoreProjectState(previous.snapshot);
    const nextUndo = projectUndoStackRef.current.slice(0, -1);
    const nextRedo = [
      ...projectRedoStackRef.current,
      { label: previous.label, snapshot: currentSnapshot },
    ];
    projectUndoStackRef.current = nextUndo;
    projectRedoStackRef.current = nextRedo;
    setProjectUndoStack(nextUndo);
    setProjectRedoStack(nextRedo);
    return true;
  }, [restoreProjectState, snapshotProjectState]);

  const redoProjectMutation = useCallback((): boolean => {
    const next = projectRedoStackRef.current.at(-1);
    if (!next) {
      return false;
    }

    const currentSnapshot = snapshotProjectState();
    restoreProjectState(next.snapshot);
    const nextRedo = projectRedoStackRef.current.slice(0, -1);
    const nextUndo = [
      ...projectUndoStackRef.current,
      { label: next.label, snapshot: currentSnapshot },
    ];
    projectUndoStackRef.current = nextUndo;
    projectRedoStackRef.current = nextRedo;
    setProjectRedoStack(nextRedo);
    setProjectUndoStack(nextUndo);
    return true;
  }, [restoreProjectState, snapshotProjectState]);

  const undoAction = useCallback(() => {
    if (undoProjectMutation()) {
      return;
    }

    setEditorState((current) => undo(current));
  }, [undoProjectMutation]);

  const redoAction = useCallback(() => {
    if (redoProjectMutation()) {
      return;
    }

    setEditorState((current) => redo(current));
  }, [redoProjectMutation]);

  const requestProjectConfirmation = useCallback((confirmation: PendingConfirmation) => {
    setPendingConfirmation(confirmation);
  }, []);

  const startDrawMode = useCallback(
    (mode: DrawMode) => {
      setDrawMode(mode);
      setPendingDrawTemplate(undefined);
      setPendingContainmentParent(undefined);
      setHasSelectedVertex(false);
      if (mode !== "select") {
        setEditorState((current) => selectFeature(current, undefined));
        if (activeLevel) {
          setSelection({ kind: "level", id: activeLevel.id });
        }
      }
    },
    [activeLevel],
  );

  const cancelDrawMode = useCallback(() => {
    setDrawMode("select");
    setPendingDrawTemplate(undefined);
    setPendingContainmentParent(undefined);
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
      if (!activeLevel || !activeBuilding) {
        return;
      }

      let consumedPendingTemplate = false;

      setEditorState((current) => {
        let nextPathNumber = nextPathNumberForLevel(current.features, activeLevel.id);
        const currentVisible = current.features.filter((feature) =>
          isFeatureOnLevel(feature, activeLevel.id),
        );
        const currentVisibleById = new Map(currentVisible.map((feature) => [feature.id, feature]));

        const nextVisible = featuresFromMap.map((feature) => {
          const existing = currentVisibleById.get(feature.id);
          if (lockedFeatureIdsSet.has(feature.id) && existing) {
            return existing;
          }
          const shouldApplyPendingTemplate =
            !existing &&
            pendingDrawTemplate &&
            pendingDrawTemplate.geometryType === feature.geometry.type;
          if (shouldApplyPendingTemplate) {
            consumedPendingTemplate = true;
          }
          const mergedProperties = shouldApplyPendingTemplate
            ? applyContainmentParent(
                {
                  ...feature.properties,
                  ...pendingDrawTemplate.properties,
                  feature_type: pendingDrawTemplate.featureType,
                  name: pendingDrawTemplate.defaultName,
                },
                pendingContainmentParent,
              )
            : {
                ...(existing?.properties ?? {}),
                ...feature.properties,
              };
          const featureType =
            (typeof mergedProperties.feature_type === "string" && mergedProperties.feature_type) ||
            (shouldApplyPendingTemplate ? pendingDrawTemplate?.featureType : undefined);
          const isNewPath =
            !existing &&
            feature.geometry.type === "LineString" &&
            (featureType === "opening" || featureType === NAVIGATION_EDGE_FEATURE_TYPE);
          const resolvedName = isNewPath
            ? `Path ${nextPathNumber++}`
            : typeof mergedProperties.name === "string" && mergedProperties.name
              ? mergedProperties.name
              : (existing?.properties.name ?? nameForGeometry(feature.geometry.type));

          return normalizeFeature(
            {
              ...feature,
              feature_type: ((typeof feature.feature_type === "string" && feature.feature_type) ||
                (typeof mergedProperties.feature_type === "string"
                  ? mergedProperties.feature_type
                  : undefined) ||
                kindForGeometry(feature.geometry.type)) as Exclude<
                FloorFeature["feature_type"],
                undefined
              >,
              properties: {
                ...mergedProperties,
                level_id:
                  mergedProperties.level_id ?? existing?.properties.level_id ?? activeLevel.id,
                feature_type:
                  typeof mergedProperties.feature_type === "string" && mergedProperties.feature_type
                    ? mergedProperties.feature_type
                    : kindForGeometry(feature.geometry.type),
                name: resolvedName,
              },
            },
            {
              level_id: activeLevel.id,
              buildingId: activeBuilding.id,
            },
          );
        });

        for (const existing of currentVisible) {
          if (!lockedFeatureIdsSet.has(existing.id)) {
            continue;
          }
          if (nextVisible.some((feature) => feature.id === existing.id)) {
            continue;
          }
          nextVisible.push(existing);
        }

        const nodeCandidates = [...current.features, ...nextVisible].filter(
          isNavigationNodeFeature,
        );
        const constrainedVisible = nextVisible.map((feature) => {
          if (!isNavigationEdgeFeature(feature)) {
            return feature;
          }
          return ensureNavigationEdgeEndpoints(feature, nodeCandidates, activeLevel.id);
        });

        if (areFeatureListsEqual(currentVisible, constrainedVisible)) {
          return current;
        }

        const nonVisible = current.features.filter(
          (feature) => !isFeatureOnLevel(feature, activeLevel.id),
        );
        const nextFeatures = [...nonVisible, ...constrainedVisible];
        const nextSelectedFeatureId =
          current.selectedFeatureId &&
          nextFeatures.some((feature) => feature.id === current.selectedFeatureId)
            ? current.selectedFeatureId
            : undefined;

        return selectFeature(replaceAllFeatures(current, nextFeatures), nextSelectedFeatureId);
      });

      if (consumedPendingTemplate) {
        setPendingDrawTemplate(undefined);
        setPendingContainmentParent(undefined);
      }
    },
    [
      activeLevel,
      activeBuilding,
      pendingDrawTemplate,
      pendingContainmentParent,
      lockedFeatureIdsSet,
    ],
  );

  const onDrawSelectionChange = useCallback(
    (featureId: string | undefined) => {
      if (!featureId) {
        setEditorState((current) => selectFeature(current, undefined));
        if (activeLevel) {
          setSelection({ kind: "level", id: activeLevel.id });
        }
        return;
      }

      const feature = editorState.features.find((current) => current.id === featureId);
      if (!feature) {
        setEditorState((current) => selectFeature(current, undefined));
        return;
      }
      if (lockedFeatureIdsSet.has(feature.id)) {
        setEditorState((current) => selectFeature(current, undefined));
        if (activeLevel) {
          setSelection({ kind: "level", id: activeLevel.id });
        }
        return;
      }

      setEditorState((current) => selectFeature(current, featureId));
      setSelection({ kind: "feature", id: featureId });
      setDrawMode("select");
    },
    [editorState.features, activeLevel, lockedFeatureIdsSet],
  );

  const onInteractionModeChange = useCallback((mode: DrawMode) => {
    setDrawMode(mode);
    if (mode !== "select") {
      setHasSelectedVertex(false);
    }
  }, []);

  const onRouteMapClick = useCallback(
    (coordinate: Coordinates) => {
      if (!activeLevel || !routePickEnabled || drawMode !== "select") {
        return;
      }
      if (!routeStartCoordinate || routeEndCoordinate) {
        setRouteStartCoordinate(coordinate);
        setRouteEndCoordinate(undefined);
        return;
      }
      setRouteEndCoordinate(coordinate);
    },
    [activeLevel, routePickEnabled, drawMode, routeStartCoordinate, routeEndCoordinate],
  );

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
        redoAction();
        return;
      }

      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoAction();
        return;
      }

      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoAction();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [cancelDrawMode, deleteSelection, deleteVertex, hasSelectedVertex, redoAction, undoAction]);

  const applyToCurrentOverlay = useCallback(
    (transform: (overlay: FloorOverlay) => FloorOverlay) => {
      if (!activeLevel) {
        return;
      }

      setOverlays((current) =>
        current.map((overlay) => {
          if (
            overlay.level_id !== activeLevel.id ||
            lockedOverlayFloorIdsSet.has(overlay.level_id ?? overlay.floorId)
          ) {
            return overlay;
          }

          return transform(overlay);
        }),
      );
    },
    [activeLevel, lockedOverlayFloorIdsSet],
  );

  const onOverlayInteractionStart = useCallback(() => {
    if (overlayInteractionSnapshotRef.current) {
      return;
    }

    overlayInteractionSnapshotRef.current = snapshotProjectState();
    overlayInteractionChangedRef.current = false;
  }, [snapshotProjectState]);

  const onOverlayCornersChange = useCallback(
    (corners: OverlayCorners) => {
      if (!activeLevel) {
        return;
      }

      const interactionSnapshot = overlayInteractionSnapshotRef.current;
      if (interactionSnapshot) {
        const previousOverlay = interactionSnapshot.overlays.find(
          (overlay) => overlay.level_id === activeLevel.id,
        );
        if (previousOverlay && !overlayCornersEqual(previousOverlay.corners, corners)) {
          overlayInteractionChangedRef.current = true;
        }
      }

      applyToCurrentOverlay((overlay) => ({
        ...overlay,
        corners,
        updatedAt: new Date().toISOString(),
      }));
    },
    [activeLevel, applyToCurrentOverlay],
  );

  const onOverlayInteractionEnd = useCallback(() => {
    const interactionSnapshot = overlayInteractionSnapshotRef.current;
    const changed = overlayInteractionChangedRef.current;
    overlayInteractionSnapshotRef.current = undefined;
    overlayInteractionChangedRef.current = false;
    if (!interactionSnapshot || !changed) {
      return;
    }

    pushProjectUndoSnapshot("Overlay adjusted", interactionSnapshot);
  }, [pushProjectUndoSnapshot]);

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

  const levelCenter = useCallback(
    (level_id: string): Coordinates | undefined => {
      const floorOverlay = overlays.find((overlay) => overlay.level_id === level_id);
      if (floorOverlay) {
        return overlayCenter(floorOverlay.corners);
      }

      const floorFeatures = editorState.features.filter(
        (feature) => feature.properties.level_id === level_id,
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

      const floorIds = levels
        .filter((floor) => floor.buildingId === buildingId)
        .map((floor) => floor.id);
      for (const level_id of floorIds) {
        const center = levelCenter(level_id);
        if (center) {
          return center;
        }
      }

      return undefined;
    },
    [buildings, levels, levelCenter],
  );

  const uploadOverlayForCurrentFloor = useCallback(
    (file: File) => {
      if (!activeLevel) {
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
            floorId: activeLevel.id,
            level_id: activeLevel.id,
            imageName: file.name,
            imageDataUrl: dataUrl,
            opacity: selectedOverlay?.opacity ?? 30,
            visible: selectedOverlay?.visible ?? true,
            corners: selectedOverlay?.corners ?? cornersAroundView(mapView.center, mapView.zoom),
            updatedAt: new Date().toISOString(),
          };

          const withoutCurrent = current.filter((overlay) => overlay.level_id !== activeLevel.id);
          return [...withoutCurrent, nextOverlay];
        });
      };
      reader.readAsDataURL(file);
    },
    [mapView.center, mapView.zoom, activeLevel, selectedOverlay],
  );

  const selectNode = useCallback(
    (nextSelection: Selection) => {
      let targetCenter: Coordinates | undefined;
      if (nextSelection.kind === "venue") {
        const venueBuilding = buildings.find((building) => building.venueId === nextSelection.id);
        targetCenter = venueBuilding ? buildingCenter(venueBuilding.id) : undefined;
      } else if (nextSelection.kind === "building") {
        targetCenter = buildingCenter(nextSelection.id);
      } else if (nextSelection.kind === "floor" || nextSelection.kind === "level") {
        targetCenter = levelCenter(nextSelection.id);
      } else {
        const feature = editorState.features.find((current) => current.id === nextSelection.id);
        targetCenter = feature ? geometryCenter(feature.geometry) : undefined;
      }

      if (targetCenter) {
        relocateMap(targetCenter);
      }

      setSelection(nextSelection);
      cancelDrawMode();
      if (nextSelection.kind === "feature") {
        setEditorState((current) => selectFeature(current, nextSelection.id));
        return;
      }

      setEditorState((current) => selectFeature(current, undefined));
    },
    [buildingCenter, buildings, cancelDrawMode, editorState.features, levelCenter, relocateMap],
  );

  const onAddBuilding = useCallback(
    (venueId: string) => {
      const resolvedVenueId = venueId || activeVenue?.id || venues[0]?.id || createId();
      const buildingCount = buildings.filter(
        (current) => (current.venueId ?? resolvedVenueId) === resolvedVenueId,
      ).length;
      const buildingId = createId();
      const levelId = createId();
      const building: Building = {
        id: buildingId,
        venueId: resolvedVenueId,
        name: `Building ${buildingCount + 1}`,
        location: mapView.center,
      };
      const level: Level = {
        id: levelId,
        buildingId,
        name: "Ground Level",
      };

      applyProjectMutation("Building added", () => {
        setBuildings((current) => [...current, building]);
        setLevels((current) => [...current, level]);
        setSelection({ kind: "level", id: levelId });
        setEditorState((current) => selectFeature(current, undefined));
      });
    },
    [activeVenue?.id, applyProjectMutation, buildings, mapView.center, venues],
  );

  const onAddVenue = useCallback(() => {
    const venueId = createId();
    const venueName = `Venue ${venues.length + 1}`;
    applyProjectMutation("Venue added", () => {
      setVenues((current) => [...current, { id: venueId, name: venueName }]);
      setSelection({ kind: "venue", id: venueId });
      setEditorState((current) => selectFeature(current, undefined));
    });
  }, [applyProjectMutation, venues.length]);

  const onDeleteBuilding = useCallback(
    (buildingId: string) => {
      const floorsToDelete = levels
        .filter((floor) => floor.buildingId === buildingId)
        .map((floor) => floor.id);
      const buildingName =
        buildings.find((building) => building.id === buildingId)?.name ?? "building";

      requestProjectConfirmation({
        title: "Delete building?",
        message: `Delete "${buildingName}" and all its levels and features?`,
        confirmLabel: "Yes",
        apply: () =>
          applyProjectMutation("Building deleted", () => {
            const nextBuildings = buildings.filter((building) => building.id !== buildingId);
            const nextLevels = levels.filter((floor) => floor.buildingId !== buildingId);
            const nextFeatures = editorState.features.filter(
              (feature) => !floorsToDelete.includes(feature.properties.level_id ?? ""),
            );

            setBuildings(nextBuildings);
            setLevels(nextLevels);
            setOverlays((current) =>
              current.filter(
                (overlay) => !floorsToDelete.includes(overlay.level_id ?? overlay.floorId),
              ),
            );
            setLockedOverlayFloorIds((current) =>
              current.filter((level_id) => !floorsToDelete.includes(level_id)),
            );
            setLockedFeatureIds((current) =>
              current.filter((featureId) =>
                nextFeatures.some((feature) => feature.id === featureId),
              ),
            );
            setEditorState((current) =>
              replaceAllFeatures(selectFeature(current, undefined), nextFeatures),
            );

            const nextSelection = firstValidSelection({
              venues,
              buildings: nextBuildings,
              levels: nextLevels,
              floors: nextLevels,
              features: nextFeatures,
            });
            setSelection(nextSelection);
          }),
      });
    },
    [
      venues,
      buildings,
      levels,
      editorState.features,
      applyProjectMutation,
      requestProjectConfirmation,
    ],
  );

  const onAddLevel = useCallback(
    (buildingId: string) => {
      const nextLevel: Level = {
        id: createId(),
        buildingId,
        name: `Level ${levels.filter((current) => current.buildingId === buildingId).length + 1}`,
      };

      applyProjectMutation("Level added", () => {
        setLevels((current) => [...current, nextLevel]);
        setSelection({ kind: "level", id: nextLevel.id });
        setEditorState((current) => selectFeature(current, undefined));
      });
    },
    [applyProjectMutation, levels],
  );

  const onRenameBuilding = useCallback(
    (buildingId: string, name: string) => {
      applyProjectMutation("Building renamed", () => {
        setBuildings((current) =>
          current.map((building) =>
            building.id === buildingId
              ? { ...building, name: name || "Untitled building" }
              : building,
          ),
        );
      });
    },
    [applyProjectMutation],
  );

  const onRenameVenue = useCallback(
    (venueId: string, name: string) => {
      applyProjectMutation("Venue renamed", () => {
        setVenues((current) =>
          current.map((venue) =>
            venue.id === venueId ? { ...venue, name: name || "Untitled venue" } : venue,
          ),
        );
      });
    },
    [applyProjectMutation],
  );

  const onDeleteVenue = useCallback(
    (venueId: string) => {
      const venue = venues.find((current) => current.id === venueId);
      if (!venue) {
        return;
      }

      const buildingIdsToDelete = buildings
        .filter((building) => building.venueId === venueId)
        .map((building) => building.id);
      const levelIdsToDelete = levels
        .filter((level) => buildingIdsToDelete.includes(level.buildingId))
        .map((level) => level.id);

      requestProjectConfirmation({
        title: "Delete venue?",
        message: `Delete "${venue.name}" and all its buildings, levels, and features?`,
        confirmLabel: "Yes",
        apply: () =>
          applyProjectMutation("Venue deleted", () => {
            const nextVenues = venues.filter((current) => current.id !== venueId);
            const nextBuildings = buildings.filter((building) => building.venueId !== venueId);
            const nextLevels = levels.filter(
              (level) => !buildingIdsToDelete.includes(level.buildingId),
            );
            const nextFeatures = editorState.features.filter(
              (feature) => !levelIdsToDelete.includes(feature.properties.level_id ?? ""),
            );

            setVenues(nextVenues);
            setBuildings(nextBuildings);
            setLevels(nextLevels);
            setOverlays((current) =>
              current.filter(
                (overlay) => !levelIdsToDelete.includes(overlay.level_id ?? overlay.floorId),
              ),
            );
            setLockedOverlayFloorIds((current) =>
              current.filter((level_id) => !levelIdsToDelete.includes(level_id)),
            );
            setLockedFeatureIds((current) =>
              current.filter((featureId) =>
                nextFeatures.some((feature) => feature.id === featureId),
              ),
            );
            setEditorState((current) =>
              replaceAllFeatures(selectFeature(current, undefined), nextFeatures),
            );

            const nextSelection = firstValidSelection({
              venues: nextVenues,
              buildings: nextBuildings,
              levels: nextLevels,
              floors: nextLevels,
              features: nextFeatures,
            });
            setSelection(nextSelection);
          }),
      });
    },
    [
      venues,
      buildings,
      levels,
      editorState.features,
      applyProjectMutation,
      requestProjectConfirmation,
    ],
  );

  const onUpdateBuildingVenueCategory = useCallback(
    (buildingId: string, category: string) => {
      applyProjectMutation("Building venue category updated", () => {
        setBuildings((current) =>
          current.map((building) =>
            building.id === buildingId
              ? {
                  ...building,
                  imdf: {
                    ...building.imdf,
                    venue: {
                      ...building.imdf?.venue,
                      category,
                    },
                  },
                }
              : building,
          ),
        );
      });
    },
    [applyProjectMutation],
  );

  const onUpdateBuildingAddressField = useCallback(
    (buildingId: string, field: string, value: string) => {
      applyProjectMutation("Building address updated", () => {
        setBuildings((current) =>
          current.map((building) =>
            building.id === buildingId
              ? {
                  ...building,
                  imdf: {
                    ...building.imdf,
                    address: {
                      ...building.imdf?.address,
                      [field]: value,
                    },
                  },
                }
              : building,
          ),
        );
      });
    },
    [applyProjectMutation],
  );

  const onAddBuildingDirectoryEntry = useCallback(
    (buildingId: string) => {
      applyProjectMutation("Building directory entry added", () => {
        setBuildings((current) =>
          current.map((building) =>
            building.id === buildingId
              ? {
                  ...building,
                  imdf: {
                    ...building.imdf,
                    directory: [
                      ...(building.imdf?.directory ?? []),
                      {
                        id: createId(),
                        name: { en: "Directory entry" },
                      },
                    ],
                  },
                }
              : building,
          ),
        );
      });
    },
    [applyProjectMutation],
  );

  const onUpdateBuildingDirectoryEntry = useCallback(
    (
      buildingId: string,
      entryId: string,
      field: "name" | "category" | "phone" | "website" | "hours" | "anchor_id" | "unit_ids",
      value: string | string[] | undefined,
    ) => {
      applyProjectMutation("Building directory entry updated", () => {
        setBuildings((current) =>
          current.map((building) => {
            if (building.id !== buildingId) {
              return building;
            }
            const directory = (building.imdf?.directory ?? []).map((entry) => {
              if (entry.id !== entryId) {
                return entry;
              }
              if (field === "name") {
                const nextName = typeof value === "string" && value.trim().length > 0 ? value : "";
                return {
                  ...entry,
                  name: { ...entry.name, en: nextName || "Directory entry" },
                };
              }
              if (field === "unit_ids") {
                return {
                  ...entry,
                  unit_ids: Array.isArray(value) ? value : [],
                };
              }
              return {
                ...entry,
                [field]: typeof value === "string" && value.length > 0 ? value : undefined,
              };
            });
            return {
              ...building,
              imdf: {
                ...building.imdf,
                directory,
              },
            };
          }),
        );
      });
    },
    [applyProjectMutation],
  );

  const onDeleteBuildingDirectoryEntry = useCallback(
    (buildingId: string, entryId: string) => {
      applyProjectMutation("Building directory entry removed", () => {
        setBuildings((current) =>
          current.map((building) =>
            building.id === buildingId
              ? {
                  ...building,
                  imdf: {
                    ...building.imdf,
                    directory: (building.imdf?.directory ?? []).filter(
                      (entry) => entry.id !== entryId,
                    ),
                  },
                }
              : building,
          ),
        );
      });
    },
    [applyProjectMutation],
  );

  const onReverseGeocodeBuildingAddress = useCallback(
    async (buildingId: string) => {
      if (!openCageApiKey) {
        return;
      }

      const building = buildings.find((current) => current.id === buildingId);
      if (!building) {
        return;
      }

      const centroid = buildingCenter(buildingId) ?? building.location;
      if (!centroid) {
        return;
      }

      try {
        const result = await reverseGeocodeOpenCage(centroid, openCageApiKey);
        if (!result) {
          return;
        }

        const nextAddressFields = {
          address: result.address ?? "",
          locality: result.locality ?? "",
          province: result.province ?? "",
          postal_code: result.postal_code ?? "",
          country: result.country ?? "",
        };
        const existingAddress = building.imdf?.address;
        const requiresConfirmation = (
          Object.entries(nextAddressFields) as Array<[keyof typeof nextAddressFields, string]>
        ).some(([field, value]) => {
          const current = existingAddress?.[field];
          return typeof current === "string" && current.trim().length > 0 && current !== value;
        });

        const applyAddressUpdate = () => {
          applyProjectMutation("Building address reverse geocoded", () => {
            setBuildings((current) =>
              current.map((candidate) =>
                candidate.id === buildingId
                  ? {
                      ...candidate,
                      imdf: {
                        ...candidate.imdf,
                        address: {
                          ...candidate.imdf?.address,
                          ...nextAddressFields,
                        },
                      },
                    }
                  : candidate,
              ),
            );
          });
        };

        if (requiresConfirmation) {
          requestProjectConfirmation({
            title: "Replace building address?",
            message: "Reverse geocoding found new address values. Replace existing address fields?",
            confirmLabel: "Replace",
            apply: applyAddressUpdate,
          });
          return;
        }

        applyAddressUpdate();
      } catch (error: unknown) {
        clientLogger.error("geocoding.opencage_reverse_failed", {
          error,
          buildingId,
        });
      }
    },
    [openCageApiKey, buildings, buildingCenter, applyProjectMutation, requestProjectConfirmation],
  );

  const onExportBuildingArchive = useCallback(
    async (buildingId: string) => {
      const building = buildings.find((current) => current.id === buildingId);
      if (!building) {
        return;
      }
      try {
        const result = await exportBuildingImdfZip({
          building,
          floors: levels,
          features: editorState.features,
          overlays,
        });
        setArchiveNotices([
          ...result.warnings.map((warning) => ({
            level: "warning" as const,
            message: warning,
          })),
          {
            level: "info",
            message: `Exported building "${building.name}".`,
          },
        ]);
        downloadBlob(
          result.blob,
          `${building.name.replaceAll(/\s+/g, "-").toLowerCase()}.imdf.zip`,
        );
      } catch (error) {
        setArchiveNotices([
          {
            level: "error",
            message:
              error instanceof Error
                ? error.message
                : "IMDF export blocked due to validation errors.",
          },
        ]);
      }
    },
    [buildings, editorState.features, levels, overlays],
  );

  const onExportVenueArchive = useCallback(
    async (venueId: string) => {
      const venue = venues.find((current) => current.id === venueId);
      if (!venue) {
        return;
      }
      try {
        const result = await exportVenueImdfZip({
          venue,
          buildings,
          floors: levels,
          features: editorState.features,
          overlays,
        });
        setArchiveNotices([
          ...result.warnings.map((warning) => ({
            level: "warning" as const,
            message: warning,
          })),
          {
            level: "info",
            message: `Exported venue "${venue.name}".`,
          },
        ]);
        downloadBlob(result.blob, `${venue.name.replaceAll(/\s+/g, "-").toLowerCase()}.imdf.zip`);
      } catch (error) {
        setArchiveNotices([
          {
            level: "error",
            message:
              error instanceof Error
                ? error.message
                : "IMDF export blocked due to validation errors.",
          },
        ]);
      }
    },
    [venues, buildings, editorState.features, levels, overlays],
  );

  const onExportProjectArchive = useCallback(async () => {
    try {
      const result = await exportProjectImdfZip({
        venues,
        buildings,
        floors: levels,
        features: editorState.features,
        overlays,
      });
      setArchiveNotices([
        ...result.warnings.map((warning) => ({
          level: "warning" as const,
          message: warning,
        })),
        {
          level: "info",
          message: "Exported project archive.",
        },
      ]);
      downloadBlob(result.blob, "project.imdf.zip");
    } catch (error) {
      setArchiveNotices([
        {
          level: "error",
          message:
            error instanceof Error
              ? error.message
              : "IMDF export blocked due to validation errors.",
        },
      ]);
    }
  }, [venues, buildings, editorState.features, levels, overlays]);

  const onImportArchives = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      const notices: ArchiveNotice[] = [];
      try {
        let incoming: ImportEntityData = importEntityDataFromState([], [], [], [], []);
        let importedArchiveCount = 0;

        const seenIncomingIds = {
          venue: new Set<string>(),
          building: new Set<string>(),
          level: new Set<string>(),
          feature: new Set<string>(),
          overlay: new Set<string>(),
        };

        for (const file of files) {
          let imported: Awaited<ReturnType<typeof importImdfArchiveZip>>;
          try {
            imported = await importImdfArchiveZip(file);
          } catch (error: unknown) {
            clientLogger.error("imdf.import_failed", {
              error,
              fileName: file.name,
            });
            notices.push({
              level: "error",
              message: `${file.name}: import failed. The archive may be invalid or unsupported.`,
            });
            continue;
          }

          if (!imported.ok) {
            notices.push(
              ...imported.errors.map((message) => ({
                level: "error" as const,
                message: `${file.name}: ${message}`,
              })),
            );
            notices.push(
              ...imported.warnings.map((message) => ({
                level: "warning" as const,
                message: `${file.name}: ${message}`,
              })),
            );
            continue;
          }

          importedArchiveCount += 1;
          const payload: ImportEntityData = {
            venues: imported.value.venues,
            buildings: imported.value.buildings,
            floors: imported.value.floors,
            features: imported.value.features,
            overlays: imported.value.overlays,
          };

          const checkIncomingDuplicates = <T extends { id: string }>(
            label: string,
            items: T[],
            seen: Set<string>,
          ) => {
            for (const item of items) {
              if (seen.has(item.id)) {
                notices.push({
                  level: "warning",
                  message: `${file.name}: duplicate ${label} id "${item.id}" overrides previous import data.`,
                });
              }
              seen.add(item.id);
            }
          };

          checkIncomingDuplicates("venue", payload.venues, seenIncomingIds.venue);
          checkIncomingDuplicates("building", payload.buildings, seenIncomingIds.building);
          checkIncomingDuplicates("level", payload.floors, seenIncomingIds.level);
          checkIncomingDuplicates("feature", payload.features, seenIncomingIds.feature);
          checkIncomingDuplicates("overlay", payload.overlays, seenIncomingIds.overlay);

          incoming = mergeImportedDataReplaceConflicts(incoming, payload);
          notices.push(
            ...imported.value.warnings.map((message) => ({
              level: "warning" as const,
              message: `${file.name}: ${message}`,
            })),
          );
        }

        if (importedArchiveCount === 0) {
          setArchiveNotices(
            notices.length > 0
              ? notices
              : [
                  {
                    level: "error",
                    message: "No archives were imported.",
                  },
                ],
          );
          return;
        }

        notices.push({
          level: "info",
          message: `Parsed ${importedArchiveCount} archive${importedArchiveCount === 1 ? "" : "s"}: ${incoming.venues.length} venues, ${incoming.buildings.length} buildings, ${incoming.floors.length} levels, ${incoming.features.length} features.`,
        });

        const currentData = importEntityDataFromState(
          venues,
          buildings,
          levels,
          editorState.features,
          overlays,
        );
        const conflicts = detectImportConflicts(currentData, incoming);
        const applyImport = () => {
          applyProjectMutation("IMDF archives imported", () => {
            const merged = mergeImportedDataReplaceConflicts(currentData, incoming);
            const sanitized = sanitizeProjectSnapshot({
              id: PROJECT_ID,
              name: "Main project",
              version: PROJECT_SCHEMA_VERSION,
              updatedAt: new Date().toISOString(),
              features: merged.features,
              overlays: merged.overlays,
              lockedFeatureIds,
              lockedOverlayFloorIds,
              venues: merged.venues,
              buildings: merged.buildings,
              levels: merged.floors,
              floors: merged.floors,
            });
            setVenues(sanitized.venues ?? []);
            setBuildings(sanitized.buildings ?? []);
            setLevels(sanitized.levels ?? []);
            setOverlays(sanitized.overlays);
            setEditorState((current) => replaceAllFeatures(current, sanitized.features));
            setSelection((currentSelection) => {
              if (!currentSelection) {
                return firstValidSelection({
                  venues: sanitized.venues ?? [],
                  buildings: sanitized.buildings ?? [],
                  levels: sanitized.levels ?? [],
                  features: sanitized.features,
                });
              }
              const stillValid = resolveSelection(currentSelection, {
                venues: sanitized.venues ?? [],
                buildings: sanitized.buildings ?? [],
                levels: sanitized.levels ?? [],
                features: sanitized.features,
              });
              if (stillValid) {
                return currentSelection;
              }
              return firstValidSelection({
                venues: sanitized.venues ?? [],
                buildings: sanitized.buildings ?? [],
                levels: sanitized.levels ?? [],
                features: sanitized.features,
              });
            });
          });
          setArchiveNotices([
            ...notices,
            {
              level: "info",
              message: "Imported archives applied.",
            },
          ]);
        };

        if (!hasImportConflicts(conflicts)) {
          applyImport();
          return;
        }

        setArchiveNotices(notices);
        requestProjectConfirmation({
          title: "Replace conflicting imported IDs?",
          message:
            `Conflicts found (${countImportConflicts(conflicts)} ids): ` +
            `${conflicts.venueIds.length} venues, ${conflicts.buildingIds.length} buildings, ` +
            `${conflicts.levelIds.length} levels, ${conflicts.featureIds.length} features, ` +
            `${conflicts.overlayIds.length} overlays. Conflicting IDs will be replaced and non-conflicting records will be appended.`,
          confirmLabel: "Replace conflicts",
          apply: applyImport,
        });
      } catch (error: unknown) {
        clientLogger.error("imdf.import_unexpected_failure", { error });
        setArchiveNotices([
          {
            level: "error",
            message: "Import failed unexpectedly. Please try another archive.",
          },
        ]);
      }
    },
    [
      venues,
      buildings,
      levels,
      editorState.features,
      overlays,
      applyProjectMutation,
      lockedFeatureIds,
      lockedOverlayFloorIds,
      requestProjectConfirmation,
    ],
  );

  const onRenameLevel = useCallback(
    (levelId: string, name: string) => {
      applyProjectMutation("Level renamed", () => {
        const resolvedName = name || "Untitled level";
        setLevels((current) =>
          current.map((level) => (level.id === levelId ? { ...level, name: resolvedName } : level)),
        );
        setEditorState((current) => {
          const nextFeatures = current.features.map((feature) => {
            if (!isLevelGeometryFeature(feature) || feature.properties.level_id !== levelId) {
              return feature;
            }
            return {
              ...feature,
              properties: {
                ...feature.properties,
                name: { en: resolvedName },
              },
            };
          });
          if (areFeatureListsEqual(current.features, nextFeatures)) {
            return current;
          }
          return replaceAllFeatures(current, nextFeatures);
        });
      });
    },
    [applyProjectMutation],
  );

  const onDeleteLevel = useCallback(
    (levelId: string) => {
      const level = levels.find((current) => current.id === levelId);
      if (!level) {
        return;
      }

      requestProjectConfirmation({
        title: "Delete level?",
        message: `Delete "${level.name}" and all features on this level?`,
        confirmLabel: "Yes",
        apply: () =>
          applyProjectMutation("Level deleted", () => {
            const nextLevels = levels.filter((current) => current.id !== levelId);
            const nextFeatures = editorState.features.filter(
              (feature) => feature.properties.level_id !== levelId,
            );
            setLevels(nextLevels);
            setOverlays((current) => current.filter((overlay) => overlay.level_id !== levelId));
            setLockedOverlayFloorIds((current) =>
              current.filter((currentFloorId) => currentFloorId !== levelId),
            );
            setEditorState((current) =>
              replaceAllFeatures(selectFeature(current, undefined), nextFeatures),
            );
            setLockedFeatureIds((current) =>
              current.filter((featureId) =>
                nextFeatures.some((feature) => feature.id === featureId),
              ),
            );

            const nextLevel =
              nextLevels.find((current) => current.buildingId === level.buildingId) ??
              nextLevels[0];
            if (nextLevel) {
              setSelection({ kind: "level", id: nextLevel.id });
            } else {
              setSelection({ kind: "building", id: level.buildingId });
            }
          }),
      });
    },
    [levels, editorState.features, applyProjectMutation, requestProjectConfirmation],
  );

  const onCloneLevel = useCallback(
    (levelId: string) => {
      const sourceLevel = levels.find((level) => level.id === levelId);
      if (!sourceLevel) {
        return;
      }

      requestProjectConfirmation({
        title: "Clone level?",
        message: `Clone "${sourceLevel.name}" including features and overlay?`,
        confirmLabel: "Yes",
        apply: () =>
          applyProjectMutation("Level cloned", () => {
            const clone = cloneLevelWithReferences({
              level: sourceLevel,
              levels,
              features: editorState.features,
              overlays,
            });

            setLevels((current) => [...current, clone.level]);
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
            setSelection({ kind: "level", id: clone.level.id });
            setDrawMode("select");
          }),
      });
    },
    [editorState.features, levels, overlays, applyProjectMutation, requestProjectConfirmation],
  );

  const onAddLevelGeometry = useCallback(
    (levelId: string) => {
      const level = levels.find((candidate) => candidate.id === levelId);
      if (!level) {
        return;
      }
      if (
        editorState.features.some(
          (feature) => isLevelGeometryFeature(feature) && feature.properties.level_id === levelId,
        )
      ) {
        return;
      }
      setSelection({ kind: "level", id: levelId });
      startDrawMode("polygon");
      setPendingDrawTemplate({
        featureType: "level",
        geometryType: "Polygon",
        defaultName: "Level",
        properties: {},
      });
    },
    [editorState.features, levels, startDrawMode],
  );

  const onRemoveLevelGeometry = useCallback(
    (levelId: string) => {
      const levelGeometryFeatures = getLevelGeometryFeatures(editorState.features, levelId);
      if (levelGeometryFeatures.length === 0) {
        return;
      }
      const idsToRemove = new Set(levelGeometryFeatures.map((feature) => feature.id));
      applyProjectMutation("Level geometry removed", () => {
        setEditorState((current) => {
          const nextFeatures = current.features.filter((feature) => !idsToRemove.has(feature.id));
          const nextSelectionId =
            current.selectedFeatureId && idsToRemove.has(current.selectedFeatureId)
              ? undefined
              : current.selectedFeatureId;
          return selectFeature(replaceAllFeatures(current, nextFeatures), nextSelectionId);
        });
      });
    },
    [editorState.features, applyProjectMutation],
  );

  const onUpdateLevelOrdinal = useCallback(
    (levelId: string, ordinal: number) => {
      applyProjectMutation("Level ordinal updated", () => {
        setEditorState((current) => {
          const nextFeatures = current.features.map((feature) => {
            if (!isLevelGeometryFeature(feature) || feature.properties.level_id !== levelId) {
              return feature;
            }
            return {
              ...feature,
              properties: {
                ...feature.properties,
                ordinal,
              },
            };
          });
          if (areFeatureListsEqual(current.features, nextFeatures)) {
            return current;
          }
          const next = replaceAllFeatures(current, nextFeatures);
          const nextSelectedId =
            current.selectedFeatureId &&
            nextFeatures.some((feature) => feature.id === current.selectedFeatureId)
              ? current.selectedFeatureId
              : undefined;
          return selectFeature(next, nextSelectedId);
        });
      });
    },
    [applyProjectMutation],
  );

  const onUpdateLevelShortName = useCallback(
    (levelId: string, shortName: string) => {
      applyProjectMutation("Level short name updated", () => {
        setEditorState((current) => {
          const nextFeatures = current.features.map((feature) => {
            if (!isLevelGeometryFeature(feature) || feature.properties.level_id !== levelId) {
              return feature;
            }
            return {
              ...feature,
              properties: {
                ...feature.properties,
                short_name: { en: shortName },
              },
            };
          });
          if (areFeatureListsEqual(current.features, nextFeatures)) {
            return current;
          }
          const next = replaceAllFeatures(current, nextFeatures);
          const nextSelectedId =
            current.selectedFeatureId &&
            nextFeatures.some((feature) => feature.id === current.selectedFeatureId)
              ? current.selectedFeatureId
              : undefined;
          return selectFeature(next, nextSelectedId);
        });
      });
    },
    [applyProjectMutation],
  );

  const onUpdateLevelOutdoor = useCallback(
    (levelId: string, outdoor: boolean) => {
      applyProjectMutation("Level outdoor updated", () => {
        setEditorState((current) => {
          const nextFeatures = current.features.map((feature) => {
            if (!isLevelGeometryFeature(feature) || feature.properties.level_id !== levelId) {
              return feature;
            }
            return {
              ...feature,
              properties: {
                ...feature.properties,
                outdoor,
              },
            };
          });
          if (areFeatureListsEqual(current.features, nextFeatures)) {
            return current;
          }
          const next = replaceAllFeatures(current, nextFeatures);
          const nextSelectedId =
            current.selectedFeatureId &&
            nextFeatures.some((feature) => feature.id === current.selectedFeatureId)
              ? current.selectedFeatureId
              : undefined;
          return selectFeature(next, nextSelectedId);
        });
      });
    },
    [applyProjectMutation],
  );

  const onCreateFeature = useCallback(
    (request: AddFeatureRequest) => {
      if (!activeLevel) {
        return;
      }
      const nextContainmentParent = resolvePendingContainmentParent(selectedFeature);
      if (request.type === NAVIGATION_NODE_FEATURE_TYPE) {
        startDrawMode("point");
        setPendingContainmentParent(undefined);
        setPendingDrawTemplate({
          featureType: NAVIGATION_NODE_FEATURE_TYPE,
          geometryType: "Point",
          defaultName: navigationNodeName(request.category),
          properties: {
            "formation:navigation_category": request.category,
            "formation:navigation_levels": [activeLevel.id],
            level_id: activeLevel.id,
            floorId: activeLevel.id,
          },
        });
        return;
      }
      if (request.type === NAVIGATION_EDGE_FEATURE_TYPE) {
        startDrawMode("line");
        setPendingContainmentParent(undefined);
        setPendingDrawTemplate({
          featureType: NAVIGATION_EDGE_FEATURE_TYPE,
          geometryType: "LineString",
          defaultName: navigationEdgeName(request.category),
          properties: {
            "formation:path_category": request.category,
            level_id: activeLevel.id,
            floorId: activeLevel.id,
          },
        });
        return;
      }
      const schema = getImdfSchemaRule(request.type);
      if (schema.geometryType === "Point") {
        startDrawMode("point");
        setPendingDrawTemplate({
          featureType: request.type,
          geometryType: "Point",
          defaultName: schema.defaultName,
          properties: {},
        });
        setPendingContainmentParent(nextContainmentParent);
        return;
      }
      if (schema.geometryType === "LineString") {
        startDrawMode("line");
        setPendingDrawTemplate({
          featureType: request.type,
          geometryType: "LineString",
          defaultName: schema.defaultName,
          properties: {},
        });
        setPendingContainmentParent(nextContainmentParent);
        return;
      }

      startDrawMode("polygon");
      setPendingDrawTemplate({
        featureType: request.type,
        geometryType: "Polygon",
        defaultName: schema.defaultName,
        properties: {},
      });
      setPendingContainmentParent(nextContainmentParent);
    },
    [activeLevel, selectedFeature, startDrawMode],
  );

  const canUndo = projectUndoStack.length > 0 || editorState.undoStack.length > 0;
  const canRedo = projectRedoStack.length > 0 || editorState.redoStack.length > 0;
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
              <div className="relative w-72">
                <label className="input input-bordered input-sm flex items-center gap-2">
                  <AppIcon name="search" className="size-4 opacity-70" />
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
                                <AppIcon name="address" />
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
              <button
                className="btn btn-sm btn-outline"
                type="button"
                onClick={onExportProjectArchive}
              >
                <AppIcon name="export" />
                Export project
              </button>
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
                <span className="swap-on flex items-center gap-1">
                  <AppIcon name="themeDark" />
                  Dark
                </span>
                <span className="swap-off flex items-center gap-1">
                  <AppIcon name="themeLight" />
                  Light
                </span>
              </label>
            </div>
          </header>

          <div className="grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[320px_minmax(0,1fr)_420px]">
            <aside className="flex flex-col xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              <BuildingsTree
                venues={venues}
                buildings={buildings}
                levels={levels}
                features={editorState.features}
                selection={selection}
                onSelect={selectNode}
                onExportVenueArchive={onExportVenueArchive}
                onExportBuildingArchive={onExportBuildingArchive}
              />
              <div className="mt-3 rounded-box border border-base-300 bg-base-100 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">Import archives</div>
                  <button
                    className="btn btn-sm btn-outline"
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                  >
                    <AppIcon name="import" />
                    Import ZIP(s)
                  </button>
                  <input
                    ref={importInputRef}
                    className="hidden"
                    type="file"
                    accept=".zip,.imdf.zip,application/zip"
                    multiple
                    aria-label="Import ZIP archives"
                    onClick={(event) => {
                      event.currentTarget.value = "";
                    }}
                    onChange={(event) => {
                      const selected = Array.from(event.currentTarget.files ?? []);
                      if (selected.length === 0) {
                        setArchiveNotices([
                          {
                            level: "error",
                            message: "No archive selected.",
                          },
                        ]);
                        return;
                      }
                      setArchiveNotices([
                        {
                          level: "info",
                          message: `Importing ${selected.length} archive${selected.length === 1 ? "" : "s"}...`,
                        },
                      ]);
                      void onImportArchives(selected);
                    }}
                  />
                </div>
                {archiveNotices.length === 0 ? (
                  <p className="text-xs text-base-content/70">
                    Import one or more IMDF archives. Conflicts are confirmed before replacement.
                  </p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {archiveNotices.map((notice, index) => (
                      <li
                        key={`${notice.level}-${notice.message}-${index}`}
                        className={
                          notice.level === "error"
                            ? "text-error"
                            : notice.level === "warning"
                              ? "text-warning"
                              : "text-base-content/70"
                        }
                      >
                        {notice.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button className="btn btn-sm btn-outline" type="button" onClick={onAddVenue}>
                  <AppIcon name="add" />
                  Add venue
                </button>
              </div>
              <div className="mt-3 rounded-box border border-base-300 bg-base-100 p-3">
                <label className="fieldset">
                  <span className="fieldset-legend text-sm font-semibold">Basemap style</span>
                  <select
                    className="select select-bordered select-sm w-full"
                    value={mapStyleId}
                    onChange={(event) => setMapStyleId(event.currentTarget.value)}
                    aria-label="Basemap style"
                  >
                    {MAP_STYLE_OPTIONS.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 rounded-box border border-base-300 bg-base-100 p-3">
                <div className="mb-2 text-sm font-semibold">Route mode</div>
                <button
                  className={`btn btn-sm ${routePickEnabled ? "btn-primary" : "btn-outline"}`}
                  type="button"
                  onClick={() => {
                    setRoutePickEnabled((current) => !current);
                    setDrawMode("select");
                  }}
                >
                  <AppIcon name="route" />
                  {routePickEnabled ? "Routing enabled (click map)" : "Enable map route picking"}
                </button>
                <div className="mt-2 text-xs text-base-content/70">
                  {!routePickEnabled
                    ? "Enable route mode, then click start and destination on the map."
                    : !routeStartCoordinate
                      ? "Click the start point on the map."
                      : !routeEndCoordinate
                        ? "Click the destination point on the map."
                        : "Route endpoints selected."}
                </div>
                <div className="mt-2 text-xs text-base-content/70">
                  Start:{" "}
                  {routeStartCoordinate
                    ? `${routeStartCoordinate[0].toFixed(6)}, ${routeStartCoordinate[1].toFixed(6)}`
                    : "not set"}
                </div>
                <div className="text-xs text-base-content/70">
                  Destination:{" "}
                  {routeEndCoordinate
                    ? `${routeEndCoordinate[0].toFixed(6)}, ${routeEndCoordinate[1].toFixed(6)}`
                    : "not set"}
                </div>
                <div className="mt-2 text-xs text-base-content/70">
                  {routeResult
                    ? routeResult.found
                      ? `Route found: ${(routeResult.totalWeightMeters / 1).toFixed(1)} m`
                      : (routeResult.reason ?? "No route found.")
                    : "Select start and destination to compute a route."}
                </div>
                <button
                  className="btn btn-xs btn-ghost mt-2"
                  type="button"
                  onClick={() => {
                    setRouteStartCoordinate(undefined);
                    setRouteEndCoordinate(undefined);
                  }}
                >
                  <AppIcon name="clear" />
                  Clear path
                </button>
              </div>
              <div className="mt-auto rounded-box bg-base-200 p-3 text-sm">
                Center: {mapView.center[0].toFixed(6)}, {mapView.center[1].toFixed(6)} | Zoom:{" "}
                {mapView.zoom.toFixed(2)}
              </div>
            </aside>

            <section className="card bg-base-100 shadow xl:min-h-0">
              <div className="card-body gap-0 p-0 xl:min-h-0">
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
                        <AppIcon name="select" />
                      </button>
                      <button
                        className={`btn btn-sm join-item ${snapEnabled ? "btn-secondary" : ""}`}
                        type="button"
                        aria-label="Toggle snap to geometry"
                        title={`Snap to geometry (${Math.round(DEFAULT_SNAP_DISTANCE_METERS * 100)} cm base)`}
                        aria-pressed={snapEnabled}
                        onClick={() => setSnapEnabled((current) => !current)}
                      >
                        <AppIcon name="snap" />
                      </button>
                      <button
                        className="btn btn-sm join-item"
                        type="button"
                        aria-label="Undo"
                        title="Undo"
                        onClick={undoAction}
                        disabled={!canUndo}
                      >
                        <AppIcon name="undo" />
                      </button>
                      <button
                        className="btn btn-sm join-item"
                        type="button"
                        aria-label="Redo"
                        title="Redo"
                        onClick={redoAction}
                        disabled={!canRedo}
                      >
                        <AppIcon name="redo" />
                      </button>
                      <button
                        className="btn btn-sm join-item"
                        type="button"
                        aria-label="Delete selected vertex"
                        title="Delete selected vertex"
                        onClick={deleteVertex}
                        disabled={!hasSelectedVertex}
                      >
                        <AppIcon name="delete" />
                      </button>
                      <button
                        className="btn btn-sm join-item"
                        type="button"
                        aria-label="Split selected edge"
                        title="Split selected edge"
                        onClick={splitPathSegment}
                        disabled={!canEditPathNode}
                      >
                        <AppIcon name="split" />
                      </button>
                      <button
                        className="btn btn-sm join-item"
                        type="button"
                        aria-label="Fork edge from selected node"
                        title="Fork edge from selected node"
                        onClick={forkPathAtNode}
                        disabled={!canEditPathNode}
                      >
                        <AppIcon name="fork" />
                      </button>
                      <button
                        className="btn btn-sm btn-error join-item"
                        type="button"
                        aria-label="Delete selection"
                        title="Delete selection"
                        onClick={deleteSelection}
                      >
                        <AppIcon name="delete" />
                      </button>
                    </div>
                  </div>
                  <MapCanvas
                    maptilerApiKey={runtimeConfig.config.maptilerApiKey}
                    mapStyleId={mapStyleId}
                    initialView={initialMapView}
                    features={visibleFeatures}
                    lockedFeatureIds={lockedFeatureIds}
                    routeOverlayFeatures={routeOverlayFeatures}
                    selectedFeature={selectedFeatureForMap}
                    overlay={selectedOverlayForMap}
                    drawMode={drawMode}
                    routePickEnabled={routePickEnabled && drawMode === "select"}
                    snapEnabled={snapEnabled}
                    deleteRequestVersion={deleteRequestVersion}
                    deleteVertexRequestVersion={deleteVertexRequestVersion}
                    splitPathRequestVersion={splitPathRequestVersion}
                    forkPathRequestVersion={forkPathRequestVersion}
                    relocationRequest={relocationRequest}
                    onFeaturesChange={onDrawFeaturesChange}
                    onFeatureSelectionChange={onDrawSelectionChange}
                    onViewStateChange={onViewStateChange}
                    onInteractionModeChange={onInteractionModeChange}
                    onMapClick={onRouteMapClick}
                    onVertexSelectionChange={(hasVertex) => setHasSelectedVertex(hasVertex)}
                    onOverlayCornersChange={onOverlayCornersChange}
                    onOverlayInteractionStart={onOverlayInteractionStart}
                    onOverlayInteractionEnd={onOverlayInteractionEnd}
                  />
                </div>
              </div>
            </section>

            <aside className="xl:min-h-0 xl:overflow-y-auto xl:pl-1">
              <SelectionSidebar
                selection={selection}
                venue={selectedVenue}
                building={resolvedSelection?.building}
                buildings={buildings}
                levels={levels}
                level={activeLevel}
                feature={selectedFeature}
                allFeatures={editorState.features}
                allOverlays={overlays}
                overlay={selectedOverlayForMap}
                featureLocked={Boolean(
                  selectedFeature && lockedFeatureIdsSet.has(selectedFeature.id),
                )}
                overlayLocked={Boolean(activeLevel && lockedOverlayFloorIdsSet.has(activeLevel.id))}
                onFeatureToggleLock={(featureId) => {
                  setLockedFeatureIds((current) =>
                    current.includes(featureId)
                      ? current.filter((currentId) => currentId !== featureId)
                      : [...current, featureId],
                  );
                }}
                onRenameBuilding={onRenameBuilding}
                onRenameVenue={onRenameVenue}
                onDeleteVenue={onDeleteVenue}
                onAddBuilding={onAddBuilding}
                onUpdateBuildingVenueCategory={onUpdateBuildingVenueCategory}
                onUpdateBuildingAddressField={onUpdateBuildingAddressField}
                onAddBuildingDirectoryEntry={onAddBuildingDirectoryEntry}
                onUpdateBuildingDirectoryEntry={onUpdateBuildingDirectoryEntry}
                onDeleteBuildingDirectoryEntry={onDeleteBuildingDirectoryEntry}
                onReverseGeocodeBuildingAddress={onReverseGeocodeBuildingAddress}
                onDeleteBuilding={onDeleteBuilding}
                onAddLevel={onAddLevel}
                onRenameLevel={onRenameLevel}
                onCloneLevel={onCloneLevel}
                onDeleteLevel={onDeleteLevel}
                onAddLevelGeometry={onAddLevelGeometry}
                onRemoveLevelGeometry={onRemoveLevelGeometry}
                onUpdateLevelOrdinal={onUpdateLevelOrdinal}
                onUpdateLevelShortName={onUpdateLevelShortName}
                onUpdateLevelOutdoor={onUpdateLevelOutdoor}
                onCreateFeature={onCreateFeature}
                onUpdateFeatureProperty={(featureId, key, value) => {
                  const level = levels.find(
                    (current) =>
                      current.id ===
                      editorState.features.find((feature) => feature.id === featureId)?.properties
                        .level_id,
                  );
                  const building = level
                    ? buildings.find((current) => current.id === level.buildingId)
                    : undefined;

                  setEditorState((current) =>
                    updateFeature(current, featureId, (feature) => {
                      const patched: FloorFeature = {
                        ...feature,
                        properties: {
                          ...feature.properties,
                          [key]: value,
                        },
                      };
                      if (
                        typeof patched.feature_type === "string" &&
                        patched.feature_type.startsWith("formation:")
                      ) {
                        return patched;
                      }
                      return normalizeFeature(patched, {
                        level_id: level?.id ?? activeLevel?.id ?? feature.properties.level_id ?? "",
                        buildingId:
                          building?.id ??
                          activeBuilding?.id ??
                          (Array.isArray(feature.properties.building_ids)
                            ? feature.properties.building_ids[0]
                            : undefined) ??
                          "",
                      });
                    }),
                  );
                }}
                onUpdateFeatureMetadata={(featureId, metadata) => {
                  setEditorState((current) =>
                    updateFeature(current, featureId, (feature) => ({
                      ...feature,
                      properties: {
                        ...feature.properties,
                        "formation:metadata": metadata,
                      },
                    })),
                  );
                }}
                onDeleteFeature={(featureId) => {
                  const deletedFeature = editorState.features.find(
                    (feature) => feature.id === featureId,
                  );
                  const featureName =
                    (deletedFeature ? readFeatureName(deletedFeature) : undefined) ??
                    deletedFeature?.id ??
                    "feature";

                  requestProjectConfirmation({
                    title: "Delete feature?",
                    message: `Delete "${featureName}"?`,
                    confirmLabel: "Yes",
                    apply: () =>
                      applyProjectMutation("Feature deleted", () => {
                        setEditorState((current) =>
                          replaceAllFeatures(
                            selectFeature(current, undefined),
                            current.features.filter((feature) => feature.id !== featureId),
                          ),
                        );
                        setLockedFeatureIds((current) =>
                          current.filter((currentFeatureId) => currentFeatureId !== featureId),
                        );

                        if (deletedFeature?.properties.level_id) {
                          setSelection({ kind: "level", id: deletedFeature.properties.level_id });
                        }
                      }),
                  });
                }}
                onCloneFeature={(featureId) => {
                  const source = editorState.features.find((feature) => feature.id === featureId);
                  if (!source) {
                    return;
                  }

                  const floor = levels.find((current) => current.id === source.properties.level_id);
                  const building = floor
                    ? buildings.find((current) => current.id === floor.buildingId)
                    : activeBuilding;

                  if (!floor || !building) {
                    return;
                  }

                  requestProjectConfirmation({
                    title: "Clone feature?",
                    message: `Clone "${source.properties.name ?? source.id}"?`,
                    confirmLabel: "Yes",
                    apply: () =>
                      applyProjectMutation("Feature cloned", () => {
                        const clone = cloneImdfFeature(source, {
                          level_id: floor.id,
                          buildingId: building.id,
                        });

                        setEditorState((current) => addFeature(current, clone));
                        setSelection({ kind: "feature", id: clone.id });
                        setDrawMode("select");
                      }),
                  });
                }}
                onOverlayUpload={uploadOverlayForCurrentFloor}
                onOverlayOpacityChange={(opacity) => {
                  if (!activeLevel) {
                    return;
                  }

                  setOverlays((current) =>
                    current.map((overlay) =>
                      overlay.level_id === activeLevel.id
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
                  if (!activeLevel) {
                    return;
                  }

                  setOverlays((current) =>
                    current.map((overlay) =>
                      overlay.level_id === activeLevel.id
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
                  if (!activeLevel) {
                    return;
                  }

                  setLockedOverlayFloorIds((current) =>
                    current.includes(activeLevel.id)
                      ? current.filter((level_id) => level_id !== activeLevel.id)
                      : [...current, activeLevel.id],
                  );
                }}
              />
            </aside>
          </div>
        </div>
        {pendingConfirmation ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral/40 p-4">
            <div
              className="w-full max-w-md rounded-box bg-base-100 p-5 shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-label={pendingConfirmation.title}
            >
              <h2 className="text-lg font-semibold">{pendingConfirmation.title}</h2>
              <p className="mt-2 text-sm text-base-content/80">{pendingConfirmation.message}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => setPendingConfirmation(undefined)}
                >
                  <AppIcon name="clear" />
                  Cancel
                </button>
                <button
                  className="btn btn-sm btn-error"
                  type="button"
                  onClick={() => {
                    pendingConfirmation.apply();
                    setPendingConfirmation(undefined);
                  }}
                >
                  <AppIcon name="entry" />
                  {pendingConfirmation.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </ErrorBoundary>
  );
}

export default App;
