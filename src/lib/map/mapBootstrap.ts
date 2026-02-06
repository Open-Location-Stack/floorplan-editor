import type { FeatureCollection } from "../types";
import { SourceLayerManager } from "./sourceLayerManager";

type MapLibreModule = typeof import("maplibre-gl");

type MapController = {
  setFeatures: (features: FeatureCollection) => void;
  resize: () => void;
  destroy: () => void;
};

const FEATURE_SOURCE_ID = "editor-features";
const FEATURE_LAYER_ID = "editor-features-line";

export const createMapController = async (
  container: HTMLElement,
  maptilerApiKey: string,
): Promise<MapController> => {
  const maplibre = (await import("maplibre-gl")) as MapLibreModule;

  const map = new maplibre.Map({
    container,
    style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerApiKey}`,
    center: [0, 0],
    zoom: 2,
  });

  const sourceLayerManager = new SourceLayerManager(
    map as unknown as import("./sourceLayerManager").MapWithSources,
  );

  map.on("load", () => {
    sourceLayerManager.ensureFeatureSource(FEATURE_SOURCE_ID);
    sourceLayerManager.ensureFeatureLayer(FEATURE_LAYER_ID, FEATURE_SOURCE_ID);
  });

  return {
    setFeatures: (features) => {
      sourceLayerManager.setSourceData(FEATURE_SOURCE_ID, features);
    },
    resize: () => map.resize(),
    destroy: () => map.remove(),
  };
};
