"use client";

import { RouteSelector, TimeSelector } from "@/entities/bus-route";
import { CheckButton } from "@/features/check-bus-seats";
import { getTodayDate, getLastMondayUpdate } from "@/shared/lib/date";
import { useSearchPanel } from "../model/useSearchPanel";

export function SearchPanel() {
  const {
    formData,
    resetKey,
    handleRouteChange,
    handleTimesChange,
    handleDateChange,
    resetForm,
  } = useSearchPanel();

  const lastUpdate = getLastMondayUpdate();

  return (
    <div className="rounded-xl p-6">
      <div className="mb-5 flex items-center gap-3">
        <h2 className="text-xl font-semibold text-text-primary">
          좌석 검색 조건
        </h2>
        <div className="flex items-center gap-1 text-text-secondary/50">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span className="text-xs whitespace-nowrap">
            {lastUpdate} 업데이트
          </span>
        </div>
      </div>
      <div className="space-y-5">
        {/* 노선 선택 */}
        <RouteSelector key={resetKey} onRouteChange={handleRouteChange} />

        {/* 날짜 */}
        <div>
          <label className="block text-sm font-medium mb-2 text-text-primary">
            출발 날짜
          </label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => handleDateChange(e.target.value)}
            min={getTodayDate()}
            className="w-full rounded-lg border border-beige-light  px-3 py-2.5 text-text-primary transition-all focus:outline-none focus:ring-2 focus:ring-green-primary"
            required
          />
        </div>

        {/* 시간 선택 */}
        <TimeSelector
          departureTerminalCd={formData.departureTerminalCd}
          arrivalTerminalCd={formData.arrivalTerminalCd}
          selectedDate={formData.date}
          selectedTimes={formData.selectedTimes}
          onTimesChange={handleTimesChange}
        />

        {/* 조회 시작 버튼 */}
        <CheckButton formData={formData} onSuccess={resetForm} />
      </div>
    </div>
  );
}
