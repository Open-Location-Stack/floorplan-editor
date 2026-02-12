import { useEffect, useMemo, useState } from "react";
import {
  convertArea,
  convertLength,
  featureAreaSquareMeters,
  featureLengthMeters,
} from "../../../lib/geometry/measurements";
import { getCategoryOptions } from "../../../lib/imdf/categories";
import { getFeatureSpec } from "../../../lib/imdf/featureCatalog";
import type { FloorFeature, ImdfFeatureType, JsonObject } from "../../../lib/types";

export type ImdfFeatureEditorProps = {
  feature: FloorFeature;
  type: ImdfFeatureType;
  locked: boolean;
  onUpdateProperty: (key: string, value: string) => void;
  onUpdateMetadata: (metadata: JsonObject) => void;
  onDelete: () => void;
  onClone: () => void;
  onToggleLock: () => void;
};

const resolveStringValue = (feature: FloorFeature, key: string): string => {
  const value = feature.properties[key];
  if (typeof value === "string") {
    return value;
  }
  if (key === "name") {
    const name = feature.properties.name;
    return typeof name === "string" ? name : "";
  }
  return "";
};

export const GenericImdfFeatureEditor = ({
  feature,
  type,
  locked,
  onUpdateProperty,
  onUpdateMetadata,
  onDelete,
  onClone,
  onToggleLock,
}: ImdfFeatureEditorProps) => {
  const [metadataText, setMetadataText] = useState("{}");
  const [metadataError, setMetadataError] = useState<string | undefined>();
  const spec = getFeatureSpec(type);
  const categoryOptions = useMemo(() => getCategoryOptions(type), [type]);

  useEffect(() => {
    const metadata = feature.properties.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      setMetadataText("{}");
      setMetadataError(undefined);
      return;
    }

    setMetadataText(JSON.stringify(metadata, null, 2));
    setMetadataError(undefined);
  }, [feature.properties.metadata]);

  const lengthMeters = useMemo(() => featureLengthMeters(feature), [feature]);
  const areaSquareMeters = useMemo(() => featureAreaSquareMeters(feature), [feature]);

  return (
    <section className="card bg-base-100 shadow">
      <div className="card-body gap-3">
        <h2 className="card-title text-lg">{spec.defaultName}</h2>
        <label className="label cursor-pointer rounded-box border border-base-300 px-3 py-2">
          <span className="label-text flex items-center gap-2">
            <span aria-hidden="true">{locked ? "🔒" : "🔓"}</span>
            Lock geometry
          </span>
          <input
            type="checkbox"
            className="toggle toggle-sm"
            checked={locked}
            onChange={onToggleLock}
            aria-label="Lock feature geometry"
          />
        </label>

        <label className="form-control gap-1">
          <span className="label-text">Feature ID (read only)</span>
          <input
            className="input input-bordered input-sm"
            type="text"
            value={feature.id}
            readOnly
          />
        </label>
        <label className="form-control gap-1">
          <span className="label-text">Feature type (read only)</span>
          <input className="input input-bordered input-sm" type="text" value={type} readOnly />
        </label>

        {spec.fields.map((field) => {
          if (field.key === "category" && categoryOptions.length > 0) {
            const currentValue = resolveStringValue(feature, field.key);
            return (
              <label className="form-control gap-1" key={field.key}>
                <span className="label-text">
                  {field.key}
                  {field.required ? " *" : ""}
                  {field.readOnly ? " (read only)" : ""}
                </span>
                <select
                  className="select select-bordered select-sm"
                  value={currentValue}
                  disabled={Boolean(field.readOnly)}
                  onChange={(event) => onUpdateProperty(field.key, event.currentTarget.value)}
                >
                  <option value="">Select category</option>
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          }

          return (
            <label className="form-control gap-1" key={field.key}>
              <span className="label-text">
                {field.key}
                {field.required ? " *" : ""}
                {field.readOnly ? " (read only)" : ""}
              </span>
              <input
                className="input input-bordered input-sm"
                type="text"
                value={resolveStringValue(feature, field.key)}
                readOnly={Boolean(field.readOnly)}
                onChange={(event) => onUpdateProperty(field.key, event.currentTarget.value)}
              />
            </label>
          );
        })}

        <div className="rounded-box bg-base-200 p-3 text-sm">
          <div className="mb-2 font-medium">Metadata (JSON object)</div>
          <textarea
            className="textarea textarea-bordered h-24 w-full font-mono text-xs"
            value={metadataText}
            onChange={(event) => setMetadataText(event.currentTarget.value)}
          />
          <div className="mt-2 flex gap-2">
            <button
              className="btn btn-xs"
              type="button"
              onClick={() => {
                try {
                  const parsed = JSON.parse(metadataText) as unknown;
                  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                    setMetadataError("Metadata must be a JSON object.");
                    return;
                  }
                  setMetadataError(undefined);
                  onUpdateMetadata(parsed as JsonObject);
                } catch {
                  setMetadataError("Invalid JSON object.");
                }
              }}
            >
              Apply metadata
            </button>
          </div>
          {metadataError ? <div className="mt-2 text-xs text-error">{metadataError}</div> : null}
        </div>

        <div className="rounded-box bg-base-200 p-3 text-sm">
          <div>
            Length: {convertLength(lengthMeters, "m")} m / {convertLength(lengthMeters, "ft")} ft
          </div>
          <div>
            Area: {convertArea(areaSquareMeters, "m2")} m2 / {convertArea(areaSquareMeters, "ft2")}{" "}
            ft2
          </div>
        </div>

        <div className="flex gap-2">
          <button className="btn btn-sm" type="button" onClick={onClone}>
            Clone
          </button>
          <button className="btn btn-sm btn-error" type="button" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </section>
  );
};
