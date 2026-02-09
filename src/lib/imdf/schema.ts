export const IMDF_SUPPORTED_TYPES = ["level", "unit", "zone", "path"] as const;

export type SupportedImdfType = (typeof IMDF_SUPPORTED_TYPES)[number];

export type GeometryTemplateType = "Polygon" | "LineString";

export type ImdfSchemaRule = {
  type: SupportedImdfType;
  geometryType: GeometryTemplateType;
  defaultName: string;
  sortOrder: number;
};

const IMDF_SCHEMA_RULES: Record<SupportedImdfType, ImdfSchemaRule> = {
  level: {
    type: "level",
    geometryType: "Polygon",
    defaultName: "Level",
    sortOrder: 1,
  },
  zone: {
    type: "zone",
    geometryType: "Polygon",
    defaultName: "Zone",
    sortOrder: 2,
  },
  unit: {
    type: "unit",
    geometryType: "Polygon",
    defaultName: "Unit",
    sortOrder: 3,
  },
  path: {
    type: "path",
    geometryType: "LineString",
    defaultName: "Path",
    sortOrder: 4,
  },
};

export const getImdfSchemaRule = (type: SupportedImdfType): ImdfSchemaRule =>
  IMDF_SCHEMA_RULES[type];

export const isSupportedImdfType = (value: string): value is SupportedImdfType =>
  IMDF_SUPPORTED_TYPES.includes(value as SupportedImdfType);
