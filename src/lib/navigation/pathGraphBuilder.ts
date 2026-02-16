import type { Coordinates, FloorFeature } from "../types";
import {
  isNavigationNodeOpening,
  isNavigationPathOpening,
  isRelationshipFeature,
  openingRepresentativePoint,
  readNavigationNodeCategory,
  VERTICAL_NAVIGATION_NODE_CATEGORIES,
} from "./navigationModel";
import type { NavigationEdge, NavigationGraph, NavigationNode } from "./types";

const COORDINATE_EPSILON = 1e-7;
const INTERSECTION_EPSILON = 1e-9;

type Segment = {
  id: string;
  level_id?: string;
  from: Coordinates;
  to: Coordinates;
};

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

const readLevelId = (feature: FloorFeature): string | undefined =>
  typeof feature.properties.level_id === "string"
    ? feature.properties.level_id
    : typeof feature.properties.floorId === "string"
      ? feature.properties.floorId
      : undefined;

const readRelationshipRefId = (value: unknown): string | undefined => {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string"
  ) {
    return (value as { id: string }).id;
  }
  return undefined;
};

const lineLengthMeters = (coordinates: Coordinates[]): number => {
  let total = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const from = coordinates[index];
    const to = coordinates[index + 1];
    if (!from || !to) {
      continue;
    }
    total += haversineMeters(from, to);
  }
  return total;
};

const coordinateKey = (coordinate: Coordinates): string =>
  `${Math.round(coordinate[0] / COORDINATE_EPSILON)}:${Math.round(coordinate[1] / COORDINATE_EPSILON)}`;

const interpolate = (from: Coordinates, to: Coordinates, t: number): Coordinates => [
  from[0] + (to[0] - from[0]) * t,
  from[1] + (to[1] - from[1]) * t,
];

const collectOpeningSegments = (features: FloorFeature[]): Segment[] => {
  const segments: Segment[] = [];
  for (const feature of features) {
    const featureType =
      typeof feature.feature_type === "string"
        ? feature.feature_type
        : typeof feature.properties.feature_type === "string"
          ? feature.properties.feature_type
          : typeof feature.properties.kind === "string"
            ? feature.properties.kind
            : "";
    if (featureType !== "opening" || feature.geometry.type !== "LineString") {
      continue;
    }
    const level_id = readLevelId(feature);
    for (let index = 0; index < feature.geometry.coordinates.length - 1; index += 1) {
      const from = feature.geometry.coordinates[index];
      const to = feature.geometry.coordinates[index + 1];
      if (!from || !to) {
        continue;
      }
      segments.push({
        id: `${feature.id}:${index}`,
        from,
        to,
        ...(level_id ? { level_id } : {}),
      });
    }
  }
  return segments;
};

const findIntersection = (
  a1: Coordinates,
  a2: Coordinates,
  b1: Coordinates,
  b2: Coordinates,
): { aT: number; bT: number; coordinate: Coordinates } | undefined => {
  const rX = a2[0] - a1[0];
  const rY = a2[1] - a1[1];
  const sX = b2[0] - b1[0];
  const sY = b2[1] - b1[1];
  const denominator = rX * sY - rY * sX;
  if (Math.abs(denominator) < INTERSECTION_EPSILON) {
    return undefined;
  }

  const qpx = b1[0] - a1[0];
  const qpy = b1[1] - a1[1];
  const t = (qpx * sY - qpy * sX) / denominator;
  const u = (qpx * rY - qpy * rX) / denominator;
  if (
    t < -INTERSECTION_EPSILON ||
    t > 1 + INTERSECTION_EPSILON ||
    u < -INTERSECTION_EPSILON ||
    u > 1 + INTERSECTION_EPSILON
  ) {
    return undefined;
  }

  return {
    aT: Math.max(0, Math.min(1, t)),
    bT: Math.max(0, Math.min(1, u)),
    coordinate: interpolate(a1, a2, t),
  };
};

const buildLegacyOpeningLineGraph = (features: FloorFeature[]): NavigationGraph => {
  const segments = collectOpeningSegments(features);
  const splitPointsBySegment = new Map<string, number[]>();
  for (const segment of segments) {
    splitPointsBySegment.set(segment.id, [0, 1]);
  }

  for (let leftIndex = 0; leftIndex < segments.length; leftIndex += 1) {
    const left = segments[leftIndex];
    if (!left) {
      continue;
    }
    for (let rightIndex = leftIndex + 1; rightIndex < segments.length; rightIndex += 1) {
      const right = segments[rightIndex];
      if (!right || left.level_id !== right.level_id) {
        continue;
      }
      const intersection = findIntersection(left.from, left.to, right.from, right.to);
      if (!intersection) {
        continue;
      }
      splitPointsBySegment.get(left.id)?.push(intersection.aT);
      splitPointsBySegment.get(right.id)?.push(intersection.bT);
    }
  }

  const nodeByKey = new Map<string, NavigationNode>();
  const edges: NavigationEdge[] = [];
  let edgeIndex = 0;

  for (const segment of segments) {
    const splitPoints = splitPointsBySegment.get(segment.id) ?? [0, 1];
    const sortedUnique = [...splitPoints]
      .sort((left, right) => left - right)
      .filter(
        (value, index, all) =>
          index === 0 ||
          (all[index - 1] !== undefined &&
            Math.abs(value - (all[index - 1] ?? 0)) > INTERSECTION_EPSILON),
      );

    for (let index = 0; index < sortedUnique.length - 1; index += 1) {
      const fromT = sortedUnique[index];
      const toT = sortedUnique[index + 1];
      if (
        fromT === undefined ||
        toT === undefined ||
        Math.abs(toT - fromT) < INTERSECTION_EPSILON
      ) {
        continue;
      }
      const fromCoordinate = interpolate(segment.from, segment.to, fromT);
      const toCoordinate = interpolate(segment.from, segment.to, toT);
      const distance = haversineMeters(fromCoordinate, toCoordinate);
      if (!Number.isFinite(distance) || distance <= 0.001) {
        continue;
      }

      const fromKey = coordinateKey(fromCoordinate);
      const toKey = coordinateKey(toCoordinate);
      if (!nodeByKey.has(fromKey)) {
        nodeByKey.set(fromKey, {
          id: fromKey,
          coordinate: fromCoordinate,
          ...(segment.level_id ? { floorId: segment.level_id } : {}),
        });
      }
      if (!nodeByKey.has(toKey)) {
        nodeByKey.set(toKey, {
          id: toKey,
          coordinate: toCoordinate,
          ...(segment.level_id ? { floorId: segment.level_id } : {}),
        });
      }

      edges.push({
        id: `legacy-edge-${edgeIndex}`,
        fromNodeId: fromKey,
        toNodeId: toKey,
        weightMeters: distance,
        ...(segment.level_id ? { floorId: segment.level_id } : {}),
        coordinates: [fromCoordinate, toCoordinate],
      });
      edgeIndex += 1;
    }
  }

  return {
    nodes: [...nodeByKey.values()],
    edges,
  };
};

const buildImdfOpeningRelationshipGraph = (features: FloorFeature[]): NavigationGraph => {
  const nodes: NavigationNode[] = [];
  const edges: NavigationEdge[] = [];
  const nodeById = new Map<string, NavigationNode>();
  let edgeIndex = 0;

  const navigationNodes = features.filter(isNavigationNodeOpening);
  const navigationPaths = features.filter(isNavigationPathOpening);

  for (const feature of navigationNodes) {
    const point = openingRepresentativePoint(feature);
    if (!point) {
      continue;
    }
    const levelId = readLevelId(feature);
    const node: NavigationNode = {
      id: feature.id,
      coordinate: point,
      ...(levelId ? { floorId: levelId } : {}),
    };
    nodes.push(node);
    nodeById.set(feature.id, node);
  }

  for (const pathFeature of navigationPaths) {
    if (pathFeature.geometry.type !== "LineString") {
      continue;
    }
    const levelId = readLevelId(pathFeature);
    if (!levelId) {
      continue;
    }
    const linkedNodeIds = features
      .filter(isRelationshipFeature)
      .map((relationship) => {
        const origin = readRelationshipRefId(relationship.properties.origin);
        const destination = readRelationshipRefId(relationship.properties.destination);
        if (origin === pathFeature.id && destination) {
          return destination;
        }
        if (destination === pathFeature.id && origin) {
          return origin;
        }
        return undefined;
      })
      .filter((id): id is string => Boolean(id))
      .filter((id) => nodeById.has(id));

    if (linkedNodeIds.length < 2) {
      continue;
    }

    const start = pathFeature.geometry.coordinates[0];
    const end = pathFeature.geometry.coordinates[pathFeature.geometry.coordinates.length - 1];
    if (!start || !end) {
      continue;
    }

    const uniqueNodeIds = [...new Set(linkedNodeIds)];
    const byStart = [...uniqueNodeIds].sort((left, right) => {
      const leftPoint = nodeById.get(left)?.coordinate ?? start;
      const rightPoint = nodeById.get(right)?.coordinate ?? start;
      return (
        Math.hypot(start[0] - leftPoint[0], start[1] - leftPoint[1]) -
        Math.hypot(start[0] - rightPoint[0], start[1] - rightPoint[1])
      );
    });
    const fromNodeId = byStart[0];
    const remaining = uniqueNodeIds.filter((id) => id !== fromNodeId);
    const byEnd = [...remaining].sort((left, right) => {
      const leftPoint = nodeById.get(left)?.coordinate ?? end;
      const rightPoint = nodeById.get(right)?.coordinate ?? end;
      return (
        Math.hypot(end[0] - leftPoint[0], end[1] - leftPoint[1]) -
        Math.hypot(end[0] - rightPoint[0], end[1] - rightPoint[1])
      );
    });
    const toNodeId = byEnd[0];

    if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
      continue;
    }

    const fromNode = nodeById.get(fromNodeId);
    const toNode = nodeById.get(toNodeId);
    if (!fromNode || !toNode) {
      continue;
    }

    edges.push({
      id: `opening-edge-${edgeIndex}`,
      fromNodeId,
      toNodeId,
      weightMeters: Math.max(0.001, lineLengthMeters(pathFeature.geometry.coordinates)),
      floorId: levelId,
      coordinates: [fromNode.coordinate, toNode.coordinate],
    });
    edgeIndex += 1;
  }

  for (const relationship of features.filter(isRelationshipFeature)) {
    const origin = readRelationshipRefId(relationship.properties.origin);
    const destination = readRelationshipRefId(relationship.properties.destination);
    if (!origin || !destination || origin === destination) {
      continue;
    }
    const fromNode = nodeById.get(origin);
    const toNode = nodeById.get(destination);
    if (!fromNode || !toNode) {
      continue;
    }
    const originFeature = navigationNodes.find((feature) => feature.id === origin);
    const destinationFeature = navigationNodes.find((feature) => feature.id === destination);
    const originCategory = originFeature ? readNavigationNodeCategory(originFeature) : undefined;
    const destinationCategory = destinationFeature
      ? readNavigationNodeCategory(destinationFeature)
      : undefined;
    if (
      !originCategory ||
      !destinationCategory ||
      !VERTICAL_NAVIGATION_NODE_CATEGORIES.has(originCategory) ||
      !VERTICAL_NAVIGATION_NODE_CATEGORIES.has(destinationCategory)
    ) {
      continue;
    }
    if (fromNode.floorId === toNode.floorId) {
      continue;
    }

    edges.push({
      id: `vertical-edge-${edgeIndex}`,
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      weightMeters: 1,
      coordinates: [fromNode.coordinate, toNode.coordinate],
    });
    edgeIndex += 1;
  }

  return { nodes, edges };
};

const mergeNavigationGraphs = (
  primary: NavigationGraph,
  secondary: NavigationGraph,
): NavigationGraph => {
  const nodeById = new Map<string, NavigationNode>();
  for (const node of primary.nodes) {
    nodeById.set(node.id, node);
  }
  for (const node of secondary.nodes) {
    if (!nodeById.has(node.id)) {
      nodeById.set(node.id, node);
    }
  }

  const edgeIds = new Set(primary.edges.map((edge) => edge.id));
  const edges = [...primary.edges];
  for (const edge of secondary.edges) {
    if (!edgeIds.has(edge.id)) {
      edges.push(edge);
      edgeIds.add(edge.id);
    }
  }

  return {
    nodes: [...nodeById.values()],
    edges,
  };
};

export const buildPathGraph = (features: FloorFeature[]): NavigationGraph => {
  const openingGraph = buildLegacyOpeningLineGraph(features);
  const hasImdfNavigationFeatures = features.some(
    (feature) => isNavigationNodeOpening(feature) || isNavigationPathOpening(feature),
  );
  if (!hasImdfNavigationFeatures) {
    return openingGraph;
  }

  const imdfGraph = buildImdfOpeningRelationshipGraph(features);
  return mergeNavigationGraphs(openingGraph, imdfGraph);
};
