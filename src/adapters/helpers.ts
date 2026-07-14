import type { AdapterContext, ModelInfo, ProviderProtocol, ToolId } from "../types.js";
import { modelBaseUrl, modelProtocol, providerConfigId } from "../providers/catalog.js";

export function unsupportedByPolicy(ctx: AdapterContext, tool: ToolId): string[] | undefined {
  if (ctx.provider.allowedTools && !ctx.provider.allowedTools.includes(tool)) {
    return [
      `${ctx.provider.displayName} is not enabled for ${tool} by this provider profile.`,
      "CPM refuses to infer quota/policy compatibility from wire-protocol compatibility alone.",
    ];
  }
  return undefined;
}

export function modelsForProtocol(ctx: AdapterContext, protocol: ProviderProtocol): ModelInfo[] {
  return ctx.models.filter((item) => modelProtocol(ctx.provider, item) === protocol);
}

export function selectedForProtocol(ctx: AdapterContext, protocol: ProviderProtocol): ModelInfo | undefined {
  const models = modelsForProtocol(ctx, protocol);
  return models.find((item) => item.id === ctx.selectedModel) ?? models[0];
}

export function configId(ctx: AdapterContext, protocol?: ProviderProtocol): string {
  return providerConfigId(ctx.provider, protocol);
}

export function baseUrlFor(ctx: AdapterContext, item: ModelInfo): string | undefined {
  return modelBaseUrl(ctx.provider, item);
}

export function protocolGroups(ctx: AdapterContext): Array<[ProviderProtocol, ModelInfo[]]> {
  const groups = new Map<ProviderProtocol, ModelInfo[]>();
  for (const item of ctx.models) {
    const protocol = modelProtocol(ctx.provider, item);
    groups.set(protocol, [...(groups.get(protocol) ?? []), item]);
  }
  return [...groups.entries()];
}
