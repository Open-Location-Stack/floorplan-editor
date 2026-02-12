import { useMemo, useState } from "react";
import type { SupportedImdfType } from "../../lib/imdf/schema";
import type { FloorFeature, FloorOverlay, Level } from "../../lib/types";
import { AddFeatureButtonGroups } from "./AddFeatureButtonGroups";

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
  levelShortName: string;
  levelOutdoor: boolean;
  onAddLevelGeometry: () => void;
  onRemoveLevelGeometry: () => void;
  onUpdateLevelOrdinal: (ordinal: number) => void;
  onUpdateLevelShortName: (shortName: string) => void;
  onUpdateLevelOutdoor: (outdoor: boolean) => void;
  onCreateFeature: (type: SupportedImdfType) => void;
  onOverlayUpload: (file: File) => void;
  onOverlayOpacityChange: (opacity: number) => void;
  onOverlayRecenter: () => void;
  onOverlayToggleVisibility: () => void;
  onOverlayToggleLock: () => void;
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
  levelShortName,
  levelOutdoor,
  onAddLevelGeometry,
  onRemoveLevelGeometry,
  onUpdateLevelOrdinal,
  onUpdateLevelShortName,
  onUpdateLevelOutdoor,
  onCreateFeature,
  onOverlayUpload,
  onOverlayOpacityChange,
  onOverlayRecenter,
  onOverlayToggleVisibility,
  onOverlayToggleLock,
}: LevelEditorProps) => {
  const [overlayFile, setOverlayFile] = useState<File | undefined>();
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const feature of levelFeatures) {
      const type =
        typeof feature.properties.imdfType === "string"
          ? feature.properties.imdfType
          : feature.properties.kind;
      if (!type) {
        continue;
      }
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return counts;
  }, [levelFeatures]);

  const pathDiagnostics = useMemo(() => {
    const issues: string[] = [];
    const openings = levelFeatures.filter((feature) => {
      const type =
        typeof feature.properties.imdfType === "string"
          ? feature.properties.imdfType
          : feature.properties.kind;
      return type === "opening";
    });
    for (const opening of openings) {
      if (opening.geometry.type !== "LineString" || opening.geometry.coordinates.length < 2) {
        issues.push(`Path ${opening.id}: invalid line geometry.`);
      }
    }
    return issues;
  }, [levelFeatures]);

  return (
    <section className="card bg-base-100 shadow">
      <div className="card-body gap-3">
        <h2 className="card-title text-lg">Level</h2>
        <label className="form-control gap-1">
          <span className="label-text">Name</span>
          <input
            className="input input-bordered input-sm"
            type="text"
            value={level.name}
            onChange={(event) => onRenameLevel(event.currentTarget.value)}
          />
        </label>

        <div className="rounded-box border border-base-300 p-3">
          <div className="mb-2 text-sm font-semibold">Level metadata</div>
          <div className="grid gap-2">
            <label className="form-control gap-1">
              <span className="label-text">Ordinal (numeric floor level)</span>
              <input
                className="input input-bordered input-sm"
                type="number"
                value={levelOrdinal}
                onChange={(event) => onUpdateLevelOrdinal(Number(event.currentTarget.value) || 0)}
                disabled={!hasLevelGeometry}
                aria-label="Level ordinal"
              />
            </label>
            <label className="form-control gap-1">
              <span className="label-text">Short name</span>
              <input
                className="input input-bordered input-sm"
                type="text"
                value={levelShortName}
                onChange={(event) => onUpdateLevelShortName(event.currentTarget.value)}
                disabled={!hasLevelGeometry}
                aria-label="Level short name"
              />
            </label>
            <label className="label cursor-pointer rounded-box border border-base-300 px-3 py-2">
              <span className="label-text">Outdoor level</span>
              <input
                type="checkbox"
                className="toggle toggle-sm"
                checked={levelOutdoor}
                onChange={(event) => onUpdateLevelOutdoor(event.currentTarget.checked)}
                disabled={!hasLevelGeometry}
                aria-label="Level outdoor"
              />
            </label>
            {!hasLevelGeometry ? (
              <p className="text-xs text-base-content/70">
                Add geometry to enable IMDF level metadata editing.
              </p>
            ) : null}
          </div>
        </div>

        <AddFeatureButtonGroups typeCounts={typeCounts} onCreateFeature={onCreateFeature} />

        <div className="flex gap-2">
          <button
            className="btn btn-sm"
            type="button"
            onClick={onAddLevelGeometry}
            disabled={hasLevelGeometry}
            aria-label="Add level geometry"
          >
            Add geometry
          </button>
          <button
            className="btn btn-sm"
            type="button"
            onClick={onRemoveLevelGeometry}
            disabled={!hasLevelGeometry}
            aria-label="Remove level geometry"
          >
            Remove geometry
          </button>
        </div>

        <div className="flex gap-2">
          <button className="btn btn-sm" type="button" onClick={onCloneLevel}>
            Clone level
          </button>
          <button className="btn btn-sm btn-error" type="button" onClick={onDeleteLevel}>
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
                Upload image
              </button>
              <button
                className="btn btn-sm"
                type="button"
                onClick={onOverlayRecenter}
                disabled={!overlay}
              >
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
                {overlay?.visible === false ? "Show image" : "Hide image"}
              </button>
            </div>
            <label className="label cursor-pointer rounded-box border border-base-300 px-3 py-2">
              <span className="label-text flex items-center gap-2">
                <span aria-hidden="true">{overlayLocked ? "🔒" : "🔓"}</span>
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
      </div>
    </section>
  );
};
