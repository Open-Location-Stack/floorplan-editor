import type { FloorFeature } from "../types";

export type FloorValidationResult = {
  errors: string[];
  warnings: string[];
};

export const validateFloor = (floorId: string, features: FloorFeature[]): FloorValidationResult => {
  const floorFeatures = features.filter((feature) => feature.properties.floorId === floorId);

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const feature of floorFeatures) {
    if (typeof feature.properties.imdfType !== "string" || !feature.properties.imdfType) {
      warnings.push(`Feature ${feature.id} has no IMDF type.`);
    }

    if (
      typeof feature.properties.name !== "string" ||
      feature.properties.name.trim().length === 0
    ) {
      warnings.push(`Feature ${feature.id} has no display name.`);
    }

    if (feature.geometry.type === "LineString" && feature.properties.kind !== "path") {
      warnings.push(`Feature ${feature.id} is a line but not marked as path.`);
    }

    if (typeof feature.properties.floorId !== "string" || feature.properties.floorId !== floorId) {
      errors.push(`Feature ${feature.id} is not assigned to floor ${floorId}.`);
    }
  }

  return { errors, warnings };
};
