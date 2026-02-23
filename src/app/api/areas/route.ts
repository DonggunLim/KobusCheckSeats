import { NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";
import { cache, TTL } from "@/shared/lib/cache";
import { logger } from "@/shared/lib/logger";

const log = logger.child({ route: "areas" });

const CACHE_KEY = "areas:all";

export async function GET() {
  try {
    const cached = cache.get(CACHE_KEY);
    if (cached) return NextResponse.json(cached);

    const areas = await prisma.areaCodes.findMany({
      orderBy: { areaCd: "asc" },
    });

    cache.set(CACHE_KEY, areas, TTL.AREAS);
    return NextResponse.json(areas);
  } catch (error) {
    log.error({ err: error }, "Failed to fetch areas");
    return NextResponse.json({ error: "Failed to fetch areas" }, { status: 500 });
  }
}
