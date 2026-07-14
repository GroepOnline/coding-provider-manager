import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";

export type LockdownPolicy = "fail-closed" | "best-effort";

function windowsAccount(): string {
  const user = process.env.USERNAME?.trim() || os.userInfo().username;
  const domain = process.env.USERDOMAIN?.trim();
  // Prefer DOMAIN\user on domain-joined hosts; bare USERNAME is fine for local accounts.
  if (domain && domain.length > 0 && !user.includes("\\")) return `${domain}\\${user}`;
  return user;
}

function runIcacls(args: readonly string[]): { ok: boolean; detail: string } {
  const result = spawnSync("icacls", [...args], {
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
  const detail = [result.stderr, result.stdout].filter(Boolean).join(" ").trim();
  return { ok: result.status === 0, detail };
}

/**
 * Apply owner-only permissions analogous to POSIX mode `0600`.
 *
 * - POSIX: `chmod 0600` (throws on failure — fail closed).
 * - Windows: `icacls` strips inheritance then grants only the current user Full control.
 *   - `fail-closed`: throw if ACL lockdown fails (use for master.key and other secret material).
 *   - `best-effort`: leave the written file in place if `icacls` is missing or fails (CI/sandbox hosts);
 *     NTFS DACLs may remain inherited until the folder is hardened. Documented trade-off vs bricking I/O.
 */
export async function lockdownSecretFile(file: string, policy: LockdownPolicy = "best-effort"): Promise<void> {
  if (process.platform !== "win32") {
    await fs.chmod(file, 0o600);
    return;
  }

  const account = windowsAccount();
  const inherit = runIcacls([file, "/inheritance:r"]);
  const grant = runIcacls([file, "/grant:r", `${account}:(F)`]);
  if (inherit.ok && grant.ok) return;

  const detail = [inherit.detail, grant.detail].filter(Boolean).join("; ") || "icacls failed";
  if (policy === "fail-closed") {
    throw new Error(`Failed to lockdown Windows ACL on ${file} (${detail})`);
  }
}
