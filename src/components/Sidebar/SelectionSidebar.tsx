import type { Selection } from "../../lib/editor/selection";
import type { SupportedImdfType } from "../../lib/imdf/schema";
import { validateFloor } from "../../lib/imdf/validate";
import type {
  Building,
  FloorFeature,
  FloorOverlay,
  JsonObject,
  JsonValue,
  Level,
  Venue,
} from "../../lib/types";
import { BuildingEditor } from "./BuildingEditor";
import { FeatureEditor } from "./FeatureEditor";
import { FloorEditor } from "./FloorEditor";

type SelectionSidebarProps = {
  selection: Selection | undefined;
  venue: Venue | undefined;
  building: Building | undefined;
  levels: Level[];
  level: Level | undefined;
  feature: FloorFeature | undefined;
  featureLocked: boolean;
  overlayLocked: boolean;
  allFeatures: FloorFeature[];
  overlay: FloorOverlay | undefined;
  onRenameBuilding: (buildingId: string, name: string) => void;
  onUpdateBuildingVenueName: (buildingId: string, name: string) => void;
  onUpdateBuildingVenueCategory: (buildingId: string, category: string) => void;
  onUpdateBuildingAddressField: (buildingId: string, field: string, value: string) => void;
  onExportBuildingArchive: (buildingId: string) => void;
  onImportBuildingArchive: (buildingId: string, file: File) => void;
  archiveWarnings: string[];
  onDeleteBuilding: (buildingId: string) => void;
  onAddLevel: (buildingId: string) => void;
  onRenameLevel: (levelId: string, name: string) => void;
  onCloneLevel: (levelId: string) => void;
  onDeleteLevel: (levelId: string) => void;
  onCreateFeature: (type: SupportedImdfType) => void;
  onUpdateFeatureProperty: (featureId: string, key: string, value: JsonValue | undefined) => void;
  onUpdateFeatureMetadata: (featureId: string, metadata: JsonObject) => void;
  onDeleteFeature: (featureId: string) => void;
  onCloneFeature: (featureId: string) => void;
  onFeatureToggleLock: (featureId: string) => void;
  onOverlayUpload: (file: File) => void;
  onOverlayOpacityChange: (opacity: number) => void;
  onOverlayRecenter: () => void;
  onOverlayToggleVisibility: () => void;
  onOverlayToggleLock: () => void;
};

export const SelectionSidebar = ({
  selection,
  venue,
  building,
  levels,
  level,
  feature,
  featureLocked,
  overlayLocked,
  allFeatures,
  overlay,
  onRenameBuilding,
  onUpdateBuildingVenueName,
  onUpdateBuildingVenueCategory,
  onUpdateBuildingAddressField,
  onExportBuildingArchive,
  onImportBuildingArchive,
  archiveWarnings,
  onDeleteBuilding,
  onAddLevel,
  onRenameLevel,
  onCloneLevel,
  onDeleteLevel,
  onCreateFeature,
  onUpdateFeatureProperty,
  onUpdateFeatureMetadata,
  onDeleteFeature,
  onCloneFeature,
  onFeatureToggleLock,
  onOverlayUpload,
  onOverlayOpacityChange,
  onOverlayRecenter,
  onOverlayToggleVisibility,
  onOverlayToggleLock,
}: SelectionSidebarProps) => {
  if (!selection || !building) {
    return (
      <section className="card bg-base-100 shadow">
        <div className="card-body">
          <h2 className="card-title text-lg">Selection</h2>
          <p className="text-sm text-base-content/70">
            Select a venue, building, level, or feature.
          </p>
        </div>
      </section>
    );
  }

  if (selection.kind === "building") {
    return (
      <BuildingEditor
        building={building}
        venue={venue}
        onRenameBuilding={(name) => onRenameBuilding(building.id, name)}
        onUpdateVenueName={(name) => onUpdateBuildingVenueName(building.id, name)}
        onUpdateVenueCategory={(category) => onUpdateBuildingVenueCategory(building.id, category)}
        onUpdateAddressField={(field, value) =>
          onUpdateBuildingAddressField(building.id, field, value)
        }
        onExportArchive={() => onExportBuildingArchive(building.id)}
        onImportArchive={(file) => onImportBuildingArchive(building.id, file)}
        archiveWarnings={archiveWarnings}
        onDeleteBuilding={() => onDeleteBuilding(building.id)}
        onAddLevel={() => onAddLevel(building.id)}
      />
    );
  }

  if ((selection.kind === "level" || selection.kind === "floor") && level) {
    const levelFeatures = allFeatures.filter((current) => current.properties.floorId === level.id);
    const validation = validateFloor(level.id, allFeatures);

    return (
      <FloorEditor
        level={level}
        levelFeatures={levelFeatures}
        overlay={overlay}
        validationWarnings={[...validation.errors, ...validation.warnings]}
        onRenameLevel={(name) => onRenameLevel(level.id, name)}
        onCloneLevel={() => onCloneLevel(level.id)}
        onDeleteLevel={() => onDeleteLevel(level.id)}
        onCreateFeature={onCreateFeature}
        onOverlayUpload={onOverlayUpload}
        onOverlayOpacityChange={onOverlayOpacityChange}
        onOverlayRecenter={onOverlayRecenter}
        onOverlayToggleVisibility={onOverlayToggleVisibility}
        onOverlayToggleLock={onOverlayToggleLock}
        overlayLocked={overlayLocked}
      />
    );
  }

  if (selection.kind === "feature" && feature) {
    return (
      <FeatureEditor
        feature={feature}
        allFeatures={allFeatures}
        levels={levels}
        onCreateFeature={onCreateFeature}
        onUpdateProperty={(key, value) => onUpdateFeatureProperty(feature.id, key, value)}
        onUpdateMetadata={(metadata) => onUpdateFeatureMetadata(feature.id, metadata)}
        onDelete={() => onDeleteFeature(feature.id)}
        onClone={() => onCloneFeature(feature.id)}
        locked={featureLocked}
        onToggleLock={() => onFeatureToggleLock(feature.id)}
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
