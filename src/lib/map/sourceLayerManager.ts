import type { FeatureCollection } from "../types";

type GeoJsonSourceLike = {
  setData: (data: FeatureCollection) => void;
};

type SourceSpec = {
  type: "geojson";
  data: FeatureCollection;
};

type LayerSpec = {
  id: string;
  type: "circle" | "line" | "fill";
  source: string;
  paint: Record<string, unknown>;
};

export type MapWithSources = {
  addSource: (id: string, source: SourceSpec) => void;
  getSource: (id: string) => unknown;
  getLayer: (id: string) => unknown;
  addLayer: (layer: LayerSpec) => void;
};

const emptyFeatureCollection = (): FeatureCollection => ({
  type: "FeatureCollection",
  features: [],
});

const isGeoJsonSourceLike = (value: unknown): value is GeoJsonSourceLike =>
  typeof value === "object" && value !== null && "setData" in value;

export class SourceLayerManager {
  constructor(private map: MapWithSources) {}

  ensureFeatureSource(sourceId: string): void {
    const existing = this.map.getSource(sourceId);
    if (existing) {
      return;
    }

    this.map.addSource(sourceId, {
      type: "geojson",
      data: emptyFeatureCollection(),
    });
  }

  ensureFeatureLayer(layerId: string, sourceId: string): void {
    if (this.map.getLayer(layerId)) {
      return;
    }

    this.map.addLayer({
      id: layerId,
      source: sourceId,
      type: "line",
      paint: {
        "line-color": "#111827",
        "line-width": 2,
      },
    });
  }

  setSourceData(sourceId: string, data: FeatureCollection): void {
    const source = this.map.getSource(sourceId);
    if (!source) {
      this.ensureFeatureSource(sourceId);
      this.setSourceData(sourceId, data);
      return;
    }

    if (!isGeoJsonSourceLike(source)) {
      throw new Error(`Source ${sourceId} is not a GeoJSON source.`);
    }

    source.setData(data);
  }
}
