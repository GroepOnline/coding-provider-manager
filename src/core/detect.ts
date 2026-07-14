import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { ToolAdapter } from "../types.js";

export function commandExists(command?: string): boolean {
  if (!command) return false;
  if (process.platform === "win32") {
    // where.exe is more reliable than bare `where` under non-shell spawn on Windows.
    const result = spawnSync("where.exe", [command], { stdio: "ignore", windowsHide: true });
    return result.status === 0;
  }
  return spawnSync("which", [command], { stdio: "ignore" }).status === 0;
}

function expandHome(value: string): string {
  let expanded = value;
  if (expanded === "~") return os.homedir();
  if (expanded.startsWith("~/") || expanded.startsWith("~\\")) {
    expanded = path.join(os.homedir(), expanded.slice(2));
  }
  if (process.platform === "win32") {
    expanded = expanded.replace(/%([^%]+)%/g, (_match, name: string) => {
      const fromEnv = process.env[name];
      return fromEnv && fromEnv.length > 0 ? fromEnv : `%${name}%`;
    });
  }
  return expanded;
}

/** Expand `~` and Windows `%VAR%` tokens used in adapter detect paths. */
export function expandDetectPath(value: string): string {
  return expandHome(value);
}

function detectedCommand(adapter: ToolAdapter): string | undefined {
  const commands = adapter.detect?.commands?.length
    ? adapter.detect.commands
    : adapter.command
      ? [adapter.command]
      : [];
  return commands.find((command) => commandExists(command));
}

function detectedPath(adapter: ToolAdapter): string | undefined {
  return adapter.detect?.paths?.map(expandHome).find((candidate) => fs.existsSync(candidate));
}

export function detectAdapters(adapters: ToolAdapter[]) {
  return adapters.map((adapter) => {
    const command = detectedCommand(adapter);
    const detectedAt = detectedPath(adapter);
    return {
      id: adapter.id,
      displayName: adapter.displayName,
      command: command ?? adapter.command,
      detectedAt,
      surfaces: adapter.surfaces ?? [],
      providerInjection: adapter.providerInjection ?? "automatic",
      authFlowIds: adapter.authFlowIds ?? [],
      installed: Boolean(command || detectedAt),
    };
  });
}
