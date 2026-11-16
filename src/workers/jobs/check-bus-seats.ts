import prisma from "../../shared/lib/prisma";
import type { RouteQuery, RouteScheduleSlot, CheckResult } from "../../shared/types/bus-check.types";
import { KOBUS } from "@/shared/constants/kobus";
import { getTargetDateKST } from "@/shared/lib/date";
import { fetchKobusRouteSchedules, hasAvailableSeats } from "@/shared/lib/kobus-schedules";
import { logger } from "@/shared/lib/logger";

const log = logger.child({ module: "check-bus-seats" });

/**
 * 코버스 배차 조회 결과에서 목표 시간대의 잔여 좌석을 확인합니다.
 * 조회 결과 페이지를 받지 못하면(리다이렉트, 대기열, 구조 변경 등) "좌석 없음"이 아닌 실패로 반환합니다.
 */
export async function checkBusSeats(config: RouteQuery): Promise<CheckResult> {
  const { departureCd, arrivalCd, targetYear, targetMonth, targetDate, targetTimes } = config;
  const startTime = Date.now();

  const results: RouteScheduleSlot[] = [];
  let foundSeats = false;
  let firstFoundTime: string | null = null;

  try {
    const terminalNames = await getTerminalNames(departureCd, arrivalCd);
    const schedules = await fetchKobusRouteSchedules({
      route: {
        deprCd: departureCd,
        deprNm: terminalNames.departureName,
        arvlCd: arrivalCd,
        arvlNm: terminalNames.arrivalName,
      },
      date: getTargetDateKST(targetMonth, targetDate, targetYear),
    });

    for (const time of targetTimes) {
      const matches = schedules.filter((schedule) => schedule.departureTime === time);

      if (matches.length === 0) {
        results.push({
          time,
          remainSeats: KOBUS.STATUS.NOT_AVAILABLE,
          status: KOBUS.STATUS.NO_INFO,
          hasSeats: false,
        });
        continue;
      }

      for (const schedule of matches) {
        const hasSeats = hasAvailableSeats(schedule);
        if (hasSeats) {
          foundSeats = true;
          firstFoundTime ??= time;
        }
        results.push({
          time,
          remainSeats: schedule.remainSeatsText,
          status: schedule.status,
          hasSeats,
        });
      }
    }

    return {
      timestamp: new Date().toISOString(),
      config,
      results,
      foundSeats,
      success: true,
      totalCheckCount: targetTimes.length,
      firstFoundTime,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
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
      durationMs: Date.now() - startTime,
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
