"use client";

import { JobHistoryItemCard } from "./JobHistoryItem";
import { useJobHistoryContext } from "../model/JobHistoryContext";

export function JobHistoryList() {
  const { jobs, loading, error, refetch } = useJobHistoryContext();

  return (
    <section className="rounded-xl">
      <div className="p-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-text-primary">감시 기록</h2>
          <p className="mt-2 text-xs text-text-secondary break-words">
            1분마다 좌석을 확인하고, 발견하면 텔레그램으로 알립니다(실패하면 다음 확인 때 다시 보냄). 자동 예매는 하지 않습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={refetch}
          disabled={loading}
          aria-busy={loading}
          className="text-sm text-green-dark whitespace-nowrap hover:underline disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? "새로고침 중..." : "새로고침"}
        </button>
      </div>

      {/* Loading 상태 */}
      {loading && jobs.length === 0 && (
        <div className="p-8 text-center text-text-secondary" role="status">감시 기록을 불러오는 중...</div>
      )}

      {/* Error 상태 */}
      {error && !loading && (
        <div className="p-6">
          <p className="text-red-accent" role="alert">감시 기록을 불러오지 못했습니다: {error}</p>
        </div>
      )}

      {/* Data 상태 */}
      {!loading && !error && jobs.length === 0 && (
        <div className="p-8 text-center text-text-secondary">
          아직 감시 기록이 없습니다.
        </div>
      )}

      {jobs.length > 0 && (
        <ul className="max-h-[600px] overflow-y-auto">
          {jobs.map((job) => (
            <JobHistoryItemCard
              key={job.id}
              job={job}
              onJobCancelled={refetch}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
