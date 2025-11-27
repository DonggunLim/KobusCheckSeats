"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export function KakaoSigninButton() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div className="text-sm text-white">로딩 중...</div>;
  }

  if (session && session.user) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-sm text-white font-medium">
          {session.user.name}님
        </span>
        <button
          onClick={() => signOut()}
          className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-full transition-colors"
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => signIn("kakao")}
        className="text-sm bg-green-dark text-white px-4 py-2 rounded-lg font-bold hover:bg-[#ffef5c] hover:text-black transition-colors cursor-pointer"
      >
        카카오 로그인
      </button>
      <div className="absolute top-full right-0 mt-4 animate-bounce z-50 w-max max-w-[85vw] sm:max-w-none">
        <div className="relative flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-white/95 border-2 border-orange-accent rounded-lg shadow-lg">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-orange-accent shrink-0 sm:w-4 sm:h-4"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="text-[10px] sm:text-xs text-orange-accent font-bold text-center leading-tight">
            로그인하지 않으면 알림을 받을 수 없어요
          </span>
        </div>
        <div className="absolute right-8 sm:right-10 -top-2">
          <div className="w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-orange-accent"></div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[7px] border-r-[7px] border-b-[7px] border-l-transparent border-r-transparent border-b-white/95"></div>
        </div>
      </div>
    </div>
  );
}
