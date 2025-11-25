"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import axios from "axios";
import type { JobHistoryItem } from "../model/types";
import { JOB_CANCEL_REASON_LABEL } from "@/shared/constants/job";

interface JobHistoryItemCardProps {
  job: JobHistoryItem;
  onJobCancelled?: () => void;
}

const STATUS_CONFIG = {
  waiting: {
    color: "text-text-secondary",
    label: "대기",
  },
  active: {
    color: "text-green-primary",
    label: "진행중",
  },
  completed: {
    color: "text-green-dark",
    label: "완료",
  },
  failed: {
    color: "text-red-accent",
    label: "실패",
  },
  cancelled: {
    color: "text-orange-accent",
    label: "취소",
  },
};

export function JobHistoryItemCard({
  job,
  onJobCancelled,
}: JobHistoryItemCardProps) {
  const { data: session } = useSession();
  const [isCancelling, setIsCancelling] = useState(false);
  const status = STATUS_CONFIG[job.status];

  const isOwner = !job.userId || job.userId === session?.user?.id;
  const canCancel =
    (job.status === "waiting" || job.status === "active") && isOwner;

  const handleCancel = async () => {
    if (!confirm("정말 이 작업을 취소하시겠습니까?")) {
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
      alert("작업 취소에 실패했습니다.");
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary min-w-10">노선</span>
            <h3 className="font-semibold text-text-primary">
              {job.departure} → {job.arrival}
            </h3>
            {job.user?.name && (
              <span className="text-xs text-text-secondary">
                ({job.user.name} 님)
              </span>
            )}
          </div>

          {/* 예약 정보 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary min-w-10">예약</span>
            <span className="text-sm text-text-primary">
              {job.targetMonth} {job.targetDate}일 {job.targetTimes.join(", ")}
            </span>
          </div>

          {/* 에러/취소 메시지 */}
          {job.status === "failed" && job.error && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-text-secondary min-w-10">오류</span>
              <div className="text-xs text-red-accent">{job.error}</div>
            </div>
          )}
          {job.status === "cancelled" && job.reason && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-text-secondary min-w-10">사유</span>
              <div className="text-xs text-text-secondary">
                {JOB_CANCEL_REASON_LABEL[job.reason]}
              </div>
            </div>
          )}
        </div>

        {/* 우측: 스피너 */}
        {["active", "waiting"].includes(job.status) && (
          <svg
            className="animate-spin text-green-primary"
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
      <div className="flex items-center justify-between w-full text-xs mt-2 pr-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-text-secondary min-w-10">상태</span>
            <span className={`font-medium ${status.color}`}>
              {status.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-secondary">등록</span>
            <span className="text-text-primary">
              {job.createdAt.split("T")[0]}
            </span>
          </div>
          {job.retryCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-text-secondary">조회</span>
              <span className="text-orange-accent font-medium">
                {job.retryCount}회
              </span>
            </div>
          )}
        </div>
        {/* 취소 버튼 */}
        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={isCancelling}
            className="text-xs text-red-accent hover:underline disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
          >
            {isCancelling ? "취소 중..." : "취소 하기"}
          </button>
        )}
      </div>
    </li>
  );
}
