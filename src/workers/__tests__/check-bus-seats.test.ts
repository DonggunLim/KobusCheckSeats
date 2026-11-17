import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as KobusSchedules from "@/shared/lib/kobus-schedules";

vi.mock("@/shared/lib/kobus-schedules", async (importOriginal) => ({
  ...(await importOriginal<typeof KobusSchedules>()),
  createKobusScheduleClient: vi.fn(),
  fetchKobusRouteSchedules: vi.fn(),
}));

import {
  createKobusScheduleClient,
  fetchKobusRouteSchedules,
  KobusScheduleUnavailableError,
  KobusSessionError,
  type KobusScheduleData,
} from "@/shared/lib/kobus-schedules";
import { checkBusSeats } from "../jobs/check-bus-seats";

function bus(time: string, seats: number, status = seats > 0 ? "예매가능" : "매진"): KobusScheduleData {
  return { departureTime: time, busClass: "우등", busCompany: "금호", remainSeats: seats, remainSeatsText: `${seats} 석`, status };
}

const query = { departureCd: "010", arrivalCd: "700", targetYear: 2026, targetMonth: "11월", targetDate: "20", targetTimes: [] };

beforeEach(() => {
  vi.mocked(createKobusScheduleClient).mockReset().mockImplementation(async () => ({}) as never);
  vi.mocked(fetchKobusRouteSchedules).mockReset();
});

describe("checkBusSeats", () => {
  it("checks every bus inside the range, including midnight '24:00' departures", async () => {
    vi.mocked(fetchKobusRouteSchedules).mockResolvedValue([
      bus("13:50", 9),
      bus("14:00", 0),
      bus("17:20", 0),
      bus("24:00", 2),
    ]);

    const result = await checkBusSeats({ ...query, targetTimeRange: { start: "14:00", end: "24:00" } });

    expect(result.results.map((slot) => slot.time)).toEqual(["14:00", "17:20", "24:00"]);
    expect(result.foundSeats).toBe(true);
    expect(result.firstFoundTime).toBe("24:00");
  });

  it("reports a range with no buses yet as no information, not as an error", async () => {
    vi.mocked(fetchKobusRouteSchedules).mockResolvedValue([]);
    const result = await checkBusSeats({ ...query, targetTimeRange: { start: "14:00", end: "18:00" } });
    expect(result.success).toBe(true);
    expect(result.results).toEqual([
      { time: "14:00~18:00", remainSeats: "N/A", status: "정보 없음", hasSeats: false },
    ]);
  });

  it("retries once with a fresh Kobus session when the shared session has expired", async () => {
    vi.mocked(fetchKobusRouteSchedules)
      .mockRejectedValueOnce(new KobusSessionError())
      .mockResolvedValueOnce([bus("09:00", 3)]);

    const result = await checkBusSeats({ ...query, targetTimes: ["09:00"] });

    expect(result.success).toBe(true);
    expect(result.foundSeats).toBe(true);
    expect(createKobusScheduleClient).toHaveBeenCalledTimes(1);
  });

  it("separates date/route refusals from integration failures", async () => {
    vi.mocked(fetchKobusRouteSchedules).mockRejectedValueOnce(new KobusScheduleUnavailableError());
    const unavailable = await checkBusSeats({ ...query, targetTimes: ["09:00"] });
    expect(unavailable).toMatchObject({ success: false, errorKind: "unavailable" });

    vi.mocked(fetchKobusRouteSchedules).mockRejectedValueOnce(new Error("timeout"));
    const failure = await checkBusSeats({ ...query, targetTimes: ["09:00"] });
    expect(failure).toMatchObject({ success: false, errorKind: "failure" });
  });
});
