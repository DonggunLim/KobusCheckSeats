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

export interface KobusScheduleData {
  departureTime: string;
  busClass: string | null;
  busCompany: string | null;
  isViaRoute: boolean;
  viaLocation: string | null;
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

  const response = await scheduleClient.post(KOBUS.URLS.ROUTE_INFO, pageParams, {
    headers: {
      "Content-Type": KOBUS.HTTP.HEADERS.CONTENT_TYPE_FORM,
      "User-Agent": KOBUS.HTTP.USER_AGENT,
      Referer: KOBUS.URLS.SESSION_COOKIE,
      Accept: KOBUS.HTTP.HEADERS.ACCEPT_HTML,
    },
  });

  return parseKobusScheduleHtml(response.data);
}

export function parseKobusScheduleHtml(html: string): KobusScheduleData[] {
  const $ = cheerio.load(html);
  const scheduleList: KobusScheduleData[] = [];

  $(KOBUS.SELECTORS.SCHEDULE_LINKS).each((_idx: number, el: cheerio.Element) => {
    const $link = $(el);
    const timeText = $link.find(KOBUS.SELECTORS.START_TIME).text().trim();
    const departureTime = timeText.replace(/\s+/g, "");

    if (!departureTime) return;

    const gradeText = $link
      .find(KOBUS.SELECTORS.BUS_GRADE)
      .clone()
      .children()
      .remove()
      .end()
      .text()
      .trim();

    const viaText = $link.find(KOBUS.SELECTORS.VIA_LOCATION).text().trim();
    const viaLocation = viaText ? viaText.replace(/[()]/g, "").trim() : null;
    const company = $link.find(KOBUS.SELECTORS.BUS_COMPANY).first().text().trim();

    scheduleList.push({
      departureTime,
      busClass: gradeText || null,
      busCompany: company || null,
      isViaRoute: !!viaLocation,
      viaLocation,
    });
  });

  return scheduleList;
}
