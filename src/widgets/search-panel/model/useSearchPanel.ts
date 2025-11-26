"use client";

import { useState } from "react";
import { getTodayDate } from "@/shared/lib/date";
import { CheckBusSeatsFormData } from "@/features/check-bus-seats/model/types";

export function useSearchPanel() {
  const [resetKey, setResetKey] = useState(0);
  const [formData, setFormData] = useState<CheckBusSeatsFormData>({
    departureTerminalCd: "",
    departureTerminalNm: "",
    arrivalTerminalCd: "",
    arrivalTerminalNm: "",
    date: getTodayDate(),
    selectedTimes: [],
  });

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

  // 날짜 변경 핸들러
  const handleDateChange = (date: string) => {
    const today = getTodayDate();
    if (date < today) {
      return;
    }
    setFormData((prev) => ({
      ...prev,
      date,
    }));
  };

  // 폼 리셋 핸들러
  const resetForm = () => {
    setFormData({
      departureTerminalCd: "",
      departureTerminalNm: "",
      arrivalTerminalCd: "",
      arrivalTerminalNm: "",
      date: getTodayDate(),
      selectedTimes: [],
    });
    setResetKey((prev) => prev + 1); // key 변경으로 RouteSelector 강제 리마운트
  };

  return {
    formData,
    resetKey,
    handleRouteChange,
    handleTimesChange,
    handleDateChange,
    resetForm,
  };
}
