import type { ModelInfo } from "../types.js";
import { getProvider } from "./catalog.js";
import { fetchProviderModels, probeProvider } from "./models.js";

export const zaiCodingProfile = getProvider("zai-coding");

export async function discoverZaiModels(apiKey: string, home = process.env.HOME || process.env.USERPROFILE || ""): Promise<ModelInfo[]> {
  return (await fetchProviderModels(home, zaiCodingProfile, apiKey)).models;
}

export async function probeZaiChat(apiKey: string, model: string): Promise<void> {
  const item = zaiCodingProfile.models.find((candidate) => candidate.id === model) ?? { id: model, protocol: "openai-chat" as const };
  await probeProvider(zaiCodingProfile, apiKey, item);
}

export async function probeZaiToolCall(apiKey: string, model: string): Promise<void> {
  const item = zaiCodingProfile.models.find((candidate) => candidate.id === model) ?? { id: model, protocol: "openai-chat" as const };
  await probeProvider(zaiCodingProfile, apiKey, item, { toolCall: true });
}

export async function probeZaiStreaming(apiKey: string, model: string): Promise<void> {
  const item = zaiCodingProfile.models.find((candidate) => candidate.id === model) ?? { id: model, protocol: "openai-chat" as const };
  await probeProvider(zaiCodingProfile, apiKey, item, { streaming: true });
}
