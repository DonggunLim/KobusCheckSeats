import "./check-seats.worker";
import "./maintenance.worker";

import { getMaintenanceQueue } from "../shared/lib/queue/maintenance-queue";
import { logger } from "../shared/lib/logger";

const log = logger.child({ module: "scheduler" });

// 2026-11-17 제거한 주간 시간표 크롤링. 반복 등록은 Redis에 남으므로 시작할 때 지운다.
const RETIRED_REPEATABLE_JOBS = ["update-schedules"];

async function scheduleRepeatableJobs() {
  const queue = getMaintenanceQueue();

  for (const repeatable of await queue.getRepeatableJobs()) {
    if (RETIRED_REPEATABLE_JOBS.includes(repeatable.name)) {
      await queue.removeRepeatableByKey(repeatable.key);
      log.info({ name: repeatable.name }, "Removed retired repeatable job");
    }
  }

  // 노선 정보 업데이트: 매주 월요일 새벽 3시 0분
  await queue.add(
    "update-master-data",
    { type: "UPDATE_ROUTES" },
    {
      repeat: {
        pattern: "0 3 * * 1",
        tz: "Asia/Seoul",
      },
    }
  );
  log.info("'노선 업데이트' 스케줄 등록 완료 (매주 월요일 03:00 KST)");
}

scheduleRepeatableJobs().catch((err) => {
  log.error({ err }, "스케줄 등록 중 오류 발생");
});
