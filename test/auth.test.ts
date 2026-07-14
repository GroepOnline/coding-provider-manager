import { describe, expect, it } from "vitest";
import { authFlows, getAuthFlow } from "../src/auth/catalog.js";

 describe("delegated authentication catalog", () => {
  it("exposes Codex browser and stdin API-key login without embedded credentials", () => {
    const oauth = getAuthFlow("codex-chatgpt");
    const key = getAuthFlow("codex-openai-key");
    expect(oauth.kind).toBe("oauth-browser");
    expect(oauth.args).toEqual(["login"]);
    expect(key.kind).toBe("api-key-login");
    expect(key.providerKey).toBe("openai");
    expect(key.args).toEqual(["login", "--with-api-key"]);
    expect(JSON.stringify(authFlows)).not.toMatch(/sk-[A-Za-z0-9]/);
  });

  it("catalogs device/browser flows for OpenCode, Gemini and GitHub", () => {
    expect(getAuthFlow("opencode-github-copilot").kind).toBe("oauth-device");
    expect(getAuthFlow("gemini-google").command).toBe("gemini");
    expect(getAuthFlow("github-cli").command).toBe("gh");
  });
});
