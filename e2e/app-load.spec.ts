import { expect, type Page, test } from "@playwright/test";

type ProjectSnapshot = {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  buildings: Array<{ id: string; name: string; location?: [number, number] }>;
  floors: Array<{ id: string; buildingId: string; name: string }>;
  features: unknown[];
  overlays: unknown[];
};

const seedProjectSnapshot = async (page: Page, snapshot: ProjectSnapshot) => {
  await page.evaluate(async (projectSnapshot) => {
    await new Promise<void>((resolve, reject) => {
      const request = window.indexedDB.open("floorplan-editor", 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("projects")) {
          const store = db.createObjectStore("projects", { keyPath: "id" });
          store.createIndex("by-updated-at", "updatedAt");
        }
      };

      request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));

      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("projects", "readwrite");
        tx.objectStore("projects").put(projectSnapshot);
        tx.onerror = () => reject(tx.error ?? new Error("Failed to write snapshot"));
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  }, snapshot);
};

const observePageErrors = (page: Page) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    if (
      error.message.includes("Failed to initialize WebGL") ||
      error.message.includes("webglcontextcreationerror")
    ) {
      return;
    }
    pageErrors.push(error.message);
  });
  return pageErrors;
};

test("app loads without triggering error boundary", async ({ page }) => {
  const pageErrors = observePageErrors(page);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: /formation floor plan editor/i })).toBeVisible();
  await expect(page.getByText(/something went wrong\. please reload the editor\./i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /select mode/i })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("app loads with persisted overlay data", async ({ page }) => {
  const pageErrors = observePageErrors(page);

  await page.goto("/");

  await seedProjectSnapshot(page, {
    id: "default-project",
    name: "Overlay test project",
    version: 5,
    updatedAt: "2026-02-09T00:00:00.000Z",
    buildings: [{ id: "b1", name: "Building 1" }],
    floors: [{ id: "f1", buildingId: "b1", name: "Ground Floor" }],
    features: [],
    overlays: [
      {
        id: "overlay-1",
        floorId: "f1",
        imageName: "overlay.png",
        imageDataUrl: "data:image/png;base64,abc",
        opacity: 70,
        corners: {
          topLeft: [5.12, 52.1],
          topRight: [5.13, 52.1],
          bottomRight: [5.13, 52.09],
          bottomLeft: [5.12, 52.09],
        },
        updatedAt: "2026-02-09T00:00:00.000Z",
      },
    ],
  });

  await page.reload();

  await expect(page.getByRole("heading", { name: /formation floor plan editor/i })).toBeVisible();
  await expect(page.getByText(/something went wrong\. please reload the editor\./i)).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("app loads with malformed persisted snapshot", async ({ page }) => {
  const pageErrors = observePageErrors(page);

  await page.goto("/");

  await seedProjectSnapshot(page, {
    id: "default-project",
    name: "Malformed project",
    version: 5,
    updatedAt: "2026-02-09T00:00:00.000Z",
    buildings: [{ id: "b1", name: "Building 1" }],
    floors: [{ id: "f1", buildingId: "b1", name: "Ground Floor" }],
    features: [
      {
        type: "Feature",
        id: "bad-feature",
        geometry: {
          type: "Polygon",
          coordinates: [[[5.1, 52.1]]],
        },
        properties: { kind: "unit" },
      },
    ],
    overlays: [
      {
        id: "bad-overlay",
        floorId: "f1",
        imageName: "bad.png",
        imageDataUrl: "data:image/png;base64,abc",
        opacity: 50,
        corners: {
          topLeft: ["bad", 0],
          topRight: [1, 0],
          bottomRight: [1, -1],
          bottomLeft: [0, -1],
        },
        updatedAt: "2026-02-09T00:00:00.000Z",
      },
    ],
  });

  await page.reload();

  await expect(page.getByRole("heading", { name: /formation floor plan editor/i })).toBeVisible();
  await expect(page.getByText(/something went wrong\. please reload the editor\./i)).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("critical journey: edit building details and survive reload", async ({ page }) => {
  const pageErrors = observePageErrors(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /formation floor plan editor/i })).toBeVisible();
  await page.getByRole("button", { name: /add building/i }).click();

  await page.getByRole("button", { name: "Building 1" }).click();
  const buildingPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: /^building$/i }),
  });
  const buildingName = buildingPanel.getByLabel("Name");
  await buildingName.fill("Journey Building");
  await expect(buildingName).toHaveValue("Journey Building");

  // Autosave is debounced; wait before reload to ensure persistence roundtrip is exercised.
  await page.waitForTimeout(600);

  await page.reload();

  await page.getByRole("button", { name: "Journey Building" }).click();
  const reloadedPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: /^building$/i }),
  });
  await expect(reloadedPanel.getByLabel("Name")).toHaveValue("Journey Building");
  await expect(page.getByText(/something went wrong\. please reload the editor\./i)).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
