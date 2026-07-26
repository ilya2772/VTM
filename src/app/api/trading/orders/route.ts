import { NextRequest, NextResponse } from "next/server";

import { requireSession } from "@/server/auth/session";
import { ApiError, errorResponse } from "@/server/http/api-error";
import { assertSameOrigin } from "@/server/security/csrf";
import { getRequestContext } from "@/server/security/request-context";
import { getAuthoritativeTick } from "@/server/trading/price";
import { cancelOrderSchema, placeOrderSchema } from "@/server/trading/schema";
import {
  cancelOrder,
  placeOrder,
  previewOrder,
} from "@/server/trading/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const context = getRequestContext(request);
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const parsed = placeOrderSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiError(400, "VALIDATION_ERROR", "Order input is invalid.");
    const now = new Date();
    const tick = await getAuthoritativeTick(parsed.data.instrumentId, now);
    const preview = await previewOrder(
      { ...parsed.data, userId: session.user.id },
      tick,
      now,
    );
    const result = await placeOrder(
      {
        ...parsed.data,
        quantity: preview.quantity,
        userId: session.user.id,
        requestId: context.requestId,
      },
      tick,
      now,
    );
    return NextResponse.json(
      {
        orderId: result.order.id,
        status: result.order.status,
        replayed: result.replayed,
        preview,
      },
      {
        status: result.replayed ? 200 : 201,
        headers: { "X-Request-Id": context.requestId },
      },
    );
  } catch (error) {
    return errorResponse(error, context.requestId);
  }
}

export async function DELETE(request: NextRequest) {
  const context = getRequestContext(request);
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const parsed = cancelOrderSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiError(400, "VALIDATION_ERROR", "Cancel input is invalid.");
    await cancelOrder(
      session.user.id,
      parsed.data.accountId,
      parsed.data.orderId,
      context.requestId,
    );
    return new NextResponse(null, {
      status: 204,
      headers: { "X-Request-Id": context.requestId },
    });
  } catch (error) {
    return errorResponse(error, context.requestId);
  }
}
