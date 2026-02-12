import type { Building, Floor, FloorFeature, FloorOverlay, Venue } from "../types";

export type ImportEntityData = {
  venues: Venue[];
  buildings: Building[];
  floors: Floor[];
  features: FloorFeature[];
  overlays: FloorOverlay[];
};

export type ImportConflictSummary = {
  venueIds: string[];
  buildingIds: string[];
  levelIds: string[];
  featureIds: string[];
  overlayIds: string[];
};

const collectIds = <T extends { id: string }>(items: T[]): Set<string> =>
  new Set(items.map((item) => item.id));

const intersection = (left: Set<string>, right: Set<string>): string[] =>
  [...left].filter((id) => right.has(id)).sort((a, b) => a.localeCompare(b));

const upsertById = <T extends { id: string }>(current: T[], incoming: T[]): T[] => {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    byId.set(item.id, item);
  }
  return [...byId.values()];
};

export const detectImportConflicts = (
  current: ImportEntityData,
  incoming: ImportEntityData,
): ImportConflictSummary => ({
  venueIds: intersection(collectIds(current.venues), collectIds(incoming.venues)),
  buildingIds: intersection(collectIds(current.buildings), collectIds(incoming.buildings)),
  levelIds: intersection(collectIds(current.floors), collectIds(incoming.floors)),
  featureIds: intersection(collectIds(current.features), collectIds(incoming.features)),
  overlayIds: intersection(collectIds(current.overlays), collectIds(incoming.overlays)),
});

export const hasImportConflicts = (summary: ImportConflictSummary): boolean =>
  summary.venueIds.length > 0 ||
  summary.buildingIds.length > 0 ||
  summary.levelIds.length > 0 ||
  summary.featureIds.length > 0 ||
  summary.overlayIds.length > 0;

export const mergeImportedDataReplaceConflicts = (
  current: ImportEntityData,
  incoming: ImportEntityData,
): ImportEntityData => ({
  venues: upsertById(current.venues, incoming.venues),
  buildings: upsertById(current.buildings, incoming.buildings),
  floors: upsertById(current.floors, incoming.floors),
  features: upsertById(current.features, incoming.features),
  overlays: upsertById(current.overlays, incoming.overlays),
});
