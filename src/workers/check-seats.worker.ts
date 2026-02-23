import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../shared/lib/redis";
import { type CheckSeatsJobData } from "../shared/lib/queue/queue";
import { checkBusSeats } from "./jobs/check-bus-seats";
import prisma from "../shared/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getKSTNow } from "../shared/lib/date";
import { createKakaoEvent } from "../shared/lib/kakao/kakao-calendar";
import { sendKakaoMessage } from "@/shared/lib/kakao/kakao-message";
import { getKakaoAccessToken } from "@/shared/lib/kakao/kakao-token";
import { JOB_CANCEL_REASON_KEY } from "@/shared/constants/job";
import { publishJobStatusUpdate } from "@/shared/lib/queue/job-events";
import { logger } from "@/shared/lib/logger";

const log = logger.child({ module: "check-seats-worker" });

// 워커 생성
const worker = new Worker<CheckSeatsJobData>(
  "check-seats",
  async (job: Job<CheckSeatsJobData>) => {
    log.info({ jobId: job.id, attempt: job.attemptsMade + 1 }, "Processing job");

    const { departureCd, arrivalCd, targetMonth, targetDate, targetTimes } = job.data;

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
    const shouldContinue = checkShouldContinue(targetMonth, targetDate, targetTimes);

    if (!shouldContinue) {
      log.info({ jobId: job.id }, "Target time passed, cancelling job");
      await updateJobStatus(
        job.id as string,
        "cancelled",
        job.data.userId,
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
      targetMonth,
      targetDate,
      targetTimes,
    });

    if (result.foundSeats) {
      log.info({ jobId: job.id, attempt: job.attemptsMade + 1 }, "Seats found!");

      if (job.data.userId) {
        try {
          await sendKakaoMessage(job.data.userId, result);

          const accessToken = await getKakaoAccessToken(job.data.userId);
          if (accessToken) {
            await createKakaoEvent(accessToken, {
              departureCd: result.config.departureCd,
              arrivalCd: result.config.arrivalCd,
              time: result.firstFoundTime,
            });
          }
        } catch (msgError) {
          log.error({ err: msgError, jobId: job.id }, "Kakao notification failed (job still completed)");
        }
      }

      await updateJobStatus(
        job.id as string,
        "completed",
        job.data.userId,
        job.attemptsMade + 1,
        result
      );
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
  targetMonth: string,
  targetDate: string,
  targetTimes: string[]
): boolean {
  const nowKST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));

  const year = nowKST.getFullYear();
  const month = parseInt(targetMonth.replace("월", ""));
  const day = parseInt(targetDate);

  const lastTime = [...targetTimes].sort().reverse()[0];
  const [hour, minute] = lastTime.split(":").map(Number);

  const targetDateTime = new Date(year, month - 1, day, hour, minute);
  return nowKST < targetDateTime;
}

// DB 상태 업데이트 헬퍼 함수 (Prisma 타입 기반)
async function updateJobStatus(
  jobId: string,
  status: string,
  userId?: string,
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

    if (userId) {
      publishJobStatusUpdate({ jobId, userId, status }).catch((err) => {
        log.warn({ err, jobId }, "Failed to publish job status update");
      });
    }
  } catch (err) {
    log.error({ err, jobId }, "Failed to update job status in DB");
  }
}

// 워커 이벤트 리스너
worker.on("active", async (job: Job) => {
  log.info({ jobId: job.id, attempt: job.attemptsMade }, "Job active");
  await updateJobStatus(job.id as string, "active", job.data.userId, job.attemptsMade);
});

worker.on("completed", async (job: Job) => {
  log.info({ jobId: job.id, attempt: job.attemptsMade }, "Job completed");
});

worker.on("failed", async (job: Job | undefined, err: Error) => {
  if (!job) return;

  if (err.message === "NO_SEATS_AVAILABLE") {
    await updateJobStatus(job.id as string, "waiting", job.data.userId, job.attemptsMade);
    return;
  }

  log.error({ jobId: job.id, err: err.message }, "Job failed");
  await updateJobStatus(
    job.id as string,
    "failed",
    job.data.userId,
    job.attemptsMade,
    undefined,
    err.message
  );
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
