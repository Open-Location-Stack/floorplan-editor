import type { Building, FloorFeature, Level, Venue } from "../types";

export type Selection =
  | { kind: "venue"; id: string }
  | { kind: "building"; id: string }
  | { kind: "floor"; id: string }
  | { kind: "level"; id: string }
  | { kind: "feature"; id: string };

export type SelectionContext = {
  venues?: Venue[];
  buildings: Building[];
  floors?: Level[];
  levels?: Level[];
  features: FloorFeature[];
};

export type ResolvedSelection = {
  selection: Selection;
  venue: Venue | undefined;
  building: Building | undefined;
  level: Level | undefined;
  floor: Level | undefined;
  feature: FloorFeature | undefined;
};

const readLevels = (context: SelectionContext): Level[] =>
  (context.levels ?? []).length > 0 ? (context.levels ?? []) : (context.floors ?? []);

const readVenues = (context: SelectionContext): Venue[] => context.venues ?? [];

const resolveFromFeature = (
  selection: Selection,
  context: SelectionContext,
): ResolvedSelection | undefined => {
  const feature = context.features.find((current) => current.id === selection.id);
  if (!feature) {
    return undefined;
  }

  const floorId = typeof feature.properties.floorId === "string" ? feature.properties.floorId : "";
  const level = readLevels(context).find((current) => current.id === floorId);
  if (!level) {
    return undefined;
  }

  const building = context.buildings.find((current) => current.id === level.buildingId);
  if (!building) {
    return undefined;
  }
  const venue = readVenues(context).find((current) => current.id === building.venueId);

  return {
    selection,
    venue,
    building,
    level,
    floor: level,
    feature,
  };
};

const resolveFromFloor = (
  selection: Selection,
  context: SelectionContext,
): ResolvedSelection | undefined => {
  const level = readLevels(context).find((current) => current.id === selection.id);
  if (!level) {
    return undefined;
  }

  const building = context.buildings.find((current) => current.id === level.buildingId);
  if (!building) {
    return undefined;
  }
  const venue = readVenues(context).find((current) => current.id === building.venueId);

  return {
    selection,
    venue,
    building,
    level,
    floor: level,
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

  const venue = readVenues(context).find((current) => current.id === building.venueId);
  const level = readLevels(context).find((current) => current.buildingId === building.id);

  return {
    selection,
    venue,
    building,
    level,
    floor: level,
    feature: undefined,
  };
};

const resolveFromVenue = (
  selection: Selection,
  context: SelectionContext,
): ResolvedSelection | undefined => {
  const venue = readVenues(context).find((current) => current.id === selection.id);
  if (!venue) {
    return undefined;
  }
  const building = context.buildings.find((current) => current.venueId === venue.id);
  const level = building
    ? readLevels(context).find((current) => current.buildingId === building.id)
    : undefined;

  return {
    selection,
    venue,
    building,
    level,
    floor: level,
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

  if (selection.kind === "level" || selection.kind === "floor") {
    return resolveFromFloor(selection, context);
  }

  if (selection.kind === "venue") {
    return resolveFromVenue(selection, context);
  }

  return resolveFromBuilding(selection, context);
};

export const firstValidSelection = (context: SelectionContext): Selection | undefined => {
  const venue = readVenues(context)[0];
  if (!venue) {
    const building = context.buildings[0];
    if (!building) {
      return undefined;
    }
    const level = readLevels(context).find((current) => current.buildingId === building.id);
    if (level) {
      return { kind: "level", id: level.id };
    }
    return { kind: "building", id: building.id };
  }

  const building = context.buildings.find((current) => current.venueId === venue.id);
  if (!building) {
    return { kind: "venue", id: venue.id };
  }
  const level = readLevels(context).find((current) => current.buildingId === building.id);
  if (level) {
    return { kind: "level", id: level.id };
  }

  return { kind: "building", id: building.id };
};
