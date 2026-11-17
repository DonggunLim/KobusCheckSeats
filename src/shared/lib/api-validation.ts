import { z } from "zod";
import { NextResponse } from "next/server";

export function validationError(errors: z.ZodError) {
  return NextResponse.json(
    {
      error: "Validation failed",
      details: errors.flatten().fieldErrors,
    },
    { status: 400 }
  );
}

export function parseSearchParams<T extends z.ZodTypeAny>(
  schema: T,
  searchParams: URLSearchParams
): { success: true; data: z.infer<T> } | { success: false; response: NextResponse } {
  const raw = Object.fromEntries(searchParams.entries());
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { success: false, response: validationError(result.error) };
  }
  return { success: true, data: result.data };
}

export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown
): { success: true; data: z.infer<T> } | { success: false; response: NextResponse } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return { success: false, response: validationError(result.error) };
  }
  return { success: true, data: result.data };
}

// Reusable schemas
export const terminalCdSchema = z.string().min(1).max(20);
export const limitSchema = z.coerce.number().int().min(1).max(100).default(20);
export const statusSchema = z
  .enum(["waiting", "active", "completed", "failed", "cancelled"])
  .optional();

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, "time must be HH:MM format");

export const queueJobSchema = z
  .object({
    departureCd: terminalCdSchema,
    arrivalCd: terminalCdSchema,
    targetYear: z.number().int().min(2000).max(2100).optional(),
    targetMonth: z.string().regex(/^\d{1,2}월$/, "targetMonth must be like '11월'"),
    targetDate: z.string().regex(/^\d{1,2}$/, "targetDate must be a day number"),
    targetTimes: z.array(timeSchema).default([]),
    // 이 범위(양 끝 포함)에 출발하는 모든 버스를 감시. 명절 임시차처럼 나중에 추가된 버스도 포함된다.
    targetTimeRange: z
      .object({ start: timeSchema, end: timeSchema })
      .refine((range) => range.start <= range.end, "range start must not be after end")
      .optional(),
    keepWatching: z.boolean().default(false),
    scheduleId: z.string().optional(),
    priority: z.number().optional(),
    delay: z.number().optional(),
  })
  .refine((job) => (job.targetTimes.length > 0) !== (job.targetTimeRange !== undefined), {
    message: "Provide either targetTimes or targetTimeRange",
    path: ["targetTimes"],
  });
