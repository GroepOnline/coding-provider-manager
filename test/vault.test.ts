import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { addSecret, listSecrets, providerScope, resolveSecret, rotateSecret } from "../src/core/vault.js";

const home = "/tmp/cpm-vault-test";

describe("encrypted multi-key vault", () => {
  it("stores multiple slots encrypted and rotates active aliases", async () => {
    await fs.rm(home, { recursive: true, force: true });
    const scope = providerScope("openrouter");
    await addSecret(home, scope, "primary", "sk-primary-secret", true);
    await addSecret(home, scope, "secondary", "sk-secondary-secret", false);

    expect((await resolveSecret(home, scope)).value).toBe("sk-primary-secret");
    expect(await rotateSecret(home, scope)).toBe("secondary");
    expect((await resolveSecret(home, scope)).value).toBe("sk-secondary-secret");

    const summaries = await listSecrets(home, scope);
    expect(summaries).toHaveLength(2);
    expect(summaries.find((item) => item.alias === "secondary")?.active).toBe(true);

    const encrypted = await fs.readFile(`${home}/.config/coding-provider-manager/vault.enc.json`, "utf8");
    expect(encrypted).not.toContain("sk-primary-secret");
    expect(encrypted).not.toContain("sk-secondary-secret");
  });
});
