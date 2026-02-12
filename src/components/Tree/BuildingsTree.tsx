import { useEffect, useMemo, useState } from "react";
import type { Selection } from "../../lib/editor/selection";
import { sortFeaturesForRendering } from "../../lib/imdf/export";
import type { Building, Floor, FloorFeature } from "../../lib/types";
import { TreeNode } from "./TreeNode";

type BuildingsTreeProps = {
  buildings: Building[];
  floors: Floor[];
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
  buildings,
  floors,
  features,
  selection,
  onSelect,
}: BuildingsTreeProps) => {
  const [expandedBuildings, setExpandedBuildings] = useState<Record<string, boolean>>({});
  const [expandedFloors, setExpandedFloors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!selection) {
      return;
    }

    if (selection.kind === "building") {
      setExpandedBuildings((current) => ({ ...current, [selection.id]: true }));
      return;
    }

    if (selection.kind === "floor") {
      const floor = floors.find((current) => current.id === selection.id);
      if (!floor) {
        return;
      }

      setExpandedBuildings((current) => ({ ...current, [floor.buildingId]: true }));
      setExpandedFloors((current) => ({ ...current, [floor.id]: true }));
      return;
    }

    const feature = features.find((current) => current.id === selection.id);
    if (!feature || typeof feature.properties.floorId !== "string") {
      return;
    }

    const floor = floors.find((current) => current.id === feature.properties.floorId);
    if (!floor) {
      return;
    }

    setExpandedBuildings((current) => ({ ...current, [floor.buildingId]: true }));
    setExpandedFloors((current) => ({ ...current, [floor.id]: true }));
  }, [features, floors, selection]);

  const featuresByFloor = useMemo(() => {
    const groups = new Map<string, FloorFeature[]>();
    for (const feature of sortFeaturesForRendering(features)) {
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
      <div className="mb-2 px-2 text-sm font-semibold">Buildings</div>
      {buildings.length === 0 ? (
        <div className="px-2 py-3 text-sm text-base-content/70">No buildings.</div>
      ) : null}
      {buildings.map((building) => {
        const buildingFloors = floors.filter((floor) => floor.buildingId === building.id);
        const buildingExpanded = expandedBuildings[building.id] ?? true;

        return (
          <div key={building.id}>
            <TreeNode
              depth={0}
              label={building.name}
              selected={selection?.kind === "building" && selection.id === building.id}
              expandable={buildingFloors.length > 0}
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
              ? buildingFloors.map((floor) => {
                  const floorExpanded = expandedFloors[floor.id] ?? true;
                  const floorFeatures = featuresByFloor.get(floor.id) ?? [];

                  return (
                    <div key={floor.id}>
                      <TreeNode
                        depth={1}
                        label={floor.name}
                        selected={selection?.kind === "floor" && selection.id === floor.id}
                        expandable={floorFeatures.length > 0}
                        expanded={floorExpanded}
                        onToggle={() =>
                          setExpandedFloors((current) => ({
                            ...current,
                            [floor.id]: !floorExpanded,
                          }))
                        }
                        onSelect={() => onSelect({ kind: "floor", id: floor.id })}
                      />
                      {floorExpanded
                        ? floorFeatures.map((feature) => (
                            <TreeNode
                              key={feature.id}
                              depth={2}
                              label={featureLabel(feature)}
                              selected={
                                selection?.kind === "feature" && selection.id === feature.id
                              }
                              onSelect={() => onSelect({ kind: "feature", id: feature.id })}
                            />
                          ))
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
