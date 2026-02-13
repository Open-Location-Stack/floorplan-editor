import { createId } from "../../lib/id";
import type { FloorFeature } from "../../lib/types";

export const createFeature = (kind: "point" | "line" | "polygon"): FloorFeature => {
  if (kind === "point") {
    return {
      type: "Feature",
      id: createId(),
      feature_type: "amenity",
      geometry: {
        type: "Point",
        coordinates: [0, 0],
      },
      properties: {
        name: "New point",
      },
    };
  }

  if (kind === "line") {
    return {
      type: "Feature",
      id: createId(),
      feature_type: "opening",
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [0.0008, 0.0008],
        ],
      },
      properties: {
        name: "New opening",
      },
    };
  }

  return {
    type: "Feature",
    id: createId(),
    feature_type: "unit",
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
      name: "New room",
    },
  };
};
