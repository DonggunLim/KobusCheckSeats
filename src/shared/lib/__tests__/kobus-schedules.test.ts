import { describe, expect, it } from "vitest";
import {
  hasAvailableSeats,
  KobusScheduleUnavailableError,
  parseKobusTimetable,
} from "../kobus-schedules";

// readAlcnSrch.ajax 응답을 줄인 것 (2026-11-17 실측 기준)
function alcn(time: string, seats: string, chc: string) {
  return {
    DEPR_TIME_DVS: time,
    BUS_CLS_NM: "우등",
    CACM_MN: "(주)동양고속",
    RMN_SATS_NUM: seats,
    TOT_SATS_NUM: "28",
    ALCN_CHC: chc,
  };
}

describe("parseKobusTimetable", () => {
  it("keeps sold-out and departing-soon buses with their seat counts", () => {
    const body = {
      rotVldChc: "Y",
      scsYn: "Y",
      alcnAllList: [
        alcn("09 : 20", "10", "chc"),
        alcn("10 : 00", "23", "time0"),
        alcn("24 : 00", "0", "cnt0"),
      ],
    };

    expect(parseKobusTimetable(body)).toEqual([
      {
        departureTime: "09:20",
        busClass: "우등",
        busCompany: "(주)동양고속",
        remainSeatsText: "10 석",
        remainSeats: 10,
        status: "예매가능",
      },
      {
        departureTime: "10:00",
        busClass: "우등",
        busCompany: "(주)동양고속",
        remainSeatsText: "23 석",
        remainSeats: 23,
        status: "출발임박",
      },
      {
        departureTime: "24:00",
        busClass: "우등",
        busCompany: "(주)동양고속",
        remainSeatsText: "0 석",
        remainSeats: 0,
        status: "매진",
      },
    ]);
  });

  it("returns no buses for a valid date without departures (e.g. before holiday sale opens)", () => {
    expect(parseKobusTimetable({ rotVldChc: "N", scsYn: "Y", allCnt: 0 })).toEqual([]);
  });

  it("reports past, out-of-window, and unknown-route lookups as unavailable", () => {
    expect(() => parseKobusTimetable({ rotVldChc: "N" })).toThrow(KobusScheduleUnavailableError);
    expect(() => parseKobusTimetable({ rotVldChc: "N", scsYn: "N", allCnt: 0 })).toThrow(
      KobusScheduleUnavailableError
    );
  });

  it("reports a missing session as a failure, not as an unavailable date", () => {
    expect(() => parseKobusTimetable({ rotVldChc: "F" })).toThrow(/세션/);
  });

  it("rejects responses that are not timetable JSON", () => {
    expect(() => parseKobusTimetable("<html>접속 대기 중</html>")).toThrow();
    expect(() =>
      parseKobusTimetable({ scsYn: "Y", alcnAllList: [{ DEPR_TIME_DVS: "09 : 20" }] })
    ).toThrow();
  });
});

describe("hasAvailableSeats", () => {
  const [bookable, departingSoon, soldOut] = parseKobusTimetable({
    scsYn: "Y",
    alcnAllList: [alcn("09 : 20", "10", "chc"), alcn("10 : 00", "3", "time0"), alcn("24 : 00", "0", "cnt0")],
  });

  it("counts buses with remaining seats, including departing-soon ones", () => {
    expect(hasAvailableSeats(bookable)).toBe(true);
    expect(hasAvailableSeats(departingSoon)).toBe(true);
  });

  it("treats sold-out buses as unavailable", () => {
    expect(hasAvailableSeats(soldOut)).toBe(false);
  });
});
