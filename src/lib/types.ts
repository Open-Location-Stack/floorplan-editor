export type ThemeId = "qr-light" | "qr-dark";

export type Coordinates = [number, number];

export type GeometryType = "Point" | "LineString" | "Polygon";

export type PointGeometry = {
  type: "Point";
  coordinates: Coordinates;
};

export type LineStringGeometry = {
  type: "LineString";
  coordinates: Coordinates[];
};

export type PolygonGeometry = {
  type: "Polygon";
  coordinates: Coordinates[][];
};

export type Geometry = PointGeometry | LineStringGeometry | PolygonGeometry;

export type FeatureProperties = {
  kind: string;
  name?: string;
  floorId?: string;
};

export type FloorFeature = {
  type: "Feature";
  id: string;
  geometry: Geometry;
  properties: FeatureProperties;
};

export type FeatureCollection = {
  type: "FeatureCollection";
  features: FloorFeature[];
};

export type OverlayCorners = {
  topLeft: Coordinates;
  topRight: Coordinates;
  bottomRight: Coordinates;
  bottomLeft: Coordinates;
};

export type FloorOverlay = {
  id: string;
  floorId: string;
  imageName: string;
  imageDataUrl: string;
  opacity: number;
  locked?: boolean;
  corners: OverlayCorners;
  updatedAt: string;
};

export type Building = {
  id: string;
  name: string;
};

export type Floor = {
  id: string;
  buildingId: string;
  name: string;
};

export type ProjectSnapshot = {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  features: FloorFeature[];
  overlays: FloorOverlay[];
  buildings?: Building[];
  floors?: Floor[];
};
