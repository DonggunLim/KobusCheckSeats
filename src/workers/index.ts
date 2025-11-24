import "./check-seats.worker";
import "./maintenance.worker";

import { getMaintenanceQueue } from "../shared/lib/queue/maintenance-queue";

async function scheduleRepeatableJobs() {
  const queue = getMaintenanceQueue();

  // (1) 노선 정보 업데이트: 매주 월요일 새벽 3시 0분
  await queue.add(
    "update-master-data",
    { type: "UPDATE_ROUTES" },
    {
      repeat: {
        pattern: "0 3 * * 1", // 분 시 일 월 요일 (1=월요일)
        // 필요시 tz: "Asia/Seoul" 옵션 사용 (BullMQ 버전에 따라 다름, 기본은 UTC일 수 있음)
      },
    }
  );
  console.log(
    "[Scheduler] '노선 업데이트' 스케줄 등록 완료 (매주 월요일 03:00)"
  );

  // (2) 시간표 크롤링: 매주 월요일 새벽 3시 30분
  await queue.add(
    "update-schedules",
    { type: "UPDATE_SCHEDULES" },
    {
      repeat: {
        pattern: "30 3 * * 1",
      },
    }
  );
  console.log(
    "[Scheduler] '시간표 크롤링' 스케줄 등록 완료 (매주 월요일 03:30)"
  );
}

// 3. 스케줄러 실행
scheduleRepeatableJobs().catch((err) => {
  console.error("[Scheduler] 스케줄 등록 중 오류 발생:", err);
});
