import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../shared/lib/redis";
import { type CheckSeatsJobData } from "../shared/lib/queue/queue";
import { checkBusSeats } from "./jobs/check-bus-seats";
import { recordKobusCheck } from "./kobus-health";
import prisma from "../shared/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getKSTNow, getMonitoringDeadlineKST } from "../shared/lib/date";
import { sendTelegramMessage } from "@/shared/lib/telegram/telegram-message";
import { JOB_CANCEL_REASON_KEY, NOTIFY_STATUS, type NotifyStatus } from "@/shared/constants/job";
import { publishJobStatusUpdate } from "@/shared/lib/queue/job-events";
import { logger } from "@/shared/lib/logger";
import type { CheckResult } from "@/shared/types/bus-check.types";

const log = logger.child({ module: "check-seats-worker" });

// 재시도 없이 다음 확인으로 넘어가기 위한 신호 (BullMQ backoff로 다음 확인을 예약)
const CONTINUE_MONITORING = "CONTINUE_MONITORING";
const NOTIFY_FAILED_MESSAGE = "좌석을 찾았지만 텔레그램 알림 전송에 실패했습니다. 다음 확인 때 다시 보냅니다.";

// 워커 생성
const worker = new Worker<CheckSeatsJobData>(
  "check-seats",
  async (job: Job<CheckSeatsJobData>) => {
    const jobId = job.id as string;
    log.info({ jobId, attempt: job.attemptsMade + 1 }, "Processing job");

    const history = await prisma.jobHistory.findUnique({
      where: { jobId },
      select: { status: true, keepWatching: true, notifyStatus: true, result: true },
    });

    if (history?.status === "cancelled") {
      log.info({ jobId }, "Job already cancelled, skipping");
      return { foundSeats: false, reason: "사용자가 작업을 취소함" };
    }

    if (Date.now() >= getMonitoringDeadlineKST(job.data).getTime()) {
      log.info({ jobId }, "Target time passed, finishing job");
      await finishMonitoring(jobId, job.attemptsMade);
      return { foundSeats: false, reason: "목표 시간 경과" };
    }

    const result = await checkBusSeats(job.data);
    await recordKobusCheck(result);

    if (!result.success) {
      await recordCheck(jobId, { error: result.error ?? "SEAT_CHECK_FAILED" });
      throw new Error(result.error || "SEAT_CHECK_FAILED");
    }

    // 직전 확인에서 이미 좌석이 있던 시각은 다시 알리지 않는다 (계속 감시 중 알림 반복 방지).
    const previouslyAvailable = getAvailableTimes(history?.result);
    const hasNewSeats = result.results.some(
      (slot) => slot.hasSeats && !previouslyAvailable.has(slot.time)
    );
    const shouldNotify =
      result.foundSeats && (hasNewSeats || history?.notifyStatus === NOTIFY_STATUS.FAILED);

    // null: 좌석이 사라졌으므로 이전 알림 실패 표시를 지운다.
    let notifyStatus: NotifyStatus | null | undefined = result.foundSeats ? undefined : null;
    if (shouldNotify) {
      log.info({ jobId, attempt: job.attemptsMade + 1 }, "Seats found, notifying");
      notifyStatus = (await sendTelegramMessage(result))
        ? NOTIFY_STATUS.SENT
        : NOTIFY_STATUS.FAILED;
    }

    await recordCheck(jobId, { result, notifyStatus });

    if (notifyStatus === NOTIFY_STATUS.SENT && !history?.keepWatching) {
      await updateJobStatus(jobId, "completed", job.attemptsMade + 1, result);
      return result;
    }

    if (notifyStatus === NOTIFY_STATUS.FAILED) {
      throw new Error(NOTIFY_FAILED_MESSAGE);
    }

    throw new Error(CONTINUE_MONITORING);
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

function getAvailableTimes(storedResult: string | null | undefined): Set<string> {
  if (!storedResult) return new Set();
  try {
    const parsed: unknown = JSON.parse(storedResult);
    if (typeof parsed !== "object" || parsed === null || !("results" in parsed)) return new Set();
    const results: unknown = parsed.results;
    if (!Array.isArray(results)) return new Set();
    return new Set(
      results.flatMap((slot: unknown) =>
        typeof slot === "object" &&
        slot !== null &&
        "hasSeats" in slot &&
        slot.hasSeats === true &&
        "time" in slot &&
        typeof slot.time === "string"
          ? [slot.time]
          : []
      )
    );
  } catch {
    return new Set();
  }
}

/** 확인 1회의 결과(마지막 확인 시각·결과·오류·알림 상태)를 기록한다. */
async function recordCheck(
  jobId: string,
  {
    result,
    error,
    notifyStatus,
  }: { result?: CheckResult; error?: string; notifyStatus?: NotifyStatus | null }
) {
  try {
    const now = getKSTNow();
    await prisma.jobHistory.update({
      where: { jobId },
      data: {
        lastCheckedAt: now,
        updatedAt: now,
        ...(result ? { result: JSON.stringify(result), error: null } : {}),
        ...(error ? { error } : {}),
        ...(notifyStatus !== undefined ? { notifyStatus } : {}),
        ...(notifyStatus === NOTIFY_STATUS.SENT ? { notifiedCount: { increment: 1 } } : {}),
      },
    });
  } catch (err) {
    log.error({ err, jobId }, "Failed to record check result");
  }
}

/** 목표 시간이 지나 감시를 끝낸다. 계속 감시 중 알림을 보냈다면 "좌석 없음"으로 기록하지 않는다. */
async function finishMonitoring(jobId: string, attemptsMade: number) {
  const history = await prisma.jobHistory
    .findUnique({ where: { jobId }, select: { notifiedCount: true } })
    .catch(() => null);
  const reason =
    (history?.notifiedCount ?? 0) > 0
      ? JOB_CANCEL_REASON_KEY.MONITORING_ENDED
      : JOB_CANCEL_REASON_KEY.NO_SEATS_FOUND;
  await updateJobStatus(jobId, "cancelled", attemptsMade, undefined, undefined, reason);
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
  const jobId = job.id as string;

  if (err.message === CONTINUE_MONITORING) {
    if (hasAttemptsRemaining(job)) {
      await updateJobStatus(jobId, "waiting", job.attemptsMade);
      return;
    }
    await finishMonitoring(jobId, job.attemptsMade);
    return;
  }

  if (hasAttemptsRemaining(job)) {
    log.warn({ jobId, err: err.message }, "Job attempt failed, will retry");
    await updateJobStatus(jobId, "waiting", job.attemptsMade, undefined, err.message);
    return;
  }

  log.error({ jobId, err: err.message }, "Job failed");
  await updateJobStatus(jobId, "failed", job.attemptsMade, undefined, err.message);
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
