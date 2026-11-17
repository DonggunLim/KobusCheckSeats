import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getCheckSeatsQueue, type CheckSeatsJobData } from "@/shared/lib/queue/queue";
import prisma from "@/shared/lib/prisma";
import { getKSTNow, getMonitoringDeadlineKST } from "@/shared/lib/date";
import { JOB_CANCEL_REASON_KEY, JOB_CHECK_INTERVAL_MS } from "@/shared/constants/job";
import { parseBody, parseSearchParams, queueJobSchema } from "@/shared/lib/api-validation";
import { rateLimitJobSubmit } from "@/shared/lib/rate-limiter";
import { logger } from "@/shared/lib/logger";

const log = logger.child({ route: "queue/job" });

const jobIdSchema = z.object({ jobId: z.string().min(1) });

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip =
      request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined;
    const limited = await rateLimitJobSubmit(ip);
    if (limited) return limited;

    const body = await request.json();
    const parsed = parseBody(queueJobSchema, body);
    if (!parsed.success) return parsed.response;

    const {
      departureCd,
      arrivalCd,
      targetYear,
      targetMonth,
      targetDate,
      targetTimes,
      targetTimeRange,
      keepWatching,
      scheduleId,
    } = parsed.data;

    const jobData: CheckSeatsJobData = {
      departureCd,
      arrivalCd,
      targetYear,
      targetMonth,
      targetDate,
      targetTimes,
      targetTimeRange,
      scheduleId,
    };

    // 목표 시간까지 확인 주기마다 한 번씩 확인하도록 attempts 계산
    const remainingTime = getMonitoringDeadlineKST(jobData).getTime() - Date.now();
    if (remainingTime <= 0) {
      return NextResponse.json({ error: "선택한 출발 시간이 이미 지났습니다." }, { status: 400 });
    }
    const maxAttempts = Math.max(1, Math.ceil(remainingTime / JOB_CHECK_INTERVAL_MS));

    const queue = getCheckSeatsQueue();

    // 터미널 이름 조회 (코드 → 이름)
    const terminals = await prisma.terminal.findMany({
      where: { terminalCd: { in: [departureCd, arrivalCd] } },
      select: { terminalCd: true, terminalNm: true },
    });

    const terminalMap = new Map(terminals.map((t) => [t.terminalCd, t.terminalNm]));
    const departureName = terminalMap.get(departureCd) || departureCd;
    const arrivalName = terminalMap.get(arrivalCd) || arrivalCd;
    const jobId = randomUUID();

    await prisma.jobHistory.create({
      data: {
        jobId,
        departure: departureName,
        arrival: arrivalName,
        targetMonth,
        targetDate,
        targetTimes: JSON.stringify(targetTimes),
        timeRangeStart: targetTimeRange?.start ?? null,
        timeRangeEnd: targetTimeRange?.end ?? null,
        keepWatching,
        status: "waiting",
        retryCount: 0,
        createdAt: getKSTNow(),
        updatedAt: getKSTNow(),
      },
    });

    let queuedJobId: string = jobId;
    try {
      const job = await queue.add("check-seats-job", jobData, {
        jobId,
        priority: parsed.data.priority ?? 1,
        delay: parsed.data.delay ?? 0,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: maxAttempts,
        backoff: {
          type: "fixed",
          delay: JOB_CHECK_INTERVAL_MS,
        },
      });
      queuedJobId = job.id ?? jobId;
    } catch (queueError) {
      await prisma.jobHistory
        .delete({ where: { jobId } })
        .catch((cleanupError) =>
          log.error(
            { err: cleanupError, jobId },
            "Failed to clean up job history after queue error"
          )
        );
      throw queueError;
    }

    return NextResponse.json({
      success: true,
      jobId: queuedJobId,
      message: "Job added to queue successfully",
    });
  } catch (error) {
    log.error({ err: error }, "Error adding job to queue");
    return NextResponse.json({ error: "Failed to add job to queue" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const parsed = parseSearchParams(jobIdSchema, request.nextUrl.searchParams);
    if (!parsed.success) return parsed.response;
    const { jobId } = parsed.data;

    const jobHistory = await prisma.jobHistory.findUnique({
      where: { jobId },
      select: { jobId: true },
    });

    if (!jobHistory) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
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
    const parsed = parseSearchParams(jobIdSchema, request.nextUrl.searchParams);
    if (!parsed.success) return parsed.response;
    const { jobId } = parsed.data;

    const jobHistory = await prisma.jobHistory.findUnique({
      where: { jobId },
      select: { jobId: true },
    });

    if (!jobHistory) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
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
