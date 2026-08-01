import { describe, expect, it, vi } from "vitest";

vi.mock("../src/core/exec.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/exec.js")>();
  return {
    ...actual,
    runCaptured: vi.fn(async (command: string, args: string[]) => ({
      command,
      args,
      code: 0,
      stdout: JSON.stringify({ usage: { today: { requests: 12, totalTokens: 3400 } } }),
      stderr: "",
    })),
  };
});

const { accountDriverSummaries, accountDriverUsage, normalizeAccountList } = await import("../src/accounts/index.js");

describe("account normalization", () => {
  it("normalizes common multi-auth JSON shapes without exposing credentials", () => {
    const rows = normalizeAccountList({ accounts: [
      { id: "a1", email: "one@example.com", active: true, status: "healthy", accessToken: "secret" },
      { account_id: "a2", label: "backup", disabled: false, rate_limited: true },
    ] });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "a1", email: "one@example.com", active: true, healthy: true });
    expect(rows[1]).toMatchObject({ id: "a2", label: "backup", limited: true });
    expect(JSON.stringify(rows)).not.toContain("secret");
  });
});

describe("account drivers", () => {
  it("registers chefvault as the preferred ChefGroep OAuth account driver", () => {
    const summaries = accountDriverSummaries();
    expect(summaries[0]?.id).toBe("chefvault");
    expect(summaries.map((item) => item.id)).toContain("chefvault");
    expect(summaries.find((item) => item.id === "chefvault")?.command).toBe("chefvault");
  });

  it("keeps the parsed ChefVault daily totals in the usage summary", async () => {
    const usage = await accountDriverUsage("chefvault");
    expect(usage.available).toBe(true);
    expect(usage.summary).toContain("12 requests");
    expect(usage.summary).toContain("3400 tokens");
  });
});
