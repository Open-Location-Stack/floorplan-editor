import type { FloorFeature } from "../types";

type Snapshot = {
  features: FloorFeature[];
  selectedFeatureId: string | undefined;
};

export type EditorState = Snapshot & {
  undoStack: Snapshot[];
  redoStack: Snapshot[];
};

const cloneFeatures = (features: FloorFeature[]): FloorFeature[] => structuredClone(features);

const snapshotOf = (state: EditorState): Snapshot => ({
  features: cloneFeatures(state.features),
  selectedFeatureId: state.selectedFeatureId,
});

const applyWithHistory = (state: EditorState, next: Snapshot): EditorState => ({
  ...next,
  undoStack: [...state.undoStack, snapshotOf(state)],
  redoStack: [],
});

export const createInitialEditorState = (features: FloorFeature[] = []): EditorState => ({
  features: cloneFeatures(features),
  selectedFeatureId: undefined,
  undoStack: [],
  redoStack: [],
});

export const selectFeature = (state: EditorState, featureId: string | undefined): EditorState => ({
  ...state,
  selectedFeatureId: featureId,
});

export const addFeature = (state: EditorState, feature: FloorFeature): EditorState =>
  applyWithHistory(state, {
    features: [...state.features, feature],
    selectedFeatureId: feature.id,
  });

export const updateFeature = (
  state: EditorState,
  featureId: string,
  updater: (feature: FloorFeature) => FloorFeature,
): EditorState => {
  const index = state.features.findIndex((feature) => feature.id === featureId);
  if (index < 0) {
    return state;
  }

  const nextFeatures = [...state.features];
  const currentFeature = nextFeatures[index];
  if (!currentFeature) {
    return state;
  }
  nextFeatures[index] = updater(currentFeature);

  return applyWithHistory(state, {
    features: nextFeatures,
    selectedFeatureId: state.selectedFeatureId,
  });
};

export const deleteSelectedFeature = (state: EditorState): EditorState => {
  if (!state.selectedFeatureId) {
    return state;
  }

  return applyWithHistory(state, {
    features: state.features.filter((feature) => feature.id !== state.selectedFeatureId),
    selectedFeatureId: undefined,
  });
};

export const replaceAllFeatures = (state: EditorState, features: FloorFeature[]): EditorState =>
  applyWithHistory(state, {
    features: cloneFeatures(features),
    selectedFeatureId: undefined,
  });

export const undo = (state: EditorState): EditorState => {
  const previous = state.undoStack.at(-1);
  if (!previous) {
    return state;
  }

  return {
    ...previous,
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, snapshotOf(state)],
  };
};

export const redo = (state: EditorState): EditorState => {
  const next = state.redoStack.at(-1);
  if (!next) {
    return state;
  }

  return {
    ...next,
    redoStack: state.redoStack.slice(0, -1),
    undoStack: [...state.undoStack, snapshotOf(state)],
  };
};
