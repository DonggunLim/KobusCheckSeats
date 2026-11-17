"use client";

import { useAvailableTimes } from "../model/useAvailableTimes";
import { useTimeSelector } from "../model/useTimeSelector";
import type { TimeSeatSummary } from "../model/types";
import type { TimeRange, TimeSelectionMode } from "@/shared/types/bus-check.types";

interface TimeSelectorProps {
  departureTerminalCd: string;
  arrivalTerminalCd: string;
  selectedDate: string;
  mode: TimeSelectionMode;
  onModeChange: (mode: TimeSelectionMode) => void;
  selectedTimes: string[];
  onTimesChange: (times: string[]) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

// 30분 단위 00:00~24:00 (코버스는 자정 출발을 "24:00"으로 표시한다)
const RANGE_OPTIONS = Array.from({ length: 49 }, (_, index) => {
  const minutes = index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

export function TimeSelector({
  departureTerminalCd,
  arrivalTerminalCd,
  selectedDate,
  mode,
  onModeChange,
  selectedTimes,
  onTimesChange,
  timeRange,
  onTimeRangeChange,
}: TimeSelectorProps) {
  const { toggleTime } = useTimeSelector();
  const { availableTimes, loading, error, seats, checkedAt } = useAvailableTimes(
    departureTerminalCd,
    arrivalTerminalCd,
    selectedDate
  );

  const hasRoute = !!(departureTerminalCd && arrivalTerminalCd);
  const checkedAtText = checkedAt ? `잔여석은 ${formatKSTTime(checkedAt)} 기준입니다. ` : "";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-primary">
          확인할 시간대
          {mode === "times" && selectedTimes.length > 0 && (
            <span className="ml-2 text-xs text-text-secondary">{selectedTimes.length}개 선택</span>
          )}
        </p>
        <div role="group" aria-label="시간 선택 방식" className="flex rounded-md border border-beige-light p-0.5 text-xs">
          {(
            [
              ["times", "출발 시각 선택"],
              ["range", "시간대 범위"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => onModeChange(value)}
              className={`rounded px-2.5 py-1 transition-colors ${
                mode === value ? "bg-green-primary text-white" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!hasRoute ? (
        <p className="text-sm text-text-secondary py-6 text-center">
          출발지와 도착지를 먼저 선택해주세요
        </p>
      ) : mode === "range" ? (
        <RangeFields
          timeRange={timeRange}
          onTimeRangeChange={onTimeRangeChange}
          loading={loading}
          error={error}
          availableTimes={availableTimes}
          seats={seats}
          checkedAtText={checkedAtText}
        />
      ) : loading ? (
        <p className="text-sm text-text-secondary py-6 text-center">운행 시간 조회 중...</p>
      ) : error ? (
        <p className="text-sm text-red-accent py-6 text-center">{error}</p>
      ) : availableTimes.length === 0 ? (
        <p className="text-sm text-red-accent py-6 text-center">
          코버스에 조회되는 배차가 없습니다. 명절처럼 예매 오픈 전이라면 &quot;시간대 범위&quot;로
          미리 등록할 수 있습니다.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {availableTimes.map((time: string) => {
              const isSelected = selectedTimes.includes(time);
              const seat = seats?.[time];
              return (
                <button
                  key={time}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onTimesChange(toggleTime(selectedTimes, time))}
                  className={`flex min-w-16 flex-col items-center rounded-md border px-3 py-1.5 text-sm transition-all ${
                    isSelected
                      ? "border-green-primary bg-green-primary/10 text-green-dark font-medium"
                      : "border-beige-light text-text-primary hover:border-green-primary/50 hover:bg-green-primary/5"
                  }`}
                >
                  <span>{time}</span>
                  {seat && <SeatLabel seat={seat} />}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-text-secondary">
            {checkedAtText}
            매진된 시간도 고를 수 있으며, 취소표가 나오면 텔레그램으로 알려드립니다.
          </p>
        </>
      )}
    </div>
  );
}

function RangeFields({
  timeRange,
  onTimeRangeChange,
  loading,
  error,
  availableTimes,
  seats,
  checkedAtText,
}: {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  loading: boolean;
  error: string | null;
  availableTimes: string[];
  seats: Record<string, TimeSeatSummary> | null;
  checkedAtText: string;
}) {
  const inRange = availableTimes.filter((time) => time >= timeRange.start && time <= timeRange.end);
  const soldOutCount = inRange.filter((time) => seats?.[time]?.soldOut).length;
  const invalid = timeRange.start > timeRange.end;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <RangeSelect
          label="시작"
          value={timeRange.start}
          onChange={(start) => onTimeRangeChange({ ...timeRange, start })}
        />
        <span className="text-text-secondary">~</span>
        <RangeSelect
          label="끝"
          value={timeRange.end}
          onChange={(end) => onTimeRangeChange({ ...timeRange, end })}
        />
      </div>
      {invalid ? (
        <p className="text-xs text-red-accent">시작 시각이 끝 시각보다 늦습니다.</p>
      ) : (
        <p className="text-xs text-text-secondary">
          {loading
            ? "현재 배차를 조회하는 중입니다. "
            : error
              ? `현재 배차를 확인하지 못했습니다(${error}). `
              : inRange.length > 0
                ? `${checkedAtText}이 범위에 현재 ${inRange.length}개 시각이 있고 그중 ${soldOutCount}개가 매진입니다. `
                : "이 범위에는 아직 조회되는 배차가 없습니다. "}
          범위 안에 출발하는 모든 버스를 확인하므로, 예매 오픈 전이거나 명절 임시차가 나중에 추가돼도
          감시합니다.
        </p>
      )}
    </div>
  );
}

function RangeSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative flex-1 text-xs text-text-secondary">
      <span className="sr-only">{label} 시각</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full appearance-none rounded-lg border border-beige-light bg-white pl-3 pr-9 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-green-primary"
      >
        {RANGE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </label>
  );
}

function SeatLabel({ seat }: { seat: TimeSeatSummary }) {
  if (seat.soldOut) {
    return <span className="text-[11px] font-medium text-red-accent">매진</span>;
  }
  if (seat.departingSoon) {
    return <span className="text-[11px] text-orange-accent">출발임박</span>;
  }
  return <span className="text-[11px] text-text-secondary">{seat.remainSeats}석</span>;
}

function formatKSTTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
