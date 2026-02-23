import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/shared/lib/prisma";
import { parseSearchParams, terminalCdSchema } from "@/shared/lib/api-validation";
import { logger } from "@/shared/lib/logger";

const log = logger.child({ route: "destinations" });

const schema = z.object({ deprCd: terminalCdSchema });

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseSearchParams(schema, searchParams);
    if (!parsed.success) return parsed.response;
    const { deprCd } = parsed.data;

    // Get all destinations reachable from the departure terminal
    const routes = await prisma.routesDirect.findMany({
      where: { deprCd },
      include: {
        arrivalTerminal: true,
      },
      orderBy: {
        arrivalTerminal: {
          terminalNm: "asc",
        },
      },
    });

    const destinations = routes.map((route) => ({
      terminalCd: route.arrivalTerminal.terminalCd,
      terminalNm: route.arrivalTerminal.terminalNm,
      areaCd: route.arrivalTerminal.areaCd,
    }));

    return NextResponse.json(destinations);
  } catch (error) {
    log.error({ err: error }, "Failed to fetch destinations");
    return NextResponse.json({ error: "Failed to fetch destinations" }, { status: 500 });
  }
}
