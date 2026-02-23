import prisma from "../prisma";
import { env } from "../env";
import { logger } from "../logger";

const log = logger.child({ module: "kakao-token" });

interface KakaoTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in: number;
  refresh_token_expires_in?: number;
}

export async function getKakaoAccessToken(
  userId: string
): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "kakao",
    },
    select: {
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  });

  if (!account?.access_token) {
    return null;
  }

  // 토큰 만료 확인 (5분 여유)
  const now = Math.floor(Date.now() / 1000);
  const isExpired = account.expires_at && account.expires_at < now + 300;

  if (isExpired && account.refresh_token) {
    const newToken = await refreshKakaoToken(userId, account.refresh_token);
    return newToken;
  }

  return account.access_token;
}

export async function refreshKakaoToken(
  userId: string,
  refreshToken: string
): Promise<string | null> {
  try {
    const response = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: env.KAKAO_REST_API_KEY,
        client_secret: env.KAKAO_CLIENT_SECRET_KEY,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      log.error({ body: await response.text() }, "Kakao token refresh failed");
      return null;
    }

    const data: KakaoTokenResponse = await response.json();

    // DB에 새 토큰 저장
    await prisma.account.updateMany({
      where: {
        userId,
        provider: "kakao",
      },
      data: {
        access_token: data.access_token,
        expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
        ...(data.refresh_token && { refresh_token: data.refresh_token }),
      },
    });

    return data.access_token;
  } catch (error) {
    log.error({ err: error }, "Kakao token refresh error");
    return null;
  }
}
