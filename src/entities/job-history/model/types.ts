import type { JobCancelReason } from "@/shared/constants/job";

export interface JobHistoryItem {
  id: number;
  jobId: string;
  userId?: string;
  user?: {
    name: string | null;
  } | null;
  departure: string; // 출발 터미널 이름
  arrival: string; // 도착 터미널 이름
  targetMonth: string;
  targetDate: string;
  targetTimes: string[]; // 시간대 범위 감시면 빈 배열
  timeRangeStart: string | null;
  timeRangeEnd: string | null;
  keepWatching: boolean;
  notifyStatus: "sent" | "failed" | null;
  notifiedCount: number;
  status: "waiting" | "active" | "completed" | "failed" | "cancelled";
  retryCount: number;
  result: Record<string, unknown> | null; // 마지막 확인 결과(진행 중) 또는 좌석 발견 결과(완료)
  error: string | null;
  reason: JobCancelReason | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  // DB에 KST 벽시계 시각이 UTC 표기로 저장된다 (예: "2026-11-17T10:42:00.000Z" = KST 10:42)
  lastCheckedAt: string | null;
}

export interface FetchJobHistoryResponse {
  success: boolean;
  jobs: JobHistoryItem[];
  count: number;
}
