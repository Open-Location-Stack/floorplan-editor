import { useMemo } from "react";
import type {
  Floor,
  FloorFeature,
  RelationshipFeatureRef,
  RelationshipRefs,
} from "../../../lib/types";
import { GenericImdfFeatureEditor, type ImdfFeatureEditorProps } from "./GenericImdfFeatureEditor";

type RelationshipFeatureEditorProps = ImdfFeatureEditorProps & {
  allFeatures: FloorFeature[];
  floors: Floor[];
};

const distanceSquared = (left: [number, number], right: [number, number]): number =>
  (left[0] - right[0]) * (left[0] - right[0]) + (left[1] - right[1]) * (left[1] - right[1]);

const nearestFeatureRef = (
  target: [number, number],
  candidates: FloorFeature[],
): RelationshipFeatureRef | undefined => {
  let nearest: FloorFeature | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate.geometry.type !== "Point") {
      continue;
    }
    const distance = distanceSquared(target, candidate.geometry.coordinates);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  if (!nearest) {
    return undefined;
  }
  return nearest.properties.floorId
    ? {
        featureId: nearest.id,
        floorId: nearest.properties.floorId,
      }
    : {
        featureId: nearest.id,
      };
};

export const RelationshipFeatureEditor = ({
  feature,
  allFeatures,
  floors,
  onUpdateProperty,
  ...props
}: RelationshipFeatureEditorProps) => {
  const currentRefs = feature.properties.relation;
  const currentFloorId = feature.properties.floorId;
  const relationshipCandidates = useMemo(
    () =>
      allFeatures.filter((candidate) => {
        const type =
          typeof candidate.properties.imdfType === "string"
            ? candidate.properties.imdfType
            : candidate.properties.kind;
        return type === "opening" || type === "unit" || type === "anchor" || type === "amenity";
      }),
    [allFeatures],
  );

  const setRelationRefs = (refs: RelationshipRefs) => {
    onUpdateProperty("relation", JSON.stringify(refs));
    onUpdateProperty("origin", refs.origin.featureId);
    onUpdateProperty("intermediary", refs.intermediary.featureId);
    onUpdateProperty("destination", refs.destination.featureId);
    onUpdateProperty("origin_id", refs.origin.featureId);
    onUpdateProperty("intermediary_id", refs.intermediary.featureId);
    onUpdateProperty("destination_id", refs.destination.featureId);
  };

  const updateRef = (key: keyof RelationshipRefs, featureId: string) => {
    const existing = currentRefs ?? {
      origin: { featureId: "" },
      intermediary: { featureId: "" },
      destination: { featureId: "" },
    };
    const targetFeature = allFeatures.find((candidate) => candidate.id === featureId);
    const next: RelationshipRefs = {
      ...existing,
      [key]: targetFeature?.properties.floorId
        ? {
            featureId,
            floorId: targetFeature.properties.floorId,
          }
        : {
            featureId,
          },
    };
    setRelationRefs(next);
  };

  return (
    <div className="grid gap-3">
      <GenericImdfFeatureEditor
        {...props}
        feature={feature}
        type="relationship"
        onUpdateProperty={(key, value) => {
          if (key === "origin" || key === "origin_id") {
            updateRef("origin", value);
            return;
          }
          if (key === "intermediary" || key === "intermediary_id") {
            updateRef("intermediary", value);
            return;
          }
          if (key === "destination" || key === "destination_id") {
            updateRef("destination", value);
            return;
          }
          onUpdateProperty(key, value);
        }}
      />
      <section className="card bg-base-100 shadow">
        <div className="card-body gap-3">
          <h3 className="font-semibold">Relationship graph refs</h3>
          {(["origin", "intermediary", "destination"] as const).map((key) => (
            <label className="form-control gap-1" key={key}>
              <span className="label-text">{key}</span>
              <select
                className="select select-bordered select-sm"
                value={currentRefs?.[key]?.featureId ?? ""}
                onChange={(event) => updateRef(key, event.currentTarget.value)}
              >
                <option value="">Select feature</option>
                {relationshipCandidates.map((candidate) => {
                  const floorName =
                    floors.find((floor) => floor.id === candidate.properties.floorId)?.name ??
                    "unknown";
                  const type =
                    typeof candidate.properties.imdfType === "string"
                      ? candidate.properties.imdfType
                      : candidate.properties.kind;
                  return (
                    <option key={candidate.id} value={candidate.id}>
                      [{floorName}] {candidate.properties.name ?? candidate.id} ({type})
                    </option>
                  );
                })}
              </select>
            </label>
          ))}
          <button
            className="btn btn-sm btn-outline"
            type="button"
            disabled={feature.geometry.type !== "LineString"}
            onClick={() => {
              if (feature.geometry.type !== "LineString") {
                return;
              }
              const start = feature.geometry.coordinates[0];
              const end = feature.geometry.coordinates[feature.geometry.coordinates.length - 1];
              if (!start || !end) {
                return;
              }
              const openingCandidates = relationshipCandidates.filter((candidate) => {
                const type =
                  typeof candidate.properties.imdfType === "string"
                    ? candidate.properties.imdfType
                    : candidate.properties.kind;
                return type === "opening";
              });
              const otherCandidates = relationshipCandidates.filter((candidate) => {
                const type =
                  typeof candidate.properties.imdfType === "string"
                    ? candidate.properties.imdfType
                    : candidate.properties.kind;
                return type !== "opening";
              });
              const origin = nearestFeatureRef(start, otherCandidates);
              const destination = nearestFeatureRef(end, otherCandidates);
              const intermediary = nearestFeatureRef(start, openingCandidates);
              if (!origin || !destination || !intermediary) {
                return;
              }
              const intermediaryFloorId = intermediary.floorId ?? currentFloorId;
              setRelationRefs({
                origin,
                intermediary: intermediaryFloorId
                  ? {
                      featureId: intermediary.featureId,
                      floorId: intermediaryFloorId,
                    }
                  : { featureId: intermediary.featureId },
                destination,
              });
            }}
          >
            Auto-link nearest features
          </button>
        </div>
      </section>
    </div>
  );
};
