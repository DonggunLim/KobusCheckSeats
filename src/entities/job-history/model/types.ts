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
  targetTimes: string[];
  status: "waiting" | "active" | "completed" | "failed" | "cancelled";
  retryCount: number;
  result: Record<string, unknown> | null;
  error: string | null;
  reason: JobCancelReason | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface FetchJobHistoryResponse {
  success: boolean;
  jobs: JobHistoryItem[];
  count: number;
}
