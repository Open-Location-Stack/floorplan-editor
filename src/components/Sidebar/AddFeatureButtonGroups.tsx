import { getImdfSchemaRule, type SupportedImdfType } from "../../lib/imdf/schema";

type AddFeatureButtonGroupsProps = {
  typeCounts?: Map<string, number>;
  disabled?: boolean;
  onCreateFeature: (type: SupportedImdfType) => void;
};

const ADDABLE_GROUPS: Array<{ title: string; types: SupportedImdfType[] }> = [
  {
    title: "Areas",
    types: ["unit", "section", "geofence"],
  },
  {
    title: "Paths",
    types: ["opening"],
  },
  {
    title: "Points",
    types: ["amenity", "anchor", "detail", "fixture", "kiosk", "occupant"],
  },
];

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
                  onClick={() => onCreateFeature(type)}
                  disabled={disabled}
                >
                  {rule.defaultName} ({typeCounts?.get(type) ?? 0})
                </button>
              );
            })}
          </div>
        </div>
      ))}
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
