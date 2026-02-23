import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCheckSeatsQueue, type CheckSeatsJobData } from "@/shared/lib/queue/queue";
import prisma from "@/shared/lib/prisma";
import { getKSTNow } from "@/shared/lib/date";
import { auth } from "@/shared/lib/auth";
import { JOB_CANCEL_REASON_KEY } from "@/shared/constants/job";
import { parseBody, parseSearchParams, queueJobSchema } from "@/shared/lib/api-validation";
import { rateLimitJobSubmit } from "@/shared/lib/rate-limiter";
import { logger } from "@/shared/lib/logger";

const log = logger.child({ route: "queue/job" });

const jobIdSchema = z.object({ jobId: z.string().min(1) });

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // Rate limiting
    const ip =
      request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined;
    const limited = await rateLimitJobSubmit(userId, ip);
    if (limited) return limited;

    const body = await request.json();
    const parsed = parseBody(queueJobSchema, body);
    if (!parsed.success) return parsed.response;

    const { departureCd, arrivalCd, targetMonth, targetDate, targetTimes, scheduleId } =
      parsed.data;

    // 목표 시간까지 필요한 attempts 계산
    const nowKST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const year = nowKST.getFullYear();
    const month = parseInt(targetMonth.replace("월", ""));
    const day = parseInt(targetDate);

    const lastTime = [...targetTimes].sort().reverse()[0];
    const [hour, minute] = lastTime.split(":").map(Number);
    const targetDateTime = new Date(year, month - 1, day, hour, minute);

    const remainingTime = targetDateTime.getTime() - nowKST.getTime();
    const retryInterval = 3 * 60 * 1000; // 3분
    const maxAttempts = Math.max(1, Math.ceil(remainingTime / retryInterval));

    const jobData: CheckSeatsJobData = {
      departureCd,
      arrivalCd,
      targetMonth,
      targetDate,
      targetTimes,
      scheduleId,
      userId,
    };

    const queue = getCheckSeatsQueue();
    const job = await queue.add("check-seats-job", jobData, {
      priority: parsed.data.priority ?? 1,
      delay: parsed.data.delay ?? 0,
      removeOnComplete: true,
      removeOnFail: false,
      attempts: maxAttempts,
      backoff: {
        type: "fixed",
        delay: retryInterval,
      },
    });

    // 터미널 이름 조회 (코드 → 이름)
    const terminals = await prisma.terminal.findMany({
      where: { terminalCd: { in: [departureCd, arrivalCd] } },
      select: { terminalCd: true, terminalNm: true },
    });

    const terminalMap = new Map(terminals.map((t) => [t.terminalCd, t.terminalNm]));
    const departureName = terminalMap.get(departureCd) || departureCd;
    const arrivalName = terminalMap.get(arrivalCd) || arrivalCd;

    try {
      await prisma.jobHistory.create({
        data: {
          jobId: job.id as string,
          departure: departureName,
          arrival: arrivalName,
          targetMonth,
          targetDate,
          targetTimes: JSON.stringify(targetTimes),
          status: "waiting",
          retryCount: 0,
          userId,
          createdAt: getKSTNow(),
          updatedAt: getKSTNow(),
        },
      });
    } catch (dbError) {
      log.error({ err: dbError }, "Failed to save job history to DB");
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: "Job added to queue successfully",
    });
  } catch (error) {
    log.error({ err: error }, "Error adding job to queue");
    return NextResponse.json({ error: "Failed to add job to queue" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const parsed = parseSearchParams(jobIdSchema, request.nextUrl.searchParams);
    if (!parsed.success) return parsed.response;
    const { jobId } = parsed.data;

    // 소유권 검증
    const jobHistory = await prisma.jobHistory.findUnique({
      where: { jobId },
      select: { userId: true },
    });

    if (!jobHistory) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (jobHistory.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const queue = getCheckSeatsQueue();
    const job = await queue.getJob(jobId);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const state = await job.getState();

    return NextResponse.json({
      jobId: job.id,
      state,
      progress: job.progress,
      data: job.data,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    });
  } catch (error) {
    log.error({ err: error }, "Error fetching job status");
    return NextResponse.json({ error: "Failed to fetch job status" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const parsed = parseSearchParams(jobIdSchema, request.nextUrl.searchParams);
    if (!parsed.success) return parsed.response;
    const { jobId } = parsed.data;

    // 소유권 검증
    const jobHistory = await prisma.jobHistory.findUnique({
      where: { jobId },
      select: { userId: true },
    });

    if (!jobHistory) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (jobHistory.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // DB 상태를 먼저 업데이트 (race condition 방지)
    await prisma.jobHistory.update({
      where: { jobId },
      data: {
        status: "cancelled",
        reason: JOB_CANCEL_REASON_KEY.USER_CANCELLED,
        updatedAt: getKSTNow(),
        completedAt: getKSTNow(),
      },
    });

    // 큐에서 제거 시도 (실패해도 OK)
    await tryRemoveJobFromQueue(jobId);

    return NextResponse.json({ success: true, message: "Job cancelled successfully", jobId });
  } catch (error) {
    log.error({ err: error }, "Error cancelling job");
    return NextResponse.json({ error: "Failed to cancel job" }, { status: 500 });
  }
}

async function tryRemoveJobFromQueue(jobId: string) {
  try {
    const queue = getCheckSeatsQueue();
    const job = await queue.getJob(jobId);

    if (!job) return false;

    const state = await job.getState();
    if (state !== "active") {
      await job.remove();
      return true;
    }
    return false;
  } catch (error) {
    log.warn({ err: error, jobId }, "Could not remove job from queue");
    return false;
  }
}
