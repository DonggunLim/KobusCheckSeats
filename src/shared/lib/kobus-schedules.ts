import axios, { type AxiosInstance } from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import { z } from "zod";
import { KOBUS } from "@/shared/constants/kobus";
import type { FormattedDate } from "@/shared/lib/date";

export interface KobusScheduleRoute {
  deprCd: string;
  arvlCd: string;
}

export interface ScheduleInfo {
  departureTime: string;
  busClass: string | null;
  busCompany: string | null;
}

export interface KobusScheduleData extends ScheduleInfo {
  remainSeatsText: string; // 예: "10 석"
  remainSeats: number;
  status: string; // 예: "예매가능", "매진", "출발임박"
}

/**
 * 코버스가 이 날짜/노선의 배차 조회 자체를 거부한 경우
 * (지난 날짜, 조회 가능 기간 밖의 날짜, 존재하지 않는 노선).
 */
export class KobusScheduleUnavailableError extends Error {
  constructor() {
    super("코버스에서 이 날짜/노선을 조회할 수 없습니다 (지난 날짜, 조회 가능 기간 밖, 또는 없는 노선)");
    this.name = "KobusScheduleUnavailableError";
  }
}

// 운행정보 > 시간표 조회 화면이 쓰는 readAlcnSrch.ajax 응답 (2026-11-17 실측 기준)
const timetableResponseSchema = z.object({
  rotVldChc: z.string().nullish(),
  scsYn: z.string().nullish(),
  alcnAllList: z
    .array(
      z.object({
        DEPR_TIME_DVS: z.string(), // "09 : 20"
        BUS_CLS_NM: z.string().nullish(),
        CACM_MN: z.string().nullish(),
        RMN_SATS_NUM: z.coerce.number().int().min(0),
        ALCN_CHC: z.string().nullish(), // chc | cnt0(매진) | time0(출발임박)
      })
    )
    .nullish(),
});

export async function createKobusScheduleClient(): Promise<AxiosInstance> {
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar, timeout: KOBUS.HTTP.TIMEOUT }));

  // 세션 쿠키 없이 조회하면 rotVldChc "F"만 돌려준다.
  await client.get(KOBUS.URLS.TIMETABLE_PAGE, {
    headers: {
      "User-Agent": KOBUS.HTTP.USER_AGENT,
      Accept: KOBUS.HTTP.HEADERS.ACCEPT_HTML,
    },
  });

  return client;
}

export async function fetchKobusRouteSchedules({
  route,
  date,
  client,
}: {
  route: KobusScheduleRoute;
  date: FormattedDate;
  client?: AxiosInstance;
}): Promise<KobusScheduleData[]> {
  const scheduleClient = client ?? (await createKobusScheduleClient());
  const params = new URLSearchParams({
    deprCd: route.deprCd,
    arvlCd: route.arvlCd,
    deprDtm: date.ymd,
    busClsCd: KOBUS.FORM.BUS_CLS_CD,
  });

  const response = await scheduleClient.post(KOBUS.URLS.TIMETABLE_SEARCH, params, {
    headers: {
      "Content-Type": KOBUS.HTTP.HEADERS.CONTENT_TYPE_FORM,
      "User-Agent": KOBUS.HTTP.USER_AGENT,
      Referer: KOBUS.URLS.TIMETABLE_PAGE,
      Accept: KOBUS.HTTP.HEADERS.ACCEPT_JSON,
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  return parseKobusTimetable(response.data);
}

/**
 * 시간표 조회 JSON에서 모든 배차(매진·출발임박 포함)를 추출한다.
 * - scsYn "Y": 정상 조회. 배차 0건(예: 명절 예매 오픈 전)도 정상 결과다.
 * - rotVldChc "F": 세션 없음 등 조회 실패 → 일반 오류
 * - 그 밖(scsYn "N"/없음): 지난 날짜·조회 기간 밖·없는 노선 → KobusScheduleUnavailableError
 */
export function parseKobusTimetable(body: unknown): KobusScheduleData[] {
  const parsed = timetableResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("코버스 배차 조회 응답 형식이 예상과 다릅니다");
  }

  const { rotVldChc, scsYn, alcnAllList } = parsed.data;

  if (scsYn !== "Y") {
    if (rotVldChc === "F") {
      throw new Error("코버스 배차 조회에 실패했습니다 (세션 없음)");
    }
    throw new KobusScheduleUnavailableError();
  }

  return (alcnAllList ?? []).map((alcn) => {
    const chc = alcn.ALCN_CHC ?? "";
    return {
      departureTime: alcn.DEPR_TIME_DVS.replace(/\s+/g, ""),
      busClass: alcn.BUS_CLS_NM || null,
      busCompany: alcn.CACM_MN || null,
      remainSeatsText: `${alcn.RMN_SATS_NUM} 석`,
      remainSeats: alcn.RMN_SATS_NUM,
      status: KOBUS.SEAT_STATUS[chc] ?? chc,
    };
  });
}

export function hasAvailableSeats(schedule: KobusScheduleData): boolean {
  return schedule.remainSeats > 0 && schedule.status !== KOBUS.STATUS.SOLDOUT;
}
