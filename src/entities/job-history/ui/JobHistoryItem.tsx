"use client";

import { useState } from "react";
import axios from "axios";
import type { JobHistoryItem } from "../model/types";
import { JOB_CANCEL_REASON_LABEL } from "@/shared/constants/job";
import { toast } from "@/shared/ui/use-toast";

interface JobHistoryItemCardProps {
  job: JobHistoryItem;
  onJobCancelled?: () => void;
}

const STATUS_CONFIG = {
  waiting: {
    color: "text-text-secondary",
    label: "감시 중 · 다음 확인 대기",
  },
  active: {
    color: "text-green-primary",
    label: "감시 중 · 좌석 확인 중",
  },
  completed: {
    color: "text-green-dark",
    label: "좌석 발견",
  },
  failed: {
    color: "text-red-accent",
    label: "감시 실패",
  },
  cancelled: {
    color: "text-orange-accent",
    label: "감시 종료",
  },
};

function getAvailableResults(result: unknown) {
  if (typeof result !== "object" || result === null || !("results" in result)) {
    return [];
  }
  const results: unknown = result.results;
  if (!Array.isArray(results)) {
    return [];
  }
  return results.filter(
    (slot: unknown): slot is { time: string; remainSeats: string; hasSeats: true } =>
      typeof slot === "object" &&
      slot !== null &&
      "hasSeats" in slot &&
      slot.hasSeats === true &&
      "time" in slot &&
      typeof slot.time === "string" &&
      slot.time.trim().length > 0 &&
      "remainSeats" in slot &&
      typeof slot.remainSeats === "string" &&
      slot.remainSeats.trim().length > 0
  );
}

export function JobHistoryItemCard({ job, onJobCancelled }: JobHistoryItemCardProps) {
  const [isCancelling, setIsCancelling] = useState(false);
  const status = STATUS_CONFIG[job.status];

  const canCancel = job.status === "waiting" || job.status === "active";
  const availableResults = job.status === "completed" ? getAvailableResults(job.result) : [];

  const handleCancel = async () => {
    if (!confirm("좌석 감시를 취소하시겠습니까? 더 이상 좌석을 확인하지 않습니다.")) {
      return;
    }

    setIsCancelling(true);
    try {
      await axios.delete(`/api/queue/job`, {
        params: { jobId: job.jobId },
      });
      onJobCancelled?.();
    } catch (error) {
      console.error("Job cancellation failed:", error);
      toast({
        title: "감시 취소에 실패했습니다",
        description: "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setIsCancelling(false);
    }
  };
  return (
    <li className="border-b border-beige-light py-4 px-2 hover:bg-cream-bg/50 transition-colors">
      <div className="flex items-start gap-4">
        {/* 좌측: 정보 */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* 노선 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-secondary min-w-10 shrink-0">노선</span>
            <h3 className="font-semibold text-text-primary break-words">
              {job.departure} → {job.arrival}
            </h3>
            {job.user?.name && (
              <span className="text-xs text-text-secondary">({job.user.name} 님)</span>
            )}
          </div>

          {/* Monitored schedule */}
          <div className="flex items-start gap-2">
            <span className="text-xs text-text-secondary min-w-10 shrink-0">일정</span>
            <span className="text-sm text-text-primary min-w-0 break-words">
              {job.targetMonth} {job.targetDate}일 {job.targetTimes.join(", ")}
            </span>
          </div>

          {job.status === "completed" && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-text-secondary min-w-10 shrink-0">발견</span>
              <div className="text-xs text-text-primary min-w-0 break-words space-y-1">
                {availableResults.length > 0 ? (
                  <ul className="space-y-1">
                    {availableResults.map((slot, index) => (
                      <li key={`${slot.time}-${index}`}>
                        {slot.time} · 잔여 {slot.remainSeats}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>이 기록에는 표시할 시간·좌석 상세 정보가 없습니다.</p>
                )}
                <p className="text-text-secondary">
                  발견 당시 정보이며 예매·알림 발송 완료를 뜻하지 않습니다.
                </p>
              </div>
            </div>
          )}

          {/* Recorded errors may remain after a retry succeeds. */}
          {(job.status === "failed" || canCancel) && job.error && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-text-secondary min-w-10 shrink-0">
                {canCancel ? "이전 오류" : "오류"}
              </span>
              <div className="text-xs min-w-0 break-words">
                <p className="text-red-accent">{job.error}</p>
                {canCancel && (
                  <p className="text-text-secondary mt-1">
                    마지막으로 기록된 오류이며 현재 상태와 다를 수 있습니다.
                  </p>
                )}
              </div>
            </div>
          )}
          {job.status === "cancelled" && job.reason && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-text-secondary min-w-10 shrink-0">사유</span>
              <div className="text-xs text-text-secondary min-w-0 break-words">
                {JOB_CANCEL_REASON_LABEL[job.reason]}
              </div>
            </div>
          )}
        </div>

        {/* Only spin while a check is running. */}
        {job.status === "active" && (
          <svg
            aria-hidden="true"
            className="animate-spin text-green-primary shrink-0"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
      </div>

      {/* 상태 및 등록일 - 전체 넓이 사용 */}
      <div className="flex flex-wrap items-center justify-between gap-3 w-full text-xs mt-2 pr-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-text-secondary min-w-10">상태</span>
            <span className={`font-medium ${status.color}`}>{status.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-secondary">등록</span>
            <span className="text-text-primary">{job.createdAt.split("T")[0]}</span>
          </div>
          {job.retryCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-text-secondary">조회</span>
              <span className="text-orange-accent font-medium">{job.retryCount}회</span>
            </div>
          )}
        </div>
        {/* 취소 버튼 */}
        {canCancel && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={isCancelling}
            className="text-xs text-red-accent hover:underline disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
          >
            {isCancelling ? "취소 중..." : "감시 취소"}
          </button>
        )}
      </div>
    </li>
  );
}
