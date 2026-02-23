import { NextRequest } from "next/server";
import { auth } from "@/shared/lib/auth";
import {
  JOB_EVENTS_CHANNEL,
  createJobEventsSubscriber,
  type JobStatusEvent,
} from "@/shared/lib/queue/job-events";
import { logger } from "@/shared/lib/logger";

const log = logger.child({ route: "jobs/stream" });

export const dynamic = "force-dynamic";

/**
 * GET /api/jobs/stream
 * Server-Sent Events endpoint for real-time job status updates.
 * Each user receives only their own job events.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;

  const subscriber = createJobEventsSubscriber();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(data: string) {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }

      // Send initial heartbeat
      send(JSON.stringify({ type: "connected" }));

      subscriber.subscribe(JOB_EVENTS_CHANNEL, (err) => {
        if (err) {
          log.error({ err, userId }, "Redis subscribe error");
          subscriber.quit();
          controller.close();
        }
      });

      subscriber.on("message", (_channel: string, message: string) => {
        try {
          const event: JobStatusEvent = JSON.parse(message);
          if (event.userId === userId) {
            send(JSON.stringify(event));
          }
        } catch {
          // ignore malformed messages
        }
      });

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          send(JSON.stringify({ type: "heartbeat" }));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      // Cleanup on client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        subscriber.unsubscribe(JOB_EVENTS_CHANNEL);
        subscriber.quit();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
