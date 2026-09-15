/**
 * OpenAI-compatible chat-completions client.
 * Keys and model IDs resolve from Settings (DB) then env — no redeploy to rotate.
 */
import { getSetting } from "@/lib/config";

export type ProviderId = "venice" | "deepseek" | "grok";

type ProviderCfg = {
  baseUrl: string;
  keyEnv: string;
  modelKey: string;
  defaultModel: string;
  extraBody?: Record<string, unknown>;
};

export const PROVIDERS: Record<ProviderId, ProviderCfg> = {
  venice: {
    baseUrl: "https://api.venice.ai/api/v1",
    keyEnv: "VENICE_API_KEY",
    modelKey: "VENICE_MODEL_ID",
    defaultModel: "venice-uncensored-1-2",
    extraBody: { venice_parameters: { include_venice_system_prompt: false } },
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    keyEnv: "DEEPSEEK_API_KEY",
    modelKey: "DEEPSEEK_MODEL_ID",
    defaultModel: "deepseek-chat",
  },
  grok: {
    baseUrl: "https://api.x.ai/v1",
    keyEnv: "GROK_API_KEY",
    modelKey: "GROK_MODEL_ID",
    defaultModel: "grok-4.6",
    extraBody: { reasoning_effort: "low" },
  },
};

export function parseProviderId(raw: unknown): ProviderId {
  if (raw === "venice" || raw === "deepseek" || raw === "grok") return raw;
  return "deepseek";
}

export async function providerFlags(): Promise<Record<ProviderId, boolean>> {
  return {
    venice: await providerAvailable("venice"),
    deepseek: await providerAvailable("deepseek"),
    grok: await providerAvailable("grok"),
  };
}

export async function providerInfos(): Promise<Record<ProviderId, { available: boolean; main: string }>> {
  return {
    venice: { available: await providerAvailable("venice"), main: await resolveModel("venice") },
    deepseek: { available: await providerAvailable("deepseek"), main: await resolveModel("deepseek") },
    grok: { available: await providerAvailable("grok"), main: await resolveModel("grok") },
  };
}

export async function resolveModel(id: ProviderId): Promise<string> {
  const cfg = PROVIDERS[id];
  return (await getSetting(cfg.modelKey)) || cfg.defaultModel;
}

export async function providerAvailable(id: ProviderId): Promise<boolean> {
  return Boolean(await getSetting(PROVIDERS[id].keyEnv));
}

export type Usage = { input_tokens: number; output_tokens: number; total_tokens: number };

export async function converse(
  provider: ProviderId,
  system: string,
  user: string,
  opts: { maxTokens?: number; temperature?: number; model?: string } = {},
): Promise<{ text: string; usage: Usage }> {
  const cfg = PROVIDERS[provider];
  const key = await getSetting(cfg.keyEnv);
  if (!key) throw new Error(`${provider}: ${cfg.keyEnv} is not set`);
  const model = opts.model || (await resolveModel(provider));

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_completion_tokens: opts.maxTokens ?? 2200,
      temperature: opts.temperature ?? 0.9,
      ...cfg.extraBody,
    }),
    signal: AbortSignal.timeout(provider === "grok" ? 180_000 : 120_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${provider} ${model} HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  const u = data?.usage ?? {};
  return {
    text,
    usage: {
      input_tokens: u.prompt_tokens ?? 0,
      output_tokens: u.completion_tokens ?? 0,
      total_tokens: u.total_tokens ?? 0,
    },
  };
}
