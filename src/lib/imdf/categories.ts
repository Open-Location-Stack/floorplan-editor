import type { ImdfFeatureType } from "../types";

export type CategoryOption = {
  value: string;
  label: string;
};

const toLabel = (value: string): string =>
  value
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" / ");

const createOptions = (values: readonly string[]): CategoryOption[] =>
  values.map((value) => ({ value, label: toLabel(value) }));

export const OPENING_CATEGORY_SUGGESTIONS = [
  "pedestrian",
  "pedestrian.principal",
  "entrance",
  "door",
  "stairs",
  "elevator",
  "escalator",
  "revolving_door",
  "exit",
  "automobile",
  "bicycle",
] as const;

export const AMENITY_CATEGORY_SUGGESTIONS = [
  "restroom",
  "restroom.male",
  "restroom.female",
  "atm",
  "water",
  "information",
  "food",
  "parking",
  "elevator",
  "escalator",
  "stairs",
  "exhibit",
  "phone",
] as const;

export const UNIT_CATEGORY_SUGGESTIONS = [
  "unspecified",
  "room",
  "corridor",
  "hall",
  "retail",
  "office",
  "service",
  "walkway",
  "classroom",
  "library",
  "storage",
  "parking",
  "restroom",
  "restroom.male",
  "restroom.female",
  "stairs",
  "steps",
  "elevator",
  "escalator",
  "nonpublic",
  "opentobelow",
  "conferenceroom",
  "unenclosedarea",
] as const;

export const GEOFENCE_CATEGORY_SUGGESTIONS = [
  "security",
  "restricted",
  "operational",
  "event",
  "concourse",
] as const;

export const SECTION_CATEGORY_SUGGESTIONS = ["zone", "concourse", "terminal", "arcade"] as const;

export const FIXTURE_CATEGORY_SUGGESTIONS = [
  "stairs",
  "elevator",
  "escalator",
  "furniture",
  "desk",
] as const;

export const OCCUPANT_CATEGORY_SUGGESTIONS = [
  "retail",
  "food",
  "service",
  "office",
  "restaurant",
  "shopping",
  "education",
] as const;

const CATEGORY_OPTIONS: Partial<Record<ImdfFeatureType, CategoryOption[]>> = {
  opening: createOptions(OPENING_CATEGORY_SUGGESTIONS),
  amenity: createOptions(AMENITY_CATEGORY_SUGGESTIONS),
  unit: createOptions(UNIT_CATEGORY_SUGGESTIONS),
  geofence: createOptions(GEOFENCE_CATEGORY_SUGGESTIONS),
  section: createOptions(SECTION_CATEGORY_SUGGESTIONS),
  fixture: createOptions(FIXTURE_CATEGORY_SUGGESTIONS),
  occupant: createOptions(OCCUPANT_CATEGORY_SUGGESTIONS),
};

export const getCategoryOptions = (type: ImdfFeatureType): CategoryOption[] =>
  CATEGORY_OPTIONS[type] ?? [];

export const hasCategoryOptions = (type: ImdfFeatureType): boolean =>
  getCategoryOptions(type).length > 0;

export const isStandardCategoryForType = (type: ImdfFeatureType, value: string): boolean =>
  getCategoryOptions(type).some((option) => option.value === value);

const LEGACY_IMPORT_CATEGORY_ALIASES: Partial<Record<ImdfFeatureType, Record<string, string>>> = {
  opening: {
    "pedestrian.principal": "pedestrian",
  },
  amenity: {
    "restroom.male": "restroom",
    "restroom.female": "restroom",
  },
  unit: {
    "restroom.male": "restroom",
    "restroom.female": "restroom",
    steps: "stairs",
  },
  fixture: {
    desk: "furniture",
  },
  occupant: {
    restaurant: "food",
    shopping: "retail",
  },
};

export const normalizeLegacyImportedCategory = (
  type: ImdfFeatureType,
  value: string,
): { category: string; migrated: boolean } => {
  const normalized = value.trim();
  const next = LEGACY_IMPORT_CATEGORY_ALIASES[type]?.[normalized];
  if (!next) {
    return { category: normalized, migrated: false };
  }
  return { category: next, migrated: true };
};
