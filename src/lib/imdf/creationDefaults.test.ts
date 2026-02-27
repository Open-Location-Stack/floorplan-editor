import { describe, expect, it } from "vitest";
import type { Coordinates, FloorFeature, ImdfFeatureType } from "../types";
import type { ContainmentParent } from "./containment";
import {
  defaultCategoryForType,
  requiresAnchorId,
  resolveHierarchyDefaultsForNewFeature,
  resolveUnitIdForNewAnchor,
} from "./creationDefaults";

const pointFeature = (
  id: string,
  type: ImdfFeatureType,
  levelId: string,
  coordinates: Coordinates = [0, 0],
  properties: FloorFeature["properties"] = {},
): FloorFeature => ({
  type: "Feature",
  id,
  feature_type: type,
  geometry: { type: "Point", coordinates },
  properties: {
    name: id,
    level_id: levelId,
    ...properties,
  },
});

const polygonFeature = (
  id: string,
  type: ImdfFeatureType,
  levelId: string,
  ring: Coordinates[],
): FloorFeature => ({
  type: "Feature",
  id,
  feature_type: type,
  geometry: { type: "Polygon", coordinates: [ring] },
  properties: {
    name: id,
    level_id: levelId,
  },
});

describe("requiresAnchorId", () => {
  it("detects anchor-required feature types", () => {
    expect(requiresAnchorId("occupant")).toBe(true);
    expect(requiresAnchorId("fixture")).toBe(true);
    expect(requiresAnchorId("detail")).toBe(true);
    expect(requiresAnchorId("amenity")).toBe(false);
  });
});

describe("defaultCategoryForType", () => {
  it("uses schema defaults for required categories", () => {
    expect(defaultCategoryForType("unit")).toBe("unspecified");
  });

  it("falls back to first suggestion when schema has no default value", () => {
    expect(defaultCategoryForType("occupant")).toBe("retail");
  });
});

describe("resolveUnitIdForNewAnchor", () => {
  it("prefers selected unit", () => {
    const unit = polygonFeature("unit-1", "unit", "level-1", [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);

    const result = resolveUnitIdForNewAnchor([unit], "level-1", [50, 50], unit, undefined);

    expect(result).toBe("unit-1");
  });

  it("uses containing unit by point containment", () => {
    const unitA = polygonFeature("unit-a", "unit", "level-1", [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
      [0, 0],
    ]);
    const unitB = polygonFeature("unit-b", "unit", "level-1", [
      [5, 5],
      [8, 5],
      [8, 8],
      [5, 8],
      [5, 5],
    ]);

    const result = resolveUnitIdForNewAnchor(
      [unitA, unitB],
      "level-1",
      [6, 6],
      undefined,
      undefined,
    );

    expect(result).toBe("unit-b");
  });

  it("falls back to pending containment unit", () => {
    const unitA = polygonFeature("unit-a", "unit", "level-1", [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
    const parent: ContainmentParent = { parentId: "unit-a", parentType: "unit" };

    const result = resolveUnitIdForNewAnchor([unitA], "level-1", [100, 100], undefined, parent);

    expect(result).toBe("unit-a");
  });

  it("returns undefined if no units exist on the level", () => {
    const detail = pointFeature("detail-1", "detail", "level-1");

    const result = resolveUnitIdForNewAnchor([detail], "level-1", [0, 0], undefined, undefined);

    expect(result).toBeUndefined();
  });
});

describe("resolveHierarchyDefaultsForNewFeature", () => {
  it("sets anchor unit_id from selected unit context", () => {
    const unit = polygonFeature("unit-1", "unit", "level-1", [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);

    const defaults = resolveHierarchyDefaultsForNewFeature({
      features: [unit],
      featureType: "anchor",
      levelId: "level-1",
      point: [5, 5],
      selectedFeature: unit,
      pendingContainmentParent: undefined,
    });

    expect(defaults.unit_id).toBe("unit-1");
  });

  it("sets required anchor_id from selected anchor context", () => {
    const anchor = pointFeature("anchor-1", "anchor", "level-1", [1, 1], {
      unit_id: "unit-1",
    });
    const defaults = resolveHierarchyDefaultsForNewFeature({
      features: [anchor],
      featureType: "detail",
      levelId: "level-1",
      point: [1, 1],
      selectedFeature: anchor,
      pendingContainmentParent: undefined,
    });

    expect(defaults.anchor_id).toBe("anchor-1");
  });

  it("falls back to nearest anchor when no anchor is selected", () => {
    const anchorA = pointFeature("anchor-a", "anchor", "level-1", [0, 0], { unit_id: "unit-1" });
    const anchorB = pointFeature("anchor-b", "anchor", "level-1", [100, 100], {
      unit_id: "unit-2",
    });

    const defaults = resolveHierarchyDefaultsForNewFeature({
      features: [anchorA, anchorB],
      featureType: "occupant",
      levelId: "level-1",
      point: [2, 2],
      selectedFeature: undefined,
      pendingContainmentParent: undefined,
    });

    expect(defaults.anchor_id).toBe("anchor-a");
  });

  it("sets section parent id when created under a section parent", () => {
    const defaults = resolveHierarchyDefaultsForNewFeature({
      features: [],
      featureType: "section",
      levelId: "level-1",
      point: [0, 0],
      selectedFeature: undefined,
      pendingContainmentParent: { parentId: "section-parent", parentType: "section" },
    });

    expect(defaults.section_id).toBe("section-parent");
  });
});
