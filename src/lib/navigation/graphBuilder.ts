import type { FloorFeature } from "../types";
import { buildPathGraph } from "./pathGraphBuilder";
import type { NavigationGraph } from "./types";

export const buildNavigationGraph = (features: FloorFeature[]): NavigationGraph =>
  buildPathGraph(features);
