import { describe, expect, it } from "bun:test";
import {
  buildRedemptionDescription,
  buildRedemptionSubject,
  businessDaysBetween,
  createRedemptionRequestSchema,
  deriveInitials,
} from "./redemption-wizard";

describe("buildRedemptionSubject", () => {
  it("formats single day", () => {
    expect(buildRedemptionSubject({ startDate: "2026-05-04", endDate: "2026-05-04", initials: "OB" }))
      .toBe("Odbiór nadgodzin OB 04.05");
  });

  it("formats same-month range", () => {
    expect(buildRedemptionSubject({ startDate: "2026-05-04", endDate: "2026-05-08", initials: "OB" }))
      .toBe("Odbiór nadgodzin OB 04-08.05");
  });

  it("formats cross-month range", () => {
    expect(buildRedemptionSubject({ startDate: "2026-04-28", endDate: "2026-05-02", initials: "OB" }))
      .toBe("Odbiór nadgodzin OB 28.04-02.05");
  });

  it("falls back to ISO for cross-year range", () => {
    expect(buildRedemptionSubject({ startDate: "2026-12-30", endDate: "2027-01-02", initials: "OB" }))
      .toBe("Odbiór nadgodzin OB 2026-12-30 — 2027-01-02");
  });
});

describe("buildRedemptionDescription", () => {
  it("renders one line per allocation in input order", () => {
    const earnings = new Map([
      [114518, { id: 114518, subject: "R&D - support migracji" }],
      [115498, { id: 115498, subject: "Onboarding Foo" }],
    ]);
    const desc = buildRedemptionDescription(
      [{ earningId: 114518, hours: 4 }, { earningId: 115498, hours: 3.5 }],
      earnings,
    );
    expect(desc).toBe("Odbiór 4h z #114518 (R&D - support migracji)\nOdbiór 3.5h z #115498 (Onboarding Foo)");
  });

  it("falls back gracefully for unknown earnings", () => {
    const desc = buildRedemptionDescription([{ earningId: 1, hours: 1 }], new Map());
    expect(desc).toBe("Odbiór 1h z #1 (brak danych)");
  });
});

describe("deriveInitials", () => {
  it("returns uppercase first letters", () => {
    expect(deriveInitials({ firstname: "Oskar", lastname: "Białek" })).toBe("OB");
  });
  it("handles missing parts", () => {
    expect(deriveInitials({ firstname: "Oskar" })).toBe("O");
    expect(deriveInitials({})).toBe("");
  });
});

describe("businessDaysBetween", () => {
  it("counts single weekday", () => {
    expect(businessDaysBetween("2026-05-04", "2026-05-04")).toBe(1);
  });
  it("excludes weekends in a range", () => {
    expect(businessDaysBetween("2026-05-04", "2026-05-10")).toBe(5);
  });
  it("returns 0 for weekend-only", () => {
    expect(businessDaysBetween("2026-05-09", "2026-05-10")).toBe(0);
  });
  it("returns 0 when end < start", () => {
    expect(businessDaysBetween("2026-05-10", "2026-05-04")).toBe(0);
  });
});

describe("createRedemptionRequestSchema", () => {
  it("accepts a valid request", () => {
    const r = createRedemptionRequestSchema.parse({
      startDate: "2026-05-04",
      endDate: "2026-05-04",
      totalHours: 8,
      allocations: [{ earningId: 1, hours: 8 }],
    });
    expect(r.totalHours).toBe(8);
  });

  it("rejects mismatched sum", () => {
    expect(() => createRedemptionRequestSchema.parse({
      startDate: "2026-05-04",
      endDate: "2026-05-04",
      totalHours: 8,
      allocations: [{ earningId: 1, hours: 5 }],
    })).toThrow();
  });

  it("rejects endDate < startDate", () => {
    expect(() => createRedemptionRequestSchema.parse({
      startDate: "2026-05-05",
      endDate: "2026-05-04",
      totalHours: 8,
      allocations: [{ earningId: 1, hours: 8 }],
    })).toThrow();
  });

  it("rejects empty allocations", () => {
    expect(() => createRedemptionRequestSchema.parse({
      startDate: "2026-05-04",
      endDate: "2026-05-04",
      totalHours: 8,
      allocations: [],
    })).toThrow();
  });
});
