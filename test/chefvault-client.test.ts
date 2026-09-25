import { afterEach, describe, expect, it, vi } from "vitest";
import { ChefVaultProviderSecurityClient } from "../src/provider-security/chefvault-client.js";
import { defaultProviderSecurityConfig } from "../src/provider-security/config.js";

const TOKEN = "test-bearer-token";
const envKeys = [
  "CHEF_PROVIDER_SECURITY_TOKEN",
  "CHEF_WORKLOAD_ID",
  "CHEF_HOST_ID",
  "CHEF_ACTOR",
] as const;

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of envKeys) delete process.env[key];
});

describe("ChefVaultProviderSecurityClient", () => {
  it("sends Authorization Bearer and X-Chef-* headers on inspectRef", async () => {
    process.env.CHEF_PROVIDER_SECURITY_TOKEN = TOKEN;
    process.env.CHEF_WORKLOAD_ID = "cpm";
    process.env.CHEF_HOST_ID = "joep";
    process.env.CHEF_ACTOR = "policy-doctor";

    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ fingerprint: "sha256:abc" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = new ChefVaultProviderSecurityClient(defaultProviderSecurityConfig());
    const result = await client.inspectRef("chefvault://pools/zai-coding/primary");

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    const headers = new Headers(calls[0]?.init?.headers as HeadersInit);
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("x-chef-workload-id")).toBe("cpm");
    expect(headers.get("x-chef-host-id")).toBe("joep");
    expect(headers.get("x-chef-actor")).toBe("policy-doctor");
  });

  it("does not require a token for health()", async () => {
    delete process.env.CHEF_PROVIDER_SECURITY_TOKEN;

    vi.stubGlobal("fetch", async () => new Response("ok", { status: 200 }));

    const client = new ChefVaultProviderSecurityClient(defaultProviderSecurityConfig());
    const health = await client.health();
    expect(health.ok).toBe(true);
  });

  it("fails inspectRef when CHEF_PROVIDER_SECURITY_TOKEN is missing", async () => {
    delete process.env.CHEF_PROVIDER_SECURITY_TOKEN;

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new ChefVaultProviderSecurityClient(defaultProviderSecurityConfig());
    const result = await client.inspectRef("chefvault://pools/zai-coding/primary");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/CHEF_PROVIDER_SECURITY_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns clear errors on 401 and 403", async () => {
    process.env.CHEF_PROVIDER_SECURITY_TOKEN = TOKEN;

    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "nope" }), { status: 401 }));

    const client = new ChefVaultProviderSecurityClient(defaultProviderSecurityConfig());
    const unauthorized = await client.inspectRef("chefvault://pools/test/primary");
    expect(unauthorized.ok).toBe(false);
    expect(unauthorized.error).toMatch(/unauthorized \(401\)/);

    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }));
    const forbidden = await client.inspectRef("chefvault://pools/test/primary");
    expect(forbidden.ok).toBe(false);
    expect(forbidden.error).toMatch(/forbidden \(403\)/);
  });

  it("probeAuthentication treats 404 as authenticated when token is accepted", async () => {
    process.env.CHEF_PROVIDER_SECURITY_TOKEN = TOKEN;

    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "not found" }), { status: 404 }));

    const client = new ChefVaultProviderSecurityClient(defaultProviderSecurityConfig());
    const probe = await client.probeAuthentication();
    expect(probe.ok).toBe(true);
  });

  it("probeAuthentication fails on a 500 response", async () => {
    process.env.CHEF_PROVIDER_SECURITY_TOKEN = TOKEN;

    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }));

    const client = new ChefVaultProviderSecurityClient(defaultProviderSecurityConfig());
    const probe = await client.probeAuthentication();
    expect(probe.ok).toBe(false);
    expect(probe.error).toMatch(/\(500\)/);
  });

  it("probeAuthentication fails when the request cannot be sent", async () => {
    process.env.CHEF_PROVIDER_SECURITY_TOKEN = TOKEN;

    vi.stubGlobal("fetch", async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8080");
    });

    const client = new ChefVaultProviderSecurityClient(defaultProviderSecurityConfig());
    const probe = await client.probeAuthentication();
    expect(probe.ok).toBe(false);
    expect(probe.error).toMatch(/ECONNREFUSED/);
  });

  it("probeAuthentication fails when token is rejected", async () => {
    process.env.CHEF_PROVIDER_SECURITY_TOKEN = TOKEN;

    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "bad token" }), { status: 403 }));

    const client = new ChefVaultProviderSecurityClient(defaultProviderSecurityConfig());
    const probe = await client.probeAuthentication();
    expect(probe.ok).toBe(false);
    expect(probe.error).toMatch(/forbidden \(403\)/);
  });
});
