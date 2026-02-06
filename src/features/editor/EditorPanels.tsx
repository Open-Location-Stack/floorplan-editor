import { useMemo, useState } from "react";
import {
  convertArea,
  convertLength,
  featureAreaSquareMeters,
  featureLengthMeters,
} from "../../lib/geometry/measurements";
import { exportGeoJson, parseGeoJsonImport } from "../../lib/importExport/geojson";
import type { FloorFeature, FloorOverlay } from "../../lib/types";

type EditorPanelsProps = {
  features: FloorFeature[];
  selectedFeatureId: string | undefined;
  overlays: FloorOverlay[];
  onSelect: (featureId: string | undefined) => void;
  onAdd: (kind: "point" | "line" | "polygon") => void;
  onDeleteSelected: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onImport: (features: FloorFeature[]) => void;
  onOverlayChange: (overlay: FloorOverlay) => void;
};

const defaultOverlay = (): FloorOverlay => ({
  id: "overlay-default",
  floorId: "floor-1",
  imageName: "",
  imageDataUrl: "",
  opacity: 70,
  corners: {
    topLeft: [0, 0],
    topRight: [0.001, 0],
    bottomRight: [0.001, -0.001],
    bottomLeft: [0, -0.001],
  },
  updatedAt: new Date().toISOString(),
});

export const EditorPanels = ({
  features,
  selectedFeatureId,
  overlays,
  onSelect,
  onAdd,
  onDeleteSelected,
  onUndo,
  onRedo,
  onImport,
  onOverlayChange,
}: EditorPanelsProps) => {
  const selectedFeature = useMemo(
    () => features.find((feature) => feature.id === selectedFeatureId),
    [features, selectedFeatureId],
  );

  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | undefined>();
  const [exportText, setExportText] = useState("");

  const overlay = overlays[0] ?? defaultOverlay();

  const lengthMeters = selectedFeature ? featureLengthMeters(selectedFeature) : 0;
  const areaSquareMeters = selectedFeature ? featureAreaSquareMeters(selectedFeature) : 0;

  return (
    <div className="flex h-full flex-col gap-4">
      <section className="card bg-base-100 shadow">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">Editing</h2>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-sm" type="button" onClick={() => onAdd("point")}>
              Add point
            </button>
            <button className="btn btn-sm" type="button" onClick={() => onAdd("line")}>
              Add line
            </button>
            <button className="btn btn-sm" type="button" onClick={() => onAdd("polygon")}>
              Add polygon
            </button>
            <button className="btn btn-sm btn-error" type="button" onClick={onDeleteSelected}>
              Delete selected
            </button>
            <button className="btn btn-sm" type="button" onClick={onUndo}>
              Undo
            </button>
            <button className="btn btn-sm" type="button" onClick={onRedo}>
              Redo
            </button>
          </div>
          <p className="text-xs text-base-content/70">
            Keyboard: Delete, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y.
          </p>

          <ul className="menu max-h-56 rounded-box bg-base-200 p-2 text-sm">
            {features.map((feature) => (
              <li key={feature.id}>
                <button
                  type="button"
                  className={selectedFeatureId === feature.id ? "active" : ""}
                  onClick={() => onSelect(feature.id)}
                >
                  <span className="font-mono text-xs">{feature.geometry.type}</span>
                  <span>{feature.properties.name ?? feature.id}</span>
                </button>
              </li>
            ))}
            {features.length === 0 ? (
              <li className="px-2 py-1 text-base-content/70">No features yet.</li>
            ) : null}
          </ul>

          <div className="rounded-box bg-base-200 p-3 text-sm">
            <div>
              Length: {convertLength(lengthMeters, "m")} m / {convertLength(lengthMeters, "ft")} ft
            </div>
            <div>
              Area: {convertArea(areaSquareMeters, "m2")} m2 /{" "}
              {convertArea(areaSquareMeters, "ft2")} ft2
            </div>
          </div>
        </div>
      </section>

      <section className="card bg-base-100 shadow">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">Import / Export GeoJSON</h2>
          <textarea
            className="textarea textarea-bordered h-28 w-full font-mono text-xs"
            placeholder="Paste GeoJSON FeatureCollection"
            value={importText}
            onChange={(event) => setImportText(event.currentTarget.value)}
          />
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => {
              const parsed = parseGeoJsonImport(importText);
              if (!parsed.ok) {
                setImportError(parsed.errors.join("\n"));
                return;
              }

              setImportError(undefined);
              onImport(parsed.features);
            }}
          >
            Import
          </button>
          {importError ? (
            <pre className="rounded-box bg-error/15 p-2 text-xs text-error">{importError}</pre>
          ) : null}

          <button
            className="btn btn-sm btn-outline"
            type="button"
            onClick={() => {
              setExportText(exportGeoJson(features));
            }}
          >
            Generate Export
          </button>
          <textarea
            className="textarea textarea-bordered h-28 w-full font-mono text-xs"
            readOnly
            value={exportText}
          />
        </div>
      </section>

      <section className="card bg-base-100 shadow">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">Floor Overlay</h2>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="file-input file-input-bordered file-input-sm"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) {
                return;
              }

              const reader = new FileReader();
              reader.onload = () => {
                onOverlayChange({
                  ...overlay,
                  imageName: file.name,
                  imageDataUrl: typeof reader.result === "string" ? reader.result : "",
                  updatedAt: new Date().toISOString(),
                });
              };
              reader.readAsDataURL(file);
            }}
          />

          <label className="label-text" htmlFor="overlay-opacity">
            Opacity: {overlay.opacity}%
          </label>
          <input
            type="range"
            id="overlay-opacity"
            min={0}
            max={100}
            value={overlay.opacity}
            className="range range-sm"
            onChange={(event) => {
              onOverlayChange({
                ...overlay,
                opacity: Number(event.currentTarget.value),
                updatedAt: new Date().toISOString(),
              });
            }}
          />

          <div className="grid grid-cols-2 gap-2 text-xs">
            {(["topLeft", "topRight", "bottomRight", "bottomLeft"] as const).map((cornerName) => (
              <div key={cornerName} className="rounded-box bg-base-200 p-2">
                <div className="mb-1 font-semibold">{cornerName}</div>
                <input
                  className="input input-xs input-bordered mb-1 w-full"
                  type="number"
                  step="0.000001"
                  value={overlay.corners[cornerName][0]}
                  onChange={(event) => {
                    const lng = Number(event.currentTarget.value);
                    onOverlayChange({
                      ...overlay,
                      corners: {
                        ...overlay.corners,
                        [cornerName]: [lng, overlay.corners[cornerName][1]],
                      },
                      updatedAt: new Date().toISOString(),
                    });
                  }}
                />
                <input
                  className="input input-xs input-bordered w-full"
                  type="number"
                  step="0.000001"
                  value={overlay.corners[cornerName][1]}
                  onChange={(event) => {
                    const lat = Number(event.currentTarget.value);
                    onOverlayChange({
                      ...overlay,
                      corners: {
                        ...overlay.corners,
                        [cornerName]: [overlay.corners[cornerName][0], lat],
                      },
                      updatedAt: new Date().toISOString(),
                    });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
