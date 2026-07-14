import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { addSecret, providerScope, resolveSecret } from "../src/core/vault.js";
import { createSyncBundle, importSyncBundle } from "../src/core/sync.js";
import { saveState } from "../src/core/state.js";

const source = "/tmp/cpm-sync-source";
const target = "/tmp/cpm-sync-target";

describe("SSH-compatible bundles", () => {
  it("omits secrets by default and can re-encrypt explicit secret transfers", async () => {
    await fs.rm(source, { recursive: true, force: true });
    await fs.rm(target, { recursive: true, force: true });
    await saveState(source, { schemaVersion: 2, providers: { openrouter: { enabled: true } }, selectedProviders: ["openrouter"], updatedAt: new Date().toISOString() });
    await addSecret(source, providerScope("openrouter"), "primary", "or-secret", true);

    const safe = await createSyncBundle(source, false);
    expect(safe.vault).toBeUndefined();

    const withSecrets = await createSyncBundle(source, true);
    await importSyncBundle(target, withSecrets);
    expect((await resolveSecret(target, providerScope("openrouter"))).value).toBe("or-secret");
    expect(await fs.readFile(`${target}/.config/coding-provider-manager/vault.enc.json`, "utf8")).not.toContain("or-secret");
  });
});
