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

/**
 * 사용 가능한 시간 조회 API 응답
 */
export interface FetchAvailableTimesResponse {
  success: boolean;
  date: string;
  source: "live" | "cache" | "db-fallback";
  times: string[];
  count: number;
}
