import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../shared/lib/redis";
import { type CheckSeatsJobData } from "../shared/lib/queue/queue";
import { checkBusSeats } from "./jobs/check-bus-seats";
import prisma from "../shared/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getKSTNow, getTargetDateTimeKST } from "../shared/lib/date";
import { sendTelegramMessage } from "@/shared/lib/telegram/telegram-message";
import { JOB_CANCEL_REASON_KEY } from "@/shared/constants/job";
import { publishJobStatusUpdate } from "@/shared/lib/queue/job-events";
import { logger } from "@/shared/lib/logger";

const log = logger.child({ module: "check-seats-worker" });

// 워커 생성
const worker = new Worker<CheckSeatsJobData>(
  "check-seats",
  async (job: Job<CheckSeatsJobData>) => {
    log.info({ jobId: job.id, attempt: job.attemptsMade + 1 }, "Processing job");

    const { departureCd, arrivalCd, targetYear, targetMonth, targetDate, targetTimes } = job.data;

    // DB에서 취소 여부 먼저 체크
    const jobHistory = await prisma.jobHistory.findUnique({
      where: { jobId: job.id as string },
      select: { status: true },
    });

    if (jobHistory?.status === "cancelled") {
      log.info({ jobId: job.id }, "Job already cancelled, skipping");
      return { foundSeats: false, reason: "사용자가 작업을 취소함" };
    }

    // 목표 날짜/시간이 지났는지 체크
    const shouldContinue = checkShouldContinue(targetYear, targetMonth, targetDate, targetTimes);

    if (!shouldContinue) {
      log.info({ jobId: job.id }, "Target time passed, cancelling job");
      await updateJobStatus(
        job.id as string,
        "cancelled",
        job.attemptsMade,
        { foundSeats: false },
        undefined,
        JOB_CANCEL_REASON_KEY.NO_SEATS_FOUND
      );
      return { foundSeats: false, reason: JOB_CANCEL_REASON_KEY.NO_SEATS_FOUND };
    }

    const result = await checkBusSeats({
      departureCd,
      arrivalCd,
      targetYear,
      targetMonth,
      targetDate,
      targetTimes,
    });

    if (!result.success) {
      throw new Error(result.error || "SEAT_CHECK_FAILED");
    }

    if (result.foundSeats) {
      log.info({ jobId: job.id, attempt: job.attemptsMade + 1 }, "Seats found!");

      try {
        const notified = await sendTelegramMessage(result);
        if (!notified) {
          log.warn({ jobId: job.id }, "Telegram notification failed (job still completed)");
        }
      } catch (msgError) {
        log.error(
          { err: msgError, jobId: job.id },
          "Telegram notification failed (job still completed)"
        );
      }

      await updateJobStatus(job.id as string, "completed", job.attemptsMade + 1, result);
      return result;
    }

    throw new Error("NO_SEATS_AVAILABLE");
  },
  {
    connection: getRedisConnection(),
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000,
    },
  }
);

// 목표 날짜/시간이 지났는지 확인 (KST 기준)
function checkShouldContinue(
  targetYear: number | undefined,
  targetMonth: string,
  targetDate: string,
  targetTimes: string[]
): boolean {
  const lastTime = [...targetTimes].sort().reverse()[0];
  const targetDateTime = getTargetDateTimeKST(targetYear, targetMonth, targetDate, lastTime);
  return Date.now() < targetDateTime.getTime();
}

function hasAttemptsRemaining(job: Job<CheckSeatsJobData>): boolean {
  const maxAttempts = job.opts.attempts ?? 1;
  return job.attemptsMade < maxAttempts;
}

// DB 상태 업데이트 헬퍼 함수 (Prisma 타입 기반)
async function updateJobStatus(
  jobId: string,
  status: string,
  retryCount?: number,
  result?: unknown,
  error?: string,
  reason?: string
) {
  try {
    const updateData: Prisma.JobHistoryUpdateInput = {
      status,
      updatedAt: getKSTNow(),
    };

    if (retryCount !== undefined) {
      updateData.retryCount = retryCount;
    }

    if (result) {
      updateData.result = JSON.stringify(result);
    }

    if (error) {
      updateData.error = error;
    }

    if (reason) {
      updateData.reason = reason;
    }

    if (status === "completed" || status === "failed" || status === "cancelled") {
      updateData.completedAt = getKSTNow();
    }

    await prisma.jobHistory.update({
      where: { jobId },
      data: updateData,
    });

    publishJobStatusUpdate({ jobId, status }).catch((err) => {
      log.warn({ err, jobId }, "Failed to publish job status update");
    });
  } catch (err) {
    log.error({ err, jobId }, "Failed to update job status in DB");
  }
}

// 워커 이벤트 리스너
worker.on("active", async (job: Job<CheckSeatsJobData>) => {
  log.info({ jobId: job.id, attempt: job.attemptsMade }, "Job active");
  await updateJobStatus(job.id as string, "active", job.attemptsMade);
});

worker.on("completed", async (job: Job<CheckSeatsJobData>) => {
  log.info({ jobId: job.id, attempt: job.attemptsMade }, "Job completed");
});

worker.on("failed", async (job: Job<CheckSeatsJobData> | undefined, err: Error) => {
  if (!job) return;

  if (err.message === "NO_SEATS_AVAILABLE") {
    if (hasAttemptsRemaining(job)) {
      await updateJobStatus(job.id as string, "waiting", job.attemptsMade);
      return;
    }

    await updateJobStatus(
      job.id as string,
      "cancelled",
      job.attemptsMade,
      { foundSeats: false },
      undefined,
      JOB_CANCEL_REASON_KEY.NO_SEATS_FOUND
    );
    return;
  }

  if (hasAttemptsRemaining(job)) {
    log.warn({ jobId: job.id, err: err.message }, "Job attempt failed, will retry");
    await updateJobStatus(job.id as string, "waiting", job.attemptsMade, undefined, err.message);
    return;
  }

  log.error({ jobId: job.id, err: err.message }, "Job failed");
  await updateJobStatus(job.id as string, "failed", job.attemptsMade, undefined, err.message);
});

worker.on("error", (err: Error) => {
  log.error({ err }, "Worker error");
});

worker.on("ready", () => {
  log.info("Worker is ready and waiting for jobs");
});

// 프로세스 종료 시 워커 정리
process.on("SIGTERM", async () => {
  log.info("SIGTERM received, closing worker...");
  await worker.close();
  await getRedisConnection().quit();
  process.exit(0);
});

process.on("SIGINT", async () => {
  log.info("SIGINT received, closing worker...");
  await worker.close();
  await getRedisConnection().quit();
  process.exit(0);
});

log.info("Check seats worker started");
