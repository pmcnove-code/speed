/** Wait in the worker queue without burning the generate clock. */
export const FLOW_QUEUE_WAIT_MS = 6 * 60 * 60 * 1000;
/** Clock starts only after the worker marks the job running. */
export const FLOW_GENERATE_MS = 130 * 60 * 1000;

export function flowWaitTimedOut(opts: {
  status: string;
  now: number;
  queuedAt: number;
  runningAt: number | null;
}): boolean {
  if (opts.status === "queued") return opts.now - opts.queuedAt > FLOW_QUEUE_WAIT_MS;
  if (opts.status === "running") {
    if (opts.runningAt == null) return false;
    return opts.now - opts.runningAt > FLOW_GENERATE_MS;
  }
  return false;
}

export function flowWaitTimeoutMessage(status: string): string {
  if (status === "queued") return "Flow worker queue waited more than 6 hours.";
  return "Flow worker timed out after 130 minutes of generating.";
}
