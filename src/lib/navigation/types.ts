import type { Coordinates } from "../types";

export type NavigationNode = {
  id: string;
  coordinate: Coordinates;
  floorId?: string;
};

export type NavigationEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  weightMeters: number;
  floorId?: string;
  coordinates: [Coordinates, Coordinates];
};

export type NavigationGraph = {
  nodes: NavigationNode[];
  edges: NavigationEdge[];
};

export type RouteResult = {
  found: boolean;
  startNodeId: string;
  endNodeId: string;
  nodePath: string[];
  edgePath: string[];
  totalWeightMeters: number;
};

export type SnappedPoint = {
  coordinate: Coordinates;
  edgeId: string;
  floorId?: string;
  fromNodeId: string;
  toNodeId: string;
  distanceFromFromNodeMeters: number;
  distanceFromToNodeMeters: number;
};

export type PointRouteResult = {
  found: boolean;
  routeCoordinates: Coordinates[];
  snappedStart?: Coordinates;
  snappedEnd?: Coordinates;
  totalWeightMeters: number;
  reason?: string;
};
