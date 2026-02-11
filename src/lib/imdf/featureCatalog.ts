import type { GeometryType, ImdfFeatureType } from "../types";

type FeatureFieldType = "string" | "number" | "boolean" | "label" | "string[]" | "uuid";

export type ImdfFeatureField = {
  key: string;
  type: FeatureFieldType;
  required: boolean;
  readOnly?: boolean;
  derived?: boolean;
};

export type ImdfFeatureSpec = {
  type: ImdfFeatureType;
  geometryType: GeometryType;
  defaultName: string;
  sortOrder: number;
  floorBound: boolean;
  fields: ImdfFeatureField[];
};

export const IMDF_FEATURE_SPECS: Record<ImdfFeatureType, ImdfFeatureSpec> = {
  address: {
    type: "address",
    geometryType: "Point",
    defaultName: "Address",
    sortOrder: 1,
    floorBound: false,
    fields: [],
  },
  venue: {
    type: "venue",
    geometryType: "Polygon",
    defaultName: "Venue",
    sortOrder: 2,
    floorBound: false,
    fields: [{ key: "name", type: "label", required: true }],
  },
  building: {
    type: "building",
    geometryType: "Point",
    defaultName: "Building",
    sortOrder: 3,
    floorBound: false,
    fields: [
      { key: "name", type: "label", required: true },
      { key: "venue_id", type: "uuid", required: true, readOnly: true, derived: true },
      { key: "address_id", type: "uuid", required: false, readOnly: true, derived: true },
    ],
  },
  footprint: {
    type: "footprint",
    geometryType: "Polygon",
    defaultName: "Footprint",
    sortOrder: 4,
    floorBound: false,
    fields: [
      { key: "name", type: "label", required: true },
      { key: "building_ids", type: "string[]", required: true, readOnly: true, derived: true },
    ],
  },
  level: {
    type: "level",
    geometryType: "Polygon",
    defaultName: "Level",
    sortOrder: 10,
    floorBound: true,
    fields: [
      { key: "name", type: "label", required: true },
      { key: "short_name", type: "label", required: true },
      { key: "ordinal", type: "number", required: true },
      { key: "outdoor", type: "boolean", required: true },
      { key: "building_ids", type: "string[]", required: true, readOnly: true, derived: true },
    ],
  },
  unit: {
    type: "unit",
    geometryType: "Polygon",
    defaultName: "Unit",
    sortOrder: 11,
    floorBound: true,
    fields: [
      { key: "name", type: "label", required: true },
      { key: "level_id", type: "uuid", required: true, readOnly: true, derived: true },
      { key: "category", type: "string", required: true },
    ],
  },
  section: {
    type: "section",
    geometryType: "Polygon",
    defaultName: "Section",
    sortOrder: 12,
    floorBound: true,
    fields: [
      { key: "name", type: "label", required: true },
      { key: "level_id", type: "uuid", required: true, readOnly: true, derived: true },
      { key: "category", type: "string", required: false },
    ],
  },
  geofence: {
    type: "geofence",
    geometryType: "Polygon",
    defaultName: "Geofence",
    sortOrder: 13,
    floorBound: true,
    fields: [
      { key: "name", type: "label", required: true },
      { key: "level_id", type: "uuid", required: true, readOnly: true, derived: true },
    ],
  },
  opening: {
    type: "opening",
    geometryType: "LineString",
    defaultName: "Opening",
    sortOrder: 20,
    floorBound: true,
    fields: [
      { key: "name", type: "label", required: true },
      { key: "level_id", type: "uuid", required: true, readOnly: true, derived: true },
      { key: "category", type: "string", required: false },
    ],
  },
  relationship: {
    type: "relationship",
    geometryType: "LineString",
    defaultName: "Relationship",
    sortOrder: 21,
    floorBound: true,
    fields: [
      { key: "name", type: "label", required: true },
      { key: "origin_id", type: "uuid", required: true },
      { key: "intermediary_id", type: "uuid", required: true },
      { key: "destination_id", type: "uuid", required: true },
    ],
  },
  amenity: {
    type: "amenity",
    geometryType: "Point",
    defaultName: "Amenity",
    sortOrder: 30,
    floorBound: true,
    fields: [
      { key: "name", type: "label", required: true },
      { key: "level_id", type: "uuid", required: true, readOnly: true, derived: true },
      { key: "category", type: "string", required: true },
      { key: "unit_ids", type: "string[]", required: false },
    ],
  },
  anchor: {
    type: "anchor",
    geometryType: "Point",
    defaultName: "Anchor",
    sortOrder: 31,
    floorBound: true,
    fields: [{ key: "name", type: "label", required: true }],
  },
  detail: {
    type: "detail",
    geometryType: "Point",
    defaultName: "Detail",
    sortOrder: 32,
    floorBound: true,
    fields: [
      { key: "name", type: "label", required: true },
      { key: "level_id", type: "uuid", required: true, readOnly: true, derived: true },
    ],
  },
  fixture: {
    type: "fixture",
    geometryType: "Point",
    defaultName: "Fixture",
    sortOrder: 33,
    floorBound: true,
    fields: [
      { key: "name", type: "label", required: true },
      { key: "level_id", type: "uuid", required: true, readOnly: true, derived: true },
      { key: "category", type: "string", required: false },
    ],
  },
  kiosk: {
    type: "kiosk",
    geometryType: "Point",
    defaultName: "Kiosk",
    sortOrder: 34,
    floorBound: true,
    fields: [
      { key: "name", type: "label", required: true },
      { key: "level_id", type: "uuid", required: true, readOnly: true, derived: true },
    ],
  },
  occupant: {
    type: "occupant",
    geometryType: "Point",
    defaultName: "Occupant",
    sortOrder: 35,
    floorBound: true,
    fields: [
      { key: "name", type: "label", required: true },
      { key: "level_id", type: "uuid", required: true, readOnly: true, derived: true },
      { key: "category", type: "string", required: false },
      { key: "website", type: "string", required: false },
      { key: "phone", type: "string", required: false },
      { key: "hours", type: "string", required: false },
    ],
  },
};

export const IMDF_FEATURE_TYPES = Object.keys(IMDF_FEATURE_SPECS) as ImdfFeatureType[];

export const FLOOR_FEATURE_TYPES = IMDF_FEATURE_TYPES.filter(
  (type) => IMDF_FEATURE_SPECS[type].floorBound,
);

export const isImdfFeatureType = (value: string): value is ImdfFeatureType =>
  value in IMDF_FEATURE_SPECS;

export const getFeatureSpec = (type: ImdfFeatureType): ImdfFeatureSpec => IMDF_FEATURE_SPECS[type];

export const readImdfType = (candidate: unknown): ImdfFeatureType | undefined =>
  typeof candidate === "string" && isImdfFeatureType(candidate) ? candidate : undefined;
