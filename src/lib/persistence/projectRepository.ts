import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { ProjectSnapshot } from "../types";

const DB_NAME = "floorplan-editor";
const DB_VERSION = 1;
const PROJECTS_STORE = "projects";

interface FloorplanDbSchema extends DBSchema {
  projects: {
    key: string;
    value: ProjectSnapshot;
    indexes: {
      "by-updated-at": string;
    };
  };
}

let databasePromise: Promise<IDBPDatabase<FloorplanDbSchema>> | undefined;

const getDb = (): Promise<IDBPDatabase<FloorplanDbSchema>> => {
  if (!databasePromise) {
    databasePromise = openDB<FloorplanDbSchema>(DB_NAME, DB_VERSION, {
      upgrade: (db) => {
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          const store = db.createObjectStore(PROJECTS_STORE, { keyPath: "id" });
          store.createIndex("by-updated-at", "updatedAt");
        }
      },
    });
  }

  return databasePromise;
};

export const projectRepository = {
  async saveProject(project: ProjectSnapshot): Promise<void> {
    const db = await getDb();
    await db.put(PROJECTS_STORE, project);
  },

  async loadProject(projectId: string): Promise<ProjectSnapshot | undefined> {
    const db = await getDb();
    return db.get(PROJECTS_STORE, projectId);
  },

  async listProjects(): Promise<ProjectSnapshot[]> {
    const db = await getDb();
    const projects = await db.getAllFromIndex(PROJECTS_STORE, "by-updated-at");
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
};

export const __resetProjectRepositoryForTests = (): void => {
  databasePromise = undefined;
};
