import { useEffect, useMemo, useState } from "react";
import {
  convertArea,
  convertLength,
  featureAreaSquareMeters,
  featureLengthMeters,
} from "../../../lib/geometry/measurements";
import { getCategoryOptions } from "../../../lib/imdf/categories";
import {
  canContainChildren,
  getContainmentParentId,
  resolveFeatureType,
  wouldCreateContainmentCycle,
} from "../../../lib/imdf/containment";
import type { ImdfFeatureField } from "../../../lib/imdf/featureCatalog";
import { getFeatureSpec } from "../../../lib/imdf/featureCatalog";
import type { SupportedImdfType } from "../../../lib/imdf/schema";
import type {
  FeatureProperties,
  FloorFeature,
  ImdfFeatureType,
  JsonObject,
  JsonValue,
} from "../../../lib/types";
import { AddFeatureButtonGroups } from "../../Sidebar/AddFeatureButtonGroups";

export type ImdfFeatureEditorProps = {
  feature: FloorFeature;
  type: ImdfFeatureType;
  allFeatures: FloorFeature[];
  locked: boolean;
  onCreateFeature: (type: SupportedImdfType) => void;
  onUpdateProperty: (key: string, value: JsonValue | undefined) => void;
  onUpdateMetadata: (metadata: JsonObject) => void;
  onDelete: () => void;
  onClone: () => void;
  onToggleLock: () => void;
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
  onCreateFeature,
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
  const containmentParentId = getContainmentParentId(feature) ?? "";
  const isContainerType = canContainChildren(type);
  const childTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of sameFloorFeatures) {
      const itemType = resolveFeatureType(item);
      counts.set(itemType, (counts.get(itemType) ?? 0) + 1);
    }
    return counts;
  }, [sameFloorFeatures]);
  const parentCandidates = useMemo(
    () =>
      sameFloorFeatures.filter((candidate) => canContainChildren(resolveFeatureType(candidate))),
    [sameFloorFeatures],
  );

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

          {spec.fields.map((field) => {
            if (field.readOnly) {
              return null;
            }
            const error = fieldErrors[field.key];
            const hasError = Boolean(error);
            const label = `${field.key}${field.required ? " *" : ""}`;

            if (field.key === "category" && categoryOptions.length > 0) {
              const currentValue = readString(feature.properties, field.key);
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

            if (field.type === "uuid") {
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
                  onChange={(event) =>
                    onUpdateProperty(field.key, event.currentTarget.value || undefined)
                  }
                />
                {hasError ? <span className="text-xs text-error">{error}</span> : null}
              </label>
            );
          })}

          {type !== "relationship" ? (
            <label className="form-control gap-1">
              <span className="label-text">Containment parent</span>
              <select
                className="select select-bordered select-sm"
                value={containmentParentId}
                onChange={(event) => {
                  const nextId = event.currentTarget.value;
                  if (
                    wouldCreateContainmentCycle(
                      feature.id,
                      nextId.length > 0 ? nextId : undefined,
                      allFeatures,
                    )
                  ) {
                    return;
                  }
                  onUpdateProperty("containmentParentId", nextId.length > 0 ? nextId : undefined);
                  const nextType = parentCandidates.find((candidate) => candidate.id === nextId)
                    ?.properties.imdfType;
                  onUpdateProperty(
                    "containmentParentType",
                    typeof nextType === "string"
                      ? nextType
                      : nextId.length > 0
                        ? "unit"
                        : undefined,
                  );
                }}
              >
                <option value="">Default level containment</option>
                {parentCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <AddFeatureButtonGroups
            typeCounts={childTypeCounts}
            disabled={!isContainerType}
            onCreateFeature={onCreateFeature}
          />

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
    </div>
  );
};
