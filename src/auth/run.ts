import { spawn } from "node:child_process";
import type { AuthFlow } from "../types.js";

export async function runAuthCommand(
  flow: AuthFlow,
  mode: "login" | "status" | "logout",
  secret?: string,
): Promise<number> {
  const args = mode === "login" ? flow.args : mode === "status" ? flow.statusArgs : flow.logoutArgs;
  if (!args) throw new Error(`${flow.id} does not define an auth ${mode} command`);
  const pipeSecret = mode === "login" && flow.kind === "api-key-login";
  return await new Promise((resolve, reject) => {
    const child = spawn(flow.command, args, {
      stdio: pipeSecret ? ["pipe", "inherit", "inherit"] : "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
    if (pipeSecret) {
      if (!secret) {
        child.kill();
        reject(new Error(`${flow.id} requires a provider key`));
        return;
      }
      child.stdin?.end(`${secret.trim()}\n`);
    }
  });
}
