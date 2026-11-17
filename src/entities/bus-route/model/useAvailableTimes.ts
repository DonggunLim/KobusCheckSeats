"use client";

import { useEffect, useState } from "react";
import { fetchAvailableTimes } from "../api";
import type { FetchAvailableTimesResponse } from "./types";
import { getKSTDateString } from "@/shared/lib/date";

type LoadedTimes =
  | { key: string; data: FetchAvailableTimesResponse; error?: undefined }
  | { key: string; data?: undefined; error: string };

export function useAvailableTimes(
  departureTerminalCd: string,
  arrivalTerminalCd: string,
  selectedDate: string
) {
  const requestKey =
    departureTerminalCd && arrivalTerminalCd
      ? `${departureTerminalCd}|${arrivalTerminalCd}|${selectedDate}`
      : null;
  const [loaded, setLoaded] = useState<LoadedTimes | null>(null);

  useEffect(() => {
    if (!requestKey) return;

    // 노선·날짜를 빠르게 바꾸면 이전 요청 응답이 늦게 도착할 수 있다. 응답은 요청 키와 함께 저장해
    // 현재 조건과 다른 응답은 화면에 쓰지 않는다.
    let stale = false;
    fetchAvailableTimes(departureTerminalCd, arrivalTerminalCd, selectedDate).then(
      (data) => {
        if (!stale) setLoaded({ key: requestKey, data });
      },
      (err: unknown) => {
        if (stale) return;
        console.error("Failed to load available times:", err);
        setLoaded({ key: requestKey, error: err instanceof Error ? err.message : "시간대 조회 실패" });
      }
    );

    return () => {
      stale = true;
    };
  }, [requestKey, departureTerminalCd, arrivalTerminalCd, selectedDate]);

  const current = loaded && loaded.key === requestKey ? loaded : null;

  return {
    availableTimes: current?.data ? filterFutureTimes(current.data.times, selectedDate) : [],
    loading: !!requestKey && !current,
    error: current?.error ?? null,
    seats: current?.data?.seats ?? null,
    checkedAt: current?.data?.checkedAt ?? null,
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
