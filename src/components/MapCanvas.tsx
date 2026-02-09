import "maplibre-gl/dist/maplibre-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { useEffect, useRef } from "react";
import { createMapController, type DrawMode } from "../lib/map/mapBootstrap";
import type { Coordinates, FloorFeature, FloorOverlay, OverlayCorners } from "../lib/types";

export type { DrawMode } from "../lib/map/mapBootstrap";

type MapCanvasProps = {
  maptilerApiKey: string;
  features: FloorFeature[];
  selectedFeature: FloorFeature | undefined;
  overlay: FloorOverlay | undefined;
  drawMode: DrawMode;
  deleteRequestVersion: number;
  deleteVertexRequestVersion: number;
  onFeaturesChange: (features: FloorFeature[]) => void;
  onFeatureSelectionChange: (featureId: string | undefined) => void;
  onViewStateChange: (center: Coordinates, zoom: number) => void;
  onInteractionModeChange: (mode: DrawMode) => void;
  onOverlayCornersChange: (corners: OverlayCorners) => void;
  onVertexSelectionChange: (hasSelectedVertex: boolean) => void;
};

export const MapCanvas = ({
  maptilerApiKey,
  features,
  selectedFeature,
  overlay,
  drawMode,
  deleteRequestVersion,
  deleteVertexRequestVersion,
  onFeaturesChange,
  onFeatureSelectionChange,
  onViewStateChange,
  onInteractionModeChange,
  onOverlayCornersChange,
  onVertexSelectionChange,
}: MapCanvasProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<Awaited<ReturnType<typeof createMapController>> | null>(null);

  const featuresHandlerRef = useRef(onFeaturesChange);
  const selectionHandlerRef = useRef(onFeatureSelectionChange);
  const viewStateHandlerRef = useRef(onViewStateChange);
  const modeHandlerRef = useRef(onInteractionModeChange);
  const overlayChangeHandlerRef = useRef(onOverlayCornersChange);
  const vertexSelectionHandlerRef = useRef(onVertexSelectionChange);

  const featuresRef = useRef(features);
  const selectedFeatureRef = useRef(selectedFeature);
  const overlayRef = useRef(overlay);
  const drawModeRef = useRef(drawMode);

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
    vertexSelectionHandlerRef.current = onVertexSelectionChange;
  }, [onVertexSelectionChange]);

  useEffect(() => {
    featuresRef.current = features;
  }, [features]);

  useEffect(() => {
    selectedFeatureRef.current = selectedFeature;
  }, [selectedFeature]);

  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);

  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) {
      return;
    }

    let cancelled = false;

    void createMapController(element, maptilerApiKey, {
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
      onVertexSelectionChange: (hasSelectedVertex) => {
        vertexSelectionHandlerRef.current(hasSelectedVertex);
      },
    }).then((controller) => {
      if (cancelled) {
        controller.destroy();
        return;
      }

      controllerRef.current = controller;
      controller.setFeatures({
        type: "FeatureCollection",
        features: featuresRef.current,
      });
      controller.setSelection(selectedFeatureRef.current);
      controller.setOverlay(overlayRef.current);
      controller.setInteractionMode(drawModeRef.current);
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
  }, [maptilerApiKey]);

  useEffect(() => {
    controllerRef.current?.setFeatures({
      type: "FeatureCollection",
      features,
    });
  }, [features]);

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

  return (
    <div
      ref={rootRef}
      data-testid="map-canvas"
      className="h-full min-h-[320px] w-full rounded-box border border-base-300"
    />
  );
};
