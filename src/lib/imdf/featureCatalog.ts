import type { FeatureProperties, GeometryType, ImdfFeatureType, JsonValue } from "../types";
import {
  AMENITY_CATEGORY_SUGGESTIONS,
  FIXTURE_CATEGORY_SUGGESTIONS,
  GEOFENCE_CATEGORY_SUGGESTIONS,
  OCCUPANT_CATEGORY_SUGGESTIONS,
  OPENING_CATEGORY_SUGGESTIONS,
  SECTION_CATEGORY_SUGGESTIONS,
  UNIT_CATEGORY_SUGGESTIONS,
} from "./categories";

export type FeatureFieldType =
  | "string"
  | "number"
  | "boolean"
  | "label"
  | "string[]"
  | "uuid"
  | "json"
  | "reference";

export type EditorControlType =
  | "text"
  | "number"
  | "checkbox"
  | "label-json"
  | "uuid-ref"
  | "string-list"
  | "enum"
  | "json";

export type ImdfFeatureField = {
  key: string;
  type: FeatureFieldType;
  required: boolean;
  readOnly?: boolean;
  derived?: boolean;
  editorControl?: EditorControlType;
  defaultValue?: JsonValue;
  enumOptions?: string[];
  allowCustomValues?: boolean;
  referenceTypes?: ImdfFeatureType[];
  scope?: "same-level" | "same-building" | "global";
  placeholder?: string;
  derive?: (
    properties: FeatureProperties,
    context: { level_id?: string; buildingId?: string },
  ) => JsonValue | undefined;
};

export type ImdfFeatureSpec = {
  type: ImdfFeatureType;
  geometryType: GeometryType;
  defaultName: string;
  sortOrder: number;
  floorBound: boolean;
  fields: ImdfFeatureField[];
};

const floorReferenceField = {
  key: "level_id",
  type: "uuid",
  required: true,
  readOnly: true,
  derived: true,
  editorControl: "uuid-ref",
  derive: (_properties: FeatureProperties, context: { level_id?: string }) => context.level_id,
} as const;

const optionalNameFloorFields = [
  { key: "name", type: "label", required: false, editorControl: "label-json" },
  floorReferenceField,
] as const;

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
    fields: [{ key: "name", type: "label", required: true, editorControl: "label-json" }],
  },
  building: {
    type: "building",
    geometryType: "Point",
    defaultName: "Building",
    sortOrder: 3,
    floorBound: false,
    fields: [
      { key: "name", type: "label", required: true, editorControl: "label-json" },
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
      { key: "name", type: "label", required: true, editorControl: "label-json" },
      { key: "building_ids", type: "string[]", required: true, readOnly: true, derived: true },
    ],
  },
  directory: {
    type: "directory",
    geometryType: "Point",
    defaultName: "Directory",
    sortOrder: 5,
    floorBound: false,
    fields: [],
  },
  level: {
    type: "level",
    geometryType: "Polygon",
    defaultName: "Level",
    sortOrder: 10,
    floorBound: true,
    fields: [
      { key: "name", type: "label", required: true, editorControl: "label-json" },
      { key: "short_name", type: "label", required: true, editorControl: "label-json" },
      { key: "ordinal", type: "number", required: true, editorControl: "number", defaultValue: 0 },
      {
        key: "outdoor",
        type: "boolean",
        required: true,
        editorControl: "checkbox",
        defaultValue: false,
      },
      {
        key: "building_ids",
        type: "string[]",
        required: true,
        readOnly: true,
        derived: true,
        editorControl: "string-list",
        derive: (_properties: FeatureProperties, context: { buildingId?: string }) =>
          context.buildingId ? [context.buildingId] : [],
      },
    ],
  },
  unit: {
    type: "unit",
    geometryType: "Polygon",
    defaultName: "Unit",
    sortOrder: 11,
    floorBound: true,
    fields: [
      ...optionalNameFloorFields,
      {
        key: "category",
        type: "string",
        required: true,
        editorControl: "enum",
        enumOptions: [...UNIT_CATEGORY_SUGGESTIONS],
        allowCustomValues: true,
        defaultValue: "unspecified",
      },
    ],
  },
  section: {
    type: "section",
    geometryType: "Polygon",
    defaultName: "Section",
    sortOrder: 12,
    floorBound: true,
    fields: [
      ...optionalNameFloorFields,
      {
        key: "category",
        type: "string",
        required: true,
        editorControl: "text",
        enumOptions: [...SECTION_CATEGORY_SUGGESTIONS],
        allowCustomValues: true,
      },
      {
        key: "section_id",
        type: "uuid",
        required: true,
        editorControl: "uuid-ref",
        referenceTypes: ["section"],
        scope: "same-level",
      },
    ],
  },
  geofence: {
    type: "geofence",
    geometryType: "Polygon",
    defaultName: "Geofence",
    sortOrder: 13,
    floorBound: true,
    fields: [
      ...optionalNameFloorFields,
      {
        key: "category",
        type: "string",
        required: true,
        editorControl: "text",
        enumOptions: [...GEOFENCE_CATEGORY_SUGGESTIONS],
        allowCustomValues: true,
      },
      {
        key: "restriction",
        type: "string",
        required: true,
        editorControl: "enum",
        enumOptions: ["none", "employees", "restricted"],
      },
    ],
  },
  opening: {
    type: "opening",
    geometryType: "LineString",
    defaultName: "Opening",
    sortOrder: 20,
    floorBound: true,
    fields: [
      ...optionalNameFloorFields,
      {
        key: "category",
        type: "string",
        required: true,
        editorControl: "enum",
        enumOptions: [...OPENING_CATEGORY_SUGGESTIONS],
        allowCustomValues: true,
      },
      {
        key: "door",
        type: "json",
        required: false,
        editorControl: "json",
      },
      {
        key: "accessibility",
        type: "json",
        required: false,
        editorControl: "json",
      },
    ],
  },
  relationship: {
    type: "relationship",
    geometryType: "LineString",
    defaultName: "Relationship",
    sortOrder: 21,
    floorBound: true,
    fields: [
      { key: "name", type: "label", required: true, editorControl: "label-json" },
      {
        key: "origin",
        type: "reference",
        required: true,
        editorControl: "uuid-ref",
        scope: "same-level",
      },
      {
        key: "intermediary",
        type: "reference",
        required: false,
        editorControl: "uuid-ref",
        scope: "same-level",
      },
      {
        key: "destination",
        type: "reference",
        required: true,
        editorControl: "uuid-ref",
        scope: "same-level",
      },
      {
        key: "direction",
        type: "string",
        required: true,
        editorControl: "enum",
        defaultValue: "directed",
        enumOptions: ["directed", "undirected"],
      },
    ],
  },
  amenity: {
    type: "amenity",
    geometryType: "Point",
    defaultName: "Amenity",
    sortOrder: 30,
    floorBound: true,
    fields: [
      ...optionalNameFloorFields,
      {
        key: "category",
        type: "string",
        required: true,
        editorControl: "enum",
        enumOptions: [...AMENITY_CATEGORY_SUGGESTIONS],
        allowCustomValues: true,
      },
      { key: "unit_ids", type: "string[]", required: false, editorControl: "string-list" },
      {
        key: "anchor_id",
        type: "uuid",
        required: false,
        editorControl: "uuid-ref",
        referenceTypes: ["anchor"],
        scope: "same-level",
      },
    ],
  },
  anchor: {
    type: "anchor",
    geometryType: "Point",
    defaultName: "Anchor",
    sortOrder: 31,
    floorBound: true,
    fields: [
      { key: "name", type: "label", required: false, editorControl: "label-json" },
      {
        key: "unit_id",
        type: "uuid",
        required: true,
        editorControl: "uuid-ref",
        referenceTypes: ["unit"],
        scope: "same-level",
      },
      {
        key: "address_id",
        type: "uuid",
        required: false,
        editorControl: "uuid-ref",
        referenceTypes: ["address"],
        scope: "global",
      },
    ],
  },
  detail: {
    type: "detail",
    geometryType: "Point",
    defaultName: "Detail",
    sortOrder: 32,
    floorBound: true,
    fields: [
      ...optionalNameFloorFields,
      {
        key: "anchor_id",
        type: "uuid",
        required: true,
        editorControl: "uuid-ref",
        referenceTypes: ["anchor"],
        scope: "same-level",
      },
    ],
  },
  fixture: {
    type: "fixture",
    geometryType: "Point",
    defaultName: "Fixture",
    sortOrder: 33,
    floorBound: true,
    fields: [
      ...optionalNameFloorFields,
      {
        key: "category",
        type: "string",
        required: true,
        editorControl: "enum",
        enumOptions: [...FIXTURE_CATEGORY_SUGGESTIONS],
        allowCustomValues: true,
      },
      {
        key: "anchor_id",
        type: "uuid",
        required: true,
        editorControl: "uuid-ref",
        referenceTypes: ["anchor"],
        scope: "same-level",
      },
    ],
  },
  kiosk: {
    type: "kiosk",
    geometryType: "Point",
    defaultName: "Kiosk",
    sortOrder: 34,
    floorBound: true,
    fields: [
      ...optionalNameFloorFields,
      {
        key: "anchor_id",
        type: "uuid",
        required: false,
        editorControl: "uuid-ref",
        referenceTypes: ["anchor"],
        scope: "same-level",
      },
    ],
  },
  occupant: {
    type: "occupant",
    geometryType: "Point",
    defaultName: "Occupant",
    sortOrder: 35,
    floorBound: true,
    fields: [
      ...optionalNameFloorFields,
      {
        key: "category",
        type: "string",
        required: true,
        editorControl: "enum",
        enumOptions: [...OCCUPANT_CATEGORY_SUGGESTIONS],
        allowCustomValues: true,
      },
      { key: "website", type: "string", required: false, editorControl: "text" },
      { key: "phone", type: "string", required: false, editorControl: "text" },
      { key: "hours", type: "string", required: false, editorControl: "text" },
      {
        key: "anchor_id",
        type: "uuid",
        required: true,
        editorControl: "uuid-ref",
        referenceTypes: ["anchor"],
        scope: "same-level",
      },
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
