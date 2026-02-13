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

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = {
  [key: string]: JsonValue;
};

export type ImdfFeatureType =
  | "address"
  | "amenity"
  | "anchor"
  | "building"
  | "directory"
  | "detail"
  | "fixture"
  | "footprint"
  | "geofence"
  | "kiosk"
  | "level"
  | "occupant"
  | "opening"
  | "relationship"
  | "section"
  | "unit"
  | "venue";

export type ImdfLabel = Record<string, string>;

export type ImdfReference = {
  id: string;
  feature_type: string;
};

export type ImdfRelationshipDirection = "directed" | "undirected";

export type RelationshipFeatureRef = {
  featureId: string;
  floorId?: string;
};

export type RelationshipRefs = {
  origin: RelationshipFeatureRef;
  intermediary?: RelationshipFeatureRef;
  destination: RelationshipFeatureRef;
};

export type FeatureStyle = {
  color?: string;
  fillColor?: string;
  opacity?: number;
  icon?: string;
};

export type FeatureProperties = {
  kind: string;
  name?: string | ImdfLabel;
  floorId?: string;
  buildingId?: string;
  id?: string;
  imdf_id?: string;
  floor_id?: string;
  level_id?: string;
  building_id?: string;
  venueId?: string;
  containmentParentId?: string;
  containmentParentType?: ImdfFeatureType | "level";
  featureType?: string;
  category?: string;
  externalId?: string;
  imdfType?: string;
  imdfClass?: string;
  imdf_feature_type?: ImdfFeatureType;
  short_name?: ImdfLabel;
  display_point?: Coordinates;
  ordinal?: number;
  outdoor?: boolean;
  door?: JsonValue;
  direction?: ImdfRelationshipDirection;
  restriction?: string;
  section_id?: string;
  unit_id?: string;
  anchor_id?: string;
  accessibility?: JsonValue;
  website?: string;
  phone?: string;
  hours?: string;
  address_id?: string;
  venue_id?: string;
  unit_ids?: string[];
  building_ids?: string[];
  origin?: string | ImdfReference;
  intermediary?: string | ImdfReference;
  destination?: string | ImdfReference;
  origin_id?: string;
  intermediary_id?: string;
  destination_id?: string;
  relation?: RelationshipRefs;
  style?: FeatureStyle;
  metadata?: JsonObject;
  [key: string]: JsonValue | undefined;
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
  visible?: boolean;
  locked?: boolean;
  corners: OverlayCorners;
  updatedAt: string;
};

export type Building = {
  id: string;
  venueId?: string;
  name: string;
  location?: Coordinates;
  imdf?: {
    venue?: {
      id?: string;
      name?: ImdfLabel;
      category?: string;
    };
    address?: {
      id?: string;
      address?: string;
      locality?: string;
      province?: string;
      country?: string;
      postal_code?: string;
      unit?: string;
      floor?: string;
      region?: string;
      neighborhood?: string;
    };
    directory?: Array<{
      id: string;
      name: ImdfLabel;
      category?: string;
      phone?: string;
      website?: string;
      hours?: string;
      unit_ids?: string[];
      anchor_id?: string;
      metadata?: JsonObject;
    }>;
  };
};

export type Venue = {
  id: string;
  name: string;
};

export type Level = {
  id: string;
  buildingId: string;
  name: string;
};
export type Floor = Level;

export type ProjectSnapshot = {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  features: FloorFeature[];
  overlays: FloorOverlay[];
  lockedFeatureIds?: string[];
  lockedOverlayFloorIds?: string[];
  venues?: Venue[];
  buildings?: Building[];
  levels?: Level[];
  floors?: Floor[];
};
