import { describe, expect, it } from "vitest";
import { parseJsoncObject, setJsonc, updateYaml } from "../src/core/fs.js";

describe("config mutation", () => {
  it("preserves JSONC comments while setting nested values", () => {
    const input = "{\n  // keep me\n  \"other\": true\n}\n";
    const output = setJsonc(input, ["provider", "zai", "options", "apiKey"], "{env:ZAI_API_KEY}");
    expect(output).toContain("// keep me");
    expect(parseJsoncObject(output)).toMatchObject({ provider: { zai: { options: { apiKey: "{env:ZAI_API_KEY}" } } } });
  });

  it("updates YAML without writing a literal API key", () => {
    const output = updateYaml("name: Existing\n", [{ path: ["models"], value: [{ apiKey: "${{ secrets.ZAI_API_KEY }}" }] }]);
    expect(output).toContain("secrets.ZAI_API_KEY");
  });
});
