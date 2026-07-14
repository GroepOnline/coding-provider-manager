import path from "node:path";
import type { ModelCacheEntry, ModelInfo, ProviderProfile, ProviderProtocol } from "../types.js";
import { atomicWrite, readText } from "../core/fs.js";
import { cpmRoot } from "../core/paths.js";
import { modelBaseUrl, modelProtocol } from "./catalog.js";

function cachePath(home: string, provider: ProviderProfile): string {
  return path.join(cpmRoot(home), "models", `${provider.id}.json`);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function inferCapabilities(raw: Record<string, unknown>): Partial<ModelInfo> {
  const supported = Array.isArray(raw.supported_parameters) ? raw.supported_parameters.map(String) : [];
  const architecture = raw.architecture && typeof raw.architecture === "object" ? raw.architecture as Record<string, unknown> : {};
  const modality = String(architecture.modality ?? raw.modality ?? "");
  const topProvider = raw.top_provider && typeof raw.top_provider === "object" ? raw.top_provider as Record<string, unknown> : {};
  return {
    context: asNumber(raw.context_length) ?? asNumber(raw.context_window) ?? asNumber(raw.context),
    output: asNumber(topProvider.max_completion_tokens) ?? asNumber(raw.max_completion_tokens) ?? asNumber(raw.max_output_tokens),
    toolCall: supported.includes("tools") || supported.includes("tool_choice") || raw.supportsTools === true || raw.tool_call === true,
    reasoning: supported.includes("reasoning") || raw.supportsReasoning === true || raw.reasoning === true,
    structured: supported.includes("response_format") || supported.includes("structured_outputs") || raw.structured === true,
    vision: /image|video/i.test(modality) || raw.supportsImages === true || raw.vision === true,
  };
}

function parseModelsBody(body: unknown): ModelInfo[] {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const candidates = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : Array.isArray(body)
        ? body
        : [];

  return candidates.flatMap((item): ModelInfo[] => {
    if (typeof item === "string") return [{ id: item, name: item, source: "api" }];
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id : typeof raw.model === "string" ? raw.model : undefined;
    if (!id) return [];
    const endpointHint = String(raw.endpoint ?? raw.api ?? raw.url ?? raw.type ?? "").toLowerCase();
    const protocol = endpointHint.includes("responses")
      ? "openai-responses"
      : endpointHint.includes("messages") || endpointHint.includes("anthropic")
        ? "anthropic-messages"
        : endpointHint.includes("chat/completions")
          ? "openai-chat"
          : undefined;
    return [{
      id,
      name: typeof raw.name === "string" ? raw.name : id,
      source: "api",
      ...(protocol ? { protocol } : {}),
      ...inferCapabilities(raw),
      metadata: raw,
    }];
  });
}

function mergeCatalog(provider: ProviderProfile, fetched: ModelInfo[]): ModelInfo[] {
  const staticMap = new Map(provider.models.map((item) => [item.id, item]));
  const merged = new Map<string, ModelInfo>();
  for (const item of provider.models) merged.set(item.id, item);
  for (const item of fetched) {
    const known = staticMap.get(item.id);
    merged.set(item.id, {
      ...(known ?? {}),
      ...item,
      protocol: item.protocol ?? known?.protocol ?? provider.protocol,
      baseUrl: item.baseUrl ?? known?.baseUrl,
      context: item.context ?? known?.context,
      output: item.output ?? known?.output,
      toolCall: item.toolCall ?? known?.toolCall ?? provider.capabilities?.toolCall,
      reasoning: item.reasoning ?? known?.reasoning,
      structured: item.structured ?? known?.structured,
      vision: item.vision ?? known?.vision,
      source: "api",
      metadata: { ...(known?.metadata ?? {}), ...(item.metadata ?? {}) },
    });
  }
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadModelCache(home: string, provider: ProviderProfile): Promise<ModelCacheEntry | undefined> {
  const text = await readText(cachePath(home, provider));
  if (!text.trim()) return undefined;
  try {
    const parsed = JSON.parse(text) as ModelCacheEntry;
    return parsed.provider === provider.id ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function saveModelCache(home: string, entry: ModelCacheEntry): Promise<void> {
  await atomicWrite(cachePath(home, { id: entry.provider } as ProviderProfile), `${JSON.stringify(entry, null, 2)}\n`);
}

export async function fetchProviderModels(
  home: string,
  provider: ProviderProfile,
  apiKey?: string,
): Promise<ModelCacheEntry> {
  if (!provider.modelEndpoint) {
    const entry: ModelCacheEntry = { provider: provider.id, fetchedAt: new Date().toISOString(), source: ["static"], models: provider.models };
    await saveModelCache(home, entry);
    return entry;
  }

  const headers: Record<string, string> = { Accept: "application/json", ...(provider.headers ?? {}) };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const response = await fetch(provider.modelEndpoint, { headers, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    const fetched = parseModelsBody(body);
    if (!fetched.length) throw new Error("provider returned no model records");
    const entry: ModelCacheEntry = {
      provider: provider.id,
      fetchedAt: new Date().toISOString(),
      source: [provider.modelEndpoint, "static-metadata-merge"],
      models: mergeCatalog(provider, fetched),
    };
    await saveModelCache(home, entry);
    return entry;
  } catch (error) {
    const cached = await loadModelCache(home, provider);
    if (cached) return { ...cached, source: [...cached.source, `fetch-fallback:${(error as Error).message}`] };
    const entry: ModelCacheEntry = {
      provider: provider.id,
      fetchedAt: new Date().toISOString(),
      source: ["static", `fetch-fallback:${(error as Error).message}`],
      models: provider.models,
    };
    await saveModelCache(home, entry);
    return entry;
  }
}

export async function resolveProviderModels(home: string, provider: ProviderProfile, refresh = false, apiKey?: string): Promise<ModelInfo[]> {
  if (refresh) return (await fetchProviderModels(home, provider, apiKey)).models;
  return (await loadModelCache(home, provider))?.models ?? provider.models;
}

function endpointFor(provider: ProviderProfile, item: ModelInfo): string {
  const base = modelBaseUrl(provider, item);
  if (!base) throw new Error(`No base URL for ${provider.id}/${item.id}`);
  const protocol = modelProtocol(provider, item);
  if (protocol === "openai-chat") return `${base.replace(/\/$/, "")}/chat/completions`;
  if (protocol === "openai-responses") return `${base.replace(/\/$/, "")}/responses`;
  return /\/anthropic\/?$/.test(base)
    ? `${base.replace(/\/$/, "")}/v1/messages`
    : `${base.replace(/\/$/, "")}/messages`;
}

function authHeaders(provider: ProviderProfile, apiKey: string, protocol: ProviderProtocol): Record<string, string> {
  const common = { "Content-Type": "application/json", ...(provider.headers ?? {}) };
  if (protocol === "anthropic-messages") {
    return { ...common, Authorization: `Bearer ${apiKey}`, "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  }
  return { ...common, Authorization: `Bearer ${apiKey}` };
}

export async function probeProvider(
  provider: ProviderProfile,
  apiKey: string,
  item: ModelInfo,
  options: { streaming?: boolean; toolCall?: boolean } = {},
): Promise<void> {
  const protocol = modelProtocol(provider, item);
  const endpoint = endpointFor(provider, item);
  const stream = options.streaming === true;
  let body: Record<string, unknown>;
  if (protocol === "openai-responses") {
    body = { model: item.id, input: "Reply with CPM_OK.", max_output_tokens: 16, stream };
    if (options.toolCall) {
      body.input = "Call cpm_probe with status ok.";
      body.tools = [{ type: "function", name: "cpm_probe", description: "CPM capability probe", parameters: { type: "object", properties: { status: { type: "string", enum: ["ok"] } }, required: ["status"], additionalProperties: false } }];
      body.tool_choice = { type: "function", name: "cpm_probe" };
    }
  } else if (protocol === "anthropic-messages") {
    body = { model: item.id, max_tokens: 32, messages: [{ role: "user", content: options.toolCall ? "Call cpm_probe with status ok." : "Reply with CPM_OK." }], stream };
    if (options.toolCall) {
      body.tools = [{ name: "cpm_probe", description: "CPM capability probe", input_schema: { type: "object", properties: { status: { type: "string", enum: ["ok"] } }, required: ["status"] } }];
      body.tool_choice = { type: "tool", name: "cpm_probe" };
    }
  } else {
    body = { model: item.id, messages: [{ role: "user", content: options.toolCall ? "Call cpm_probe with status ok." : "Reply with CPM_OK." }], max_tokens: 32, stream, temperature: 0 };
    if (options.toolCall) {
      body.tools = [{ type: "function", function: { name: "cpm_probe", description: "CPM capability probe", parameters: { type: "object", properties: { status: { type: "string", enum: ["ok"] } }, required: ["status"], additionalProperties: false } } }];
      body.tool_choice = { type: "function", function: { name: "cpm_probe" } };
    }
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: authHeaders(provider, apiKey, protocol),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    const errorText = (await response.text()).slice(0, 500);
    throw new Error(`${provider.id} ${protocol} probe failed: HTTP ${response.status}${errorText ? ` ${errorText}` : ""}`);
  }
  if (stream) {
    if (!response.body) throw new Error(`${provider.id} streaming probe returned no body`);
    const reader = response.body.getReader();
    const first = await reader.read();
    await reader.cancel();
    if (first.done || !first.value?.length) throw new Error(`${provider.id} streaming probe returned no data`);
    return;
  }
  const parsed = await response.json() as Record<string, unknown>;
  if (!Object.keys(parsed).length) throw new Error(`${provider.id} probe returned an empty response`);
}
