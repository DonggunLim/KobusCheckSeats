import { Queue } from "bullmq";
import { getRedisConnection } from "../redis";

// 유지보수 작업의 종류를 정의
export interface MaintenanceJobData {
  type: "UPDATE_ROUTES" | "UPDATE_SCHEDULES";
}

let maintenanceQueue: Queue<MaintenanceJobData> | null = null;

export function getMaintenanceQueue(): Queue<MaintenanceJobData> {
  if (!maintenanceQueue) {
    maintenanceQueue = new Queue<MaintenanceJobData>("maintenance-tasks", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 10, // 완료된 작업 로그 10개만 보관
        removeOnFail: 20, // 실패한 작업 로그 20개 보관
      },
    });
  }
  return maintenanceQueue;
}
