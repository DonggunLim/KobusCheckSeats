import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/shared/lib/prisma";
import { auth } from "@/shared/lib/auth";
import { parseSearchParams, limitSchema, statusSchema } from "@/shared/lib/api-validation";
import { logger } from "@/shared/lib/logger";

const log = logger.child({ route: "jobs/history" });

const schema = z.object({ limit: limitSchema, status: statusSchema });

/**
 * GET /api/jobs/history
 * 잡 히스토리 목록 조회 (최신순, 본인 잡만)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const parsed = parseSearchParams(schema, request.nextUrl.searchParams);
    if (!parsed.success) return parsed.response;
    const { limit, status } = parsed.data;

    const whereClause = {
      userId,
      ...(status ? { status } : {}),
    };

    const jobs = await prisma.jobHistory.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    const parsedJobs = jobs.map((job) => ({
      ...job,
      targetTimes: JSON.parse(job.targetTimes),
      result: job.result ? JSON.parse(job.result) : null,
    }));

    return NextResponse.json({
      success: true,
      jobs: parsedJobs,
      count: parsedJobs.length,
    });
  } catch (error) {
    log.error({ err: error }, "Failed to fetch job history");
    return NextResponse.json({ success: false, error: "Failed to fetch job history" }, { status: 500 });
  }
}
