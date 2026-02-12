import "maplibre-gl/dist/maplibre-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { useEffect, useRef } from "react";
import { createMapController, type DrawMode } from "../lib/map/mapBootstrap";
import type { Coordinates, FloorFeature, FloorOverlay, OverlayCorners } from "../lib/types";

export type { DrawMode } from "../lib/map/mapBootstrap";

type MapRelocationRequest = {
  center: Coordinates;
  zoom?: number;
  requestVersion: number;
};

type MapCanvasProps = {
  maptilerApiKey: string;
  mapStyleId: string;
  initialView: {
    center: Coordinates;
    zoom: number;
  };
  features: FloorFeature[];
  routeOverlayFeatures: FloorFeature[];
  selectedFeature: FloorFeature | undefined;
  overlay: FloorOverlay | undefined;
  drawMode: DrawMode;
  routePickEnabled: boolean;
  snapEnabled: boolean;
  deleteRequestVersion: number;
  deleteVertexRequestVersion: number;
  splitPathRequestVersion: number;
  forkPathRequestVersion: number;
  relocationRequest: MapRelocationRequest | undefined;
  onFeaturesChange: (features: FloorFeature[]) => void;
  onFeatureSelectionChange: (featureId: string | undefined) => void;
  onViewStateChange: (center: Coordinates, zoom: number) => void;
  onInteractionModeChange: (mode: DrawMode) => void;
  onOverlayCornersChange: (corners: OverlayCorners) => void;
  onOverlayInteractionStart: () => void;
  onOverlayInteractionEnd: () => void;
  onVertexSelectionChange: (hasSelectedVertex: boolean) => void;
  onMapClick: (coordinate: Coordinates) => void;
};

export const MapCanvas = ({
  maptilerApiKey,
  mapStyleId,
  initialView,
  features,
  routeOverlayFeatures,
  selectedFeature,
  overlay,
  drawMode,
  routePickEnabled,
  snapEnabled,
  deleteRequestVersion,
  deleteVertexRequestVersion,
  splitPathRequestVersion,
  forkPathRequestVersion,
  relocationRequest,
  onFeaturesChange,
  onFeatureSelectionChange,
  onViewStateChange,
  onInteractionModeChange,
  onOverlayCornersChange,
  onOverlayInteractionStart,
  onOverlayInteractionEnd,
  onVertexSelectionChange,
  onMapClick,
}: MapCanvasProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<Awaited<ReturnType<typeof createMapController>> | null>(null);

  const featuresHandlerRef = useRef(onFeaturesChange);
  const selectionHandlerRef = useRef(onFeatureSelectionChange);
  const viewStateHandlerRef = useRef(onViewStateChange);
  const modeHandlerRef = useRef(onInteractionModeChange);
  const overlayChangeHandlerRef = useRef(onOverlayCornersChange);
  const overlayInteractionStartHandlerRef = useRef(onOverlayInteractionStart);
  const overlayInteractionEndHandlerRef = useRef(onOverlayInteractionEnd);
  const vertexSelectionHandlerRef = useRef(onVertexSelectionChange);
  const mapClickHandlerRef = useRef(onMapClick);

  const featuresRef = useRef(features);
  const selectedFeatureRef = useRef(selectedFeature);
  const routeOverlayFeaturesRef = useRef(routeOverlayFeatures);
  const overlayRef = useRef(overlay);
  const drawModeRef = useRef(drawMode);
  const snapEnabledRef = useRef(snapEnabled);
  const routePickEnabledRef = useRef(routePickEnabled);
  const relocationRequestRef = useRef(relocationRequest);

  useEffect(() => {
    featuresHandlerRef.current = onFeaturesChange;
  }, [onFeaturesChange]);

  useEffect(() => {
    selectionHandlerRef.current = onFeatureSelectionChange;
  }, [onFeatureSelectionChange]);

  useEffect(() => {
    viewStateHandlerRef.current = onViewStateChange;
  }, [onViewStateChange]);

  useEffect(() => {
    modeHandlerRef.current = onInteractionModeChange;
  }, [onInteractionModeChange]);

  useEffect(() => {
    overlayChangeHandlerRef.current = onOverlayCornersChange;
  }, [onOverlayCornersChange]);

  useEffect(() => {
    overlayInteractionStartHandlerRef.current = onOverlayInteractionStart;
  }, [onOverlayInteractionStart]);

  useEffect(() => {
    overlayInteractionEndHandlerRef.current = onOverlayInteractionEnd;
  }, [onOverlayInteractionEnd]);

  useEffect(() => {
    vertexSelectionHandlerRef.current = onVertexSelectionChange;
  }, [onVertexSelectionChange]);

  useEffect(() => {
    mapClickHandlerRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    featuresRef.current = features;
  }, [features]);

  useEffect(() => {
    selectedFeatureRef.current = selectedFeature;
  }, [selectedFeature]);

  useEffect(() => {
    routeOverlayFeaturesRef.current = routeOverlayFeatures;
  }, [routeOverlayFeatures]);

  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);

  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);

  useEffect(() => {
    snapEnabledRef.current = snapEnabled;
  }, [snapEnabled]);

  useEffect(() => {
    routePickEnabledRef.current = routePickEnabled;
  }, [routePickEnabled]);

  useEffect(() => {
    relocationRequestRef.current = relocationRequest;
  }, [relocationRequest]);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) {
      return;
    }

    let cancelled = false;

    void createMapController(
      element,
      maptilerApiKey,
      mapStyleId,
      {
        onFeaturesChange: (nextFeatures) => {
          featuresHandlerRef.current(nextFeatures);
        },
        onFeatureSelectionChange: (featureId) => {
          selectionHandlerRef.current(featureId);
        },
        onViewStateChange: (center, zoom) => {
          viewStateHandlerRef.current(center, zoom);
        },
        onInteractionModeChange: (mode) => {
          modeHandlerRef.current(mode);
        },
        onOverlayCornersChange: (corners) => {
          overlayChangeHandlerRef.current(corners);
        },
        onOverlayInteractionStart: () => {
          overlayInteractionStartHandlerRef.current();
        },
        onOverlayInteractionEnd: () => {
          overlayInteractionEndHandlerRef.current();
        },
        onVertexSelectionChange: (hasSelectedVertex) => {
          vertexSelectionHandlerRef.current(hasSelectedVertex);
        },
        onMapClick: (coordinate) => {
          mapClickHandlerRef.current(coordinate);
        },
      },
      initialView,
    ).then((controller) => {
      if (cancelled) {
        controller.destroy();
        return;
      }

      controllerRef.current = controller;
      controller.setFeatures({
        type: "FeatureCollection",
        features: featuresRef.current,
      });
      controller.setRouteOverlay({
        type: "FeatureCollection",
        features: routeOverlayFeaturesRef.current,
      });
      controller.setSelection(selectedFeatureRef.current);
      controller.setOverlay(overlayRef.current);
      controller.setInteractionMode(drawModeRef.current);
      controller.setRoutePickEnabled(routePickEnabledRef.current);
      controller.setSnapEnabled(snapEnabledRef.current);

      if (relocationRequestRef.current) {
        controller.setView(relocationRequestRef.current.center, relocationRequestRef.current.zoom);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      controllerRef.current?.resize();
    });
    resizeObserver.observe(element);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [maptilerApiKey, mapStyleId, initialView]);

  useEffect(() => {
    controllerRef.current?.setFeatures({
      type: "FeatureCollection",
      features,
    });
  }, [features]);

  useEffect(() => {
    controllerRef.current?.setRouteOverlay({
      type: "FeatureCollection",
      features: routeOverlayFeatures,
    });
  }, [routeOverlayFeatures]);

  useEffect(() => {
    controllerRef.current?.setSelection(selectedFeature);
  }, [selectedFeature]);

  useEffect(() => {
    controllerRef.current?.setOverlay(overlay);
  }, [overlay]);

  useEffect(() => {
    controllerRef.current?.setInteractionMode(drawMode);
  }, [drawMode]);

  useEffect(() => {
    controllerRef.current?.setRoutePickEnabled(routePickEnabled);
  }, [routePickEnabled]);

  useEffect(() => {
    controllerRef.current?.setSnapEnabled(snapEnabled);
  }, [snapEnabled]);

  useEffect(() => {
    if (!deleteRequestVersion) {
      return;
    }

    controllerRef.current?.deleteSelection();
  }, [deleteRequestVersion]);

  useEffect(() => {
    if (!deleteVertexRequestVersion) {
      return;
    }

    controllerRef.current?.deleteVertex();
  }, [deleteVertexRequestVersion]);

  useEffect(() => {
    if (!splitPathRequestVersion) {
      return;
    }

    controllerRef.current?.splitPathSegment();
  }, [splitPathRequestVersion]);

  useEffect(() => {
    if (!forkPathRequestVersion) {
      return;
    }

    controllerRef.current?.forkPathAtNode();
  }, [forkPathRequestVersion]);

  useEffect(() => {
    if (!relocationRequest) {
      return;
    }

    controllerRef.current?.setView(relocationRequest.center, relocationRequest.zoom);
  }, [relocationRequest]);

  return (
    <div
      ref={rootRef}
      data-testid="map-canvas"
      className="h-full min-h-[320px] w-full rounded-box border border-base-300"
    />
  );
};
