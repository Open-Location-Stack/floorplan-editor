import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FloorFeature, Level } from "../../../lib/types";
import { NavigationNodeFeatureEditor } from "./NavigationNodeFeatureEditor";

const levels: Level[] = [
  { id: "level-1", buildingId: "building-1", name: "Level 1" },
  { id: "level-2", buildingId: "building-1", name: "Level 2" },
];

const createNavigationNode = (
  id: string,
  levelId: string,
  category: "elevator" | "entrance",
): FloorFeature => ({
  type: "Feature",
  id,
  feature_type: "opening",
  geometry: {
    type: "LineString",
    coordinates: [
      [4.9, 52.37],
      [4.9001, 52.3701],
    ],
  },
  properties: {
    level_id: levelId,
    floorId: levelId,
    category,
    name: { en: "Connector A" },
  },
});

describe("NavigationNodeFeatureEditor", () => {
  it("shows connected-level checkboxes for vertical categories", () => {
    const feature = createNavigationNode("elevator-1", "level-1", "elevator");
    const sibling = createNavigationNode("elevator-2", "level-2", "elevator");
    const onUpdateProperty = vi.fn();

    render(
      <NavigationNodeFeatureEditor
        feature={feature}
        allFeatures={[feature, sibling]}
        levels={levels}
        locked={false}
        onUpdateProperty={onUpdateProperty}
        onDelete={vi.fn()}
        onClone={vi.fn()}
        onToggleLock={vi.fn()}
      />,
    );

    expect(screen.getByText("Connected levels")).toBeInTheDocument();
    const levelTwoCheckbox = screen.getByRole("checkbox", { name: "Level 2 (level-2)" });
    fireEvent.click(levelTwoCheckbox);
    expect(onUpdateProperty).toHaveBeenCalledWith("__navigation_levels", ["level-1"]);
  });

  it("hides connected-level checkboxes for non-vertical categories", () => {
    const feature = createNavigationNode("entrance-1", "level-1", "entrance");

    render(
      <NavigationNodeFeatureEditor
        feature={feature}
        allFeatures={[feature]}
        levels={levels}
        locked={false}
        onUpdateProperty={vi.fn()}
        onDelete={vi.fn()}
        onClone={vi.fn()}
        onToggleLock={vi.fn()}
      />,
    );

    expect(screen.queryByText("Connected levels")).not.toBeInTheDocument();
  });
});
