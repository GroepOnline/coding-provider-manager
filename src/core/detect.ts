import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { ToolAdapter } from "../types.js";

export function commandExists(command?: string): boolean {
  if (!command) return false;
  const lookup = process.platform === "win32" ? "where" : "which";
  return spawnSync(lookup, [command], { stdio: "ignore" }).status === 0;
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return path.join(os.homedir(), value.slice(2));
  return value;
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
