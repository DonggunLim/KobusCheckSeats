import { describe, it, expect } from "vitest";
import { queueJobSchema, limitSchema, statusSchema } from "../api-validation";

describe("queueJobSchema", () => {
  const validJob = {
    departureCd: "010",
    arrivalCd: "300",
    targetMonth: "11월",
    targetDate: "18",
    targetTimes: ["09:00", "12:30"],
  };

  it("validates a correct job", () => {
    const result = queueJobSchema.safeParse(validJob);
    expect(result.success).toBe(true);
  });

  it("rejects invalid targetMonth format", () => {
    const result = queueJobSchema.safeParse({ ...validJob, targetMonth: "November" });
    expect(result.success).toBe(false);
  });

  it("rejects empty targetTimes", () => {
    const result = queueJobSchema.safeParse({ ...validJob, targetTimes: [] });
    expect(result.success).toBe(false);
  });

  it("rejects invalid time format", () => {
    const result = queueJobSchema.safeParse({ ...validJob, targetTimes: ["9:00"] });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const result = queueJobSchema.safeParse({ departureCd: "010" });
    expect(result.success).toBe(false);
  });
});

describe("limitSchema", () => {
  it("defaults to 20", () => {
    const result = limitSchema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(20);
  });

  it("rejects limit over 100", () => {
    const result = limitSchema.safeParse(101);
    expect(result.success).toBe(false);
  });

  it("accepts valid limit", () => {
    const result = limitSchema.safeParse(50);
    expect(result.success).toBe(true);
  });
});

describe("statusSchema", () => {
  it("accepts valid statuses", () => {
    for (const status of ["waiting", "active", "completed", "failed", "cancelled"]) {
      expect(statusSchema.safeParse(status).success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    expect(statusSchema.safeParse("unknown").success).toBe(false);
  });

  it("accepts undefined (optional)", () => {
    expect(statusSchema.safeParse(undefined).success).toBe(true);
  });
});
