"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { JobHistoryItem } from "./types";
import { fetchJobHistory } from "../api";

export function useJobHistory(limit: number = 20) {
  const [jobs, setJobs] = useState<JobHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sseConnected = useRef(false);

  // 상태는 응답 콜백에서만 바꾼다 (effect 안에서 동기 setState를 하지 않기 위해).
  const fetchJobs = useCallback(
    () =>
      fetchJobHistory(limit)
        .then(
          (data) => {
            setJobs(data.jobs || []);
            setError(null);
          },
          (err: unknown) => {
            setError(err instanceof Error ? err.message : "히스토리 조회 실패");
          }
        )
        .finally(() => setLoading(false)),
    [limit]
  );

  // 사용자가 누르는 새로고침은 진행 표시를 먼저 켠다.
  const refetch = useCallback(() => {
    setLoading(true);
    void fetchJobs();
  }, [fetchJobs]);

  // Initial fetch
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // SSE connection for real-time updates with 30s polling fallback
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (pollInterval) return;
      pollInterval = setInterval(() => {
        fetchJobs();
      }, 30_000);
    }

    function connectSSE() {
      eventSource = new EventSource("/api/jobs/stream");

      eventSource.onopen = () => {
        sseConnected.current = true;
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      };

      eventSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type === "heartbeat" || event.type === "connected") return;
          fetchJobs();
        } catch {
          // ignore malformed messages
        }
      };

      eventSource.onerror = () => {
        sseConnected.current = false;
        eventSource?.close();
        eventSource = null;
        startPolling();
      };
    }

    connectSSE();

    return () => {
      eventSource?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [fetchJobs]);

  return {
    jobs,
    loading,
    error,
    refetch,
  };
}
