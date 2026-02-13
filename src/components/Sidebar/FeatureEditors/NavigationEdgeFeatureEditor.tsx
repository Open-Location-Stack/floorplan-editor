import { useMemo } from "react";
import {
  isNavigationNodeFeature,
  NAVIGATION_EDGE_CATEGORIES,
  type NavigationEdgeCategory,
  readNavigationLevels,
} from "../../../lib/navigation/navigationModel";
import type { FloorFeature, JsonValue, Level } from "../../../lib/types";

type NavigationEdgeFeatureEditorProps = {
  feature: FloorFeature;
  allFeatures: FloorFeature[];
  levels: Level[];
  locked: boolean;
  onUpdateProperty: (key: string, value: JsonValue | undefined) => void;
  onDelete: () => void;
  onClone: () => void;
  onToggleLock: () => void;
  rawGeoJsonFeature?: unknown;
  rawGeoJsonWarning?: string;
};

const EDGE_CATEGORY_LABELS: Record<NavigationEdgeCategory, string> = {
  pedestrian: "Pedestrian",
  wheelchair: "Wheelchair",
};

const featureName = (feature: FloorFeature): string => {
  const value = feature.properties.name;
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const english = (value as { en?: unknown }).en;
    if (typeof english === "string") {
      return english;
    }
  }
  return feature.id;
};

export const NavigationEdgeFeatureEditor = ({
  feature,
  allFeatures,
  levels,
  locked,
  onUpdateProperty,
  onDelete,
  onClone,
  onToggleLock,
  rawGeoJsonFeature,
  rawGeoJsonWarning,
}: NavigationEdgeFeatureEditorProps) => {
  const currentLevelId =
    typeof feature.properties.level_id === "string"
      ? feature.properties.level_id
      : (levels[0]?.id ?? "");
  const category = feature.properties["formation:path_category"];
  const selectedCategory =
    typeof category === "string" &&
    (NAVIGATION_EDGE_CATEGORIES as readonly string[]).includes(category)
      ? (category as NavigationEdgeCategory)
      : "pedestrian";
  const nodeCandidates = useMemo(
    () =>
      allFeatures.filter(
        (candidate) =>
          isNavigationNodeFeature(candidate) &&
          readNavigationLevels(candidate).includes(currentLevelId),
      ),
    [allFeatures, currentLevelId],
  );

  const fromNodeId =
    typeof feature.properties["formation:from_node_id"] === "string"
      ? feature.properties["formation:from_node_id"]
      : "";
  const toNodeId =
    typeof feature.properties["formation:to_node_id"] === "string"
      ? feature.properties["formation:to_node_id"]
      : "";

  return (
    <div className="flex flex-col gap-3">
      <section className="card bg-base-100 shadow">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">Navigation Edge</h2>
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
          <label className="fieldset">
            <span className="fieldset-legend">Path category</span>
            <select
              className="select select-bordered select-sm"
              value={selectedCategory}
              onChange={(event) =>
                onUpdateProperty(
                  "formation:path_category",
                  event.currentTarget.value as NavigationEdgeCategory,
                )
              }
            >
              {NAVIGATION_EDGE_CATEGORIES.map((entry) => (
                <option key={entry} value={entry}>
                  {EDGE_CATEGORY_LABELS[entry]}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldset">
            <span className="fieldset-legend">Level</span>
            <select
              className="select select-bordered select-sm"
              value={currentLevelId}
              onChange={(event) => onUpdateProperty("level_id", event.currentTarget.value)}
            >
              {levels.map((level) => (
                <option key={level.id} value={level.id}>
                  {`${level.id} - ${level.name}`}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldset">
            <span className="fieldset-legend">From node</span>
            <select
              className="select select-bordered select-sm"
              value={fromNodeId}
              onChange={(event) =>
                onUpdateProperty("formation:from_node_id", event.currentTarget.value || undefined)
              }
            >
              <option value="">Select node</option>
              {nodeCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {featureName(candidate)}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldset">
            <span className="fieldset-legend">To node</span>
            <select
              className="select select-bordered select-sm"
              value={toNodeId}
              onChange={(event) =>
                onUpdateProperty("formation:to_node_id", event.currentTarget.value || undefined)
              }
            >
              <option value="">Select node</option>
              {nodeCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {featureName(candidate)}
                </option>
              ))}
            </select>
          </label>
          {fromNodeId.length === 0 || toNodeId.length === 0 ? (
            <p className="text-xs text-warning">
              Set both endpoints to connect this path to navigation nodes.
            </p>
          ) : null}
          <div className="flex gap-2">
            <button className="btn btn-sm" type="button" onClick={onClone}>
              Clone
            </button>
            <button className="btn btn-sm btn-error" type="button" onClick={onDelete}>
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
