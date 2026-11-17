import { useState, useCallback } from "react";
import axios from "axios";
import { useJobHistoryContext } from "@/entities/job-history";
import { CheckBusSeatsFormData } from "./types";
import { toast } from "@/shared/ui/use-toast";

export function useCheckSeats() {
  const [isChecking, setIsChecking] = useState(false);
  const { refetch } = useJobHistoryContext();

  const startSession = useCallback(
    async (formData: CheckBusSeatsFormData) => {
      const isRange = formData.mode === "range";
      if (isRange ? formData.timeRange.start > formData.timeRange.end : formData.selectedTimes.length === 0) {
        toast({ title: "확인할 시간을 선택해주세요", variant: "destructive" });
        return false;
      }

      setIsChecking(true);
      try {
        const [year, month, day] = formData.date.split("-");
        const apiPayload = {
          departureCd: formData.departureTerminalCd,
          arrivalCd: formData.arrivalTerminalCd,
          targetYear: Number(year),
          targetMonth: `${parseInt(month)}월`,
          targetDate: day,
          ...(isRange
            ? { targetTimeRange: formData.timeRange }
            : { targetTimes: formData.selectedTimes }),
          keepWatching: formData.keepWatching,
        };

        // 큐에 Job 추가
        await axios.post("/api/queue/job", apiPayload);

        refetch();
        toast({
          title: "좌석 감시를 등록했습니다",
          description: formData.keepWatching
            ? "1분마다 확인하고, 새로 좌석이 생길 때마다 텔레그램으로 알려드립니다."
            : "1분마다 확인하고, 좌석이 발견되면 텔레그램으로 알려드립니다.",
        });
        return true;
      } catch (err) {
        let message = "잠시 후 다시 시도해주세요.";
        if (axios.isAxiosError<{ error?: string }>(err)) {
          message =
            err.response?.status === 429
              ? "등록 요청이 많습니다. 1분 후 다시 시도해주세요."
              : err.response?.data?.error || "서버에 연결하지 못했습니다.";
        }
        console.error("Job registration failed:", err);
        toast({ title: "감시 등록에 실패했습니다", description: message, variant: "destructive" });
        return false;
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
