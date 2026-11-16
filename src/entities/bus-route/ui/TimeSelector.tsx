"use client";

import { useAvailableTimes } from "../model/useAvailableTimes";
import { useTimeSelector } from "../model/useTimeSelector";

interface TimeSelectorProps {
  departureTerminalCd: string;
  arrivalTerminalCd: string;
  selectedDate: string;
  selectedTimes: string[];
  onTimesChange: (times: string[]) => void;
}

export function TimeSelector({
  departureTerminalCd,
  arrivalTerminalCd,
  selectedDate,
  selectedTimes,
  onTimesChange,
}: TimeSelectorProps) {
  const { toggleTime } = useTimeSelector();
  const { availableTimes, loading, error, source } = useAvailableTimes(
    departureTerminalCd,
    arrivalTerminalCd,
    selectedDate
  );

  const hasRoute = !!(departureTerminalCd && arrivalTerminalCd);

  // 이벤트 핸들러
  const handleToggle = (time: string) => {
    onTimesChange(toggleTime(selectedTimes, time));
  };
  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-2">
        확인할 시간대
        {selectedTimes.length > 0 && (
          <span className="ml-2 text-xs text-text-secondary">
            {selectedTimes.length}개
          </span>
        )}
      </label>

      {/* 노선 선택 전 안내 메시지 */}
      {!hasRoute ? (
        <p className="text-sm text-text-secondary py-6 text-center">
          출발지와 도착지를 먼저 선택해주세요
        </p>
      ) : loading ? (
        <p className="text-sm text-text-secondary py-6 text-center">
          운행 시간 조회 중...
        </p>
      ) : error ? (
        <p className="text-sm text-red-accent py-6 text-center">{error}</p>
      ) : availableTimes.length === 0 ? (
        <p className="text-sm text-red-accent py-6 text-center">
          코버스에 조회되는 배차가 없습니다. 명절처럼 예매 오픈 전인 날짜라면 오픈 후 다시
          확인해주세요.
        </p>
      ) : (
        <>
          {source === "db-fallback" && (
            <p className="mb-3 text-xs text-red-accent">
              코버스 실시간 조회에 실패해 지난 정기 시간표를 표시합니다. 선택한 날짜의 실제 배차와
              다를 수 있습니다.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {availableTimes.map((time: string) => {
              const isSelected = selectedTimes.includes(time);
              return (
                <button
                  key={time}
                  type="button"
                  onClick={() => handleToggle(time)}
                  className={`min-w-14 rounded-md border px-3 py-1.5 text-sm transition-all ${
                    isSelected
                      ? "border-green-primary bg-green-primary/10 text-green-dark font-medium"
                      : "border-beige-light text-text-primary hover:border-green-primary/50 hover:bg-green-primary/5"
                  }`}
                >
                  {time}
                </button>
              );
            })}
          </div>
          {hasRoute && selectedTimes.length === 0 && (
            <p className="mt-3 text-xs text-red-accent">
              최소 1개 이상 선택해주세요
            </p>
          )}
        </>
      )}
    </div>
  );
}
