import { describe, expect, it } from "vitest";
import type { ImdfFeatureField } from "../../../lib/imdf/featureCatalog";
import type { FeatureProperties } from "../../../lib/types";
import {
  isEmptyValue,
  readEnglishLabel,
  readListValue,
  readStringValue,
  validateFieldValue,
} from "./fieldValueUtils";

const field = (overrides: Partial<ImdfFeatureField>): ImdfFeatureField => ({
  key: "test",
  type: "string",
  required: false,
  ...overrides,
});

describe("fieldValueUtils", () => {
  it("detects empty values consistently", () => {
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue("   ")).toBe(true);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue({})).toBe(true);
    expect(isEmptyValue("value")).toBe(false);
    expect(isEmptyValue(0)).toBe(false);
  });

  it("reads english labels and falls back to strings", () => {
    expect(readEnglishLabel({ en: "Elevator", nl: "Lift" })).toBe("Elevator");
    expect(readEnglishLabel("Direct value")).toBe("Direct value");
    expect(readEnglishLabel({ nl: "Lift" })).toBe("");
  });

  it("reads scalar and reference ids as strings", () => {
    const props: FeatureProperties = {
      scalar: 42,
      boolValue: true,
      direct: "text",
      ref: { id: "feature-1", feature_type: "unit" },
    };
    expect(readStringValue(props, "scalar")).toBe("42");
    expect(readStringValue(props, "boolValue")).toBe("true");
    expect(readStringValue(props, "direct")).toBe("text");
    expect(readStringValue(props, "ref")).toBe("feature-1");
    expect(readStringValue(props, "missing")).toBe("");
  });

  it("reads list values including reference-like entries", () => {
    const props: FeatureProperties = {
      tags: ["a", { id: "feature-2", feature_type: "unit" }, 3],
    };
    expect(readListValue(props, "tags")).toBe("a, feature-2, 3");
    expect(readListValue(props, "missing")).toBe("");
  });

  it("validates required, typed, and reference fields", () => {
    expect(validateFieldValue(field({ required: true }), undefined)).toBe(
      "Required field is empty.",
    );
    expect(validateFieldValue(field({ type: "number" }), "x")).toBe("Must be a valid number.");
    expect(validateFieldValue(field({ type: "boolean" }), "true")).toBe("Must be true or false.");
    expect(validateFieldValue(field({ type: "uuid" }), { id: "x" })).toBe("Must be a UUID string.");
    expect(validateFieldValue(field({ type: "label" }), { en: 12 })).toBe(
      "Label object must contain non-empty locale strings.",
    );
    expect(validateFieldValue(field({ type: "string[]" }), "a,b")).toBe(
      "Must be a comma-separated list.",
    );
    expect(validateFieldValue(field({ type: "reference" }), { id: "x" })).toBe(
      "Must be a reference object.",
    );
    expect(
      validateFieldValue(field({ type: "reference" }), {
        id: "x",
        feature_type: "unit",
      }),
    ).toBeUndefined();
  });
});
