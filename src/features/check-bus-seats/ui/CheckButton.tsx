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

  const handleClick = async () => {
    await startSession(formData);
    onSuccess?.();
  };

  return (
    <div className="w-full space-y-3">
      {!session && (
        <div className="relative animate-bounce">
          <div className="flex items-center justify-center gap-2 px-3 py-2 bg-orange-accent/10 border border-orange-accent/20 rounded-lg">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-orange-accent shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-xs text-orange-accent font-medium">
              로그인하지 않으면 알림을 받을 수 없어요
            </span>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-2">
            <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-orange-accent/20"></div>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[7px] border-r-[7px] border-t-[7px] border-l-transparent border-r-transparent border-t-orange-accent/10"></div>
          </div>
        </div>
      )}
      <button
        onClick={handleClick}
        disabled={
          disabled ||
          isChecking ||
          !formData.departureTerminalCd ||
          !formData.arrivalTerminalCd ||
          !formData.date ||
          formData.selectedTimes.length === 0
        }
        className="w-full rounded-lg px-6 py-3 font-semibold transition-all hover:bg-green-dark disabled:opacity-50 disabled:cursor-not-allowed bg-green-primary text-white"
      >
        {isChecking ? "작업 추가 중..." : "좌석 조회 시작"}
      </button>
    </div>
  );
}
