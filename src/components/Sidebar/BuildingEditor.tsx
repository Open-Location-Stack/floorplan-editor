import type { Building } from "../../lib/types";

type BuildingEditorProps = {
  building: Building;
  canDeleteBuilding: boolean;
  onRenameBuilding: (name: string) => void;
  onDeleteBuilding: () => void;
  onAddFloor: () => void;
};

export const BuildingEditor = ({
  building,
  canDeleteBuilding,
  onRenameBuilding,
  onDeleteBuilding,
  onAddFloor,
}: BuildingEditorProps) => (
  <section className="card bg-base-100 shadow">
    <div className="card-body gap-3">
      <h2 className="card-title text-lg">Building</h2>
      <label className="form-control gap-1">
        <span className="label-text">Name</span>
        <input
          className="input input-bordered input-sm"
          type="text"
          value={building.name}
          onChange={(event) => onRenameBuilding(event.currentTarget.value)}
        />
      </label>
      <div className="flex gap-2">
        <button className="btn btn-sm" type="button" onClick={onAddFloor}>
          Add floor
        </button>
        <button
          className="btn btn-sm btn-error"
          type="button"
          onClick={onDeleteBuilding}
          disabled={!canDeleteBuilding}
        >
          Delete building
        </button>
      </div>
    </div>
  </section>
);
