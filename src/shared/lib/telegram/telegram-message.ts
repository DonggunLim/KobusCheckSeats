import prisma from "../prisma";
import { env } from "../env";
import { logger } from "../logger";
import type { CheckResult } from "@/shared/types/bus-check.types";

const log = logger.child({ module: "telegram-message" });

export async function sendTelegramMessage(result: CheckResult): Promise<boolean> {
  try {
    const message = await buildTelegramMessage(result);
    const response = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: message,
          disable_web_page_preview: true,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, errorText }, "Telegram send failed");
      return false;
    }

    log.info({ chatId: env.TELEGRAM_CHAT_ID }, "Telegram message sent successfully");
    return true;
  } catch (error) {
    log.error({ err: error }, "Error sending Telegram message");
    return false;
  }
}

export async function buildTelegramMessage(result: CheckResult): Promise<string> {
  const { config, results, firstFoundTime, totalCheckCount, durationMs } = result;
  const { departureCd, arrivalCd, targetMonth, targetDate, targetTimes } = config;

  const terminals = await prisma.terminal.findMany({
    where: { terminalCd: { in: [departureCd, arrivalCd] } },
    select: { terminalCd: true, terminalNm: true },
  });
  const terminalMap = new Map(terminals.map((t) => [t.terminalCd, t.terminalNm]));
  const departureName = terminalMap.get(departureCd) || departureCd;
  const arrivalName = terminalMap.get(arrivalCd) || arrivalCd;

  const availableSeats = results
    .filter((route) => route.hasSeats)
    .map((route) => `- ${route.time}: ${route.remainSeats} (${route.status})`)
    .join("\n");

  const checkedTimes = targetTimes.join(", ");
  const durationSeconds = (durationMs / 1000).toFixed(1);

  return [
    "[Kobus 좌석 알림]",
    "",
    `요청: ${env.TELEGRAM_REQUESTER_LABEL}`,
    `노선: ${departureName} -> ${arrivalName}`,
    `날짜: ${targetMonth} ${targetDate}일`,
    `확인 시간대: ${checkedTimes}`,
    "",
    "좌석 발견:",
    availableSeats || `- ${firstFoundTime || "예매 가능"}: 좌석 있음`,
    "",
    `확인 대상: ${totalCheckCount}개 시간대`,
    `조회 소요: ${durationSeconds}초`,
    "예매: https://www.kobus.co.kr",
  ].join("\n");
}
