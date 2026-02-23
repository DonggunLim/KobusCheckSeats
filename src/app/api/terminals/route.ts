import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/shared/lib/prisma";
import { parseSearchParams } from "@/shared/lib/api-validation";
import { cache, TTL } from "@/shared/lib/cache";
import { logger } from "@/shared/lib/logger";

const log = logger.child({ route: "terminals" });

const schema = z.object({ areaCd: z.string().min(1).max(20) });

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseSearchParams(schema, searchParams);
    if (!parsed.success) return parsed.response;
    const { areaCd } = parsed.data;

    const cacheKey = `terminals:${areaCd}`;
    const cached = cache.get(cacheKey);
    if (cached) return NextResponse.json(cached);

    // Get terminals in the specified area that have departure routes
    const terminals = await prisma.terminal.findMany({
      where: {
        areaCd,
        departureRoutesDirect: {
          some: {},
        },
      },
      orderBy: { terminalNm: "asc" },
      select: {
        terminalCd: true,
        terminalNm: true,
        areaCd: true,
      },
    });

    cache.set(cacheKey, terminals, TTL.TERMINALS);
    return NextResponse.json(terminals);
  } catch (error) {
    log.error({ err: error }, "Failed to fetch terminals");
    return NextResponse.json({ error: "Failed to fetch terminals" }, { status: 500 });
  }
}
