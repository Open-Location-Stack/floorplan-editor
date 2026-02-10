import { useState } from "react";
import {
  addBuilding,
  addFloor,
  addFloorItem,
  createDemoProject,
  deleteBuilding,
  deleteFloor,
  type ProjectData,
} from "./lib/projectModel";

function App() {
  const [project, setProject] = useState<ProjectData>(() => createDemoProject());
  const actionButtonClass =
    "relative z-10 inline-flex cursor-pointer items-center justify-center rounded-md border border-base-300 bg-base-100 px-3 py-1.5 text-sm font-semibold text-base-content shadow-sm transition hover:bg-base-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 pointer-events-auto";
  const primaryButtonClass =
    "relative z-10 inline-flex cursor-pointer items-center justify-center rounded-md border border-base-content bg-base-content px-3 py-1.5 text-sm font-semibold text-base-100 shadow-sm transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 pointer-events-auto";
  const deleteButtonClass =
    "relative z-10 inline-flex cursor-pointer items-center justify-center rounded-md border border-red-700 bg-red-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 pointer-events-auto";
  const deleteOutlineButtonClass =
    "relative z-10 inline-flex cursor-pointer items-center justify-center rounded-md border border-red-700 bg-base-100 px-3 py-1.5 text-sm font-semibold text-red-800 shadow-sm transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 pointer-events-auto";

  return (
    <main className="min-h-screen bg-base-200 p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-box bg-base-100 p-6 shadow">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-bold">Building & Floor Manager</h1>
            <button
              type="button"
              className={primaryButtonClass}
              onClick={() =>
                setProject((current) =>
                  addBuilding(current, `Building ${current.buildings.length + 1}`),
                )
              }
            >
              Add building
            </button>
          </div>
          <p className="text-base-content/70">
            Delete actions remove nested child content, so deleting a building clears its floors and
            attached floor items.
          </p>
        </header>

        {project.buildings.length === 0 ? (
          <section className="rounded-box bg-base-100 p-8 text-center shadow">
            <p className="text-lg font-semibold">No buildings yet</p>
            <p className="mt-2 text-base-content/70">Create a building to start adding floors.</p>
          </section>
        ) : null}

        <div className="space-y-4">
          {project.buildings.map((building) => {
            const buildingFloors = project.floors.filter(
              (floor) => floor.buildingId === building.id,
            );

            return (
              <section key={building.id} className="rounded-box bg-base-100 p-5 shadow">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-2xl font-semibold">{building.name}</h2>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={actionButtonClass}
                      onClick={() =>
                        setProject((current) => {
                          const floorCount = current.floors.filter(
                            (floor) => floor.buildingId === building.id,
                          ).length;
                          return addFloor(current, building.id, `Floor ${floorCount + 1}`);
                        })
                      }
                    >
                      Add floor
                    </button>
                    <button
                      type="button"
                      className={deleteButtonClass}
                      aria-label={`Delete building ${building.name}`}
                      disabled={false}
                      onClick={() => setProject((current) => deleteBuilding(current, building.id))}
                    >
                      Delete building
                    </button>
                  </div>
                </div>

                {buildingFloors.length === 0 ? (
                  <p className="mt-4 text-base-content/70">No floors in this building yet.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {buildingFloors.map((floor) => {
                      const floorItems = project.floorItems.filter(
                        (item) => item.floorId === floor.id,
                      );

                      return (
                        <li key={floor.id} className="rounded-box bg-base-200 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-lg font-semibold">{floor.name}</h3>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className={actionButtonClass}
                                onClick={() =>
                                  setProject((current) => {
                                    const itemCount = current.floorItems.filter(
                                      (item) => item.floorId === floor.id,
                                    ).length;
                                    return addFloorItem(
                                      current,
                                      floor.id,
                                      `Item ${itemCount + 1} (${floor.name})`,
                                    );
                                  })
                                }
                              >
                                Add child item
                              </button>
                              <button
                                type="button"
                                className={deleteOutlineButtonClass}
                                aria-label={`Delete floor ${floor.name}`}
                                disabled={false}
                                onClick={() =>
                                  setProject((current) => deleteFloor(current, floor.id))
                                }
                              >
                                Delete floor
                              </button>
                            </div>
                          </div>

                          <p className="mt-2 text-sm text-base-content/80">
                            Child items: {floorItems.length}
                          </p>
                          {floorItems.length > 0 ? (
                            <ul className="mt-2 list-disc pl-5 text-sm">
                              {floorItems.map((item) => (
                                <li key={item.id}>{item.label}</li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}

export default App;
