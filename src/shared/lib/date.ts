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
  return new Date().toISOString().split("T")[0];
}

// ============================================================
// KST (한국 표준시) 기준 날짜 포맷팅 유틸리티
// ============================================================

export interface FormattedDate {
  ymd: string; // YYYYMMDD 형식
  formatted: string; // "YYYY. MM. DD. (요일)" 형식
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
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return formatDateKST(date);
}

/**
 * 특정 월/일을 KST로 포맷팅
 * @param targetMonth 월 문자열 (예: "11월")
 * @param targetDate 일 문자열 (예: "18")
 */
export function getTargetDateKST(
  targetMonth: string,
  targetDate: string
): FormattedDate {
  const now = new Date();
  const year = now.getFullYear();
  const month = parseInt(targetMonth.replace("월", ""));
  const day = parseInt(targetDate);

  const targetDateObj = new Date(year, month - 1, day);
  return formatDateKST(targetDateObj);
}

/**
 * 가장 최근 월요일 03시 데이터 업데이트 날짜를 반환
 * 매주 월요일 03:00에 데이터가 업데이트되므로, 가장 최근 업데이트 날짜 계산
 */
export function getLastMondayUpdate(): string {
  const now = new Date();
  const kstNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );

  const dayOfWeek = kstNow.getDay(); // 0(일) ~ 6(토)
  const currentHour = kstNow.getHours();

  let daysToSubtract = 0;

  if (dayOfWeek === 1 && currentHour >= 3) {
    // 월요일이고 03시 이후면 오늘이 업데이트 날짜
    daysToSubtract = 0;
  } else if (dayOfWeek === 0) {
    // 일요일이면 6일 전 (지난 월요일)
    daysToSubtract = 6;
  } else if (dayOfWeek === 1) {
    // 월요일이지만 03시 이전이면 지난주 월요일
    daysToSubtract = 7;
  } else {
    // 화~토요일이면 이번주 월요일
    daysToSubtract = dayOfWeek - 1;
  }

  const lastMonday = new Date(kstNow);
  lastMonday.setDate(kstNow.getDate() - daysToSubtract);

  // YYYY년 MM월 DD일 형식으로 반환
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(lastMonday);
}
