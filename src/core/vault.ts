import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { KeySlotSummary } from "../types.js";
import { atomicWrite, pathExists, readText } from "./fs.js";
import { cpmRoot } from "./paths.js";

interface VaultSlot {
  value: string;
  createdAt: string;
  lastUsedAt?: string;
  disabled?: boolean;
}

interface VaultScope {
  activeAlias?: string;
  slots: Record<string, VaultSlot>;
}

interface VaultPayload {
  schemaVersion: 1;
  scopes: Record<string, VaultScope>;
  updatedAt: string;
}

interface VaultEnvelope {
  schemaVersion: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
}

function vaultPath(home: string): string {
  return path.join(cpmRoot(home), "vault.enc.json");
}

function masterKeyPath(home: string): string {
  return path.join(cpmRoot(home), "master.key");
}

function emptyVault(): VaultPayload {
  return { schemaVersion: 1, scopes: {}, updatedAt: new Date(0).toISOString() };
}

async function getMasterKey(home: string): Promise<Buffer> {
  const fromEnv = process.env.CPM_MASTER_KEY?.trim();
  if (fromEnv) {
    const decoded = Buffer.from(fromEnv, "base64");
    if (decoded.length !== 32) throw new Error("CPM_MASTER_KEY must be a base64 encoded 32-byte key");
    return decoded;
  }

  const file = masterKeyPath(home);
  if (await pathExists(file)) {
    const decoded = Buffer.from((await readText(file)).trim(), "base64");
    if (decoded.length !== 32) throw new Error(`Invalid CPM master key at ${file}`);
    return decoded;
  }

  const key = crypto.randomBytes(32);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, `${key.toString("base64")}\n`, { mode: 0o600 });
  if (process.platform !== "win32") await fs.chmod(file, 0o600);
  return key;
}

async function loadVault(home: string): Promise<VaultPayload> {
  const file = vaultPath(home);
  if (!(await pathExists(file))) return emptyVault();
  const envelope = JSON.parse(await readText(file)) as VaultEnvelope;
  if (envelope.algorithm !== "aes-256-gcm") throw new Error("Unsupported CPM vault algorithm");
  const key = await getMasterKey(home);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as VaultPayload;
  return { schemaVersion: 1, scopes: parsed.scopes ?? {}, updatedAt: parsed.updatedAt ?? new Date(0).toISOString() };
}

async function saveVault(home: string, payload: VaultPayload): Promise<void> {
  const key = await getMasterKey(home);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  payload.updatedAt = new Date().toISOString();
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const envelope: VaultEnvelope = {
    schemaVersion: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  await atomicWrite(vaultPath(home), `${JSON.stringify(envelope, null, 2)}\n`);
}

export function providerScope(provider: string): string {
  return `provider/${provider}`;
}

export function fingerprintSecret(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export async function addSecret(
  home: string,
  scope: string,
  alias: string,
  value: string,
  makeActive = true,
): Promise<void> {
  if (!scope.trim() || !alias.trim() || !value.trim()) throw new Error("scope, alias and secret value are required");
  const vault = await loadVault(home);
  const current = vault.scopes[scope] ?? { slots: {} };
  current.slots[alias] = {
    value: value.trim(),
    createdAt: current.slots[alias]?.createdAt ?? new Date().toISOString(),
    disabled: false,
  };
  if (makeActive || !current.activeAlias) current.activeAlias = alias;
  vault.scopes[scope] = current;
  await saveVault(home, vault);
}

export async function removeSecret(home: string, scope: string, alias: string): Promise<void> {
  const vault = await loadVault(home);
  const current = vault.scopes[scope];
  if (!current?.slots[alias]) throw new Error(`No secret ${scope}:${alias}`);
  delete current.slots[alias];
  if (current.activeAlias === alias) current.activeAlias = Object.keys(current.slots).find((name) => !current.slots[name]?.disabled);
  if (!Object.keys(current.slots).length) delete vault.scopes[scope];
  await saveVault(home, vault);
}

export async function setSecretDisabled(home: string, scope: string, alias: string, disabled: boolean): Promise<void> {
  const vault = await loadVault(home);
  const slot = vault.scopes[scope]?.slots[alias];
  if (!slot) throw new Error(`No secret ${scope}:${alias}`);
  slot.disabled = disabled;
  if (disabled && vault.scopes[scope]?.activeAlias === alias) {
    vault.scopes[scope]!.activeAlias = Object.keys(vault.scopes[scope]!.slots).find((name) => !vault.scopes[scope]!.slots[name]?.disabled);
  }
  await saveVault(home, vault);
}

export async function useSecret(home: string, scope: string, alias: string): Promise<void> {
  const vault = await loadVault(home);
  const slot = vault.scopes[scope]?.slots[alias];
  if (!slot) throw new Error(`No secret ${scope}:${alias}`);
  if (slot.disabled) throw new Error(`Secret ${scope}:${alias} is disabled`);
  vault.scopes[scope]!.activeAlias = alias;
  slot.lastUsedAt = new Date().toISOString();
  await saveVault(home, vault);
}

export async function rotateSecret(home: string, scope: string): Promise<string> {
  const vault = await loadVault(home);
  const current = vault.scopes[scope];
  if (!current) throw new Error(`No secrets stored for ${scope}`);
  const aliases = Object.keys(current.slots).filter((alias) => !current.slots[alias]?.disabled).sort();
  if (!aliases.length) throw new Error(`No enabled secrets stored for ${scope}`);
  const index = Math.max(0, aliases.indexOf(current.activeAlias ?? aliases[0]!));
  const next = aliases[(index + 1) % aliases.length]!;
  current.activeAlias = next;
  current.slots[next]!.lastUsedAt = new Date().toISOString();
  await saveVault(home, vault);
  return next;
}

export async function resolveSecret(
  home: string,
  scope: string,
  alias?: string,
  environmentVariable?: string,
): Promise<{ value: string; alias: string; source: "vault" | "environment" }> {
  const vault = await loadVault(home);
  const current = vault.scopes[scope];
  const selectedAlias = alias ?? current?.activeAlias;
  const slot = selectedAlias ? current?.slots[selectedAlias] : undefined;
  if (slot && !slot.disabled) {
    slot.lastUsedAt = new Date().toISOString();
    await saveVault(home, vault);
    return { value: slot.value, alias: selectedAlias!, source: "vault" };
  }
  if (environmentVariable && process.env[environmentVariable]?.trim()) {
    return { value: process.env[environmentVariable]!.trim(), alias: "environment", source: "environment" };
  }
  throw new Error(`No active secret for ${scope}${environmentVariable ? ` and ${environmentVariable} is not set` : ""}`);
}

export async function listSecrets(home: string, scope?: string, environment?: Record<string, string | undefined>): Promise<KeySlotSummary[]> {
  const vault = await loadVault(home);
  const summaries: KeySlotSummary[] = [];
  for (const [scopeName, current] of Object.entries(vault.scopes)) {
    if (scope && scopeName !== scope) continue;
    for (const [alias, slot] of Object.entries(current.slots)) {
      summaries.push({
        scope: scopeName,
        alias,
        active: current.activeAlias === alias,
        disabled: Boolean(slot.disabled),
        source: "vault",
        fingerprint: fingerprintSecret(slot.value),
        createdAt: slot.createdAt,
        lastUsedAt: slot.lastUsedAt,
      });
    }
  }
  if (scope && environment) {
    for (const [name, value] of Object.entries(environment)) {
      if (value?.trim()) {
        summaries.push({ scope, alias: name, active: !summaries.some((item) => item.active), disabled: false, source: "environment", fingerprint: fingerprintSecret(value) });
      }
    }
  }
  return summaries.sort((a, b) => a.scope.localeCompare(b.scope) || Number(b.active) - Number(a.active) || a.alias.localeCompare(b.alias));
}

export async function exportVaultPlaintext(home: string): Promise<Record<string, unknown>> {
  return await loadVault(home) as unknown as Record<string, unknown>;
}

export async function importVaultPlaintext(home: string, value: Record<string, unknown>, merge = true): Promise<void> {
  const incoming = value as unknown as VaultPayload;
  if (incoming.schemaVersion !== 1 || !incoming.scopes) throw new Error("Invalid CPM vault bundle");
  if (!merge) {
    await saveVault(home, incoming);
    return;
  }
  const current = await loadVault(home);
  for (const [scope, incomingScope] of Object.entries(incoming.scopes)) {
    const target = current.scopes[scope] ?? { slots: {} };
    target.slots = { ...target.slots, ...incomingScope.slots };
    if (incomingScope.activeAlias) target.activeAlias = incomingScope.activeAlias;
    current.scopes[scope] = target;
  }
  await saveVault(home, current);
}
