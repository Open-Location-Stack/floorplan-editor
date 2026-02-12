import type { Floor, FloorFeature, ImdfFeatureType, JsonObject } from "../../lib/types";
import { AmenityFeatureEditor } from "./FeatureEditors/AmenityFeatureEditor";
import { AnchorFeatureEditor } from "./FeatureEditors/AnchorFeatureEditor";
import { DetailFeatureEditor } from "./FeatureEditors/DetailFeatureEditor";
import { FixtureFeatureEditor } from "./FeatureEditors/FixtureFeatureEditor";
import { GenericImdfFeatureEditor } from "./FeatureEditors/GenericImdfFeatureEditor";
import { GeofenceFeatureEditor } from "./FeatureEditors/GeofenceFeatureEditor";
import { KioskFeatureEditor } from "./FeatureEditors/KioskFeatureEditor";
import { LevelFeatureEditor } from "./FeatureEditors/LevelFeatureEditor";
import { OccupantFeatureEditor } from "./FeatureEditors/OccupantFeatureEditor";
import { OpeningFeatureEditor } from "./FeatureEditors/OpeningFeatureEditor";
import { SectionFeatureEditor } from "./FeatureEditors/SectionFeatureEditor";
import { UnitFeatureEditor } from "./FeatureEditors/UnitFeatureEditor";

type FeatureEditorProps = {
  feature: FloorFeature;
  allFeatures: FloorFeature[];
  floors: Floor[];
  onUpdateProperty: (key: string, value: string) => void;
  onUpdateMetadata: (metadata: JsonObject) => void;
  onDelete: () => void;
  onClone: () => void;
  locked: boolean;
  onToggleLock: () => void;
};

const resolveType = (feature: FloorFeature): ImdfFeatureType => {
  const typeCandidate =
    typeof feature.properties.imdfType === "string"
      ? feature.properties.imdfType
      : feature.properties.kind;
  return (typeCandidate as ImdfFeatureType) ?? "unit";
};

export const FeatureEditor = (props: FeatureEditorProps) => {
  const type = resolveType(props.feature);
  const editorProps = {
    ...props,
    type,
  };

  switch (type) {
    case "level":
      return <LevelFeatureEditor {...editorProps} />;
    case "unit":
      return <UnitFeatureEditor {...editorProps} />;
    case "section":
      return <SectionFeatureEditor {...editorProps} />;
    case "geofence":
      return <GeofenceFeatureEditor {...editorProps} />;
    case "opening":
      return <OpeningFeatureEditor {...editorProps} />;
    case "amenity":
      return <AmenityFeatureEditor {...editorProps} />;
    case "anchor":
      return <AnchorFeatureEditor {...editorProps} />;
    case "detail":
      return <DetailFeatureEditor {...editorProps} />;
    case "fixture":
      return <FixtureFeatureEditor {...editorProps} />;
    case "kiosk":
      return <KioskFeatureEditor {...editorProps} />;
    case "occupant":
      return <OccupantFeatureEditor {...editorProps} />;
    default:
      return <GenericImdfFeatureEditor {...editorProps} />;
  }
};
