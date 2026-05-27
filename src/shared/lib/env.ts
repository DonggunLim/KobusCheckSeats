import { z } from "zod";

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

const buildEnvSchema = serverEnvSchema.extend({
  DATABASE_URL: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
});

function validateEnv() {
  const isCI = process.env.GITHUB_ACTIONS === "true";
  const skipValidation = process.env.SKIP_ENV_VALIDATION === "true" || isCI;

  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    if (skipValidation) {
      console.warn(
        "⚠️  Some environment variables are missing, but skipping validation (CI/Build context)."
      );
      return buildEnvSchema.parse(process.env) as z.infer<typeof serverEnvSchema>;
    }

    const errors = parsed.error.flatten().fieldErrors;
    const errorMessages = Object.entries(errors)
      .map(([key, msgs]) => `  - ${key}: ${msgs?.join(", ")}`)
      .join("\n");

    throw new Error(`❌ Invalid environment variables:\n${errorMessages}`);
  }

  return parsed.data;
}

export const env = validateEnv();
