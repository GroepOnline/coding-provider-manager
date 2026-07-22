export type ToolId =
  | "pi"
  | "claude"
  | "opencode"
  | "factory"
  | "aider"
  | "continue"
  | "kilo"
  | "crush"
  | "cline"
  | "roo"
  | "cursor"
  | "codex"
  | "codex-app"
  | "codex-ide"
  | "t3-chat"
  | "antigravity"
  | "windsurf"
  | "vscode"
  | "github-copilot"
  | "gemini-cli"
  | "qwen-code"
  | "kimi-cli"
  | "amp"
  | "goose"
  | "zed"
  | "augment"
  | "junie"
  | "trae"
  | "sourcegraph-cody"
  | "replit-agent"
  | "copilot-cli"
  | "amazon-q"
  | "kiro"
  | "warp"
  | "openhands"
  | "plandex"
  | "mentat"
  | "open-interpreter"
  | "mistral-vibe"
  | "tabby"
  | "void-editor"
  | "pearai"
  | "devin"
  | "sweep"
  | "qodo"
  | "continue-cli"
  | "aider-desk"
  | "bolt"
  | "lovable";

export type ProviderId =
  | "zai-coding"
  | "minimax"
  | "opencode-zen"
  | "opencode-go"
  | "kilo-gateway"
  | "cline-pass"
  | "openrouter"
  | "deepseek"
  | "openai";

export type ProviderProtocol =
  | "openai-chat"
  | "openai-responses"
  | "anthropic-messages";

export type ResourceKind = "mcp" | "plugin" | "integration" | "graph";
export type ToolSurface = "cli" | "ide" | "desktop" | "web" | "extension";
export type AuthFlowKind = "oauth-browser" | "oauth-device" | "api-key-login" | "delegated";

export interface ModelInfo {
  id: string;
  name?: string;
  context?: number;
  output?: number;
  toolCall?: boolean;
  reasoning?: boolean;
  structured?: boolean;
  vision?: boolean;
  protocol?: ProviderProtocol;
  baseUrl?: string;
  sdkPackage?: string;
  source?: "static" | "api" | "models.dev" | "client";
  metadata?: Record<string, unknown>;
}

export interface ProviderProfile {
  id: ProviderId;
  displayName: string;
  keyEnv: string;
  authKind: "api-key" | "hybrid";
  protocol: ProviderProtocol;
  openAIBaseUrl?: string;
  responsesBaseUrl?: string;
  anthropicBaseUrl?: string;
  modelEndpoint?: string;
  modelsDevId?: string;
  aiSdkPackage?: string;
  defaultModel?: string;
  models: ModelInfo[];
  allowedTools?: ToolId[];
  defaultTools?: ToolId[];
  headers?: Record<string, string>;
  notes?: string[];
  oauthFlowIds?: string[];
  claude?: {
    modelAliases?: Record<string, string>;
    smallModel?: string;
    extraEnv?: Record<string, string>;
  };
  capabilities?: {
    streaming?: boolean;
    toolCall?: boolean;
    responses?: boolean;
    reasoningEfforts?: string[];
    preserveThinking?: boolean;
  };
}

export interface ProviderPreference {
  enabled?: boolean;
  activeKey?: string;
  selectedModels?: string[];
  selectedTools?: ToolId[];
  defaultModel?: string;
  options?: Record<string, unknown>;
}

export interface CpmState {
  schemaVersion: 2;
  providers: Partial<Record<ProviderId, ProviderPreference>>;
  selectedProviders?: ProviderId[];
  updatedAt: string;
}

export interface AdapterContext {
  home: string;
  cwd?: string;
  provider: ProviderProfile;
  models: ModelInfo[];
  selectedModel: string;
  makeDefault?: boolean;
}

export interface PlannedChange {
  tool: ToolId;
  status: "ready" | "manual" | "unsupported";
  path?: string;
  before?: string;
  after?: string;
  notes: string[];
}

export interface ToolDetection {
  commands?: string[];
  paths?: string[];
}

export interface ToolAdapter {
  id: ToolId;
  displayName: string;
  command?: string;
  surfaces?: ToolSurface[];
  sharedConfigGroup?: string;
  detect?: ToolDetection;
  providerInjection?: "automatic" | "guided" | "none";
  authFlowIds?: string[];
  plan(ctx: AdapterContext): Promise<PlannedChange>;
  runtimeEnv?(ctx: AdapterContext, key: string): Record<string, string>;
}

export interface AuthFlow {
  id: string;
  displayName: string;
  kind: AuthFlowKind;
  tool: ToolId;
  provider?: ProviderId | string;
  command: string;
  args: string[];
  statusArgs?: string[];
  logoutArgs?: string[];
  providerKey?: ProviderId;
  secretScope?: string;
  secretEnv?: string;
  stdinFlag?: string;
  headless?: boolean;
  notes?: string[];
}

export interface KeySlotSummary {
  scope: string;
  alias: string;
  active: boolean;
  disabled: boolean;
  source: "vault" | "environment";
  fingerprint: string;
  createdAt?: string;
  lastUsedAt?: string;
}

export interface ManagedResource {
  id: string;
  kind: ResourceKind;
  displayName?: string;
  enabled: boolean;
  targets: ToolId[];
  config: Record<string, unknown>;
  secretRefs?: Record<string, { scope: string; keyAlias?: string }>;
  preferences?: Record<string, unknown>;
}

export interface ResourceRegistry {
  schemaVersion: 1;
  resources: ManagedResource[];
  updatedAt: string;
}

export interface ModelCacheEntry {
  provider: ProviderId;
  fetchedAt: string;
  source: string[];
  models: ModelInfo[];
}

export interface SyncBundle {
  schemaVersion: 1;
  exportedAt: string;
  state: CpmState;
  resources: ResourceRegistry;
  vault?: Record<string, unknown>;
}


export type AccountDriverId =
  | "chefvault"
  | "codex-multi-auth"
  | "opencode-codex-multi-auth"
  | "github";

export interface ManagedAccount {
  id: string;
  label?: string;
  email?: string;
  username?: string;
  host?: string;
  active: boolean;
  enabled: boolean;
  healthy?: boolean;
  limited?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AccountDriverSummary {
  id: AccountDriverId;
  displayName: string;
  installed: boolean;
  command: string;
  supportsUsage: boolean;
  supportsNext: boolean;
}

export interface UsageResult {
  target: string;
  source: "provider" | "account-driver" | "cache";
  alias?: string;
  available: boolean;
  fetchedAt: string;
  summary: string;
  score?: number;
  resetAt?: string;
  data?: unknown;
  error?: string;
}

export interface AgentRequest {
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface AgentResponse {
  id?: string | number;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}
