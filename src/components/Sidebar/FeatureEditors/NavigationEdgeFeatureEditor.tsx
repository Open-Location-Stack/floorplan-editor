import { useMemo } from "react";
import {
  isNavigationNodeOpening,
  isRelationshipFeature,
  NAVIGATION_PATH_CATEGORIES,
  type NavigationPathCategory,
  openingRepresentativePoint,
  readNavigationPathCategory,
} from "../../../lib/navigation/navigationModel";
import type { FloorFeature, JsonValue, Level } from "../../../lib/types";
import { AppIcon } from "../../icons/AppIcon";

const readRelationshipRefId = (value: unknown): string | undefined => {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string"
  ) {
    return (value as { id: string }).id;
  }
  return undefined;
};

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

const EDGE_CATEGORY_LABELS: Record<NavigationPathCategory, string> = {
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
  const selectedCategory = readNavigationPathCategory(feature);
  const nodeCandidates = useMemo(
    () =>
      allFeatures.filter(
        (candidate) =>
          isNavigationNodeOpening(candidate) && candidate.properties.level_id === currentLevelId,
      ),
    [allFeatures, currentLevelId],
  );

  const { fromNodeId, toNodeId } = useMemo(() => {
    if (feature.geometry.type !== "LineString" || feature.geometry.coordinates.length < 2) {
      return { fromNodeId: "", toNodeId: "" };
    }
    const start = feature.geometry.coordinates[0];
    const end = feature.geometry.coordinates[feature.geometry.coordinates.length - 1];
    if (!start || !end) {
      return { fromNodeId: "", toNodeId: "" };
    }
    const links = allFeatures
      .filter(isRelationshipFeature)
      .map((relationship) => {
        const origin = readRelationshipRefId(relationship.properties.origin);
        const destination = readRelationshipRefId(relationship.properties.destination);
        if (origin === feature.id && destination) {
          return destination;
        }
        if (destination === feature.id && origin) {
          return origin;
        }
        return undefined;
      })
      .filter((entry): entry is string => Boolean(entry))
      .map((id) => {
        const node = allFeatures.find((candidate) => candidate.id === id);
        return {
          id,
          point: node ? openingRepresentativePoint(node) : undefined,
        };
      })
      .filter((entry) => entry.point);
    if (links.length === 0) {
      return { fromNodeId: "", toNodeId: "" };
    }
    const from = [...links].sort((left, right) => {
      const leftPoint = left.point ?? start;
      const rightPoint = right.point ?? start;
      return (
        Math.hypot(start[0] - leftPoint[0], start[1] - leftPoint[1]) -
        Math.hypot(start[0] - rightPoint[0], start[1] - rightPoint[1])
      );
    })[0]?.id;
    const to = [...links]
      .filter((entry) => entry.id !== from)
      .sort((left, right) => {
        const leftPoint = left.point ?? end;
        const rightPoint = right.point ?? end;
        return (
          Math.hypot(end[0] - leftPoint[0], end[1] - leftPoint[1]) -
          Math.hypot(end[0] - rightPoint[0], end[1] - rightPoint[1])
        );
      })[0]?.id;
    return {
      fromNodeId: from ?? "",
      toNodeId: to ?? "",
    };
  }, [allFeatures, feature]);

  return (
    <div className="flex flex-col gap-3">
      <section className="card bg-base-100 shadow">
        <div className="card-body gap-3">
          <h2 className="card-title text-lg">
            <AppIcon name={selectedCategory} />
            Navigation Edge
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
            <span className="fieldset-legend">Path category</span>
            <select
              className="select select-bordered select-sm"
              value={selectedCategory}
              onChange={(event) =>
                onUpdateProperty(
                  "__navigation_path_category",
                  event.currentTarget.value as NavigationPathCategory,
                )
              }
            >
              {NAVIGATION_PATH_CATEGORIES.map((entry) => (
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
                onUpdateProperty(
                  "__navigation_from_opening_id",
                  event.currentTarget.value || undefined,
                )
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
                onUpdateProperty(
                  "__navigation_to_opening_id",
                  event.currentTarget.value || undefined,
                )
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
