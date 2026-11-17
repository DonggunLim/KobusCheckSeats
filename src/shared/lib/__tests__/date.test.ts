import { afterEach, describe, expect, it, vi } from "vitest";
import { getKobusDateFromISODate, getTargetDateKST } from "../date";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getKobusDateFromISODate", () => {
  it("formats an ISO date into Kobus ymd format", () => {
    expect(getKobusDateFromISODate("2026-05-27").ymd).toBe("20260527");
  });

  // Next.js 개발 서버에서 ko-KR 포맷이 "2026/11/21"로 나와 코버스 조회가 실패한 적이 있다.
  it("does not depend on the runtime's localized date pattern", () => {
    const RealDateTimeFormat = Intl.DateTimeFormat;
    // `new Intl.DateTimeFormat()`으로 호출되므로 화살표 함수가 아닌 function이어야 한다.
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales, options) {
      const formatter = new RealDateTimeFormat(locales, options);
      // 코드가 쓰는 두 메서드만 흉내 낸다: format은 다른 패턴, formatToParts는 실제 값.
      const fake = {
        format: () => "2026/11/21",
        formatToParts: formatter.formatToParts.bind(formatter),
      };
      return fake as unknown as Intl.DateTimeFormat;
    });

    expect(getKobusDateFromISODate("2026-11-21").ymd).toBe("20261121");
    expect(getTargetDateKST("2월", "6", 2027).ymd).toBe("20270206");
  });
});
