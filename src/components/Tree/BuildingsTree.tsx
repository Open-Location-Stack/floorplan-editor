import { useEffect, useMemo, useState } from "react";
import type { Selection } from "../../lib/editor/selection";
import { getChildrenByParent } from "../../lib/imdf/containment";
import { sortFeaturesForRendering } from "../../lib/imdf/export";
import { isLevelGeometryFeature } from "../../lib/imdf/levelGeometry";
import type { Building, FloorFeature, Level, Venue } from "../../lib/types";
import { TreeNode } from "./TreeNode";

type BuildingsTreeProps = {
  venues: Venue[];
  buildings: Building[];
  levels: Level[];
  features: FloorFeature[];
  selection: Selection | undefined;
  onSelect: (selection: Selection) => void;
};

const featureLabel = (feature: FloorFeature): string => {
  const name = feature.properties.name;
  if (typeof name === "string" && name.trim().length > 0) {
    return name;
  }
  if (name && typeof name === "object" && !Array.isArray(name)) {
    const label = name as { en?: unknown };
    if (typeof label.en === "string") {
      return label.en;
    }
  }
  return feature.id;
};

export const BuildingsTree = ({
  venues,
  buildings,
  levels,
  features,
  selection,
  onSelect,
}: BuildingsTreeProps) => {
  const [expandedVenues, setExpandedVenues] = useState<Record<string, boolean>>({});
  const [expandedBuildings, setExpandedBuildings] = useState<Record<string, boolean>>({});
  const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({});
  const [expandedFeatures, setExpandedFeatures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!selection) {
      return;
    }
    if (selection.kind === "venue") {
      setExpandedVenues((current) => ({ ...current, [selection.id]: true }));
      return;
    }
    if (selection.kind === "building") {
      const building = buildings.find((current) => current.id === selection.id);
      if (!building) {
        return;
      }
      const venueId = building.venueId ?? venues[0]?.id;
      if (venueId) {
        setExpandedVenues((current) => ({ ...current, [venueId]: true }));
      }
      setExpandedBuildings((current) => ({ ...current, [selection.id]: true }));
      return;
    }
    if (selection.kind === "level" || selection.kind === "floor") {
      const level = levels.find((current) => current.id === selection.id);
      if (!level) {
        return;
      }
      const building = buildings.find((current) => current.id === level.buildingId);
      if (!building) {
        return;
      }
      const venueId = building.venueId ?? venues[0]?.id;
      if (venueId) {
        setExpandedVenues((current) => ({ ...current, [venueId]: true }));
      }
      setExpandedBuildings((current) => ({ ...current, [building.id]: true }));
      setExpandedLevels((current) => ({ ...current, [level.id]: true }));
      return;
    }
    const feature = features.find((current) => current.id === selection.id);
    if (!feature || typeof feature.properties.floorId !== "string") {
      return;
    }
    const level = levels.find((current) => current.id === feature.properties.floorId);
    if (!level) {
      return;
    }
    const building = buildings.find((current) => current.id === level.buildingId);
    if (!building) {
      return;
    }
    const venueId = building.venueId ?? venues[0]?.id;
    if (venueId) {
      setExpandedVenues((current) => ({ ...current, [venueId]: true }));
    }
    setExpandedBuildings((current) => ({ ...current, [building.id]: true }));
    setExpandedLevels((current) => ({ ...current, [level.id]: true }));
  }, [features, levels, selection, buildings, venues]);

  const featuresByLevel = useMemo(() => {
    const groups = new Map<string, FloorFeature[]>();
    for (const feature of sortFeaturesForRendering(features)) {
      if (isLevelGeometryFeature(feature)) {
        continue;
      }
      if (typeof feature.properties.floorId !== "string") {
        continue;
      }
      const group = groups.get(feature.properties.floorId) ?? [];
      group.push(feature);
      groups.set(feature.properties.floorId, group);
    }
    return groups;
  }, [features]);

  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-2">
      <div className="mb-2 px-2 text-sm font-semibold">IMDF Hierarchy</div>
      {venues.length === 0 ? (
        <div className="px-2 py-3 text-sm text-base-content/70">No venues.</div>
      ) : null}
      {venues.map((venue) => {
        const venueBuildings = buildings.filter((building) => building.venueId === venue.id);
        const venueExpanded = expandedVenues[venue.id] ?? true;
        return (
          <div key={venue.id}>
            <TreeNode
              depth={0}
              label={venue.name}
              selected={selection?.kind === "venue" && selection.id === venue.id}
              expandable={venueBuildings.length > 0}
              expanded={venueExpanded}
              onToggle={() =>
                setExpandedVenues((current) => ({
                  ...current,
                  [venue.id]: !venueExpanded,
                }))
              }
              onSelect={() => onSelect({ kind: "venue", id: venue.id })}
            />
            {venueExpanded
              ? venueBuildings.map((building) => {
                  const buildingLevels = levels.filter((level) => level.buildingId === building.id);
                  const buildingExpanded = expandedBuildings[building.id] ?? true;
                  return (
                    <div key={building.id}>
                      <TreeNode
                        depth={1}
                        label={building.name}
                        selected={selection?.kind === "building" && selection.id === building.id}
                        expandable={buildingLevels.length > 0}
                        expanded={buildingExpanded}
                        onToggle={() =>
                          setExpandedBuildings((current) => ({
                            ...current,
                            [building.id]: !buildingExpanded,
                          }))
                        }
                        onSelect={() => onSelect({ kind: "building", id: building.id })}
                      />
                      {buildingExpanded
                        ? buildingLevels.map((level) => {
                            const levelExpanded = expandedLevels[level.id] ?? true;
                            const levelFeatures = featuresByLevel.get(level.id) ?? [];
                            const childrenByParent = getChildrenByParent(levelFeatures, level.id);
                            const renderFeature = (
                              feature: FloorFeature,
                              depth = 3,
                              lineage = new Set<string>(),
                            ) => {
                              if (lineage.has(feature.id)) {
                                return null;
                              }
                              const nextLineage = new Set(lineage);
                              nextLineage.add(feature.id);
                              const children = childrenByParent.get(feature.id) ?? [];
                              const expanded = expandedFeatures[feature.id] ?? true;
                              return (
                                <div key={feature.id}>
                                  <TreeNode
                                    depth={depth}
                                    label={featureLabel(feature)}
                                    selected={
                                      selection?.kind === "feature" && selection.id === feature.id
                                    }
                                    expandable={children.length > 0}
                                    expanded={expanded}
                                    onToggle={() =>
                                      setExpandedFeatures((current) => ({
                                        ...current,
                                        [feature.id]: !expanded,
                                      }))
                                    }
                                    onSelect={() => onSelect({ kind: "feature", id: feature.id })}
                                  />
                                  {expanded
                                    ? children.map((child) =>
                                        renderFeature(child, depth + 1, nextLineage),
                                      )
                                    : null}
                                </div>
                              );
                            };
                            return (
                              <div key={level.id}>
                                <TreeNode
                                  depth={2}
                                  label={level.name}
                                  selected={
                                    (selection?.kind === "level" || selection?.kind === "floor") &&
                                    selection.id === level.id
                                  }
                                  expandable={(childrenByParent.get(level.id) ?? []).length > 0}
                                  expanded={levelExpanded}
                                  onToggle={() =>
                                    setExpandedLevels((current) => ({
                                      ...current,
                                      [level.id]: !levelExpanded,
                                    }))
                                  }
                                  onSelect={() => onSelect({ kind: "level", id: level.id })}
                                />
                                {levelExpanded
                                  ? (childrenByParent.get(level.id) ?? []).map((feature) =>
                                      renderFeature(feature),
                                    )
                                  : null}
                              </div>
                            );
                          })
                        : null}
                    </div>
                  );
                })
              : null}
          </div>
        );
      })}
    </div>
  );
};
