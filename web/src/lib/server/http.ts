import "server-only";
import { NextResponse } from "next/server";

/**
 * Wraps a route handler so unexpected failures (a missing SESSION_SECRET in production, an RPC outage…) come back as a
 * JSON error the UI can display, never as an empty 500 body that breaks `res.json()` on the client.
 */
export function safeRoute<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[route]", msg);
      if (/SESSION_SECRET/.test(msg)) {
        return NextResponse.json({ error: "server_misconfigured", message: "Sign-in is unavailable: the server has no SESSION_SECRET configured." }, { status: 503 });
      }
      return NextResponse.json({ error: "internal_error", message: "Unexpected server error. Please try again." }, { status: 500 });
    }
  };
}
