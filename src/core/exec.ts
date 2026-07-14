import { spawn } from "node:child_process";

export interface ExecResult {
  command: string;
  args: string[];
  code: number;
  stdout: string;
  stderr: string;
  signal?: NodeJS.Signals;
}

export async function runCaptured(
  command: string,
  args: string[] = [],
  options: {
    env?: Record<string, string | undefined>;
    input?: string;
    timeoutMs?: number;
    cwd?: string;
  } = {},
): Promise<ExecResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
    }, options.timeoutMs ?? 30_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;
      resolve({ command, args, code: code ?? 1, stdout, stderr, ...(signal ? { signal } : {}) });
    });
    if (options.input !== undefined) child.stdin.end(options.input);
    else child.stdin.end();
  });
}

export function parseJsonOutput(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try { return JSON.parse(trimmed) as unknown; } catch { /* continue */ }
  const firstObject = Math.min(...[trimmed.indexOf("{"), trimmed.indexOf("[")].filter((value) => value >= 0));
  if (Number.isFinite(firstObject)) {
    for (let end = trimmed.length; end > firstObject; end -= 1) {
      try { return JSON.parse(trimmed.slice(firstObject, end)) as unknown; } catch { /* continue */ }
    }
  }
  return undefined;
}
