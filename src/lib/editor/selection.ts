import type { Building, Floor, FloorFeature } from "../types";

export type Selection =
  | { kind: "building"; id: string }
  | { kind: "floor"; id: string }
  | { kind: "feature"; id: string };

export type SelectionContext = {
  buildings: Building[];
  floors: Floor[];
  features: FloorFeature[];
};

export type ResolvedSelection = {
  selection: Selection;
  building: Building;
  floor: Floor | undefined;
  feature: FloorFeature | undefined;
};

const resolveFromFeature = (
  selection: Selection,
  context: SelectionContext,
): ResolvedSelection | undefined => {
  const feature = context.features.find((current) => current.id === selection.id);
  if (!feature) {
    return undefined;
  }

  const floorId = typeof feature.properties.floorId === "string" ? feature.properties.floorId : "";
  const floor = context.floors.find((current) => current.id === floorId);
  if (!floor) {
    return undefined;
  }

  const building = context.buildings.find((current) => current.id === floor.buildingId);
  if (!building) {
    return undefined;
  }

  return {
    selection,
    building,
    floor,
    feature,
  };
};

const resolveFromFloor = (
  selection: Selection,
  context: SelectionContext,
): ResolvedSelection | undefined => {
  const floor = context.floors.find((current) => current.id === selection.id);
  if (!floor) {
    return undefined;
  }

  const building = context.buildings.find((current) => current.id === floor.buildingId);
  if (!building) {
    return undefined;
  }

  return {
    selection,
    building,
    floor,
    feature: undefined,
  };
};

const resolveFromBuilding = (
  selection: Selection,
  context: SelectionContext,
): ResolvedSelection | undefined => {
  const building = context.buildings.find((current) => current.id === selection.id);
  if (!building) {
    return undefined;
  }

  const floor = context.floors.find((current) => current.buildingId === building.id);

  return {
    selection,
    building,
    floor,
    feature: undefined,
  };
};

export const resolveSelection = (
  selection: Selection,
  context: SelectionContext,
): ResolvedSelection | undefined => {
  if (selection.kind === "feature") {
    return resolveFromFeature(selection, context);
  }

  if (selection.kind === "floor") {
    return resolveFromFloor(selection, context);
  }

  return resolveFromBuilding(selection, context);
};

export const firstValidSelection = (context: SelectionContext): Selection | undefined => {
  const building = context.buildings[0];
  if (!building) {
    return undefined;
  }

  const floor = context.floors.find((current) => current.buildingId === building.id);
  if (floor) {
    return { kind: "floor", id: floor.id };
  }

  return { kind: "building", id: building.id };
};
