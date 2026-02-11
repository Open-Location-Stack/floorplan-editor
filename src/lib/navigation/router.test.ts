import { describe, expect, it } from "vitest";
import type { FloorFeature } from "../types";
import { buildNavigationGraph } from "./graphBuilder";
import { findRoute } from "./router";

const makeFeature = (feature: FloorFeature): FloorFeature => feature;

describe("navigation graph + routing", () => {
  it("builds graph from relationships and finds shortest route", () => {
    const features: FloorFeature[] = [
      makeFeature({
        type: "Feature",
        id: "unit-a",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
        properties: { kind: "unit", imdfType: "unit", floorId: "f1", level_id: "f1", name: "A" },
      }),
      makeFeature({
        type: "Feature",
        id: "unit-b",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [2, 0],
              [3, 0],
              [3, 1],
              [2, 1],
              [2, 0],
            ],
          ],
        },
        properties: { kind: "unit", imdfType: "unit", floorId: "f1", level_id: "f1", name: "B" },
      }),
      makeFeature({
        type: "Feature",
        id: "opening-1",
        geometry: {
          type: "LineString",
          coordinates: [
            [1, 0.5],
            [2, 0.5],
          ],
        },
        properties: {
          kind: "opening",
          imdfType: "opening",
          floorId: "f1",
          level_id: "f1",
          category: "door",
        },
      }),
      makeFeature({
        type: "Feature",
        id: "rel-1",
        geometry: {
          type: "LineString",
          coordinates: [
            [1, 0.5],
            [2, 0.5],
          ],
        },
        properties: {
          kind: "relationship",
          imdfType: "relationship",
          floorId: "f1",
          level_id: "f1",
          relation: {
            origin: { featureId: "unit-a" },
            intermediary: { featureId: "opening-1", floorId: "f1" },
            destination: { featureId: "unit-b" },
          },
        },
      }),
    ];

    const graph = buildNavigationGraph(features);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
    expect(graph.edges).toHaveLength(1);

    const route = findRoute(graph, "unit-a", "unit-b");
    expect(route.found).toBe(true);
    expect(route.featurePath).toEqual(["unit-a", "unit-b"]);
    expect(route.edgePath).toEqual(["rel-1"]);
    expect(route.totalWeight).toBeGreaterThan(0);
  });
});
