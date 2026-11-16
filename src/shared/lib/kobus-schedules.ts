import axios, { type AxiosInstance } from "axios";
import { wrapper } from "axios-cookiejar-support";
import * as cheerio from "cheerio";
import { CookieJar } from "tough-cookie";
import { KOBUS } from "@/shared/constants/kobus";
import { buildRouteSearchParams } from "@/shared/lib/kobus-params";
import type { FormattedDate } from "@/shared/lib/date";

export interface KobusScheduleRoute {
  deprCd: string;
  deprNm: string;
  arvlCd: string;
  arvlNm: string;
}

export interface ScheduleInfo {
  departureTime: string;
  busClass: string | null;
  busCompany: string | null;
  isViaRoute: boolean;
  viaLocation: string | null;
}

export interface KobusScheduleData extends ScheduleInfo {
  remainSeatsText: string; // 원문 (예: "10 석")
  remainSeats: number | null; // 원문에서 읽은 잔여석 수, 읽지 못하면 null
  status: string; // 예: "선택", "매진", "출발임박"
}

/**
 * Kobus가 결과 페이지 대신 다른 페이지로 돌려보낸 경우
 * (지난 날짜, 조회 가능 기간 밖의 날짜, 존재하지 않는 노선 등).
 */
export class KobusScheduleUnavailableError extends Error {
  constructor(detail: string | null) {
    super(
      detail
        ? `코버스에서 이 날짜/노선을 조회할 수 없습니다: ${detail}`
        : "코버스에서 이 날짜/노선을 조회할 수 없습니다 (지난 날짜이거나 조회 가능 기간 밖)"
    );
    this.name = "KobusScheduleUnavailableError";
  }
}

export async function createKobusScheduleClient(): Promise<AxiosInstance> {
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar, timeout: KOBUS.HTTP.TIMEOUT }));

  await client.get(KOBUS.URLS.SESSION_COOKIE, {
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
  const pageParams = buildRouteSearchParams(
    route.deprCd,
    route.deprNm,
    route.arvlCd,
    route.arvlNm,
    date.ymd,
    date.formatted
  );

  // 리다이렉트를 따라가면 노선 선택 화면(200)을 "배차 0건"으로 오인하므로 직접 판별한다.
  const response = await scheduleClient.post(KOBUS.URLS.ROUTE_INFO, pageParams, {
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400,
    headers: {
      "Content-Type": KOBUS.HTTP.HEADERS.CONTENT_TYPE_FORM,
      "User-Agent": KOBUS.HTTP.USER_AGENT,
      Referer: KOBUS.URLS.SESSION_COOKIE,
      Accept: KOBUS.HTTP.HEADERS.ACCEPT_HTML,
    },
  });

  if (response.status >= 300) {
    throw new KobusScheduleUnavailableError(
      getRedirectMessage(response.headers.location as string | undefined)
    );
  }

  return parseKobusScheduleHtml(response.data);
}

function getRedirectMessage(location: string | undefined): string | null {
  if (!location) return null;
  try {
    return new URL(location, KOBUS.URLS.ROUTE_INFO).searchParams.get("MSG_DTL_CTT");
  } catch {
    return null;
  }
}

/**
 * 배차 조회 결과 HTML에서 모든 배차(매진·출발임박 포함)를 추출한다.
 * 결과 표가 없는 페이지(대기열·점검·구조 변경 등)는 "배차 0건"과 구분하기 위해 예외를 던진다.
 */
export function parseKobusScheduleHtml(html: string): KobusScheduleData[] {
  const $ = cheerio.load(html);

  if ($(KOBUS.SELECTORS.SCHEDULE_TABLE).length === 0) {
    throw new Error("코버스 배차 조회 결과 형식이 아닙니다");
  }

  const scheduleList: KobusScheduleData[] = [];

  $(KOBUS.SELECTORS.BUS_ROWS).each((_idx: number, el: cheerio.Element) => {
    const $row = $(el);
    const departureTime = $row.find(KOBUS.SELECTORS.START_TIME).text().replace(/\s+/g, "");

    if (!departureTime) return;

    const gradeText = $row
      .find(KOBUS.SELECTORS.BUS_GRADE)
      .clone()
      .children()
      .remove()
      .end()
      .text()
      .trim();

    const viaText = $row.find(KOBUS.SELECTORS.VIA_LOCATION).text().trim();
    const viaLocation = viaText ? viaText.replace(/[()]/g, "").trim() : null;
    const company = $row.find(KOBUS.SELECTORS.BUS_COMPANY).first().text().trim();
    const remainSeatsText = $row.find(KOBUS.SELECTORS.REMAIN_SEATS).text().trim();
    const seatMatch = remainSeatsText.match(/(\d+)\s*석/);

    scheduleList.push({
      departureTime,
      busClass: gradeText || null,
      busCompany: company || null,
      isViaRoute: !!viaLocation,
      viaLocation,
      remainSeatsText,
      remainSeats: seatMatch ? Number(seatMatch[1]) : null,
      status: $row.find(KOBUS.SELECTORS.STATUS).text().replace(/\s+/g, " ").trim(),
    });
  });

  return scheduleList;
}

export function hasAvailableSeats(schedule: KobusScheduleData): boolean {
  return (
    schedule.remainSeats !== null &&
    schedule.remainSeats > 0 &&
    !schedule.status.includes(KOBUS.STATUS.SOLDOUT)
  );
}
