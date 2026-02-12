import { useEffect, useMemo, useState } from "react";
import {
  convertArea,
  convertLength,
  featureAreaSquareMeters,
  featureLengthMeters,
} from "../../../lib/geometry/measurements";
import { getCategoryOptions } from "../../../lib/imdf/categories";
import type { ImdfFeatureField } from "../../../lib/imdf/featureCatalog";
import { getFeatureSpec } from "../../../lib/imdf/featureCatalog";
import type {
  FeatureProperties,
  Floor,
  FloorFeature,
  ImdfFeatureType,
  JsonObject,
  JsonValue,
} from "../../../lib/types";

export type ImdfFeatureEditorProps = {
  feature: FloorFeature;
  type: ImdfFeatureType;
  floors: Floor[];
  allFeatures: FloorFeature[];
  locked: boolean;
  onUpdateProperty: (key: string, value: JsonValue | undefined) => void;
  onUpdateMetadata: (metadata: JsonObject) => void;
  onDelete: () => void;
  onClone: () => void;
  onToggleLock: () => void;
};

type ContainmentOverrideMetadata = JsonObject & {
  imdfRelationshipParentId?: string;
  imdfRelationshipParentType?: string;
};

const isEmpty = (value: JsonValue | undefined): boolean => {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }
  return false;
};

const labelTextFromValue = (value: JsonValue | undefined): string => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return JSON.stringify({ en: value }, null, 2);
  }
  return '{\n  "en": ""\n}';
};

const readString = (properties: FeatureProperties, key: string): string => {
  const value = properties[key];
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
};

const readListValue = (properties: FeatureProperties, key: string): string => {
  const value = properties[key];
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        typeof entry === "object" && entry !== null && "id" in entry
          ? String((entry as { id: string }).id)
          : String(entry),
      )
      .join(", ");
  }
  return "";
};

const validateField = (
  field: ImdfFeatureField,
  value: JsonValue | undefined,
): string | undefined => {
  if (field.required && isEmpty(value)) {
    return "Required field is empty.";
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    return "Must be a valid number.";
  }
  if (field.type === "boolean" && typeof value !== "boolean") {
    return "Must be true or false.";
  }
  if (field.type === "uuid" && typeof value !== "string") {
    return "Must be a UUID string.";
  }
  if (field.type === "label") {
    if (typeof value !== "object" || !value || Array.isArray(value)) {
      return "Must be a label JSON object.";
    }
    const entries = Object.entries(value);
    if (entries.length === 0 || !entries.every(([, entry]) => typeof entry === "string")) {
      return "Label object must contain non-empty locale strings.";
    }
  }
  if (field.type === "string[]" && !Array.isArray(value)) {
    return "Must be a comma-separated list.";
  }
  if (field.type === "references" && !Array.isArray(value)) {
    return "Must be a references array.";
  }
  return undefined;
};

export const GenericImdfFeatureEditor = ({
  feature,
  type,
  allFeatures,
  locked,
  onUpdateProperty,
  onUpdateMetadata,
  onDelete,
  onClone,
  onToggleLock,
}: ImdfFeatureEditorProps) => {
  const [metadataText, setMetadataText] = useState("{}");
  const [metadataError, setMetadataError] = useState<string | undefined>();
  const [fieldText, setFieldText] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
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

  useEffect(() => {
    const nextErrors: Record<string, string | undefined> = {};
    for (const field of spec.fields) {
      nextErrors[field.key] = validateField(field, feature.properties[field.key]);
    }
    setFieldErrors(nextErrors);
  }, [feature.properties, spec.fields]);

  const lengthMeters = useMemo(() => featureLengthMeters(feature), [feature]);
  const areaSquareMeters = useMemo(() => featureAreaSquareMeters(feature), [feature]);
  const sameFloorFeatures = useMemo(
    () =>
      allFeatures.filter(
        (candidate) =>
          candidate.properties.floorId === feature.properties.floorId &&
          candidate.id !== feature.id,
      ),
    [allFeatures, feature.id, feature.properties.floorId],
  );
  const metadataObject: ContainmentOverrideMetadata =
    feature.properties.metadata && typeof feature.properties.metadata === "object"
      ? (feature.properties.metadata as ContainmentOverrideMetadata)
      : {};
  const relationshipParentId =
    typeof metadataObject.imdfRelationshipParentId === "string"
      ? metadataObject.imdfRelationshipParentId
      : "";
  const relationshipParentType =
    typeof metadataObject.imdfRelationshipParentType === "string"
      ? metadataObject.imdfRelationshipParentType
      : "level";
  const debugFeatureJson = useMemo(() => JSON.stringify(feature, null, 2), [feature]);

  return (
    <div className="flex flex-col gap-3">
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
            const error = fieldErrors[field.key];
            const hasError = Boolean(error);
            const label = `${field.key}${field.required ? " *" : ""}${field.readOnly ? " (read only)" : ""}`;

            if (field.key === "category" && categoryOptions.length > 0) {
              const currentValue = readString(feature.properties, field.key);
              return (
                <label className="form-control gap-1" key={field.key}>
                  <span className="label-text">{label}</span>
                  <select
                    className={`select select-bordered select-sm ${hasError ? "select-error" : ""}`}
                    value={currentValue}
                    disabled={Boolean(field.readOnly)}
                    onChange={(event) =>
                      onUpdateProperty(field.key, event.currentTarget.value || undefined)
                    }
                  >
                    <option value="">Select category</option>
                    {categoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {hasError ? <span className="text-xs text-error">{error}</span> : null}
                </label>
              );
            }

            if (
              (field.editorControl === "enum" ||
                field.key === "door" ||
                field.key === "direction") &&
              field.enumOptions
            ) {
              const currentValue = readString(feature.properties, field.key);
              return (
                <label className="form-control gap-1" key={field.key}>
                  <span className="label-text">{label}</span>
                  <select
                    className={`select select-bordered select-sm ${hasError ? "select-error" : ""}`}
                    value={currentValue}
                    disabled={Boolean(field.readOnly)}
                    onChange={(event) => {
                      const next = event.currentTarget.value;
                      if (field.type === "number") {
                        onUpdateProperty(field.key, next.length > 0 ? Number(next) : undefined);
                        return;
                      }
                      onUpdateProperty(field.key, next || undefined);
                    }}
                  >
                    <option value="">Select value</option>
                    {field.enumOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {hasError ? <span className="text-xs text-error">{error}</span> : null}
                </label>
              );
            }

            if (field.type === "boolean") {
              const checked = Boolean(feature.properties[field.key]);
              return (
                <label
                  className="label cursor-pointer rounded-box border border-base-300 px-3 py-2"
                  key={field.key}
                >
                  <span className="label-text">{label}</span>
                  <input
                    type="checkbox"
                    className={`checkbox checkbox-sm ${hasError ? "checkbox-error" : ""}`}
                    checked={checked}
                    disabled={Boolean(field.readOnly)}
                    onChange={(event) => onUpdateProperty(field.key, event.currentTarget.checked)}
                  />
                </label>
              );
            }

            if (field.type === "number") {
              const currentValue =
                typeof feature.properties[field.key] === "number"
                  ? String(feature.properties[field.key])
                  : "";
              return (
                <label className="form-control gap-1" key={field.key}>
                  <span className="label-text">{label}</span>
                  <input
                    className={`input input-bordered input-sm ${hasError ? "input-error" : ""}`}
                    type="number"
                    value={currentValue}
                    readOnly={Boolean(field.readOnly)}
                    onChange={(event) => {
                      const raw = event.currentTarget.value;
                      onUpdateProperty(field.key, raw.length > 0 ? Number(raw) : undefined);
                    }}
                  />
                  {hasError ? <span className="text-xs text-error">{error}</span> : null}
                </label>
              );
            }

            if (field.type === "label") {
              const textValue =
                fieldText[field.key] ?? labelTextFromValue(feature.properties[field.key]);
              return (
                <label className="form-control gap-1" key={field.key}>
                  <span className="label-text">{label}</span>
                  <textarea
                    className={`textarea textarea-bordered h-24 w-full font-mono text-xs ${hasError ? "textarea-error" : ""}`}
                    value={textValue}
                    readOnly={Boolean(field.readOnly)}
                    onChange={(event) =>
                      setFieldText((current) => ({
                        ...current,
                        [field.key]: event.currentTarget.value,
                      }))
                    }
                    onBlur={() => {
                      const value = fieldText[field.key] ?? textValue;
                      try {
                        const parsed = JSON.parse(value) as unknown;
                        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                          setFieldErrors((current) => ({
                            ...current,
                            [field.key]: "Must be a label JSON object.",
                          }));
                          return;
                        }
                        onUpdateProperty(field.key, parsed as JsonObject);
                      } catch {
                        setFieldErrors((current) => ({
                          ...current,
                          [field.key]: "Invalid JSON object.",
                        }));
                      }
                    }}
                  />
                  {hasError ? <span className="text-xs text-error">{error}</span> : null}
                </label>
              );
            }

            if (field.type === "string[]" || field.type === "references") {
              const currentValue = readListValue(feature.properties, field.key);
              return (
                <label className="form-control gap-1" key={field.key}>
                  <span className="label-text">{label}</span>
                  <input
                    className={`input input-bordered input-sm ${hasError ? "input-error" : ""}`}
                    type="text"
                    value={currentValue}
                    readOnly={Boolean(field.readOnly)}
                    onChange={(event) => {
                      const list = event.currentTarget.value
                        .split(",")
                        .map((entry) => entry.trim())
                        .filter((entry) => entry.length > 0);
                      if (field.type === "references") {
                        onUpdateProperty(
                          field.key,
                          list.length > 0
                            ? list.map((id) => ({ id, feature_type: "unknown" }))
                            : undefined,
                        );
                        return;
                      }
                      onUpdateProperty(field.key, list.length > 0 ? list : undefined);
                    }}
                  />
                  {hasError ? <span className="text-xs text-error">{error}</span> : null}
                </label>
              );
            }

            if (field.type === "uuid" && !field.readOnly) {
              const currentValue = readString(feature.properties, field.key);
              const selectable =
                field.key.endsWith("_id") ||
                field.key.endsWith("_ids") ||
                field.editorControl === "uuid-ref";
              if (selectable) {
                return (
                  <label className="form-control gap-1" key={field.key}>
                    <span className="label-text">{label}</span>
                    <select
                      className={`select select-bordered select-sm ${hasError ? "select-error" : ""}`}
                      value={currentValue}
                      onChange={(event) =>
                        onUpdateProperty(field.key, event.currentTarget.value || undefined)
                      }
                    >
                      <option value="">Select feature</option>
                      {sameFloorFeatures.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.id}
                        </option>
                      ))}
                    </select>
                    {hasError ? <span className="text-xs text-error">{error}</span> : null}
                  </label>
                );
              }
            }

            return (
              <label className="form-control gap-1" key={field.key}>
                <span className="label-text">{label}</span>
                <input
                  className={`input input-bordered input-sm ${hasError ? "input-error" : ""}`}
                  type="text"
                  value={readString(feature.properties, field.key)}
                  readOnly={Boolean(field.readOnly)}
                  onChange={(event) =>
                    onUpdateProperty(field.key, event.currentTarget.value || undefined)
                  }
                />
                {hasError ? <span className="text-xs text-error">{error}</span> : null}
              </label>
            );
          })}

          {type !== "level" && type !== "relationship" ? (
            <label className="form-control gap-1">
              <span className="label-text">containment parent override</span>
              <select
                className="select select-bordered select-sm"
                value={relationshipParentId}
                onChange={(event) => {
                  const nextId = event.currentTarget.value;
                  const nextMetadata: ContainmentOverrideMetadata = { ...metadataObject };
                  if (nextId.length === 0) {
                    delete nextMetadata.imdfRelationshipParentId;
                    delete nextMetadata.imdfRelationshipParentType;
                  } else {
                    nextMetadata.imdfRelationshipParentId = nextId;
                    const nextType = sameFloorFeatures.find((candidate) => candidate.id === nextId)
                      ?.properties.imdfType;
                    nextMetadata.imdfRelationshipParentType =
                      typeof nextType === "string" ? nextType : relationshipParentType;
                  }
                  onUpdateMetadata(nextMetadata);
                }}
              >
                <option value="">Default level containment</option>
                {sameFloorFeatures.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

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
              Area: {convertArea(areaSquareMeters, "m2")} m2 /{" "}
              {convertArea(areaSquareMeters, "ft2")} ft2
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
      <details className="collapse collapse-arrow border border-base-300 bg-base-100">
        <summary className="collapse-title text-sm font-medium">Debug feature JSON</summary>
        <div className="collapse-content">
          <pre className="overflow-x-auto rounded-box bg-base-200 p-3 text-xs">
            <code>{debugFeatureJson}</code>
          </pre>
        </div>
      </details>
    </div>
  );
};
