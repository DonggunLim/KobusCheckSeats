import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../shared/lib/redis";
import { MaintenanceJobData } from "../shared/lib/queue/maintenance-queue";
import { getMasterData } from "../shared/scripts/update-master-data";
import { sendAdminAlert } from "@/shared/lib/telegram/telegram-message";
import { logger } from "@/shared/lib/logger";

const log = logger.child({ module: "maintenance-worker" });

new Worker<MaintenanceJobData>(
  "maintenance-tasks",
  async (job: Job<MaintenanceJobData>) => {
    log.info({ jobName: job.name }, "Maintenance task started");

    if (job.name !== "update-master-data") {
      log.warn({ jobName: job.name }, "Unknown maintenance task ignored");
      return;
    }

    try {
      await getMasterData();
    } catch (error) {
      log.error({ err: error, jobName: job.name }, "Maintenance task failed");
      const message = error instanceof Error ? error.message : String(error);
      await sendAdminAlert(
        `주간 노선 목록 갱신에 실패했습니다. 지난 노선 목록을 계속 사용합니다.\n오류: ${message}`
      );
      throw error;
    }

    log.info({ jobName: job.name }, "Maintenance task completed");
  },
  {
    connection: getRedisConnection(),
    concurrency: 1,
  }
);

log.info("Maintenance worker started");
