import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn(async () => undefined) }));
vi.mock("../prisma", () => ({ default: { terminal: { findMany: vi.fn(async () => []) } } }));
vi.mock("../env", () => ({
  env: { TELEGRAM_BOT_TOKEN: "token", TELEGRAM_CHAT_ID: "chat", TELEGRAM_REQUESTER_LABEL: "테스트" },
}));

import { sendTelegramText } from "../telegram/telegram-message";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("sendTelegramText", () => {
  it("retries temporary Telegram failures until the alert is delivered", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("busy", { status: 502 }))
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await expect(sendTelegramText("좌석 발견")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry configuration errors that cannot succeed", async () => {
    fetchMock.mockResolvedValue(new Response("chat not found", { status: 400 }));

    await expect(sendTelegramText("좌석 발견")).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports failure after all attempts fail", async () => {
    fetchMock.mockResolvedValue(new Response("busy", { status: 503 }));
    await expect(sendTelegramText("좌석 발견")).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
