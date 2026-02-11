import type { ImdfFeatureType } from "../types";

export type CategoryOption = {
  value: string;
  label: string;
};

const CATEGORY_OPTIONS: Partial<Record<ImdfFeatureType, CategoryOption[]>> = {
  opening: [
    { value: "entrance", label: "Entrance" },
    { value: "door", label: "Door" },
    { value: "stairs", label: "Stairs" },
    { value: "elevator", label: "Elevator" },
    { value: "escalator", label: "Escalator" },
    { value: "revolving_door", label: "Revolving door" },
    { value: "exit", label: "Exit" },
  ],
  amenity: [
    { value: "restroom", label: "Restroom" },
    { value: "atm", label: "ATM" },
    { value: "water", label: "Water" },
    { value: "information", label: "Information" },
    { value: "food", label: "Food" },
    { value: "parking", label: "Parking" },
  ],
  unit: [
    { value: "room", label: "Room" },
    { value: "corridor", label: "Corridor" },
    { value: "hall", label: "Hall" },
    { value: "retail", label: "Retail" },
    { value: "office", label: "Office" },
    { value: "service", label: "Service" },
  ],
  geofence: [
    { value: "security", label: "Security" },
    { value: "restricted", label: "Restricted" },
    { value: "operational", label: "Operational" },
    { value: "event", label: "Event" },
  ],
  section: [
    { value: "zone", label: "Zone" },
    { value: "concourse", label: "Concourse" },
    { value: "terminal", label: "Terminal" },
  ],
  fixture: [
    { value: "stairs", label: "Stairs" },
    { value: "elevator", label: "Elevator" },
    { value: "escalator", label: "Escalator" },
    { value: "furniture", label: "Furniture" },
  ],
  occupant: [
    { value: "retail", label: "Retail" },
    { value: "food", label: "Food" },
    { value: "service", label: "Service" },
    { value: "office", label: "Office" },
  ],
};

export const getCategoryOptions = (type: ImdfFeatureType): CategoryOption[] =>
  CATEGORY_OPTIONS[type] ?? [];

export const hasCategoryOptions = (type: ImdfFeatureType): boolean =>
  getCategoryOptions(type).length > 0;
