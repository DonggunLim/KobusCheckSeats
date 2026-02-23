"use client";

import { useEffect, useState } from "react";
import { fetchAvailableTimes } from "../api";

export function useAvailableTimes(
  departureTerminalCd: string,
  arrivalTerminalCd: string,
  selectedDate: string
) {
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!departureTerminalCd || !arrivalTerminalCd) {
      setAvailableTimes([]);
      return;
    }

    async function loadAvailableTimes() {
      setLoading(true);
      setError(null);
      try {
        const times = await fetchAvailableTimes(
          departureTerminalCd,
          arrivalTerminalCd
        );

        setAvailableTimes(filterFutureTimes(times, selectedDate));
      } catch (err) {
        console.error("Failed to load available times:", err);
        setError(err instanceof Error ? err.message : "시간대 조회 실패");
        setAvailableTimes([]);
      } finally {
        setLoading(false);
      }
    }
    loadAvailableTimes();
  }, [departureTerminalCd, arrivalTerminalCd, selectedDate]);

  return {
    availableTimes,
    loading,
    error,
  };
}

function getKSTDateString(): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replace(/\. /g, "-")
    .replace(/\./g, "");
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
