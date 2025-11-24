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

// 워커 생성
const worker = new Worker<CheckSeatsJobData>(
  "check-seats",
  async (job: Job<CheckSeatsJobData>) => {
    console.log(
      `[Worker] Processing job ${job.id} (시도 ${job.attemptsMade + 1}회)`,
      job.data
    );

    const { departureCd, arrivalCd, targetMonth, targetDate, targetTimes } =
      job.data;

    // DB에서 취소 여부 먼저 체크
    const jobHistory = await prisma.jobHistory.findUnique({
      where: { jobId: job.id as string },
      select: { status: true },
    });

    if (jobHistory?.status === "cancelled") {
      console.log(`[Worker] Job ${job.id} 이미 취소됨 - 작업 중단`);
      return { foundSeats: false, reason: "사용자가 작업을 취소함" };
    }

    // 목표 날짜/시간이 지났는지 체크
    const shouldContinue = checkShouldContinue(
      targetMonth,
      targetDate,
      targetTimes
    );

    if (!shouldContinue) {
      console.log(`[Worker] 목표 날짜/시간 도달 - 작업 종료`);
      // DB 업데이트: 시간 초과로 완료
      await updateJobStatus(job.id as string, "completed", job.attemptsMade, {
        foundSeats: false,
        reason: "목표 시간 초과",
      });
      return { foundSeats: false, reason: "목표 시간 초과" };
    }

    try {
      // 실제 좌석 확인 로직 실행
      const result = await checkBusSeats({
        departureCd,
        arrivalCd,
        targetMonth,
        targetDate,
        targetTimes,
      });

      // 좌석을 찾았으면 성공으로 완료
      if (result.foundSeats) {
        console.log(
          `[Worker] ✓ 좌석 발견! (총 ${job.attemptsMade + 1}회 시도)`
        );

        // 카카오톡 메시지 및 캘린더 이벤트 전송
        if (job.data.userId) {
          try {
            await sendKakaoMessage(job.data.userId, result);

            // 캘린더 이벤트 생성
            const accessToken = await getKakaoAccessToken(job.data.userId);
            if (accessToken) {
              await createKakaoEvent(accessToken, {
                departureCd: result.config.departureCd,
                arrivalCd: result.config.arrivalCd,
                time: result.firstFoundTime,
              });
            }
          } catch (msgError) {
            console.error("[Worker] 카카오 알림 전송 실패:", msgError);
          }
        }

        await updateJobStatus(
          job.id as string,
          "completed",
          job.attemptsMade + 1,
          result
        );
        return result;
      }

      throw new Error("NO_SEATS_AVAILABLE");
    } catch (error) {
      throw error; // 에러를 throw하면 BullMQ가 재시도 처리
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 5, // 동시에 처리할 수 있는 작업 수
    limiter: {
      max: 10, // 최대 10개 작업
      duration: 1000, // 1초당
    },
  }
);

// 목표 날짜/시간이 지났는지 확인 (KST 기준)
function checkShouldContinue(
  targetMonth: string,
  targetDate: string,
  targetTimes: string[]
): boolean {
  // 현재 KST 시간
  const nowKST = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );

  // 목표 날짜 파싱 (예: "11월" -> 11, "18" -> 18)
  const year = nowKST.getFullYear();
  const month = parseInt(targetMonth.replace("월", ""));
  const day = parseInt(targetDate);

  // 마지막 조회 시간 찾기 (예: ["08:00", "09:30"] -> "09:30")
  const lastTime = targetTimes.sort().reverse()[0]; // 가장 늦은 시간
  const [hour, minute] = lastTime.split(":").map(Number);

  // 목표 날짜+시간 생성
  const targetDateTime = new Date(year, month - 1, day, hour, minute);

  // 현재 시간이 목표 시간보다 이전이면 계속 재시도
  return nowKST < targetDateTime;
}

// DB 상태 업데이트 헬퍼 함수 (Prisma 타입 기반)
async function updateJobStatus(
  jobId: string,
  status: string,
  retryCount?: number,
  result?: any,
  error?: string
) {
  try {
    // Prisma 타입을 활용한 업데이트 데이터 구성
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

    if (status === "completed" || status === "failed") {
      updateData.completedAt = getKSTNow();
    }

    await prisma.jobHistory.update({
      where: { jobId },
      data: updateData,
    });
  } catch (err) {
    console.error(`[Worker] Failed to update job ${jobId} status in DB:`, err);
  }
}

// 워커 이벤트 리스너
worker.on("completed", async (job: Job) => {
  console.log(
    `[Worker] ✓ Job ${job.id} 최종 완료 (총 ${job.attemptsMade}회 시도)`
  );
});

worker.on("failed", async (job: Job | undefined, err: Error) => {
  if (!job) return;

  // NO_SEATS_AVAILABLE 에러는 재시도 중이므로 failed로 처리하지 않음
  if (err.message === "NO_SEATS_AVAILABLE") {
    // DB 업데이트: waiting 상태로 유지
    await updateJobStatus(
      job.id as string,
      "waiting",
      job.attemptsMade,
      undefined,
      undefined
    );
    return;
  }

  // 실제 에러인 경우에만 failed로 처리
  console.error(`[Worker] ✗ Job ${job.id} 최종 실패:`, err.message);
  await updateJobStatus(
    job.id as string,
    "failed",
    job.attemptsMade,
    undefined,
    err.message
  );
});

worker.on("error", (err: Error) => {
  console.error("[Worker] Worker error:", err);
});

worker.on("ready", () => {
  console.log("[Worker] Worker is ready and waiting for jobs");
});

// 프로세스 종료 시 워커 정리
process.on("SIGTERM", async () => {
  console.log("[Worker] SIGTERM received, closing worker...");
  await worker.close();
  await getRedisConnection().quit();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Worker] SIGINT received, closing worker...");
  await worker.close();
  await getRedisConnection().quit();
  process.exit(0);
});

console.log("[Worker] Check seats worker started");
