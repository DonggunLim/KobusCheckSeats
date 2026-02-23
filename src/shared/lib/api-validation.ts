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

export const queueJobSchema = z.object({
  departureCd: terminalCdSchema,
  arrivalCd: terminalCdSchema,
  targetMonth: z.string().regex(/^\d{1,2}월$/, "targetMonth must be like '11월'"),
  targetDate: z.string().regex(/^\d{1,2}$/, "targetDate must be a day number"),
  targetTimes: z
    .array(z.string().regex(/^\d{2}:\d{2}$/, "time must be HH:MM format"))
    .min(1, "targetTimes must have at least one entry"),
  scheduleId: z.string().optional(),
  userId: z.string().optional(),
  priority: z.number().optional(),
  delay: z.number().optional(),
});
