import { sendAdminAlert } from "@/shared/lib/telegram/telegram-message";
import { logger } from "@/shared/lib/logger";
import type { CheckResult } from "@/shared/types/bus-check.types";

const log = logger.child({ module: "kobus-health" });

// 여러 감시 작업에 걸쳐 연속으로 실패하면 코버스 연동(비공식 내부 주소) 이상으로 본다.
export const FAILURE_STREAK_THRESHOLD = 5;
const ALERT_REPEAT_MS = 60 * 60 * 1000;

let failureStreak = 0;
let alerting = false;
let lastAlertAt = 0;

/**
 * 좌석 확인 결과로 코버스 연동 상태를 갱신하고, 연속 실패·복구 시 운영자에게 알린다.
 * 날짜/노선 조회 거부(unavailable)는 연동 이상이 아니므로 세지 않는다.
 */
export async function recordKobusCheck(result: CheckResult, now = Date.now()): Promise<void> {
  if (result.success) {
    if (alerting) {
      alerting = false;
      log.info("Kobus lookups recovered");
      await sendAdminAlert("코버스 배차 조회가 다시 정상 동작합니다.");
    }
    failureStreak = 0;
    return;
  }

  if (result.errorKind === "unavailable") return;

  failureStreak++;
  if (failureStreak < FAILURE_STREAK_THRESHOLD) return;
  if (alerting && now - lastAlertAt < ALERT_REPEAT_MS) return;

  alerting = true;
  lastAlertAt = now;
  log.error({ failureStreak, err: result.error }, "Kobus lookups failing repeatedly");
  await sendAdminAlert(
    [
      `코버스 배차 조회가 연속 ${failureStreak}번 실패했습니다.`,
      `최근 오류: ${result.error ?? "알 수 없음"}`,
      "코버스 내부 주소나 응답 형식이 바뀌었을 수 있습니다. 복구되면 다시 알려드립니다.",
    ].join("\n")
  );
}

/** 테스트용: 모듈 상태 초기화 */
export function resetKobusHealth(): void {
  failureStreak = 0;
  alerting = false;
  lastAlertAt = 0;
}
