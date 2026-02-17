import { readCanonicalFeatureType } from "../imdf/featureAccess";
import { readImdfType } from "../imdf/featureCatalog";
import {
  type NavigationNodeCategory,
  type NavigationPathCategory,
  readFeatureTypeString,
  readNavigationNodeCategory,
  readNavigationPathCategory,
} from "../navigation/navigationModel";
import type { FloorFeature, ImdfFeatureType } from "../types";

export type UiActionIconKey =
  | "search"
  | "export"
  | "import"
  | "add"
  | "delete"
  | "clone"
  | "undo"
  | "redo"
  | "split"
  | "fork"
  | "select"
  | "snap"
  | "route"
  | "clear"
  | "upload"
  | "reset"
  | "show"
  | "hide"
  | "lock"
  | "unlock"
  | "expand"
  | "collapse"
  | "themeDark"
  | "themeLight"
  | "directory"
  | "entry";

export type FeatureIconKey = ImdfFeatureType | "unknown";

export type NavigationNodeIconKey = NavigationNodeCategory;
export type NavigationEdgeIconKey = NavigationPathCategory;

export const getNavigationNodeCategoryIconKey = (
  category: NavigationNodeCategory,
): NavigationNodeIconKey => category;

export const getNavigationEdgeCategoryIconKey = (
  category: NavigationPathCategory,
): NavigationEdgeIconKey => category;

export const getFeatureIconKey = (feature: FloorFeature): FeatureIconKey => {
  const imdfType = readImdfType(
    readCanonicalFeatureType(feature) || readFeatureTypeString(feature),
  );

  return imdfType ?? "unknown";
};

export const readOpeningCategory = (feature: FloorFeature): string | undefined =>
  typeof feature.properties.category === "string" ? feature.properties.category : undefined;

export type MapPointIconId =
  | "point-icon-nav"
  | "point-icon-nav-entrance"
  | "point-icon-nav-door"
  | "point-icon-nav-stairs"
  | "point-icon-nav-elevator"
  | "point-icon-nav-escalator"
  | "point-icon-nav-revolving-door"
  | "point-icon-nav-exit"
  | "point-icon-connector"
  | "point-icon-amenity"
  | "point-icon-anchor"
  | "point-icon-detail"
  | "point-icon-fixture"
  | "point-icon-kiosk"
  | "point-icon-occupant"
  | "point-icon-opening"
  | "point-icon-opening-entrance"
  | "point-icon-opening-door"
  | "point-icon-opening-elevator"
  | "point-icon-opening-stairs"
  | "point-icon-opening-escalator"
  | "point-icon-opening-exit"
  | "point-icon-relationship"
  | "point-icon-default";

export type OpeningEndpointRole = "node" | "connector";

export const mapPointIconIdForOpeningEndpoint = (
  category: string | undefined,
  role: OpeningEndpointRole,
): MapPointIconId => {
  if (role === "connector") {
    return "point-icon-connector";
  }

  if (category === "entrance") {
    return "point-icon-nav-entrance";
  }
  if (category === "door") {
    return "point-icon-nav-door";
  }
  if (category === "stairs") {
    return "point-icon-nav-stairs";
  }
  if (category === "elevator") {
    return "point-icon-nav-elevator";
  }
  if (category === "escalator") {
    return "point-icon-nav-escalator";
  }
  if (category === "revolving_door") {
    return "point-icon-nav-revolving-door";
  }
  if (category === "exit") {
    return "point-icon-nav-exit";
  }

  return "point-icon-nav";
};

export const mapPointIconIdForFeature = (feature: FloorFeature): MapPointIconId => {
  const type = getFeatureIconKey(feature);

  if (type === "opening") {
    const navigationNodeCategory = readNavigationNodeCategory(feature);
    if (navigationNodeCategory === "entrance") {
      return "point-icon-nav-entrance";
    }
    if (navigationNodeCategory === "door") {
      return "point-icon-nav-door";
    }
    if (navigationNodeCategory === "stairs") {
      return "point-icon-nav-stairs";
    }
    if (navigationNodeCategory === "elevator") {
      return "point-icon-nav-elevator";
    }
    if (navigationNodeCategory === "escalator") {
      return "point-icon-nav-escalator";
    }
    if (navigationNodeCategory === "revolving_door") {
      return "point-icon-nav-revolving-door";
    }
    if (navigationNodeCategory === "exit") {
      return "point-icon-nav-exit";
    }
    const category = readOpeningCategory(feature);
    if (category === "pedestrian" && readNavigationPathCategory(feature) === "wheelchair") {
      return "point-icon-nav";
    }
    if (category === "entrance") {
      return "point-icon-opening-entrance";
    }
    if (category === "door") {
      return "point-icon-opening-door";
    }
    if (category === "elevator") {
      return "point-icon-opening-elevator";
    }
    if (category === "stairs") {
      return "point-icon-opening-stairs";
    }
    if (category === "escalator") {
      return "point-icon-opening-escalator";
    }
    if (category === "exit") {
      return "point-icon-opening-exit";
    }
    return "point-icon-opening";
  }

  if (type === "amenity") {
    return "point-icon-amenity";
  }
  if (type === "anchor") {
    return "point-icon-anchor";
  }
  if (type === "detail") {
    return "point-icon-detail";
  }
  if (type === "fixture") {
    return "point-icon-fixture";
  }
  if (type === "kiosk") {
    return "point-icon-kiosk";
  }
  if (type === "occupant") {
    return "point-icon-occupant";
  }
  if (type === "relationship") {
    return "point-icon-relationship";
  }

  return "point-icon-default";
};
