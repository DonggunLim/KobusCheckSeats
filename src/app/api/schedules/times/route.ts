import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/shared/lib/prisma";
import { parseSearchParams, terminalCdSchema } from "@/shared/lib/api-validation";
import { cache, TTL } from "@/shared/lib/cache";
import { getKobusDateFromISODate, getKSTDateString } from "@/shared/lib/date";
import { fetchKobusRouteSchedules, type KobusScheduleData } from "@/shared/lib/kobus-schedules";
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

type ScheduleSource = "live" | "cache" | "db-fallback";

function buildScheduleResponse({
  departure,
  arrival,
  date,
  source,
  schedules,
}: {
  departure: string;
  arrival: string;
  date: string;
  source: ScheduleSource;
  schedules: KobusScheduleData[];
}) {
  const uniqueTimes = Array.from(new Set(schedules.map((s) => s.departureTime))).sort();
  const timeDetails = schedules.reduce(
    (acc, schedule) => {
      const time = schedule.departureTime;
      if (!acc[time]) {
        acc[time] = [];
      }
      acc[time].push({
        busClass: schedule.busClass,
        busCompany: schedule.busCompany,
        isViaRoute: schedule.isViaRoute,
        viaLocation: schedule.viaLocation,
      });
      return acc;
    },
    {} as Record<
      string,
      {
        busClass: string | null;
        busCompany: string | null;
        isViaRoute: boolean;
        viaLocation: string | null;
      }[]
    >
  );

  return {
    success: true,
    departure,
    arrival,
    date,
    source,
    times: uniqueTimes,
    details: timeDetails,
    count: uniqueTimes.length,
  };
}

async function getFallbackSchedules(
  departure: string,
  arrival: string
): Promise<KobusScheduleData[]> {
  return prisma.busSchedules.findMany({
    where: {
      deprCd: departure,
      arvlCd: arrival,
    },
    select: {
      departureTime: true,
      busClass: true,
      busCompany: true,
      isViaRoute: true,
      viaLocation: true,
    },
    orderBy: {
      departureTime: "asc",
    },
  });
}

/**
 * GET /api/schedules/times?departure=010&arrival=300&date=2026-05-27
 * 특정 노선/날짜의 이용 가능한 출발 시간 목록 조회
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

    const terminals = await prisma.terminal.findMany({
      where: { terminalCd: { in: [departure, arrival] } },
      select: {
        terminalCd: true,
        terminalNm: true,
      },
    });
    const terminalMap = new Map(
      terminals.map((terminal) => [terminal.terminalCd, terminal.terminalNm])
    );
    const departureName = terminalMap.get(departure);
    const arrivalName = terminalMap.get(arrival);

    if (!departureName || !arrivalName) {
      return NextResponse.json({ error: "Terminal not found" }, { status: 404 });
    }

    try {
      const schedules = await fetchKobusRouteSchedules({
        route: {
          deprCd: departure,
          deprNm: departureName,
          arvlCd: arrival,
          arvlNm: arrivalName,
        },
        date: getKobusDateFromISODate(date),
      });

      const result = buildScheduleResponse({
        departure,
        arrival,
        date,
        source: "live",
        schedules,
      });

      cache.set(cacheKey, result, TTL.SCHEDULES);
      return NextResponse.json(result);
    } catch (error) {
      log.warn(
        { err: error, departure, arrival, date },
        "Live schedule lookup failed, using DB fallback"
      );
      const fallbackSchedules = await getFallbackSchedules(departure, arrival);
      const result = buildScheduleResponse({
        departure,
        arrival,
        date,
        source: "db-fallback",
        schedules: fallbackSchedules,
      });

      return NextResponse.json(result);
    }
  } catch (error) {
    log.error({ err: error }, "Error fetching schedule times");
    return NextResponse.json({ error: "Failed to fetch schedule times" }, { status: 500 });
  }
}
