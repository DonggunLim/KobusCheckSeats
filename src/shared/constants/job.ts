// 좌석 확인 주기. 명절 취소표는 빨리 팔리므로 1분마다 확인한다.
export const JOB_CHECK_INTERVAL_MS = 60 * 1000;

// DB에 저장될 키 (실무 권장 방식)
export const JOB_CANCEL_REASON_KEY = {
  USER_CANCELLED: "USER_CANCELLED",
  NO_SEATS_FOUND: "NO_SEATS_FOUND",
  MONITORING_ENDED: "MONITORING_ENDED",
} as const;

export const JOB_CANCEL_REASON_LABEL = {
  USER_CANCELLED: "사용자가 직접 취소하였습니다.",
  NO_SEATS_FOUND: "목표 시간까지 좌석을 찾지 못해 자동 취소되었습니다.",
  MONITORING_ENDED: "목표 시간이 지나 계속 감시를 마쳤습니다.",
} as const;

export type JobCancelReason =
  (typeof JOB_CANCEL_REASON_KEY)[keyof typeof JOB_CANCEL_REASON_KEY];

// 좌석 알림 전송 결과 (job_history.notify_status)
export const NOTIFY_STATUS = {
  SENT: "sent",
  FAILED: "failed",
} as const;

export type NotifyStatus = (typeof NOTIFY_STATUS)[keyof typeof NOTIFY_STATUS];
