import type { RouteQuery } from "@/shared/types/bus-check.types";

/**
 * Date utility functions
 */

/**
 * Get current time adjusted for KST storage in MySQL
 * MySQL DATETIME stores values without timezone info, so we need to
 * add the timezone offset to store the correct local time
 */
export function getKSTNow(): Date {
  const now = new Date();
  const offset = now.getTimezoneOffset(); // KST = -540 (9 hours ahead of UTC)
  const kstTime = new Date(now.getTime() - offset * 60 * 1000);
  return kstTime;
}

/**
 * Get today's date in ISO format
 */
export function getTodayDate(): string {
  return getKSTDateString();
}

// ============================================================
// KST (한국 표준시) 기준 날짜 포맷팅 유틸리티
// ============================================================

export interface FormattedDate {
  ymd: string; // YYYYMMDD 형식 (코버스 조회 파라미터)
}

export function getKSTDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getCurrentKSTYear(): number {
  return Number(getKSTDateString().slice(0, 4));
}

export function getTargetDateTimeKST(
  targetYear: number | undefined,
  targetMonth: string,
  targetDate: string,
  time: string
): Date {
  const year = targetYear ?? getCurrentKSTYear();
  const month = String(parseInt(targetMonth.replace("월", ""), 10)).padStart(2, "0");
  const day = String(parseInt(targetDate, 10)).padStart(2, "0");
  return new Date(`${year}-${month}-${day}T${time}:00+09:00`);
}

/**
 * 감시를 끝낼 시각: 마지막 목표 출발 시각(시간대 범위면 범위 끝).
 */
export function getMonitoringDeadlineKST(query: RouteQuery): Date {
  const lastTime = query.targetTimeRange?.end ?? [...query.targetTimes].sort().at(-1) ?? "00:00";
  return getTargetDateTimeKST(query.targetYear, query.targetMonth, query.targetDate, lastTime);
}

/**
 * Date 객체를 KST 기준 YYYYMMDD로 변환한다 (내부 함수).
 * 지역화된 날짜 문자열을 자르면 실행 환경의 ICU 데이터에 따라 "2026/11/21"처럼 달라질 수 있으므로
 * formatToParts 기반의 getKSTDateString을 쓴다.
 */
function formatDateKST(date: Date): FormattedDate {
  return { ymd: getKSTDateString(date).replace(/-/g, "") };
}

export function getKobusDateFromISODate(dateString: string): FormattedDate {
  const date = new Date(`${dateString}T00:00:00+09:00`);
  return formatDateKST(date);
}

/**
 * 특정 월/일을 KST로 포맷팅
 * @param targetMonth 월 문자열 (예: "11월")
 * @param targetDate 일 문자열 (예: "18")
 */
export function getTargetDateKST(
  targetMonth: string,
  targetDate: string,
  targetYear?: number
): FormattedDate {
  const year = targetYear ?? getCurrentKSTYear();
  const month = parseInt(targetMonth.replace("월", ""));
  const day = parseInt(targetDate);

  const targetDateObj = new Date(Date.UTC(year, month - 1, day));
  return formatDateKST(targetDateObj);
}
