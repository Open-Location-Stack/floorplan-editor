import { describe, expect, it } from "vitest";
import type { FloorFeature } from "../types";
import { buildPathGraph } from "./pathGraphBuilder";
import { findRouteBetweenPoints, snapPointToNetwork } from "./pointRouting";
import { findRoute } from "./router";

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

  it("routes through raw opening vertices when IMDF relationship metadata is incomplete", () => {
    const features: FloorFeature[] = [
      {
        type: "Feature",
        id: "door-node",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.09],
            [5.12002, 52.09],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          category: "door",
        },
      },
      {
        type: "Feature",
        id: "route-direct-1",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.09],
            [5.121, 52.09],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          category: "corridor",
        },
      },
      {
        type: "Feature",
        id: "route-direct-2",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.121, 52.09],
            [5.122, 52.09],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          category: "corridor",
        },
      },
      {
        type: "Feature",
        id: "route-detour-1",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.09],
            [5.12, 52.0907],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          category: "corridor",
        },
      },
      {
        type: "Feature",
        id: "route-detour-2",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.0907],
            [5.122, 52.0907],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          category: "corridor",
        },
      },
      {
        type: "Feature",
        id: "route-detour-3",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.122, 52.0907],
            [5.122, 52.09],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          category: "corridor",
        },
      },
    ];

    const graph = buildPathGraph(features);
    const route = findRouteBetweenPoints(graph, [5.12001, 52.09], [5.12199, 52.09], "f1");
    expect(route.found).toBe(true);
    expect(
      route.routeCoordinates.some(
        (coordinate) => coordinate[0] === 5.121 && coordinate[1] === 52.09,
      ),
    ).toBe(true);
    expect(route.totalWeightMeters).toBeLessThan(260);
  });

  it("routes across three levels through elevator opening relationships", () => {
    const features: FloorFeature[] = [
      {
        type: "Feature",
        id: "elevator-f1",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.1199, 52.0901],
            [5.1201, 52.0901],
          ],
        },
        properties: { level_id: "f1", floorId: "f1", category: "elevator" },
      },
      {
        type: "Feature",
        id: "elevator-f2",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.1199, 52.0905],
            [5.1201, 52.0905],
          ],
        },
        properties: { level_id: "f2", floorId: "f2", category: "elevator" },
      },
      {
        type: "Feature",
        id: "elevator-f3",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.1199, 52.0909],
            [5.1201, 52.0909],
          ],
        },
        properties: { level_id: "f3", floorId: "f3", category: "elevator" },
      },
      {
        type: "Feature",
        id: "start-node-f1",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.1209, 52.0901],
            [5.1211, 52.0901],
          ],
        },
        properties: { level_id: "f1", floorId: "f1", category: "door" },
      },
      {
        type: "Feature",
        id: "end-node-f3",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.1209, 52.0909],
            [5.1211, 52.0909],
          ],
        },
        properties: { level_id: "f3", floorId: "f3", category: "door" },
      },
      {
        type: "Feature",
        id: "edge-f1",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.121, 52.0901],
            [5.12, 52.0901],
          ],
        },
        properties: { level_id: "f1", floorId: "f1", category: "pedestrian" },
      },
      {
        type: "Feature",
        id: "edge-f3",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.0909],
            [5.121, 52.0909],
          ],
        },
        properties: { level_id: "f3", floorId: "f3", category: "pedestrian" },
      },
      {
        type: "Feature",
        id: "rel-f1-start",
        feature_type: "relationship",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.0901],
            [5.121, 52.0901],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          direction: "undirected",
          origin: { id: "edge-f1", feature_type: "opening" },
          destination: { id: "start-node-f1", feature_type: "opening" },
        },
      },
      {
        type: "Feature",
        id: "rel-f1-elevator",
        feature_type: "relationship",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.0901],
            [5.121, 52.0901],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          direction: "undirected",
          origin: { id: "edge-f1", feature_type: "opening" },
          destination: { id: "elevator-f1", feature_type: "opening" },
        },
      },
      {
        type: "Feature",
        id: "rel-f3-elevator",
        feature_type: "relationship",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.0909],
            [5.121, 52.0909],
          ],
        },
        properties: {
          level_id: "f3",
          floorId: "f3",
          direction: "undirected",
          origin: { id: "edge-f3", feature_type: "opening" },
          destination: { id: "elevator-f3", feature_type: "opening" },
        },
      },
      {
        type: "Feature",
        id: "rel-f3-end",
        feature_type: "relationship",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.0909],
            [5.121, 52.0909],
          ],
        },
        properties: {
          level_id: "f3",
          floorId: "f3",
          direction: "undirected",
          origin: { id: "edge-f3", feature_type: "opening" },
          destination: { id: "end-node-f3", feature_type: "opening" },
        },
      },
      {
        type: "Feature",
        id: "rel-elevator-f1-f2",
        feature_type: "relationship",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.0901],
            [5.12, 52.0905],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          direction: "undirected",
          origin: { id: "elevator-f1", feature_type: "opening" },
          destination: { id: "elevator-f2", feature_type: "opening" },
        },
      },
      {
        type: "Feature",
        id: "rel-elevator-f2-f3",
        feature_type: "relationship",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.0905],
            [5.12, 52.0909],
          ],
        },
        properties: {
          level_id: "f2",
          floorId: "f2",
          direction: "undirected",
          origin: { id: "elevator-f2", feature_type: "opening" },
          destination: { id: "elevator-f3", feature_type: "opening" },
        },
      },
    ];

    const graph = buildPathGraph(features);
    const route = findRoute(graph, "start-node-f1", "end-node-f3");
    expect(route.found).toBe(true);
    expect(route.totalWeightMeters).toBeGreaterThan(0);
  });

  it("does not route across levels when elevator connector relationship is missing", () => {
    const features: FloorFeature[] = [
      {
        type: "Feature",
        id: "elevator-f1",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.1199, 52.0901],
            [5.1201, 52.0901],
          ],
        },
        properties: { level_id: "f1", floorId: "f1", category: "elevator" },
      },
      {
        type: "Feature",
        id: "elevator-f2",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.1199, 52.0905],
            [5.1201, 52.0905],
          ],
        },
        properties: { level_id: "f2", floorId: "f2", category: "elevator" },
      },
      {
        type: "Feature",
        id: "start-corridor",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.0901],
            [5.121, 52.0901],
          ],
        },
        properties: { level_id: "f1", floorId: "f1", category: "pedestrian" },
      },
      {
        type: "Feature",
        id: "end-corridor",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.0905],
            [5.121, 52.0905],
          ],
        },
        properties: { level_id: "f2", floorId: "f2", category: "pedestrian" },
      },
      {
        type: "Feature",
        id: "rel-start",
        feature_type: "relationship",
        geometry: {
          type: "LineString",
          coordinates: [
            [5.12, 52.0901],
            [5.121, 52.0901],
          ],
        },
        properties: {
          level_id: "f1",
          floorId: "f1",
          direction: "undirected",
          origin: { id: "start-corridor", feature_type: "opening" },
          destination: { id: "elevator-f1", feature_type: "opening" },
        },
      },
      {
        type: "Feature",
        id: "rel-end",
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
          origin: { id: "end-corridor", feature_type: "opening" },
          destination: { id: "elevator-f2", feature_type: "opening" },
        },
      },
    ];

    const graph = buildPathGraph(features);
    const route = findRouteBetweenPoints(graph, [5.121, 52.0901], [5.121, 52.0905]);
    expect(route.found).toBe(false);
  });
});
