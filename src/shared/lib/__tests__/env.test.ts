import { describe, it, expect } from "vitest";
import { z } from "zod";

// Test the env schema logic directly without importing env.ts
// (importing env.ts would throw in test environment with missing vars)
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_HOST: z.string().min(1).default("localhost"),
  REDIS_PORT: z.string().regex(/^\d+$/, "REDIS_PORT must be a number").default("6379"),
  APP_URL: z.string().url().optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  TELEGRAM_CHAT_ID: z.string().min(1, "TELEGRAM_CHAT_ID is required"),
  TELEGRAM_REQUESTER_LABEL: z.string().min(1).default("동건님 요청건"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

describe("env schema validation", () => {
  it("succeeds with all required fields", () => {
    const result = serverEnvSchema.safeParse({
      DATABASE_URL: "mysql://user:pass@localhost:3306/db",
      TELEGRAM_BOT_TOKEN: "123456:test-token",
      TELEGRAM_CHAT_ID: "-1001234567890",
    });
    expect(result.success).toBe(true);
  });

  it("applies defaults for REDIS_HOST and REDIS_PORT", () => {
    const result = serverEnvSchema.safeParse({
      DATABASE_URL: "mysql://user:pass@localhost:3306/db",
      TELEGRAM_BOT_TOKEN: "123456:test-token",
      TELEGRAM_CHAT_ID: "-1001234567890",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.REDIS_HOST).toBe("localhost");
      expect(result.data.REDIS_PORT).toBe("6379");
    }
  });

  it("fails when DATABASE_URL is missing", () => {
    const result = serverEnvSchema.safeParse({
      TELEGRAM_BOT_TOKEN: "123456:test-token",
      TELEGRAM_CHAT_ID: "-1001234567890",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.DATABASE_URL).toBeDefined();
    }
  });

  it("fails when TELEGRAM_BOT_TOKEN is missing", () => {
    const result = serverEnvSchema.safeParse({
      DATABASE_URL: "mysql://user:pass@localhost:3306/db",
      TELEGRAM_CHAT_ID: "-1001234567890",
    });
    expect(result.success).toBe(false);
  });

  it("applies default requester label", () => {
    const result = serverEnvSchema.safeParse({
      DATABASE_URL: "mysql://user:pass@localhost:3306/db",
      TELEGRAM_BOT_TOKEN: "123456:test-token",
      TELEGRAM_CHAT_ID: "-1001234567890",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TELEGRAM_REQUESTER_LABEL).toBe("동건님 요청건");
    }
  });

  it("rejects invalid NODE_ENV", () => {
    const result = serverEnvSchema.safeParse({
      DATABASE_URL: "mysql://user:pass@localhost:3306/db",
      TELEGRAM_BOT_TOKEN: "123456:test-token",
      TELEGRAM_CHAT_ID: "-1001234567890",
      NODE_ENV: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric REDIS_PORT", () => {
    const result = serverEnvSchema.safeParse({
      DATABASE_URL: "mysql://user:pass@localhost:3306/db",
      TELEGRAM_BOT_TOKEN: "123456:test-token",
      TELEGRAM_CHAT_ID: "-1001234567890",
      REDIS_PORT: "not-a-port",
    });
    expect(result.success).toBe(false);
  });
});
