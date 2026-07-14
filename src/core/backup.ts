import fs from "node:fs/promises";
import path from "node:path";
import { cpmRoot } from "./paths.js";
import { readText, atomicWrite, pathExists } from "./fs.js";

interface BackupEntry { path: string; existed: boolean; content: string }
interface BackupManifest { id: string; createdAt: string; entries: BackupEntry[] }

export async function createBackup(files: string[], home: string): Promise<string> {
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const entries: BackupEntry[] = [];
  for (const file of [...new Set(files)]) {
    const existed = await pathExists(file);
    const content = existed ? await readText(file) : "";
    entries.push({ path: file, existed, content });
  }
  const dir = path.join(cpmRoot(home), "backups", id);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify({ id, createdAt: new Date().toISOString(), entries } satisfies BackupManifest, null, 2), { mode: 0o600 });
  return id;
}

export async function rollbackBackup(id: string, home: string): Promise<void> {
  const manifestPath = path.join(cpmRoot(home), "backups", id, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as BackupManifest;
  for (const entry of manifest.entries) {
    if (entry.existed) await atomicWrite(entry.path, entry.content);
    else await fs.rm(entry.path, { force: true });
  }
}

export async function listBackups(home: string): Promise<string[]> {
  const dir = path.join(cpmRoot(home), "backups");
  try {
    return (await fs.readdir(dir)).sort().reverse();
  } catch {
    return [];
  }
}
