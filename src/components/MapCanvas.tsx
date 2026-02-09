import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import {
  createMapController,
  type GeometryDragPayload,
  type MapClickPayload,
} from "../lib/map/mapBootstrap";
import type { Coordinates, FloorFeature, FloorOverlay } from "../lib/types";

export type DrawMode = "select" | "point" | "line" | "polygon";

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
  onGeometryDragStart: (payload: GeometryDragPayload) => void;
  onGeometryDrag: (payload: GeometryDragPayload) => void;
  onGeometryDragEnd: () => void;
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
  onGeometryDragStart,
  onGeometryDrag,
  onGeometryDragEnd,
  onViewStateChange,
}: MapCanvasProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<Awaited<ReturnType<typeof createMapController>> | null>(null);
  const clickHandlerRef = useRef(onMapClick);
  const dragStartHandlerRef = useRef(onGeometryDragStart);
  const dragHandlerRef = useRef(onGeometryDrag);
  const dragEndHandlerRef = useRef(onGeometryDragEnd);
  const viewStateHandlerRef = useRef(onViewStateChange);
  const featuresRef = useRef(features);
  const selectedFeatureRef = useRef(selectedFeature);
  const editableVerticesRef = useRef(editableVertices);
  const selectedVertexIndexRef = useRef(selectedVertexIndex);
  const overlayRef = useRef(overlay);
  const draftVerticesRef = useRef(draftVertices);
  const drawModeRef = useRef(drawMode);

  useEffect(() => {
    clickHandlerRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    viewStateHandlerRef.current = onViewStateChange;
  }, [onViewStateChange]);
  useEffect(() => {
    dragStartHandlerRef.current = onGeometryDragStart;
  }, [onGeometryDragStart]);
  useEffect(() => {
    dragHandlerRef.current = onGeometryDrag;
  }, [onGeometryDrag]);
  useEffect(() => {
    dragEndHandlerRef.current = onGeometryDragEnd;
  }, [onGeometryDragEnd]);
  useEffect(() => {
    featuresRef.current = features;
  }, [features]);
  useEffect(() => {
    selectedFeatureRef.current = selectedFeature;
  }, [selectedFeature]);
  useEffect(() => {
    editableVerticesRef.current = editableVertices;
  }, [editableVertices]);
  useEffect(() => {
    selectedVertexIndexRef.current = selectedVertexIndex;
  }, [selectedVertexIndex]);
  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);
  useEffect(() => {
    draftVerticesRef.current = draftVertices;
  }, [draftVertices]);
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
      onMapClick: (payload) => {
        clickHandlerRef.current(payload);
      },
      onViewStateChange: (center, zoom) => {
        viewStateHandlerRef.current(center, zoom);
      },
      onGeometryDragStart: (payload) => {
        dragStartHandlerRef.current(payload);
      },
      onGeometryDrag: (payload) => {
        dragHandlerRef.current(payload);
      },
      onGeometryDragEnd: () => {
        dragEndHandlerRef.current();
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
      controller.setEditableVertices(
        selectedFeatureRef.current?.id,
        selectedFeatureRef.current?.geometry.type,
        editableVerticesRef.current,
        selectedVertexIndexRef.current,
      );
      controller.setOverlay(overlayRef.current);
      controller.setDrawDraft(drawModeRef.current, draftVerticesRef.current);
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
    controllerRef.current?.setEditableVertices(
      selectedFeature?.id,
      selectedFeature?.geometry.type,
      editableVertices,
      selectedVertexIndex,
    );
  }, [editableVertices, selectedFeature?.geometry.type, selectedFeature?.id, selectedVertexIndex]);

  useEffect(() => {
    controllerRef.current?.setOverlay(overlay);
  }, [overlay]);

  useEffect(() => {
    controllerRef.current?.setDrawDraft(drawMode, draftVertices);
  }, [drawMode, draftVertices]);

  useEffect(() => {
    controllerRef.current?.setInteractionMode(drawMode);
  }, [drawMode]);

  return (
    <div
      ref={rootRef}
      data-testid="map-canvas"
      className="h-full min-h-[500px] w-full rounded-box border border-base-300"
    />
  );
};
