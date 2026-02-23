import Redis from "ioredis";
import { getRedisConnection } from "../redis";

export const JOB_EVENTS_CHANNEL = "job-status-updates";

export interface JobStatusEvent {
  jobId: string;
  userId: string;
  status: string;
}

export function publishJobStatusUpdate(event: JobStatusEvent): Promise<number> {
  return getRedisConnection().publish(JOB_EVENTS_CHANNEL, JSON.stringify(event));
}

/**
 * Create a dedicated Redis subscriber connection (cannot be reused for pub).
 */
export function createJobEventsSubscriber(): Redis {
  const main = getRedisConnection();
  // Duplicate the existing connection config for a subscriber-only connection
  return main.duplicate();
}
