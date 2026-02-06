import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { createMapController } from "../lib/map/mapBootstrap";
import type { Coordinates, FloorFeature, FloorOverlay } from "../lib/types";

export type DrawMode = "select" | "point" | "line" | "polygon";

export type MapClickPayload = {
  coordinates: Coordinates;
  featureId: string | undefined;
  vertexFeatureId: string | undefined;
  vertexIndex: number | undefined;
};

type MapCanvasProps = {
  maptilerApiKey: string;
  features: FloorFeature[];
  selectedFeature: FloorFeature | undefined;
  editableVertices: Coordinates[];
  selectedVertexIndex: number | undefined;
  overlay: FloorOverlay | undefined;
  draftVertices: Coordinates[];
  drawMode: DrawMode;
  onMapClick: (payload: MapClickPayload) => void;
  onViewStateChange: (center: Coordinates, zoom: number) => void;
};

export const MapCanvas = ({
  maptilerApiKey,
  features,
  selectedFeature,
  editableVertices,
  selectedVertexIndex,
  overlay,
  draftVertices,
  drawMode,
  onMapClick,
  onViewStateChange,
}: MapCanvasProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<Awaited<ReturnType<typeof createMapController>> | null>(null);
  const clickHandlerRef = useRef(onMapClick);
  const viewStateHandlerRef = useRef(onViewStateChange);

  useEffect(() => {
    clickHandlerRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    viewStateHandlerRef.current = onViewStateChange;
  }, [onViewStateChange]);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) {
      return;
    }

    let cancelled = false;

    void createMapController(element, maptilerApiKey, {
      onMapClick: (payload) => {
        clickHandlerRef.current(payload);
      },
      onViewStateChange: (center, zoom) => {
        viewStateHandlerRef.current(center, zoom);
      },
    }).then((controller) => {
      if (cancelled) {
        controller.destroy();
        return;
      }

      controllerRef.current = controller;
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
    controllerRef.current?.setEditableVertices(
      selectedFeature?.id,
      editableVertices,
      selectedVertexIndex,
    );
  }, [editableVertices, selectedFeature?.id, selectedVertexIndex]);

  useEffect(() => {
    controllerRef.current?.setOverlay(overlay);
  }, [overlay]);

  useEffect(() => {
    controllerRef.current?.setDrawDraft(drawMode, draftVertices);
  }, [drawMode, draftVertices]);

  return (
    <div ref={rootRef} className="h-full min-h-[500px] w-full rounded-box border border-base-300" />
  );
};
