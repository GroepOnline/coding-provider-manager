import type { ModelInfo, ProviderId, ProviderProfile, ProviderProtocol, ToolId } from "../types.js";

function model(
  id: string,
  name: string,
  protocol: ProviderProtocol,
  context?: number,
  output?: number,
  extras: Partial<ModelInfo> = {},
): ModelInfo {
  return {
    id,
    name,
    protocol,
    context,
    output,
    toolCall: true,
    source: "static",
    ...extras,
  };
}

const zaiModels: ModelInfo[] = [
  model("glm-5.2", "GLM-5.2", "openai-chat", 1_000_000, 131_072, {
    reasoning: true,
    structured: true,
    metadata: {
      thinkingLevels: { high: "high", xhigh: "max", max: "max" },
      preserveThinking: true,
      supportsStore: false,
      supportsDeveloperRole: false,
      thinkingFormat: "zai",
      zaiToolStream: true,
    },
  }),
  model("glm-5.1", "GLM-5.1", "openai-chat", 200_000, 131_072, { reasoning: true }),
  model("glm-5", "GLM-5", "openai-chat", 200_000, 131_072, { reasoning: true }),
  model("glm-5-turbo", "GLM-5-Turbo", "openai-chat", 200_000, 131_072, { reasoning: true }),
  model("glm-4.7", "GLM-4.7", "openai-chat", 204_800, 131_072, { reasoning: true }),
  model("glm-4.7-flashx", "GLM-4.7 FlashX", "openai-chat", 200_000, 128_000, { reasoning: true }),
  model("glm-4.5-air", "GLM-4.5-Air", "openai-chat", 131_072, 98_304, { reasoning: true }),
];

const minimaxModels: ModelInfo[] = [
  model("MiniMax-M3", "MiniMax-M3", "openai-chat", 1_000_000, 128_000, { reasoning: true, vision: true }),
  model("MiniMax-M2.7", "MiniMax-M2.7", "openai-chat", 204_800, 131_072, { reasoning: true }),
  model("MiniMax-M2.7-highspeed", "MiniMax-M2.7 Highspeed", "openai-chat", 204_800, 131_072, { reasoning: true }),
  model("MiniMax-M2.5", "MiniMax-M2.5", "openai-chat", 204_800, 131_072, { reasoning: true }),
  model("MiniMax-M2.5-highspeed", "MiniMax-M2.5 Highspeed", "openai-chat", 204_800, 131_072, { reasoning: true }),
  model("MiniMax-M2.1", "MiniMax-M2.1", "openai-chat", 204_800, 131_072, { reasoning: true }),
  model("MiniMax-M2.1-highspeed", "MiniMax-M2.1 Highspeed", "openai-chat", 204_800, 131_072, { reasoning: true }),
  model("MiniMax-M2", "MiniMax-M2", "openai-chat", 204_800, 131_072, { reasoning: true }),
];

const zenModels: ModelInfo[] = [
  model("gpt-5.6-sol", "GPT-5.6 Sol", "openai-responses", 1_050_000, 128_000, { reasoning: true }),
  model("gpt-5.6-terra", "GPT-5.6 Terra", "openai-responses", 1_050_000, 128_000, { reasoning: true }),
  model("gpt-5.6-luna", "GPT-5.6 Luna", "openai-responses", 1_050_000, 128_000, { reasoning: true }),
  model("gpt-5.5", "GPT-5.5", "openai-responses", 1_000_000, 128_000, { reasoning: true }),
  model("claude-fable-5", "Claude Fable 5", "anthropic-messages", 1_000_000, 128_000, { reasoning: true }),
  model("claude-sonnet-5", "Claude Sonnet 5", "anthropic-messages", 1_000_000, 128_000, { reasoning: true }),
  model("claude-sonnet-4-6", "Claude Sonnet 4.6", "anthropic-messages", 1_000_000, 128_000, { reasoning: true }),
  model("qwen3.7-max", "Qwen3.7 Max", "anthropic-messages", 1_000_000, 131_072, { reasoning: true }),
  model("qwen3.7-plus", "Qwen3.7 Plus", "anthropic-messages", 1_000_000, 131_072, { reasoning: true }),
  model("deepseek-v4-pro", "DeepSeek V4 Pro", "openai-chat", 1_000_000, 384_000, { reasoning: true, structured: true }),
  model("deepseek-v4-flash", "DeepSeek V4 Flash", "openai-chat", 1_000_000, 384_000, { reasoning: true, structured: true }),
  model("minimax-m3", "MiniMax M3", "openai-chat", 1_000_000, 128_000, { reasoning: true }),
  model("minimax-m2.7", "MiniMax M2.7", "openai-chat", 204_800, 131_072, { reasoning: true }),
  model("glm-5.2", "GLM-5.2", "openai-chat", 1_000_000, 131_072, { reasoning: true, structured: true }),
  model("glm-5.1", "GLM-5.1", "openai-chat", 200_000, 131_072, { reasoning: true }),
  model("kimi-k2.7-code", "Kimi K2.7 Code", "openai-chat", 262_144, 262_144, { reasoning: true }),
];

const goModels: ModelInfo[] = [
  model("glm-5.2", "GLM-5.2", "openai-chat", 1_000_000, 131_072, { reasoning: true, structured: true }),
  model("glm-5.1", "GLM-5.1", "openai-chat", 200_000, 131_072, { reasoning: true }),
  model("kimi-k2.7-code", "Kimi K2.7 Code", "openai-chat", 262_144, 262_144, { reasoning: true }),
  model("kimi-k2.6", "Kimi K2.6", "openai-chat", 262_144, 262_144, { reasoning: true }),
  model("deepseek-v4-pro", "DeepSeek V4 Pro", "openai-chat", 1_000_000, 384_000, { reasoning: true, structured: true }),
  model("deepseek-v4-flash", "DeepSeek V4 Flash", "openai-chat", 1_000_000, 384_000, { reasoning: true, structured: true }),
  model("mimo-v2.5", "MiMo-V2.5", "openai-chat", 1_000_000, 131_072, { reasoning: true }),
  model("mimo-v2.5-pro", "MiMo-V2.5-Pro", "openai-chat", 1_000_000, 131_072, { reasoning: true }),
  model("minimax-m3", "MiniMax M3", "anthropic-messages", 1_000_000, 128_000, { reasoning: true }),
  model("minimax-m2.7", "MiniMax M2.7", "anthropic-messages", 204_800, 131_072, { reasoning: true }),
  model("qwen3.7-max", "Qwen3.7 Max", "anthropic-messages", 1_000_000, 131_072, { reasoning: true }),
  model("qwen3.7-plus", "Qwen3.7 Plus", "anthropic-messages", 1_000_000, 131_072, { reasoning: true }),
  model("qwen3.6-plus", "Qwen3.6 Plus", "anthropic-messages", 1_000_000, 131_072, { reasoning: true }),
];

const clineModels: ModelInfo[] = [
  model("cline-pass/qwen3.7-max", "ClinePass Qwen3.7 Max", "openai-chat", 1_000_000, 131_072, { reasoning: true }),
  model("anthropic/claude-sonnet-4-6", "Claude Sonnet 4.6", "openai-chat", 1_000_000, 128_000, { reasoning: true, vision: true }),
  model("minimax/minimax-m2.5", "MiniMax M2.5", "openai-chat", 204_800, 131_072, { reasoning: true }),
  model("deepseek/deepseek-chat", "DeepSeek Chat", "openai-chat", 128_000, 64_000),
];

const deepSeekModels: ModelInfo[] = [
  model("deepseek-v4-flash", "DeepSeek V4 Flash", "openai-chat", 1_000_000, 384_000, { reasoning: true, structured: true }),
  model("deepseek-v4-pro", "DeepSeek V4 Pro", "openai-chat", 1_000_000, 384_000, { reasoning: true, structured: true }),
];

const openAIModels: ModelInfo[] = [
  model("gpt-5.6", "GPT-5.6", "openai-responses", 1_050_000, 128_000, { reasoning: true, structured: true, vision: true }),
  model("gpt-5.6-sol", "GPT-5.6 Sol", "openai-responses", 1_050_000, 128_000, { reasoning: true, structured: true, vision: true }),
  model("gpt-5.6-terra", "GPT-5.6 Terra", "openai-responses", 1_050_000, 128_000, { reasoning: true, structured: true, vision: true }),
  model("gpt-5.6-luna", "GPT-5.6 Luna", "openai-responses", 1_050_000, 128_000, { reasoning: true, structured: true, vision: true }),
  model("gpt-5.5", "GPT-5.5", "openai-responses", 1_000_000, 128_000, { reasoning: true, structured: true, vision: true }),
];

const chatTools: ToolId[] = [
  "opencode", "factory", "aider", "continue", "kilo", "crush", "cline", "roo", "cursor",
  "qwen-code", "windsurf", "goose", "zed", "trae", "sourcegraph-cody",
  "openhands", "plandex", "mentat", "open-interpreter", "mistral-vibe", "tabby", "continue-cli", "aider-desk",
];
const codexTools: ToolId[] = ["codex", "codex-app", "codex-ide"];
const broadTools: ToolId[] = ["claude", ...chatTools, ...codexTools];

export const providers: ProviderProfile[] = [
  {
    id: "zai-coding",
    displayName: "Z.AI Coding Plan",
    keyEnv: "ZAI_API_KEY",
    authKind: "api-key",
    protocol: "openai-chat",
    openAIBaseUrl: "https://api.z.ai/api/coding/paas/v4",
    anthropicBaseUrl: "https://api.z.ai/api/anthropic",
    modelEndpoint: "https://api.z.ai/api/coding/paas/v4/models",
    modelsDevId: "zai-coding-plan",
    aiSdkPackage: "@ai-sdk/openai-compatible",
    defaultModel: "glm-5.2",
    models: zaiModels,
    allowedTools: ["pi", "claude", "opencode", "factory", "kilo", "crush", "cline", "roo", "cursor"],
    defaultTools: ["pi", "claude", "opencode", "factory", "kilo", "crush"],
    claude: {
      modelAliases: { "glm-5.2": "glm-5.2[1m]" },
      smallModel: "glm-4.7",
      extraEnv: {
        CLAUDE_CODE_AUTO_COMPACT_WINDOW: "1000000",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        API_TIMEOUT_MS: "3000000",
      },
    },
    capabilities: {
      streaming: true,
      toolCall: true,
      responses: false,
      reasoningEfforts: ["off", "high", "max"],
      preserveThinking: true,
    },
    notes: [
      "Coding Plan is only emitted for the provider-supported client set.",
      "GLM metadata, thinking mapping and preserve-thinking behavior are aligned with GroepOnline/pi-zai.",
    ],
  },
  {
    id: "minimax",
    displayName: "MiniMax Direct API",
    keyEnv: "MINIMAX_API_KEY",
    authKind: "api-key",
    protocol: "openai-chat",
    openAIBaseUrl: "https://api.minimax.io/v1",
    anthropicBaseUrl: "https://api.minimax.io/anthropic",
    modelEndpoint: "https://api.minimax.io/v1/models",
    modelsDevId: "minimax",
    aiSdkPackage: "@ai-sdk/openai-compatible",
    defaultModel: "MiniMax-M3",
    models: minimaxModels,
    allowedTools: ["claude", ...chatTools],
    defaultTools: ["claude", "opencode", "factory", "kilo", "crush"],
    claude: { smallModel: "MiniMax-M2.5", extraEnv: { API_TIMEOUT_MS: "3000000" } },
    capabilities: { streaming: true, toolCall: true, reasoningEfforts: ["disabled", "adaptive"], preserveThinking: true },
  },
  {
    id: "opencode-zen",
    displayName: "OpenCode Zen",
    keyEnv: "OPENCODE_ZEN_API_KEY",
    authKind: "api-key",
    protocol: "openai-chat",
    openAIBaseUrl: "https://opencode.ai/zen/v1",
    responsesBaseUrl: "https://opencode.ai/zen/v1",
    anthropicBaseUrl: "https://opencode.ai/zen/v1",
    modelEndpoint: "https://opencode.ai/zen/v1/models",
    modelsDevId: "opencode",
    defaultModel: "glm-5.2",
    models: zenModels,
    allowedTools: broadTools,
    defaultTools: ["opencode", "factory", "kilo", "crush", "codex", "codex-app", "codex-ide"],
    capabilities: { streaming: true, toolCall: true, responses: true },
  },
  {
    id: "opencode-go",
    displayName: "OpenCode Go",
    keyEnv: "OPENCODE_GO_API_KEY",
    authKind: "api-key",
    protocol: "openai-chat",
    openAIBaseUrl: "https://opencode.ai/zen/go/v1",
    anthropicBaseUrl: "https://opencode.ai/zen/go/v1",
    modelEndpoint: "https://opencode.ai/zen/go/v1/models",
    modelsDevId: "opencode-go",
    defaultModel: "glm-5.2",
    models: goModels,
    allowedTools: ["claude", ...chatTools],
    defaultTools: ["opencode", "factory", "kilo", "crush"],
    capabilities: { streaming: true, toolCall: true },
  },
  {
    id: "kilo-gateway",
    displayName: "Kilo AI Gateway",
    keyEnv: "KILO_API_KEY",
    authKind: "api-key",
    protocol: "openai-chat",
    openAIBaseUrl: "https://api.kilo.ai/api/gateway",
    modelEndpoint: "https://api.kilo.ai/api/gateway/models",
    modelsDevId: "kilo",
    aiSdkPackage: "@ai-sdk/openai",
    defaultModel: "anthropic/claude-sonnet-4.5",
    models: [model("anthropic/claude-sonnet-4.5", "Claude Sonnet 4.5", "openai-chat", 200_000, 64_000, { reasoning: true })],
    allowedTools: chatTools,
    defaultTools: ["opencode", "factory", "kilo", "crush"],
    capabilities: { streaming: true, toolCall: true },
  },
  {
    id: "cline-pass",
    displayName: "Cline API / ClinePass",
    keyEnv: "CLINE_API_KEY",
    authKind: "api-key",
    protocol: "openai-chat",
    openAIBaseUrl: "https://api.cline.bot/api/v1",
    modelEndpoint: "https://api.cline.bot/api/v1/models",
    modelsDevId: "cline",
    aiSdkPackage: "@ai-sdk/openai-compatible",
    defaultModel: "cline-pass/qwen3.7-max",
    models: clineModels,
    allowedTools: chatTools,
    defaultTools: ["opencode", "factory", "kilo", "crush", "cline"],
    capabilities: { streaming: true, toolCall: true },
    notes: ["This profile uses the standalone Cline API key from app.cline.bot, not Cline's internal OAuth refresh-token storage."],
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    keyEnv: "OPENROUTER_API_KEY",
    authKind: "api-key",
    protocol: "openai-chat",
    openAIBaseUrl: "https://openrouter.ai/api/v1",
    modelEndpoint: "https://openrouter.ai/api/v1/models",
    modelsDevId: "openrouter",
    aiSdkPackage: "@openrouter/ai-sdk-provider",
    defaultModel: "openrouter/auto",
    models: [model("openrouter/auto", "OpenRouter Auto", "openai-chat", 2_000_000, 256_000, { reasoning: true })],
    allowedTools: chatTools,
    defaultTools: ["opencode", "factory", "aider", "continue", "kilo", "crush"],
    headers: { "HTTP-Referer": "https://chefgroep.online", "X-Title": "GroepOnline CPM" },
    capabilities: { streaming: true, toolCall: true },
  },
  {
    id: "deepseek",
    displayName: "DeepSeek Direct API",
    keyEnv: "DEEPSEEK_API_KEY",
    authKind: "api-key",
    protocol: "openai-chat",
    openAIBaseUrl: "https://api.deepseek.com",
    modelEndpoint: "https://api.deepseek.com/models",
    modelsDevId: "deepseek",
    aiSdkPackage: "@ai-sdk/openai-compatible",
    defaultModel: "deepseek-v4-flash",
    models: deepSeekModels,
    allowedTools: chatTools,
    defaultTools: ["opencode", "factory", "aider", "continue", "kilo", "crush", "qwen-code"],
    capabilities: { streaming: true, toolCall: true },
  },
  {
    id: "openai",
    displayName: "OpenAI / ChatGPT Codex",
    keyEnv: "OPENAI_API_KEY",
    authKind: "hybrid",
    protocol: "openai-responses",
    openAIBaseUrl: "https://api.openai.com/v1",
    responsesBaseUrl: "https://api.openai.com/v1",
    modelEndpoint: "https://api.openai.com/v1/models",
    modelsDevId: "openai",
    aiSdkPackage: "@ai-sdk/openai",
    defaultModel: "gpt-5.6",
    models: openAIModels,
    allowedTools: ["opencode", ...codexTools],
    defaultTools: ["codex", "codex-app", "codex-ide", "opencode"],
    oauthFlowIds: ["codex-chatgpt", "codex-openai-key", "codex-access-token", "opencode-openai-chatgpt"],
    capabilities: { streaming: true, toolCall: true, responses: true },
    notes: [
      "Codex surfaces can use ChatGPT OAuth or an OpenAI API key through Codex-owned authentication.",
      "CPM never exports or synchronizes Codex OAuth refresh tokens.",
    ],
  },
];

export const providerMap = new Map<ProviderId, ProviderProfile>(providers.map((provider) => [provider.id, provider]));

export function getProvider(id: string): ProviderProfile {
  const provider = providerMap.get(id as ProviderId);
  if (!provider) throw new Error(`Unknown provider: ${id}. Available: ${providers.map((item) => item.id).join(", ")}`);
  return provider;
}

export function providerConfigId(provider: ProviderProfile, protocol?: ProviderProtocol): string {
  const suffix = protocol ? `-${protocol.replace(/^[^-]+-/, "")}` : "";
  return `cpm-${provider.id}${suffix}`.replace(/[^a-z0-9_-]/gi, "-");
}

export function modelProtocol(provider: ProviderProfile, item: ModelInfo): ProviderProtocol {
  return item.protocol ?? provider.protocol;
}

export function modelBaseUrl(provider: ProviderProfile, item: ModelInfo): string | undefined {
  if (item.baseUrl) return item.baseUrl;
  const protocol = modelProtocol(provider, item);
  if (protocol === "anthropic-messages") return provider.anthropicBaseUrl;
  if (protocol === "openai-responses") return provider.responsesBaseUrl ?? provider.openAIBaseUrl;
  return provider.openAIBaseUrl;
}
