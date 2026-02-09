import { useEffect, useMemo, useState } from "react";
import {
  convertArea,
  convertLength,
  featureAreaSquareMeters,
  featureLengthMeters,
} from "../../lib/geometry/measurements";
import { IMDF_SUPPORTED_TYPES } from "../../lib/imdf/schema";
import type { FloorFeature, JsonObject } from "../../lib/types";

type FeatureEditorProps = {
  feature: FloorFeature;
  onUpdateProperty: (key: string, value: string) => void;
  onUpdateMetadata: (metadata: JsonObject) => void;
  onDelete: () => void;
  onClone: () => void;
};

export const FeatureEditor = ({
  feature,
  onUpdateProperty,
  onUpdateMetadata,
  onDelete,
  onClone,
}: FeatureEditorProps) => {
  const [metadataText, setMetadataText] = useState("{}");
  const [metadataError, setMetadataError] = useState<string | undefined>();

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
        <h2 className="card-title text-lg">Feature</h2>
        <input
          className="input input-bordered input-sm"
          type="text"
          placeholder="Name"
          value={feature.properties.name ?? ""}
          onChange={(event) => onUpdateProperty("name", event.currentTarget.value)}
        />

        <select
          className="select select-bordered select-sm"
          value={feature.properties.imdfType ?? feature.properties.kind ?? "unit"}
          onChange={(event) => {
            const value = event.currentTarget.value;
            onUpdateProperty("imdfType", value);
            onUpdateProperty("kind", value);
          }}
        >
          {IMDF_SUPPORTED_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2">
          <input
            className="input input-bordered input-sm"
            type="text"
            placeholder="Category"
            value={
              typeof feature.properties.category === "string" ? feature.properties.category : ""
            }
            onChange={(event) => onUpdateProperty("category", event.currentTarget.value)}
          />
          <input
            className="input input-bordered input-sm"
            type="text"
            placeholder="External ID"
            value={
              typeof feature.properties.externalId === "string" ? feature.properties.externalId : ""
            }
            onChange={(event) => onUpdateProperty("externalId", event.currentTarget.value)}
          />
        </div>

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
            <button
              className="btn btn-xs btn-ghost"
              type="button"
              onClick={() => {
                setMetadataText("{}");
                setMetadataError(undefined);
                onUpdateMetadata({});
              }}
            >
              Clear metadata
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
