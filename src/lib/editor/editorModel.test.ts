import { describe, expect, it } from "vitest";
import {
  addFeature,
  createInitialEditorState,
  deleteSelectedFeature,
  redo,
  selectFeature,
  undo,
} from "./editorModel";

const feature = {
  type: "Feature" as const,
  id: "feature-1",
  geometry: {
    type: "Point" as const,
    coordinates: [0, 0] as [number, number],
  },
  properties: {
    kind: "amenity",
  },
};

describe("editorModel", () => {
  it("supports add and undo/redo", () => {
    const initial = createInitialEditorState();
    const withFeature = addFeature(initial, feature);

    expect(withFeature.features).toHaveLength(1);

    const undone = undo(withFeature);
    expect(undone.features).toHaveLength(0);

    const redone = redo(undone);
    expect(redone.features).toHaveLength(1);
  });

  it("deletes selected feature", () => {
    const withFeature = addFeature(createInitialEditorState(), feature);
    const selected = selectFeature(withFeature, feature.id);

    const deleted = deleteSelectedFeature(selected);

    expect(deleted.features).toHaveLength(0);
    expect(deleted.selectedFeatureId).toBeUndefined();
  });
});
