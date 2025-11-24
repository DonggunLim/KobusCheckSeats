import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import * as cheerio from "cheerio";
import prisma from "../../shared/lib/prisma";
import type {
  RouteQuery,
  RouteScheduleSlot,
  CheckResult,
} from "../../shared/types/bus-check.types";
import { KOBUS } from "@/shared/constants/kobus";
import { getTargetDateKST } from "@/shared/lib/date";

/**
 * axios + cheerio를 사용하여 코버스 사이트에서 버스 좌석을 확인합니다.
 */
export async function checkBusSeats(config: RouteQuery): Promise<CheckResult> {
  const { departureCd, arrivalCd, targetMonth, targetDate, targetTimes } =
    config;
  const startTime = Date.now();

  // axios + cookie jar 설정
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar, timeout: KOBUS.HTTP.TIMEOUT }));

  const results: RouteScheduleSlot[] = [];
  let foundSeats = false;
  let firstFoundTime: string | null = null;

  try {
    // 1. 세션 쿠키 획득
    await client.get(KOBUS.URLS.SESSION_COOKIE, {
      headers: {
        "User-Agent": KOBUS.HTTP.USER_AGENT,
        Accept: KOBUS.HTTP.HEADERS.ACCEPT_HTML,
      },
    });

    // 2. 날짜 포맷팅 (KST 기준)
    const { ymd, formatted } = getTargetDateKST(targetMonth, targetDate);

    // 3. 터미널 이름 조회 (코드 → 이름)
    const terminalNames = await getTerminalNames(departureCd, arrivalCd);

    // 4. alcnSrch.do에 POST 요청
    const pageParams = new URLSearchParams();
    pageParams.append("deprCd", departureCd);
    pageParams.append("deprNm", terminalNames.departureName);
    pageParams.append("arvlCd", arrivalCd);
    pageParams.append("arvlNm", terminalNames.arrivalName);
    pageParams.append("pathDvs", KOBUS.FORM.PATH_DVS);
    pageParams.append("pathStep", KOBUS.FORM.PATH_STEP);
    pageParams.append("crchDeprArvlYn", KOBUS.FORM.CRCH_DEPR_ARVL_YN);
    pageParams.append("deprDtm", ymd);
    pageParams.append("deprDtmAll", formatted);
    pageParams.append("arvlDtm", ymd);
    pageParams.append("arvlDtmAll", formatted);
    pageParams.append("busClsCd", KOBUS.FORM.BUS_CLS_CD);
    pageParams.append("prmmDcYn", KOBUS.FORM.PRMM_DC_YN);
    pageParams.append("tfrCd", KOBUS.FORM.TFR_CD);
    pageParams.append("tfrNm", KOBUS.FORM.TFR_NM);
    pageParams.append("tfrArvlFullNm", KOBUS.FORM.TFR_ARVL_FULL_NM);
    pageParams.append("abnrData", KOBUS.FORM.ABNR_DATA);

    const response = await client.post(KOBUS.URLS.ROUTE_INFO, pageParams, {
      headers: {
        "Content-Type": KOBUS.HTTP.HEADERS.CONTENT_TYPE_FORM,
        "User-Agent": KOBUS.HTTP.USER_AGENT,
        Referer: KOBUS.URLS.SESSION_COOKIE,
        Accept: KOBUS.HTTP.HEADERS.ACCEPT_HTML,
      },
    });

    // 5. HTML 파싱
    const $ = cheerio.load(response.data);
    const busRows = $(KOBUS.SELECTORS.BUS_ROWS);

    // 6. 각 시간대별 좌석 정보 추출
    for (const time of targetTimes) {
      let found = false;

      busRows.each((_idx: number, row: cheerio.Element) => {
        const $row = $(row);

        // 시간 추출
        const timeText = $row.find(KOBUS.SELECTORS.START_TIME).text().trim();
        const normalizedTime = timeText.replace(/\s+/g, ""); // "12 : 10" → "12:10"

        if (normalizedTime === time) {
          // 잔여 좌석 추출
          const remainSeatsText = $row
            .find(KOBUS.SELECTORS.REMAIN_SEATS)
            .text()
            .trim();

          // 상태 추출
          const statusText = $row.find(KOBUS.SELECTORS.STATUS).text().trim();

          const hasSeats =
            !statusText.includes(KOBUS.STATUS.SOLDOUT) &&
            !remainSeatsText.includes(KOBUS.STATUS.SEATS_ZERO);

          if (hasSeats) {
            foundSeats = true;
            if (!firstFoundTime) {
              firstFoundTime = time;
            }
          }

          results.push({
            time,
            remainSeats: remainSeatsText,
            status: statusText,
            hasSeats,
          });

          found = true;
        }
      });

      if (!found) {
        results.push({
          time,
          remainSeats: KOBUS.STATUS.NOT_AVAILABLE,
          status: KOBUS.STATUS.NO_INFO,
          hasSeats: false,
        });
      }
    }

    const endTime = Date.now();
    const durationMs = endTime - startTime;

    return {
      timestamp: new Date().toISOString(),
      config,
      results,
      foundSeats,
      success: true,
      totalCheckCount: targetTimes.length,
      firstFoundTime,
      durationMs,
    };
  } catch (error) {
    const endTime = Date.now();
    const durationMs = endTime - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(
      `[Worker] ✗ 조회 실패 | ${departureCd} → ${arrivalCd} | ${errorMsg}`
    );

    return {
      timestamp: new Date().toISOString(),
      config,
      results,
      foundSeats: false,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      totalCheckCount: targetTimes.length,
      firstFoundTime: null,
      durationMs,
    };
  }
}

/**
 * 터미널 코드 → 이름 조회 (DB에서 가져오기)
 */
async function getTerminalNames(
  departureCd: string,
  arrivalCd: string
): Promise<{ departureName: string; arrivalName: string }> {
  try {
    // DB에서 터미널 이름 조회
    const terminals = await prisma.terminal.findMany({
      where: {
        terminalCd: { in: [departureCd, arrivalCd] },
      },
      select: {
        terminalCd: true,
        terminalNm: true,
      },
    });

    const terminalMap = new Map(
      terminals.map((t) => [t.terminalCd, t.terminalNm])
    );

    const departureName = terminalMap.get(departureCd) || departureCd;
    const arrivalName = terminalMap.get(arrivalCd) || arrivalCd;

    return { departureName, arrivalName };
  } catch (error) {
    // DB 연결 실패 시 코드를 그대로 사용
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(
      `[Worker] DB 연결 실패, 터미널 코드를 이름으로 사용: ${errorMsg}`
    );
    return { departureName: departureCd, arrivalName: arrivalCd };
  }
}
