import type { Coordinates, FloorFeature } from "../types";
import type { NavigationEdge, NavigationGraph, NavigationNode } from "./types";

const COORDINATE_EPSILON = 1e-7;
const INTERSECTION_EPSILON = 1e-9;

type Segment = {
  id: string;
  floorId?: string;
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

const coordinateKey = (coordinate: Coordinates): string =>
  `${Math.round(coordinate[0] / COORDINATE_EPSILON)}:${Math.round(coordinate[1] / COORDINATE_EPSILON)}`;

const interpolate = (from: Coordinates, to: Coordinates, t: number): Coordinates => [
  from[0] + (to[0] - from[0]) * t,
  from[1] + (to[1] - from[1]) * t,
];

const classifyFeatureType = (feature: FloorFeature): string =>
  typeof feature.properties.imdfType === "string"
    ? feature.properties.imdfType
    : feature.properties.kind;

const isRoutableLineType = (type: string): boolean => type === "opening" || type === "relationship";

const collectOpeningSegments = (features: FloorFeature[]): Segment[] => {
  const segments: Segment[] = [];
  for (const feature of features) {
    if (
      !isRoutableLineType(classifyFeatureType(feature)) ||
      feature.geometry.type !== "LineString"
    ) {
      continue;
    }
    const floorId = feature.properties.floorId;
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
        ...(floorId ? { floorId } : {}),
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

export const buildPathGraph = (features: FloorFeature[]): NavigationGraph => {
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
      if (!right || left.floorId !== right.floorId) {
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
          ...(segment.floorId ? { floorId: segment.floorId } : {}),
        });
      }
      if (!nodeByKey.has(toKey)) {
        nodeByKey.set(toKey, {
          id: toKey,
          coordinate: toCoordinate,
          ...(segment.floorId ? { floorId: segment.floorId } : {}),
        });
      }

      edges.push({
        id: `edge-${edgeIndex}`,
        fromNodeId: fromKey,
        toNodeId: toKey,
        weightMeters: distance,
        ...(segment.floorId ? { floorId: segment.floorId } : {}),
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
