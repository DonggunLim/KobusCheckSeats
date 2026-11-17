import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type * as KobusSchedules from "../kobus-schedules";

vi.mock("@/shared/lib/prisma", () => ({
  default: {
    terminal: { findMany: vi.fn() },
  },
}));
vi.mock("@/shared/lib/kobus-schedules", async (importOriginal) => ({
  ...(await importOriginal<typeof KobusSchedules>()),
  fetchKobusRouteSchedules: vi.fn(),
}));

import prisma from "../prisma";
import { cache } from "../cache";
import { fetchKobusRouteSchedules, type KobusScheduleData } from "../kobus-schedules";
import { GET } from "@/app/api/schedules/times/route";

function bus(time: string, seats: number, status: string): KobusScheduleData {
  return {
    departureTime: time,
    busClass: "우등",
    busCompany: "금호고속",
    remainSeats: seats,
    remainSeatsText: `${seats} 석`,
    status,
  };
}

function request() {
  return new NextRequest("http://localhost/api/schedules/times?departure=010&arrival=700&date=2026-11-20");
}

beforeEach(() => {
  cache.deleteByPrefix("schedules:");
  vi.resetAllMocks();
  vi.mocked(prisma.terminal.findMany).mockResolvedValue([
    { terminalCd: "010", terminalNm: "서울경부", areaCd: "11" },
    { terminalCd: "700", terminalNm: "부산", areaCd: "26" },
  ]);
});

describe("time selection seat summary", () => {
  it("does not mark a time sold out when another bus at that time has seats", async () => {
    vi.mocked(fetchKobusRouteSchedules).mockResolvedValue([
      bus("09:00", 0, "매진"),
      bus("09:00", 10, "예매가능"),
      bus("10:00", 0, "매진"),
      bus("11:00", 3, "출발임박"),
    ]);

    const body = await (await GET(request())).json();
    expect(body.times).toEqual(["09:00", "10:00", "11:00"]);
    expect(body.seats).toEqual({
      "09:00": { remainSeats: 10, soldOut: false, departingSoon: false },
      "10:00": { remainSeats: 0, soldOut: true, departingSoon: false },
      "11:00": { remainSeats: 3, soldOut: false, departingSoon: true },
    });
    const cachedBody = await (await GET(request())).json();
    expect(cachedBody.checkedAt).toBe(body.checkedAt);
    expect(cachedBody.seats).toEqual(body.seats);
  });

  it("reports a live lookup failure instead of showing times that may not exist on that date", async () => {
    vi.mocked(fetchKobusRouteSchedules).mockRejectedValue(new Error("Connection failed"));

    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.times).toBeUndefined();
  });
});
