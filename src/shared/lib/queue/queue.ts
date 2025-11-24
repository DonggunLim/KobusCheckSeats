import { Queue } from "bullmq";
import { getRedisConnection } from "../redis";
import type { RouteQuery } from "../../types/bus-check.types";

// Job 데이터 타입 정의 (Prisma JobHistory와 호환되는 형태)
export interface CheckSeatsJobData extends RouteQuery {
  scheduleId?: string; // 스케줄 ID (선택)
  retryCount?: number; // 재시도 횟수 추적
  startTime?: number; // 잡 시작 시간 (타임아웃 체크용)
  userId?: string; // 사용자 ID (메시지 전송용)
}

let checkSeatsQueue: Queue<CheckSeatsJobData> | null = null;

export function getCheckSeatsQueue(): Queue<CheckSeatsJobData> {
  if (!checkSeatsQueue) {
    checkSeatsQueue = new Queue<CheckSeatsJobData>("check-seats", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3, // 기본 재시도 횟수
        backoff: {
          type: "exponential",
          delay: 2000, // 2초부터 시작하여 지수적으로 증가
        },
        removeOnComplete: {
          age: 24 * 3600, // 24시간 후 완료된 작업 제거
          count: 1000, // 최대 1000개의 완료된 작업 보관
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // 7일 후 실패한 작업 제거
        },
      },
    });

    // 큐 이벤트 리스너
    checkSeatsQueue.on("error", (error) => {
      console.error("Queue error:", error);
    });
  }

  return checkSeatsQueue;
}
