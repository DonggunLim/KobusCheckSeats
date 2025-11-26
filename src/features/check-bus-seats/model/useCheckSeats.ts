import { useState, useCallback } from "react";
import axios from "axios";
import { useJobHistoryContext } from "@/entities/job-history";
import { CheckBusSeatsFormData } from "./types";

export function useCheckSeats() {
  const [isChecking, setIsChecking] = useState(false);
  const { refetch } = useJobHistoryContext();

  const startSession = useCallback(
    async (formData: CheckBusSeatsFormData) => {
      if (formData.selectedTimes.length === 0) {
        alert("최소 1개 이상의 시간대를 선택해주세요.");
        return;
      }

      setIsChecking(true);
      try {
        const [_year, month, day] = formData.date.split("-");
        const apiPayload = {
          departureCd: formData.departureTerminalCd,
          arrivalCd: formData.arrivalTerminalCd,
          targetMonth: `${parseInt(month)}월`,
          targetDate: day,
          targetTimes: formData.selectedTimes,
        };

        // 큐에 Job 추가
        const { data } = await axios.post("/api/queue/job", apiPayload);

        // Job 추가 성공 후 히스토리 즉시 갱신
        refetch();

        return data;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Job 추가 실패";
        console.error("Job 추가 실패:", err);
        alert(`Job 추가 실패: ${errorMessage}`);
        throw err;
      } finally {
        setIsChecking(false);
      }
    },
    [refetch]
  );

  return {
    isChecking,
    startSession,
  };
}
