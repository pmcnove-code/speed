import { describe, expect, it } from "vitest";
import { classifyFlowFailure, flowReadyFromStatus, isUsableAccount, orderAccountsForRotate, type FlowAccountPick, type FlowStatus } from "./flow-rotate";

function acc(partial: Partial<FlowAccountPick> & { id: string }): FlowAccountPick {
  return {
    connected: true,
    status: "connected",
    creditsRemaining: 10,
    lastUsed: null,
    restingUntil: null,
    ...partial,
  };
}

describe("isUsableAccount", () => {
  it("keeps connected accounts with credits or unknown balance", () => {
    expect(isUsableAccount(acc({ id: "a", creditsRemaining: 4 }))).toBe(true);
    expect(isUsableAccount(acc({ id: "b", creditsRemaining: null, status: "unknown" }))).toBe(true);
  });

  it("skips only expired or disconnected accounts, allowing manual retries for blocked or credit-exhausted sessions", () => {
    expect(isUsableAccount(acc({ id: "a", status: "expired" }))).toBe(false);
    expect(isUsableAccount(acc({ id: "d", connected: false }))).toBe(false);
    expect(isUsableAccount(acc({ id: "b", status: "no_credits", creditsRemaining: 0 }))).toBe(true);
    expect(isUsableAccount(acc({ id: "c", creditsRemaining: 0 }))).toBe(true);
    expect(isUsableAccount(acc({ id: "e", status: "blocked" }))).toBe(true);
  });

  it("excludes an account only while its resting cooldown is still in the future", () => {
    expect(isUsableAccount(acc({ id: "a", restingUntil: new Date(Date.now() + 60_000).toISOString() }))).toBe(false);
    expect(isUsableAccount(acc({ id: "b", restingUntil: new Date(Date.now() - 60_000).toISOString() }))).toBe(true);
  });
});

describe("orderAccountsForRotate", () => {
  it("round-robins by oldest lastUsed and rotates lastPicked, including credit-exhausted accounts", () => {
    const accounts = [
      acc({ id: "a", lastUsed: "2026-09-01T00:00:00.000Z", creditsRemaining: 3 }),
      acc({ id: "b", lastUsed: "2026-09-02T00:00:00.000Z", creditsRemaining: 8 }),
      acc({ id: "c", status: "expired" }),
      acc({ id: "d", lastUsed: "2026-09-03T00:00:00.000Z", creditsRemaining: 0, status: "no_credits" }),
    ];
    const first = orderAccountsForRotate(accounts, "a").map((x) => x.id);
    expect(first).toEqual(["b", "d", "a"]);
  });

  it("prefers never-used accounts first", () => {
    const accounts = [
      acc({ id: "used", lastUsed: "2026-09-08T00:00:00.000Z" }),
      acc({ id: "fresh", lastUsed: null }),
    ];
    expect(orderAccountsForRotate(accounts).map((x) => x.id)).toEqual(["fresh", "used"]);
  });
});

describe("flowReadyFromStatus", () => {
  it("is ready when the worker has at least one usable session", () => {
    const status: FlowStatus = {
      configured: true,
      worker: true,
      lastPickedId: null,
      accounts: [
        {
          id: "a",
          label: "zack",
          connected: true,
          status: "connected",
          creditsRemaining: 12,
          lastUsed: null,
          lastError: null,
          lastChecked: null,
          restingUntil: null,
        },
      ],
    };
    expect(flowReadyFromStatus(status)).toBe(true);
    const blocked: FlowStatus = { ...status, accounts: [{ ...status.accounts[0]!, status: "blocked" }] };
    expect(flowReadyFromStatus(blocked)).toBe(true);
    expect(flowReadyFromStatus({ ...status, worker: false })).toBe(false);
    expect(flowReadyFromStatus({ ...status, accounts: [] })).toBe(false);
    expect(
      flowReadyFromStatus({
        ...status,
        accounts: [{ ...status.accounts[0]!, creditsRemaining: 0, status: "no_credits" }],
      }),
    ).toBe(true);
    expect(
      flowReadyFromStatus({
        ...status,
        accounts: [{ ...status.accounts[0]!, status: "expired" }],
      }),
    ).toBe(false);
    expect(
      flowReadyFromStatus({
        ...status,
        accounts: [{ ...status.accounts[0]!, restingUntil: new Date(Date.now() + 60_000).toISOString() }],
      }),
    ).toBe(false);
    expect(
      flowReadyFromStatus({
        ...status,
        accounts: [{ ...status.accounts[0]!, restingUntil: new Date(Date.now() - 60_000).toISOString() }],
      }),
    ).toBe(true);
  });
});

describe("classifyFlowFailure", () => {
  it("maps credits, expired, blocked, and UI-changed errors", () => {
    expect(classifyFlowFailure("This account is out of credits.")).toBe("credits");
    expect(classifyFlowFailure("session expired — reconnect.")).toBe("expired");
    expect(classifyFlowFailure("Flow paused this Google account for unusual activity.")).toBe("blocked");
    expect(classifyFlowFailure("Flow UI changed / session expired — reconnect.")).toBe("ui");
    expect(classifyFlowFailure("net::ERR_CONNECTION_RESET")).toBe("other");
  });
});
