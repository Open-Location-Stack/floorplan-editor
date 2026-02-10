import { describe, expect, it } from "vitest";
import { createDemoProject, deleteBuilding, deleteFloor } from "./projectModel";

describe("projectModel delete operations", () => {
  it("deleteFloor removes the floor and floor items attached to it", () => {
    const project = createDemoProject();
    const updated = deleteFloor(project, "floor-ground");

    expect(updated.floors.map((floor) => floor.id)).not.toContain("floor-ground");
    expect(updated.floorItems.map((item) => item.floorId)).not.toContain("floor-ground");
    expect(updated.floors.map((floor) => floor.id)).toContain("floor-first");
  });

  it("deleteBuilding removes floors and items under that building", () => {
    const project = createDemoProject();
    const updated = deleteBuilding(project, "building-hq");

    expect(updated.buildings).toHaveLength(0);
    expect(updated.floors).toHaveLength(0);
    expect(updated.floorItems).toHaveLength(0);
  });
});
