import path from "node:path";
import type { ManagedResource, PlannedChange, ToolId } from "../types.js";
import { readText, setJsonc } from "../core/fs.js";
import { configRoot } from "../core/paths.js";
import { loadRegistry } from "./registry.js";
import { resolveSecret } from "../core/vault.js";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, String(item)]));
}

function envRefs(resource: ManagedResource, syntax: "opencode" | "shell" | "gemini"): Record<string, string> {
  const refs: Record<string, string> = {};
  for (const name of Object.keys(resource.secretRefs ?? {})) {
    refs[name] = syntax === "opencode" ? `{env:${name}}` : syntax === "gemini" ? `$${name}` : `\${${name}}`;
  }
  return refs;
}

function renderOpenCodeMcp(resource: ManagedResource): Record<string, unknown> {
  const type = resource.config.type === "remote" || resource.config.url ? "remote" : "local";
  if (type === "remote") {
    return {
      type: "remote",
      url: String(resource.config.url ?? ""),
      enabled: resource.enabled,
      ...(resource.config.oauth !== undefined ? { oauth: resource.config.oauth } : {}),
      ...(resource.config.timeout ? { timeout: Number(resource.config.timeout) } : {}),
      headers: { ...asRecord(resource.config.headers), ...envRefs(resource, "opencode") },
    };
  }
  const command = Array.isArray(resource.config.command)
    ? resource.config.command.map(String)
    : [String(resource.config.command ?? ""), ...asStringArray(resource.config.args)];
  return {
    type: "local",
    command,
    enabled: resource.enabled,
    ...(resource.config.cwd ? { cwd: String(resource.config.cwd) } : {}),
    ...(resource.config.timeout ? { timeout: Number(resource.config.timeout) } : {}),
    environment: { ...asRecord(resource.config.environment ?? resource.config.env), ...envRefs(resource, "opencode") },
  };
}

function renderStandardMcp(resource: ManagedResource, syntax: "shell" | "gemini" = "shell"): Record<string, unknown> {
  if (resource.config.type === "remote" || resource.config.url || resource.config.httpUrl) {
    return {
      ...(resource.config.httpUrl ? { httpUrl: String(resource.config.httpUrl) } : { url: String(resource.config.url ?? "") }),
      ...(Object.keys(asRecord(resource.config.headers)).length || Object.keys(resource.secretRefs ?? {}).length
        ? { headers: { ...asRecord(resource.config.headers), ...envRefs(resource, syntax) } }
        : {}),
      ...(resource.config.timeout ? { timeout: Number(resource.config.timeout) } : {}),
      ...(resource.config.trust !== undefined ? { trust: Boolean(resource.config.trust) } : {}),
    };
  }
  const commandParts = Array.isArray(resource.config.command)
    ? resource.config.command.map(String)
    : [String(resource.config.command ?? ""), ...asStringArray(resource.config.args)];
  return {
    command: commandParts[0] ?? "",
    args: commandParts.slice(1),
    ...(resource.config.cwd ? { cwd: String(resource.config.cwd) } : {}),
    env: { ...asRecord(resource.config.environment ?? resource.config.env), ...envRefs(resource, syntax) },
    ...(resource.config.timeout ? { timeout: Number(resource.config.timeout) } : {}),
    ...(resource.config.trust !== undefined ? { trust: Boolean(resource.config.trust) } : {}),
  };
}

function quoteToml(value: string): string {
  return JSON.stringify(value);
}

function tomlArray(values: string[]): string {
  return `[${values.map(quoteToml).join(", ")}]`;
}

function tomlInlineTable(values: Record<string, string>): string {
  return `{ ${Object.entries(values).map(([key, value]) => `${key} = ${quoteToml(value)}`).join(", ")} }`;
}

function replaceManagedBlock(text: string, id: string, block: string): string {
  const start = `# >>> CPM ${id}`;
  const end = `# <<< CPM ${id}`;
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`${escape(start)}[\\s\\S]*?${escape(end)}\\n?`, "m");
  const clean = text.replace(expression, "").trimEnd();
  return `${clean}${clean ? "\n\n" : ""}${start}\n${block.trim()}\n${end}\n`;
}

function renderCodexResource(resource: ManagedResource): string {
  const lines = [`[mcp_servers.${JSON.stringify(resource.id)}]`, `enabled = ${resource.enabled ? "true" : "false"}`];
  if (resource.config.type === "remote" || resource.config.url || resource.config.httpUrl) {
    lines.push(`url = ${quoteToml(String(resource.config.httpUrl ?? resource.config.url ?? ""))}`);
    const bearer = typeof resource.config.bearerTokenEnvVar === "string" ? resource.config.bearerTokenEnvVar : undefined;
    if (bearer) lines.push(`bearer_token_env_var = ${quoteToml(bearer)}`);
    const headers = asRecord(resource.config.headers);
    if (Object.keys(headers).length) lines.push(`http_headers = ${tomlInlineTable(headers)}`);
    const envHeaders = asRecord(resource.config.envHeaders);
    if (Object.keys(envHeaders).length) lines.push(`env_http_headers = ${tomlInlineTable(envHeaders)}`);
    if (typeof resource.config.oauthClientId === "string") lines.push(`oauth_client_id = ${quoteToml(resource.config.oauthClientId)}`);
    if (typeof resource.config.oauthResource === "string") lines.push(`oauth_resource = ${quoteToml(resource.config.oauthResource)}`);
  } else {
    const commandParts = Array.isArray(resource.config.command)
      ? resource.config.command.map(String)
      : [String(resource.config.command ?? ""), ...asStringArray(resource.config.args)];
    lines.push(`command = ${quoteToml(commandParts[0] ?? "")}`);
    if (commandParts.length > 1) lines.push(`args = ${tomlArray(commandParts.slice(1))}`);
    const env = asRecord(resource.config.environment ?? resource.config.env);
    if (Object.keys(env).length) lines.push(`env = ${tomlInlineTable(env)}`);
    const envVars = [...new Set([...asStringArray(resource.config.envVars), ...Object.keys(resource.secretRefs ?? {})])];
    if (envVars.length) lines.push(`env_vars = ${tomlArray(envVars)}`);
    if (resource.config.cwd) lines.push(`cwd = ${quoteToml(String(resource.config.cwd))}`);
  }
  if (resource.config.timeout) lines.push(`startup_timeout_sec = ${Math.ceil(Number(resource.config.timeout) / 1000)}`);
  return lines.join("\n");
}

function automaticTarget(target: ToolId): boolean {
  return [
    "opencode", "kilo", "claude", "factory", "codex", "codex-app", "codex-ide",
    "cursor", "windsurf", "gemini-cli", "qwen-code",
  ].includes(target);
}

export async function planMcpResources(home: string, target: ToolId): Promise<PlannedChange> {
  const registry = await loadRegistry(home);
  const codexFamily: ToolId[] = ["codex", "codex-app", "codex-ide"];
  const targetGroup = codexFamily.includes(target) ? codexFamily : [target];
  const resources = registry.resources.filter(
    (item) => item.kind === "mcp" && item.targets.some((candidate) => targetGroup.includes(candidate)),
  );
  if (!automaticTarget(target)) {
    return { tool: target, status: "manual", notes: [`MCP resources are tracked for ${target}, but CPM has no verified automatic config renderer for this target.`] };
  }

  if (["codex", "codex-app", "codex-ide"].includes(target)) {
    const file = path.join(home, ".codex", "config.toml");
    const before = await readText(file);
    const block = resources.map(renderCodexResource).join("\n\n");
    const after = replaceManagedBlock(before, "MCP RESOURCES", block || "# No enabled CPM MCP resources for this Codex host.");
    return {
      tool: target,
      status: "ready",
      path: file,
      before,
      after,
      notes: [
        `${resources.length} MCP resource(s) rendered for the shared Codex local host.`,
        "Stdio secrets use env_vars; remote bearer/OAuth settings remain credential references and Codex owns OAuth tokens.",
      ],
    };
  }

  let file: string;
  let rootPath: string[];
  let syntax: "opencode" | "standard" | "gemini";
  if (target === "opencode") {
    file = path.join(configRoot(home), "opencode", "opencode.json");
    rootPath = ["mcp"];
    syntax = "opencode";
  } else if (target === "kilo") {
    file = path.join(configRoot(home), "kilo", "kilo.jsonc");
    rootPath = ["mcp"];
    syntax = "opencode";
  } else if (target === "factory") {
    file = path.join(home, ".factory", "mcp.json");
    rootPath = ["mcpServers"];
    syntax = "standard";
  } else if (target === "claude") {
    file = path.join(home, ".claude.json");
    rootPath = ["mcpServers"];
    syntax = "standard";
  } else if (target === "cursor") {
    file = path.join(home, ".cursor", "mcp.json");
    rootPath = ["mcpServers"];
    syntax = "standard";
  } else if (target === "windsurf") {
    file = path.join(home, ".codeium", "windsurf", "mcp_config.json");
    rootPath = ["mcpServers"];
    syntax = "standard";
  } else if (target === "gemini-cli") {
    file = path.join(home, ".gemini", "settings.json");
    rootPath = ["mcpServers"];
    syntax = "gemini";
  } else {
    file = path.join(home, ".qwen", "settings.json");
    rootPath = ["mcpServers"];
    syntax = "gemini";
  }

  const before = await readText(file);
  let after = before;
  for (const resource of resources) {
    const value = syntax === "opencode" ? renderOpenCodeMcp(resource) : renderStandardMcp(resource, syntax === "gemini" ? "gemini" : "shell");
    after = setJsonc(after, [...rootPath, resource.id], value);
  }
  return {
    tool: target,
    status: "ready",
    path: file,
    before,
    after,
    notes: [
      `${resources.length} MCP resource(s) rendered from the CPM registry.`,
      "Secrets remain environment references and are resolved by cpm run or a materialized active env file.",
    ],
  };
}

export async function resourceRuntimeEnv(home: string, tool: ToolId): Promise<Record<string, string>> {
  const registry = await loadRegistry(home);
  const env: Record<string, string> = {};
  for (const resource of registry.resources) {
    if (!resource.enabled || !resource.targets.includes(tool)) continue;
    for (const [envName, ref] of Object.entries(resource.secretRefs ?? {})) {
      env[envName] = (await resolveSecret(home, ref.scope, ref.keyAlias)).value;
    }
  }
  return env;
}
