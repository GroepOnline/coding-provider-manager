import { describe, expect, it } from "vitest";
import { normalizeAccountList } from "../src/accounts/index.js";

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
