import { describe, expect, it } from "vitest";
import { queueJobSchema } from "../api-validation";

const base = {
  departureCd: "010",
  arrivalCd: "700",
  targetYear: 2027,
  targetMonth: "2월",
  targetDate: "6",
};

describe("queueJobSchema time selection", () => {
  it("accepts a departure-time range without exact times (e.g. holiday dates before sale opens)", () => {
    const result = queueJobSchema.safeParse({
      ...base,
      targetTimeRange: { start: "14:00", end: "24:00" },
      keepWatching: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetTimes).toEqual([]);
      expect(result.data.keepWatching).toBe(true);
    }
  });

  it("rejects requests that give both exact times and a range", () => {
    const result = queueJobSchema.safeParse({
      ...base,
      targetTimes: ["09:00"],
      targetTimeRange: { start: "14:00", end: "18:00" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a range whose start is after its end", () => {
    const result = queueJobSchema.safeParse({
      ...base,
      targetTimeRange: { start: "18:00", end: "14:00" },
    });
    expect(result.success).toBe(false);
  });

  it("defaults keepWatching to off", () => {
    const result = queueJobSchema.safeParse({ ...base, targetTimes: ["09:00"] });
    expect(result.success && result.data.keepWatching).toBe(false);
  });
});
