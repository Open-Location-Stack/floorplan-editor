import type { Coordinates, FloorFeature } from "../types";
import {
  coordinatesEqual,
  isNavigationEdgeFeature,
  isNavigationNodeFeature,
  readFeatureTypeString,
  readNavigationLevels,
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

const coordinateKey = (coordinate: Coordinates): string =>
  `${Math.round(coordinate[0] / COORDINATE_EPSILON)}:${Math.round(coordinate[1] / COORDINATE_EPSILON)}`;

const interpolate = (from: Coordinates, to: Coordinates, t: number): Coordinates => [
  from[0] + (to[0] - from[0]) * t,
  from[1] + (to[1] - from[1]) * t,
];

const isRoutableLegacyLineType = (type: string): boolean => type === "opening";

const collectOpeningSegments = (features: FloorFeature[]): Segment[] => {
  const segments: Segment[] = [];
  for (const feature of features) {
    if (
      !isRoutableLegacyLineType(readFeatureTypeString(feature)) ||
      feature.geometry.type !== "LineString"
    ) {
      continue;
    }
    const level_id =
      typeof feature.properties.level_id === "string"
        ? feature.properties.level_id
        : feature.properties.floorId;
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

const levelNodeId = (sourceNodeId: string, levelId: string): string => `${sourceNodeId}:${levelId}`;

const buildNavigationFeatureGraph = (features: FloorFeature[]): NavigationGraph => {
  const nodes: NavigationNode[] = [];
  const edges: NavigationEdge[] = [];
  const perLevelNodeBySourceId = new Map<string, Map<string, NavigationNode>>();
  const nodeById = new Map<string, NavigationNode>();
  let edgeIndex = 0;

  for (const feature of features) {
    if (!isNavigationNodeFeature(feature) || feature.geometry.type !== "Point") {
      continue;
    }
    const levels = readNavigationLevels(feature);
    for (const level of levels) {
      const nodeId = levelNodeId(feature.id, level);
      const node: NavigationNode = {
        id: nodeId,
        coordinate: feature.geometry.coordinates,
        floorId: level,
      };
      nodes.push(node);
      nodeById.set(nodeId, node);
      const byLevel = perLevelNodeBySourceId.get(feature.id) ?? new Map<string, NavigationNode>();
      byLevel.set(level, node);
      perLevelNodeBySourceId.set(feature.id, byLevel);
    }
  }

  for (const feature of features) {
    if (!isNavigationEdgeFeature(feature) || feature.geometry.type !== "LineString") {
      continue;
    }
    const levelId =
      typeof feature.properties.level_id === "string"
        ? feature.properties.level_id
        : typeof feature.properties.floorId === "string"
          ? feature.properties.floorId
          : undefined;
    if (!levelId) {
      continue;
    }

    let fromNodeId =
      typeof feature.properties["formation:from_node_id"] === "string"
        ? feature.properties["formation:from_node_id"]
        : undefined;
    let toNodeId =
      typeof feature.properties["formation:to_node_id"] === "string"
        ? feature.properties["formation:to_node_id"]
        : undefined;

    if (!fromNodeId || !toNodeId) {
      const first = feature.geometry.coordinates[0];
      const last = feature.geometry.coordinates[feature.geometry.coordinates.length - 1];
      if (first && last) {
        const sameLevelNodes = nodes.filter((node) => node.floorId === levelId);
        if (!fromNodeId) {
          fromNodeId = sameLevelNodes.find((node) => coordinatesEqual(node.coordinate, first))?.id;
        }
        if (!toNodeId) {
          toNodeId = sameLevelNodes.find((node) => coordinatesEqual(node.coordinate, last))?.id;
        }
      }
    }

    if (!fromNodeId || !toNodeId) {
      continue;
    }

    const fromPerLevel =
      perLevelNodeBySourceId.get(fromNodeId)?.get(levelId) ??
      nodeById.get(levelNodeId(fromNodeId, levelId)) ??
      nodeById.get(fromNodeId);
    const toPerLevel =
      perLevelNodeBySourceId.get(toNodeId)?.get(levelId) ??
      nodeById.get(levelNodeId(toNodeId, levelId)) ??
      nodeById.get(toNodeId);
    if (!fromPerLevel || !toPerLevel) {
      continue;
    }

    edges.push({
      id: `edge-${edgeIndex}`,
      fromNodeId: fromPerLevel.id,
      toNodeId: toPerLevel.id,
      weightMeters: haversineMeters(fromPerLevel.coordinate, toPerLevel.coordinate),
      floorId: levelId,
      coordinates: [fromPerLevel.coordinate, toPerLevel.coordinate],
    });
    edgeIndex += 1;
  }

  for (const feature of features) {
    if (!isNavigationNodeFeature(feature) || feature.geometry.type !== "Point") {
      continue;
    }
    const category = readNavigationNodeCategory(feature);
    if (!category || !VERTICAL_NAVIGATION_NODE_CATEGORIES.has(category)) {
      continue;
    }
    const levels = readNavigationLevels(feature);
    if (levels.length < 2) {
      continue;
    }
    for (let i = 0; i < levels.length; i += 1) {
      for (let j = i + 1; j < levels.length; j += 1) {
        const fromLevel = levels[i];
        const toLevel = levels[j];
        if (!fromLevel || !toLevel) {
          continue;
        }
        const from = perLevelNodeBySourceId.get(feature.id)?.get(fromLevel);
        const to = perLevelNodeBySourceId.get(feature.id)?.get(toLevel);
        if (!from || !to) {
          continue;
        }
        edges.push({
          id: `vertical-edge-${edgeIndex}`,
          fromNodeId: from.id,
          toNodeId: to.id,
          weightMeters: 1,
          coordinates: [from.coordinate, to.coordinate],
        });
        edgeIndex += 1;
      }
    }
  }

  return {
    nodes,
    edges,
  };
};

export const buildPathGraph = (features: FloorFeature[]): NavigationGraph => {
  const hasNavigationModelFeatures = features.some(
    (feature) => isNavigationNodeFeature(feature) || isNavigationEdgeFeature(feature),
  );
  if (hasNavigationModelFeatures) {
    return buildNavigationFeatureGraph(features);
  }
  return buildLegacyOpeningLineGraph(features);
};
