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
  ymd: string; // YYYYMMDD 형식
  formatted: string; // "YYYY. MM. DD. (요일)" 형식
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
 * Date 객체를 KST 기준으로 포맷팅 (내부 함수)
 */
function formatDateKST(date: Date): FormattedDate {
  // YYYYMMDD 형식
  const ymd = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/\. /g, "")
    .replace(".", "");

  // "YYYY. MM. DD. (요일)" 형식
  const formatted = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(date);

  return { ymd, formatted };
}

/**
 * 오늘 기준 N일 후의 날짜를 KST로 포맷팅
 * @param daysOffset 오늘로부터의 일수 (양수: 미래, 음수: 과거)
 */
export function getTargetKST(daysOffset: number): FormattedDate {
  const todayKST = new Date(`${getKSTDateString()}T00:00:00+09:00`);
  const date = new Date(todayKST.getTime() + daysOffset * 24 * 60 * 60 * 1000);
  return formatDateKST(date);
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
