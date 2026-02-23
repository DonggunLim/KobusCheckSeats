// src/scripts/update-routes-schedules.ts
// 고속버스 노선별 시간표 크롤링 스크립트

import axios from "axios";
import { config } from "dotenv";
import prisma from "../lib/prisma";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import * as cheerio from "cheerio";
import { KOBUS } from "../constants/kobus";
import { getTargetKST } from "../lib/date";
import { buildRouteSearchParams } from "../lib/kobus-params";

const envFile = process.env.NODE_ENV === "production" ? ".env" : ".env.local";
config({ path: envFile });

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, timeout: KOBUS.HTTP.TIMEOUT }));

interface ScheduleData {
  deprCd: string;
  arvlCd: string;
  departureTime: string;
  busClass: string | null;
  busCompany: string | null;
  isViaRoute: boolean;
  viaLocation: string | null;
}

/**
 * 모든 활성 노선의 시간표 크롤링
 */
export async function getRoutesSchedules() {
  console.log("[CRAWL] 시간표 크롤링 시작");

  try {
    await client.get(KOBUS.URLS.SESSION_COOKIE, {
      headers: {
        "User-Agent": KOBUS.HTTP.USER_AGENT,
        Accept: KOBUS.HTTP.HEADERS.ACCEPT_HTML,
      },
    });

    const routes = await prisma.routesDirect.findMany({
      select: {
        deprCd: true,
        arvlCd: true,
        departureTerminal: { select: { terminalNm: true } },
        arrivalTerminal: { select: { terminalNm: true } },
      },
    });

    const { ymd: deprDt, formatted: deprDtAll } = getTargetKST(2);
    console.log(`[CRAWL] 대상 노선 ${routes.length}개 | 날짜: ${deprDt}`);

    let totalSchedules = 0;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const routeName = `${route.departureTerminal.terminalNm} → ${route.arrivalTerminal.terminalNm}`;

      try {
        const pageParams = buildRouteSearchParams(
          route.deprCd,
          route.departureTerminal.terminalNm,
          route.arvlCd,
          route.arrivalTerminal.terminalNm,
          deprDt,
          deprDtAll
        );

        const response = await client.post(KOBUS.URLS.ROUTE_INFO, pageParams, {
          headers: {
            "Content-Type": KOBUS.HTTP.HEADERS.CONTENT_TYPE_FORM,
            "User-Agent": KOBUS.HTTP.USER_AGENT,
            Referer: KOBUS.URLS.SESSION_COOKIE,
            Accept: KOBUS.HTTP.HEADERS.ACCEPT_HTML,
          },
        });

        // HTML 파싱
        const $ = cheerio.load(response.data);
        const scheduleLinks = $(KOBUS.SELECTORS.SCHEDULE_LINKS);

        if (scheduleLinks.length === 0) {
          failCount++;
          continue;
        }

        // 시간표 데이터 추출
        const scheduleList: ScheduleData[] = [];
        scheduleLinks.each((_idx: number, el: cheerio.Element) => {
          const $link = $(el);

          const timeText = $link.find(KOBUS.SELECTORS.START_TIME).text().trim();
          const time = timeText.replace(/\s+/g, "");

          // 등급 추출
          const gradeText = $link
            .find(KOBUS.SELECTORS.BUS_GRADE)
            .clone()
            .children()
            .remove()
            .end()
            .text()
            .trim();

          // 경유지 추출
          const viaText = $link
            .find(KOBUS.SELECTORS.VIA_LOCATION)
            .text()
            .trim();
          const viaLocation = viaText
            ? viaText.replace(/[()]/g, "").trim()
            : null;

          // 회사명 추출
          const company = $link
            .find(KOBUS.SELECTORS.BUS_COMPANY)
            .first()
            .text()
            .trim();

          scheduleList.push({
            deprCd: route.deprCd,
            arvlCd: route.arvlCd,
            departureTime: time,
            busClass: gradeText || null,
            busCompany: company || null,
            isViaRoute: !!viaLocation,
            viaLocation,
          });
        });

        if (scheduleList.length > 0) {
          const transaction = await prisma.$transaction([
            prisma.busSchedules.deleteMany({
              where: { deprCd: route.deprCd, arvlCd: route.arvlCd },
            }),
            prisma.busSchedules.createMany({
              data: scheduleList,
              skipDuplicates: true,
            }),
          ]);

          const createdCount = transaction[1].count;
          totalSchedules += createdCount;
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[CRAWL] ${routeName} 실패: ${errorMsg}`);
        failCount++;
      }

      // API 서버 부하 방지
      if (i < routes.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, KOBUS.HTTP.CRAWL_DELAY_MS)
        );
      }
    }

    console.log(
      `[CRAWL] 완료 | 처리: ${routes.length}개 | 성공: ${successCount}개 | 실패: ${failCount}개 | 총 배차: ${totalSchedules}개`
    );
  } catch (error) {
    console.error("[CRAWL] 크롤링 실패:", error);
  } finally {
    await prisma.$disconnect();
  }
}
