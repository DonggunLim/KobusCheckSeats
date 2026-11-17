import axios from "axios";
import { config } from "dotenv";
import { z } from "zod";
import prisma from "../lib/prisma";
import { AREA_CODE_MAP, KOBUS } from "../constants/kobus";

const envFile = process.env.NODE_ENV === "production" ? ".env" : ".env.local";
config({ path: envFile });

// readRotLinInf.ajax 응답 중 사용하는 필드 (2026-11-17 실측 기준)
const directRouteSchema = z.object({
  deprCd: z.string(),
  deprNm: z.string(),
  deprArea: z.string(),
  arvlCd: z.string(),
  arvlNm: z.string(),
  arvlArea: z.string(),
  takeTime: z.string().nullish(),
  homeTickYn: z.string().nullish(),
  prmmDcYn: z.string().nullish(),
});

const transferRouteSchema = z.object({
  deprCd: z.string(),
  deprNm: z.string(),
  deprArea: z.string(),
  arvlCd: z.string(),
  arvlNm: z.string(),
  arvlArea: z.string(),
  tfrCd: z.string(),
  tfrNm: z.string(),
  tfrArea: z.string(),
  arvlNmAll: z.string().nullish(),
});

const masterDataSchema = z.object({
  rotInfList: z.array(directRouteSchema),
  tfrInfList: z.array(transferRouteSchema),
});

type MasterData = z.infer<typeof masterDataSchema>;

interface TerminalInfo {
  cd: string;
  nm: string;
  area: string;
}

/**
 * area_codes 테이블을 수동 매핑 정보로 Upsert하는 함수
 */
async function updateAreaCodes() {
  for (const [code, name] of Object.entries(AREA_CODE_MAP)) {
    await prisma.areaCodes.upsert({
      where: { areaCd: code },
      update: { areaNm: name },
      create: { areaCd: code, areaNm: name },
    });
  }
}

/**
 * 응답 데이터에서 중복되지 않는 터미널 목록을 추출합니다.
 */
function collectTerminals(data: MasterData): Map<string, TerminalInfo> {
  const terminalMap = new Map<string, TerminalInfo>();
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
  for (const route of data.rotInfList) {
    addTerminal(route.deprCd, route.deprNm, route.deprArea);
    addTerminal(route.arvlCd, route.arvlNm, route.arvlArea);
  }

  // 2. 환승 노선(tfrInfList)에서 수집
  for (const route of data.tfrInfList) {
    addTerminal(route.deprCd, route.deprNm, route.deprArea);
    addTerminal(route.arvlCd, route.arvlNm, route.arvlArea);
    addTerminal(route.tfrCd, route.tfrNm, route.tfrArea);
  }
  return terminalMap;
}

/**
 * 메인 업데이트 함수
 */
export async function getMasterData(options: { disconnect?: boolean } = {}) {
  console.log("[SYNC] 마스터 데이터 동기화 시작");

  try {
    await updateAreaCodes();

    const response = await axios.post(KOBUS.URLS.MASTER_DATA, new URLSearchParams(), {
      headers: {
        "Content-Type": KOBUS.HTTP.HEADERS.CONTENT_TYPE_FORM,
        "User-Agent": KOBUS.HTTP.USER_AGENT,
      },
    });

    const parsed = masterDataSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new Error("Kobus 응답 형식이 예상과 다릅니다.");
    }
    const data = parsed.data;

    const terminalMap = collectTerminals(data);
    for (const terminal of terminalMap.values()) {
      await prisma.terminal.upsert({
        where: { terminalCd: terminal.cd },
        update: { terminalNm: terminal.nm, areaCd: terminal.area },
        create: { terminalCd: terminal.cd, terminalNm: terminal.nm, areaCd: terminal.area },
      });
    }
    console.log(`[SYNC] 터미널 ${terminalMap.size}건 처리 완료`);

    const routesDirect = data.rotInfList
      .filter((r) => terminalMap.has(r.deprCd) && terminalMap.has(r.arvlCd))
      .map((r) => ({
        deprCd: r.deprCd,
        arvlCd: r.arvlCd,
        takeTime: parseInt(r.takeTime ?? "", 10) || null,
        homeTickYn: r.homeTickYn ?? null,
        prmmDcYn: r.prmmDcYn ?? null,
      }));

    const routesTransfer = data.tfrInfList
      .filter(
        (r) => terminalMap.has(r.deprCd) && terminalMap.has(r.arvlCd) && terminalMap.has(r.tfrCd)
      )
      .map((r) => ({
        deprCd: r.deprCd,
        arvlCd: r.arvlCd,
        tfrCd: r.tfrCd,
        arvlNmAll: r.arvlNmAll ?? null,
      }));

    // 삭제와 재생성을 한 트랜잭션으로 묶어, 동기화 중 조회나 중간 실패로 노선이 비지 않게 한다.
    if (routesDirect.length > 0) {
      await prisma.$transaction([
        prisma.routesDirect.deleteMany({}),
        prisma.routesDirect.createMany({ data: routesDirect }),
      ]);
      console.log(`[SYNC] 직행 노선 ${routesDirect.length}건 처리 완료`);
    }

    if (routesTransfer.length > 0) {
      await prisma.$transaction([
        prisma.routesTransfer.deleteMany({}),
        prisma.routesTransfer.createMany({ data: routesTransfer }),
      ]);
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
