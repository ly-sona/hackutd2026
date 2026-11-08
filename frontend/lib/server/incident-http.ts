import { NextRequest, NextResponse } from "next/server";
import { AccessError } from "./gateway";
export function verifyOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const configured = new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  );
  if (origin === configured.origin) return;
  if (origin && process.env.NODE_ENV !== "production") {
    try {
      const actual = new URL(origin);
      if (
        ["localhost", "127.0.0.1"].includes(actual.hostname) &&
        ["localhost", "127.0.0.1"].includes(configured.hostname) &&
        actual.port === configured.port &&
        actual.protocol === configured.protocol
      )
        return;
    } catch {
      /* Deny malformed origin. */
    }
  }
  throw new AccessError(
    "ACCESS_DENIED",
    "The request origin could not be verified.",
  );
}
export const incidentResponse = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
export function incidentError(error: unknown) {
  if (error instanceof AccessError)
    return incidentResponse(
      { error: error.message, code: error.code },
      error.code === "SESSION_EXPIRED"
        ? 401
        : error.code === "NOT_FOUND"
          ? 404
          : error.code === "UNAVAILABLE"
            ? 503
            : error.code.startsWith("ACCESS_")
              ? 403
              : 400,
    );
  if (error instanceof SyntaxError || error instanceof TypeError)
    return incidentResponse({ error: "Invalid request." }, 400);
  return incidentResponse(
    { error: "The incident service is temporarily unavailable." },
    503,
  );
}
export async function boundedBody(request: NextRequest, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new AccessError("INVALID_INPUT", "Request exceeds the allowed size.");
  const reader = request.body?.getReader();
  if (!reader)
    throw new AccessError("INVALID_INPUT", "A request body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw new AccessError(
          "INVALID_INPUT",
          "Request exceeds the allowed size.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}
