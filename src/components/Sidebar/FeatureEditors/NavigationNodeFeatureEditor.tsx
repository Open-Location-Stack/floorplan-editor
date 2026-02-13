import { useMemo } from "react";
import {
  isNavigationNodeOpening,
  NAVIGATION_NODE_CATEGORIES,
  type NavigationNodeCategory,
  openingRepresentativePoint,
  readNavigationNodeCategory,
} from "../../../lib/navigation/navigationModel";
import type { FloorFeature, JsonValue, Level } from "../../../lib/types";
import { AppIcon } from "../../icons/AppIcon";

type NavigationNodeFeatureEditorProps = {
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

const CATEGORY_LABELS: Record<NavigationNodeCategory, string> = {
  entrance: "Entrance",
  door: "Door",
  stairs: "Stairs",
  elevator: "Elevator",
  escalator: "Escalator",
  revolving_door: "Revolving door",
  exit: "Exit",
};

export const NavigationNodeFeatureEditor = ({
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
}: NavigationNodeFeatureEditorProps) => {
  const groupKey = useMemo(() => {
    const category = readNavigationNodeCategory(feature) ?? "entrance";
    const point = openingRepresentativePoint(feature) ?? [0, 0];
    const rounded = `${Math.round(point[0] * 1e7)}:${Math.round(point[1] * 1e7)}`;
    const name =
      typeof feature.properties.name === "string"
        ? feature.properties.name
        : typeof feature.properties.name === "object" &&
            feature.properties.name &&
            !Array.isArray(feature.properties.name) &&
            typeof (feature.properties.name as { en?: unknown }).en === "string"
          ? ((feature.properties.name as { en: string }).en ?? "")
          : "";
    return `${category}:${name}:${rounded}`;
  }, [feature]);
  const selectedLevels = useMemo(() => {
    const entries = allFeatures
      .filter((candidate) => isNavigationNodeOpening(candidate))
      .filter((candidate) => {
        const category = readNavigationNodeCategory(candidate) ?? "entrance";
        const point = openingRepresentativePoint(candidate) ?? [0, 0];
        const rounded = `${Math.round(point[0] * 1e7)}:${Math.round(point[1] * 1e7)}`;
        const name =
          typeof candidate.properties.name === "string"
            ? candidate.properties.name
            : typeof candidate.properties.name === "object" &&
                candidate.properties.name &&
                !Array.isArray(candidate.properties.name) &&
                typeof (candidate.properties.name as { en?: unknown }).en === "string"
              ? ((candidate.properties.name as { en: string }).en ?? "")
              : "";
        return `${category}:${name}:${rounded}` === groupKey;
      })
      .map((candidate) =>
        typeof candidate.properties.level_id === "string"
          ? candidate.properties.level_id
          : undefined,
      )
      .filter((levelId): levelId is string => Boolean(levelId));
    return [...new Set(entries)];
  }, [allFeatures, groupKey]);
  const selectedCategory = readNavigationNodeCategory(feature) ?? "entrance";

  return (
    <div className="flex flex-col gap-3">
      <section className="card bg-base-100 shadow">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">
            <AppIcon name={selectedCategory} />
            Navigation Node
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
          <label className="fieldset">
            <span className="fieldset-legend">Category</span>
            <select
              className="select select-bordered select-sm"
              value={selectedCategory}
              onChange={(event) =>
                onUpdateProperty("category", event.currentTarget.value as NavigationNodeCategory)
              }
            >
              {NAVIGATION_NODE_CATEGORIES.map((entry) => (
                <option key={entry} value={entry}>
                  {CATEGORY_LABELS[entry]}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-box border border-base-300 p-3">
            <div className="mb-2 text-sm font-semibold">Levels</div>
            <div className="grid gap-2">
              {levels.map((level) => {
                const checked = selectedLevels.includes(level.id);
                return (
                  <label
                    key={level.id}
                    className="label cursor-pointer rounded-box border border-base-300 px-3 py-2"
                  >
                    <span className="label-text">{`${level.id} - ${level.name}`}</span>
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={checked}
                      onChange={(event) => {
                        const next = event.currentTarget.checked
                          ? [...new Set([...selectedLevels, level.id])]
                          : selectedLevels.filter((entry) => entry !== level.id);
                        onUpdateProperty("__navigation_levels", next);
                      }}
                    />
                  </label>
                );
              })}
            </div>
            {selectedLevels.length === 0 ? (
              <p className="mt-2 text-xs text-error">Select at least one level.</p>
            ) : null}
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
