import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/telegram/telegram-message", () => ({ sendAdminAlert: vi.fn(async () => true) }));

import { sendAdminAlert } from "@/shared/lib/telegram/telegram-message";
import { FAILURE_STREAK_THRESHOLD, recordKobusCheck, resetKobusHealth } from "../kobus-health";
import type { CheckResult } from "@/shared/types/bus-check.types";

function check(success: boolean, errorKind?: CheckResult["errorKind"]): CheckResult {
  return {
    timestamp: "",
    config: { departureCd: "010", arrivalCd: "700", targetMonth: "11월", targetDate: "20", targetTimes: ["09:00"] },
    results: [],
    foundSeats: false,
    success,
    error: success ? undefined : "응답 형식이 예상과 다릅니다",
    errorKind,
    totalCheckCount: 1,
    firstFoundTime: null,
    durationMs: 1,
  };
}

beforeEach(() => {
  resetKobusHealth();
  vi.mocked(sendAdminAlert).mockClear();
});

describe("recordKobusCheck", () => {
  it("alerts once after repeated integration failures and again when lookups recover", async () => {
    for (let i = 0; i < FAILURE_STREAK_THRESHOLD + 3; i++) {
      await recordKobusCheck(check(false, "failure"), 1_000 + i);
    }
    expect(sendAdminAlert).toHaveBeenCalledTimes(1);

    await recordKobusCheck(check(true));
    expect(sendAdminAlert).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendAdminAlert).mock.calls[1][0]).toContain("정상");
  });

  it("does not treat dates Kobus refuses to show as an integration failure", async () => {
    for (let i = 0; i < FAILURE_STREAK_THRESHOLD * 2; i++) {
      await recordKobusCheck(check(false, "unavailable"));
    }
    expect(sendAdminAlert).not.toHaveBeenCalled();
  });

  it("resets the streak after a successful lookup", async () => {
    for (let i = 0; i < FAILURE_STREAK_THRESHOLD - 1; i++) await recordKobusCheck(check(false, "failure"));
    await recordKobusCheck(check(true));
    for (let i = 0; i < FAILURE_STREAK_THRESHOLD - 1; i++) await recordKobusCheck(check(false, "failure"));
    expect(sendAdminAlert).not.toHaveBeenCalled();
  });
});
