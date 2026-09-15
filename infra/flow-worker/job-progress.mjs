const MAX_JOB_LOG = 80;

export function appendJobLog(job, detail, accountLabel, schedulePersist = () => {}) {
  const raw = String(detail || "").trim();
  if (!raw) return;
  const line =
    accountLabel && !raw.includes(accountLabel) ? `${raw} (${accountLabel})` : raw;
  if (!Array.isArray(job.log)) job.log = job.stageDetail ? [job.stageDetail] : [];
  if (job.log[job.log.length - 1] === line) return;
  job.log.push(line.slice(0, 280));
  if (job.log.length > MAX_JOB_LOG) job.log = job.log.slice(-MAX_JOB_LOG);
  job.stageDetail = job.log.join("\n");
  const last = line;
  if (/queued/i.test(last) || /setup/i.test(last)) job.stage = "setup";
  else if (/clips ready|edit and stitch in Results editor/i.test(last)) job.stage = "clips";
  else if (/stitch|captioning|stitched/i.test(last)) job.stage = "stitch";
  else if (/download/i.test(last)) job.stage = "downloading";
  else job.stage = "clips";
  job.heartbeatAt = new Date().toISOString();
  schedulePersist(job);
}

