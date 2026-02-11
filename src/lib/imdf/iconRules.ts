import type { FloorFeature } from "../types";

const FEATURE_ICON_MAP: Record<string, string> = {
  amenity: "dot-amenity",
  anchor: "dot-anchor",
  detail: "dot-detail",
  fixture: "dot-fixture",
  kiosk: "dot-kiosk",
  occupant: "dot-occupant",
  opening: "dot-opening",
  relationship: "dot-relationship",
};

const OPENING_CATEGORY_ICON_MAP: Record<string, string> = {
  entrance: "dot-entrance",
  door: "dot-door",
  stairs: "dot-stairs",
  elevator: "dot-elevator",
  escalator: "dot-escalator",
  exit: "dot-exit",
};

export const getFeatureIconName = (feature: FloorFeature): string | undefined => {
  const type =
    typeof feature.properties.imdfType === "string"
      ? feature.properties.imdfType
      : feature.properties.kind;
  if (!type) {
    return undefined;
  }

  if (type === "opening" && typeof feature.properties.category === "string") {
    return OPENING_CATEGORY_ICON_MAP[feature.properties.category] ?? FEATURE_ICON_MAP[type];
  }

  return FEATURE_ICON_MAP[type];
};
