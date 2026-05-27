import { describe, expect, it } from "vitest";
import { getKobusDateFromISODate } from "../date";

describe("getKobusDateFromISODate", () => {
  it("formats an ISO date into Kobus ymd format", () => {
    expect(getKobusDateFromISODate("2026-05-27").ymd).toBe("20260527");
  });
});
