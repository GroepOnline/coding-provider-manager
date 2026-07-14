import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createBackup, rollbackBackup } from "../src/core/backup.js";

const home = "/tmp/cpm-backup-test-home";

describe("backup and rollback", () => {
  it("restores an existing empty file instead of deleting it", async () => {
    const file = `${home}/empty.json`;
    await fs.rm(home, { recursive: true, force: true });
    await fs.mkdir(home, { recursive: true });
    await fs.writeFile(file, "");
    const id = await createBackup([file], home);
    await fs.writeFile(file, "changed");
    await rollbackBackup(id, home);
    expect(await fs.readFile(file, "utf8")).toBe("");
  });
});
