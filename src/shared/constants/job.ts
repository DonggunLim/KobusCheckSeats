// DB에 저장될 키 (실무 권장 방식)
export const JOB_CANCEL_REASON_KEY = {
  USER_CANCELLED: "USER_CANCELLED",
  NO_SEATS_FOUND: "NO_SEATS_FOUND",
} as const;

export const JOB_CANCEL_REASON_LABEL = {
  USER_CANCELLED: "사용자가 직접 취소하였습니다.",
  NO_SEATS_FOUND: "목표 시간까지 좌석을 찾지 못해 자동 취소되었습니다.",
} as const;

export type JobCancelReason =
  (typeof JOB_CANCEL_REASON_KEY)[keyof typeof JOB_CANCEL_REASON_KEY];
