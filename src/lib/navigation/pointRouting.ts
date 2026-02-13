import type { Coordinates } from "../types";
import { findRoute } from "./router";
import type { NavigationEdge, NavigationGraph, PointRouteResult, SnappedPoint } from "./types";

const MAX_SNAP_DISTANCE_METERS = Number.POSITIVE_INFINITY;

const toRadians = (value: number): number => (value * Math.PI) / 180;

const haversineMeters = (from: Coordinates, to: Coordinates): number => {
  const earthRadiusMeters = 6_371_000;
  const latDelta = toRadians(to[1] - from[1]);
  const lngDelta = toRadians(to[0] - from[0]);
  const fromLat = toRadians(from[1]);
  const toLat = toRadians(to[1]);
  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const projectPointToSegment = (
  point: Coordinates,
  from: Coordinates,
  to: Coordinates,
): { t: number; coordinate: Coordinates } => {
  const segmentX = to[0] - from[0];
  const segmentY = to[1] - from[1];
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (segmentLengthSquared === 0) {
    return { t: 0, coordinate: from };
  }

  const pointX = point[0] - from[0];
  const pointY = point[1] - from[1];
  const rawT = (pointX * segmentX + pointY * segmentY) / segmentLengthSquared;
  const t = clamp(rawT, 0, 1);
  return {
    t,
    coordinate: [from[0] + segmentX * t, from[1] + segmentY * t],
  };
};

export const snapPointToNetwork = (
  point: Coordinates,
  graph: NavigationGraph,
  maxSnapDistanceMeters = MAX_SNAP_DISTANCE_METERS,
  floorId?: string,
): SnappedPoint | undefined => {
  let bestMatch:
    | {
        edge: NavigationEdge;
        projected: Coordinates;
        distanceMeters: number;
      }
    | undefined;

  for (const edge of graph.edges) {
    if (floorId && edge.floorId !== floorId) {
      continue;
    }
    const [from, to] = edge.coordinates;
    const projection = projectPointToSegment(point, from, to);
    const distanceMeters = haversineMeters(point, projection.coordinate);
    if (distanceMeters > maxSnapDistanceMeters) {
      continue;
    }
    if (!bestMatch || distanceMeters < bestMatch.distanceMeters) {
      bestMatch = {
        edge,
        projected: projection.coordinate,
        distanceMeters,
      };
    }
  }

  if (!bestMatch) {
    return undefined;
  }

  const fromNode = graph.nodes.find((node) => node.id === bestMatch.edge.fromNodeId);
  const toNode = graph.nodes.find((node) => node.id === bestMatch.edge.toNodeId);
  if (!fromNode || !toNode) {
    return undefined;
  }
  return {
    coordinate: bestMatch.projected,
    edgeId: bestMatch.edge.id,
    fromNodeId: fromNode.id,
    toNodeId: toNode.id,
    distanceFromFromNodeMeters: haversineMeters(fromNode.coordinate, bestMatch.projected),
    distanceFromToNodeMeters: haversineMeters(toNode.coordinate, bestMatch.projected),
    ...(bestMatch.edge.floorId ? { floorId: bestMatch.edge.floorId } : {}),
  };
};

export const findRouteBetweenPoints = (
  graph: NavigationGraph,
  startPoint: Coordinates,
  endPoint: Coordinates,
  floorId?: string,
): PointRouteResult => {
  if (graph.nodes.length === 0 || graph.edges.length === 0) {
    return {
      found: false,
      routeCoordinates: [],
      totalWeightMeters: 0,
      reason: "No path network found.",
    };
  }

  const snappedStart = snapPointToNetwork(startPoint, graph, MAX_SNAP_DISTANCE_METERS, floorId);
  const snappedEnd = snapPointToNetwork(endPoint, graph, MAX_SNAP_DISTANCE_METERS, floorId);
  if (!snappedStart || !snappedEnd) {
    return {
      found: false,
      routeCoordinates: [],
      totalWeightMeters: 0,
      reason: "Could not snap route endpoints to the path network.",
    };
  }

  const startNodeId = `__route-start__:${snappedStart.edgeId}`;
  const endNodeId = `__route-end__:${snappedEnd.edgeId}`;
  const transientNodes = [
    ...graph.nodes,
    {
      id: startNodeId,
      coordinate: snappedStart.coordinate,
      ...(snappedStart.floorId ? { floorId: snappedStart.floorId } : {}),
    },
    {
      id: endNodeId,
      coordinate: snappedEnd.coordinate,
      ...(snappedEnd.floorId ? { floorId: snappedEnd.floorId } : {}),
    },
  ];

  const transientEdges: NavigationEdge[] = [...graph.edges];
  transientEdges.push(
    {
      id: `${startNodeId}:from`,
      fromNodeId: startNodeId,
      toNodeId: snappedStart.fromNodeId,
      weightMeters: snappedStart.distanceFromFromNodeMeters,
      ...(snappedStart.floorId ? { floorId: snappedStart.floorId } : {}),
      coordinates: [
        snappedStart.coordinate,
        transientNodes.find((node) => node.id === snappedStart.fromNodeId)?.coordinate ??
          snappedStart.coordinate,
      ],
    },
    {
      id: `${startNodeId}:to`,
      fromNodeId: startNodeId,
      toNodeId: snappedStart.toNodeId,
      weightMeters: snappedStart.distanceFromToNodeMeters,
      ...(snappedStart.floorId ? { floorId: snappedStart.floorId } : {}),
      coordinates: [
        snappedStart.coordinate,
        transientNodes.find((node) => node.id === snappedStart.toNodeId)?.coordinate ??
          snappedStart.coordinate,
      ],
    },
    {
      id: `${endNodeId}:from`,
      fromNodeId: endNodeId,
      toNodeId: snappedEnd.fromNodeId,
      weightMeters: snappedEnd.distanceFromFromNodeMeters,
      ...(snappedEnd.floorId ? { floorId: snappedEnd.floorId } : {}),
      coordinates: [
        snappedEnd.coordinate,
        transientNodes.find((node) => node.id === snappedEnd.fromNodeId)?.coordinate ??
          snappedEnd.coordinate,
      ],
    },
    {
      id: `${endNodeId}:to`,
      fromNodeId: endNodeId,
      toNodeId: snappedEnd.toNodeId,
      weightMeters: snappedEnd.distanceFromToNodeMeters,
      ...(snappedEnd.floorId ? { floorId: snappedEnd.floorId } : {}),
      coordinates: [
        snappedEnd.coordinate,
        transientNodes.find((node) => node.id === snappedEnd.toNodeId)?.coordinate ??
          snappedEnd.coordinate,
      ],
    },
  );

  if (snappedStart.edgeId === snappedEnd.edgeId) {
    transientEdges.push({
      id: `${startNodeId}:${endNodeId}`,
      fromNodeId: startNodeId,
      toNodeId: endNodeId,
      weightMeters: haversineMeters(snappedStart.coordinate, snappedEnd.coordinate),
      ...(snappedStart.floorId ? { floorId: snappedStart.floorId } : {}),
      coordinates: [snappedStart.coordinate, snappedEnd.coordinate],
    });
  }

  const route = findRoute(
    {
      nodes: transientNodes,
      edges: transientEdges,
    },
    startNodeId,
    endNodeId,
  );
  if (!route.found) {
    return {
      found: false,
      routeCoordinates: [],
      snappedStart: snappedStart.coordinate,
      snappedEnd: snappedEnd.coordinate,
      totalWeightMeters: 0,
      reason: "No route found.",
    };
  }

  const nodeById = new Map(transientNodes.map((node) => [node.id, node]));
  const routeCoordinates = route.nodePath
    .map((nodeId) => nodeById.get(nodeId)?.coordinate)
    .filter((coordinate): coordinate is Coordinates => Boolean(coordinate));

  return {
    found: true,
    routeCoordinates,
    snappedStart: snappedStart.coordinate,
    snappedEnd: snappedEnd.coordinate,
    totalWeightMeters: route.totalWeightMeters,
  };
};
