/**
 * Published list rates (USD per 1M tokens). Used to estimate batch spend from
 * stored token usage. Override by model id, then provider default.
 */
import type { Usage } from "@/lib/llm/provider";

export type TokenRate = {
  inputPerM: number;
  outputPerM: number;
  label: string;
};

export const MODEL_RATES: Record<string, TokenRate> = {
  "grok-4.6": { inputPerM: 2, outputPerM: 6, label: "Grok 4.6" },
  "grok-4.5": { inputPerM: 2, outputPerM: 6, label: "Grok 4.5" },
  "grok-4.3": { inputPerM: 1.25, outputPerM: 2.5, label: "Grok 4.3" },
  "deepseek-chat": { inputPerM: 0.22, outputPerM: 0.66, label: "DeepSeek Chat / Flash" },
  "deepseek-v4-flash": { inputPerM: 0.22, outputPerM: 0.66, label: "DeepSeek V4 Flash" },
  "deepseek-v4-pro": { inputPerM: 0.66, outputPerM: 1.98, label: "DeepSeek V4 Pro" },
  "venice-uncensored-1-2": { inputPerM: 0.2, outputPerM: 0.9, label: "Venice Uncensored 1.2" },
  "venice-uncensored-role-play": { inputPerM: 0.5, outputPerM: 2, label: "Venice Role Play" },
};

export const PROVIDER_RATES: Record<string, TokenRate> = {
  grok: { inputPerM: 2, outputPerM: 6, label: "Grok" },
  deepseek: { inputPerM: 0.22, outputPerM: 0.66, label: "DeepSeek" },
  venice: { inputPerM: 0.2, outputPerM: 0.9, label: "Venice" },
};

export function rateFor(provider: string, model: string): TokenRate {
  return MODEL_RATES[model] ?? PROVIDER_RATES[provider] ?? { inputPerM: 1, outputPerM: 3, label: model || provider || "unknown" };
}

export function estimateUsd(provider: string, model: string, usage: Usage): number {
  const rate = rateFor(provider, model);
  let inn = usage.input_tokens;
  let out = usage.output_tokens;
  if (!inn && !out && usage.total_tokens) {
    inn = Math.round(usage.total_tokens * 0.75);
    out = usage.total_tokens - inn;
  }
  return (inn / 1_000_000) * rate.inputPerM + (out / 1_000_000) * rate.outputPerM;
}

export function totalSpendUsd(
  rows: Array<{ provider: string; model: string; usage: Usage | null | undefined }>,
): number {
  return rows.reduce((sum, row) => sum + estimateUsd(row.provider, row.model, usageFrom(row.usage)), 0);
}

export function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0.00";
  if (Math.abs(n) < 0.01) return `$${n.toFixed(4)}`;
  if (Math.abs(n) < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export function usageFrom(raw: Usage | null | undefined): Usage {
  return {
    input_tokens: Number(raw?.input_tokens) || 0,
    output_tokens: Number(raw?.output_tokens) || 0,
    total_tokens: Number(raw?.total_tokens) || 0,
  };
}
