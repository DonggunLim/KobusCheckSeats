// src/shared/lib/auth.ts
import NextAuth from "next-auth";
import Kakao from "next-auth/providers/kakao";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/shared/lib/prisma";
import { getKSTNow } from "@/shared/lib/date";
import type { Adapter } from "@auth/core/adapters";

// 커스텀 어댑터
const baseAdapter = PrismaAdapter(prisma);
const adapter: Adapter = {
  ...baseAdapter,
  createUser: async (data) => {
    const now = getKSTNow();
    return prisma.user.create({
      data: { ...data, createdAt: now, updatedAt: now },
    }) as ReturnType<NonNullable<typeof baseAdapter.createUser>>;
  },
  linkAccount: async (data) => {
    const now = getKSTNow();
    await prisma.account.create({
      data: { ...data, createdAt: now, updatedAt: now },
    });
  },
  createSession: async (data) => {
    const now = getKSTNow();
    return prisma.session.create({
      data: { ...data, createdAt: now, updatedAt: now },
    });
  },
  updateSession: async (data) => {
    return prisma.session.update({
      where: { sessionToken: data.sessionToken },
      data: { ...data, updatedAt: getKSTNow() },
    });
  },
  updateUser: async (data) => {
    const { id, ...rest } = data;
    return prisma.user.update({
      where: { id },
      data: { ...rest, updatedAt: getKSTNow() },
    }) as ReturnType<NonNullable<typeof baseAdapter.updateUser>>;
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter,
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers: [
    Kakao({
      clientId: process.env.KAKAO_REST_API_KEY,
      clientSecret: process.env.KAKAO_CLIENT_SECRET_KEY,
      // 카카오톡 메시지 보내기 권한 요청
      authorization: {
        url: "https://kauth.kakao.com/oauth/authorize",
        params: {
          scope: "talk_message talk_calendar profile_nickname",
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      // 클라이언트에서 session.user.id를 쓸 수 있게 추가
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});
