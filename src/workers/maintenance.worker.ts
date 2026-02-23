import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../shared/lib/redis";
import { MaintenanceJobData } from "../shared/lib/queue/maintenance-queue";
import { getMasterData } from "../shared/scripts/update-master-data";
import { getRoutesSchedules } from "../shared/scripts/update-routes-schedules";
import { logger } from "@/shared/lib/logger";

const log = logger.child({ module: "maintenance-worker" });

const worker = new Worker<MaintenanceJobData>(
  "maintenance-tasks",
  async (job: Job<MaintenanceJobData>) => {
    log.info({ jobName: job.name }, "Maintenance task started");

    try {
      if (job.name === "update-master-data") {
        await getMasterData();
      } else if (job.name === "update-schedules") {
        await getRoutesSchedules();
      }
    } catch (error) {
      log.error({ err: error, jobName: job.name }, "Maintenance task failed");
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
