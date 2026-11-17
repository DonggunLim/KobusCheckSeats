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
    handleModeChange,
    handleTimeRangeChange,
    handleKeepWatchingChange,
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
          mode={formData.mode}
          onModeChange={handleModeChange}
          selectedTimes={formData.selectedTimes}
          onTimesChange={handleTimesChange}
          timeRange={formData.timeRange}
          onTimeRangeChange={handleTimeRangeChange}
        />

        <label className="flex items-start gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={formData.keepWatching}
            onChange={(e) => handleKeepWatchingChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-green-primary"
          />
          <span>
            좌석을 찾은 뒤에도 계속 감시
            <span className="block text-xs text-text-secondary">
              알림 후 예매 전에 자리가 다시 팔릴 때를 대비합니다. 새로 좌석이 생길 때마다 다시
              알리고, 출발 시간이 지나면 끝납니다.
            </span>
          </span>
        </label>

        {/* 조회 시작 버튼 */}
        <CheckButton formData={formData} onSuccess={resetForm} />
      </div>
    </div>
  );
}
