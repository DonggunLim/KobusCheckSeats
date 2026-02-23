import Redis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

const log = logger.child({ module: "redis" });
let redisConnection: Redis | null = null;

export function getRedisConnection(): Redis {
  // 빌드 타임에는 Redis 연결을 만들지 않음
  if (typeof window !== "undefined") {
    throw new Error("Redis connection should only be used on the server side");
  }

  if (!redisConnection) {
    redisConnection = new Redis({
      host: env.REDIS_HOST,
      port: parseInt(env.REDIS_PORT),
      maxRetriesPerRequest: null, // BullMQ 필수 설정
      lazyConnect: true, // 명시적으로 connect()를 호출할 때까지 연결하지 않음
    });

    redisConnection.on("connect", () => {
      log.info("Redis connected");
    });

    redisConnection.on("error", (err) => {
      log.error({ err }, "Redis connection error");
    });
  }

  return redisConnection;
}
