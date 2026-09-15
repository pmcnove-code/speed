import { estimateUsd, formatUsd, rateFor, usageFrom } from "@/lib/cost";
import type { Usage } from "@/lib/llm/provider";

export type BatchInput = {
  id: number;
  provider: string;
  model: string;
  status: string;
  createdAt: Date;
  createdBy: string;
  personaIds: number[];
  countRequested: number;
  usage: Usage | null;
};

export type PostCount = { batchId: number; personaId: number; n: number };
export type PersonaName = { id: number; name: string; handle: string };

export type BatchCost = {
  id: number;
  provider: string;
  model: string;
  status: string;
  createdAt: string;
  createdBy: string;
  personaCount: number;
  requested: number;
  posts: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  spend: number;
  costPerPost: number;
  costPerRequested: number;
  personaShares: { id: number; name: string; handle: string; posts: number; spend: number }[];
};

export type GroupRow = {
  key: string;
  label: string;
  batches: number;
  posts: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  spend: number;
  costPerPost: number;
  costPerBatch: number;
  share: number;
};

export type DayRow = { day: string; spend: number; batches: number; tokens: number; posts: number };

export type PersonaCost = {
  id: number;
  name: string;
  handle: string;
  posts: number;
  spend: number;
  costPerPost: number;
  batches: number;
};

export type CostReport = {
  totals: {
    spend: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    batches: number;
    posts: number;
    requested: number;
    costPerBatch: number;
    costPerPost: number;
    costPerRequested: number;
    costPer1kTokens: number;
  };
  byProvider: GroupRow[];
  byModel: GroupRow[];
  byPersona: PersonaCost[];
  byDay: DayRow[];
  batches: BatchCost[];
  rates: { provider: string; model: string; label: string; inputPerM: number; outputPerM: number }[];
};

function emptyTotals() {
  return {
    spend: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    batches: 0,
    posts: 0,
    requested: 0,
    costPerBatch: 0,
    costPerPost: 0,
    costPerRequested: 0,
    costPer1kTokens: 0,
  };
}

function finishTotals(t: CostReport["totals"]): CostReport["totals"] {
  return {
    ...t,
    costPerBatch: t.batches ? t.spend / t.batches : 0,
    costPerPost: t.posts ? t.spend / t.posts : 0,
    costPerRequested: t.requested ? t.spend / t.requested : 0,
    costPer1kTokens: t.totalTokens ? (t.spend / t.totalTokens) * 1000 : 0,
  };
}

function addGroup(
  map: Map<string, GroupRow>,
  key: string,
  label: string,
  b: BatchCost,
) {
  const row = map.get(key) ?? {
    key,
    label,
    batches: 0,
    posts: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    spend: 0,
    costPerPost: 0,
    costPerBatch: 0,
    share: 0,
  };
  row.batches += 1;
  row.posts += b.posts;
  row.inputTokens += b.inputTokens;
  row.outputTokens += b.outputTokens;
  row.totalTokens += b.totalTokens;
  row.spend += b.spend;
  map.set(key, row);
}

function finishGroups(map: Map<string, GroupRow>, totalSpend: number): GroupRow[] {
  return [...map.values()]
    .map((r) => ({
      ...r,
      costPerPost: r.posts ? r.spend / r.posts : 0,
      costPerBatch: r.batches ? r.spend / r.batches : 0,
      share: totalSpend ? r.spend / totalSpend : 0,
    }))
    .sort((a, b) => b.spend - a.spend);
}

export function buildCostReport(
  batches: BatchInput[],
  postCounts: PostCount[],
  personas: PersonaName[],
): CostReport {
  const postsByBatch = new Map<number, number>();
  const postsByBatchPersona = new Map<string, number>();
  for (const p of postCounts) {
    postsByBatch.set(p.batchId, (postsByBatch.get(p.batchId) ?? 0) + p.n);
    postsByBatchPersona.set(`${p.batchId}:${p.personaId}`, p.n);
  }
  const personaById = new Map(personas.map((p) => [p.id, p]));

  const batchRows: BatchCost[] = batches.map((b) => {
    const usage = usageFrom(b.usage);
    const spend = estimateUsd(b.provider, b.model, usage);
    const posts = postsByBatch.get(b.id) ?? 0;
    const requested = b.countRequested * (b.personaIds.length || 1);
    const shares = (b.personaIds.length ? b.personaIds : []).map((id) => ({
      id,
      n: postsByBatchPersona.get(`${b.id}:${id}`) ?? 0,
    }));
    const shareTotal = shares.reduce((s, x) => s + x.n, 0);
    const personaShares = shares.map((sh) => {
      const p = personaById.get(sh.id);
      const portion = shareTotal > 0 ? sh.n / shareTotal : shares.length ? 1 / shares.length : 0;
      return {
        id: sh.id,
        name: p?.name ?? `Persona ${sh.id}`,
        handle: p?.handle ?? String(sh.id),
        posts: sh.n,
        spend: spend * portion,
      };
    });
    return {
      id: b.id,
      provider: b.provider,
      model: b.model,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
      createdBy: b.createdBy,
      personaCount: b.personaIds.length,
      requested,
      posts,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      totalTokens: usage.total_tokens,
      spend,
      costPerPost: posts ? spend / posts : 0,
      costPerRequested: requested ? spend / requested : 0,
      personaShares,
    };
  });

  return aggregateBatchCosts(batchRows);
}

export function aggregateBatchCosts(batchRows: BatchCost[]): CostReport {
  const totals = emptyTotals();
  const byProvider = new Map<string, GroupRow>();
  const byModel = new Map<string, GroupRow>();
  const byDay = new Map<string, DayRow>();
  const personaAcc = new Map<number, PersonaCost>();

  for (const b of batchRows) {
    totals.spend += b.spend;
    totals.inputTokens += b.inputTokens;
    totals.outputTokens += b.outputTokens;
    totals.totalTokens += b.totalTokens;
    totals.batches += 1;
    totals.posts += b.posts;
    totals.requested += b.requested;
    addGroup(byProvider, b.provider, b.provider, b);
    addGroup(byModel, `${b.provider}:${b.model}`, `${b.provider} · ${b.model}`, b);

    const day = b.createdAt.slice(0, 10);
    const d = byDay.get(day) ?? { day, spend: 0, batches: 0, tokens: 0, posts: 0 };
    d.spend += b.spend;
    d.batches += 1;
    d.tokens += b.totalTokens;
    d.posts += b.posts;
    byDay.set(day, d);

    for (const sh of b.personaShares) {
      const acc = personaAcc.get(sh.id) ?? {
        id: sh.id,
        name: sh.name,
        handle: sh.handle,
        posts: 0,
        spend: 0,
        costPerPost: 0,
        batches: 0,
      };
      acc.posts += sh.posts;
      acc.spend += sh.spend;
      acc.batches += 1;
      personaAcc.set(sh.id, acc);
    }
  }

  const rates = [...new Set(batchRows.map((b) => `${b.provider}\0${b.model}`))].map((k) => {
    const [provider, model] = k.split("\0");
    const rate = rateFor(provider!, model!);
    return { provider: provider!, model: model!, label: rate.label, inputPerM: rate.inputPerM, outputPerM: rate.outputPerM };
  });

  return {
    totals: finishTotals(totals),
    byProvider: finishGroups(byProvider, totals.spend),
    byModel: finishGroups(byModel, totals.spend),
    byPersona: [...personaAcc.values()]
      .map((p) => ({ ...p, costPerPost: p.posts ? p.spend / p.posts : 0 }))
      .sort((a, b) => b.spend - a.spend),
    byDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    batches: batchRows.sort((a, b) => b.id - a.id),
    rates,
  };
}

export function reportForWindow(report: CostReport, days: number | null): CostReport {
  if (!days) return report;
  const cut = Date.now() - days * 86_400_000;
  return aggregateBatchCosts(report.batches.filter((b) => new Date(b.createdAt).getTime() >= cut));
}

export { formatUsd };
