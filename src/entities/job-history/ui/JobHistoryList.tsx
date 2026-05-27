"use client";

import { JobHistoryItemCard } from "./JobHistoryItem";
import { useJobHistoryContext } from "../model/JobHistoryContext";

export function JobHistoryList() {
  const { jobs, loading, error, refetch } = useJobHistoryContext();

  return (
    <section className="rounded-xl">
      <div className="p-6">
        <h2 className="text-xl font-semibold text-text-primary">
          조회 히스토리
        </h2>
      </div>

      {/* Loading 상태 */}
      {loading && jobs.length === 0 && (
        <div className="p-8 text-center text-text-secondary">로딩 중...</div>
      )}

      {/* Error 상태 */}
      {error && !loading && (
        <div className="p-6">
          <p className="text-red-accent">히스토리 로딩 실패: {error}</p>
        </div>
      )}

      {/* Data 상태 */}
      {!loading && !error && jobs.length === 0 && (
        <div className="p-8 text-center text-text-secondary">
          아직 조회 기록이 없습니다.
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
