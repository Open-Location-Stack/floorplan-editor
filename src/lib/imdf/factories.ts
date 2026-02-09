import { createId } from "../id";
import type { Coordinates, FloorFeature } from "../types";
import { type NormalizeContext, normalizeFeature } from "./normalize";
import { getImdfSchemaRule, type SupportedImdfType } from "./schema";

type CreateImdfFeatureInput = {
  type: SupportedImdfType;
  center: Coordinates;
  context: NormalizeContext;
};

const polygonAroundCenter = (center: Coordinates, span = 0.0001): Coordinates[][] => [
  [
    [center[0] - span, center[1] - span],
    [center[0] + span, center[1] - span],
    [center[0] + span, center[1] + span],
    [center[0] - span, center[1] + span],
    [center[0] - span, center[1] - span],
  ],
];

const lineAroundCenter = (center: Coordinates, span = 0.00012): Coordinates[] => [
  [center[0] - span, center[1] - span],
  [center[0] + span, center[1] + span],
];

export const createImdfFeature = ({
  type,
  center,
  context,
}: CreateImdfFeatureInput): FloorFeature => {
  const schema = getImdfSchemaRule(type);
  const id = createId();

  const baseFeature: FloorFeature =
    schema.geometryType === "LineString"
      ? {
          type: "Feature",
          id,
          geometry: {
            type: "LineString",
            coordinates: lineAroundCenter(center),
          },
          properties: {
            kind: type,
            name: schema.defaultName,
          },
        }
      : {
          type: "Feature",
          id,
          geometry: {
            type: "Polygon",
            coordinates: polygonAroundCenter(center),
          },
          properties: {
            kind: type,
            name: schema.defaultName,
          },
        };

  return normalizeFeature(baseFeature, context);
};

export const cloneImdfFeature = (
  feature: FloorFeature,
  context: NormalizeContext,
  offset = 0.00003,
): FloorFeature => {
  const id = createId();

  const geometry =
    feature.geometry.type === "LineString"
      ? {
          type: "LineString" as const,
          coordinates: feature.geometry.coordinates.map((coordinate) => [
            coordinate[0] + offset,
            coordinate[1] + offset,
          ]) as Coordinates[],
        }
      : feature.geometry.type === "Polygon"
        ? {
            type: "Polygon" as const,
            coordinates: feature.geometry.coordinates.map((ring) =>
              ring.map((coordinate) => [coordinate[0] + offset, coordinate[1] + offset]),
            ) as Coordinates[][],
          }
        : {
            type: "Point" as const,
            coordinates: [
              feature.geometry.coordinates[0] + offset,
              feature.geometry.coordinates[1] + offset,
            ] as Coordinates,
          };

  return normalizeFeature(
    {
      ...feature,
      id,
      geometry,
      properties: {
        ...feature.properties,
        name:
          typeof feature.properties.name === "string" && feature.properties.name.trim().length > 0
            ? `${feature.properties.name} copy`
            : "Feature copy",
      },
    },
    context,
  );
};
