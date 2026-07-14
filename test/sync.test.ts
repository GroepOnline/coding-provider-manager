import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addSecret, providerScope, resolveSecret } from "../src/core/vault.js";
import { createSyncBundle, importSyncBundle } from "../src/core/sync.js";
import { saveState } from "../src/core/state.js";
import { cpmRoot } from "../src/core/paths.js";

const homes: string[] = [];
afterEach(async () => Promise.all(homes.splice(0).map((home) => fs.rm(home, { recursive: true, force: true }))));

async function tempHome(prefix: string): Promise<string> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  homes.push(home);
  return home;
}

describe("SSH-compatible bundles", () => {
  it("omits secrets by default and can re-encrypt explicit secret transfers", async () => {
    const source = await tempHome("cpm-sync-source-");
    const target = await tempHome("cpm-sync-target-");
    await saveState(source, {
      schemaVersion: 2,
      providers: { openrouter: { enabled: true } },
      selectedProviders: ["openrouter"],
      updatedAt: new Date().toISOString(),
    });
    await addSecret(source, providerScope("openrouter"), "primary", "or-secret", true);

    const safe = await createSyncBundle(source, false);
    expect(safe.vault).toBeUndefined();

    const withSecrets = await createSyncBundle(source, true);
    await importSyncBundle(target, withSecrets);
    expect((await resolveSecret(target, providerScope("openrouter"))).value).toBe("or-secret");
    const encrypted = await fs.readFile(path.join(cpmRoot(target), "vault.enc.json"), "utf8");
    expect(encrypted).not.toContain("or-secret");
  });
});
