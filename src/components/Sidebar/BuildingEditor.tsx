import { formatFeatureOptionLabel } from "../../lib/imdf/featureDisplay";
import type { Building, FloorFeature, Venue } from "../../lib/types";
import { AppIcon } from "../icons/AppIcon";

type BuildingEditorProps = {
  venue: Venue | undefined;
  building: Building;
  onRenameBuilding: (name: string) => void;
  onUpdateVenueCategory: (category: string) => void;
  onUpdateAddressField: (field: string, value: string) => void;
  onReverseGeocodeAddress: () => void;
  onDeleteBuilding: () => void;
  onAddLevel: () => void;
  onAddDirectoryEntry: () => void;
  onUpdateDirectoryEntry: (
    entryId: string,
    field: "name" | "category" | "phone" | "website" | "hours" | "anchor_id" | "unit_ids",
    value: string | string[] | undefined,
  ) => void;
  onDeleteDirectoryEntry: (entryId: string) => void;
  anchorCandidates: FloorFeature[];
  unitCandidates: FloorFeature[];
  rawGeoJsonPreview?: unknown;
};

export const BuildingEditor = ({
  venue,
  building,
  onRenameBuilding,
  onUpdateVenueCategory,
  onUpdateAddressField,
  onReverseGeocodeAddress,
  onDeleteBuilding,
  onAddLevel,
  onAddDirectoryEntry,
  onUpdateDirectoryEntry,
  onDeleteDirectoryEntry,
  anchorCandidates,
  unitCandidates,
  rawGeoJsonPreview,
}: BuildingEditorProps) => {
  const venueCategory = building.imdf?.venue?.category ?? "";
  const address = building.imdf?.address;
  const directoryEntries = building.imdf?.directory ?? [];

  return (
    <section className="card bg-base-100 shadow">
      <div className="card-body gap-3">
        <h2 className="card-title text-lg">
          <AppIcon name="building" />
          Building
        </h2>
        {venue ? <p className="text-xs text-base-content/70">Venue: {venue.name}</p> : null}
        <label className="fieldset">
          <span className="fieldset-legend">Name</span>
          <input
            className="input input-bordered input-sm"
            type="text"
            value={building.name}
            onChange={(event) => onRenameBuilding(event.currentTarget.value)}
          />
        </label>

        <div className="rounded-box border border-base-300 p-3">
          <h3 className="mb-2 text-sm font-semibold">Venue</h3>
          <div className="grid gap-2">
            <input
              className="input input-bordered input-sm"
              type="text"
              value={venueCategory}
              placeholder="Venue category"
              onChange={(event) => onUpdateVenueCategory(event.currentTarget.value)}
            />
          </div>
        </div>

        <div className="rounded-box border border-base-300 p-3">
          <h3 className="mb-2 text-sm font-semibold">Address</h3>
          <div className="grid gap-2">
            <input
              className="input input-bordered input-sm"
              type="text"
              value={address?.address ?? ""}
              placeholder="Street address"
              onChange={(event) => onUpdateAddressField("address", event.currentTarget.value)}
            />
            <input
              className="input input-bordered input-sm"
              type="text"
              value={address?.locality ?? ""}
              placeholder="Locality / city"
              onChange={(event) => onUpdateAddressField("locality", event.currentTarget.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input input-bordered input-sm"
                type="text"
                value={address?.province ?? ""}
                placeholder="Province / state"
                onChange={(event) => onUpdateAddressField("province", event.currentTarget.value)}
              />
              <input
                className="input input-bordered input-sm"
                type="text"
                value={address?.postal_code ?? ""}
                placeholder="Postal code"
                onChange={(event) => onUpdateAddressField("postal_code", event.currentTarget.value)}
              />
            </div>
            <input
              className="input input-bordered input-sm"
              type="text"
              value={address?.country ?? ""}
              placeholder="Country code"
              onChange={(event) => onUpdateAddressField("country", event.currentTarget.value)}
            />
            <button
              className="btn btn-sm btn-outline"
              type="button"
              onClick={onReverseGeocodeAddress}
            >
              <AppIcon name="search" />
              Reverse geocode with OpenCage
            </button>
          </div>
        </div>

        <div className="rounded-box border border-base-300 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Directory</h3>
            <button className="btn btn-xs" type="button" onClick={onAddDirectoryEntry}>
              <AppIcon name="add" />
              Add entry
            </button>
          </div>
          {directoryEntries.length === 0 ? (
            <p className="text-xs text-base-content/70">No directory entries yet.</p>
          ) : (
            <div className="grid gap-3">
              {directoryEntries.map((entry) => (
                <div key={entry.id} className="rounded-box border border-base-300 p-2">
                  <div className="mb-2 text-xs text-base-content/70">{entry.id}</div>
                  <div className="grid gap-2">
                    <label className="fieldset">
                      <span className="fieldset-legend">Name</span>
                      <input
                        className="input input-bordered input-sm"
                        type="text"
                        value={(entry.name as { en?: string }).en ?? ""}
                        onChange={(event) =>
                          onUpdateDirectoryEntry(entry.id, "name", event.currentTarget.value)
                        }
                      />
                    </label>
                    <label className="fieldset">
                      <span className="fieldset-legend">Category</span>
                      <input
                        className="input input-bordered input-sm"
                        type="text"
                        value={entry.category ?? ""}
                        onChange={(event) =>
                          onUpdateDirectoryEntry(entry.id, "category", event.currentTarget.value)
                        }
                      />
                    </label>
                    <label className="fieldset">
                      <span className="fieldset-legend">Anchor</span>
                      <select
                        className="select select-bordered select-sm"
                        value={entry.anchor_id ?? ""}
                        onChange={(event) =>
                          onUpdateDirectoryEntry(
                            entry.id,
                            "anchor_id",
                            event.currentTarget.value || undefined,
                          )
                        }
                      >
                        <option value="">Select anchor</option>
                        {anchorCandidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {formatFeatureOptionLabel(candidate)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="fieldset">
                      <span className="fieldset-legend">Units</span>
                      <input
                        className="input input-bordered input-sm"
                        type="text"
                        value={(entry.unit_ids ?? []).join(", ")}
                        placeholder="unit-1, unit-2"
                        onChange={(event) =>
                          onUpdateDirectoryEntry(
                            entry.id,
                            "unit_ids",
                            event.currentTarget.value
                              .split(",")
                              .map((item) => item.trim())
                              .filter((item) => item.length > 0),
                          )
                        }
                        list={`directory-units-${entry.id}`}
                      />
                      <datalist id={`directory-units-${entry.id}`}>
                        {unitCandidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {formatFeatureOptionLabel(candidate)}
                          </option>
                        ))}
                      </datalist>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="input input-bordered input-sm"
                        type="text"
                        value={entry.phone ?? ""}
                        placeholder="Phone"
                        onChange={(event) =>
                          onUpdateDirectoryEntry(entry.id, "phone", event.currentTarget.value)
                        }
                      />
                      <input
                        className="input input-bordered input-sm"
                        type="text"
                        value={entry.website ?? ""}
                        placeholder="Website"
                        onChange={(event) =>
                          onUpdateDirectoryEntry(entry.id, "website", event.currentTarget.value)
                        }
                      />
                    </div>
                    <input
                      className="input input-bordered input-sm"
                      type="text"
                      value={entry.hours ?? ""}
                      placeholder="Hours"
                      onChange={(event) =>
                        onUpdateDirectoryEntry(entry.id, "hours", event.currentTarget.value)
                      }
                    />
                    <div>
                      <button
                        className="btn btn-xs btn-error"
                        type="button"
                        onClick={() => onDeleteDirectoryEntry(entry.id)}
                      >
                        <AppIcon name="delete" />
                        Remove entry
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button className="btn btn-sm" type="button" onClick={onAddLevel}>
            <AppIcon name="add" />
            Add level
          </button>
          <button className="btn btn-sm btn-error" type="button" onClick={onDeleteBuilding}>
            <AppIcon name="delete" />
            Delete building
          </button>
        </div>

        <details className="rounded-box border border-base-300 p-3">
          <summary className="cursor-pointer font-medium">Raw exported GeoJSON</summary>
          <pre className="mt-3 max-h-56 overflow-auto rounded-box border border-base-300 bg-base-200 p-2 font-mono text-xs">
            {JSON.stringify(rawGeoJsonPreview ?? {}, null, 2)}
          </pre>
        </details>
      </div>
    </section>
  );
};
