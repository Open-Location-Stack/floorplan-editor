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

const observeOpenCageRequests = (page: Page) => {
  const openCageRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/geocode")) {
      openCageRequests.push(request.url());
    }
  });
  return openCageRequests;
};

test("app loads without triggering error boundary", async ({ page }) => {
  const pageErrors = observePageErrors(page);
  const openCageRequests = observeOpenCageRequests(page);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: /formation floor plan editor/i })).toBeVisible();
  await expect(page.getByText(/something went wrong\. please reload the editor\./i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /select mode/i })).toBeVisible();
  expect(openCageRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("map info control sits left of the scale control", async ({ page }) => {
  await page.goto("/");

  await page.evaluate(() => {
    const fixture = document.createElement("div");
    fixture.className = "floorplan-map maplibregl-map";
    fixture.style.width = "800px";
    fixture.style.height = "200px";
    fixture.style.position = "relative";

    const controlContainer = document.createElement("div");
    controlContainer.className = "maplibregl-control-container";

    const corner = document.createElement("div");
    corner.className = "maplibregl-ctrl-bottom-right";

    const info = document.createElement("div");
    info.className = "maplibregl-ctrl maplibregl-ctrl-attrib";
    info.dataset.testid = "map-info-control";
    info.style.width = "240px";
    info.style.height = "32px";

    const scale = document.createElement("div");
    scale.className = "maplibregl-ctrl maplibregl-ctrl-scale";
    scale.dataset.testid = "map-scale-control";
    scale.style.width = "120px";
    scale.style.height = "32px";

    // MapLibre may insert these controls in either order. The app layout must
    // keep attribution on the left and the scale on the right.
    corner.append(scale, info);
    controlContainer.append(corner);
    fixture.append(controlContainer);
    document.body.append(fixture);
  });

  const infoBox = await page.getByTestId("map-info-control").boundingBox();
  const scaleBox = await page.getByTestId("map-scale-control").boundingBox();

  expect(infoBox).not.toBeNull();
  expect(scaleBox).not.toBeNull();
  expect(infoBox?.x ?? 0).toBeLessThan(scaleBox?.x ?? 0);
  expect(infoBox?.y).toBe(scaleBox?.y);
});

test("app loads with persisted overlay data", async ({ page }) => {
  const pageErrors = observePageErrors(page);
  const openCageRequests = observeOpenCageRequests(page);

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
  expect(openCageRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("app loads with malformed persisted snapshot", async ({ page }) => {
  const pageErrors = observePageErrors(page);
  const openCageRequests = observeOpenCageRequests(page);

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
  expect(openCageRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("critical journey: edit building details and survive reload", async ({ page }) => {
  const pageErrors = observePageErrors(page);
  const openCageRequests = observeOpenCageRequests(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /formation floor plan editor/i })).toBeVisible();
  await page.getByRole("button", { name: /add venue/i }).click();
  const venuePanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: /^venue$/i }),
  });
  await venuePanel.getByRole("button", { name: /add building/i }).click();

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
  expect(openCageRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
