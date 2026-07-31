import { useMemo, useState } from "react";
import type { FloorFeature, FloorOverlay, Level } from "../../lib/types";
import { AppIcon } from "../icons/AppIcon";
import { AddFeatureButtonGroups, type AddFeatureRequest } from "./AddFeatureButtonGroups";

type LevelEditorProps = {
  level: Level;
  levelFeatures: FloorFeature[];
  overlay: FloorOverlay | undefined;
  overlayLocked: boolean;
  validationWarnings: string[];
  onRenameLevel: (name: string) => void;
  onCloneLevel: () => void;
  onDeleteLevel: () => void;
  hasLevelGeometry: boolean;
  levelOrdinal: number;
  levelGeometryLocked: boolean;
  onAddLevelGeometry: () => void;
  onUpdateLevelOrdinal: (ordinal: number) => void;
  onToggleLevelGeometryLock: () => void;
  onCreateFeature: (request: AddFeatureRequest) => void;
  onOverlayUpload: (file: File) => void;
  onOverlayOpacityChange: (opacity: number) => void;
  onOverlayRecenter: () => void;
  onOverlayToggleVisibility: () => void;
  onOverlayToggleLock: () => void;
  rawGeoJsonPreview?: unknown;
};

export const LevelEditor = ({
  level,
  levelFeatures,
  overlay,
  overlayLocked,
  validationWarnings,
  onRenameLevel,
  onCloneLevel,
  onDeleteLevel,
  hasLevelGeometry,
  levelOrdinal,
  levelGeometryLocked,
  onAddLevelGeometry,
  onUpdateLevelOrdinal,
  onToggleLevelGeometryLock,
  onCreateFeature,
  onOverlayUpload,
  onOverlayOpacityChange,
  onOverlayRecenter,
  onOverlayToggleVisibility,
  onOverlayToggleLock,
  rawGeoJsonPreview,
}: LevelEditorProps) => {
  const [overlayFile, setOverlayFile] = useState<File | undefined>();
  const pathDiagnostics = useMemo(() => {
    const issues: string[] = [];
    const navigationEdges = levelFeatures.filter((feature) => {
      const type =
        typeof feature.feature_type === "string" ? feature.feature_type : feature.feature_type;
      return type === "opening" && feature.properties.category === "pedestrian";
    });
    for (const edge of navigationEdges) {
      if (edge.geometry.type !== "LineString" || edge.geometry.coordinates.length < 2) {
        issues.push(`Path ${edge.id}: invalid line geometry.`);
      }
    }
    return issues;
  }, [levelFeatures]);

  return (
    <section className="card bg-base-100 shadow">
      <div className="card-body gap-3">
        <h2 className="card-title text-lg">
          <AppIcon name="level" />
          Level
        </h2>

        <div className="rounded-box border border-base-300 p-3">
          <div className="mb-2 text-sm font-semibold">Properties</div>
          <div className="grid gap-2">
            <label className="fieldset">
              <span className="fieldset-legend">Name</span>
              <input
                className="input input-bordered input-sm"
                type="text"
                value={level.name}
                onChange={(event) => onRenameLevel(event.currentTarget.value)}
                aria-label="Level name"
              />
            </label>
            <label className="fieldset">
              <span className="fieldset-legend">Floor Level</span>
              <input
                className="input input-bordered input-sm"
                type="number"
                value={levelOrdinal}
                onChange={(event) => onUpdateLevelOrdinal(Number(event.currentTarget.value) || 0)}
                disabled={!hasLevelGeometry}
                aria-label="Level ordinal"
              />
            </label>
            {!hasLevelGeometry ? (
              <p className="text-xs text-base-content/70">Add outer walls to set a floor level.</p>
            ) : null}
          </div>
        </div>

        <AddFeatureButtonGroups onCreateFeature={onCreateFeature} />

        <div className="grid gap-2 rounded-box border border-base-300 p-3">
          <button
            className="btn btn-sm"
            type="button"
            onClick={onAddLevelGeometry}
            disabled={levelGeometryLocked}
            aria-label="Add outer wall"
          >
            <AppIcon name="add" />
            Add outer wall
          </button>
          <label className="label cursor-pointer rounded-box border border-base-300 px-3 py-2">
            <span className="label-text flex items-center gap-2">
              <AppIcon name={levelGeometryLocked ? "lock" : "unlock"} />
              Lock Outer Walls
            </span>
            <input
              type="checkbox"
              className="toggle toggle-sm"
              checked={levelGeometryLocked}
              onChange={onToggleLevelGeometryLock}
              disabled={!hasLevelGeometry}
              aria-label="Lock outer walls"
            />
          </label>
        </div>

        <div className="flex gap-2">
          <button className="btn btn-sm" type="button" onClick={onCloneLevel}>
            <AppIcon name="clone" />
            Clone level
          </button>
          <button className="btn btn-sm btn-error" type="button" onClick={onDeleteLevel}>
            <AppIcon name="delete" />
            Delete level
          </button>
        </div>

        {validationWarnings.length > 0 ? (
          <div className="rounded-box border border-warning/30 bg-warning/10 p-3 text-sm">
            <div className="mb-1 font-medium">Validation warnings</div>
            <ul className="list-disc pl-4">
              {validationWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <details className="rounded-box border border-base-300 p-3" open>
          <summary className="cursor-pointer font-medium">Bitmap editor</summary>
          <div className="mt-3 grid gap-3">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="file-input file-input-bordered file-input-sm"
              onChange={(event) => setOverlayFile(event.currentTarget.files?.[0])}
            />
            <div className="flex gap-2">
              <button
                className="btn btn-sm"
                type="button"
                disabled={!overlayFile}
                onClick={() => {
                  if (!overlayFile) {
                    return;
                  }

                  onOverlayUpload(overlayFile);
                  setOverlayFile(undefined);
                }}
              >
                <AppIcon name="upload" />
                Upload image
              </button>
              <button
                className="btn btn-sm"
                type="button"
                onClick={onOverlayRecenter}
                disabled={!overlay}
              >
                <AppIcon name="reset" />
                Reset orientation
              </button>
            </div>

            <label className="label-text" htmlFor="overlay-opacity">
              Opacity: {overlay?.opacity ?? 30}%
            </label>
            <input
              type="range"
              id="overlay-opacity"
              min={0}
              max={100}
              value={overlay?.opacity ?? 30}
              className="range range-sm"
              onChange={(event) => onOverlayOpacityChange(Number(event.currentTarget.value))}
              disabled={!overlay}
            />

            <div className="grid grid-cols-2 gap-2">
              <button
                className="btn btn-xs"
                type="button"
                disabled={!overlay}
                onClick={onOverlayToggleVisibility}
              >
                <AppIcon name={overlay?.visible === false ? "show" : "hide"} />
                {overlay?.visible === false ? "Show image" : "Hide image"}
              </button>
            </div>
            <label className="label cursor-pointer rounded-box border border-base-300 px-3 py-2">
              <span className="label-text flex items-center gap-2">
                <AppIcon name={overlayLocked ? "lock" : "unlock"} />
                Lock bitmap geometry
              </span>
              <input
                type="checkbox"
                className="toggle toggle-sm"
                checked={overlayLocked}
                onChange={onOverlayToggleLock}
                disabled={!overlay}
                aria-label="Lock level bitmap geometry"
              />
            </label>
          </div>
        </details>

        <details className="rounded-box border border-base-300 p-3">
          <summary className="cursor-pointer font-medium">Path diagnostics</summary>
          <div className="mt-3 text-sm">
            {pathDiagnostics.length === 0 ? (
              <div className="text-success">No path issues found on this level.</div>
            ) : (
              <ul className="list-disc pl-4">
                {pathDiagnostics.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        </details>

        <details className="rounded-box border border-base-300 p-3">
          <summary className="cursor-pointer font-medium">Raw exported GeoJSON</summary>
          <pre className="mt-3 max-h-56 overflow-auto rounded-box border border-base-300 bg-base-200 p-2 font-mono text-xs">
            {JSON.stringify(rawGeoJsonPreview ?? {}, null, 2)}
          </pre>
        </details>
      </div>
    </section>
  );
};
