import { getImdfSchemaRule, type SupportedImdfType } from "../../lib/imdf/schema";
import {
  NAVIGATION_NODE_CATEGORIES,
  NAVIGATION_PATH_CATEGORIES,
  type NavigationNodeCategory,
  type NavigationPathCategory,
} from "../../lib/navigation/navigationModel";
import { AppIcon } from "../icons/AppIcon";

export type AddFeatureRequest =
  | { type: SupportedImdfType }
  | { type: "opening"; mode: "node"; category: NavigationNodeCategory }
  | { type: "opening"; mode: "path"; category: NavigationPathCategory };

type AddFeatureButtonGroupsProps = {
  typeCounts?: Map<string, number>;
  disabled?: boolean;
  onCreateFeature: (request: AddFeatureRequest) => void;
};

const ADDABLE_GROUPS: Array<{ title: string; types: SupportedImdfType[] }> = [
  {
    title: "Areas",
    types: ["unit", "section", "geofence", "fixture", "kiosk"],
  },
  {
    title: "Points",
    types: ["amenity", "anchor", "detail", "occupant"],
  },
];

const NODE_LABELS: Record<NavigationNodeCategory, string> = {
  entrance: "Entrance",
  door: "Door",
  stairs: "Stairs",
  elevator: "Elevator",
  escalator: "Escalator",
  revolving_door: "Revolving door",
  exit: "Exit",
};

const EDGE_LABELS: Record<NavigationPathCategory, string> = {
  pedestrian: "Pedestrian path",
  wheelchair: "Wheelchair path",
};

export const AddFeatureButtonGroups = ({
  typeCounts,
  disabled = false,
  onCreateFeature,
}: AddFeatureButtonGroupsProps) => (
  <div className="rounded-box border border-base-300 p-3">
    <div className="mb-2 text-sm font-semibold">Add IMDF feature</div>
    <div className="grid gap-3">
      {ADDABLE_GROUPS.map((group) => (
        <div key={group.title}>
          <div className="mb-1 text-xs text-base-content/60">{group.title}</div>
          <div className="flex flex-wrap gap-2">
            {group.types.map((type) => {
              const rule = getImdfSchemaRule(type);
              return (
                <button
                  key={type}
                  className="btn btn-xs"
                  type="button"
                  onClick={() => onCreateFeature({ type })}
                  disabled={disabled}
                >
                  <AppIcon name={type} />
                  {rule.defaultName} ({typeCounts?.get(type) ?? 0})
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div>
        <div className="mb-1 text-xs text-base-content/60">Navigation Graph</div>
        <div className="mb-1 text-xs text-base-content/60">Navigation Nodes</div>
        <div className="flex flex-wrap gap-2">
          {NAVIGATION_NODE_CATEGORIES.map((category) => (
            <button
              key={category}
              className="btn btn-xs gap-1"
              type="button"
              onClick={() => onCreateFeature({ type: "opening", mode: "node", category })}
              disabled={disabled}
              title={NODE_LABELS[category]}
            >
              <AppIcon name={category} />
              {NODE_LABELS[category]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs text-base-content/60">Navigation Paths</div>
        <div className="flex flex-wrap gap-2">
          {NAVIGATION_PATH_CATEGORIES.map((category) => (
            <button
              key={category}
              className="btn btn-xs gap-1"
              type="button"
              onClick={() => onCreateFeature({ type: "opening", mode: "path", category })}
              disabled={disabled}
              title={EDGE_LABELS[category]}
            >
              <AppIcon name={category} />
              {EDGE_LABELS[category]}
            </button>
          ))}
        </div>
      </div>
    </div>
    {disabled ? (
      <p className="mt-2 text-xs text-base-content/70">
        This feature type cannot contain other features.
      </p>
    ) : (
      <p className="mt-2 text-xs text-base-content/70">
        Use these controls to start geometry creation.
      </p>
    )}
  </div>
);
