export function queueTime(job) {
  const legacyRecovery=String(job.recoveryRequests?.at(-1)||'').match(/^regen-(\d{13})-/)?.[1];
  return job.queuedAt || (legacyRecovery ? new Date(Number(legacyRecovery)).toISOString() : job.createdAt || '');
}
export function compareQueue(a,b) {
  if(a.status==='running' && b.status!=='running')return -1;
  if(b.status==='running' && a.status!=='running')return 1;
  return queueTime(a).localeCompare(queueTime(b));
}
export function activeJobs(jobs) {
  return [...jobs.values()].filter((job) => job.status === "queued" || job.status === "running").sort(compareQueue);
}

export function queueAhead(jobs, jobId) {
  const idx = activeJobs(jobs).findIndex((job) => job.id === jobId);
  return idx < 0 ? 0 : idx;
}

export function queueLine(jobs, jobId) {
  const ahead = queueAhead(jobs, jobId);
  if (ahead <= 0) return "Flow: queued — next in line";
  return `Flow: queued — ${ahead} reel${ahead === 1 ? "" : "s"} ahead, waiting for Chrome`;
}
