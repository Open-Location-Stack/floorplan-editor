export type Building = {
  id: string;
  name: string;
};

export type Floor = {
  id: string;
  buildingId: string;
  name: string;
};

export type FloorItem = {
  id: string;
  floorId: string;
  label: string;
};

export type ProjectData = {
  buildings: Building[];
  floors: Floor[];
  floorItems: FloorItem[];
};

const createId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export const addBuilding = (project: ProjectData, name: string): ProjectData => ({
  ...project,
  buildings: [...project.buildings, { id: createId("building"), name }],
});

export const addFloor = (project: ProjectData, buildingId: string, name: string): ProjectData => ({
  ...project,
  floors: [...project.floors, { id: createId("floor"), buildingId, name }],
});

export const addFloorItem = (
  project: ProjectData,
  floorId: string,
  label: string,
): ProjectData => ({
  ...project,
  floorItems: [...project.floorItems, { id: createId("item"), floorId, label }],
});

export const deleteFloor = (project: ProjectData, floorId: string): ProjectData => ({
  ...project,
  floors: project.floors.filter((floor) => floor.id !== floorId),
  floorItems: project.floorItems.filter((item) => item.floorId !== floorId),
});

export const deleteBuilding = (project: ProjectData, buildingId: string): ProjectData => {
  const floorIdsToDelete = new Set(
    project.floors.filter((floor) => floor.buildingId === buildingId).map((floor) => floor.id),
  );

  return {
    ...project,
    buildings: project.buildings.filter((building) => building.id !== buildingId),
    floors: project.floors.filter((floor) => floor.buildingId !== buildingId),
    floorItems: project.floorItems.filter((item) => !floorIdsToDelete.has(item.floorId)),
  };
};

export const createDemoProject = (): ProjectData => {
  const buildingId = "building-hq";
  const groundFloorId = "floor-ground";
  const firstFloorId = "floor-first";

  return {
    buildings: [
      {
        id: buildingId,
        name: "HQ",
      },
    ],
    floors: [
      {
        id: groundFloorId,
        buildingId,
        name: "Ground Floor",
      },
      {
        id: firstFloorId,
        buildingId,
        name: "First Floor",
      },
    ],
    floorItems: [
      {
        id: "item-reception",
        floorId: groundFloorId,
        label: "Reception Desk",
      },
      {
        id: "item-conference-a",
        floorId: firstFloorId,
        label: "Conference Room A",
      },
    ],
  };
};
