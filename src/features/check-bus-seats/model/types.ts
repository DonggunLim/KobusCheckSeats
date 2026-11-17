import type { TimeRange, TimeSelectionMode } from "@/shared/types/bus-check.types";

export type { TimeSelectionMode };

export type CheckBusSeatsFormData = {
  departureTerminalCd: string;
  departureTerminalNm: string;
  arrivalTerminalCd: string;
  arrivalTerminalNm: string;
  date: string;
  mode: TimeSelectionMode;
  selectedTimes: string[];
  timeRange: TimeRange;
  keepWatching: boolean;
};
