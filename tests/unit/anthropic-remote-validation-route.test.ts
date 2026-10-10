import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-anthropic-remote-"));
process.env.DATA_DIR = dataDir;
process.env.JWT_SECRET = "test-only-anthropic-remote-validation-secret";

const core = await import("../../src/lib/db/core.ts");
const settings = await import("../../src/lib/db/settings.ts");
const { mintDashboardSessionToken } =
  await import("../../src/shared/utils/dashboardSessionToken.ts");
const { isLocalOnlyPath } = await import("../../src/server/authz/routeGuard.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("Anthropic has a remote HTTP-only validation route while spawning routes remain local", async () => {
  const modalSource = fs.readFileSync(
    new URL(
      "../../src/app/(dashboard)/dashboard/providers/[id]/components/modals/AddApiKeyModal.tsx",
      import.meta.url
    ),
    "utf8"
  );
  assert.ok(modalSource.includes("/api/providers/anthropic/validate"));
  assert.equal(isLocalOnlyPath("/api/providers/anthropic/validate"), false);
  assert.equal(isLocalOnlyPath("/api/providers/validate"), true);
  assert.equal(isLocalOnlyPath("/api/providers/bulk"), true);
});

test("remote Anthropic validation requires auth even when dashboard login is disabled", async () => {
  await settings.updateSettings({ requireLogin: false });
  const route = await import("../../src/app/api/providers/anthropic/validate/route.ts");
  const response = await route.POST(
    new Request("https://omni.example/api/providers/anthropic/validate", {
      method: "POST",
      body: JSON.stringify({ provider: "anthropic", apiKey: "test-only" }),
    })
  );
  assert.equal(response.status, 401);
});

test("authenticated HTTP validation cannot dispatch a spawning provider", async () => {
  const route = await import("../../src/app/api/providers/anthropic/validate/route.ts");
  const token = await mintDashboardSessionToken(new TextEncoder().encode(process.env.JWT_SECRET));
  const response = await route.POST(
    new Request("https://omni.example/api/providers/anthropic/validate", {
      method: "POST",
      headers: { cookie: `auth_token=${token}` },
      body: JSON.stringify({ provider: "cursor", apiKey: "test-only" }),
    })
  );
  assert.equal(response.status, 400);
});

test("authenticated remote Anthropic key reaches the HTTP validator", async () => {
  const route = await import("../../src/app/api/providers/anthropic/validate/route.ts");
  const token = await mintDashboardSessionToken(new TextEncoder().encode(process.env.JWT_SECRET));
  const originalFetch = globalThis.fetch;
  const upstreamCalls: string[] = [];
  globalThis.fetch = async (url) => {
    upstreamCalls.push(String(url));
    return new Response(JSON.stringify({ content: [] }), { status: 200 });
  };
  try {
    const response = await route.POST(
      new Request("https://omni.example/api/providers/anthropic/validate", {
        method: "POST",
        headers: { cookie: `auth_token=${token}` },
        body: JSON.stringify({ provider: "anthropic", apiKey: "sk-ant-test-only" }),
      })
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.valid, true);
    assert.ok(upstreamCalls.some((url) => url.includes("api.anthropic.com")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
