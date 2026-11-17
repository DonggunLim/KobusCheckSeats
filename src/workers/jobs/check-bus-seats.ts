import type { AxiosInstance } from "axios";
import type {
  RouteQuery,
  RouteScheduleSlot,
  CheckResult,
} from "../../shared/types/bus-check.types";
import { KOBUS } from "@/shared/constants/kobus";
import { getTargetDateKST, type FormattedDate } from "@/shared/lib/date";
import {
  createKobusScheduleClient,
  fetchKobusRouteSchedules,
  hasAvailableSeats,
  KobusScheduleUnavailableError,
  KobusSessionError,
  type KobusScheduleData,
  type KobusScheduleRoute,
} from "@/shared/lib/kobus-schedules";
import { logger } from "@/shared/lib/logger";

const log = logger.child({ module: "check-bus-seats" });

// 매 확인마다 세션 페이지를 다시 받지 않도록 워커 프로세스에서 코버스 세션을 공유한다.
let sharedClient: Promise<AxiosInstance> | null = null;

function getSharedClient(): Promise<AxiosInstance> {
  sharedClient ??= createKobusScheduleClient().catch((error: unknown) => {
    sharedClient = null;
    throw error;
  });
  return sharedClient;
}

async function fetchSchedules(
  route: KobusScheduleRoute,
  date: FormattedDate
): Promise<KobusScheduleData[]> {
  try {
    return await fetchKobusRouteSchedules({ route, date, client: await getSharedClient() });
  } catch (error) {
    if (!(error instanceof KobusSessionError)) throw error;
    // 세션이 만료됐으면 새 세션으로 한 번만 다시 조회한다.
    sharedClient = null;
    return fetchKobusRouteSchedules({ route, date, client: await getSharedClient() });
  }
}

/**
 * 코버스 배차 조회 결과에서 목표 시간(또는 시간대 범위)의 잔여 좌석을 확인합니다.
 * 조회 응답을 받지 못하면(조회 거부, 세션 실패, 형식 변경 등) "좌석 없음"이 아닌 실패로 반환합니다.
 */
export async function checkBusSeats(config: RouteQuery): Promise<CheckResult> {
  const {
    departureCd,
    arrivalCd,
    targetYear,
    targetMonth,
    targetDate,
    targetTimes,
    targetTimeRange,
  } = config;
  const startTime = Date.now();

  // 시간대 범위면 범위 안에 출발하는 모든 버스(나중에 추가된 임시차 포함)를 확인한다.
  const targets = targetTimeRange
    ? [
        {
          label: `${targetTimeRange.start}~${targetTimeRange.end}`,
          matches: (time: string) => time >= targetTimeRange.start && time <= targetTimeRange.end,
        },
      ]
    : targetTimes.map((target) => ({ label: target, matches: (time: string) => time === target }));

  try {
    const schedules = await fetchSchedules(
      { deprCd: departureCd, arvlCd: arrivalCd },
      getTargetDateKST(targetMonth, targetDate, targetYear)
    );

    const results: RouteScheduleSlot[] = [];
    for (const target of targets) {
      const matches = schedules.filter((schedule) => target.matches(schedule.departureTime));

      if (matches.length === 0) {
        results.push({
          time: target.label,
          remainSeats: KOBUS.STATUS.NOT_AVAILABLE,
          status: KOBUS.STATUS.NO_INFO,
          hasSeats: false,
        });
        continue;
      }

      for (const schedule of matches) {
        results.push({
          time: schedule.departureTime,
          remainSeats: schedule.remainSeatsText,
          status: schedule.status,
          hasSeats: hasAvailableSeats(schedule),
        });
      }
    }

    const firstFound = results.find((slot) => slot.hasSeats);
    return {
      timestamp: new Date().toISOString(),
      config,
      results,
      foundSeats: !!firstFound,
      success: true,
      totalCheckCount: targets.length,
      firstFoundTime: firstFound?.time ?? null,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({ err: message, departureCd, arrivalCd }, "Seat check failed");

    return {
      timestamp: new Date().toISOString(),
      config,
      results: [],
      foundSeats: false,
      success: false,
      error: message,
      errorKind: error instanceof KobusScheduleUnavailableError ? "unavailable" : "failure",
      totalCheckCount: targets.length,
      firstFoundTime: null,
      durationMs: Date.now() - startTime,
    };
  }
}
