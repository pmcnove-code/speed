import { describe, it, expect } from "vitest";
import { flowFailure } from "./flow-failure";

describe("flowFailure taxonomy", () => {
  it("maps CREDITS code to credits kind", () => {
    const f = flowFailure("CREDITS", "");
    expect(f.kind).toBe("credits");
    expect(f.title).toBe("Out of Flow credits");
    expect(f.detail).toContain("Add credits or connect another account");
    expect(f.action?.href).toBe("/settings");
    expect(f.retryable).toBe(true);
  });

  it("maps expired message when code absent", () => {
    const f = flowFailure(null, "Flow session expired — reconnect.");
    expect(f.kind).toBe("expired");
    expect(f.title).toBe("Flow session expired");
    expect(f.detail).toContain("Reconnect");
    expect(f.retryable).toBe(true);
  });

  it("maps FLOW_TERMINAL with blocked message to blocked kind", () => {
    const f = flowFailure("FLOW_TERMINAL", "Google flagged unusual activity");
    expect(f.kind).toBe("blocked");
    expect(f.title).toBe("Flow paused this account");
    expect(f.retryable).toBe(true);
  });

  it("maps worker_down for not configured message", () => {
    const f = flowFailure(null, "Flow worker is not configured.");
    expect(f.kind).toBe("worker_down");
    expect(f.title).toBe("Flow worker unavailable");
  });
  it("maps FLOW_TERMINAL with blocked message to blocked kind", () => {
    const f = flowFailure("FLOW_TERMINAL", "Google flagged unusual activity");
    expect(f.kind).toBe("blocked");
    expect(f.retryable).toBe(true);
  });

  it("maps FLOW_TERMINAL with worker_down message", () => {
    const f = flowFailure("FLOW_TERMINAL", "Flow worker is not configured.");
    expect(f.kind).toBe("worker_down");
    expect(f.action?.href).toBe("/settings");
    expect(f.retryable).toBe(true);
  });

  it("maps GENDER_MISSING to character_missing", () => {
    const f = flowFailure("GENDER_MISSING", "");
    expect(f.kind).toBe("character_missing");
  });

  it("maps RENDER_UNAVAILABLE to render_unavailable", () => {
    const f = flowFailure("RENDER_UNAVAILABLE", "");
    expect(f.kind).toBe("render_unavailable");
    expect(f.title).toBe("Flow render was lost");
    expect(f.retryable).toBe(true);
  });

  it("maps TIMEOUT to timeout", () => {
    const f = flowFailure("TIMEOUT", "");
    expect(f.kind).toBe("timeout");
    expect(f.title).toBe("Generation timed out");
  });

  it("maps RECOVERY_EXHAUSTED to recovery_exhausted", () => {
    const f = flowFailure("RECOVERY_EXHAUSTED", "");
    expect(f.kind).toBe("recovery_exhausted");
    expect(f.title).toBe("Gave up after retries");
    expect(f.action?.href).toBe("/settings");
  });

  it("maps no_account for no Flow account message", () => {
    const f = flowFailure(null, "no Flow account ready");
    expect(f.kind).toBe("no_account");
    expect(f.title).toBe("No Flow account ready");
  });

  it("maps empty for empty video message", () => {
    const f = flowFailure(null, "Flow returned an empty video file");
    expect(f.kind).toBe("empty");
    expect(f.title).toBe("Empty video");
  });

  it("falls back to other with message detail", () => {
    const f = flowFailure(null, "Some unknown error happened");
    expect(f.kind).toBe("other");
    expect(f.title).toBe("Generation failed");
    expect(f.detail).toBe("Some unknown error happened");
    expect(f.retryable).toBe(true);
  });

  it("truncates other error detail to 200 chars", () => {
    const longMessage = "x".repeat(300);
    const f = flowFailure(null, longMessage);
    expect(f.detail).toBe("x".repeat(200));
  });
});
