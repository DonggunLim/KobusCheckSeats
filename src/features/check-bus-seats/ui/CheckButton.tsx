"use client";

import { CheckBusSeatsFormData } from "../model/types";
import { useCheckSeats } from "../model/useCheckSeats";

interface CheckButtonProps {
  formData: CheckBusSeatsFormData;
  disabled?: boolean;
  onSuccess?: () => void;
}

export function CheckButton({ formData, disabled, onSuccess }: CheckButtonProps) {
  const { isChecking, startSession } = useCheckSeats();
  const isRange = formData.mode === "range";
  const hasTimes = isRange
    ? formData.timeRange.start <= formData.timeRange.end
    : formData.selectedTimes.length > 0;
  const buttonText = isChecking
    ? "감시 등록 중..."
    : !hasTimes
      ? "확인할 시간을 선택해주세요"
      : isRange
        ? `${formData.timeRange.start}~${formData.timeRange.end} 감시 시작`
        : `${formData.selectedTimes.length}개 시간 감시 시작`;

  const handleClick = async () => {
    const registered = await startSession(formData);
    if (registered) onSuccess?.();
  };

  return (
    <div className="w-full">
      <button
        onClick={handleClick}
        disabled={
          disabled ||
          isChecking ||
          !formData.departureTerminalCd ||
          !formData.arrivalTerminalCd ||
          !formData.date ||
          !hasTimes
        }
        className="w-full rounded-lg px-6 py-3 font-semibold transition-all hover:bg-green-dark disabled:opacity-50 disabled:cursor-not-allowed bg-green-primary text-white"
      >
        {buttonText}
      </button>
      <p className="mt-2 text-xs text-text-secondary">
        자동 예매가 아닙니다. 좌석 알림을 받은 뒤 코버스에서 직접 예매해주세요.
      </p>
    </div>
  );
}
