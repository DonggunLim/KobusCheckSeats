"use client";

import { useState } from "react";
import { getTodayDate } from "@/shared/lib/date";
import type {
  CheckBusSeatsFormData,
  TimeSelectionMode,
} from "@/features/check-bus-seats/model/types";
import type { TimeRange } from "@/shared/types/bus-check.types";

function createInitialFormData(): CheckBusSeatsFormData {
  return {
    departureTerminalCd: "",
    departureTerminalNm: "",
    arrivalTerminalCd: "",
    arrivalTerminalNm: "",
    date: getTodayDate(),
    mode: "times",
    selectedTimes: [],
    timeRange: { start: "00:00", end: "24:00" },
    keepWatching: false,
  };
}

export function useSearchPanel() {
  const [resetKey, setResetKey] = useState(0);
  const [formData, setFormData] = useState<CheckBusSeatsFormData>(createInitialFormData);

  // 노선 변경 핸들러
  const handleRouteChange = (route: {
    departureTerminalCd: string;
    departureTerminalNm: string;
    arrivalTerminalCd: string;
    arrivalTerminalNm: string;
  }) => {
    setFormData((prev) => ({
      ...prev,
      ...route,
      selectedTimes: [], // 노선 변경시 선택된 시간 초기화
    }));
  };

  // 시간 변경 핸들러
  const handleTimesChange = (times: string[]) => {
    setFormData((prev) => ({
      ...prev,
      selectedTimes: times,
    }));
  };

  const handleModeChange = (mode: TimeSelectionMode) => {
    setFormData((prev) => ({ ...prev, mode }));
  };

  const handleTimeRangeChange = (timeRange: TimeRange) => {
    setFormData((prev) => ({ ...prev, timeRange }));
  };

  const handleKeepWatchingChange = (keepWatching: boolean) => {
    setFormData((prev) => ({ ...prev, keepWatching }));
  };

  // 날짜 변경 핸들러
  const handleDateChange = (date: string) => {
    const today = getTodayDate();
    if (date < today) {
      return;
    }
    // 날짜마다 배차가 다르므로 이전 날짜에서 고른 시간은 버린다.
    setFormData((prev) => ({
      ...prev,
      date,
      selectedTimes: [],
    }));
  };

  // 폼 리셋 핸들러
  const resetForm = () => {
    setFormData(createInitialFormData());
    setResetKey((prev) => prev + 1); // key 변경으로 RouteSelector 강제 리마운트
  };

  return {
    formData,
    resetKey,
    handleRouteChange,
    handleTimesChange,
    handleModeChange,
    handleTimeRangeChange,
    handleKeepWatchingChange,
    handleDateChange,
    resetForm,
  };
}
