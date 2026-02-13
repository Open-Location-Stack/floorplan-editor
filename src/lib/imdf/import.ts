import { createId } from "../id";
import type { FloorFeature } from "../types";
import { assertFeature, validateFeatureCollection } from "../validation/geojsonValidation";
import { normalizeFeature } from "./normalize";

type ImportFloorInput = {
  buildingId: string;
  level_id?: string;
  floorId?: string;
  raw: string;
};

export const importFloorGeoJson = ({
  buildingId,
  level_id,
  floorId,
  raw,
}: ImportFloorInput): { ok: true; features: FloorFeature[] } | { ok: false; errors: string[] } => {
  const resolvedLevelId = level_id ?? floorId ?? "";
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      errors: ["Invalid JSON format."],
    };
  }

  const validated = validateFeatureCollection(parsed);
  if (!validated.ok) {
    return validated;
  }

  const features = validated.value.features.map((feature) => {
    const parsedFeature = assertFeature(feature);

    return normalizeFeature(
      {
        ...parsedFeature,
        id: parsedFeature.id || createId(),
      },
      {
        buildingId,
        level_id: resolvedLevelId,
      },
    );
  });

  return {
    ok: true,
    features,
  };
};
