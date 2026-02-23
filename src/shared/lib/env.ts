import { z } from "zod";

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

function validateEnv() {
  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    const errorMessages = Object.entries(errors)
      .map(([key, msgs]) => `  - ${key}: ${msgs?.join(", ")}`)
      .join("\n");

    throw new Error(`❌ Invalid environment variables:\n${errorMessages}`);
  }

  return parsed.data;
}

export const env = validateEnv();
