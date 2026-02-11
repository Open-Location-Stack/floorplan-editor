export type NavigationNode = {
  id: string;
  featureId: string;
  floorId?: string;
  name?: string;
  category?: string;
};

export type NavigationEdge = {
  id: string;
  relationshipFeatureId: string;
  fromFeatureId: string;
  toFeatureId: string;
  intermediaryFeatureId?: string;
  weight: number;
  crossFloor: boolean;
};

export type NavigationGraph = {
  nodes: NavigationNode[];
  edges: NavigationEdge[];
};

export type RouteResult = {
  found: boolean;
  startFeatureId: string;
  endFeatureId: string;
  featurePath: string[];
  edgePath: string[];
  totalWeight: number;
};
