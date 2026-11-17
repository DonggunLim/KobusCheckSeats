import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/shared/lib/prisma";
import { parseSearchParams, terminalCdSchema } from "@/shared/lib/api-validation";
import { cache, TTL } from "@/shared/lib/cache";
import { getKobusDateFromISODate, getKSTDateString } from "@/shared/lib/date";
import { KOBUS } from "@/shared/constants/kobus";
import {
  fetchKobusRouteSchedules,
  hasAvailableSeats,
  KobusScheduleUnavailableError,
  type KobusScheduleData,
} from "@/shared/lib/kobus-schedules";
import { logger } from "@/shared/lib/logger";

const log = logger.child({ route: "schedules/times" });

const schema = z.object({
  departure: terminalCdSchema,
  arrival: terminalCdSchema,
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

type ScheduleSource = "live" | "cache";

interface TimeSeatSummary {
  remainSeats: number; // 같은 시각 버스들의 잔여석 합
  soldOut: boolean; // 같은 시각 버스가 모두 매진
  departingSoon: boolean; // 같은 시각 버스가 모두 출발임박 (웹 예매 불가, 앱 예매만 가능)
}

function buildScheduleResponse({
  departure,
  arrival,
  date,
  schedules,
}: {
  departure: string;
  arrival: string;
  date: string;
  schedules: KobusScheduleData[];
}) {
  const seats: Record<string, TimeSeatSummary> = {};
  const details: Record<string, { busClass: string | null; busCompany: string | null }[]> = {};

  for (const schedule of schedules) {
    const time = schedule.departureTime;
    const summary = (seats[time] ??= { remainSeats: 0, soldOut: true, departingSoon: true });
    summary.remainSeats += schedule.remainSeats;
    summary.soldOut &&= !hasAvailableSeats(schedule);
    summary.departingSoon &&= schedule.status === KOBUS.STATUS.DEPARTING_SOON;
    (details[time] ??= []).push({ busClass: schedule.busClass, busCompany: schedule.busCompany });
  }

  const times = Object.keys(seats).sort();
  return {
    success: true,
    departure,
    arrival,
    date,
    source: "live" as ScheduleSource,
    checkedAt: new Date().toISOString(),
    times,
    details,
    seats,
    count: times.length,
  };
}

/**
 * GET /api/schedules/times?departure=010&arrival=300&date=2026-05-27
 * 특정 노선/날짜의 출발 시각과 시각별 잔여석을 코버스에서 실시간으로 조회
 */
export async function GET(request: NextRequest) {
  try {
    const parsed = parseSearchParams(schema, request.nextUrl.searchParams);
    if (!parsed.success) return parsed.response;
    const { departure, arrival } = parsed.data;
    const date = parsed.data.date ?? getKSTDateString();

    const cacheKey = `schedules:${departure}:${arrival}:${date}`;
    const cached = cache.get<ReturnType<typeof buildScheduleResponse>>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, source: "cache" satisfies ScheduleSource });
    }

    // 공개 API이므로 알려진 터미널 코드만 코버스에 조회한다.
    const terminals = await prisma.terminal.findMany({
      where: { terminalCd: { in: [departure, arrival] } },
      select: { terminalCd: true },
    });
    const knownCodes = new Set(terminals.map((terminal) => terminal.terminalCd));

    if (!knownCodes.has(departure) || !knownCodes.has(arrival)) {
      return NextResponse.json({ error: "Terminal not found" }, { status: 404 });
    }

    try {
      const schedules = await fetchKobusRouteSchedules({
        route: { deprCd: departure, arvlCd: arrival },
        date: getKobusDateFromISODate(date),
      });
      const result = buildScheduleResponse({ departure, arrival, date, schedules });

      // 배차 0건은 명절 예매 오픈 전처럼 곧 바뀔 수 있으므로 캐시하지 않는다.
      if (result.count > 0) {
        cache.set(cacheKey, result, TTL.SCHEDULES);
      }
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof KobusScheduleUnavailableError) {
        return NextResponse.json({ error: error.message }, { status: 422 });
      }
      // 날짜와 무관한 예전 시간표로 대신 보여주면 틀린 시각을 고를 수 있으므로 실패를 그대로 알린다.
      log.warn({ err: error, departure, arrival, date }, "Live schedule lookup failed");
      return NextResponse.json(
        { error: "코버스 실시간 조회에 실패했습니다. 잠시 후 다시 시도해주세요." },
        { status: 502 }
      );
    }
  } catch (error) {
    log.error({ err: error }, "Error fetching schedule times");
    return NextResponse.json({ error: "Failed to fetch schedule times" }, { status: 500 });
  }
}
