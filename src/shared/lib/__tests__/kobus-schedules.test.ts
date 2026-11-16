import type { AxiosInstance } from "axios";
import { describe, expect, it } from "vitest";
import {
  fetchKobusRouteSchedules,
  hasAvailableSeats,
  KobusScheduleUnavailableError,
  parseKobusScheduleHtml,
} from "../kobus-schedules";

// Kobus alcnSrch.do 응답 구조를 줄인 것 (2026-11-17 실제 응답 기준)
function schedulePage(rows: string): string {
  return `
    <div class="bustime_wrap" role="table">
      <a class="bustime_head" role="row"><span class="start_time">출발</span></a>
      <div class="bus_time" role="row" aria-rowindex="1">${rows}</div>
    </div>`;
}

const bookableRow = `
  <p class="" data-time="09" role="row">
    <a href="javascript:void(0)" class="" onclick="fnSatsChc('20261120','092000')">
      <span class="start_time">09 : 20</span>
      <span class="bus_com"><span class="dyexpress">(주)동양고속</span></span>
      <span class="grade">우등 <span class="via">(천안)</span></span>
      <span class="remain">10 석</span>
      <span class="status"><span class="accent btn_arrow">선택</span></span>
    </a>
  </p>`;

const soldOutRow = `
  <p class="premium2" data-time="23" role="row">
    <a href="javascript:void(0)" class="noselect">
      <span class="start_time">24 : 00</span>
      <span class="bus_com"><span class="dyexpress">(주)동양고속</span></span>
      <span class="grade">심야프리미엄 <span class="via"></span></span>
      <span class="remain">0 석</span>
      <span class="status">매진</span>
    </a>
  </p>`;

describe("parseKobusScheduleHtml", () => {
  it("keeps sold-out departures and reads remaining seats", () => {
    expect(parseKobusScheduleHtml(schedulePage(bookableRow + soldOutRow))).toEqual([
      {
        departureTime: "09:20",
        busClass: "우등",
        busCompany: "(주)동양고속",
        isViaRoute: true,
        viaLocation: "천안",
        remainSeatsText: "10 석",
        remainSeats: 10,
        status: "선택",
      },
      {
        departureTime: "24:00",
        busClass: "심야프리미엄",
        busCompany: "(주)동양고속",
        isViaRoute: false,
        viaLocation: null,
        remainSeatsText: "0 석",
        remainSeats: 0,
        status: "매진",
      },
    ]);
  });

  it("returns no departures for a result page without buses", () => {
    const html = schedulePage(`<div class="noti" id="notiToday"><p>조회되는 배차가 없습니다.</p></div>`);

    expect(parseKobusScheduleHtml(html)).toEqual([]);
  });

  it("rejects pages that are not schedule results", () => {
    expect(() => parseKobusScheduleHtml("<html><body>접속 대기 중입니다</body></html>")).toThrow();
  });
});

describe("hasAvailableSeats", () => {
  const [bookable, soldOut] = parseKobusScheduleHtml(schedulePage(bookableRow + soldOutRow));

  it("treats seat counts ending in zero as available", () => {
    expect(hasAvailableSeats(bookable)).toBe(true);
  });

  it("treats sold-out departures as unavailable", () => {
    expect(hasAvailableSeats(soldOut)).toBe(false);
  });
});

describe("fetchKobusRouteSchedules", () => {
  it("reports a Kobus redirect as unavailable instead of an empty schedule", async () => {
    const client = {
      post: async () => ({
        status: 302,
        headers: {
          location:
            "https://www.kobus.co.kr/mrs/rotinf.do?scsYn=N&MSG_DTL_CTT=%EB%85%B8%EC%84%A0%2C%ED%95%B4%EB%8B%B9+%EC%9E%90%EB%A3%8C%EA%B0%80+%EC%A1%B4%EC%9E%AC%ED%95%98%EC%A7%80+%EC%95%8A%EC%8A%B5%EB%8B%88%EB%8B%A4.",
        },
        data: "",
      }),
    } as unknown as AxiosInstance; // only post() is used by fetchKobusRouteSchedules

    await expect(
      fetchKobusRouteSchedules({
        route: { deprCd: "010", deprNm: "서울경부", arvlCd: "999", arvlNm: "없음" },
        date: { ymd: "20261120", formatted: "2026. 11. 20. (금)" },
        client,
      })
    ).rejects.toThrow(
      new KobusScheduleUnavailableError("노선,해당 자료가 존재하지 않습니다.")
    );
  });
});
