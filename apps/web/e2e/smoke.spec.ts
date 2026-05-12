import { expect, test } from "@playwright/test";

test("app boots, dashboard renders balance card", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Overtide" })).toBeVisible();
  // BalanceCard renders "Available" only after useBalance resolves; allow extra
  // time on cold dev-server boot when React Query is doing its first fetch.
  await expect(page.getByText("Available").first()).toBeVisible({ timeout: 15_000 });
});

test("command palette opens with Ctrl+K", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("ControlOrMeta+K");
  await expect(
    page.getByPlaceholder("Type a command or jump to a page…"),
  ).toBeVisible();
});

test("navigates to /unlinked from top bar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Unlinked" }).click();
  await expect(page).toHaveURL(/\/unlinked$/);
});
