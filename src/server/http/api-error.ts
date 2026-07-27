import "server-only";

import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers?: HeadersInit,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(error: unknown, requestId: string) {
  if (error instanceof ApiError) {
    const headers = new Headers(error.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Request-Id", requestId);
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          requestId,
        },
      },
      { status: error.status, headers },
    );
  }

  console.error("Unhandled API error", {
    requestId,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed.",
        requestId,
      },
    },
    {
      status: 500,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    },
  );
}
