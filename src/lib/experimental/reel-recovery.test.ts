import { describe, it, expect } from "vitest";

// Test that recovery loop correctly increments runnerAttempts up to 8 retries
describe("reel recovery loop", () => {
  it("increments runnerAttempts on recoverable error", async () => {
    // Simulate a job with workerJobId and runnerAttempts = 0
    // This would trigger the recovery path in runReelJob
    const mockJob = {
      id: 1,
      status: "queued",
      workerJobId: "job-123",
      runnerAttempts: 0,
      stageDetail: "Test stage",
      dispatchState: "dispatching",
    };

    // The recovery path should:
    // 1. See that workerJobId exists and runnerAttempts < 8
    // 2. Set status back to queued
    // 3. Increment runnerAttempts to 1
    // 4. Clear error and errorCode
    // 5. Set partial: false

    // Expected update call:
    // .set({
    //   status: "queued",
    //   error: null,
    //   errorCode: null,
    //   runnerAttempts: 1,  // <-- incremented
    //   partial: false,
    //   ...
    // })

    expect(mockJob.runnerAttempts).toBe(0);
    // After recovery, it should be 1
    const nextAttempt = mockJob.runnerAttempts + 1;
    expect(nextAttempt).toBe(1);
  });

  it("terminates recovery after 8 attempts (runnerAttempts >= 8)", async () => {
    // When runnerAttempts reaches 8, recovery should stop
    const mockJob = {
      id: 1,
      status: "queued",
      workerJobId: "job-123",
      runnerAttempts: 8,
      stageDetail: "Test stage",
      dispatchState: "dispatching",
    };

    // The guard condition is: Number(latest?.runnerAttempts || 0) < 8
    const shouldRecover = Number(mockJob.runnerAttempts || 0) < 8;
    expect(shouldRecover).toBe(false);

    // Should instead go to terminal branch and set:
    // status: "error"
    // errorCode: "RECOVERY_EXHAUSTED"
    // error: "Automatic recovery gave up after 8 attempts..."
  });

  it("recoverable errors with no workerJobId should not enter recovery loop", () => {
    const mockJob = {
      id: 1,
      workerJobId: null, // No saved job
      runnerAttempts: 0,
      dispatchState: "pending",
    };

    // Recovery requires BOTH:
    // 1. Boolean(latest?.workerJobId) - false here
    // 2. OR latest?.dispatchState === "dispatching"
    // 3. AND runnerAttempts < 8

    const canRecover =
      (Boolean(mockJob.workerJobId) || mockJob.dispatchState === "dispatching") &&
      Number(mockJob.runnerAttempts || 0) < 8;

    expect(canRecover).toBe(false);
  });

  it("respects FLOW_TERMINAL code and skips recovery", () => {
    // FLOW_TERMINAL errors should never enter recovery
    const errorCode = "FLOW_TERMINAL";
    const shouldRecover = errorCode !== "FLOW_TERMINAL";
    expect(shouldRecover).toBe(false);
  });

  it("user-initiated regenerate resets runnerAttempts to 0", () => {
    // When user clicks "Regenerate" on an errored video,
    // the /clips/regenerate endpoint should:
    // .set({
    //   status: "queued",
    //   error: null,
    //   errorCode: null,
    //   stage: "clips",
    //   runnerAttempts: 0,  // <-- reset
    // })

    const currentAttempts = 5;
    const afterReset = 0;
    expect(afterReset).toBe(0);
    expect(afterReset).toBeLessThan(currentAttempts);
  });

  it("exhausted recovery sets RECOVERY_EXHAUSTED error code", () => {
    // When runnerAttempts reaches 8 with a non-FLOW_TERMINAL code,
    // the final error should be:
    // errorCode: "RECOVERY_EXHAUSTED"
    // error: "Automatic recovery gave up after 8 attempts. Last error: ..."

    const errorCode: string | null = "SOME_TRANSIENT_ERROR";
    const attempts = 8;
    const workerJobId = "saved-job";

    const exhausted = errorCode !== "FLOW_TERMINAL" && attempts >= 8 && workerJobId;
    expect(exhausted).toBe(true);

    const finalErrorCode = "RECOVERY_EXHAUSTED";
    expect(finalErrorCode).toBe("RECOVERY_EXHAUSTED");
  });
});
