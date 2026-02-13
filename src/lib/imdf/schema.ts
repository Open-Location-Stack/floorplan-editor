import type { GeometryType, ImdfFeatureType } from "../types";
import {
  FLOOR_FEATURE_TYPES,
  getFeatureSpec,
  IMDF_FEATURE_TYPES,
  type ImdfFeatureSpec,
  isImdfFeatureType,
} from "./featureCatalog";

export const IMDF_SUPPORTED_TYPES = FLOOR_FEATURE_TYPES.filter(
  (type) => type !== "level" && type !== "relationship",
);

export type SupportedImdfType = Exclude<(typeof FLOOR_FEATURE_TYPES)[number], "relationship">;

export type GeometryTemplateType = GeometryType;

export type ImdfSchemaRule = {
  type: ImdfFeatureType;
  geometryType: GeometryTemplateType;
  defaultName: string;
  sortOrder: number;
};

export const getImdfSchemaRule = (type: ImdfFeatureType): ImdfSchemaRule => {
  const spec = getFeatureSpec(type);
  return {
    type: spec.type,
    geometryType: spec.geometryType,
    defaultName: spec.defaultName,
    sortOrder: spec.sortOrder,
  };
};

export const getImdfFeatureSpec = (type: ImdfFeatureType): ImdfFeatureSpec => getFeatureSpec(type);

export const getAllImdfFeatureTypes = (): ImdfFeatureType[] => [...IMDF_FEATURE_TYPES];

export const isSupportedImdfType = (value: string): value is SupportedImdfType =>
  value !== "relationship" && (IMDF_SUPPORTED_TYPES as readonly string[]).includes(value);

export const isKnownImdfType = (value: string): value is ImdfFeatureType =>
  isImdfFeatureType(value);
