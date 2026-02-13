import { readImdfType } from "../../lib/imdf/featureCatalog";
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
  if (typeof feature.feature_type === "string") {
    return feature.feature_type;
  }
  if (typeof feature.properties.feature_type === "string") {
    return feature.properties.feature_type;
  }
  if (typeof feature.properties.kind === "string") {
    return feature.properties.kind;
  }
  return "unit";
};

export const FeatureEditor = (props: FeatureEditorProps) => {
  const type = resolveType(props.feature);

  switch (type) {
    case "level":
      return <LevelFeatureEditor {...props} type="level" />;
    case "unit":
      return <UnitFeatureEditor {...props} type="unit" />;
    case "section":
      return <SectionFeatureEditor {...props} type="section" />;
    case "geofence":
      return <GeofenceFeatureEditor {...props} type="geofence" />;
    case "opening":
      return <OpeningFeatureEditor {...props} type="opening" />;
    case "amenity":
      return <AmenityFeatureEditor {...props} type="amenity" />;
    case "anchor":
      return <AnchorFeatureEditor {...props} type="anchor" />;
    case "detail":
      return <DetailFeatureEditor {...props} type="detail" />;
    case "fixture":
      return <FixtureFeatureEditor {...props} type="fixture" />;
    case "kiosk":
      return <KioskFeatureEditor {...props} type="kiosk" />;
    case "occupant":
      return <OccupantFeatureEditor {...props} type="occupant" />;
    case "formation:navigation-node":
      return (
        <NavigationNodeFeatureEditor
          feature={props.feature}
          levels={props.levels}
          locked={props.locked}
          onUpdateProperty={props.onUpdateProperty}
          onDelete={props.onDelete}
          onClone={props.onClone}
          onToggleLock={props.onToggleLock}
          rawGeoJsonFeature={props.rawGeoJsonFeature}
          {...(props.rawGeoJsonWarning ? { rawGeoJsonWarning: props.rawGeoJsonWarning } : {})}
        />
      );
    case "formation:navigation-edge":
      return (
        <NavigationEdgeFeatureEditor
          feature={props.feature}
          allFeatures={props.allFeatures}
          levels={props.levels}
          locked={props.locked}
          onUpdateProperty={props.onUpdateProperty}
          onDelete={props.onDelete}
          onClone={props.onClone}
          onToggleLock={props.onToggleLock}
          rawGeoJsonFeature={props.rawGeoJsonFeature}
          {...(props.rawGeoJsonWarning ? { rawGeoJsonWarning: props.rawGeoJsonWarning } : {})}
        />
      );
    default:
      return (
        <GenericImdfFeatureEditor
          {...props}
          type={(readImdfType(type) ?? "unit") as ImdfFeatureType}
        />
      );
  }
};
