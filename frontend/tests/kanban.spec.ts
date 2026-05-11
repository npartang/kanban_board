import { expect, test } from "@playwright/test";

const loginAsDemo = async (page: Parameters<typeof test>[1] extends (page: infer P) => unknown ? P : never) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForSelector('[data-testid^="column-"]', { timeout: 10_000 });
};

test.beforeEach(async ({ page }) => {
  await loginAsDemo(page);
});

// ---- Board ----------------------------------------------------------------

test("loads the kanban board", async ({ page }) => {
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("displays username in the header after login", async ({ page }) => {
  await expect(page.getByText("user")).toBeVisible();
});

// ---- Cards ----------------------------------------------------------------

test("adds a card to a column", async ({ page }) => {
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("cancels adding a card", async ({ page }) => {
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Should not appear");
  await firstColumn.getByRole("button", { name: /cancel/i }).click();
  await expect(firstColumn.getByText("Should not appear")).not.toBeVisible();
});

test("opens the card detail modal when Edit is clicked", async ({ page }) => {
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Modal test card");
  await firstColumn.getByRole("button", { name: /add card/i }).click();

  const card = firstColumn.locator("article").filter({ hasText: "Modal test card" });
  await card.getByRole("button", { name: /edit/i }).click();

  await expect(page.getByRole("dialog", { name: /card details/i })).toBeVisible();
  await expect(page.getByDisplayValue("Modal test card")).toBeVisible();
});

test("closes card detail modal with Escape", async ({ page }) => {
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Escape test");
  await firstColumn.getByRole("button", { name: /add card/i }).click();

  const card = firstColumn.locator("article").filter({ hasText: "Escape test" });
  await card.getByRole("button", { name: /edit/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("edits a card title in the modal and saves", async ({ page }) => {
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Original title");
  await firstColumn.getByRole("button", { name: /add card/i }).click();

  const card = firstColumn.locator("article").filter({ hasText: "Original title" });
  await card.getByRole("button", { name: /edit/i }).click();

  const titleInput = page.getByLabel("Card title");
  await titleInput.fill("Updated title");
  await page.getByRole("button", { name: /save/i }).click();

  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(firstColumn.getByText("Updated title")).toBeVisible();
});

// ---- Columns ----------------------------------------------------------------

test("renames a column", async ({ page }) => {
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const titleInput = firstColumn.getByLabel("Column title");
  await titleInput.fill("Renamed Col");
  await titleInput.press("Tab");
  await expect(firstColumn.getByDisplayValue("Renamed Col")).toBeVisible();
});

// ---- Boards ----------------------------------------------------------------

test("creates a new board", async ({ page }) => {
  await page.getByRole("button", { name: /new board/i }).click();
  const input = page.getByPlaceholder("Board name");
  await input.fill("E2E Test Board");
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect(page.getByRole("button", { name: /e2e test board/i })).toBeVisible();
});

// ---- Search ----------------------------------------------------------------

test("filters cards by search query", async ({ page }) => {
  const firstColumn = page.locator('[data-testid^="column-"]').first();

  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Unique searchable card xyz");
  await firstColumn.getByRole("button", { name: /add card/i }).click();

  await page.getByLabel("Search cards").fill("xyz");
  await expect(page.getByText("Unique searchable card xyz")).toBeVisible();

  await page.getByLabel("Search cards").fill("zzznomatch");
  await expect(page.getByText("Unique searchable card xyz")).not.toBeVisible();
});

// ---- Keyboard shortcuts ----------------------------------------------------

test("opens keyboard shortcuts overlay with ?", async ({ page }) => {
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: /keyboard shortcuts/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /keyboard shortcuts/i })).not.toBeVisible();
});

// ---- Auth ------------------------------------------------------------------

test("logs out and shows login screen", async ({ page }) => {
  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});
