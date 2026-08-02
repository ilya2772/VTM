// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = { status: "PENDING", challengeId: null as string | null };
  const tx = {
    payment: {
      findUnique: vi.fn(async () => ({
        id: "payment-1",
        userId: "user-1",
        productId: "product-1",
        providerSessionId: "mock_session",
        status: state.status,
        challengeId: state.challengeId,
        product: {
          accountSize: { toString: () => "50000" },
          profitTargetPct: { toString: () => "10" },
          maxDailyLossPct: { toString: () => "5" },
          maxOverallLossPct: { toString: () => "10" },
          minTradingDays: 3,
          maxLeverage: { toString: () => "10" },
          maxPositionNotional: { toString: () => "250000" },
        },
      })),
      updateMany: vi.fn(async () => {
        if (state.status !== "PENDING") return { count: 0 };
        state.status = "PAID";
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async () => ({
        challengeId: state.challengeId,
      })),
      update: vi.fn(async (input: { data: { challengeId?: string } }) => {
        if (input.data.challengeId) state.challengeId = input.data.challengeId;
        return {};
      }),
    },
    tradingAccount: { create: vi.fn(async () => ({ id: "account-2" })) },
    challenge: {
      create: vi.fn(async () => ({ id: "challenge-2" })),
      findFirst: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    user: { update: vi.fn(async () => ({})) },
  };
  return {
    state,
    tx,
    productFindFirst: vi.fn(),
    paymentCreate: vi.fn(),
    paymentUpdate: vi.fn(),
    transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  prisma: {
    challengeProduct: { findFirst: mocks.productFindFirst },
    payment: { create: mocks.paymentCreate, update: mocks.paymentUpdate },
    $transaction: mocks.transaction,
  },
}));

import {
  activateChallenge,
  createChallengeCheckout,
  fulfillChallengePayment,
} from "./service";

describe("challenge purchase service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.status = "PENDING";
    mocks.state.challengeId = null;
    process.env.PAYMENT_MODE = "mock";
    mocks.productFindFirst.mockResolvedValue({
      id: "product-1",
      name: "Pro 50K",
      price: { toString: () => "249" },
      currency: "USD",
    });
    mocks.paymentCreate.mockResolvedValue({ id: "payment-1" });
    mocks.paymentUpdate.mockResolvedValue({});
  });

  it("creates checkout from the database product price", async () => {
    const result = await createChallengeCheckout(
      "user-1",
      "product-1",
      "http://localhost",
    );
    expect(result.mode).toBe("mock");
    expect(mocks.paymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        productId: "product-1",
      }),
    });
  });

  it("creates a purchased challenge once when confirmation is replayed", async () => {
    const first = await fulfillChallengePayment(
      "mock_session",
      "provider-1",
      "user-1",
    );
    const second = await fulfillChallengePayment(
      "mock_session",
      "provider-1",
      "user-1",
    );
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(mocks.tx.challenge.create).toHaveBeenCalledOnce();
    expect(mocks.tx.tradingAccount.create).toHaveBeenCalledOnce();
  });

  it("rejects confirmation for another user", async () => {
    await expect(
      fulfillChallengePayment("mock_session", "provider-1", "user-2"),
    ).rejects.toMatchObject({ status: 403, code: "PAYMENT_FORBIDDEN" });
  });

  it("activates only an owned ready challenge and rejects foreign records", async () => {
    mocks.tx.challenge.findFirst.mockResolvedValueOnce({
      id: "challenge-2",
      accountId: "account-2",
      status: "READY",
      account: { userId: "user-1" },
    });
    await expect(activateChallenge("user-1", "challenge-2")).resolves.toEqual({
      challengeId: "challenge-2",
      accountId: "account-2",
    });
    expect(mocks.tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { activeAccountId: "account-2" } }),
    );

    mocks.tx.challenge.findFirst.mockResolvedValueOnce(null);
    await expect(
      activateChallenge("user-2", "challenge-2"),
    ).rejects.toMatchObject({
      status: 404,
      code: "CHALLENGE_NOT_FOUND",
    });
  });
});
