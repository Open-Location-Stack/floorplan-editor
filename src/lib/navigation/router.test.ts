import { describe, expect, it } from "vitest";
import type { FloorFeature } from "../types";
import { buildPathGraph } from "./pathGraphBuilder";
import { findRouteBetweenPoints, snapPointToNetwork } from "./pointRouting";

describe("path graph + point routing", () => {
  it("builds a graph from opening paths and routes across intersections", () => {
    const features: FloorFeature[] = [
      {
        type: "Feature",
        id: "opening-horizontal",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.09],
            [5.122, 52.09],
          ],
        },
        properties: {
          kind: "opening",
          imdfType: "opening",
          floorId: "f1",
          level_id: "f1",
        },
      },
      {
        type: "Feature",
        id: "opening-vertical",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.121, 52.0895],
            [5.121, 52.0905],
          ],
        },
        properties: {
          kind: "opening",
          imdfType: "opening",
          floorId: "f1",
          level_id: "f1",
        },
      },
    ];

    const graph = buildPathGraph(features);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(5);
    expect(graph.edges.length).toBeGreaterThanOrEqual(4);

    const start: [number, number] = [5.1201, 52.09];
    const end: [number, number] = [5.121, 52.0904];
    const route = findRouteBetweenPoints(graph, start, end);
    expect(route.found).toBe(true);
    expect(route.routeCoordinates.length).toBeGreaterThanOrEqual(2);
    expect(route.totalWeightMeters).toBeGreaterThan(0);
  });

  it("snaps arbitrary points to the nearest path segment", () => {
    const features: FloorFeature[] = [
      {
        type: "Feature",
        id: "opening-main",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.09],
            [5.122, 52.09],
          ],
        },
        properties: {
          kind: "opening",
          imdfType: "opening",
          floorId: "f1",
          level_id: "f1",
        },
      },
    ];

    const graph = buildPathGraph(features);
    const snapped = snapPointToNetwork([5.121, 52.0902], graph);
    expect(snapped).toBeDefined();
    expect(snapped?.coordinate[1]).toBeCloseTo(52.09, 6);
  });

  it("routes across relationship line features", () => {
    const features: FloorFeature[] = [
      {
        type: "Feature",
        id: "relationship-main",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.09],
            [5.122, 52.09],
          ],
        },
        properties: {
          kind: "relationship",
          imdfType: "relationship",
          floorId: "f1",
          level_id: "f1",
        },
      },
    ];

    const graph = buildPathGraph(features);
    const route = findRouteBetweenPoints(graph, [5.1201, 52.0902], [5.1218, 52.0898]);
    expect(route.found).toBe(true);
    expect(route.routeCoordinates.length).toBeGreaterThanOrEqual(2);
  });
});
