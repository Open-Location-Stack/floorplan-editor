import { useEffect, useMemo, useState } from "react";
import {
  convertArea,
  convertLength,
  featureAreaSquareMeters,
  featureLengthMeters,
} from "../../../lib/geometry/measurements";
import { getCategoryOptions } from "../../../lib/imdf/categories";
import { canContainChildren, resolveFeatureType } from "../../../lib/imdf/containment";
import type { ImdfFeatureField } from "../../../lib/imdf/featureCatalog";
import { getFeatureSpec } from "../../../lib/imdf/featureCatalog";
import { formatFeatureOptionLabel } from "../../../lib/imdf/featureDisplay";
import type {
  FeatureProperties,
  FloorFeature,
  ImdfFeatureType,
  JsonObject,
  JsonValue,
} from "../../../lib/types";
import { AppIcon } from "../../icons/AppIcon";
import {
  AddFeatureButtonGroups,
  type AddFeatureRequest,
} from "../../Sidebar/AddFeatureButtonGroups";

export type ImdfFeatureEditorProps = {
  feature: FloorFeature;
  type: ImdfFeatureType;
  allFeatures: FloorFeature[];
  locked: boolean;
  onCreateFeature: (request: AddFeatureRequest) => void;
  onUpdateProperty: (key: string, value: JsonValue | undefined) => void;
  onUpdateMetadata: (metadata: JsonObject) => void;
  onDelete: () => void;
  onClone: () => void;
  onToggleLock: () => void;
  rawGeoJsonFeature?: unknown;
  rawGeoJsonWarning?: string;
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

const readEnglishLabel = (value: JsonValue | undefined): string => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const english = (value as { en?: unknown }).en;
    if (typeof english === "string") {
      return english;
    }
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
};

const readString = (properties: FeatureProperties, key: string): string => {
  const value = properties[key];
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string"
  ) {
    return (value as { id: string }).id;
  }
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
  if (field.type === "json") {
    if (typeof value === "undefined") {
      return undefined;
    }
    return undefined;
  }
  if (field.type === "reference") {
    if (
      typeof value !== "object" ||
      !value ||
      Array.isArray(value) ||
      typeof (value as { id?: unknown }).id !== "string" ||
      typeof (value as { feature_type?: unknown }).feature_type !== "string"
    ) {
      return "Must be a reference object.";
    }
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
  rawGeoJsonFeature,
  rawGeoJsonWarning,
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
          candidate.properties.level_id === feature.properties.level_id &&
          candidate.id !== feature.id,
      ),
    [allFeatures, feature.id, feature.properties.level_id],
  );
  const isContainerType = canContainChildren(type);
  const childTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of sameFloorFeatures) {
      const itemType = resolveFeatureType(item);
      counts.set(itemType, (counts.get(itemType) ?? 0) + 1);
    }
    return counts;
  }, [sameFloorFeatures]);
  const candidatesForField = useMemo(() => {
    const byField: Record<string, FloorFeature[]> = {};
    for (const field of spec.fields) {
      const scopeFeatures =
        field.scope === "global"
          ? allFeatures.filter((candidate) => candidate.id !== feature.id)
          : sameFloorFeatures;
      byField[field.key] =
        field.referenceTypes && field.referenceTypes.length > 0
          ? scopeFeatures.filter((candidate) =>
              field.referenceTypes?.includes(resolveFeatureType(candidate)),
            )
          : scopeFeatures;
    }
    return byField;
  }, [allFeatures, feature.id, sameFloorFeatures, spec.fields]);

  useEffect(() => {
    for (const field of spec.fields) {
      if (!field.required || field.readOnly) {
        continue;
      }
      if (field.type !== "uuid" && field.type !== "reference") {
        continue;
      }
      const currentValue = feature.properties[field.key];
      const isEmptyValue =
        currentValue === undefined ||
        currentValue === null ||
        (typeof currentValue === "string" && currentValue.trim().length === 0);
      if (!isEmptyValue) {
        continue;
      }
      const candidates = candidatesForField[field.key] ?? [];
      if (candidates.length !== 1) {
        continue;
      }
      const onlyCandidate = candidates[0];
      if (!onlyCandidate) {
        continue;
      }
      if (field.type === "uuid") {
        onUpdateProperty(field.key, onlyCandidate.id);
      } else {
        const nextType = resolveFeatureType(onlyCandidate);
        onUpdateProperty(field.key, {
          id: onlyCandidate.id,
          feature_type: nextType,
        });
      }
    }
  }, [candidatesForField, feature.properties, onUpdateProperty, spec.fields]);

  return (
    <div className="flex flex-col gap-3">
      <section className="card bg-base-100 shadow">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">
            <AppIcon name={type} />
            {spec.defaultName}
          </h2>
          <label className="label cursor-pointer rounded-box border border-base-300 px-3 py-2">
            <span className="label-text flex items-center gap-2">
              <AppIcon name={locked ? "lock" : "unlock"} />
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
                <label className="fieldset" key={field.key}>
                  <span className="fieldset-legend">{label}</span>
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
                <label className="fieldset" key={field.key}>
                  <span className="fieldset-legend">{label}</span>
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
                <label className="fieldset" key={field.key}>
                  <span className="fieldset-legend">{label}</span>
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
                fieldText[field.key] ?? readEnglishLabel(feature.properties[field.key]);
              return (
                <label className="fieldset" key={field.key}>
                  <span className="fieldset-legend">{label}</span>
                  <input
                    className={`input input-bordered input-sm ${hasError ? "input-error" : ""}`}
                    type="text"
                    value={textValue}
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value;
                      setFieldText((current) => ({
                        ...current,
                        [field.key]: nextValue,
                      }));
                    }}
                    onBlur={() => {
                      const value = fieldText[field.key] ?? textValue;
                      const trimmed = value.trim();
                      onUpdateProperty(
                        field.key,
                        trimmed.length > 0 ? ({ en: trimmed } as JsonObject) : undefined,
                      );
                    }}
                  />
                  {hasError ? <span className="text-xs text-error">{error}</span> : null}
                </label>
              );
            }

            if (field.type === "string[]") {
              const currentValue = readListValue(feature.properties, field.key);
              return (
                <label className="fieldset" key={field.key}>
                  <span className="fieldset-legend">{label}</span>
                  <input
                    className={`input input-bordered input-sm ${hasError ? "input-error" : ""}`}
                    type="text"
                    value={currentValue}
                    onChange={(event) => {
                      const list = event.currentTarget.value
                        .split(",")
                        .map((entry) => entry.trim())
                        .filter((entry) => entry.length > 0);
                      onUpdateProperty(field.key, list.length > 0 ? list : undefined);
                    }}
                  />
                  {hasError ? <span className="text-xs text-error">{error}</span> : null}
                </label>
              );
            }

            if (field.type === "json") {
              const textValue =
                fieldText[field.key] ??
                JSON.stringify(feature.properties[field.key] ?? {}, null, 2);
              return (
                <label className="fieldset" key={field.key}>
                  <span className="fieldset-legend">{label}</span>
                  <textarea
                    className={`textarea textarea-bordered h-24 w-full font-mono text-xs ${hasError ? "textarea-error" : ""}`}
                    value={textValue}
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value;
                      setFieldText((current) => ({
                        ...current,
                        [field.key]: nextValue,
                      }));
                    }}
                    onBlur={() => {
                      const value = fieldText[field.key] ?? textValue;
                      if (value.trim().length === 0) {
                        onUpdateProperty(field.key, undefined);
                        return;
                      }
                      try {
                        onUpdateProperty(field.key, JSON.parse(value) as JsonValue);
                      } catch {
                        setFieldErrors((current) => ({
                          ...current,
                          [field.key]: "Invalid JSON value.",
                        }));
                      }
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
              const candidates = candidatesForField[field.key] ?? sameFloorFeatures;
              if (selectable) {
                return (
                  <label className="fieldset" key={field.key}>
                    <span className="fieldset-legend">{label}</span>
                    <select
                      className={`select select-bordered select-sm ${hasError ? "select-error" : ""}`}
                      value={currentValue}
                      onChange={(event) =>
                        onUpdateProperty(field.key, event.currentTarget.value || undefined)
                      }
                    >
                      <option value="">{field.placeholder ?? "Select feature"}</option>
                      {candidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {formatFeatureOptionLabel(candidate)}
                        </option>
                      ))}
                    </select>
                    {hasError ? <span className="text-xs text-error">{error}</span> : null}
                  </label>
                );
              }
            }

            if (field.type === "reference") {
              const reference = feature.properties[field.key];
              const currentValue =
                reference &&
                typeof reference === "object" &&
                !Array.isArray(reference) &&
                typeof (reference as { id?: unknown }).id === "string"
                  ? ((reference as { id: string }).id ?? "")
                  : "";
              return (
                <label className="fieldset" key={field.key}>
                  <span className="fieldset-legend">{label}</span>
                  <select
                    className={`select select-bordered select-sm ${hasError ? "select-error" : ""}`}
                    value={currentValue}
                    onChange={(event) => {
                      const nextId = event.currentTarget.value;
                      if (nextId.length === 0) {
                        onUpdateProperty(field.key, undefined);
                        return;
                      }
                      const nextType =
                        (candidatesForField[field.key] ?? sameFloorFeatures).find(
                          (candidate) => candidate.id === nextId,
                        )?.feature_type ?? "unit";
                      onUpdateProperty(field.key, {
                        id: nextId,
                        feature_type: nextType,
                      });
                    }}
                  >
                    <option value="">{field.placeholder ?? "Select feature"}</option>
                    {(candidatesForField[field.key] ?? sameFloorFeatures).map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {formatFeatureOptionLabel(candidate)}
                      </option>
                    ))}
                  </select>
                  {hasError ? <span className="text-xs text-error">{error}</span> : null}
                </label>
              );
            }

            return (
              <label className="fieldset" key={field.key}>
                <span className="fieldset-legend">{label}</span>
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
                <AppIcon name="add" />
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
              <AppIcon name="clone" />
              Clone
            </button>
            <button className="btn btn-sm btn-error" type="button" onClick={onDelete}>
              <AppIcon name="delete" />
              Delete
            </button>
          </div>

          <details className="rounded-box border border-base-300 p-3">
            <summary className="cursor-pointer font-medium">Raw exported GeoJSON</summary>
            <div className="mt-3">
              {rawGeoJsonWarning ? (
                <p className="mb-2 text-xs text-warning">{rawGeoJsonWarning}</p>
              ) : null}
              <pre className="max-h-56 overflow-auto rounded-box border border-base-300 bg-base-200 p-2 font-mono text-xs">
                {JSON.stringify(rawGeoJsonFeature ?? {}, null, 2)}
              </pre>
            </div>
          </details>
        </div>
      </section>
    </div>
  );
};
