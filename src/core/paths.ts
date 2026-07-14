import os from "node:os";
import path from "node:path";

/** Prefer the platform-native home variable so Windows path joins stay consistent. */
export function homeDir(): string {
  if (process.platform === "win32") {
    return process.env.USERPROFILE || process.env.HOME || os.homedir();
  }
  return process.env.HOME || process.env.USERPROFILE || os.homedir();
}

export function configRoot(home = homeDir()): string {
  const isProcessHome = path.resolve(home) === path.resolve(homeDir());
  if (process.platform === "win32") {
    return isProcessHome && process.env.APPDATA ? process.env.APPDATA : path.join(home, "AppData", "Roaming");
  }
  return isProcessHome && process.env.XDG_CONFIG_HOME ? process.env.XDG_CONFIG_HOME : path.join(home, ".config");
}

export function cpmRoot(home = homeDir()): string {
  return path.join(configRoot(home), "coding-provider-manager");
}

/** Normalize a path for CLI display (absolute, platform separators). */
export function displayPath(value: string): string {
  return path.resolve(value);
}
