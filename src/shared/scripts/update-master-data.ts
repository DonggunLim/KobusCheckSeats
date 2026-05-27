import axios from "axios";
import { config } from "dotenv";
import prisma from "../lib/prisma";
import { AREA_CODE_MAP, KOBUS } from "../constants/kobus";

const envFile = process.env.NODE_ENV === "production" ? ".env" : ".env.local";
config({ path: envFile });

/**
 * area_codes 테이블을 수동 매핑 정보로 Upsert하는 함수
 */
async function updateAreaCodes() {
  let upsertCount = 0;
  for (const [code, name] of Object.entries(AREA_CODE_MAP)) {
    await prisma.areaCodes.upsert({
      where: { areaCd: code },
      update: { areaNm: name },
      create: { areaCd: code, areaNm: name },
    });
    upsertCount++;
  }
}

/**
 * 응답 데이터에서 중복되지 않는 터미널 목록을 추출합니다.
 */
function collectTerminals(data: any): Map<string, any> {
  const terminalMap = new Map<string, any>();
  const addTerminal = (cd: string, nm: string, area: string) => {
    // 코드가 유효하고, 이름이 있고, 맵에 없는 경우에만 추가
    if (cd && nm && !terminalMap.has(cd)) {
      if (!AREA_CODE_MAP[area]) {
        console.warn(`[SYNC] 미정의 지역 코드: ${area}, 터미널: ${nm}`);
        return;
      }
      terminalMap.set(cd, { cd, nm, area });
    }
  };

  // 1. 직행 노선(rotInfList)에서 수집
  data.rotInfList.forEach((route: any) => {
    addTerminal(route.deprCd, route.deprNm, route.deprArea);
    addTerminal(route.arvlCd, route.arvlNm, route.arvlArea);
  });

  // 2. 환승 노선(tfrInfList)에서 수집
  data.tfrInfList.forEach((route: any) => {
    addTerminal(route.deprCd, route.deprNm, route.deprArea);
    addTerminal(route.arvlCd, route.arvlNm, route.arvlArea);
    addTerminal(route.tfrCd, route.tfrNm, route.tfrArea);
  });
  return terminalMap;
}

/**
 * 메인 업데이트 함수
 */
export async function getMasterData(options: { disconnect?: boolean } = {}) {
  console.log("[SYNC] 마스터 데이터 동기화 시작");

  try {
    await updateAreaCodes();

    const response = await axios.post(
      KOBUS.URLS.MASTER_DATA,
      new URLSearchParams(),
      {
        headers: {
          "Content-Type": KOBUS.HTTP.HEADERS.CONTENT_TYPE_FORM,
          "User-Agent": KOBUS.HTTP.USER_AGENT,
        },
      }
    );

    const data = response.data;
    if (!data.rotInfList || !data.tfrInfList) {
      throw new Error("Kobus 응답 형식이 예상과 다릅니다.");
    }

    const terminalMap = collectTerminals(data);
    const terminals = Array.from(terminalMap.values());

    if (terminals.length > 0) {
      let upsertCount = 0;
      for (const terminal of terminals) {
        await prisma.terminal.upsert({
          where: { terminalCd: terminal.cd },
          update: {
            terminalNm: terminal.nm,
            areaCd: terminal.area,
          },
          create: {
            terminalCd: terminal.cd,
            terminalNm: terminal.nm,
            areaCd: terminal.area,
          },
        });
        upsertCount++;
      }
      console.log(`[SYNC] 터미널 ${upsertCount}건 처리 완료`);
    }

    const routesDirect = data.rotInfList
      .map((r: any) => ({
        deprCd: r.deprCd,
        arvlCd: r.arvlCd,
        takeTime: parseInt(r.takeTime) || null,
        homeTickYn: r.homeTickYn,
        prmmDcYn: r.prmmDcYn,
      }))
      .filter(
        (r: any) => terminalMap.has(r.deprCd) && terminalMap.has(r.arvlCd)
      );

    if (routesDirect.length > 0) {
      await prisma.routesDirect.deleteMany({});
      await prisma.routesDirect.createMany({
        data: routesDirect,
      });
      console.log(`[SYNC] 직행 노선 ${routesDirect.length}건 처리 완료`);
    }

    const routesTransfer = data.tfrInfList
      .map((r: any) => ({
        deprCd: r.deprCd,
        arvlCd: r.arvlCd,
        tfrCd: r.tfrCd,
        arvlNmAll: r.arvlNmAll,
      }))
      .filter(
        (r: any) =>
          terminalMap.has(r.deprCd) &&
          terminalMap.has(r.arvlCd) &&
          terminalMap.has(r.tfrCd)
      );

    if (routesTransfer.length > 0) {
      await prisma.routesTransfer.deleteMany({});
      await prisma.routesTransfer.createMany({
        data: routesTransfer,
      });
      console.log(`[SYNC] 환승 노선 ${routesTransfer.length}건 처리 완료`);
    }

    console.log("[SYNC] 마스터 데이터 동기화 완료");
  } catch (error) {
    console.error("[SYNC] 동기화 실패:", error);
    throw error;
  } finally {
    if (options.disconnect) {
      await prisma.$disconnect();
    }
  }
}

if (process.argv[1]?.endsWith("update-master-data.ts")) {
  getMasterData({ disconnect: true }).catch(() => {
    process.exitCode = 1;
  });
}
