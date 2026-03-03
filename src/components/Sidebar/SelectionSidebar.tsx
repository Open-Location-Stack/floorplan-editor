import type { Selection } from "../../lib/editor/selection";
import { readFeatureType } from "../../lib/imdf/featureDisplay";
import { getLevelGeometryFeatures, hasLevelGeometry } from "../../lib/imdf/levelGeometry";
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
import type { AddFeatureRequest } from "./AddFeatureButtonGroups";
import { BuildingEditor } from "./BuildingEditor";
import { FeatureEditor } from "./FeatureEditor";
import { LevelEditor } from "./LevelEditor";
import { VenueEditor } from "./VenueEditor";

const SelectionMessageCard = ({ message }: { message: string }) => (
  <section className="card bg-base-100 shadow">
    <div className="card-body">
      <h2 className="card-title text-lg">Selection</h2>
      <p className="text-sm text-base-content/70">{message}</p>
    </div>
  </section>
);

const readLevelShortName = (
  level: Level,
  levelGeometryFeature: FloorFeature | undefined,
): string => {
  const shortName = levelGeometryFeature?.properties.short_name;
  if (!shortName || typeof shortName !== "object" || Array.isArray(shortName)) {
    return level.name;
  }

  const english = (shortName as { en?: unknown }).en;
  return typeof english === "string" ? english : level.name;
};

const deriveBuildingFeatureCandidates = (
  building: Building,
  levels: Level[],
  allFeatures: FloorFeature[],
) => {
  const buildingLevelIds = new Set(
    levels
      .filter((candidate) => candidate.buildingId === building.id)
      .map((candidate) => candidate.id),
  );
  const buildingFeatures = allFeatures.filter(
    (current) =>
      typeof current.properties.level_id === "string" &&
      buildingLevelIds.has(current.properties.level_id),
  );

  return {
    anchorCandidates: buildingFeatures.filter((current) => readFeatureType(current) === "anchor"),
    unitCandidates: buildingFeatures.filter((current) => readFeatureType(current) === "unit"),
  };
};

const deriveLevelEditorState = (
  level: Level,
  allFeatures: FloorFeature[],
  lockedFeatureIds: string[],
) => {
  const levelFeatures = allFeatures.filter((current) => current.properties.level_id === level.id);
  const levelGeometryFeature = getLevelGeometryFeatures(levelFeatures, level.id)[0];
  const levelGeometryLocked = Boolean(
    levelGeometryFeature && lockedFeatureIds.includes(levelGeometryFeature.id),
  );
  const levelOrdinal =
    typeof levelGeometryFeature?.properties.ordinal === "number"
      ? levelGeometryFeature.properties.ordinal
      : 0;

  return {
    levelFeatures,
    levelGeometryFeature,
    levelGeometryLocked,
    levelShortName: readLevelShortName(level, levelGeometryFeature),
    levelOrdinal,
    levelOutdoor: Boolean(levelGeometryFeature?.properties.outdoor),
  };
};

type SelectionSidebarProps = {
  selection: Selection | undefined;
  venue: Venue | undefined;
  building: Building | undefined;
  buildings: Building[];
  levels: Level[];
  level: Level | undefined;
  feature: FloorFeature | undefined;
  featureLocked: boolean;
  lockedFeatureIds: string[];
  overlayLocked: boolean;
  allFeatures: FloorFeature[];
  allOverlays: FloorOverlay[];
  overlay: FloorOverlay | undefined;
  onRenameBuilding: (buildingId: string, name: string) => void;
  onRenameVenue: (venueId: string, name: string) => void;
  onDeleteVenue: (venueId: string) => void;
  onAddBuilding: (venueId: string) => void;
  onUpdateBuildingVenueCategory: (buildingId: string, category: string) => void;
  onUpdateBuildingAddressField: (buildingId: string, field: string, value: string) => void;
  onAddBuildingDirectoryEntry: (buildingId: string) => void;
  onUpdateBuildingDirectoryEntry: (
    buildingId: string,
    entryId: string,
    field: "name" | "category" | "phone" | "website" | "hours" | "anchor_id" | "unit_ids",
    value: string | string[] | undefined,
  ) => void;
  onDeleteBuildingDirectoryEntry: (buildingId: string, entryId: string) => void;
  onReverseGeocodeBuildingAddress: (buildingId: string) => void;
  onDeleteBuilding: (buildingId: string) => void;
  onAddLevel: (buildingId: string) => void;
  onRenameLevel: (levelId: string, name: string) => void;
  onCloneLevel: (levelId: string) => void;
  onDeleteLevel: (levelId: string) => void;
  onAddLevelGeometry: (levelId: string) => void;
  onRemoveLevelGeometry: (levelId: string) => void;
  onUpdateLevelOrdinal: (levelId: string, ordinal: number) => void;
  onUpdateLevelShortName: (levelId: string, shortName: string) => void;
  onUpdateLevelOutdoor: (levelId: string, outdoor: boolean) => void;
  onCreateFeature: (request: AddFeatureRequest) => void;
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
  buildings,
  levels,
  level,
  feature,
  featureLocked,
  lockedFeatureIds,
  overlayLocked,
  allFeatures,
  overlay,
  onRenameBuilding,
  onRenameVenue,
  onDeleteVenue,
  onAddBuilding,
  onUpdateBuildingVenueCategory,
  onUpdateBuildingAddressField,
  onAddBuildingDirectoryEntry,
  onUpdateBuildingDirectoryEntry,
  onDeleteBuildingDirectoryEntry,
  onReverseGeocodeBuildingAddress,
  onDeleteBuilding,
  onAddLevel,
  onRenameLevel,
  onCloneLevel,
  onDeleteLevel,
  onAddLevelGeometry,
  onRemoveLevelGeometry,
  onUpdateLevelOrdinal,
  onUpdateLevelShortName,
  onUpdateLevelOutdoor,
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
  if (!selection) {
    return <SelectionMessageCard message="Select a venue, building, level, or feature." />;
  }

  if (selection.kind === "venue" && venue) {
    const venueBuildings = buildings.filter((candidate) => candidate.venueId === venue.id);
    return (
      <VenueEditor
        venue={venue}
        onRenameVenue={(name) => onRenameVenue(venue.id, name)}
        onAddBuilding={() => onAddBuilding(venue.id)}
        onDeleteVenue={() => onDeleteVenue(venue.id)}
        rawGeoJsonPreview={{
          type: "Feature",
          feature_type: "venue",
          properties: {
            id: venue.id,
            name: venue.name,
            buildingCount: venueBuildings.length,
          },
        }}
      />
    );
  }

  if (!building) {
    return <SelectionMessageCard message="Selected item is unavailable." />;
  }

  if (selection.kind === "building") {
    const { anchorCandidates, unitCandidates } = deriveBuildingFeatureCandidates(
      building,
      levels,
      allFeatures,
    );

    return (
      <BuildingEditor
        building={building}
        venue={venue}
        onRenameBuilding={(name) => onRenameBuilding(building.id, name)}
        onUpdateVenueCategory={(category) => onUpdateBuildingVenueCategory(building.id, category)}
        onUpdateAddressField={(field, value) =>
          onUpdateBuildingAddressField(building.id, field, value)
        }
        onAddDirectoryEntry={() => onAddBuildingDirectoryEntry(building.id)}
        onUpdateDirectoryEntry={(entryId, field, value) =>
          onUpdateBuildingDirectoryEntry(building.id, entryId, field, value)
        }
        onDeleteDirectoryEntry={(entryId) => onDeleteBuildingDirectoryEntry(building.id, entryId)}
        anchorCandidates={anchorCandidates}
        unitCandidates={unitCandidates}
        onReverseGeocodeAddress={() => onReverseGeocodeBuildingAddress(building.id)}
        onDeleteBuilding={() => onDeleteBuilding(building.id)}
        onAddLevel={() => onAddLevel(building.id)}
        rawGeoJsonPreview={{
          type: "Feature",
          feature_type: "building",
          properties: {
            id: building.id,
            venue_id: building.venueId,
            name: building.name,
            address: building.imdf?.address,
            directory: building.imdf?.directory ?? [],
          },
        }}
      />
    );
  }

  if ((selection.kind === "level" || selection.kind === "floor") && level) {
    const {
      levelFeatures,
      levelGeometryFeature,
      levelGeometryLocked,
      levelShortName,
      levelOrdinal,
      levelOutdoor,
    } = deriveLevelEditorState(level, allFeatures, lockedFeatureIds);
    const validation = validateFloor(level.id, allFeatures);

    return (
      <LevelEditor
        level={level}
        levelFeatures={levelFeatures}
        hasLevelGeometry={hasLevelGeometry(levelFeatures, level.id)}
        levelOrdinal={levelOrdinal}
        levelShortName={levelShortName}
        levelOutdoor={levelOutdoor}
        levelGeometryLocked={levelGeometryLocked}
        overlay={overlay}
        validationWarnings={[...validation.errors, ...validation.warnings]}
        onRenameLevel={(name) => onRenameLevel(level.id, name)}
        onCloneLevel={() => onCloneLevel(level.id)}
        onDeleteLevel={() => onDeleteLevel(level.id)}
        onAddLevelGeometry={() => onAddLevelGeometry(level.id)}
        onRemoveLevelGeometry={() => onRemoveLevelGeometry(level.id)}
        onUpdateLevelOrdinal={(ordinal) => onUpdateLevelOrdinal(level.id, ordinal)}
        onUpdateLevelShortName={(shortName) => onUpdateLevelShortName(level.id, shortName)}
        onUpdateLevelOutdoor={(outdoor) => onUpdateLevelOutdoor(level.id, outdoor)}
        onToggleLevelGeometryLock={() => {
          if (!levelGeometryFeature) {
            return;
          }
          onFeatureToggleLock(levelGeometryFeature.id);
        }}
        onCreateFeature={onCreateFeature}
        onOverlayUpload={onOverlayUpload}
        onOverlayOpacityChange={onOverlayOpacityChange}
        onOverlayRecenter={onOverlayRecenter}
        onOverlayToggleVisibility={onOverlayToggleVisibility}
        onOverlayToggleLock={onOverlayToggleLock}
        overlayLocked={overlayLocked}
        rawGeoJsonPreview={
          levelGeometryFeature ?? { type: "Feature", properties: { id: level.id } }
        }
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
        rawGeoJsonFeature={feature}
      />
    );
  }

  return <SelectionMessageCard message="Selected item is unavailable." />;
};
