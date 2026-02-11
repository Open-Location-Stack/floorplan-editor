import type { NavigationGraph, RouteResult } from "./types";

type QueueEntry = {
  featureId: string;
  distance: number;
};

const dequeueMin = (queue: QueueEntry[]): QueueEntry | undefined => {
  if (queue.length === 0) {
    return undefined;
  }
  let bestIndex = 0;
  let bestDistance = queue[0]?.distance ?? Number.POSITIVE_INFINITY;
  for (let index = 1; index < queue.length; index += 1) {
    const candidateDistance = queue[index]?.distance ?? Number.POSITIVE_INFINITY;
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestIndex = index;
    }
  }
  const [next] = queue.splice(bestIndex, 1);
  return next;
};

export const findRoute = (
  graph: NavigationGraph,
  startFeatureId: string,
  endFeatureId: string,
): RouteResult => {
  const adjacency = new Map<string, Array<{ edgeId: string; to: string; weight: number }>>();
  for (const edge of graph.edges) {
    const fromEntries = adjacency.get(edge.fromFeatureId) ?? [];
    fromEntries.push({ edgeId: edge.id, to: edge.toFeatureId, weight: edge.weight });
    adjacency.set(edge.fromFeatureId, fromEntries);

    const toEntries = adjacency.get(edge.toFeatureId) ?? [];
    toEntries.push({ edgeId: edge.id, to: edge.fromFeatureId, weight: edge.weight });
    adjacency.set(edge.toFeatureId, toEntries);
  }

  const distances = new Map<string, number>();
  const previousNode = new Map<string, string>();
  const previousEdge = new Map<string, string>();
  const visited = new Set<string>();
  const queue: QueueEntry[] = [{ featureId: startFeatureId, distance: 0 }];
  distances.set(startFeatureId, 0);

  while (queue.length > 0) {
    const current = dequeueMin(queue);
    if (!current) {
      break;
    }
    if (visited.has(current.featureId)) {
      continue;
    }
    visited.add(current.featureId);
    if (current.featureId === endFeatureId) {
      break;
    }

    const neighbors = adjacency.get(current.featureId) ?? [];
    for (const neighbor of neighbors) {
      if (visited.has(neighbor.to)) {
        continue;
      }
      const nextDistance = current.distance + neighbor.weight;
      const knownDistance = distances.get(neighbor.to) ?? Number.POSITIVE_INFINITY;
      if (nextDistance < knownDistance) {
        distances.set(neighbor.to, nextDistance);
        previousNode.set(neighbor.to, current.featureId);
        previousEdge.set(neighbor.to, neighbor.edgeId);
        queue.push({ featureId: neighbor.to, distance: nextDistance });
      }
    }
  }

  if (!distances.has(endFeatureId)) {
    return {
      found: false,
      startFeatureId,
      endFeatureId,
      featurePath: [],
      edgePath: [],
      totalWeight: 0,
    };
  }

  const featurePath: string[] = [endFeatureId];
  const edgePath: string[] = [];
  let cursor = endFeatureId;
  while (cursor !== startFeatureId) {
    const from = previousNode.get(cursor);
    const edge = previousEdge.get(cursor);
    if (!from || !edge) {
      break;
    }
    edgePath.unshift(edge);
    featurePath.unshift(from);
    cursor = from;
  }

  return {
    found: featurePath[0] === startFeatureId,
    startFeatureId,
    endFeatureId,
    featurePath,
    edgePath,
    totalWeight: distances.get(endFeatureId) ?? 0,
  };
};
