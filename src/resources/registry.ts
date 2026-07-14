import path from "node:path";
import type { ManagedResource, ResourceKind, ResourceRegistry } from "../types.js";
import { atomicWrite, readText } from "../core/fs.js";
import { cpmRoot } from "../core/paths.js";

export function emptyRegistry(): ResourceRegistry {
  return { schemaVersion: 1, resources: [], updatedAt: new Date(0).toISOString() };
}

export function registryPath(home: string): string {
  return path.join(cpmRoot(home), "resources.json");
}

export async function loadRegistry(home: string): Promise<ResourceRegistry> {
  const text = await readText(registryPath(home));
  if (!text.trim()) return emptyRegistry();
  const parsed = JSON.parse(text) as Partial<ResourceRegistry>;
  return { schemaVersion: 1, resources: parsed.resources ?? [], updatedAt: parsed.updatedAt ?? new Date(0).toISOString() };
}

export async function saveRegistry(home: string, registry: ResourceRegistry): Promise<void> {
  registry.schemaVersion = 1;
  registry.updatedAt = new Date().toISOString();
  await atomicWrite(registryPath(home), `${JSON.stringify(registry, null, 2)}\n`);
}

export async function upsertResource(home: string, resource: ManagedResource): Promise<void> {
  const registry = await loadRegistry(home);
  const index = registry.resources.findIndex((item) => item.id === resource.id && item.kind === resource.kind);
  if (index >= 0) registry.resources[index] = resource;
  else registry.resources.push(resource);
  await saveRegistry(home, registry);
}

export async function setResourceEnabled(home: string, kind: ResourceKind, id: string, enabled: boolean): Promise<void> {
  const registry = await loadRegistry(home);
  const resource = registry.resources.find((item) => item.kind === kind && item.id === id);
  if (!resource) throw new Error(`Unknown ${kind} resource: ${id}`);
  resource.enabled = enabled;
  await saveRegistry(home, registry);
}

export async function removeResource(home: string, kind: ResourceKind, id: string): Promise<void> {
  const registry = await loadRegistry(home);
  const next = registry.resources.filter((item) => !(item.kind === kind && item.id === id));
  if (next.length === registry.resources.length) throw new Error(`Unknown ${kind} resource: ${id}`);
  registry.resources = next;
  await saveRegistry(home, registry);
}
