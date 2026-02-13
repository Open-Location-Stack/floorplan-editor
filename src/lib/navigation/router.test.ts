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

  it("does not route across relationship features because paths use openings", () => {
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
    expect(route.found).toBe(false);
  });

  it("builds graph from IMDF openings and relationships across levels", () => {
    const features: FloorFeature[] = [
      {
        type: "Feature",
        id: "stairs-a",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.1199, 52.09],
            [5.1201, 52.09],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          category: "stairs",
        },
      },
      {
        type: "Feature",
        id: "f1-node",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.1209, 52.09],
            [5.1211, 52.09],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          category: "entrance",
        },
      },
      {
        type: "Feature",
        id: "f2-node",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.1209, 52.0905],
            [5.1211, 52.0905],
          ],
        },
        properties: {
          level_id: "f2",
          floorId: "f2",
          category: "entrance",
        },
      },
      {
        type: "Feature",
        id: "stairs-b",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.1199, 52.0905],
            [5.1201, 52.0905],
          ],
        },
        properties: {
          level_id: "f2",
          floorId: "f2",
          category: "stairs",
        },
      },
      {
        type: "Feature",
        id: "edge-f1",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.121, 52.09],
            [5.12, 52.09],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          category: "pedestrian",
        },
      },
      {
        type: "Feature",
        id: "edge-f2",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.0905],
            [5.121, 52.0905],
          ],
        },
        properties: {
          level_id: "f2",
          floorId: "f2",
          category: "pedestrian",
        },
      },
      {
        type: "Feature",
        id: "rel-edge-f1-a",
        feature_type: "relationship",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.121, 52.09],
            [5.12, 52.09],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          direction: "undirected",
          origin: { id: "edge-f1", feature_type: "opening" },
          destination: { id: "f1-node", feature_type: "opening" },
        },
      },
      {
        type: "Feature",
        id: "rel-edge-f1-b",
        feature_type: "relationship",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.121, 52.09],
            [5.12, 52.09],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          direction: "undirected",
          origin: { id: "edge-f1", feature_type: "opening" },
          destination: { id: "stairs-a", feature_type: "opening" },
        },
      },
      {
        type: "Feature",
        id: "rel-edge-f2-a",
        feature_type: "relationship",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.0905],
            [5.121, 52.0905],
          ],
        },
        properties: {
          level_id: "f2",
          floorId: "f2",
          direction: "undirected",
          origin: { id: "edge-f2", feature_type: "opening" },
          destination: { id: "stairs-b", feature_type: "opening" },
        },
      },
      {
        type: "Feature",
        id: "rel-edge-f2-b",
        feature_type: "relationship",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.0905],
            [5.121, 52.0905],
          ],
        },
        properties: {
          level_id: "f2",
          floorId: "f2",
          direction: "undirected",
          origin: { id: "edge-f2", feature_type: "opening" },
          destination: { id: "f2-node", feature_type: "opening" },
        },
      },
      {
        type: "Feature",
        id: "rel-vertical",
        feature_type: "relationship",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.09],
            [5.12, 52.0905],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          direction: "undirected",
          origin: { id: "stairs-a", feature_type: "opening" },
          destination: { id: "stairs-b", feature_type: "opening" },
        },
      },
    ];

    const graph = buildPathGraph(features);
    const route = findRouteBetweenPoints(graph, [5.121, 52.09], [5.121, 52.0905], "f1");
    expect(route.found).toBe(true);
  });
});
