import type { ImdfFeatureField } from "../../../lib/imdf/featureCatalog";
import type { FeatureProperties, JsonValue } from "../../../lib/types";

export const isEmptyValue = (value: JsonValue | undefined): boolean => {
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

export const readEnglishLabel = (value: JsonValue | undefined): string => {
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

export const readStringValue = (properties: FeatureProperties, key: string): string => {
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

export const readListValue = (properties: FeatureProperties, key: string): string => {
  const value = properties[key];
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .map((entry) =>
      typeof entry === "object" && entry !== null && "id" in entry
        ? String((entry as { id: string }).id)
        : String(entry),
    )
    .join(", ");
};

export const validateFieldValue = (
  field: ImdfFeatureField,
  value: JsonValue | undefined,
): string | undefined => {
  if (field.required && isEmptyValue(value)) {
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
