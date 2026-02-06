import { z } from "zod";
import type { FeatureCollection, FloorFeature } from "../types";

const coordinateSchema = z.tuple([z.number(), z.number()]);

const pointGeometrySchema = z.object({
  type: z.literal("Point"),
  coordinates: coordinateSchema,
});

const lineStringGeometrySchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(coordinateSchema).min(2),
});

const polygonGeometrySchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(coordinateSchema).min(4)).min(1),
});

const geometrySchema = z.discriminatedUnion("type", [
  pointGeometrySchema,
  lineStringGeometrySchema,
  polygonGeometrySchema,
]);

const featureSchema = z.object({
  type: z.literal("Feature"),
  id: z.string().min(1),
  geometry: geometrySchema,
  properties: z.object({
    kind: z.string().min(1),
    name: z.string().optional(),
    floorId: z.string().optional(),
  }),
});

const collectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(featureSchema),
});

export const validateFeatureCollection = (
  value: unknown,
): { ok: true; value: FeatureCollection } | { ok: false; errors: string[] } => {
  const parsed = collectionSchema.safeParse(value);

  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "root"}: ${issue.message}`,
      ),
    };
  }

  return {
    ok: true,
    value: parsed.data as FeatureCollection,
  };
};

export const assertFeature = (value: unknown): FloorFeature =>
  featureSchema.parse(value) as FloorFeature;
