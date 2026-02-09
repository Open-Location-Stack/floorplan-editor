import { useEffect, useMemo, useState } from "react";
import type { DrawMode } from "../../components/MapCanvas";
import {
  convertArea,
  convertLength,
  featureAreaSquareMeters,
  featureLengthMeters,
} from "../../lib/geometry/measurements";
import { exportGeoJson, parseGeoJsonImport } from "../../lib/importExport/geojson";
import type { Building, Floor, FloorFeature, FloorOverlay, JsonObject } from "../../lib/types";

type EditorPanelsProps = {
  buildings: Building[];
  floors: Floor[];
  selectedBuildingId: string;
  selectedFloorId: string;
  onSelectBuilding: (buildingId: string) => void;
  onAddBuilding: () => void;
  onDeleteBuilding: (buildingId: string) => void;
  onRenameBuilding: (buildingId: string, name: string) => void;
  onSelectFloor: (floorId: string) => void;
  onAddFloor: () => void;
  onDeleteFloor: (floorId: string) => void;
  onRenameFloor: (floorId: string, name: string) => void;
  features: FloorFeature[];
  selectedFeatureId: string | undefined;
  drawMode: DrawMode;
  draftVertexCount: number;
  selectedVertexIndex: number | undefined;
  onSelectFeature: (featureId: string | undefined) => void;
  onStartDraw: (mode: "point" | "line" | "polygon") => void;
  onCompleteDraw: () => void;
  onCancelDraw: () => void;
  onRemoveLastVertex: () => void;
  onDeleteSelectedFeature: () => void;
  onUpdateSelectedFeatureProperty: (key: string, value: string) => void;
  onSelectVertexIndex: (index: number | undefined) => void;
  onDeleteSelectedVertex: () => void;
  onUpdateSelectedFeatureMetadata: (metadata: JsonObject) => void;
  onUndo: () => void;
  onRedo: () => void;
  onImport: (features: FloorFeature[]) => void;
  overlay: FloorOverlay | undefined;
  onOverlayUpload: (file: File) => void;
  onOverlayOpacityChange: (opacity: number) => void;
  onOverlayRecenter: () => void;
  onOverlayNudge: (dx: number, dy: number) => void;
  onOverlayScale: (factor: number) => void;
  onOverlayRotate: (degrees: number) => void;
  onOverlayToggleLock: () => void;
};

const vertexCountForFeature = (feature: FloorFeature | undefined): number => {
  if (!feature) {
    return 0;
  }

  if (feature.geometry.type === "LineString") {
    return feature.geometry.coordinates.length;
  }

  if (feature.geometry.type === "Polygon") {
    const ring = feature.geometry.coordinates[0] ?? [];
    return Math.max(0, ring.length - 1);
  }

  if (feature.geometry.type === "Point") {
    return 1;
  }

  return 0;
};

const IMDF_TYPE_OPTIONS = [
  "venue",
  "building",
  "level",
  "unit",
  "opening",
  "amenity",
  "anchor",
  "occupant",
  "address",
  "detail",
  "fixture",
  "kiosk",
  "section",
  "relationship",
  "pathway",
] as const;

export const EditorPanels = ({
  buildings,
  floors,
  selectedBuildingId,
  selectedFloorId,
  onSelectBuilding,
  onAddBuilding,
  onDeleteBuilding,
  onRenameBuilding,
  onSelectFloor,
  onAddFloor,
  onDeleteFloor,
  onRenameFloor,
  features,
  selectedFeatureId,
  drawMode,
  draftVertexCount,
  selectedVertexIndex,
  onSelectFeature,
  onStartDraw,
  onCompleteDraw,
  onCancelDraw,
  onRemoveLastVertex,
  onDeleteSelectedFeature,
  onUpdateSelectedFeatureProperty,
  onSelectVertexIndex,
  onDeleteSelectedVertex,
  onUpdateSelectedFeatureMetadata,
  onUndo,
  onRedo,
  onImport,
  overlay,
  onOverlayUpload,
  onOverlayOpacityChange,
  onOverlayRecenter,
  onOverlayNudge,
  onOverlayScale,
  onOverlayRotate,
  onOverlayToggleLock,
}: EditorPanelsProps) => {
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | undefined>();
  const [exportText, setExportText] = useState("");
  const [overlayFile, setOverlayFile] = useState<File | undefined>();
  const [metadataText, setMetadataText] = useState("{}");
  const [metadataError, setMetadataError] = useState<string | undefined>();

  const selectedBuilding = useMemo(
    () => buildings.find((building) => building.id === selectedBuildingId),
    [buildings, selectedBuildingId],
  );
  const selectedFloor = useMemo(
    () => floors.find((floor) => floor.id === selectedFloorId),
    [floors, selectedFloorId],
  );
  const selectedFeature = useMemo(
    () => features.find((feature) => feature.id === selectedFeatureId),
    [features, selectedFeatureId],
  );

  useEffect(() => {
    const metadata = selectedFeature?.properties.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      setMetadataText("{}");
      setMetadataError(undefined);
      return;
    }

    setMetadataText(JSON.stringify(metadata, null, 2));
    setMetadataError(undefined);
  }, [selectedFeature?.properties.metadata]);

  const lengthMeters = selectedFeature ? featureLengthMeters(selectedFeature) : 0;
  const areaSquareMeters = selectedFeature ? featureAreaSquareMeters(selectedFeature) : 0;
  const vertexCount = vertexCountForFeature(selectedFeature);

  return (
    <div className="flex h-full flex-col gap-4">
      <section className="card bg-base-100 shadow">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">Buildings & Floors</h2>

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <select
                className="select select-bordered select-sm w-full"
                value={selectedBuildingId}
                onChange={(event) => onSelectBuilding(event.currentTarget.value)}
              >
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
              </select>
              <button className="btn btn-sm" type="button" onClick={onAddBuilding}>
                Add
              </button>
              <button
                className="btn btn-sm btn-error"
                type="button"
                disabled={buildings.length <= 1}
                onClick={() => onDeleteBuilding(selectedBuildingId)}
              >
                Delete
              </button>
            </div>
            <input
              className="input input-bordered input-sm"
              type="text"
              value={selectedBuilding?.name ?? ""}
              placeholder="Building name"
              onChange={(event) => onRenameBuilding(selectedBuildingId, event.currentTarget.value)}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <select
                className="select select-bordered select-sm w-full"
                value={selectedFloorId}
                onChange={(event) => onSelectFloor(event.currentTarget.value)}
              >
                {floors
                  .filter((floor) => floor.buildingId === selectedBuildingId)
                  .map((floor) => (
                    <option key={floor.id} value={floor.id}>
                      {floor.name}
                    </option>
                  ))}
              </select>
              <button className="btn btn-sm" type="button" onClick={onAddFloor}>
                Add
              </button>
              <button
                className="btn btn-sm btn-error"
                type="button"
                disabled={
                  floors.filter((floor) => floor.buildingId === selectedBuildingId).length <= 1
                }
                onClick={() => onDeleteFloor(selectedFloorId)}
              >
                Delete
              </button>
            </div>
            <input
              className="input input-bordered input-sm"
              type="text"
              value={selectedFloor?.name ?? ""}
              placeholder="Floor name"
              onChange={(event) => onRenameFloor(selectedFloorId, event.currentTarget.value)}
            />
          </div>
        </div>
      </section>

      <section className="card bg-base-100 shadow">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">WYSIWYG Geometry Editor</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`btn btn-sm ${drawMode === "point" ? "btn-primary" : ""}`}
              type="button"
              onClick={() => onStartDraw("point")}
            >
              Draw point
            </button>
            <button
              className={`btn btn-sm ${drawMode === "line" ? "btn-primary" : ""}`}
              type="button"
              onClick={() => onStartDraw("line")}
            >
              Draw line
            </button>
            <button
              className={`btn btn-sm ${drawMode === "polygon" ? "btn-primary" : ""}`}
              type="button"
              onClick={() => onStartDraw("polygon")}
            >
              Draw polygon
            </button>
            <button className="btn btn-sm" type="button" onClick={onCancelDraw}>
              Select mode
            </button>
            <button className="btn btn-sm" type="button" onClick={onUndo}>
              Undo
            </button>
            <button className="btn btn-sm" type="button" onClick={onRedo}>
              Redo
            </button>
          </div>

          {drawMode === "line" || drawMode === "polygon" ? (
            <div className="rounded-box bg-base-200 p-3 text-sm">
              <div>Draft vertices: {draftVertexCount}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="btn btn-xs" type="button" onClick={onRemoveLastVertex}>
                  Remove last
                </button>
                <button className="btn btn-xs btn-primary" type="button" onClick={onCompleteDraw}>
                  Finish
                </button>
                <button className="btn btn-xs" type="button" onClick={onCancelDraw}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-base-content/70">
              Select mode: click to select, drag a vertex to reshape, drag the selected feature to
              move it, and click a blue midpoint to insert a vertex.
            </p>
          )}
        </div>
      </section>

      <section className="card bg-base-100 shadow">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">Feature Properties</h2>

          <ul className="menu max-h-44 rounded-box bg-base-200 p-2 text-sm">
            {features.map((feature) => (
              <li key={feature.id}>
                <button
                  type="button"
                  className={selectedFeatureId === feature.id ? "active" : ""}
                  onClick={() => onSelectFeature(feature.id)}
                >
                  <span className="font-mono text-xs">{feature.geometry.type}</span>
                  <span>{feature.properties.name ?? feature.id}</span>
                </button>
              </li>
            ))}
            {features.length === 0 ? (
              <li className="px-2 py-1 text-base-content/70">No floor features yet.</li>
            ) : null}
          </ul>

          <input
            className="input input-bordered input-sm"
            type="text"
            placeholder="Name"
            value={selectedFeature?.properties.name ?? ""}
            onChange={(event) => onUpdateSelectedFeatureProperty("name", event.currentTarget.value)}
            disabled={!selectedFeature}
          />

          <select
            className="select select-bordered select-sm"
            value={
              selectedFeature?.properties.imdfType ?? selectedFeature?.properties.kind ?? "unit"
            }
            disabled={!selectedFeature}
            onChange={(event) => {
              onUpdateSelectedFeatureProperty("imdfType", event.currentTarget.value);
              onUpdateSelectedFeatureProperty("kind", event.currentTarget.value);
            }}
          >
            {IMDF_TYPE_OPTIONS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <input
              className="input input-bordered input-sm"
              type="text"
              placeholder="Category"
              value={
                typeof selectedFeature?.properties.category === "string"
                  ? selectedFeature.properties.category
                  : ""
              }
              onChange={(event) =>
                onUpdateSelectedFeatureProperty("category", event.currentTarget.value)
              }
              disabled={!selectedFeature}
            />
            <input
              className="input input-bordered input-sm"
              type="text"
              placeholder="External ID"
              value={
                typeof selectedFeature?.properties.externalId === "string"
                  ? selectedFeature.properties.externalId
                  : ""
              }
              onChange={(event) =>
                onUpdateSelectedFeatureProperty("externalId", event.currentTarget.value)
              }
              disabled={!selectedFeature}
            />
            <input
              className="input input-bordered input-sm"
              type="text"
              placeholder="IMDF Class"
              value={
                typeof selectedFeature?.properties.imdfClass === "string"
                  ? selectedFeature.properties.imdfClass
                  : ""
              }
              onChange={(event) =>
                onUpdateSelectedFeatureProperty("imdfClass", event.currentTarget.value)
              }
              disabled={!selectedFeature}
            />
            <input
              className="input input-bordered input-sm"
              type="text"
              placeholder="Feature Type"
              value={
                typeof selectedFeature?.properties.featureType === "string"
                  ? selectedFeature.properties.featureType
                  : ""
              }
              onChange={(event) =>
                onUpdateSelectedFeatureProperty("featureType", event.currentTarget.value)
              }
              disabled={!selectedFeature}
            />
          </div>

          <div className="rounded-box bg-base-200 p-3 text-sm">
            <div className="mb-2 font-medium">Feature metadata (JSON object)</div>
            <textarea
              className="textarea textarea-bordered h-24 w-full font-mono text-xs"
              value={metadataText}
              disabled={!selectedFeature}
              onChange={(event) => setMetadataText(event.currentTarget.value)}
            />
            <div className="mt-2 flex gap-2">
              <button
                className="btn btn-xs"
                type="button"
                disabled={!selectedFeature}
                onClick={() => {
                  try {
                    const parsed = JSON.parse(metadataText) as unknown;
                    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                      setMetadataError("Metadata must be a JSON object.");
                      return;
                    }

                    setMetadataError(undefined);
                    onUpdateSelectedFeatureMetadata(parsed as JsonObject);
                  } catch {
                    setMetadataError("Invalid JSON object.");
                  }
                }}
              >
                Apply metadata
              </button>
              <button
                className="btn btn-xs btn-ghost"
                type="button"
                disabled={!selectedFeature}
                onClick={() => {
                  setMetadataText("{}");
                  setMetadataError(undefined);
                  onUpdateSelectedFeatureMetadata({});
                }}
              >
                Clear metadata
              </button>
            </div>
            {metadataError ? <div className="mt-2 text-xs text-error">{metadataError}</div> : null}
          </div>

          <div className="rounded-box bg-base-200 p-3 text-sm">
            <div className="mb-2 font-medium">Vertices</div>
            <div className="flex gap-2">
              <select
                className="select select-bordered select-xs w-full"
                value={selectedVertexIndex ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  onSelectVertexIndex(value === "" ? undefined : Number(value));
                }}
                disabled={!selectedFeature || selectedFeature.geometry.type === "Point"}
              >
                <option value="">No vertex selected</option>
                {Array.from({ length: vertexCount }, (_, index) => index + 1).map(
                  (vertexNumber) => (
                    <option key={`vertex-${vertexNumber}`} value={vertexNumber - 1}>
                      Vertex {vertexNumber}
                    </option>
                  ),
                )}
              </select>
              <button
                className="btn btn-xs btn-error"
                type="button"
                disabled={selectedVertexIndex === undefined}
                onClick={onDeleteSelectedVertex}
              >
                Delete vertex
              </button>
            </div>
          </div>

          <button
            className="btn btn-sm btn-error"
            type="button"
            onClick={onDeleteSelectedFeature}
            disabled={!selectedFeature}
          >
            Delete selected feature
          </button>

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
          <h2 className="card-title text-lg">Floor Overlay Image</h2>

          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="file-input file-input-bordered file-input-sm"
            onChange={(event) => {
              setOverlayFile(event.currentTarget.files?.[0]);
            }}
          />
          <div className="flex gap-2">
            <button
              className="btn btn-sm btn-primary"
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
              Recenter at map view
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
            onChange={(event) => {
              onOverlayOpacityChange(Number(event.currentTarget.value));
            }}
            disabled={!overlay}
          />

          <div className="grid grid-cols-3 gap-2">
            <button
              className="btn btn-xs"
              type="button"
              disabled={!overlay}
              onClick={() => onOverlayNudge(-0.00002, 0)}
            >
              Left
            </button>
            <button
              className="btn btn-xs"
              type="button"
              disabled={!overlay}
              onClick={() => onOverlayNudge(0, 0.00002)}
            >
              Up
            </button>
            <button
              className="btn btn-xs"
              type="button"
              disabled={!overlay}
              onClick={() => onOverlayNudge(0.00002, 0)}
            >
              Right
            </button>
            <button
              className="btn btn-xs"
              type="button"
              disabled={!overlay}
              onClick={() => onOverlayScale(1.05)}
            >
              Scale +
            </button>
            <button
              className="btn btn-xs"
              type="button"
              disabled={!overlay}
              onClick={() => onOverlayNudge(0, -0.00002)}
            >
              Down
            </button>
            <button
              className="btn btn-xs"
              type="button"
              disabled={!overlay}
              onClick={() => onOverlayScale(0.95)}
            >
              Scale -
            </button>
            <button
              className="btn btn-xs"
              type="button"
              disabled={!overlay}
              onClick={() => onOverlayRotate(-2)}
            >
              Rotate -2°
            </button>
            <button
              className="btn btn-xs"
              type="button"
              disabled={!overlay}
              onClick={onOverlayToggleLock}
            >
              {overlay?.locked ? "Unlock" : "Lock"}
            </button>
            <button
              className="btn btn-xs"
              type="button"
              disabled={!overlay}
              onClick={() => onOverlayRotate(2)}
            >
              Rotate +2°
            </button>
          </div>
          <p className="text-xs text-base-content/70">
            Upload places image near current center; use nudge/scale/rotate to align.
          </p>
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
            Generate Export (Current Floor)
          </button>
          <textarea
            className="textarea textarea-bordered h-28 w-full font-mono text-xs"
            readOnly
            value={exportText}
          />
        </div>
      </section>
    </div>
  );
};
