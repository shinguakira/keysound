import { test, expect } from "@playwright/test";
import { injectTauriMock, defaultState } from "./tauri-mock";

test.describe("Sound Packs tab", () => {
  test("shows packs in correct order: default → custom → bundled", async ({
    page,
  }) => {
    await injectTauriMock(page);
    await page.goto("/");

    // Wait for loading to finish
    await expect(page.locator("h1")).toHaveText("KeySound");

    // Should be on packs tab by default
    const cards = page.locator(".pack-card");
    await expect(cards).toHaveCount(3);

    // Order: HHKB (default), My Custom (user), Cherry MX Blue (bundled)
    await expect(cards.nth(0).locator(".pack-name")).toContainText("HHKB");
    await expect(cards.nth(1).locator(".pack-name")).toContainText("My Custom");
    await expect(cards.nth(2).locator(".pack-name")).toContainText(
      "Cherry MX Blue",
    );
  });

  test("custom packs show a Custom badge", async ({ page }) => {
    await injectTauriMock(page);
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("KeySound");

    const customCard = page.locator(".pack-card").nth(1);
    await expect(customCard.locator(".custom-badge")).toHaveText("Custom");
  });

  test("selecting a pack highlights it", async ({ page }) => {
    await injectTauriMock(page);
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("KeySound");

    const secondCard = page.locator(".pack-card").nth(1);
    await secondCard.click();
    await expect(secondCard).toHaveClass(/selected/);
  });
});

test.describe("Custom Sound tab - Create pack", () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page);
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("KeySound");
    // Switch to Custom tab
    await page.locator(".tab-btn", { hasText: "Custom Sound" }).click();
  });

  test("shows create form with 5 slots", async ({ page }) => {
    await expect(page.locator(".new-pack-form h3")).toHaveText(
      "Create New Custom Sound",
    );
    const slotRows = page.locator(".new-pack-form .slot-row");
    await expect(slotRows).toHaveCount(5);
  });

  test("Create button is disabled when name is empty", async ({ page }) => {
    await expect(page.locator(".create-btn")).toBeDisabled();
  });

  test("Create button is disabled when name is set but no default slot", async ({
    page,
  }) => {
    await page.locator(".name-input").fill("Test Pack");
    await expect(page.locator(".create-btn")).toBeDisabled();
  });

  test("shows existing custom packs in the list", async ({ page }) => {
    await expect(page.locator(".section-title")).toHaveText(
      "Your Custom Sounds",
    );
    const packCards = page.locator(".custom-section .pack-card");
    await expect(packCards).toHaveCount(1);
    await expect(packCards.first().locator(".pack-name")).toContainText(
      "My Custom",
    );
  });
});

test.describe("Custom Sound tab - Edit pack", () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page);
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("KeySound");
    await page.locator(".tab-btn", { hasText: "Custom Sound" }).click();
  });

  test("clicking Edit opens slot editor", async ({ page }) => {
    await page.locator(".edit-btn").click();

    const editor = page.locator(".slot-editor");
    await expect(editor).toBeVisible();

    // Should show 5 slots
    const slotRows = editor.locator(".slot-row");
    await expect(slotRows).toHaveCount(5);

    // Default slot should show click.wav
    const defaultRow = slotRows.first();
    await expect(defaultRow.locator(".slot-file")).toHaveText("click.wav");
  });

  test("clicking Edit again closes the editor", async ({ page }) => {
    // Open
    await page.locator(".edit-btn").click();
    await expect(page.locator(".slot-editor")).toBeVisible();

    // Close (button says "Save" when editing)
    await page.locator(".edit-btn").click();
    await expect(page.locator(".slot-editor")).not.toBeVisible();
  });

  test("removing a slot clears the file name", async ({ page }) => {
    await page.locator(".edit-btn").click();

    const editor = page.locator(".slot-editor");
    const defaultRow = editor.locator(".slot-row").first();

    // Should have a remove button for the default slot (it has click.wav)
    await expect(defaultRow.locator(".remove-btn")).toBeVisible();
    await defaultRow.locator(".remove-btn").click();

    // After removal, file should show "None"
    await expect(defaultRow.locator(".slot-file")).toHaveText("None");
  });
});

test.describe("Custom Sound tab - Delete pack", () => {
  test.beforeEach(async ({ page }) => {
    await injectTauriMock(page);
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("KeySound");
    await page.locator(".tab-btn", { hasText: "Custom Sound" }).click();
  });

  test("clicking Del shows confirmation", async ({ page }) => {
    await page.locator(".delete-btn").click();
    await expect(page.locator(".delete-confirm")).toBeVisible();
    await expect(page.locator(".delete-confirm")).toContainText(
      'Delete "My Custom"?',
    );
  });

  test("clicking No cancels deletion", async ({ page }) => {
    await page.locator(".delete-btn").click();
    await page
      .locator(".delete-confirm .action-btn", { hasText: "No" })
      .click();
    await expect(page.locator(".delete-confirm")).not.toBeVisible();
    // Pack still there
    await expect(page.locator(".custom-section .pack-card")).toHaveCount(1);
  });

  test("clicking Yes deletes the pack", async ({ page }) => {
    await page.locator(".delete-btn").click();
    await page.locator(".delete-yes").click();

    // Pack list should be empty, section title gone
    await expect(page.locator(".custom-section .pack-card")).toHaveCount(0);
  });

  test("deleting active pack switches to default", async ({ page }) => {
    // First select the custom pack
    const packCard = page.locator(".custom-section .pack-card").first();
    await packCard.click();

    // Now delete it
    await page.locator(".delete-btn").click();
    await page.locator(".delete-yes").click();

    // Switch to packs tab — default should be selected
    await page.locator(".tab-btn", { hasText: "Sound Packs" }).click();
    const defaultCard = page.locator(".pack-card").first();
    await expect(defaultCard).toHaveClass(/selected/);
  });
});

test.describe("Toggle and Volume controls", () => {
  test("toggling sound changes button text", async ({ page }) => {
    await injectTauriMock(page);
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("KeySound");

    const toggleBtn = page.locator(".toggle-btn");
    await expect(toggleBtn).toHaveText("ON");
    await toggleBtn.click();
    await expect(toggleBtn).toHaveText("OFF");
    await toggleBtn.click();
    await expect(toggleBtn).toHaveText("ON");
  });

  test("volume slider shows percentage", async ({ page }) => {
    await injectTauriMock(page);
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("KeySound");

    await expect(page.locator(".volume-value")).toHaveText("80%");
  });
});

test.describe("Test input area", () => {
  test("test input field is visible and focusable", async ({ page }) => {
    await injectTauriMock(page);
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("KeySound");

    const input = page.locator(".test-input");
    await expect(input).toBeVisible();
    await input.focus();
    await expect(input).toBeFocused();
  });
});
