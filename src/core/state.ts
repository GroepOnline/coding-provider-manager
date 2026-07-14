import path from "node:path";
import type { CpmState, ProviderId, ProviderPreference } from "../types.js";
import { atomicWrite, readText } from "./fs.js";
import { cpmRoot } from "./paths.js";

export function emptyState(): CpmState {
  return { schemaVersion: 2, providers: {}, selectedProviders: [], updatedAt: new Date(0).toISOString() };
}

export function statePath(home: string): string {
  return path.join(cpmRoot(home), "state.json");
}

export async function loadState(home: string): Promise<CpmState> {
  const text = await readText(statePath(home));
  if (!text.trim()) return emptyState();
  const parsed = JSON.parse(text) as Partial<CpmState>;
  return {
    schemaVersion: 2,
    providers: parsed.providers ?? {},
    selectedProviders: parsed.selectedProviders ?? [],
    updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
  };
}

export async function saveState(home: string, state: CpmState): Promise<void> {
  state.schemaVersion = 2;
  state.updatedAt = new Date().toISOString();
  await atomicWrite(statePath(home), `${JSON.stringify(state, null, 2)}\n`);
}

export async function updateProviderPreference(
  home: string,
  provider: ProviderId,
  patch: Partial<ProviderPreference>,
): Promise<CpmState> {
  const state = await loadState(home);
  state.providers[provider] = { ...(state.providers[provider] ?? {}), ...patch };
  const selected = new Set(state.selectedProviders ?? []);
  if (state.providers[provider]?.enabled === false) selected.delete(provider);
  else if (state.providers[provider]?.enabled === true) selected.add(provider);
  state.selectedProviders = [...selected];
  await saveState(home, state);
  return state;
}
