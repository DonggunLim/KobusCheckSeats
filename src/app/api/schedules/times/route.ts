import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/shared/lib/prisma";
import { parseSearchParams, terminalCdSchema } from "@/shared/lib/api-validation";
import { cache, TTL } from "@/shared/lib/cache";
import { logger } from "@/shared/lib/logger";

const log = logger.child({ route: "schedules/times" });

const schema = z.object({ departure: terminalCdSchema, arrival: terminalCdSchema });

/**
 * GET /api/schedules/times?departure=010&arrival=300
 * 특정 노선의 이용 가능한 출발 시간 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const parsed = parseSearchParams(schema, request.nextUrl.searchParams);
    if (!parsed.success) return parsed.response;
    const { departure, arrival } = parsed.data;

    const cacheKey = `schedules:${departure}:${arrival}`;
    const cached = cache.get(cacheKey);
    if (cached) return NextResponse.json(cached);

    // 해당 노선의 모든 시간대 조회
    const schedules = await prisma.busSchedules.findMany({
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

    if (schedules.length === 0) {
      return NextResponse.json({
        success: true,
        times: [],
        message: "No schedules found for this route",
      });
    }

    // 중복 제거된 시간 목록 (HH:MM 형식)
    const uniqueTimes = Array.from(new Set(schedules.map((s) => s.departureTime))).sort();

    // 시간별 상세 정보 (등급, 회사 등)
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

    const result = {
      success: true,
      departure,
      arrival,
      times: uniqueTimes,
      details: timeDetails,
      count: uniqueTimes.length,
    };

    cache.set(cacheKey, result, TTL.SCHEDULES);
    return NextResponse.json(result);
  } catch (error) {
    log.error({ err: error }, "Error fetching schedule times");
    return NextResponse.json({ error: "Failed to fetch schedule times" }, { status: 500 });
  }
}
