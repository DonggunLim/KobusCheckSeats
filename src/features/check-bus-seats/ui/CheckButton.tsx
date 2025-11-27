"use client";

import { useSession } from "next-auth/react";
import { CheckBusSeatsFormData } from "../model/types";
import { useCheckSeats } from "../model/useCheckSeats";

interface CheckButtonProps {
  formData: CheckBusSeatsFormData;
  disabled?: boolean;
  onSuccess?: () => void;
}

export function CheckButton({
  formData,
  disabled,
  onSuccess,
}: CheckButtonProps) {
  const { data: session } = useSession();
  const { isChecking, startSession } = useCheckSeats();
  const buttonText = session?.user
    ? isChecking
      ? "작업 추가 중..."
      : "좌석 조회 시작"
    : "로그인이 필요합니다.";

  const handleClick = async () => {
    if (!session) {
      return;
    }
    await startSession(formData);
    onSuccess?.();
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
          formData.selectedTimes.length === 0 ||
          !session?.user
        }
        className="w-full rounded-lg px-6 py-3 font-semibold transition-all hover:bg-green-dark disabled:opacity-50 disabled:cursor-not-allowed bg-green-primary text-white"
      >
        {buttonText}
      </button>
    </div>
  );
}
