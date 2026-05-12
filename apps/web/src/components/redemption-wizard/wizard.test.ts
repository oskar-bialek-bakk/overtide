import { describe, expect, it } from "vitest";
import { buildRedemptionSubject, businessDaysBetween } from "@overtide/shared";

// Sanity test that the web bundle resolves the shared builder so the preview
// in step 3 of the wizard stays parity-aligned with the backend.
describe("shared redemption helpers (from web)", () => {
  it("subject preview matches the backend output for a single day", () => {
    expect(buildRedemptionSubject({ startDate: "2026-05-04", endDate: "2026-05-04", initials: "OB" }))
      .toBe("Odbiór nadgodzin OB 04.05");
  });

  it("businessDaysBetween returns expected count for a typical work week", () => {
    expect(businessDaysBetween("2026-05-04", "2026-05-08")).toBe(5);
  });
});
