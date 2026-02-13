import type { Venue } from "../../lib/types";

type VenueEditorProps = {
  venue: Venue;
  onRenameVenue: (name: string) => void;
  onAddBuilding: () => void;
  onDeleteVenue: () => void;
  rawGeoJsonPreview?: unknown;
};

export const VenueEditor = ({
  venue,
  onRenameVenue,
  onAddBuilding,
  onDeleteVenue,
  rawGeoJsonPreview,
}: VenueEditorProps) => (
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
        <button className="btn btn-sm btn-error" type="button" onClick={onDeleteVenue}>
          Delete venue
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
