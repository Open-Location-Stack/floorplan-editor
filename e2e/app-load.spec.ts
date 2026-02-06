import { expect, test } from "@playwright/test";

test("app loads without triggering error boundary", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /formation floor plan editor/i }),
  ).toBeVisible();
  await expect(page.getByText(/something went wrong\. please reload the editor\./i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /map view/i })).toBeVisible();
});

