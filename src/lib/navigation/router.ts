import type { NavigationGraph, RouteResult } from "./types";

type QueueEntry = {
  nodeId: string;
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
  startNodeId: string,
  endNodeId: string,
): RouteResult => {
  const adjacency = new Map<string, Array<{ edgeId: string; to: string; weight: number }>>();
  for (const edge of graph.edges) {
    const fromEntries = adjacency.get(edge.fromNodeId) ?? [];
    fromEntries.push({ edgeId: edge.id, to: edge.toNodeId, weight: edge.weightMeters });
    adjacency.set(edge.fromNodeId, fromEntries);

    const toEntries = adjacency.get(edge.toNodeId) ?? [];
    toEntries.push({ edgeId: edge.id, to: edge.fromNodeId, weight: edge.weightMeters });
    adjacency.set(edge.toNodeId, toEntries);
  }

  const distances = new Map<string, number>();
  const previousNode = new Map<string, string>();
  const previousEdge = new Map<string, string>();
  const visited = new Set<string>();
  const queue: QueueEntry[] = [{ nodeId: startNodeId, distance: 0 }];
  distances.set(startNodeId, 0);

  while (queue.length > 0) {
    const current = dequeueMin(queue);
    if (!current) {
      break;
    }
    if (visited.has(current.nodeId)) {
      continue;
    }
    visited.add(current.nodeId);
    if (current.nodeId === endNodeId) {
      break;
    }

    const neighbors = adjacency.get(current.nodeId) ?? [];
    for (const neighbor of neighbors) {
      if (visited.has(neighbor.to)) {
        continue;
      }
      const nextDistance = current.distance + neighbor.weight;
      const knownDistance = distances.get(neighbor.to) ?? Number.POSITIVE_INFINITY;
      if (nextDistance < knownDistance) {
        distances.set(neighbor.to, nextDistance);
        previousNode.set(neighbor.to, current.nodeId);
        previousEdge.set(neighbor.to, neighbor.edgeId);
        queue.push({ nodeId: neighbor.to, distance: nextDistance });
      }
    }
  }

  if (!distances.has(endNodeId)) {
    return {
      found: false,
      startNodeId,
      endNodeId,
      nodePath: [],
      edgePath: [],
      totalWeightMeters: 0,
    };
  }

  const nodePath: string[] = [endNodeId];
  const edgePath: string[] = [];
  let cursor = endNodeId;
  while (cursor !== startNodeId) {
    const from = previousNode.get(cursor);
    const edge = previousEdge.get(cursor);
    if (!from || !edge) {
      break;
    }
    edgePath.unshift(edge);
    nodePath.unshift(from);
    cursor = from;
  }

  return {
    found: nodePath[0] === startNodeId,
    startNodeId,
    endNodeId,
    nodePath,
    edgePath,
    totalWeightMeters: distances.get(endNodeId) ?? 0,
  };
};
