import { describe, expect, it } from "vitest";
import {
  FLOW_GENERATE_MS,
  FLOW_QUEUE_WAIT_MS,
  flowWaitTimedOut,
  flowWaitTimeoutMessage,
} from "./flow-queue";

describe("flowWaitTimedOut", () => {
  it("does not time out a queued job during a long wait under 6 hours", () => {
    const queuedAt = 1_000_000;
    expect(
      flowWaitTimedOut({
        status: "queued",
        now: queuedAt + 45 * 60 * 1000,
        queuedAt,
        runningAt: null,
      }),
    ).toBe(false);
    expect(
      flowWaitTimedOut({
        status: "queued",
        now: queuedAt + FLOW_QUEUE_WAIT_MS + 1,
        queuedAt,
        runningAt: null,
      }),
    ).toBe(true);
  });

  it("times out generate time only after the worker starts running", () => {
    const queuedAt = 1_000_000;
    const runningAt = queuedAt + 40 * 60 * 1000;
    expect(
      flowWaitTimedOut({
        status: "running",
        now: runningAt + 45 * 60 * 1000,
        queuedAt,
        runningAt,
      }),
    ).toBe(false);
    expect(
      flowWaitTimedOut({
        status: "running",
        now: runningAt + FLOW_GENERATE_MS + 1,
        queuedAt,
        runningAt,
      }),
    ).toBe(true);
    expect(
      flowWaitTimedOut({
        status: "running",
        now: runningAt + 1,
        queuedAt,
        runningAt: null,
      }),
    ).toBe(false);
  });

  it("names the timeout by phase", () => {
    expect(flowWaitTimeoutMessage("queued")).toMatch(/queue/i);
    expect(flowWaitTimeoutMessage("running")).toMatch(/generating/i);
  });
});
