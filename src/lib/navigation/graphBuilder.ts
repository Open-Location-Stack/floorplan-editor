import type { FloorFeature } from "../types";
import type { NavigationEdge, NavigationGraph, NavigationNode } from "./types";

const toRadians = (value: number): number => (value * Math.PI) / 180;

const haversineMeters = (from: [number, number], to: [number, number]): number => {
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

const lineLengthMeters = (feature: FloorFeature): number => {
  if (feature.geometry.type !== "LineString" || feature.geometry.coordinates.length < 2) {
    return 1;
  }
  let total = 0;
  for (let index = 0; index < feature.geometry.coordinates.length - 1; index += 1) {
    const from = feature.geometry.coordinates[index];
    const to = feature.geometry.coordinates[index + 1];
    if (!from || !to) {
      continue;
    }
    total += haversineMeters(from, to);
  }
  return Math.max(total, 1);
};

const resolveRelationshipRefs = (feature: FloorFeature) => {
  const relation = feature.properties.relation;
  const origin =
    relation?.origin?.featureId ??
    (typeof feature.properties.origin === "string" ? feature.properties.origin : undefined) ??
    (typeof feature.properties.origin_id === "string" ? feature.properties.origin_id : undefined);
  const intermediary =
    relation?.intermediary?.featureId ??
    (typeof feature.properties.intermediary === "string"
      ? feature.properties.intermediary
      : undefined) ??
    (typeof feature.properties.intermediary_id === "string"
      ? feature.properties.intermediary_id
      : undefined);
  const destination =
    relation?.destination?.featureId ??
    (typeof feature.properties.destination === "string"
      ? feature.properties.destination
      : undefined) ??
    (typeof feature.properties.destination_id === "string"
      ? feature.properties.destination_id
      : undefined);
  return { origin, intermediary, destination };
};

const buildNode = (feature: FloorFeature): NavigationNode => ({
  id: feature.id,
  featureId: feature.id,
  ...(feature.properties.floorId ? { floorId: feature.properties.floorId } : {}),
  ...(typeof feature.properties.name === "string" ? { name: feature.properties.name } : {}),
  ...(typeof feature.properties.category === "string"
    ? { category: feature.properties.category }
    : {}),
});

export const buildNavigationGraph = (features: FloorFeature[]): NavigationGraph => {
  const featureById = new Map(features.map((feature) => [feature.id, feature]));
  const nodeById = new Map<string, NavigationNode>();
  const edges: NavigationEdge[] = [];
  const relationships = features.filter((feature) => {
    const type =
      typeof feature.properties.imdfType === "string"
        ? feature.properties.imdfType
        : feature.properties.kind;
    return type === "relationship";
  });

  for (const relationship of relationships) {
    const refs = resolveRelationshipRefs(relationship);
    if (!refs.origin || !refs.destination) {
      continue;
    }
    const originFeature = featureById.get(refs.origin);
    const destinationFeature = featureById.get(refs.destination);
    if (!originFeature || !destinationFeature) {
      continue;
    }

    if (!nodeById.has(originFeature.id)) {
      nodeById.set(originFeature.id, buildNode(originFeature));
    }
    if (!nodeById.has(destinationFeature.id)) {
      nodeById.set(destinationFeature.id, buildNode(destinationFeature));
    }
    if (refs.intermediary) {
      const intermediaryFeature = featureById.get(refs.intermediary);
      if (intermediaryFeature && !nodeById.has(intermediaryFeature.id)) {
        nodeById.set(intermediaryFeature.id, buildNode(intermediaryFeature));
      }
    }

    const crossFloor = originFeature.properties.floorId !== destinationFeature.properties.floorId;
    const verticalPenalty =
      crossFloor &&
      refs.intermediary &&
      (() => {
        const intermediaryFeature = featureById.get(refs.intermediary);
        const category = intermediaryFeature?.properties.category;
        if (category === "elevator") {
          return 10;
        }
        if (category === "stairs") {
          return 25;
        }
        if (category === "escalator") {
          return 15;
        }
        return 20;
      })();

    const edge: NavigationEdge = {
      id: relationship.id,
      relationshipFeatureId: relationship.id,
      fromFeatureId: originFeature.id,
      toFeatureId: destinationFeature.id,
      weight: lineLengthMeters(relationship) + (verticalPenalty || 0),
      crossFloor,
      ...(refs.intermediary ? { intermediaryFeatureId: refs.intermediary } : {}),
    };
    edges.push(edge);
  }

  return {
    nodes: [...nodeById.values()],
    edges,
  };
};
