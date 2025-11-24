import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../shared/lib/redis";
import { MaintenanceJobData } from "../shared/lib/queue/maintenance-queue";
import { getMasterData } from "../shared/scripts/update-master-data";
import { getRoutesSchedules } from "../shared/scripts/update-routes-schedules";

const worker = new Worker<MaintenanceJobData>(
  "maintenance-tasks",
  async (job: Job<MaintenanceJobData>) => {
    console.log(`[Maintenance] 작업 시작: ${job.name}`);

    try {
      // 작업 이름에 따라 실행할 함수 결정
      if (job.name === "update-master-data") {
        await getMasterData();
      } else if (job.name === "update-schedules") {
        await getRoutesSchedules();
      }
    } catch (error) {
      console.error(`[Maintenance] 작업 실패: ${job.name}`, error);
      throw error;
    }

    console.log(`[Maintenance] 작업 완료: ${job.name}`);
  },
  {
    connection: getRedisConnection(),
    concurrency: 1, // 유지보수 작업은 무거우므로 한 번에 하나씩만 실행
  }
);

console.log("[Maintenance] Worker started");
