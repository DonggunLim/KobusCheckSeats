import type { Area, FetchAvailableTimesResponse, TerminalData } from "../model/types";

/**
 * Fetch all available areas
 */
export async function fetchAreas(): Promise<Area[]> {
  const response = await fetch("/api/areas");
  if (!response.ok) {
    throw new Error("Failed to fetch areas");
  }
  return response.json();
}

/**
 * Fetch terminals for a specific area
 */
export async function fetchTerminals(areaCd: string): Promise<TerminalData[]> {
  const response = await fetch(`/api/terminals?areaCd=${areaCd}`);
  if (!response.ok) {
    throw new Error("Failed to fetch terminals");
  }
  return response.json();
}

/**
 * Fetch destinations reachable from a departure terminal
 */
export async function fetchDestinations(deprCd: string): Promise<TerminalData[]> {
  const response = await fetch(`/api/destinations?deprCd=${deprCd}`);
  if (!response.ok) {
    throw new Error("Failed to fetch destinations");
  }
  return response.json();
}

/**
 * Fetch available times for a route on a specific date
 */
export async function fetchAvailableTimes(
  departure: string,
  arrival: string,
  date: string
): Promise<FetchAvailableTimesResponse> {
  const params = new URLSearchParams({ departure, arrival, date });
  const response = await fetch(`/api/schedules/times?${params.toString()}`);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || "운행 시간 조회에 실패했습니다");
  }
  return data;
}
