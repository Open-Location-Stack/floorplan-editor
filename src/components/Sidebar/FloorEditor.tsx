import { useMemo, useState } from "react";
import { getImdfSchemaRule, type SupportedImdfType } from "../../lib/imdf/schema";
import type { Floor, FloorFeature, FloorOverlay } from "../../lib/types";

type FloorEditorProps = {
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
};

const DRAWABLE_GROUPS: Array<{ title: string; types: SupportedImdfType[] }> = [
  {
    title: "Areas",
    types: ["level", "unit", "section", "geofence"],
  },
  {
    title: "Paths",
    types: ["opening", "relationship"],
  },
  {
    title: "Points",
    types: ["amenity", "anchor", "detail", "fixture", "kiosk", "occupant"],
  },
];

export const FloorEditor = ({
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
}: FloorEditorProps) => {
  const [overlayFile, setOverlayFile] = useState<File | undefined>();
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const feature of floorFeatures) {
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
  }, [floorFeatures]);

  const pathDiagnostics = useMemo(() => {
    const issues: string[] = [];
    const openings = floorFeatures.filter((feature) => {
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
  }, [floorFeatures]);

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

        <div className="rounded-box border border-base-300 p-3">
          <div className="mb-2 text-sm font-semibold">Add IMDF feature</div>
          <div className="grid gap-2">
            {DRAWABLE_GROUPS.map((group) => (
              <label className="form-control" key={group.title}>
                <span className="label-text text-xs text-base-content/60">{group.title}</span>
                <select
                  className="select select-bordered select-sm"
                  defaultValue=""
                  onChange={(event) => {
                    const value = event.currentTarget.value as SupportedImdfType;
                    if (value) {
                      onCreateFeature(value);
                      event.currentTarget.value = "";
                    }
                  }}
                >
                  <option value="" disabled>
                    Select feature type
                  </option>
                  {group.types.map((type) => {
                    const rule = getImdfSchemaRule(type);
                    return (
                      <option key={type} value={type}>
                        {rule.defaultName} ({typeCounts.get(type) ?? 0})
                      </option>
                    );
                  })}
                </select>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-base-content/70">
            Map toolbar draw buttons are disabled; use these controls to start geometry creation.
          </p>
        </div>

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

        <details className="rounded-box border border-base-300 p-3">
          <summary className="cursor-pointer font-medium">Path diagnostics</summary>
          <div className="mt-3 text-sm">
            {pathDiagnostics.length === 0 ? (
              <div className="text-success">No path issues found on this floor.</div>
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
