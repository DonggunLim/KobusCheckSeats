"use client";

import { useEffect, useState } from "react";
import { fetchAvailableTimes } from "../api";
import type { FetchAvailableTimesResponse, TimeSeatSummary } from "./types";
import { getKSTDateString } from "@/shared/lib/date";

export function useAvailableTimes(
  departureTerminalCd: string,
  arrivalTerminalCd: string,
  selectedDate: string
) {
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<FetchAvailableTimesResponse["source"] | null>(null);
  const [seats, setSeats] = useState<Record<string, TimeSeatSummary> | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    setAvailableTimes([]);
    setSource(null);
    setSeats(null);
    setCheckedAt(null);
    setError(null);
    setLoading(false);

    if (!departureTerminalCd || !arrivalTerminalCd) {
      return;
    }

    // 노선·날짜를 빠르게 바꾸면 이전 요청 응답이 늦게 도착해 다른 날짜 시간표를 덮어쓸 수 있다.
    let stale = false;

    async function loadAvailableTimes() {
      setLoading(true);
      try {
        const data = await fetchAvailableTimes(
          departureTerminalCd,
          arrivalTerminalCd,
          selectedDate
        );
        if (stale) return;

        setAvailableTimes(filterFutureTimes(data.times, selectedDate));
        setSource(data.source);
        setSeats(data.seats);
        setCheckedAt(data.checkedAt);
      } catch (err) {
        if (stale) return;
        console.error("Failed to load available times:", err);
        setError(err instanceof Error ? err.message : "시간대 조회 실패");
      } finally {
        if (!stale) setLoading(false);
      }
    }
    loadAvailableTimes();

    return () => {
      stale = true;
    };
  }, [departureTerminalCd, arrivalTerminalCd, selectedDate]);

  return {
    availableTimes,
    loading,
    error,
    source,
    seats,
    checkedAt,
  };
}

function getKSTTimeMinutes(): number {
  const kstNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return kstNow.getHours() * 60 + kstNow.getMinutes();
}

function filterFutureTimes(times: string[], selectedDate: string): string[] {
  // 선택한 날짜가 오늘(KST)인지 확인
  const todayKST = getKSTDateString();

  if (selectedDate !== todayKST) {
    return times;
  }

  // 오늘이면 현재 KST 시간 이후의 시간들만 필터링
  const currentMinutes = getKSTTimeMinutes();
  return times.filter((time) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes > currentMinutes;
  });
}
