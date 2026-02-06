import { createId } from "../../lib/id";
import type { FloorFeature } from "../../lib/types";

export const createFeature = (kind: "point" | "line" | "polygon"): FloorFeature => {
  if (kind === "point") {
    return {
      type: "Feature",
      id: createId(),
      geometry: {
        type: "Point",
        coordinates: [0, 0],
      },
      properties: {
        kind: "amenity",
        name: "New point",
      },
    };
  }

  if (kind === "line") {
    return {
      type: "Feature",
      id: createId(),
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [0.0008, 0.0008],
        ],
      },
      properties: {
        kind: "path",
        name: "New path",
      },
    };
  }

  return {
    type: "Feature",
    id: createId(),
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0.001, 0],
          [0.001, 0.001],
          [0, 0.001],
          [0, 0],
        ],
      ],
    },
    properties: {
      kind: "unit",
      name: "New room",
    },
  };
};
