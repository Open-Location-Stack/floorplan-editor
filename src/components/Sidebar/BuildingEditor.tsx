import { useRef } from "react";
import type { Building, Venue } from "../../lib/types";

type BuildingEditorProps = {
  venue: Venue | undefined;
  building: Building;
  onRenameBuilding: (name: string) => void;
  onUpdateVenueName: (name: string) => void;
  onUpdateVenueCategory: (category: string) => void;
  onUpdateAddressField: (field: string, value: string) => void;
  onExportArchive: () => void;
  onImportArchive: (file: File) => void;
  onDeleteBuilding: () => void;
  onAddLevel: () => void;
  archiveWarnings: string[];
};

export const BuildingEditor = ({
  venue,
  building,
  onRenameBuilding,
  onUpdateVenueName,
  onUpdateVenueCategory,
  onUpdateAddressField,
  onExportArchive,
  onImportArchive,
  onDeleteBuilding,
  onAddLevel,
  archiveWarnings,
}: BuildingEditorProps) => {
  const importInputRef = useRef<HTMLInputElement>(null);
  /* biome-ignore lint/complexity/useLiteralKeys: bracket notation is required by noPropertyAccessFromIndexSignature */
  const venueName = building.imdf?.venue?.name?.["en"] ?? "";
  const venueCategory = building.imdf?.venue?.category ?? "";
  const address = building.imdf?.address;

  return (
    <section className="card bg-base-100 shadow">
      <div className="card-body gap-3">
        <h2 className="card-title text-lg">Building</h2>
        {venue ? <p className="text-xs text-base-content/70">Venue: {venue.name}</p> : null}
        <label className="form-control gap-1">
          <span className="label-text">Name</span>
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
              value={venueName}
              placeholder="Venue name (en)"
              onChange={(event) => onUpdateVenueName(event.currentTarget.value)}
            />
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
          </div>
        </div>

        <div className="rounded-box border border-base-300 p-3">
          <div className="mb-2 text-sm font-semibold">IMDF Archive</div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm" type="button" onClick={onExportArchive}>
              Export ZIP
            </button>
            <button
              className="btn btn-sm btn-outline"
              type="button"
              onClick={() => importInputRef.current?.click()}
            >
              Import ZIP
            </button>
            <input
              ref={importInputRef}
              className="hidden"
              type="file"
              accept=".zip,.imdf.zip,application/zip"
              onChange={(event) => {
                const selected = event.currentTarget.files?.[0];
                if (selected) {
                  onImportArchive(selected);
                }
                event.currentTarget.value = "";
              }}
            />
          </div>
          {archiveWarnings.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-xs text-warning">
              {archiveWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
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
