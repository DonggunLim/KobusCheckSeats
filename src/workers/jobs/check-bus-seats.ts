import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import * as cheerio from "cheerio";
import prisma from "../../shared/lib/prisma";
import type { RouteQuery, RouteScheduleSlot, CheckResult } from "../../shared/types/bus-check.types";
import { KOBUS } from "@/shared/constants/kobus";
import { getTargetDateKST } from "@/shared/lib/date";
import { buildRouteSearchParams } from "@/shared/lib/kobus-params";
import { logger } from "@/shared/lib/logger";

const log = logger.child({ module: "check-bus-seats" });

/**
 * axios + cheerio를 사용하여 코버스 사이트에서 버스 좌석을 확인합니다.
 */
export async function checkBusSeats(config: RouteQuery): Promise<CheckResult> {
  const { departureCd, arrivalCd, targetMonth, targetDate, targetTimes } = config;
  const startTime = Date.now();

  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar, timeout: KOBUS.HTTP.TIMEOUT }));

  const results: RouteScheduleSlot[] = [];
  let foundSeats = false;
  let firstFoundTime: string | null = null;

  try {
    await client.get(KOBUS.URLS.SESSION_COOKIE, {
      headers: {
        "User-Agent": KOBUS.HTTP.USER_AGENT,
        Accept: KOBUS.HTTP.HEADERS.ACCEPT_HTML,
      },
    });

    const { ymd, formatted } = getTargetDateKST(targetMonth, targetDate);
    const terminalNames = await getTerminalNames(departureCd, arrivalCd);

    const pageParams = buildRouteSearchParams(
      departureCd,
      terminalNames.departureName,
      arrivalCd,
      terminalNames.arrivalName,
      ymd,
      formatted
    );

    const response = await client.post(KOBUS.URLS.ROUTE_INFO, pageParams, {
      headers: {
        "Content-Type": KOBUS.HTTP.HEADERS.CONTENT_TYPE_FORM,
        "User-Agent": KOBUS.HTTP.USER_AGENT,
        Referer: KOBUS.URLS.SESSION_COOKIE,
        Accept: KOBUS.HTTP.HEADERS.ACCEPT_HTML,
      },
    });

    const $ = cheerio.load(response.data);
    const busRows = $(KOBUS.SELECTORS.BUS_ROWS);

    for (const time of targetTimes) {
      let found = false;

      busRows.each((_idx: number, row: cheerio.Element) => {
        const $row = $(row);

        const timeText = $row.find(KOBUS.SELECTORS.START_TIME).text().trim();
        const normalizedTime = timeText.replace(/\s+/g, "");

        if (normalizedTime === time) {
          const remainSeatsText = $row.find(KOBUS.SELECTORS.REMAIN_SEATS).text().trim();
          const statusText = $row.find(KOBUS.SELECTORS.STATUS).text().trim();

          const hasSeats =
            !statusText.includes(KOBUS.STATUS.SOLDOUT) &&
            !remainSeatsText.includes(KOBUS.STATUS.SEATS_ZERO);

          if (hasSeats) {
            foundSeats = true;
            if (!firstFoundTime) {
              firstFoundTime = time;
            }
          }

          results.push({ time, remainSeats: remainSeatsText, status: statusText, hasSeats });
          found = true;
        }
      });

      if (!found) {
        results.push({
          time,
          remainSeats: KOBUS.STATUS.NOT_AVAILABLE,
          status: KOBUS.STATUS.NO_INFO,
          hasSeats: false,
        });
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      timestamp: new Date().toISOString(),
      config,
      results,
      foundSeats,
      success: true,
      totalCheckCount: targetTimes.length,
      firstFoundTime,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error(
      { err: error instanceof Error ? error.message : String(error), departureCd, arrivalCd },
      "Seat check failed"
    );

    return {
      timestamp: new Date().toISOString(),
      config,
      results,
      foundSeats: false,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      totalCheckCount: targetTimes.length,
      firstFoundTime: null,
      durationMs,
    };
  }
}

async function getTerminalNames(
  departureCd: string,
  arrivalCd: string
): Promise<{ departureName: string; arrivalName: string }> {
  try {
    const terminals = await prisma.terminal.findMany({
      where: { terminalCd: { in: [departureCd, arrivalCd] } },
      select: { terminalCd: true, terminalNm: true },
    });

    const terminalMap = new Map(terminals.map((t) => [t.terminalCd, t.terminalNm]));
    return {
      departureName: terminalMap.get(departureCd) || departureCd,
      arrivalName: terminalMap.get(arrivalCd) || arrivalCd,
    };
  } catch (error) {
    log.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "DB lookup failed, using terminal codes as names"
    );
    return { departureName: departureCd, arrivalName: arrivalCd };
  }
}
