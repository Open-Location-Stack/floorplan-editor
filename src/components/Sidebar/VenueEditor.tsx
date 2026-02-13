import type { Venue } from "../../lib/types";

type VenueEditorProps = {
  venue: Venue;
  onRenameVenue: (name: string) => void;
  onAddBuilding: () => void;
};

export const VenueEditor = ({ venue, onRenameVenue, onAddBuilding }: VenueEditorProps) => (
  <section className="card bg-base-100 shadow">
    <div className="card-body gap-3">
      <h2 className="card-title text-lg">Venue</h2>
      <label className="fieldset">
        <span className="fieldset-legend">Name</span>
        <input
          className="input input-bordered input-sm"
          type="text"
          value={venue.name}
          onChange={(event) => onRenameVenue(event.currentTarget.value)}
        />
      </label>
      <div className="flex gap-2">
        <button className="btn btn-sm" type="button" onClick={onAddBuilding}>
          Add building
        </button>
      </div>
    </div>
  </section>
);
