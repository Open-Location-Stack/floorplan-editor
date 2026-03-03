import type { ReactElement } from "react";
import { readCanonicalFeatureType } from "../../lib/imdf/featureAccess";
import { readImdfType } from "../../lib/imdf/featureCatalog";
import {
  isNavigationNodeOpening,
  isNavigationPathOpening,
} from "../../lib/navigation/navigationModel";
import type { FloorFeature, ImdfFeatureType, JsonObject, JsonValue, Level } from "../../lib/types";
import type { AddFeatureRequest } from "./AddFeatureButtonGroups";
import { AmenityFeatureEditor } from "./FeatureEditors/AmenityFeatureEditor";
import { AnchorFeatureEditor } from "./FeatureEditors/AnchorFeatureEditor";
import { DetailFeatureEditor } from "./FeatureEditors/DetailFeatureEditor";
import { FixtureFeatureEditor } from "./FeatureEditors/FixtureFeatureEditor";
import { GenericImdfFeatureEditor } from "./FeatureEditors/GenericImdfFeatureEditor";
import { GeofenceFeatureEditor } from "./FeatureEditors/GeofenceFeatureEditor";
import { KioskFeatureEditor } from "./FeatureEditors/KioskFeatureEditor";
import { LevelFeatureEditor } from "./FeatureEditors/LevelFeatureEditor";
import { NavigationEdgeFeatureEditor } from "./FeatureEditors/NavigationEdgeFeatureEditor";
import { NavigationNodeFeatureEditor } from "./FeatureEditors/NavigationNodeFeatureEditor";
import { OccupantFeatureEditor } from "./FeatureEditors/OccupantFeatureEditor";
import { OpeningFeatureEditor } from "./FeatureEditors/OpeningFeatureEditor";
import { SectionFeatureEditor } from "./FeatureEditors/SectionFeatureEditor";
import { UnitFeatureEditor } from "./FeatureEditors/UnitFeatureEditor";

type FeatureEditorProps = {
  feature: FloorFeature;
  allFeatures: FloorFeature[];
  levels: Level[];
  onCreateFeature: (request: AddFeatureRequest) => void;
  onUpdateProperty: (key: string, value: JsonValue | undefined) => void;
  onUpdateMetadata: (metadata: JsonObject) => void;
  onDelete: () => void;
  onClone: () => void;
  locked: boolean;
  onToggleLock: () => void;
  rawGeoJsonFeature?: unknown;
  rawGeoJsonWarning?: string;
};

const resolveType = (feature: FloorFeature): string => {
  return readCanonicalFeatureType(feature) || "unit";
};

type MappedEditorType =
  | "level"
  | "unit"
  | "section"
  | "geofence"
  | "amenity"
  | "anchor"
  | "detail"
  | "fixture"
  | "kiosk"
  | "occupant";

const RENDERERS: Record<MappedEditorType, (props: FeatureEditorProps) => ReactElement> = {
  level: (props) => <LevelFeatureEditor {...props} type="level" />,
  unit: (props) => <UnitFeatureEditor {...props} type="unit" />,
  section: (props) => <SectionFeatureEditor {...props} type="section" />,
  geofence: (props) => <GeofenceFeatureEditor {...props} type="geofence" />,
  amenity: (props) => <AmenityFeatureEditor {...props} type="amenity" />,
  anchor: (props) => <AnchorFeatureEditor {...props} type="anchor" />,
  detail: (props) => <DetailFeatureEditor {...props} type="detail" />,
  fixture: (props) => <FixtureFeatureEditor {...props} type="fixture" />,
  kiosk: (props) => <KioskFeatureEditor {...props} type="kiosk" />,
  occupant: (props) => <OccupantFeatureEditor {...props} type="occupant" />,
};

const isMappedEditorType = (value: string): value is MappedEditorType => value in RENDERERS;

export const FeatureEditor = (props: FeatureEditorProps) => {
  const type = resolveType(props.feature);
  const mappedRenderer = isMappedEditorType(type) ? RENDERERS[type] : undefined;

  if (mappedRenderer) {
    return mappedRenderer(props);
  }

  const navigationOpeningProps = {
    feature: props.feature,
    allFeatures: props.allFeatures,
    levels: props.levels,
    locked: props.locked,
    onUpdateProperty: props.onUpdateProperty,
    onDelete: props.onDelete,
    onClone: props.onClone,
    onToggleLock: props.onToggleLock,
    rawGeoJsonFeature: props.rawGeoJsonFeature,
    ...(props.rawGeoJsonWarning ? { rawGeoJsonWarning: props.rawGeoJsonWarning } : {}),
  };

  if (type === "opening") {
    if (isNavigationPathOpening(props.feature)) {
      return <NavigationEdgeFeatureEditor {...navigationOpeningProps} />;
    }
    if (isNavigationNodeOpening(props.feature)) {
      return <NavigationNodeFeatureEditor {...navigationOpeningProps} />;
    }
    return <OpeningFeatureEditor {...props} type="opening" />;
  }

  const fallbackType: ImdfFeatureType = readImdfType(type) ?? "unit";
  return <GenericImdfFeatureEditor {...props} type={fallbackType} />;
};
