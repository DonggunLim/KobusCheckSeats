// src/scripts/update-routes-schedules.ts
// 고속버스 노선별 시간표 크롤링 스크립트

import { config } from "dotenv";
import prisma from "../lib/prisma";
import { KOBUS } from "../constants/kobus";
import { getTargetKST } from "../lib/date";
import { createKobusScheduleClient, fetchKobusRouteSchedules } from "../lib/kobus-schedules";

const envFile = process.env.NODE_ENV === "production" ? ".env" : ".env.local";
config({ path: envFile });

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
export async function getRoutesSchedules(options: { disconnect?: boolean } = {}) {
  console.log("[CRAWL] 시간표 크롤링 시작");

  try {
    const client = await createKobusScheduleClient();

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
        const schedules = await fetchKobusRouteSchedules({
          route: {
            deprCd: route.deprCd,
            deprNm: route.departureTerminal.terminalNm,
            arvlCd: route.arvlCd,
            arvlNm: route.arrivalTerminal.terminalNm,
          },
          date: { ymd: deprDt, formatted: deprDtAll },
          client,
        });

        if (schedules.length === 0) {
          failCount++;
          continue;
        }

        // 시간표 데이터 추출
        const scheduleList: ScheduleData[] = schedules.map((schedule) => ({
          deprCd: route.deprCd,
          arvlCd: route.arvlCd,
          departureTime: schedule.departureTime,
          busClass: schedule.busClass,
          busCompany: schedule.busCompany,
          isViaRoute: schedule.isViaRoute,
          viaLocation: schedule.viaLocation,
        }));

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
        await new Promise((resolve) => setTimeout(resolve, KOBUS.HTTP.CRAWL_DELAY_MS));
      }
    }

    console.log(
      `[CRAWL] 완료 | 처리: ${routes.length}개 | 성공: ${successCount}개 | 실패: ${failCount}개 | 총 배차: ${totalSchedules}개`
    );
  } catch (error) {
    console.error("[CRAWL] 크롤링 실패:", error);
    throw error;
  } finally {
    if (options.disconnect) {
      await prisma.$disconnect();
    }
  }
}

if (process.argv[1]?.endsWith("update-routes-schedules.ts")) {
  getRoutesSchedules({ disconnect: true }).catch(() => {
    process.exitCode = 1;
  });
}
