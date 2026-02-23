import prisma from "../prisma";
import { getKakaoAccessToken } from "./kakao-token";
import { env } from "../env";
import { logger } from "../logger";

const log = logger.child({ module: "kakao-message" });

interface SeatCheckResult {
  config: {
    departureCd: string;
    arrivalCd: string;
    targetMonth: string;
    targetDate: string;
  };
  results: Array<{
    time: string;
    hasSeats: boolean;
    remainSeats: string;
  }>;
  firstFoundTime: string | null;
}

export async function sendKakaoMessage(
  userId: string,
  result: SeatCheckResult
): Promise<boolean> {
  try {
    const accessToken = await getKakaoAccessToken(userId);

    if (!accessToken) {
      log.error({ userId }, "No access token available");
      return false;
    }

    const message = await buildMessage(result);

    const response = await fetch(
      "https://kapi.kakao.com/v2/api/talk/memo/default/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          template_object: JSON.stringify({
            object_type: "text",
            text: message,
            link: {
              web_url: env.NEXTAUTH_URL || "http://localhost:3000",
              mobile_web_url:
                env.NEXTAUTH_URL || "http://localhost:3000",
            },
          }),
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, errorText }, "Send failed");
      return false;
    }

    log.info({ userId }, "Message sent successfully");
    return true;
  } catch (error) {
    log.error({ err: error, userId }, "Error sending message");
    return false;
  }
}

async function buildMessage(result: SeatCheckResult): Promise<string> {
  const { config, results, firstFoundTime } = result;
  const { departureCd, arrivalCd, targetMonth, targetDate } = config;

  // 터미널 코드로 이름 조회
  const terminals = await prisma.terminal.findMany({
    where: { terminalCd: { in: [departureCd, arrivalCd] } },
    select: { terminalCd: true, terminalNm: true },
  });
  const terminalMap = new Map(
    terminals.map((t) => [t.terminalCd, t.terminalNm])
  );
  const departureName = terminalMap.get(departureCd) || departureCd;
  const arrivalName = terminalMap.get(arrivalCd) || arrivalCd;

  const availableSeats = results
    .filter((r) => r.hasSeats)
    .map((r) => `${r.time} - ${r.remainSeats}`)
    .join("\n");

  return `
  kobusCheckSeats에서 좌석을 발견하였습니다.

  빈 좌석을 찾았습니다. 누군가 예매하기 전에 서두르세요.

  노선: ${departureName} → ${arrivalName}
  날짜: ${targetMonth} ${targetDate}일
  시간: ${availableSeats || firstFoundTime || "예매 가능"}`;
}
