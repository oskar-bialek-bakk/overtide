import { expect, test } from "@playwright/test";

test("New redemption button opens the wizard dialog", async ({ page }) => {
  await page.goto("/redemptions");
  await page.getByTestId("new-redemption-btn").click();
  const dialog = page.getByRole("dialog", { name: "New redemption" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Step 1 of 4/)).toBeVisible();
  await expect(dialog.getByText(/Subject preview:/)).toBeVisible();
  await expect(dialog.getByText(/Odbiór nadgodzin OB/)).toBeVisible();
});

test("happy path: dates → earnings → days → preview → create (mocked API)", async ({ page }) => {
  // Mock the earnings list so the picker has something to choose from.
  await page.route("**/api/issues/earning", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: 114518,
            role: "earning",
            subject: "R&D - support migracji",
            projectName: "Projects",
            trackerName: "Dev",
            statusName: "Open",
            isClosed: false,
            createdOn: "2026-04-15T10:00:00Z",
            updatedOn: "2026-04-15T10:00:00Z",
            anchorDate: "2026-04-15",
            url: "http://r.test/issues/114518",
            earned: 8,
            consumed: 0,
            remaining: 8,
          },
        ],
      }),
    });
  });

  // Mock the create endpoint and capture the request body.
  let postedBody: unknown = null;
  await page.route("**/api/redemptions/create", async (route, req) => {
    postedBody = req.postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          issueId: 999,
          url: "http://r.test/issues/999",
          subject: "Odbiór nadgodzin OB 04.05",
        },
      }),
    });
  });

  await page.goto("/redemptions");
  await page.getByTestId("new-redemption-btn").click();

  // Step 1 — dates + total hours
  await page.getByLabel("Start").fill("2026-05-04");
  await page.getByLabel("End").fill("2026-05-04");
  // total hours auto-fills to 8 from businessDaysBetween
  await page.getByRole("button", { name: "Next" }).click();

  // Step 2 — earnings, click "Suggest FIFO" to fill in 8h on the only candidate
  await page.getByRole("button", { name: /Suggest FIFO/i }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // Step 3 — days, default is 8h on 2026-05-04 (single business day) so just advance
  await expect(page.getByLabel("Hours for 2026-05-04")).toHaveValue("8");
  await page.getByRole("button", { name: "Next" }).click();

  // Step 4 — preview, edit description, then create
  await expect(page.getByText("Odbiór nadgodzin OB 04.05").first()).toBeVisible();
  const description = page.getByTestId("wizard-description");
  await expect(description).toHaveValue(/Odbiór 8h z #114518/);
  await description.fill("Edited description for smoke test.");
  await page.getByRole("button", { name: "Create redemption" }).click();

  // Dialog closes after success
  await expect(page.getByRole("dialog", { name: "New redemption" })).toBeHidden();
  expect(postedBody).toMatchObject({
    startDate: "2026-05-04",
    endDate: "2026-05-04",
    totalHours: 8,
    allocations: [{ earningId: 114518, hours: 8 }],
    description: "Edited description for smoke test.",
    daySchedule: [{ date: "2026-05-04", hours: 8 }],
  });
});
