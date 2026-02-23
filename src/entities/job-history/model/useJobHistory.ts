"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { JobHistoryItem } from "./types";
import { fetchJobHistory } from "../api";

export function useJobHistory(limit: number = 20) {
  const [jobs, setJobs] = useState<JobHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sseConnected = useRef(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJobHistory(limit);
      setJobs(data.jobs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "히스토리 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [limit]);

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
    refetch: fetchJobs,
  };
}
