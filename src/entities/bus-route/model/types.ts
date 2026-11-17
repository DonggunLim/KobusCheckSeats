/**
 * 지역 정보 (DB area_codes)
 */
export interface Area {
  areaCd: string;
  areaNm: string;
}

/**
 * 터미널 정보 (DB terminals)
 */
export interface TerminalData {
  terminalCd: string;
  terminalNm: string;
  areaCd: string | null;
}

export interface TimeSeatSummary {
  remainSeats: number; // 같은 시각 버스들의 잔여석 합
  soldOut: boolean;
  departingSoon: boolean; // 웹 예매 불가, 모바일앱 예매만 가능
}

/**
 * 사용 가능한 시간 조회 API 응답
 */
export interface FetchAvailableTimesResponse {
  success: boolean;
  date: string;
  source: "live" | "cache" | "db-fallback";
  checkedAt: string; // 코버스 조회 시각 (ISO)
  times: string[];
  seats: Record<string, TimeSeatSummary> | null; // 실시간 조회일 때만 있음
  count: number;
}
