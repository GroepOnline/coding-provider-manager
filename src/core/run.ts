import { spawn } from "node:child_process";

export async function runInherited(command: string, args: string[], env: Record<string, string>): Promise<number> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: { ...process.env, ...env } });
    let forwardedSignal: NodeJS.Signals | undefined;
    const forward = (signal: NodeJS.Signals) => {
      forwardedSignal = signal;
      if (!child.killed) child.kill(signal);
    };
    const onSigint = () => forward("SIGINT");
    const onSigterm = () => forward("SIGTERM");
    process.on("SIGINT", onSigint);
    process.on("SIGTERM", onSigterm);
    const cleanup = () => {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
    };
    child.on("error", (error) => { cleanup(); reject(error); });
    child.on("exit", (code, signal) => {
      cleanup();
      if (forwardedSignal === "SIGINT" || signal === "SIGINT") resolve(130);
      else if (forwardedSignal === "SIGTERM" || signal) resolve(1);
      else resolve(code ?? 1);
    });
  });
}
