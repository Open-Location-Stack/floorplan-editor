import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { createMapController } from "../lib/map/mapBootstrap";
import type { FloorFeature } from "../lib/types";

type MapCanvasProps = {
  maptilerApiKey: string;
  features: FloorFeature[];
};

export const MapCanvas = ({ maptilerApiKey, features }: MapCanvasProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<Awaited<ReturnType<typeof createMapController>> | null>(null);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) {
      return;
    }

    let cancelled = false;

    void createMapController(element, maptilerApiKey).then((controller) => {
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

  return (
    <div ref={rootRef} className="h-full min-h-[420px] w-full rounded-box border border-base-300" />
  );
};
