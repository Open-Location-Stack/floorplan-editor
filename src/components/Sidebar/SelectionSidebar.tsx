import type { Selection } from "../../lib/editor/selection";
import type { SupportedImdfType } from "../../lib/imdf/schema";
import { validateFloor } from "../../lib/imdf/validate";
import type { Building, Floor, FloorFeature, FloorOverlay, JsonObject } from "../../lib/types";
import { BuildingEditor } from "./BuildingEditor";
import { FeatureEditor } from "./FeatureEditor";
import { FloorEditor } from "./FloorEditor";

type SelectionSidebarProps = {
  selection: Selection | undefined;
  building: Building | undefined;
  floor: Floor | undefined;
  feature: FloorFeature | undefined;
  allFeatures: FloorFeature[];
  overlay: FloorOverlay | undefined;
  onRenameBuilding: (buildingId: string, name: string) => void;
  onDeleteBuilding: (buildingId: string) => void;
  onAddFloor: (buildingId: string) => void;
  onRenameFloor: (floorId: string, name: string) => void;
  onCloneFloor: (floorId: string) => void;
  onDeleteFloor: (floorId: string) => void;
  onCreateFeature: (type: SupportedImdfType) => void;
  onUpdateFeatureProperty: (featureId: string, key: string, value: string) => void;
  onUpdateFeatureMetadata: (featureId: string, metadata: JsonObject) => void;
  onDeleteFeature: (featureId: string) => void;
  onCloneFeature: (featureId: string) => void;
  onOverlayUpload: (file: File) => void;
  onOverlayOpacityChange: (opacity: number) => void;
  onOverlayRecenter: () => void;
  onOverlayToggleVisibility: () => void;
  onOverlayToggleLock: () => void;
  onReplaceFloorFeatures: (floorId: string, features: FloorFeature[]) => void;
};

export const SelectionSidebar = ({
  selection,
  building,
  floor,
  feature,
  allFeatures,
  overlay,
  onRenameBuilding,
  onDeleteBuilding,
  onAddFloor,
  onRenameFloor,
  onCloneFloor,
  onDeleteFloor,
  onCreateFeature,
  onUpdateFeatureProperty,
  onUpdateFeatureMetadata,
  onDeleteFeature,
  onCloneFeature,
  onOverlayUpload,
  onOverlayOpacityChange,
  onOverlayRecenter,
  onOverlayToggleVisibility,
  onOverlayToggleLock,
  onReplaceFloorFeatures,
}: SelectionSidebarProps) => {
  if (!selection || !building) {
    return (
      <section className="card bg-base-100 shadow">
        <div className="card-body">
          <h2 className="card-title text-lg">Selection</h2>
          <p className="text-sm text-base-content/70">Select a building, floor, or feature.</p>
        </div>
      </section>
    );
  }

  if (selection.kind === "building") {
    return (
      <BuildingEditor
        building={building}
        onRenameBuilding={(name) => onRenameBuilding(building.id, name)}
        onDeleteBuilding={() => onDeleteBuilding(building.id)}
        onAddFloor={() => onAddFloor(building.id)}
      />
    );
  }

  if (selection.kind === "floor" && floor) {
    const floorFeatures = allFeatures.filter((current) => current.properties.floorId === floor.id);
    const validation = validateFloor(floor.id, allFeatures);

    return (
      <FloorEditor
        building={building}
        floor={floor}
        floorFeatures={floorFeatures}
        overlay={overlay}
        validationWarnings={[...validation.errors, ...validation.warnings]}
        onRenameFloor={(name) => onRenameFloor(floor.id, name)}
        onCloneFloor={() => onCloneFloor(floor.id)}
        onDeleteFloor={() => onDeleteFloor(floor.id)}
        onCreateFeature={onCreateFeature}
        onOverlayUpload={onOverlayUpload}
        onOverlayOpacityChange={onOverlayOpacityChange}
        onOverlayRecenter={onOverlayRecenter}
        onOverlayToggleVisibility={onOverlayToggleVisibility}
        onOverlayToggleLock={onOverlayToggleLock}
        onReplaceFloorFeatures={(features) => onReplaceFloorFeatures(floor.id, features)}
      />
    );
  }

  if (selection.kind === "feature" && feature) {
    return (
      <FeatureEditor
        feature={feature}
        onUpdateProperty={(key, value) => onUpdateFeatureProperty(feature.id, key, value)}
        onUpdateMetadata={(metadata) => onUpdateFeatureMetadata(feature.id, metadata)}
        onDelete={() => onDeleteFeature(feature.id)}
        onClone={() => onCloneFeature(feature.id)}
      />
    );
  }

  return (
    <section className="card bg-base-100 shadow">
      <div className="card-body">
        <h2 className="card-title text-lg">Selection</h2>
        <p className="text-sm text-base-content/70">Selected item is unavailable.</p>
      </div>
    </section>
  );
};
