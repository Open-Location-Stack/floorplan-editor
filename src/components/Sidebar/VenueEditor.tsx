import type { Venue } from "../../lib/types";

type VenueEditorProps = {
  venue: Venue;
  onRenameVenue: (name: string) => void;
};

export const VenueEditor = ({ venue, onRenameVenue }: VenueEditorProps) => (
  <section className="card bg-base-100 shadow">
    <div className="card-body gap-3">
      <h2 className="card-title text-lg">Venue</h2>
      <label className="form-control gap-1">
        <span className="label-text">Name</span>
        <input
          className="input input-bordered input-sm"
          type="text"
          value={venue.name}
          onChange={(event) => onRenameVenue(event.currentTarget.value)}
        />
      </label>
    </div>
  </section>
);
