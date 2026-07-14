import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addSecret,
  fingerprintSecret,
  listSecrets,
  providerScope,
  removeSecret,
  resolveSecret,
  rotateSecret,
  setSecretDisabled,
  useSecret,
} from "../src/core/vault.js";
import { cpmRoot } from "../src/core/paths.js";

const homes: string[] = [];
afterEach(async () => Promise.all(homes.splice(0).map((home) => fs.rm(home, { recursive: true, force: true }))));

async function tempHome(): Promise<string> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-vault-"));
  homes.push(home);
  return home;
}

describe("encrypted multi-key vault", () => {
  it("stores multiple slots encrypted and rotates active aliases", async () => {
    const home = await tempHome();
    const scope = providerScope("openrouter");
    await addSecret(home, scope, "primary", "sk-primary-secret", true);
    await addSecret(home, scope, "secondary", "sk-secondary-secret", false);

    expect((await resolveSecret(home, scope)).value).toBe("sk-primary-secret");
    expect(await rotateSecret(home, scope)).toBe("secondary");
    expect((await resolveSecret(home, scope)).value).toBe("sk-secondary-secret");

    const summaries = await listSecrets(home, scope);
    expect(summaries).toHaveLength(2);
    expect(summaries.find((item) => item.alias === "secondary")?.active).toBe(true);

    const encrypted = await fs.readFile(path.join(cpmRoot(home), "vault.enc.json"), "utf8");
    expect(encrypted).not.toContain("sk-primary-secret");
    expect(encrypted).not.toContain("sk-secondary-secret");
  });

  it("disables slots, switches active alias, and falls back to environment", async () => {
    const home = await tempHome();
    const scope = providerScope("deepseek");
    await addSecret(home, scope, "a", "vault-a", true);
    await addSecret(home, scope, "b", "vault-b", false);

    await setSecretDisabled(home, scope, "a", true);
    expect((await resolveSecret(home, scope)).alias).toBe("b");

    await useSecret(home, scope, "b");
    expect((await listSecrets(home, scope)).find((item) => item.alias === "b")?.active).toBe(true);

    await removeSecret(home, scope, "b");
    await removeSecret(home, scope, "a");
    const previous = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "env-deepseek-secret";
    try {
      const resolved = await resolveSecret(home, scope, undefined, "DEEPSEEK_API_KEY");
      expect(resolved).toMatchObject({ value: "env-deepseek-secret", source: "environment", alias: "environment" });
    } finally {
      if (previous === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = previous;
    }
  });

  it("fingerprints secrets without exposing raw values in summaries", async () => {
    const home = await tempHome();
    const scope = providerScope("openrouter");
    const value = "sk-fingerprint-me";
    await addSecret(home, scope, "primary", value, true);
    const [summary] = await listSecrets(home, scope);
    expect(summary?.fingerprint).toBe(fingerprintSecret(value));
    expect(JSON.stringify(summary)).not.toContain(value);
  });
});
