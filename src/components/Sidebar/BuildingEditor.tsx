import type { Building, Venue } from "../../lib/types";

type BuildingEditorProps = {
  venue: Venue | undefined;
  building: Building;
  onRenameBuilding: (name: string) => void;
  onUpdateVenueCategory: (category: string) => void;
  onUpdateAddressField: (field: string, value: string) => void;
  onReverseGeocodeAddress: () => void;
  onDeleteBuilding: () => void;
  onAddLevel: () => void;
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
}: BuildingEditorProps) => {
  const venueCategory = building.imdf?.venue?.category ?? "";
  const address = building.imdf?.address;

  return (
    <section className="card bg-base-100 shadow">
      <div className="card-body gap-3">
        <h2 className="card-title text-lg">Building</h2>
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
              Reverse geocode with OpenCage
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button className="btn btn-sm" type="button" onClick={onAddLevel}>
            Add level
          </button>
          <button className="btn btn-sm btn-error" type="button" onClick={onDeleteBuilding}>
            Delete building
          </button>
        </div>
      </div>
    </section>
  );
};
