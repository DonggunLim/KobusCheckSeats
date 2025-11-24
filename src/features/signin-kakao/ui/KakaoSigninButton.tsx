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
    <button
      onClick={() => signIn("kakao")}
      className="text-sm bg-green-dark text-white px-4 py-2 rounded-lg font-bold hover:bg-[#ffef5c] hover:text-black transition-colors cursor-pointer"
    >
      카카오 로그인
    </button>
  );
}
