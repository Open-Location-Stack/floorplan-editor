import { useState } from "react";
import { exportImdfDatasetText } from "../../lib/imdf/export";
import { importFloorGeoJson } from "../../lib/imdf/import";
import type { SupportedImdfType } from "../../lib/imdf/schema";
import type { Building, Floor, FloorFeature, FloorOverlay } from "../../lib/types";

type FloorEditorProps = {
  building: Building;
  floor: Floor;
  floorFeatures: FloorFeature[];
  overlay: FloorOverlay | undefined;
  validationWarnings: string[];
  onRenameFloor: (name: string) => void;
  onCloneFloor: () => void;
  onDeleteFloor: () => void;
  onCreateFeature: (type: SupportedImdfType) => void;
  onOverlayUpload: (file: File) => void;
  onOverlayOpacityChange: (opacity: number) => void;
  onOverlayRecenter: () => void;
  onOverlayToggleVisibility: () => void;
  onOverlayToggleLock: () => void;
  onReplaceFloorFeatures: (features: FloorFeature[]) => void;
};

const featureButtons: Array<{ type: SupportedImdfType; label: string; icon: string }> = [
  { type: "level", label: "Draw level", icon: "L" },
  { type: "unit", label: "Draw unit/room", icon: "U" },
  { type: "zone", label: "Draw zone", icon: "Z" },
  { type: "path", label: "Draw path", icon: "P" },
];

export const FloorEditor = ({
  building,
  floor,
  floorFeatures,
  overlay,
  validationWarnings,
  onRenameFloor,
  onCloneFloor,
  onDeleteFloor,
  onCreateFeature,
  onOverlayUpload,
  onOverlayOpacityChange,
  onOverlayRecenter,
  onOverlayToggleVisibility,
  onOverlayToggleLock,
  onReplaceFloorFeatures,
}: FloorEditorProps) => {
  const [overlayFile, setOverlayFile] = useState<File | undefined>();
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | undefined>();
  const [exportText, setExportText] = useState("");

  return (
    <section className="card bg-base-100 shadow">
      <div className="card-body gap-3">
        <h2 className="card-title text-lg">Floor</h2>
        <label className="form-control gap-1">
          <span className="label-text">Name</span>
          <input
            className="input input-bordered input-sm"
            type="text"
            value={floor.name}
            onChange={(event) => onRenameFloor(event.currentTarget.value)}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          {featureButtons.map((button) => (
            <button
              key={button.type}
              className="btn btn-sm justify-start"
              type="button"
              onClick={() => onCreateFeature(button.type)}
            >
              <span className="badge badge-outline">{button.icon}</span>
              {button.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-base-content/70">
          Sketch by clicking vertices on the map and double-clicking to finish.
        </p>

        <div className="flex gap-2">
          <button className="btn btn-sm" type="button" onClick={onCloneFloor}>
            Clone floor
          </button>
          <button className="btn btn-sm btn-error" type="button" onClick={onDeleteFloor}>
            Delete floor
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
                Recenter
              </button>
            </div>

            <label className="label-text" htmlFor="overlay-opacity">
              Opacity: {overlay?.opacity ?? 70}%
            </label>
            <input
              type="range"
              id="overlay-opacity"
              min={0}
              max={100}
              value={overlay?.opacity ?? 70}
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
              <button
                className="btn btn-xs"
                type="button"
                disabled={!overlay}
                onClick={onOverlayToggleLock}
              >
                {overlay?.locked ? "Edit" : "Stop editing"}
              </button>
            </div>
          </div>
        </details>

        <div className="rounded-box border border-base-300 p-3">
          <div className="mb-2 text-sm font-medium">Floor import + IMDF package export</div>
          <textarea
            className="textarea textarea-bordered h-24 w-full font-mono text-xs"
            value={importText}
            placeholder="Paste floor FeatureCollection"
            onChange={(event) => setImportText(event.currentTarget.value)}
          />
          <div className="mt-2 flex gap-2">
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => {
                const imported = importFloorGeoJson({
                  buildingId: building.id,
                  floorId: floor.id,
                  raw: importText,
                });

                if (!imported.ok) {
                  setImportError(imported.errors.join("\n"));
                  return;
                }

                setImportError(undefined);
                onReplaceFloorFeatures(imported.features);
              }}
            >
              Import floor
            </button>
            <button
              className="btn btn-sm btn-outline"
              type="button"
              onClick={() => {
                setExportText(
                  exportImdfDatasetText({
                    building,
                    floor,
                    features: floorFeatures,
                  }),
                );
              }}
            >
              Export IMDF
            </button>
          </div>
          {importError ? <pre className="mt-2 text-xs text-error">{importError}</pre> : null}
          <textarea
            className="textarea textarea-bordered mt-2 h-24 w-full font-mono text-xs"
            readOnly
            value={exportText}
          />
        </div>
      </div>
    </section>
  );
};
