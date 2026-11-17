import { setTimeout as sleep } from "node:timers/promises";
import prisma from "../prisma";
import { env } from "../env";
import { logger } from "../logger";
import { KOBUS } from "@/shared/constants/kobus";
import type { CheckResult } from "@/shared/types/bus-check.types";

const log = logger.child({ module: "telegram-message" });

const SEND_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [2_000, 5_000];
const MAX_RETRY_AFTER_MS = 30_000;

/**
 * 텔레그램 그룹에 메시지를 보낸다. 네트워크 오류·5xx·429는 최대 3번까지 다시 시도한다.
 * @returns 전송 성공 여부
 */
export async function sendTelegramText(text: string): Promise<boolean> {
  for (let attempt = 1; attempt <= SEND_ATTEMPTS; attempt++) {
    let retryAfterMs = RETRY_DELAYS_MS[attempt - 1] ?? 0;
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: env.TELEGRAM_CHAT_ID,
            text,
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (response.ok) {
        log.info({ attempt }, "Telegram message sent");
        return true;
      }

      const errorText = await response.text();
      log.error({ status: response.status, errorText, attempt }, "Telegram send failed");

      // 4xx(429 제외)는 토큰·채팅방 설정 문제라 다시 보내도 성공하지 않는다.
      if (response.status < 500 && response.status !== 429) return false;
      if (response.status === 429) {
        const retryAfterSec = Number(response.headers.get("retry-after"));
        if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
          retryAfterMs = Math.min(retryAfterSec * 1000, MAX_RETRY_AFTER_MS);
        }
      }
    } catch (error) {
      log.error({ err: error, attempt }, "Error sending Telegram message");
    }

    if (attempt < SEND_ATTEMPTS) {
      await sleep(retryAfterMs);
    }
  }
  return false;
}

export async function sendTelegramMessage(result: CheckResult): Promise<boolean> {
  return sendTelegramText(await buildTelegramMessage(result));
}

/** 운영자에게 연동 이상·복구를 알린다. */
export async function sendAdminAlert(message: string): Promise<boolean> {
  return sendTelegramText(`[Kobus 연동 경고]\n\n${message}`);
}

export async function buildTelegramMessage(result: CheckResult): Promise<string> {
  const { config, results, totalCheckCount, durationMs } = result;
  const { departureCd, arrivalCd, targetYear, targetMonth, targetDate, targetTimes, targetTimeRange } =
    config;

  const terminals = await prisma.terminal.findMany({
    where: { terminalCd: { in: [departureCd, arrivalCd] } },
    select: { terminalCd: true, terminalNm: true },
  });
  const terminalMap = new Map(terminals.map((t) => [t.terminalCd, t.terminalNm]));
  const departureName = terminalMap.get(departureCd) || departureCd;
  const arrivalName = terminalMap.get(arrivalCd) || arrivalCd;

  const availableSlots = results.filter((route) => route.hasSeats);
  const availableSeats = availableSlots
    .map((route) => `- ${route.time}: ${route.remainSeats} (${route.status})`)
    .join("\n");
  const hasDepartingSoon = availableSlots.some(
    (route) => route.status === KOBUS.STATUS.DEPARTING_SOON
  );

  const checkedTimes = targetTimeRange
    ? `${targetTimeRange.start}~${targetTimeRange.end} 출발 전체`
    : targetTimes.join(", ");
  const durationSeconds = (durationMs / 1000).toFixed(1);
  const year = targetYear ? `${targetYear}년 ` : "";

  return [
    "[Kobus 좌석 알림]",
    "",
    `요청: ${env.TELEGRAM_REQUESTER_LABEL}`,
    `노선: ${departureName} -> ${arrivalName}`,
    `날짜: ${year}${targetMonth} ${targetDate}일`,
    `확인 시간대: ${checkedTimes}`,
    "",
    "좌석 발견:",
    availableSeats,
    ...(hasDepartingSoon
      ? ["", "출발임박 버스는 웹 예매가 막혀 고속버스 모바일앱으로만 예매할 수 있습니다."]
      : []),
    "",
    `확인 대상: ${targetTimeRange ? "시간대 범위" : `${totalCheckCount}개 시각`}`,
    `조회 소요: ${durationSeconds}초`,
    "예매는 직접 해야 합니다: https://www.kobus.co.kr/mrs/rotinf.do",
  ].join("\n");
}
