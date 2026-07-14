import { spawn } from "node:child_process";
import type { SyncBundle } from "../types.js";
import { loadState, saveState } from "./state.js";
import { exportVaultPlaintext, importVaultPlaintext } from "./vault.js";
import { loadRegistry, saveRegistry } from "../resources/registry.js";

export async function createSyncBundle(home: string, includeSecrets = false): Promise<SyncBundle> {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    state: await loadState(home),
    resources: await loadRegistry(home),
    ...(includeSecrets ? { vault: await exportVaultPlaintext(home) } : {}),
  };
}

export async function importSyncBundle(home: string, bundle: SyncBundle, mergeSecrets = true): Promise<void> {
  if (bundle.schemaVersion !== 1) throw new Error("Unsupported CPM sync bundle");
  await saveState(home, bundle.state);
  await saveRegistry(home, bundle.resources);
  if (bundle.vault) await importVaultPlaintext(home, bundle.vault, mergeSecrets);
}

export async function sshPipe(
  host: string,
  remoteArgs: string[],
  input?: string,
  capture = false,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn("ssh", [host, ...remoteArgs], {
      stdio: ["pipe", capture ? "pipe" : "inherit", capture ? "pipe" : "inherit"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    }
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve({ code: signal ? 1 : code ?? 1, stdout, stderr }));
    if (input !== undefined) child.stdin?.end(input);
    else child.stdin?.end();
  });
}
