import { describe, it, expect } from "vitest";
import { z } from "zod";

// Test the env schema logic directly without importing env.ts
// (importing env.ts would throw in test environment with missing vars)
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.string().default("6379"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  KAKAO_REST_API_KEY: z.string().min(1, "KAKAO_REST_API_KEY is required"),
  KAKAO_CLIENT_SECRET_KEY: z.string().min(1, "KAKAO_CLIENT_SECRET_KEY is required"),
  NEXTAUTH_URL: z.string().url().optional(),
  AUTH_URL: z.string().url().optional(),
  AUTH_TRUST_HOST: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

describe("env schema validation", () => {
  it("succeeds with all required fields", () => {
    const result = serverEnvSchema.safeParse({
      DATABASE_URL: "mysql://user:pass@localhost:3306/db",
      AUTH_SECRET: "super-secret",
      KAKAO_REST_API_KEY: "kakao-api-key",
      KAKAO_CLIENT_SECRET_KEY: "kakao-secret",
    });
    expect(result.success).toBe(true);
  });

  it("applies defaults for REDIS_HOST and REDIS_PORT", () => {
    const result = serverEnvSchema.safeParse({
      DATABASE_URL: "mysql://user:pass@localhost:3306/db",
      AUTH_SECRET: "super-secret",
      KAKAO_REST_API_KEY: "kakao-api-key",
      KAKAO_CLIENT_SECRET_KEY: "kakao-secret",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.REDIS_HOST).toBe("localhost");
      expect(result.data.REDIS_PORT).toBe("6379");
    }
  });

  it("fails when DATABASE_URL is missing", () => {
    const result = serverEnvSchema.safeParse({
      AUTH_SECRET: "super-secret",
      KAKAO_REST_API_KEY: "kakao-api-key",
      KAKAO_CLIENT_SECRET_KEY: "kakao-secret",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.DATABASE_URL).toBeDefined();
    }
  });

  it("fails when AUTH_SECRET is missing", () => {
    const result = serverEnvSchema.safeParse({
      DATABASE_URL: "mysql://user:pass@localhost:3306/db",
      KAKAO_REST_API_KEY: "kakao-api-key",
      KAKAO_CLIENT_SECRET_KEY: "kakao-secret",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid NODE_ENV", () => {
    const result = serverEnvSchema.safeParse({
      DATABASE_URL: "mysql://user:pass@localhost:3306/db",
      AUTH_SECRET: "super-secret",
      KAKAO_REST_API_KEY: "kakao-api-key",
      KAKAO_CLIENT_SECRET_KEY: "kakao-secret",
      NODE_ENV: "invalid",
    });
    expect(result.success).toBe(false);
  });
});
