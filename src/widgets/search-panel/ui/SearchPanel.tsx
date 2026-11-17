"use client";

import { RouteSelector, TimeSelector } from "@/entities/bus-route";
import { CheckButton } from "@/features/check-bus-seats";
import { getTodayDate } from "@/shared/lib/date";
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

  return (
    <div className="rounded-xl p-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-text-primary">좌석 감시 등록</h2>
        <p className="mt-1 text-xs text-text-secondary">
          운행 시간과 잔여석은 코버스에서 실시간으로 조회합니다.
        </p>
      </div>
      <div className="space-y-5">
        {/* 노선 선택 */}
        <RouteSelector key={resetKey} onRouteChange={handleRouteChange} />

        {/* 날짜 */}
        <div>
          <label
            htmlFor="departure-date"
            className="block text-sm font-medium mb-2 text-text-primary"
          >
            출발 날짜
          </label>
          <input
            id="departure-date"
            type="date"
            value={formData.date}
            onChange={(e) => handleDateChange(e.target.value)}
            min={getTodayDate()}
            className="h-11 w-full rounded-lg border border-beige-light bg-white px-3 text-text-primary transition-all focus:outline-none focus:ring-2 focus:ring-green-primary"
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
