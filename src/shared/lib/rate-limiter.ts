import { getRedisConnection } from "./redis";
import { NextResponse } from "next/server";

interface RateLimitOptions {
  windowMs: number; // sliding window duration in ms
  max: number; // max requests per window
}

/**
 * Sliding window rate limiter backed by Redis.
 * Returns null if allowed, or a 429 NextResponse if limited.
 */
export async function rateLimit(
  key: string,
  options: RateLimitOptions
): Promise<NextResponse | null> {
  const redis = getRedisConnection();
  const now = Date.now();
  const windowStart = now - options.windowMs;

  // Use a sorted set: score = timestamp, member = unique request id
  const redisKey = `rl:${key}`;

  // Remove expired entries
  await redis.zremrangebyscore(redisKey, "-inf", windowStart);

  // Count current entries
  const count = await redis.zcard(redisKey);

  if (count >= options.max) {
    return NextResponse.json(
      { error: "Too many requests, please try again later" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(options.windowMs / 1000)) } }
    );
  }

  // Add this request
  await redis.zadd(redisKey, now, `${now}-${Math.random()}`);
  // Set expiry on the key
  await redis.pexpire(redisKey, options.windowMs);

  return null;
}

/**
 * Convenience: rate limit by userId or IP for the job queue endpoint.
 * 5 requests per minute per user.
 */
export async function rateLimitJobSubmit(userId: string | undefined, ip: string | undefined) {
  const key = userId ? `user:${userId}` : `ip:${ip ?? "unknown"}`;
  return rateLimit(key, { windowMs: 60_000, max: 5 });
}
